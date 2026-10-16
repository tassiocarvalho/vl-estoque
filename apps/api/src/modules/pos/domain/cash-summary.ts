/**
 * Resumo do turno de caixa — domínio puro.
 *
 *   dinheiro esperado na gaveta = troco inicial + suprimentos − sangrias + dinheiro recebido − troco devolvido
 *   diferença                   = dinheiro contado − dinheiro esperado   (negativo = falta, positivo = sobra)
 */
import { PaymentMethodKind, toCents } from './sale-calculator';

export const PAYMENT_METHODS: PaymentMethodKind[] = ['CASH', 'PIX', 'CREDIT_CARD', 'DEBIT_CARD'];

export interface SessionSale {
  canceled: boolean;
  total: number;
  change: number;
  payments: { method: PaymentMethodKind; amount: number }[];
}

export interface SessionCashMovement {
  type: 'SUPPLY' | 'WITHDRAWAL';
  amount: number;
}

export interface CashSummary {
  openingAmount: number;
  salesCount: number;
  canceledCount: number;
  salesTotal: number;
  /** Valor líquido recebido por forma de pagamento (dinheiro já sem o troco). */
  byMethod: Record<PaymentMethodKind, number>;
  supplies: number;
  withdrawals: number;
  expectedCash: number;
}

const fromCents = (cents: number) => cents / 100;

export function summarizeCashSession(
  openingAmount: number,
  sales: SessionSale[],
  movements: SessionCashMovement[],
): CashSummary {
  const byMethodCents = Object.fromEntries(PAYMENT_METHODS.map((m) => [m, 0])) as Record<PaymentMethodKind, number>;
  let salesTotalCents = 0;
  let salesCount = 0;
  let canceledCount = 0;

  for (const sale of sales) {
    if (sale.canceled) {
      canceledCount++;
      continue;
    }
    salesCount++;
    salesTotalCents += toCents(sale.total);
    for (const payment of sale.payments) byMethodCents[payment.method] += toCents(payment.amount);
    byMethodCents.CASH -= toCents(sale.change);
  }

  const suppliesCents = movements.filter((m) => m.type === 'SUPPLY').reduce((s, m) => s + toCents(m.amount), 0);
  const withdrawalsCents = movements.filter((m) => m.type === 'WITHDRAWAL').reduce((s, m) => s + toCents(m.amount), 0);
  const expectedCashCents = toCents(openingAmount) + suppliesCents - withdrawalsCents + byMethodCents.CASH;

  return {
    openingAmount,
    salesCount,
    canceledCount,
    salesTotal: fromCents(salesTotalCents),
    byMethod: Object.fromEntries(PAYMENT_METHODS.map((m) => [m, fromCents(byMethodCents[m])])) as Record<
      PaymentMethodKind,
      number
    >,
    supplies: fromCents(suppliesCents),
    withdrawals: fromCents(withdrawalsCents),
    expectedCash: fromCents(expectedCashCents),
  };
}

export const cashDifference = (counted: number, expected: number) => fromCents(toCents(counted) - toCents(expected));
