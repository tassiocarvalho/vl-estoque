import { HttpStatus, Injectable } from '@nestjs/common';
import { CashMovementType, CashSessionStatus, Prisma, SaleStatus } from '@prisma/client';
import { AuthUser } from '../../common/auth/auth-user';
import { hasPermission, Permission } from '../../common/auth/permissions';
import { toNumber } from '../../common/decimal';
import { AppException, badRequest, ErrorCode, notFound } from '../../common/errors';
import { toJson } from '../../common/json';
import { Paginated, toSkipTake } from '../../common/pagination';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { cashDifference, CashSummary, normalizeCashSummary, summarizeCashSession } from './domain/cash-summary';
import { CashMovementDto, CloseCashDto, ListCashSessionsQueryDto, OpenCashDto } from './pos.dto';
import { SupervisorAuthorizationService } from './supervisor-authorization.service';

const sessionInclude = {
  openedBy: { select: { id: true, name: true } },
  closedBy: { select: { id: true, name: true } },
  movements: {
    orderBy: { createdAt: 'asc' },
    include: { user: { select: { id: true, name: true } }, authorizedBy: { select: { id: true, name: true } } },
  },
} satisfies Prisma.CashSessionInclude;

type SessionWithRelations = Prisma.CashSessionGetPayload<{ include: typeof sessionInclude }>;

const cashClosed = (message = 'Este caixa já foi fechado') =>
  new AppException(HttpStatus.CONFLICT, message, ErrorCode.CASH_CLOSED);

