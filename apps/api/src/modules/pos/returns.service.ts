import { HttpStatus, Injectable } from '@nestjs/common';
import { CashSessionStatus, MovementSource, MovementType, PaymentKind, Prisma, RefundMethod, SaleStatus } from '@prisma/client';
import { AuthUser } from '../../common/auth/auth-user';
import { Permission } from '../../common/auth/permissions';
import { toNumber } from '../../common/decimal';
import { AppException, badRequest, ErrorCode, notFound } from '../../common/errors';
import { deterministicUuid } from '../../common/ids';
import { Paginated, toSkipTake } from '../../common/pagination';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { dateOnly, localDay, todayIso } from '../finance/dates';
import { SettingsService } from '../settings/settings.service';
import { StockService } from '../stock/stock.service';
import { CashService } from './cash.service';
import { expandKit } from './sales.service';
import { netItemValues, PostSaleError, refundForItem, returnableQuantity } from './domain/post-sale';
import { fromCents, toCents } from './domain/sale-calculator';
import { CreateReturnDto, ListReturnsQueryDto } from './post-sale.dto';
import { ReceivablesService } from './receivables.service';
import { StoreCreditsService } from './store-credits.service';
import { SupervisorAuthorizationService } from './supervisor-authorization.service';

const NOT_MONEY: PaymentKind[] = [PaymentKind.CASH, PaymentKind.STORE_CREDIT, PaymentKind.ON_ACCOUNT];

const returnInclude = {
  sale: { select: { id: true, number: true, occurredAt: true } },
  session: { select: { id: true, terminal: true } },
  customer: { select: { id: true, name: true } },
  user: { select: { id: true, name: true } },
  authorizedBy: { select: { id: true, name: true } },
  storeCredit: { select: { id: true, code: true, amount: true, balance: true, expiresAt: true } },
  items: true,
} satisfies Prisma.SaleReturnInclude;

type ReturnRow = Prisma.SaleReturnGetPayload<{ include: typeof returnInclude }>;

export function toReturnView(r: ReturnRow) {
  return {
    id: r.id,
    number: r.number,
    sale: r.sale,
    session: r.session,
    customer: r.customer,
    user: r.user,
    authorizedBy: r.authorizedBy,
    reason: r.reason,
    refundMethod: r.refundMethod,
    refundMethodName: r.refundMethodName,
    total: toNumber(r.total),
    storeCredit: r.storeCredit
      ? {
          id: r.storeCredit.id,
          code: r.storeCredit.code,
          amount: toNumber(r.storeCredit.amount),
          balance: toNumber(r.storeCredit.balance),
          expiresAt: r.storeCredit.expiresAt ? r.storeCredit.expiresAt.toISOString().slice(0, 10) : null,
        }
      : null,
    createdAt: r.createdAt,
    items: r.items.map((i) => ({
      id: i.id,
      saleItemId: i.saleItemId,
      productId: i.productId,
      productName: i.productName,
      unit: i.unit,
      quantity: toNumber(i.quantity),
      amount: toNumber(i.amount),
      restock: i.restock,
    })),
  };
}

export type ReturnView = ReturnType<typeof toReturnView>;

