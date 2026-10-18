import { Injectable } from '@nestjs/common';
import { Prisma, SaleStatus, Unit } from '@prisma/client';
import { toNumber } from '../../common/decimal';
import { badRequest } from '../../common/errors';
import { PrismaService } from '../../common/prisma/prisma.service';
import { fromCents, toCents } from './domain/sale-calculator';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_PERIOD_DAYS = 366;

const startOfToday = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

/** Data local (yyyy-mm-dd) para agrupar as vendas por dia. */
const localDay = (date: Date) => {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
};

interface TopProductRow {
  productId: string;
  name: string;
  sku: string;
  unit: Unit;
  quantity: Prisma.Decimal;
  revenue: Prisma.Decimal;
  cost: Prisma.Decimal;
}

/** Relatório de vendas por período (padrão: hoje) para o painel do administrador e do gerente. */
@Injectable()
export class SalesReportService {
  constructor(private readonly prisma: PrismaService) {}

  async report({ from, to }: { from?: Date; to?: Date }) {
    const start = from ?? startOfToday();
    const end = to ?? new Date();
    if (start > end) throw badRequest('A data inicial deve ser anterior à final');
    if (end.getTime() - start.getTime() > MAX_PERIOD_DAYS * DAY_MS) {
      throw badRequest(`O período máximo do relatório é de ${MAX_PERIOD_DAYS} dias`);
    }

    const inPeriod = { occurredAt: { gte: start, lte: end } };
    // O Prisma grava as datas em UTC em colunas sem fuso: no SQL manual, compara pelo horário UTC.
    const startUtc = start.toISOString();
    const endUtc = end.toISOString();
    const [sales, canceledCount, topProducts, costRow, returns] = await Promise.all([
      this.prisma.sale.findMany({
        where: { ...inPeriod, status: SaleStatus.COMPLETED },
        select: {
          occurredAt: true,
          total: true,
          grossTotal: true,
          itemsDiscount: true,
          orderDiscount: true,
          change: true,
          operator: { select: { id: true, name: true } },
          payments: { select: { paymentMethodId: true, methodName: true, methodKind: true, amount: true } },
        },
      }),
      this.prisma.sale.count({ where: { ...inPeriod, status: SaleStatus.CANCELED } }),
      this.prisma.$queryRaw<TopProductRow[]>`
        SELECT si."productId", MAX(si."productName") AS name, MAX(si.sku) AS sku, MAX(si.unit::text)::"Unit" AS unit,
               SUM(si.quantity) AS quantity, SUM(si.total) AS revenue, SUM(si."unitCost" * si.quantity) AS cost
        FROM sale_items si
        JOIN sales s ON s.id = si."saleId"
        WHERE s.status = 'COMPLETED' AND s."occurredAt" BETWEEN ${startUtc}::timestamp AND ${endUtc}::timestamp
        GROUP BY si."productId"
        ORDER BY revenue DESC
        LIMIT 20`,
      this.prisma.$queryRaw<{ cost: Prisma.Decimal | null }[]>`
        SELECT SUM(si."unitCost" * si.quantity) AS cost
        FROM sale_items si
        JOIN sales s ON s.id = si."saleId"
        WHERE s.status = 'COMPLETED' AND s."occurredAt" BETWEEN ${startUtc}::timestamp AND ${endUtc}::timestamp`,
      this.prisma.saleReturn.findMany({
        where: { createdAt: { gte: start, lte: end } },
        select: { total: true, items: { select: { quantity: true, unitCost: true, restock: true } } },
      }),
    ]);

    let totalCents = 0;
    let grossCents = 0;
    let discountCents = 0;
    let changeCents = 0;
    /** Por forma de pagamento (o troco sai do dinheiro). */
    const byMethod = new Map<string, { id: string; name: string; kind: string; cents: number }>();
    const byOperator = new Map<string, { operator: { id: string; name: string }; count: number; totalCents: number }>();
    const byDay = new Map<string, { count: number; totalCents: number }>();

    for (const sale of sales) {
      const saleCents = toCents(toNumber(sale.total));
      totalCents += saleCents;
      grossCents += toCents(toNumber(sale.grossTotal));
      discountCents += toCents(toNumber(sale.itemsDiscount)) + toCents(toNumber(sale.orderDiscount));
      for (const p of sale.payments) {
        const entry = byMethod.get(p.paymentMethodId) ?? { id: p.paymentMethodId, name: p.methodName, kind: p.methodKind, cents: 0 };
        entry.cents += toCents(toNumber(p.amount));
        byMethod.set(p.paymentMethodId, entry);
      }
      changeCents += toCents(toNumber(sale.change));

      const op = byOperator.get(sale.operator.id) ?? { operator: sale.operator, count: 0, totalCents: 0 };
      op.count++;
      op.totalCents += saleCents;
      byOperator.set(sale.operator.id, op);

      const day = localDay(sale.occurredAt);
      const d = byDay.get(day) ?? { count: 0, totalCents: 0 };
      d.count++;
      d.totalCents += saleCents;
      byDay.set(day, d);
    }

    const costCents = toCents(toNumber(costRow[0]?.cost ?? 0));
    const count = sales.length;
    // Devoluções do período: saem da receita; o custo do que voltou ao estoque sai do CMV.
    const returnsCents = returns.reduce((sum, r) => sum + toCents(toNumber(r.total)), 0);
    const returnedCostCents = returns.reduce(
      (sum, r) => sum + r.items.filter((i) => i.restock).reduce((s, i) => s + Math.round(toNumber(i.unitCost) * toNumber(i.quantity) * 100), 0),
      0,
    );

    return {
      period: { from: start, to: end },
      totals: {
        salesCount: count,
        canceledCount,
        gross: fromCents(grossCents),
        discounts: fromCents(discountCents),
        net: fromCents(totalCents),
        averageTicket: count ? fromCents(Math.round(totalCents / count)) : 0,
        returnsCount: returns.length,
        returns: fromCents(returnsCents),
        netAfterReturns: fromCents(totalCents - returnsCents),
        cost: fromCents(costCents - returnedCostCents),
        margin: fromCents(totalCents - returnsCents - (costCents - returnedCostCents)),
      },
      methods: [...byMethod.values()]
        .map((m) => ({ id: m.id, name: m.name, kind: m.kind, amount: fromCents(m.kind === 'CASH' ? m.cents - changeCents : m.cents) }))
        .sort((a, b) => b.amount - a.amount),
      byOperator: [...byOperator.values()]
        .map((o) => ({ operator: o.operator, count: o.count, total: fromCents(o.totalCents) }))
        .sort((a, b) => b.total - a.total),
      byDay: [...byDay.entries()]
        .map(([date, d]) => ({ date, count: d.count, total: fromCents(d.totalCents) }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      topProducts: topProducts.map((row) => {
        const revenue = toNumber(row.revenue);
        const cost = toNumber(row.cost);
        return {
          productId: row.productId,
          name: row.name,
          sku: row.sku,
          unit: row.unit,
          quantity: toNumber(row.quantity),
          revenue,
          cost,
          margin: fromCents(toCents(revenue) - toCents(cost)),
        };
      }),
    };
  }
}