@Injectable()
export class CashService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly authorization: SupervisorAuthorizationService,
  ) {}

  /** Turno aberto do terminal (com o resumo em tempo real) ou null. */
  async current(terminal: string) {
    const session = await this.prisma.cashSession.findFirst({
      where: { terminal, status: CashSessionStatus.OPEN },
      include: sessionInclude,
    });
    return session ? this.toView(session, await this.summarize(session)) : null;
  }

  async open(dto: OpenCashDto, user: AuthUser, ip: string) {
    const existing = await this.prisma.cashSession.findFirst({
      where: { terminal: dto.terminal, status: CashSessionStatus.OPEN },
    });
    if (existing) throw badRequest(`O terminal "${dto.terminal}" já tem um caixa aberto`);

    let session: SessionWithRelations;
    try {
      session = await this.prisma.cashSession.create({
        data: { terminal: dto.terminal, openingAmount: dto.openingAmount, openedById: user.id },
        include: sessionInclude,
      });
    } catch (error) {
      // Dois cliques simultâneos: o índice único do banco barra o segundo.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw badRequest(`O terminal "${dto.terminal}" já tem um caixa aberto`);
      }
      throw error;
    }

    await this.audit.log({
      userId: user.id,
      action: 'cash.open',
      entity: 'cash',
      entityId: session.id,
      details: { terminal: dto.terminal, openingAmount: dto.openingAmount },
      ip,
    });
    return this.toView(session, await this.summarize(session));
  }

  /** Sangria (retirada) ou suprimento (entrada) de dinheiro, sempre com justificativa. */
  async addMovement(sessionId: string, dto: CashMovementDto, user: AuthUser, token: string | undefined, ip: string) {
    const session = await this.findOpen(sessionId);
    const label = dto.type === CashMovementType.WITHDRAWAL ? 'A sangria' : 'O suprimento';
    const authorizedById = await this.authorization.resolve(user, Permission.CASH_MOVEMENT, token, { reason: label });

    if (dto.type === CashMovementType.WITHDRAWAL) {
      const { expectedCash } = await this.summarize(session);
      if (dto.amount > expectedCash) {
        throw badRequest(`Sangria maior que o dinheiro esperado na gaveta (${expectedCash.toFixed(2).replace('.', ',')})`);
      }
    }

    const movement = await this.prisma.cashMovement.create({
      data: { sessionId, type: dto.type, amount: dto.amount, reason: dto.reason, userId: user.id, authorizedById },
      include: { user: { select: { id: true, name: true } }, authorizedBy: { select: { id: true, name: true } } },
    });

    await this.audit.log({
      userId: user.id,
      action: dto.type === CashMovementType.WITHDRAWAL ? 'cash.withdrawal' : 'cash.supply',
      entity: 'cash',
      entityId: sessionId,
      details: { amount: dto.amount, reason: dto.reason, authorizedById },
      ip,
    });
    return { ...movement, amount: toNumber(movement.amount), terminal: session.terminal };
  }

  /** Fecha o turno: congela o resumo e a diferença entre o dinheiro contado e o esperado. */
  async close(sessionId: string, dto: CloseCashDto, user: AuthUser, ip: string) {
    const session = await this.findOpen(sessionId);
    const summary = await this.summarize(session);
    const difference = cashDifference(dto.countedCash, summary.expectedCash);

    const { count } = await this.prisma.cashSession.updateMany({
      where: { id: sessionId, status: CashSessionStatus.OPEN },
      data: {
        status: CashSessionStatus.CLOSED,
        closedById: user.id,
        closedAt: new Date(),
        expectedCash: summary.expectedCash,
        countedCash: dto.countedCash,
        difference,
        closingSummary: toJson(summary),
        closingNote: dto.note,
      },
    });
    if (count === 0) throw cashClosed();

    await this.audit.log({
      userId: user.id,
      action: 'cash.close',
      entity: 'cash',
      entityId: sessionId,
      details: { terminal: session.terminal, expectedCash: summary.expectedCash, countedCash: dto.countedCash, difference },
      ip,
    });
    return this.report(sessionId, user);
  }

  async list(query: ListCashSessionsQueryDto): Promise<Paginated<ReturnType<CashService['toListView']>>> {
    const where: Prisma.CashSessionWhereInput =
      query.from || query.to ? { openedAt: { gte: query.from, lte: query.to } } : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.cashSession.findMany({
        where,
        include: {
          openedBy: { select: { id: true, name: true } },
          closedBy: { select: { id: true, name: true } },
          _count: { select: { sales: true } },
        },
        orderBy: { openedAt: 'desc' },
        ...toSkipTake(query),
      }),
      this.prisma.cashSession.count({ where }),
    ]);
    return { items: items.map((s) => this.toListView(s)), total, page: query.page, pageSize: query.pageSize };
  }

  /** Relatório do turno (abertura, vendas por forma de pagamento, sangrias e fechamento) — usado na reimpressão. */
  async report(sessionId: string, user: AuthUser) {
    const session = await this.prisma.cashSession.findUnique({ where: { id: sessionId }, include: sessionInclude });
    if (!session) throw notFound('Caixa');
    const canSeeAll = hasPermission(user.role, Permission.SALES_READ);
    if (!canSeeAll && session.status === CashSessionStatus.CLOSED && session.openedById !== user.id) {
      throw notFound('Caixa');
    }
    const summary =
      session.status === CashSessionStatus.CLOSED && session.closingSummary
        ? normalizeCashSummary(session.closingSummary)
        : await this.summarize(session);
    return this.toView(session, summary);
  }

  async findOpen(sessionId: string) {
    const session = await this.prisma.cashSession.findUnique({ where: { id: sessionId } });
    if (!session) throw notFound('Caixa');
    if (session.status !== CashSessionStatus.OPEN) throw cashClosed();
    return session;
  }

  /** Dinheiro que deveria estar na gaveta agora (sangria e devolução em dinheiro não podem passar disso). */
  async expectedCash(sessionId: string) {
    const session = await this.findOpen(sessionId);
    return (await this.summarize(session)).expectedCash;
  }

  private async summarize(session: { id: string; openingAmount: Prisma.Decimal }) {
    const [sales, movements, activeMethods, receipts, refunds] = await Promise.all([
      this.prisma.sale.findMany({
        where: { sessionId: session.id },
        select: {
          status: true,
          total: true,
          change: true,
          payments: { select: { paymentMethodId: true, methodName: true, methodKind: true, amount: true } },
        },
      }),
      this.prisma.cashMovement.findMany({ where: { sessionId: session.id }, select: { type: true, amount: true } }),
      this.prisma.paymentMethod.findMany({ where: { active: true }, orderBy: [{ position: 'asc' }, { name: 'asc' }] }),
      this.prisma.customerReceipt.findMany({
        where: { sessionId: session.id },
        select: { paymentMethodId: true, methodName: true, methodKind: true, amount: true },
      }),
      this.prisma.saleReturn.findMany({ where: { sessionId: session.id }, select: { refundMethod: true, total: true } }),
    ]);
    return summarizeCashSession(
      toNumber(session.openingAmount),
      sales.map((sale) => ({
        canceled: sale.status === SaleStatus.CANCELED,
        total: toNumber(sale.total),
        change: toNumber(sale.change),
        payments: sale.payments.map((p) => ({
          id: p.paymentMethodId,
          name: p.methodName,
          kind: p.methodKind,
          amount: toNumber(p.amount),
        })),
      })),
      movements.map((m) => ({ type: m.type, amount: toNumber(m.amount) })),
      activeMethods.map((m) => ({ id: m.id, name: m.name, kind: m.kind })),
      {
        receipts: receipts.map((r) => ({ method: { id: r.paymentMethodId, name: r.methodName, kind: r.methodKind }, amount: toNumber(r.amount) })),
        refunds: refunds.map((r) => ({ refundMethod: r.refundMethod, total: toNumber(r.total) })),
      },
    );
  }

  private toView(session: SessionWithRelations, summary: CashSummary) {
    return {
      id: session.id,
      terminal: session.terminal,
      status: session.status,
      openingAmount: toNumber(session.openingAmount),
      openedAt: session.openedAt,
      openedBy: session.openedBy,
      closedAt: session.closedAt,
      closedBy: session.closedBy,
      expectedCash: session.expectedCash === null ? null : toNumber(session.expectedCash),
      countedCash: session.countedCash === null ? null : toNumber(session.countedCash),
      difference: session.difference === null ? null : toNumber(session.difference),
      closingNote: session.closingNote,
      summary,
      movements: session.movements.map((m) => ({
        id: m.id,
        type: m.type,
        amount: toNumber(m.amount),
        reason: m.reason,
        user: m.user,
        authorizedBy: m.authorizedBy,
        createdAt: m.createdAt,
      })),
    };
  }

  private toListView(
    session: Prisma.CashSessionGetPayload<{
      include: { openedBy: { select: { id: true; name: true } }; closedBy: { select: { id: true; name: true } }; _count: { select: { sales: true } } };
    }>,
  ) {
    const summary = session.closingSummary as unknown as CashSummary | null;
    return {
      id: session.id,
      terminal: session.terminal,
      status: session.status,
      openingAmount: toNumber(session.openingAmount),
      openedAt: session.openedAt,
      openedBy: session.openedBy,
      closedAt: session.closedAt,
      closedBy: session.closedBy,
      salesCount: session._count.sales,
      salesTotal: summary?.salesTotal ?? null,
      expectedCash: session.expectedCash === null ? null : toNumber(session.expectedCash),
      countedCash: session.countedCash === null ? null : toNumber(session.countedCash),
      difference: session.difference === null ? null : toNumber(session.difference),
    };
  }
}
