import { HttpStatus, Injectable } from '@nestjs/common';
import { CashSessionStatus, PaymentKind, Prisma, ReceivableStatus } from '@prisma/client';
import { AuthUser } from '../../common/auth/auth-user';
import { Permission } from '../../common/auth/permissions';
import { toNumber } from '../../common/decimal';
import { AppException, badRequest, ErrorCode, notFound } from '../../common/errors';
import { Paginated, toSkipTake } from '../../common/pagination';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { addDays, dateOnly, isoDate, todayIso } from '../finance/dates';
import { splitInstallments } from '../purchases/domain/costing';
import { SettingsService } from '../settings/settings.service';
import { allocateReceipt, PostSaleError, reduceInstallments } from './domain/post-sale';
import { fromCents, toCents } from './domain/sale-calculator';
import { CreateReceiptDto, ListReceivablesQueryDto } from './post-sale.dto';
import { SupervisorAuthorizationService } from './supervisor-authorization.service';

type Tx = Prisma.TransactionClient;

const receivableInclude = {
  customer: { select: { id: true, name: true, phone: true } },
  sale: { select: { id: true, number: true } },
} satisfies Prisma.ReceivableInclude;

type ReceivableRow = Prisma.ReceivableGetPayload<{ include: typeof receivableInclude }>;

const toReceivableView = (r: ReceivableRow) => {
  const amount = toNumber(r.amount);
  const paidAmount = toNumber(r.paidAmount);
  const dueDate = isoDate(r.dueDate)!;
  const today = todayIso();
  return {
    id: r.id,
    customer: r.customer,
    sale: r.sale,
    description: r.description,
    installment: r.installment,
    installments: r.installments,
    dueDate,
    amount,
    paidAmount,
    balance: fromCents(toCents(amount) - toCents(paidAmount)),
    status: r.status,
    overdue: r.status === ReceivableStatus.OPEN && dueDate < today,
    daysOverdue: r.status === ReceivableStatus.OPEN && dueDate < today ? Math.round((dateOnly(today).getTime() - dateOnly(dueDate).getTime()) / 86_400_000) : 0,
    paidAt: r.paidAt,
    canceledAt: r.canceledAt,
    createdAt: r.createdAt,
  };
};

const receiptInclude = {
  customer: { select: { id: true, name: true } },
  session: { select: { id: true, terminal: true } },
  user: { select: { id: true, name: true } },
  allocations: { include: { receivable: { select: { id: true, description: true, installment: true, installments: true, dueDate: true } } } },
} satisfies Prisma.CustomerReceiptInclude;

type ReceiptRow = Prisma.CustomerReceiptGetPayload<{ include: typeof receiptInclude }>;

const toReceiptView = (r: ReceiptRow, balanceAfter?: number) => ({
  id: r.id,
  number: r.number,
  customer: r.customer,
  session: r.session,
  user: r.user,
  methodId: r.paymentMethodId,
  methodName: r.methodName,
  methodKind: r.methodKind,
  amount: toNumber(r.amount),
  received: toNumber(r.received),
  change: toNumber(r.change),
  occurredAt: r.occurredAt,
  allocations: r.allocations.map((a) => ({
    receivableId: a.receivableId,
    description: a.receivable.description,
    installment: a.receivable.installment,
    installments: a.receivable.installments,
    dueDate: isoDate(a.receivable.dueDate),
    amount: toNumber(a.amount),
  })),
  balanceAfter: balanceAfter ?? null,
});

export type ReceiptView = ReturnType<typeof toReceiptView>;

const openBalance = (rows: { amount: Prisma.Decimal; paidAmount: Prisma.Decimal }[]) =>
  rows.reduce((sum, r) => sum + toCents(toNumber(r.amount)) - toCents(toNumber(r.paidAmount)), 0);

