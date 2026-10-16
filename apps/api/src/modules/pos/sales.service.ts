import { HttpStatus, Injectable } from '@nestjs/common';
import { CashSessionStatus, MovementSource, MovementType, Prisma, SaleStatus } from '@prisma/client';
import { AuthUser } from '../../common/auth/auth-user';
import { hasPermission, Permission } from '../../common/auth/permissions';
import { toNumber } from '../../common/decimal';
import { AppException, badRequest, ErrorCode, notFound } from '../../common/errors';
import { deterministicUuid } from '../../common/ids';
import { toJson } from '../../common/json';
import { Paginated, toSkipTake } from '../../common/pagination';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SettingsService } from '../settings/settings.service';
import { StockService } from '../stock/stock.service';
import { calculateSale, fromCents, SaleRuleError, settlePayments } from './domain/sale-calculator';
import { AbandonSaleDto, CancelSaleDto, CreateSaleDto, ListSalesQueryDto } from './pos.dto';
import { saleInclude, toSaleView, type SaleView } from './sale.view';
import { SupervisorAuthorizationService } from './supervisor-authorization.service';

const money = (value: number) => value.toFixed(2).replace('.', ',');

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly authorization: SupervisorAuthorizationService,
  ) {}

  /**
   * Finaliza uma venda: confere preços, descontos e pagamentos, grava a venda e dá baixa
   * no estoque de todos os itens numa única transação. Idempotente pelo id gerado no caixa.
   */
  async create(dto: CreateSaleDto, user: AuthUser, token: string | undefined, ip: string) {
    const existing = await this.findExisting(dto.id);
    if (existing) return { sale: existing, duplicated: true };

    const session = await this.prisma.cashSession.findUnique({ where: { id: dto.sessionId } });
    if (!session) throw notFound('Caixa');
    if (session.status !== CashSessionStatus.OPEN) {
      throw new AppException(HttpStatus.CONFLICT, 'Este caixa já foi fechado', ErrorCode.CASH_CLOSED);
    }

    const productIds = [...new Set(dto.items.map((item) => item.productId))];
    const products = await this.prisma.product.findMany({ where: { id: { in: productIds } } });
    const byId = new Map(products.map((p) => [p.id, p]));
    for (const item of dto.items) if (!byId.has(item.productId)) throw notFound('Produto da venda');

    const offline = dto.offline === true;
    const divergences = this.checkPrices(dto, byId, offline);

    let totals: ReturnType<typeof calculateSale>;
    let settlement: ReturnType<typeof settlePayments>;
    try {
      totals = calculateSale(dto.items, dto.orderDiscount);
      settlement = settlePayments(totals.totalCents, dto.payments);
    } catch (error) {
      if (error instanceof SaleRuleError) throw badRequest(error.message);
      throw error;
    }

    const settings = await this.settings.get();
    const discountAuthorizedById =
      totals.maxDiscountPercent > settings.pos.maxDiscountPercent
        ? await this.authorization.resolve(user, Permission.POS_DISCOUNT, token, {
            scope: dto.id,
            reason: `Desconto acima de ${settings.pos.maxDiscountPercent}%`,
          })
        : null;

    let sale;
    try {
      sale = await this.prisma.$transaction(async (tx) => {
        const created = await tx.sale.create({
          data: {
            id: dto.id,
            sessionId: session.id,
            operatorId: user.id,
            grossTotal: fromCents(totals.grossCents),
            itemsDiscount: fromCents(totals.itemsDiscountCents),
            orderDiscountType: dto.orderDiscount?.value ? dto.orderDiscount.type : null,
            orderDiscountValue: dto.orderDiscount?.value ? dto.orderDiscount.value : null,
            orderDiscount: fromCents(totals.orderDiscountCents),
            total: fromCents(totals.totalCents),
            paidTotal: fromCents(settlement.paidCents),
            change: fromCents(settlement.changeCents),
            discountAuthorizedById,
            removedItems: dto.removedItems?.length ? toJson(dto.removedItems) : undefined,
            offline,
            occurredAt: dto.occurredAt,
            items: {
              create: dto.items.map((item, index) => {
                const product = byId.get(item.productId)!;
                const calculated = totals.items[index];
                return {
                  position: index + 1,
                  productId: product.id,
                  productName: product.name,
                  sku: product.sku,
                  unit: product.unit,
                  quantity: item.quantity,
                  unitPrice: item.unitPrice,
                  unitCost: product.costPrice,
                  discountType: item.discount?.value ? item.discount.type : null,
                  discountValue: item.discount?.value ? item.discount.value : null,
                  discount: fromCents(calculated.discountCents),
                  total: fromCents(calculated.totalCents),
                };
              }),
            },
            payments: { create: dto.payments.map((p) => ({ method: p.method, amount: p.amount })) },
          },
        });

        // Venda offline já aconteceu no balcão: nunca é barrada por saldo do sistema.
        const allowNegative = offline || !settings.pos.blockSaleWithoutStock;
        for (const [index, item] of dto.items.entries()) {
          await this.stock.registerInTransaction(
            tx,
            {
              id: deterministicUuid(`sale:${dto.id}:${index}`),
              productId: item.productId,
              type: MovementType.OUT_SALE,
              quantity: item.quantity,
              note: `Venda nº ${created.number}`,
              source: MovementSource.PDV,
              userId: user.id,
              occurredAt: dto.occurredAt,
            },
            { allowNegative, coverageDays: settings.orderCoverageDays, allowTrashed: offline },
          );
        }
        return tx.sale.findUniqueOrThrow({ where: { id: created.id }, include: saleInclude });
      });
    } catch (error) {
      // A mesma venda chegou duas vezes ao mesmo tempo (reenvio offline): devolve a que foi gravada.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const duplicate = await this.findExisting(dto.id);
        if (duplicate) return { sale: duplicate, duplicated: true };
      }
      throw error;
    }

    const view = toSaleView(sale);
    await this.auditSale(view, dto, divergences, user, ip);
    return { sale: view, duplicated: false };
  }

  /** Cancela uma venda do turno aberto e devolve os itens ao estoque. */
  async cancel(id: string, dto: CancelSaleDto, user: AuthUser, token: string | undefined, ip: string) {
    const sale = await this.prisma.sale.findUnique({ where: { id }, include: { session: true, items: true } });
    if (!sale) throw notFound('Venda');
    if (sale.status === SaleStatus.CANCELED) throw badRequest('Esta venda já foi cancelada');
    if (sale.session.status !== CashSessionStatus.OPEN) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'O caixa desta venda já foi fechado: não é possível cancelar',
        ErrorCode.CASH_CLOSED,
      );
    }

    const authorizedById = await this.authorization.resolve(user, Permission.POS_CANCEL, token, {
      reason: 'Cancelar venda',
    });
    const settings = await this.settings.get();

    const updated = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.sale.updateMany({
        where: { id, status: SaleStatus.COMPLETED },
        data: { status: SaleStatus.CANCELED, canceledAt: new Date(), canceledById: user.id, cancelReason: dto.reason },
      });
      if (count === 0) throw badRequest('Esta venda já foi cancelada');

      for (const item of sale.items) {
        await this.stock.registerInTransaction(
          tx,
          {
            id: deterministicUuid(`sale-cancel:${id}:${item.position}`),
            productId: item.productId,
            type: MovementType.IN_SALE_CANCEL,
            quantity: toNumber(item.quantity),
            note: `Cancelamento da venda nº ${sale.number}`,
            source: MovementSource.PDV,
            userId: user.id,
          },
          { allowNegative: true, coverageDays: settings.orderCoverageDays, allowTrashed: true },
        );
      }
      return tx.sale.findUniqueOrThrow({ where: { id }, include: saleInclude });
    });

    await this.audit.log({
      userId: user.id,
      action: 'sale.cancel',
      entity: 'sale',
      entityId: id,
      details: { number: sale.number, total: toNumber(sale.total), reason: dto.reason, authorizedById },
      ip,
    });
    return toSaleView(updated);
  }

  async list(query: ListSalesQueryDto, user: AuthUser): Promise<Paginated<SaleView>> {
    const where: Prisma.SaleWhereInput = {
      ...this.accessFilter(user),
      ...(query.sessionId && { sessionId: query.sessionId }),
      ...(query.status && { status: query.status }),
      ...(query.number && { number: query.number }),
      ...((query.from || query.to) && { occurredAt: { gte: query.from, lte: query.to } }),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.sale.findMany({ where, include: saleInclude, orderBy: { occurredAt: 'desc' }, ...toSkipTake(query) }),
      this.prisma.sale.count({ where }),
    ]);
    return { items: items.map(toSaleView), total, page: query.page, pageSize: query.pageSize };
  }

  async findOne(id: string, user: AuthUser): Promise<SaleView> {
    const sale = await this.prisma.sale.findFirst({ where: { id, ...this.accessFilter(user) }, include: saleInclude });
    if (!sale) throw notFound('Venda');
    return toSaleView(sale);
  }

  async logAbandon(dto: AbandonSaleDto, user: AuthUser, ip: string) {
    await this.audit.log({
      userId: user.id,
      action: 'sale.abandon',
      entity: 'sale',
      entityId: dto.saleId,
      details: toJson({ total: dto.total, items: dto.items }),
      ip,
    });
  }

  async logReprint(id: string, user: AuthUser, ip: string) {
    const sale = await this.findOne(id, user);
    await this.audit.log({
      userId: user.id,
      action: 'sale.reprint',
      entity: 'sale',
      entityId: id,
      details: { number: sale.number },
      ip,
    });
  }

  /** Operador sem acesso a relatórios só enxerga as vendas dos caixas abertos (reimpressão do turno). */
  private accessFilter(user: AuthUser): Prisma.SaleWhereInput {
    return hasPermission(user.role, Permission.SALES_READ) ? {} : { session: { status: CashSessionStatus.OPEN } };
  }

  private async findExisting(id: string) {
    const sale = await this.prisma.sale.findUnique({ where: { id }, include: saleInclude });
    return sale ? toSaleView(sale) : null;
  }

  /**
   * Online, o preço precisa ser o do cadastro (o caixa acabou de consultar o produto).
   * Offline, o caixa usou o preço salvo no aparelho: a venda é aceita e a diferença vai para a auditoria.
   */
  private checkPrices(
    dto: CreateSaleDto,
    products: Map<string, { name: string; salePrice: Prisma.Decimal }>,
    offline: boolean,
  ) {
    const divergences: { productId: string; name: string; charged: number; registered: number }[] = [];
    for (const item of dto.items) {
      const product = products.get(item.productId)!;
      const registered = toNumber(product.salePrice);
      if (Math.round(item.unitPrice * 100) === Math.round(registered * 100)) continue;
      if (!offline) {
        throw new AppException(
          HttpStatus.CONFLICT,
          `O preço de "${product.name}" mudou para R$ ${money(registered)}. Remova e bipe o item de novo.`,
          ErrorCode.CONFLICT,
        );
      }
      divergences.push({ productId: item.productId, name: product.name, charged: item.unitPrice, registered });
    }
    return divergences;
  }

  private async auditSale(
    sale: SaleView,
    dto: CreateSaleDto,
    divergences: { productId: string; name: string; charged: number; registered: number }[],
    user: AuthUser,
    ip: string,
  ) {
    const base = { userId: user.id, entity: 'sale', entityId: sale.id, ip };
    await this.audit.log({
      ...base,
      action: 'sale.create',
      details: { number: sale.number, total: sale.total, offline: sale.offline },
    });
    const discount = sale.itemsDiscount + sale.orderDiscount;
    if (discount > 0) {
      await this.audit.log({
        ...base,
        action: 'sale.discount',
        details: { number: sale.number, discount, authorizedBy: sale.discountAuthorizedBy?.name ?? null },
      });
    }
    if (dto.removedItems?.length) {
      await this.audit.log({
        ...base,
        action: 'sale.items-removed',
        details: toJson({ number: sale.number, items: dto.removedItems }),
      });
    }
    if (divergences.length) {
      await this.audit.log({
        ...base,
        action: 'sale.price-divergence',
        details: toJson({ number: sale.number, items: divergences }),
      });
    }
  }
}
