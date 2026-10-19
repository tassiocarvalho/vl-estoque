import { Injectable } from '@nestjs/common';
import { MovementType, PayableStatus, PaymentKind, ReceivableStatus, RefundMethod, SaleStatus } from '@prisma/client';
import { toNumber } from '../../common/decimal';
import { badRequest } from '../../common/errors';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MERCHANDISE_CATEGORY } from '../purchases/invoices.service';
import { addDays, dateOnly, isoDate, localDay, todayIso } from './dates';
import { buildCashFlow, FlowEvent, netOfFee, settlementDate } from './domain/cash-flow';

/** Formas que não são dinheiro entrando: o vale abate crédito já dado e o fiado vira conta a receber. */
const NOT_MONEY: PaymentKind[] = [PaymentKind.STORE_CREDIT, PaymentKind.ON_ACCOUNT];
const MAX_DAYS = 366;
const cents = (value: number) => Math.round(value * 100);
const reais = (value: number) => value / 100;

/** Começo e fim (UTC) de um período de dias locais, para filtrar colunas de data e hora. */
function bounds(from: string, to: string) {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T23:59:59.999`);
  return { start, end };
}

@Injectable()
export class FinanceReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private period(from?: string, to?: string, defaults?: () => { from: string; to: string }) {
    const fallback = defaults?.() ?? { from: `${todayIso().slice(0, 7)}-01`, to: todayIso() };
    const range = { from: from ?? fallback.from, to: to ?? fallback.to };
    if (range.from > range.to) throw badRequest('A data inicial deve ser anterior à final');
    if ((dateOnly(range.to).getTime() - dateOnly(range.from).getTime()) / 86_400_000 > MAX_DAYS) {
      throw badRequest(`O período máximo é de ${MAX_DAYS} dias`);
    }
    return range;
  }

  /**
   * Fluxo de caixa (RF25): o que entrou e saiu (realizado) e o que vai entrar e sair (previsto),
   * dia a dia. Vendas no cartão caem no prazo da forma, sem a taxa; fiado e contas pelo vencimento.
   */
  async cashFlow(query: { from?: string; to?: string }) {
    const today = todayIso();
    const { from, to } = this.period(query.from, query.to, () => ({ from: `${today.slice(0, 7)}-01`, to: addDays(today, 30) }));
    const methods = await this.prisma.paymentMethod.findMany();
    const methodById = new Map(methods.map((m) => [m.id, m]));
    const maxSettlement = Math.max(0, ...methods.map((m) => m.settlementDays));
    // Vendas de antes do período podem cair na conta dentro dele (prazo do cartão).
    const salesFrom = bounds(addDays(from, -maxSettlement), to).start;
    const { start, end } = bounds(from, to);

    const [sales, receipts, receivables, payables, refunds] = await Promise.all([
      this.prisma.sale.findMany({
        where: { status: SaleStatus.COMPLETED, occurredAt: { gte: salesFrom, lte: end } },
        select: { occurredAt: true, change: true, payments: { select: { paymentMethodId: true, methodName: true, methodKind: true, amount: true } } },
      }),
      this.prisma.customerReceipt.findMany({
        where: { occurredAt: { gte: salesFrom, lte: end } },
        select: { occurredAt: true, amount: true, paymentMethodId: true, methodName: true },
      }),
      this.prisma.receivable.findMany({
        where: { status: ReceivableStatus.OPEN },
        select: { dueDate: true, amount: true, paidAmount: true },
      }),
      this.prisma.payable.findMany({
        where: {
          OR: [
            { status: PayableStatus.PAID, paidAt: { gte: dateOnly(from), lte: dateOnly(to) } },
            { status: PayableStatus.OPEN },
          ],
        },
        select: { status: true, dueDate: true, paidAt: true, amount: true, paidAmount: true, category: { select: { name: true } } },
      }),
      this.prisma.saleReturn.findMany({
        where: { createdAt: { gte: start, lte: end }, refundMethod: { in: [RefundMethod.CASH, RefundMethod.ORIGINAL] } },
        select: { createdAt: true, total: true },
      }),
    ]);

    const events: FlowEvent[] = [];
    let feesCents = 0;
    for (const sale of sales) {
      const day = localDay(sale.occurredAt);
      let change = cents(toNumber(sale.change));
      for (const payment of sale.payments) {
        if (NOT_MONEY.includes(payment.methodKind)) continue;
        let amount = cents(toNumber(payment.amount));
        // O troco sai do dinheiro entregue.
        if (payment.methodKind === PaymentKind.CASH && change > 0) {
          const used = Math.min(change, amount);
          amount -= used;
          change -= used;
        }
        const method = methodById.get(payment.paymentMethodId);
        const net = netOfFee(amount, toNumber(method?.feePercent));
        feesCents += amount - net;
        events.push({ date: settlementDate(day, method?.settlementDays ?? 0), cents: net, direction: 'IN', category: `Vendas · ${payment.methodName}` });
      }
    }
    for (const receipt of receipts) {
      const method = methodById.get(receipt.paymentMethodId);
      const amount = cents(toNumber(receipt.amount));
      events.push({
        date: settlementDate(localDay(receipt.occurredAt), method?.settlementDays ?? 0),
        cents: netOfFee(amount, toNumber(method?.feePercent)),
        direction: 'IN',
        category: 'Fiado recebido',
      });
    }

    let overdueReceivables = 0;
    for (const r of receivables) {
      const balance = cents(toNumber(r.amount)) - cents(toNumber(r.paidAmount));
      const due = isoDate(r.dueDate)!;
      if (due < today) overdueReceivables += balance;
      else events.push({ date: due, cents: balance, direction: 'IN', category: 'Fiado a receber' });
    }

    let overduePayables = 0;
    for (const p of payables) {
      if (p.status === PayableStatus.PAID) {
        events.push({ date: isoDate(p.paidAt)!, cents: cents(toNumber(p.paidAmount ?? p.amount)), direction: 'OUT', category: p.category.name });
        continue;
      }
      const due = isoDate(p.dueDate)!;
      if (due < today) overduePayables += cents(toNumber(p.amount));
      else events.push({ date: due, cents: cents(toNumber(p.amount)), direction: 'OUT', category: p.category.name });
    }
    for (const r of refunds) {
      events.push({ date: localDay(r.createdAt), cents: cents(toNumber(r.total)), direction: 'OUT', category: 'Devoluções a clientes' });
    }

    const flow = buildCashFlow(events, from, to, today);
    return {
      period: { from, to },
      today,
      ...flow,
      overdue: { receivables: reais(overdueReceivables), payables: reais(overduePayables) },
      cardFees: reais(feesCents),
    };
  }

  /**
   * Resultado do período (DRE gerencial): vendas − devoluções − custo das mercadorias vendidas
   * − taxas de cartão − perdas de estoque − despesas = resultado. Compra de mercadoria não é despesa:
   * ela vira custo quando a mercadoria é vendida (CMV pelo custo médio).
   */
  async result(query: { from?: string; to?: string }) {
    const { from, to } = this.period(query.from, query.to);
    const { start, end } = bounds(from, to);
    const methods = await this.prisma.paymentMethod.findMany();
    const feeById = new Map(methods.map((m) => [m.id, toNumber(m.feePercent)]));

    const [sales, returns, losses, payables, openReceivables] = await Promise.all([
      this.prisma.sale.findMany({
        where: { status: SaleStatus.COMPLETED, occurredAt: { gte: start, lte: end } },
        select: {
          grossTotal: true,
          itemsDiscount: true,
          orderDiscount: true,
          total: true,
          change: true,
          items: { select: { unitCost: true, quantity: true } },
          payments: { select: { paymentMethodId: true, methodKind: true, amount: true } },
        },
      }),
      this.prisma.saleReturn.findMany({
        where: { createdAt: { gte: start, lte: end } },
        select: { total: true, items: { select: { unitCost: true, quantity: true, restock: true } } },
      }),
      this.prisma.stockMovement.findMany({
        where: { type: MovementType.OUT_LOSS, occurredAt: { gte: start, lte: end } },
        select: { quantity: true, product: { select: { costPrice: true } } },
      }),
      this.prisma.payable.findMany({
        where: { status: { not: PayableStatus.CANCELED }, dueDate: { gte: dateOnly(from), lte: dateOnly(to) } },
        select: { amount: true, paidAmount: true, status: true, category: { select: { name: true, code: true } } },
      }),
      this.prisma.receivable.aggregate({ where: { status: ReceivableStatus.OPEN }, _sum: { amount: true, paidAmount: true } }),
    ]);

    let grossCents = 0;
    let discountCents = 0;
    let revenueCents = 0;
    let cmvCents = 0;
    let feesCents = 0;
    for (const sale of sales) {
      grossCents += cents(toNumber(sale.grossTotal));
      discountCents += cents(toNumber(sale.itemsDiscount)) + cents(toNumber(sale.orderDiscount));
      revenueCents += cents(toNumber(sale.total));
      cmvCents += sale.items.reduce((sum, i) => sum + Math.round(toNumber(i.unitCost) * toNumber(i.quantity) * 100), 0);
      for (const p of sale.payments) {
        if (NOT_MONEY.includes(p.methodKind) || p.methodKind === PaymentKind.CASH) continue;
        const amount = cents(toNumber(p.amount));
        feesCents += amount - netOfFee(amount, feeById.get(p.paymentMethodId) ?? 0);
      }
    }
    const returnsCents = returns.reduce((sum, r) => sum + cents(toNumber(r.total)), 0);
    const returnedCostCents = returns.reduce(
      (sum, r) => sum + r.items.filter((i) => i.restock).reduce((s, i) => s + Math.round(toNumber(i.unitCost) * toNumber(i.quantity) * 100), 0),
      0,
    );
    const lossesCents = losses.reduce((sum, m) => sum + Math.round(toNumber(m.product.costPrice) * toNumber(m.quantity) * 100), 0);

    const expenses = new Map<string, number>();
    let purchasesCents = 0;
    for (const p of payables) {
      const value = cents(toNumber(p.status === PayableStatus.PAID ? (p.paidAmount ?? p.amount) : p.amount));
      if (p.category.code === MERCHANDISE_CATEGORY) {
        purchasesCents += value;
        continue;
      }
      expenses.set(p.category.name, (expenses.get(p.category.name) ?? 0) + value);
    }
    const expensesCents = [...expenses.values()].reduce((a, b) => a + b, 0);

    const netRevenue = revenueCents - returnsCents;
    const cmv = cmvCents - returnedCostCents;
    const grossProfit = netRevenue - cmv;
    const result = grossProfit - feesCents - lossesCents - expensesCents;
    const percent = (value: number) => (netRevenue > 0 ? Math.round((value / netRevenue) * 1000) / 10 : 0);

    return {
      period: { from, to },
      salesCount: sales.length,
      lines: {
        grossSales: reais(grossCents),
        discounts: reais(discountCents),
        sales: reais(revenueCents),
        returns: reais(returnsCents),
        netRevenue: reais(netRevenue),
        cmv: reais(cmv),
        grossProfit: reais(grossProfit),
        grossMargin: percent(grossProfit),
        cardFees: reais(feesCents),
        losses: reais(lossesCents),
        expenses: reais(expensesCents),
        result: reais(result),
        resultMargin: percent(result),
      },
      expenses: [...expenses.entries()].map(([category, value]) => ({ category, amount: reais(value), percent: percent(value) })).sort((a, b) => b.amount - a.amount),
      info: {
        merchandisePurchases: reais(purchasesCents),
        openReceivables: reais(cents(toNumber(openReceivables._sum.amount)) - cents(toNumber(openReceivables._sum.paidAmount))),
      },
    };
  }
}
