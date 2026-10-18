import { HttpStatus, Injectable } from '@nestjs/common';
import { CashSessionStatus, MovementSource, MovementType, PaymentKind, Prisma, SaleStatus } from '@prisma/client';
import { AuthUser } from '../../common/auth/auth-user';
import { hasPermission, Permission } from '../../common/auth/permissions';
import { toNumber } from '../../common/decimal';
import { AppException, badRequest, ErrorCode, notFound } from '../../common/errors';
import { isValidDocument } from '../../common/document';
import { deterministicUuid } from '../../common/ids';
import { toJson } from '../../common/json';
import { Paginated, toSkipTake } from '../../common/pagination';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SettingsService } from '../settings/settings.service';
import { StockService } from '../stock/stock.service';
import { calculateSale, fromCents, SaleRuleError, settlePayments } from './domain/sale-calculator';
import { AbandonSaleDto, CancelSaleDto, CreateSaleDto, ListSalesQueryDto } from './pos.dto';
import { ReceivablesService } from './receivables.service';
import { saleInclude, toSaleView, type SaleView } from './sale.view';
import { StoreCreditsService } from './store-credits.service';
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
    private readonly credits: StoreCreditsService,
    private readonly receivables: ReceivablesService,
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
    const payments = await this.resolvePayments(dto, offline);
    const customer = await this.resolveCustomer(dto, payments, offline);
    await this.checkStoreCredits(payments, customer.id, offline);
    const onAccountCents = payments.filter((p) => p.method.kind === PaymentKind.ON_ACCOUNT).reduce((sum, p) => sum + Math.round(p.amount * 100), 0);
    const creditAuthorizedById = onAccountCents
      ? await this.receivables.assertCredit(customer.id!, fromCents(onAccountCents), { user, token, saleId: dto.id, offline })
      : null;

    let totals: ReturnType<typeof calculateSale>;
    let settlement: ReturnType<typeof settlePayments>;
    try {
      totals = calculateSale(dto.items, dto.orderDiscount);
      settlement = settlePayments(
        totals.totalCents,
        payments.map((p) => ({ amount: p.amount, allowsChange: p.method.allowsChange })),
      );
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
            customerId: customer.id,
            customerName: customer.name,
            customerDocument: customer.document,
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
            payments: {
              create: payments.map((p) => ({
                paymentMethodId: p.method.id,
                methodName: p.method.name,
                methodKind: p.method.kind,
                amount: p.amount,
                storeCreditId: p.method.kind === PaymentKind.STORE_CREDIT ? p.storeCreditId : null,
                installments: p.method.kind === PaymentKind.ON_ACCOUNT ? (p.installments ?? 1) : null,
              })),
            },
          },
        });

        // Vale-troca: desconta o saldo. Fiado: gera as parcelas a receber.
        for (const p of payments.filter((p) => p.method.kind === PaymentKind.STORE_CREDIT)) {
          await this.credits.redeem(tx, { creditId: p.storeCreditId!, amount: p.amount, saleId: dto.id, userId: user.id, offline });
        }
        if (onAccountCents) {
          await this.receivables.createForSale(tx, {
            customerId: customer.id!,
            saleId: dto.id,
            saleNumber: created.number,
            amount: fromCents(onAccountCents),
            installments: Math.max(...payments.filter((p) => p.method.kind === PaymentKind.ON_ACCOUNT).map((p) => p.installments ?? 1)),
            occurredAt: dto.occurredAt,
          });
        }

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
    if (creditAuthorizedById) {
      await this.audit.log({
        userId: user.id,
        action: 'sale.credit-override',
        entity: 'sale',
        entityId: view.id,
        details: { number: view.number, amount: fromCents(onAccountCents), authorizedById: creditAuthorizedById },
        ip,
      });
    }
    return { sale: view, duplicated: false };
  }

  /** Cancela uma venda do turno aberto e devolve os itens ao estoque. */
  async cancel(id: string, dto: CancelSaleDto, user: AuthUser, token: string | undefined, ip: string) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: { session: true, items: true, payments: true, _count: { select: { returns: true } } },
    });
    if (!sale) throw notFound('Venda');
    if (sale.status === SaleStatus.CANCELED) throw badRequest('Esta venda já foi cancelada');
    if (sale._count.returns > 0) throw badRequest('Esta venda já tem devolução: faça a devolução dos itens restantes em vez de cancelar');
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

      await this.receivables.cancelForSale(tx, id);
      for (const p of sale.payments.filter((p) => p.storeCreditId)) {
        await this.credits.reverse(tx, { creditId: p.storeCreditId!, amount: toNumber(p.amount), saleId: id, userId: user.id });
      }

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
      ...(query.customerId && { customerId: query.customerId }),
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
   * Formas de pagamento da venda (pelo id ou, em vendas offline antigas, pelo código de fábrica).
   * Online, a forma precisa estar ativa; offline, a venda já aconteceu e é aceita.
   */
  private async resolvePayments(dto: CreateSaleDto, offline: boolean) {
    const ids = dto.payments.flatMap((p) => (p.methodId ? [p.methodId] : []));
    const codes = dto.payments.flatMap((p) => (!p.methodId && p.method ? [p.method] : []));
    const methods = await this.prisma.paymentMethod.findMany({
      where: { OR: [{ id: { in: ids } }, { code: { in: codes } }] },
    });
    return dto.payments.map((payment) => {
      const method = methods.find((m) => (payment.methodId ? m.id === payment.methodId : m.code === payment.method));
      if (!method) throw badRequest('Forma de pagamento não encontrada');
      if (!method.active && !offline) throw badRequest(`A forma de pagamento "${method.name}" está desativada`);
      return { method, amount: payment.amount, storeCreditId: payment.storeCreditId, installments: payment.installments };
    });
  }

  /** Vale-troca: precisa do código, estar ativo e ter saldo (online). O saldo é descontado na transação da venda. */
  private async checkStoreCredits(payments: { method: { kind: PaymentKind }; amount: number; storeCreditId?: string }[], customerId: string | null, offline: boolean) {
    const byCredit = new Map<string, number>();
    for (const p of payments.filter((p) => p.method.kind === PaymentKind.STORE_CREDIT)) {
      if (!p.storeCreditId) throw badRequest('Informe o código do vale-troca');
      byCredit.set(p.storeCreditId, (byCredit.get(p.storeCreditId) ?? 0) + Math.round(p.amount * 100));
    }
    if (offline) return;
    for (const [creditId, cents] of byCredit) {
      const credit = await this.credits.findOne(creditId);
      if (credit.status !== 'ACTIVE') throw badRequest(`O vale ${credit.code} não pode ser usado (${credit.status === 'EXPIRED' ? 'vencido' : credit.status === 'USED' ? 'sem saldo' : 'cancelado'})`);
      if (cents > Math.round(credit.balance * 100)) throw badRequest(`O saldo do vale ${credit.code} é de R$ ${credit.balance.toFixed(2).replace('.', ',')}`);
      if (credit.customer && customerId && credit.customer.id !== customerId) {
        throw badRequest(`O vale ${credit.code} é de outro cliente (${credit.customer.name})`);
      }
    }
  }

  /** Cliente identificado e/ou CPF na nota. Formas como o fiado exigem cliente. */
  private async resolveCustomer(
    dto: CreateSaleDto,
    payments: { method: { name: string; requiresCustomer: boolean } }[],
    offline: boolean,
  ) {
    if (dto.customerDocument && !isValidDocument(dto.customerDocument)) {
      throw badRequest('CPF/CNPJ do consumidor inválido: confira os números');
    }
    let customer: { id: string; name: string; document: string | null } | null = null;
    if (dto.customerId) {
      const found = await this.prisma.customer.findUnique({ where: { id: dto.customerId } });
      if (!found || found.anonymizedAt) throw notFound('Cliente');
      if (!found.active && !offline) throw badRequest(`O cliente "${found.name}" está inativo`);
      customer = found;
    }
    const needsCustomer = payments.find((p) => p.method.requiresCustomer);
    if (needsCustomer && !customer) {
      throw badRequest(`A forma "${needsCustomer.method.name}" exige identificar o cliente da venda`);
    }
    return {
      id: customer?.id ?? null,
      name: customer?.name ?? null,
      document: dto.customerDocument ?? customer?.document ?? null,
    };
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