/** Fiado / crediário (RF23): limite, contas a receber por parcela e recebimento no caixa. */
@Injectable()
export class ReceivablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly authorization: SupervisorAuthorizationService,
  ) {}

  /** Situação do fiado do cliente: limite, em aberto, vencido e disponível. */
  async creditInfo(customerId: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw notFound('Cliente');
    const today = dateOnly(todayIso());
    const [open, credits] = await Promise.all([
      this.prisma.receivable.findMany({
        where: { customerId, status: ReceivableStatus.OPEN },
        include: receivableInclude,
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }, { installment: 'asc' }],
      }),
      this.prisma.storeCredit.aggregate({
        where: { customerId, canceledAt: null, balance: { gt: 0 }, OR: [{ expiresAt: null }, { expiresAt: { gte: today } }] },
        _sum: { balance: true },
        _count: { _all: true },
      }),
    ]);
    const openCents = openBalance(open);
    const overdue = open.filter((r) => r.dueDate < today);
    const limitCents = toCents(toNumber(customer.creditLimit));
    return {
      customerId,
      limit: fromCents(limitCents),
      open: fromCents(openCents),
      overdue: fromCents(openBalance(overdue)),
      overdueCount: overdue.length,
      oldestOverdue: overdue.length ? isoDate(overdue[0].dueDate) : null,
      available: fromCents(Math.max(limitCents - openCents, 0)),
      storeCredit: { count: credits._count._all, balance: toNumber(credits._sum.balance) },
      installments: open.map(toReceivableView),
    };
  }

  /**
   * Confere se a venda no fiado cabe no limite e se o cliente não tem parcela vencida.
   * Fora da regra, o gerente libera com o PIN (ou o próprio gerente vende). Devolve quem autorizou.
   * Venda offline já aconteceu no balcão: não é barrada.
   */
  async assertCredit(customerId: string, amount: number, context: { user: AuthUser; token?: string; saleId: string; offline: boolean }) {
    if (context.offline) return null;
    const [info, settings] = await Promise.all([this.creditInfo(customerId), this.settings.get()]);
    const money = (value: number) => `R$ ${value.toFixed(2).replace('.', ',')}`;
    let reason: string | null = null;
    if (info.limit <= 0) reason = 'cliente sem limite de fiado liberado';
    else if (toCents(info.open) + toCents(amount) > toCents(info.limit)) reason = `passa do limite (disponível ${money(info.available)})`;
    else if (settings.credit.blockOverdue && info.overdueCount > 0) reason = `cliente com ${info.overdueCount} parcela(s) vencida(s)`;
    if (!reason) return null;
    return this.authorization.resolve(context.user, Permission.POS_CREDIT, context.token, { scope: context.saleId, reason: `Fiado: ${reason}` });
  }

  /** Gera as parcelas do fiado da venda (dentro da transação da venda). */
  async createForSale(tx: Tx, data: { customerId: string; saleId: string; saleNumber: number; amount: number; installments: number; occurredAt: Date }) {
    const { credit } = await this.settings.get();
    const first = addDays(todayIso(), credit.firstDueDays);
    const parts = splitInstallments(data.amount, Math.max(data.installments, 1), first, credit.intervalDays);
    await tx.receivable.createMany({
      data: parts.map((part) => ({
        customerId: data.customerId,
        saleId: data.saleId,
        description: `Venda nº ${data.saleNumber}`,
        installment: part.installment,
        installments: parts.length,
        dueDate: dateOnly(part.dueDate),
        amount: part.amount,
      })),
    });
  }

  /** Venda cancelada: cancela o fiado dela (só se nada foi recebido ainda). */
  async cancelForSale(tx: Tx, saleId: string) {
    const rows = await tx.receivable.findMany({ where: { saleId, status: { not: ReceivableStatus.CANCELED } } });
    if (rows.some((r) => toNumber(r.paidAmount) > 0)) {
      throw badRequest('O fiado desta venda já tem parcela recebida: faça uma devolução abatendo do fiado em vez de cancelar');
    }
    await tx.receivable.updateMany({ where: { saleId, status: ReceivableStatus.OPEN }, data: { status: ReceivableStatus.CANCELED, canceledAt: new Date() } });
  }

  /** Devolução abatida do fiado da venda (da última parcela para a primeira). */
  async reduceForReturn(tx: Tx, saleId: string, amountCents: number) {
    const rows = await tx.receivable.findMany({ where: { saleId, status: ReceivableStatus.OPEN }, orderBy: { installment: 'asc' } });
    let reductions: { id: string; cents: number }[];
    try {
      reductions = reduceInstallments(
        rows.map((r) => ({ id: r.id, dueCents: toCents(toNumber(r.amount)) - toCents(toNumber(r.paidAmount)) })),
        amountCents,
      );
    } catch (error) {
      if (error instanceof PostSaleError) {
        throw badRequest(`${error.message} (R$ ${fromCents(openBalance(rows)).toFixed(2).replace('.', ',')}). Devolva o restante por outra forma.`);
      }
      throw error;
    }
    for (const { id, cents } of reductions) {
      const row = rows.find((r) => r.id === id)!;
      const amount = fromCents(toCents(toNumber(row.amount)) - cents);
      const paid = toNumber(row.paidAmount);
      const settled = toCents(amount) <= toCents(paid);
      await tx.receivable.update({
        where: { id },
        data: {
          amount,
          ...(settled && (paid > 0 ? { status: ReceivableStatus.PAID, paidAt: new Date() } : { status: ReceivableStatus.CANCELED, canceledAt: new Date() })),
        },
      });
    }
  }

  /**
   * Recebimento do fiado no caixa: baixa das parcelas mais antigas para as mais novas.
   * Em dinheiro pode haver troco (sai da gaveta); nas outras formas o valor é exato. Idempotente pelo id.
   */
  async receive(dto: CreateReceiptDto, user: AuthUser, ip: string) {
    const existing = await this.prisma.customerReceipt.findUnique({ where: { id: dto.id }, include: receiptInclude });
    if (existing) return toReceiptView(existing);

    const session = await this.prisma.cashSession.findUnique({ where: { id: dto.sessionId } });
    if (!session) throw notFound('Caixa');
    if (session.status !== CashSessionStatus.OPEN) {
      throw new AppException(HttpStatus.CONFLICT, 'Este caixa já foi fechado', ErrorCode.CASH_CLOSED);
    }
    const method = await this.prisma.paymentMethod.findUnique({ where: { id: dto.methodId } });
    if (!method || !method.active) throw badRequest('Forma de pagamento inválida ou desativada');
    if (method.kind === PaymentKind.ON_ACCOUNT || method.kind === PaymentKind.STORE_CREDIT) {
      throw badRequest(`Não é possível receber o fiado com "${method.name}"`);
    }
    const amountCents = toCents(dto.amount);
    const receivedCents = toCents(dto.received ?? dto.amount);
    if (receivedCents < amountCents) throw badRequest('O valor entregue é menor que o valor a receber');
    if (receivedCents > amountCents && !method.allowsChange) throw badRequest('Troco só pode ser dado em dinheiro');

    const receipt = await this.prisma.$transaction(async (tx) => {
      const open = await tx.receivable.findMany({
        where: { customerId: dto.customerId, status: ReceivableStatus.OPEN },
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }, { installment: 'asc' }],
      });
      let allocations: { id: string; cents: number }[];
      try {
        allocations = allocateReceipt(
          open.map((r) => ({ id: r.id, dueCents: toCents(toNumber(r.amount)) - toCents(toNumber(r.paidAmount)) })),
          amountCents,
        );
      } catch (error) {
        if (error instanceof PostSaleError) throw badRequest(error.message);
        throw error;
      }
      const created = await tx.customerReceipt.create({
        data: {
          id: dto.id,
          customerId: dto.customerId,
          sessionId: session.id,
          userId: user.id,
          paymentMethodId: method.id,
          methodName: method.name,
          methodKind: method.kind,
          amount: fromCents(amountCents),
          received: fromCents(receivedCents),
          change: fromCents(receivedCents - amountCents),
          allocations: { create: allocations.map((a) => ({ receivableId: a.id, amount: fromCents(a.cents) })) },
        },
      });
      for (const allocation of allocations) {
        const row = open.find((r) => r.id === allocation.id)!;
        const paidCents = toCents(toNumber(row.paidAmount)) + allocation.cents;
        const settled = paidCents >= toCents(toNumber(row.amount));
        // Trava otimista: se outra baixa mexeu na parcela ao mesmo tempo, a transação é desfeita.
        const { count } = await tx.receivable.updateMany({
          where: { id: row.id, paidAmount: row.paidAmount, status: ReceivableStatus.OPEN },
          data: { paidAmount: fromCents(paidCents), ...(settled && { status: ReceivableStatus.PAID, paidAt: new Date() }) },
        });
        if (count === 0) throw badRequest('O fiado deste cliente mudou durante o recebimento. Tente de novo.');
      }
      return tx.customerReceipt.findUniqueOrThrow({ where: { id: created.id }, include: receiptInclude });
    });

    const info = await this.creditInfo(dto.customerId);
    await this.audit.log({
      userId: user.id,
      action: 'credit.receive',
      entity: 'customer',
      entityId: dto.customerId,
      details: { number: receipt.number, amount: fromCents(amountCents), method: method.name, balanceAfter: info.open },
      ip,
    });
    return toReceiptView(receipt, info.open);
  }

  async findReceipt(id: string) {
    const receipt = await this.prisma.customerReceipt.findUnique({ where: { id }, include: receiptInclude });
    if (!receipt) throw notFound('Recebimento');
    return toReceiptView(receipt);
  }

  async list(query: ListReceivablesQueryDto): Promise<Paginated<ReturnType<typeof toReceivableView>>> {
    const status = query.status ?? 'open';
    const today = dateOnly(todayIso());
    const where: Prisma.ReceivableWhereInput = {
      ...(status !== 'all' && { status: status.toUpperCase() as ReceivableStatus }),
      ...(query.overdue && { status: ReceivableStatus.OPEN, dueDate: { lt: today } }),
      ...(query.customerId && { customerId: query.customerId }),
      ...(query.search && { customer: { name: { contains: query.search, mode: 'insensitive' } } }),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.receivable.findMany({ where, include: receivableInclude, orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }, { installment: 'asc' }], ...toSkipTake(query) }),
      this.prisma.receivable.count({ where }),
    ]);
    return { items: rows.map(toReceivableView), total, page: query.page, pageSize: query.pageSize };
  }

  /** Inadimplência: total em aberto, vencido por faixa de atraso e os maiores devedores. */
  async summary() {
    const rows = await this.prisma.receivable.findMany({ where: { status: ReceivableStatus.OPEN }, include: receivableInclude });
    const today = dateOnly(todayIso()).getTime();
    const buckets = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90: 0 };
    const byCustomer = new Map<string, { customer: { id: string; name: string; phone: string | null }; openCents: number; overdueCents: number; oldestDays: number }>();
    for (const row of rows) {
      const cents = toCents(toNumber(row.amount)) - toCents(toNumber(row.paidAmount));
      const days = Math.round((today - row.dueDate.getTime()) / 86_400_000);
      const bucket = days <= 0 ? 'current' : days <= 30 ? 'd1_30' : days <= 60 ? 'd31_60' : days <= 90 ? 'd61_90' : 'd90';
      buckets[bucket] += cents;
      const entry = byCustomer.get(row.customerId) ?? { customer: row.customer, openCents: 0, overdueCents: 0, oldestDays: 0 };
      entry.openCents += cents;
      if (days > 0) {
        entry.overdueCents += cents;
        entry.oldestDays = Math.max(entry.oldestDays, days);
      }
      byCustomer.set(row.customerId, entry);
    }
    const customers = [...byCustomer.values()];
    return {
      open: fromCents(Object.values(buckets).reduce((a, b) => a + b, 0)),
      overdue: fromCents(buckets.d1_30 + buckets.d31_60 + buckets.d61_90 + buckets.d90),
      customers: customers.length,
      overdueCustomers: customers.filter((c) => c.overdueCents > 0).length,
      aging: Object.fromEntries(Object.entries(buckets).map(([key, cents]) => [key, fromCents(cents)])) as Record<keyof typeof buckets, number>,
      debtors: customers
        .sort((a, b) => b.overdueCents - a.overdueCents || b.openCents - a.openCents)
        .slice(0, 20)
        .map((c) => ({ customer: c.customer, open: fromCents(c.openCents), overdue: fromCents(c.overdueCents), oldestDays: c.oldestDays })),
    };
  }

  /** Extrato do cliente: parcelas e recebimentos. */
  async statement(customerId: string) {
    const [receivables, receipts, info] = await Promise.all([
      this.prisma.receivable.findMany({ where: { customerId }, include: receivableInclude, orderBy: [{ dueDate: 'desc' }, { installment: 'desc' }], take: 100 }),
      this.prisma.customerReceipt.findMany({ where: { customerId }, include: receiptInclude, orderBy: { occurredAt: 'desc' }, take: 50 }),
      this.creditInfo(customerId),
    ]);
    return { credit: { ...info, installments: undefined }, receivables: receivables.map(toReceivableView), receipts: receipts.map((r) => toReceiptView(r)) };
  }

  /** Cancela o saldo em aberto de uma parcela (acordo, perdão de dívida). */
  async cancel(id: string, reason: string, user: AuthUser, ip: string) {
    const row = await this.prisma.receivable.findUnique({ where: { id } });
    if (!row) throw notFound('Conta a receber');
    if (row.status !== ReceivableStatus.OPEN) throw badRequest('Esta parcela não está em aberto');
    const paid = toNumber(row.paidAmount);
    await this.prisma.receivable.update({
      where: { id },
      data: paid > 0 ? { amount: paid, status: ReceivableStatus.PAID, paidAt: new Date() } : { status: ReceivableStatus.CANCELED, canceledAt: new Date() },
    });
    await this.audit.log({
      userId: user.id,
      action: 'credit.cancel',
      entity: 'customer',
      entityId: row.customerId,
      details: { receivableId: id, balance: fromCents(toCents(toNumber(row.amount)) - toCents(paid)), reason },
      ip,
    });
    const updated = await this.prisma.receivable.findUniqueOrThrow({ where: { id }, include: receivableInclude });
    return toReceivableView(updated);
  }
}
