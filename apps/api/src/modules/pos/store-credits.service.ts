import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../../common/auth/auth-user';
import { toNumber } from '../../common/decimal';
import { badRequest, notFound } from '../../common/errors';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { addDays, dateOnly, isoDate, todayIso } from '../finance/dates';
import { creditStatus, voucherCode } from './domain/post-sale';

type Tx = Prisma.TransactionClient;

const creditInclude = {
  customer: { select: { id: true, name: true } },
  saleReturn: { select: { id: true, number: true, sale: { select: { number: true } } } },
  entries: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.StoreCreditInclude;

type CreditRow = Prisma.StoreCreditGetPayload<{ include: typeof creditInclude }>;

export function toCreditView(credit: CreditRow) {
  const balance = toNumber(credit.balance);
  const expiresAt = isoDate(credit.expiresAt);
  return {
    id: credit.id,
    code: credit.code,
    customer: credit.customer,
    amount: toNumber(credit.amount),
    balance,
    expiresAt,
    note: credit.note,
    createdAt: credit.createdAt,
    canceledAt: credit.canceledAt,
    status: creditStatus({ balanceCents: Math.round(balance * 100), expiresAt, canceled: Boolean(credit.canceledAt) }, todayIso()),
    origin: credit.saleReturn ? { returnId: credit.saleReturn.id, returnNumber: credit.saleReturn.number, saleNumber: credit.saleReturn.sale.number } : null,
    entries: credit.entries.map((e) => ({ id: e.id, type: e.type, amount: toNumber(e.amount), saleId: e.saleId, createdAt: e.createdAt })),
  };
}

export type CreditView = ReturnType<typeof toCreditView>;

/** Vale-troca / crédito do cliente (RF16): emissão nas devoluções, uso como pagamento e extrato. */
@Injectable()
export class StoreCreditsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Emite um vale dentro da transação da devolução. */
  async issue(tx: Tx, data: { amount: number; customerId: string | null; validityDays: number; userId: string; note?: string }) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = voucherCode();
      if (await tx.storeCredit.findUnique({ where: { code } })) continue;
      return tx.storeCredit.create({
        data: {
          code,
          customerId: data.customerId,
          amount: data.amount,
          balance: data.amount,
          expiresAt: data.validityDays > 0 ? dateOnly(addDays(todayIso(), data.validityDays)) : null,
          note: data.note,
          createdById: data.userId,
          entries: { create: { type: 'ISSUE', amount: data.amount, userId: data.userId } },
        },
      });
    }
    throw new Error('Não foi possível gerar um código de vale único');
  }

  /**
   * Usa o vale como pagamento (dentro da transação da venda). O saldo é conferido e descontado
   * numa só operação: dois caixas não conseguem gastar o mesmo saldo ao mesmo tempo.
   * Venda offline já aconteceu no balcão: o saldo é descontado mesmo se ficar negativo (vai para a auditoria).
   */
  async redeem(tx: Tx, data: { creditId: string; amount: number; saleId: string; userId: string; offline: boolean }) {
    const today = dateOnly(todayIso());
    const { count } = await tx.storeCredit.updateMany({
      where: {
        id: data.creditId,
        canceledAt: null,
        balance: { gte: data.amount },
        OR: [{ expiresAt: null }, { expiresAt: { gte: today } }],
      },
      data: { balance: { decrement: data.amount } },
    });
    if (count === 0) {
      if (!data.offline) throw badRequest('Saldo do vale insuficiente, vale vencido ou cancelado');
      await tx.storeCredit.update({ where: { id: data.creditId }, data: { balance: { decrement: data.amount } } });
    }
    await tx.storeCreditEntry.create({ data: { creditId: data.creditId, type: 'REDEEM', amount: -data.amount, saleId: data.saleId, userId: data.userId } });
    return count > 0;
  }

  /** Devolve ao vale o que foi usado numa venda cancelada. */
  async reverse(tx: Tx, data: { creditId: string; amount: number; saleId: string; userId: string }) {
    await tx.storeCredit.update({ where: { id: data.creditId }, data: { balance: { increment: data.amount } } });
    await tx.storeCreditEntry.create({ data: { creditId: data.creditId, type: 'REVERSAL', amount: data.amount, saleId: data.saleId, userId: data.userId } });
  }

  /** Confere o vale antes de vender (código digitado ou bipado no caixa). */
  async lookup(code: string) {
    const credit = await this.prisma.storeCredit.findUnique({ where: { code: code.trim().toUpperCase() }, include: creditInclude });
    if (!credit) throw notFound(`Vale "${code}"`);
    return toCreditView(credit);
  }

  async findOne(id: string) {
    const credit = await this.prisma.storeCredit.findUnique({ where: { id }, include: creditInclude });
    if (!credit) throw notFound('Vale');
    return toCreditView(credit);
  }

  async list(filter: { customerId?: string; activeOnly?: boolean }) {
    const credits = await this.prisma.storeCredit.findMany({
      where: {
        ...(filter.customerId && { customerId: filter.customerId }),
        ...(filter.activeOnly && { canceledAt: null, balance: { gt: 0 } }),
      },
      include: creditInclude,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return credits.map(toCreditView);
  }

  /** Cancela o saldo restante (ex.: vale perdido e reemitido). */
  async cancel(id: string, user: AuthUser, ip: string) {
    const credit = await this.prisma.storeCredit.findUnique({ where: { id } });
    if (!credit) throw notFound('Vale');
    if (credit.canceledAt) throw badRequest('Este vale já foi cancelado');
    const balance = toNumber(credit.balance);
    await this.prisma.$transaction([
      this.prisma.storeCredit.update({ where: { id }, data: { canceledAt: new Date(), balance: 0 } }),
      this.prisma.storeCreditEntry.create({ data: { creditId: id, type: 'CANCEL', amount: -balance, userId: user.id } }),
    ]);
    await this.audit.log({ userId: user.id, action: 'store-credit.cancel', entity: 'store-credit', entityId: id, details: { code: credit.code, balance }, ip });
    return this.findOne(id);
  }
}