const saleForReturn = {
  items: { orderBy: { position: 'asc' }, include: { returnItems: { select: { quantity: true, amount: true } } } },
  payments: true,
  customer: { select: { id: true, name: true } },
  receivables: { select: { amount: true, paidAmount: true, status: true } },
  returns: { select: { id: true, number: true, total: true, refundMethod: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.SaleInclude;

type SaleForReturn = Prisma.SaleGetPayload<{ include: typeof saleForReturn }>;

/** Troca e devolução (RF15): parcial ou total, mesmo depois do fechamento do turno. */
@Injectable()
export class ReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly authorization: SupervisorAuthorizationService,
    private readonly credits: StoreCreditsService,
    private readonly receivables: ReceivablesService,
    private readonly cash: CashService,
  ) {}

  /** O que ainda pode ser devolvido da venda, quanto vale e as formas de reembolso possíveis. */
  async preview(filter: { saleId?: string; number?: number }) {
    const sale = await this.prisma.sale.findFirst({
      where: filter.saleId ? { id: filter.saleId } : { number: filter.number },
      include: saleForReturn,
    });
    if (!sale) throw notFound('Venda');
    const { pos } = await this.settings.get();
    const days = this.daysSince(sale.occurredAt);
    const items = this.itemStates(sale);
    const originalMethods = sale.payments.filter((p) => !NOT_MONEY.includes(p.methodKind)).map((p) => p.methodName);
    const openAccount = sale.receivables
      .filter((r) => r.status === 'OPEN')
      .reduce((sum, r) => sum + toCents(toNumber(r.amount)) - toCents(toNumber(r.paidAmount)), 0);
    return {
      sale: {
        id: sale.id,
        number: sale.number,
        status: sale.status,
        occurredAt: sale.occurredAt,
        total: toNumber(sale.total),
        customer: sale.customer,
        payments: sale.payments.map((p) => ({ name: p.methodName, kind: p.methodKind, amount: toNumber(p.amount) })),
      },
      daysSinceSale: days,
      deadlineDays: pos.returnDays,
      withinDeadline: pos.returnDays === 0 || days <= pos.returnDays,
      items: items.map(({ item, state }) => ({
        saleItemId: item.id,
        productId: item.productId,
        productName: item.productName,
        unit: item.unit,
        soldQuantity: state.soldQuantity,
        returnedQuantity: state.returnedQuantity,
        returnableQuantity: returnableQuantity(state),
        paidTotal: fromCents(state.netCents),
        refundableRemaining: fromCents(state.netCents - state.refundedCents),
      })),
      previousReturns: sale.returns.map((r) => ({ ...r, total: toNumber(r.total) })),
      refundOptions: {
        cash: true,
        original: originalMethods.length > 0 ? originalMethods.join(' + ') : null,
        storeCredit: true,
        account: openAccount > 0 ? fromCents(openAccount) : null,
      },
    };
  }

  async create(dto: CreateReturnDto, user: AuthUser, token: string | undefined, ip: string) {
    const existing = await this.prisma.saleReturn.findUnique({ where: { id: dto.id }, include: returnInclude });
    if (existing) return toReturnView(existing);

    const sale = await this.prisma.sale.findUnique({ where: { id: dto.saleId }, include: saleForReturn });
    if (!sale) throw notFound('Venda');
    if (sale.status !== SaleStatus.COMPLETED) throw badRequest('Venda cancelada não pode ter devolução');

    const settings = await this.settings.get();
    const days = this.daysSince(sale.occurredAt);
    const late = settings.pos.returnDays > 0 && days > settings.pos.returnDays;
    const authorizedById = await this.authorization.resolve(user, Permission.POS_RETURN, token, {
      reason: late ? `A devolução fora do prazo (${days} dias; o prazo é de ${settings.pos.returnDays})` : 'A devolução',
    });

    if (new Set(dto.items.map((i) => i.saleItemId)).size !== dto.items.length) throw badRequest('Item repetido na devolução');
    const states = this.itemStates(sale);
    const lines = dto.items.map((line) => {
      const found = states.find(({ item }) => item.id === line.saleItemId);
      if (!found) throw badRequest('Item não pertence a esta venda');
      try {
        return { line, item: found.item, cents: refundForItem(found.state, line.quantity) };
      } catch (error) {
        if (error instanceof PostSaleError) throw badRequest(`${found.item.productName}: ${error.message}`);
        throw error;
      }
    });
    const totalCents = lines.reduce((sum, l) => sum + l.cents, 0);
    if (totalCents <= 0) throw badRequest('Não há valor a devolver nesta seleção');

    let refundMethodName: string | null = null;
    if (dto.refundMethod === RefundMethod.CASH) {
      if (!dto.sessionId) throw badRequest('Abra o caixa para devolver em dinheiro');
      const session = await this.cash.findOpen(dto.sessionId);
      const expected = await this.cash.expectedCash(session.id);
      if (totalCents > toCents(expected)) {
        throw badRequest(`Não há dinheiro suficiente na gaveta (esperado R$ ${expected.toFixed(2).replace('.', ',')})`);
      }
      refundMethodName = 'Dinheiro';
    } else if (dto.refundMethod === RefundMethod.ORIGINAL) {
      const original = sale.payments.filter((p) => !NOT_MONEY.includes(p.methodKind));
      if (!original.length) throw badRequest('Esta venda não foi paga com cartão, PIX ou vale: devolva em dinheiro ou em vale-troca');
      refundMethodName = [...new Set(original.map((p) => p.methodName))].join(' + ');
    } else if (dto.refundMethod === RefundMethod.ACCOUNT) {
      if (!sale.payments.some((p) => p.methodKind === PaymentKind.ON_ACCOUNT)) throw badRequest('Esta venda não foi feita no fiado');
      refundMethodName = 'Abatido do fiado';
    } else {
      refundMethodName = 'Vale-troca';
    }
    if (dto.sessionId) {
      const session = await this.prisma.cashSession.findUnique({ where: { id: dto.sessionId } });
      if (!session || session.status !== CashSessionStatus.OPEN) {
        throw new AppException(HttpStatus.CONFLICT, 'Este caixa já foi fechado', ErrorCode.CASH_CLOSED);
      }
    }

    const note = `Devolução da venda nº ${sale.number}`;
    const created = await this.prisma.$transaction(
      async (tx) => {
        const saleReturn = await tx.saleReturn.create({
          data: {
            id: dto.id,
            saleId: sale.id,
            sessionId: dto.sessionId ?? null,
            customerId: sale.customerId,
            userId: user.id,
            authorizedById,
            reason: dto.reason,
            refundMethod: dto.refundMethod,
            refundMethodName,
            total: fromCents(totalCents),
            items: {
              create: lines.map(({ line, item, cents }) => ({
                saleItemId: item.id,
                productId: item.productId,
                productName: item.productName,
                unit: item.unit,
                quantity: line.quantity,
                amount: fromCents(cents),
                unitCost: item.unitCost,
                restock: line.restock,
              })),
            },
          },
        });

        for (const [index, { line, item }] of lines.entries()) {
          const options = { allowNegative: true, coverageDays: settings.orderCoverageDays, allowTrashed: true };
          for (const [k, part] of expandKit(item, line.quantity).entries()) {
            const suffix = part.kit ? `:${k}` : '';
            await this.stock.registerInTransaction(
              tx,
              {
                id: deterministicUuid(`return:${dto.id}:${index}${suffix}`),
                productId: part.productId,
                type: MovementType.IN_SALE_RETURN,
                quantity: part.quantity,
                note: `${note} (devolução nº ${saleReturn.number})${part.kit ? ` · kit ${item.productName}` : ''}`,
                source: MovementSource.PDV,
                userId: user.id,
              },
              options,
            );
            // Produto avariado: entra e sai como perda (fica registrado no histórico e nos relatórios).
            if (!line.restock) {
              await this.stock.registerInTransaction(
                tx,
                {
                  id: deterministicUuid(`return-loss:${dto.id}:${index}${suffix}`),
                  productId: part.productId,
                  type: MovementType.OUT_LOSS,
                  quantity: part.quantity,
                  note: `Avaria na devolução nº ${saleReturn.number}`,
                  source: MovementSource.PDV,
                  userId: user.id,
                },
                options,
              );
            }
          }
        }

        if (dto.refundMethod === RefundMethod.STORE_CREDIT) {
          const credit = await this.credits.issue(tx, {
            amount: fromCents(totalCents),
            customerId: sale.customerId,
            validityDays: settings.pos.voucherValidityDays,
            userId: user.id,
            note,
          });
          await tx.saleReturn.update({ where: { id: saleReturn.id }, data: { storeCreditId: credit.id } });
        } else if (dto.refundMethod === RefundMethod.ACCOUNT) {
          await this.receivables.reduceForReturn(tx, sale.id, totalCents);
        }
        return tx.saleReturn.findUniqueOrThrow({ where: { id: saleReturn.id }, include: returnInclude });
      },
      { timeout: 30_000 },
    );

    const view = toReturnView(created);
    await this.audit.log({
      userId: user.id,
      action: 'sale.return',
      entity: 'sale',
      entityId: sale.id,
      details: {
        saleNumber: sale.number,
        returnNumber: view.number,
        total: view.total,
        refundMethod: dto.refundMethod,
        reason: dto.reason,
        late,
        authorizedById,
        voucher: view.storeCredit?.code ?? null,
      },
      ip,
    });
    return view;
  }

  async findOne(id: string) {
    const row = await this.prisma.saleReturn.findUnique({ where: { id }, include: returnInclude });
    if (!row) throw notFound('Devolução');
    return toReturnView(row);
  }

  async list(query: ListReturnsQueryDto): Promise<Paginated<ReturnView>> {
    const where: Prisma.SaleReturnWhereInput = {
      ...(query.saleId && { saleId: query.saleId }),
      ...(query.sessionId && { sessionId: query.sessionId }),
      ...((query.from || query.to) && { createdAt: { gte: query.from, lte: query.to } }),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.saleReturn.findMany({ where, include: returnInclude, orderBy: { createdAt: 'desc' }, ...toSkipTake(query) }),
      this.prisma.saleReturn.count({ where }),
    ]);
    return { items: rows.map(toReturnView), total, page: query.page, pageSize: query.pageSize };
  }

  /** Dias inteiros entre a data da venda e hoje (no calendário local). */
  private daysSince(date: Date) {
    return Math.round((dateOnly(todayIso()).getTime() - dateOnly(localDay(date)).getTime()) / 86_400_000);
  }

  private itemStates(sale: SaleForReturn) {
    const net = netItemValues(
      sale.items.map((i) => toCents(toNumber(i.total))),
      toCents(toNumber(sale.orderDiscount)),
    );
    return sale.items.map((item, index) => ({
      item,
      state: {
        netCents: net[index],
        soldQuantity: toNumber(item.quantity),
        returnedQuantity: Math.round(item.returnItems.reduce((sum, r) => sum + toNumber(r.quantity), 0) * 1000) / 1000,
        refundedCents: item.returnItems.reduce((sum, r) => sum + toCents(toNumber(r.amount)), 0),
      },
    }));
  }
}
