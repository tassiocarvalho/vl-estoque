import { Injectable } from '@nestjs/common';
import { MovementType, PurchaseRequestStatus } from '@prisma/client';
import { toNumber, round3 } from '../../common/decimal';
import { badRequest } from '../../common/errors';
import { PrismaService } from '../../common/prisma/prisma.service';
import { productInclude, toProductView } from '../products/product.view';
import { isEntry } from '../stock/stock.dto';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_PERIOD_DAYS = 366;

export interface ReportPeriod {
  from?: Date;
  to?: Date;
  productId?: string;
}

const startOfToday = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Visão geral para a tela inicial. */
  async dashboard() {
    const { fields } = this.prisma.product;
    const active = { deletedAt: null };

    const [total, outOfStock, critical, attention, openRequests, today, attentionProducts] = await Promise.all([
      this.prisma.product.count({ where: active }),
      this.prisma.product.count({ where: { ...active, currentStock: { lte: 0 } } }),
      this.prisma.product.count({
        where: { ...active, AND: [{ currentStock: { gt: 0 } }, { currentStock: { lte: fields.safetyStock } }] },
      }),
      this.prisma.product.count({ where: { ...active, currentStock: { lte: fields.reorderPoint } } }),
      this.prisma.purchaseRequest.count({
        where: { status: { in: [PurchaseRequestStatus.PENDING, PurchaseRequestStatus.ORDERED] } },
      }),
      this.prisma.stockMovement.groupBy({
        by: ['type'],
        where: { occurredAt: { gte: startOfToday() } },
        _count: { _all: true },
      }),
      this.prisma.product.findMany({
        where: { ...active, currentStock: { lte: fields.reorderPoint } },
        include: productInclude,
        take: 100,
      }),
    ]);

    // Mais urgentes primeiro: menor saldo em relação ao ponto de pedido.
    const urgency = (p: { currentStock: number; reorderPoint: number }) =>
      p.reorderPoint > 0 ? p.currentStock / p.reorderPoint : p.currentStock;
    const alerts = attentionProducts
      .map(toProductView)
      .sort((a, b) => urgency(a) - urgency(b))
      .slice(0, 10);

    const countToday = (entry: boolean) =>
      today.filter((g) => isEntry(g.type) === entry).reduce((sum, g) => sum + g._count._all, 0);

    return {
      products: {
        total,
        outOfStock,
        critical,
        reorder: attention - outOfStock - critical,
        ok: total - attention,
      },
      openPurchaseRequests: openRequests,
      today: { entries: countToday(true), exits: countToday(false) },
      alerts,
    };
  }

  /** Relatório de movimentação por período (diário, semanal, mensal ou personalizado). */
  async movements({ from, to, productId }: ReportPeriod) {
    const end = to ?? new Date();
    const start = from ?? new Date(end.getTime() - 30 * DAY_MS);
    if (start > end) throw badRequest('A data inicial deve ser anterior à final');
    if (end.getTime() - start.getTime() > MAX_PERIOD_DAYS * DAY_MS) {
      throw badRequest(`O período máximo do relatório é de ${MAX_PERIOD_DAYS} dias`);
    }

    const inPeriod = { occurredAt: { gte: start, lte: end } };
    const productFilter = productId ? { productId } : {};

    const [grouped, products, purchaseRequests] = await Promise.all([
      this.prisma.stockMovement.groupBy({
        by: ['productId', 'type'],
        where: { ...inPeriod, ...productFilter },
        _sum: { quantity: true },
        _count: { _all: true },
      }),
      this.prisma.product.findMany({
        where: { deletedAt: null, ...(productId && { id: productId }) },
        include: productInclude,
        orderBy: { name: 'asc' },
      }),
      this.prisma.purchaseRequest.findMany({
        where: { createdAt: { gte: start, lte: end }, ...productFilter },
        include: {
          product: { select: { name: true, sku: true, unit: true } },
          createdBy: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    /** Número de lançamentos por tipo (quantidades de unidades diferentes não podem ser somadas). */
    const byType = Object.fromEntries(Object.values(MovementType).map((type) => [type, 0])) as Record<
      MovementType,
      number
    >;
    const perProduct = new Map<string, { entries: number; exits: number; count: number }>();

    for (const group of grouped) {
      const quantity = toNumber(group._sum.quantity);
      byType[group.type] += group._count._all;

      const totals = perProduct.get(group.productId) ?? { entries: 0, exits: 0, count: 0 };
      if (isEntry(group.type)) totals.entries = round3(totals.entries + quantity);
      else totals.exits = round3(totals.exits + quantity);
      totals.count += group._count._all;
      perProduct.set(group.productId, totals);
    }

    const rows = products.map((product) => {
      const totals = perProduct.get(product.id) ?? { entries: 0, exits: 0, count: 0 };
      const view = toProductView(product);
      return {
        product: { id: view.id, name: view.name, sku: view.sku, unit: view.unit, category: view.category.path },
        entries: totals.entries,
        exits: totals.exits,
        net: round3(totals.entries - totals.exits),
        movements: totals.count,
        currentStock: view.currentStock,
        reorderPoint: view.reorderPoint,
        status: view.status,
      };
    });

    return {
      period: { from: start, to: end },
      totals: {
        entryCount: grouped.filter((g) => isEntry(g.type)).reduce((sum, g) => sum + g._count._all, 0),
        exitCount: grouped.filter((g) => !isEntry(g.type)).reduce((sum, g) => sum + g._count._all, 0),
        productsMoved: rows.filter((r) => r.movements > 0).length,
      },
      byType,
      rows,
      /** Sem nenhuma saída no período: estoque parado. */
      stagnant: rows.filter((r) => r.exits === 0 && r.currentStock > 0),
      /** Sem saldo: ruptura. */
      ruptures: rows.filter((r) => r.status === 'OUT_OF_STOCK'),
      purchaseRequests: purchaseRequests.map((r) => ({
        ...r,
        suggestedQuantity: toNumber(r.suggestedQuantity),
        stockAtRequest: toNumber(r.stockAtRequest),
        reorderPoint: toNumber(r.reorderPoint),
      })),
    };
  }
}
