/**
 * Resumo do turno de caixa — domínio puro.
 *
 *   dinheiro esperado na gaveta = troco inicial + suprimentos − sangrias + dinheiro recebido − troco devolvido
 *   diferença                   = dinheiro contado − dinheiro esperado   (negativo = falta, positivo = sobra)
 *
 * As formas de pagamento são configuráveis: o que entra na gaveta é o que tem natureza CASH (dinheiro).
 * O troco sempre sai da gaveta, qualquer que seja a forma que o gerou.
 */
import { toCents } from './sale-calculator';

export type PaymentKindName = 'CASH' | 'PIX' | 'CREDIT_CARD' | 'DEBIT_CARD' | 'VOUCHER' | 'CHECK' | 'OTHER';

export interface MethodRef {
  id: string;
  name: string;
  kind: PaymentKindName;
}

export interface SessionSale {
  canceled: boolean;
  total: number;
  change: number;
  payments: (MethodRef & { amount: number })[];
}

export interface SessionCashMovement {
  type: 'SUPPLY' | 'WITHDRAWAL';
  amount: number;
}

export interface MethodTotal extends MethodRef {
  /** Valor líquido recebido (no dinheiro, já sem o troco devolvido). */
  amount: number;
}

export interface CashSummary {
  openingAmount: number;
  salesCount: number;
  canceledCount: number;
  salesTotal: number;
  /** Totais por forma de pagamento (inclui as formas ativas, mesmo zeradas, para a conferência). */
  methods: MethodTotal[];
  /** Dinheiro recebido nas vendas, já sem o troco. */
  cashSales: number;
  supplies: number;
  withdrawals: number;
  expectedCash: number;
}

const fromCents = (cents: number) => cents / 100;

/**
 * @param methods formas a listar (em ordem) mesmo sem movimento — normalmente as ativas.
 */
export function summarizeCashSession(
  openingAmount: number,
  sales: SessionSale[],
  movements: SessionCashMovement[],
  methods: MethodRef[] = [],
): CashSummary {
  const totals = new Map<string, MethodRef & { cents: number }>();
  for (const method of methods) totals.set(method.id, { ...method, cents: 0 });

  let salesTotalCents = 0;
  let changeCents = 0;
  let salesCount = 0;
  let canceledCount = 0;

  for (const sale of sales) {
    if (sale.canceled) {
      canceledCount++;
      continue;
    }
    salesCount++;
    salesTotalCents += toCents(sale.total);
    changeCents += toCents(sale.change);
    for (const payment of sale.payments) {
      const entry = totals.get(payment.id) ?? { id: payment.id, name: payment.name, kind: payment.kind, cents: 0 };
      entry.cents += toCents(payment.amount);
      totals.set(payment.id, entry);
    }
  }

  // O troco sai da gaveta: é descontado do dinheiro.
  const cash = [...totals.values()].find((t) => t.kind === 'CASH');
  const cashReceivedCents = [...totals.values()].filter((t) => t.kind === 'CASH').reduce((s, t) => s + t.cents, 0);
  if (cash) cash.cents -= changeCents;

  const suppliesCents = movements.filter((m) => m.type === 'SUPPLY').reduce((s, m) => s + toCents(m.amount), 0);
  const withdrawalsCents = movements.filter((m) => m.type === 'WITHDRAWAL').reduce((s, m) => s + toCents(m.amount), 0);
  const cashSalesCents = cashReceivedCents - changeCents;
  const expectedCashCents = toCents(openingAmount) + suppliesCents - withdrawalsCents + cashSalesCents;

  return {
    openingAmount,
    salesCount,
    canceledCount,
    salesTotal: fromCents(salesTotalCents),
    methods: [...totals.values()].map(({ cents, ...method }) => ({ ...method, amount: fromCents(cents) })),
    cashSales: fromCents(cashSalesCents),
    supplies: fromCents(suppliesCents),
    withdrawals: fromCents(withdrawalsCents),
    expectedCash: fromCents(expectedCashCents),
  };
}

export const cashDifference = (counted: number, expected: number) => fromCents(toCents(counted) - toCents(expected));

/** Nomes das formas antigas (antes de serem configuráveis), para ler fechamentos gravados no formato anterior. */
const LEGACY_METHODS: Record<string, MethodRef> = {
  CASH: { id: 'CASH', name: 'Dinheiro', kind: 'CASH' },
  PIX: { id: 'PIX', name: 'PIX', kind: 'PIX' },
  CREDIT_CARD: { id: 'CREDIT_CARD', name: 'Cartão de crédito', kind: 'CREDIT_CARD' },
  DEBIT_CARD: { id: 'DEBIT_CARD', name: 'Cartão de débito', kind: 'DEBIT_CARD' },
};

/** Converte um resumo de fechamento gravado no formato antigo (byMethod como objeto) para o atual. */
export function normalizeCashSummary(stored: unknown): CashSummary {
  const summary = stored as CashSummary & { byMethod?: Record<string, number> };
  if (Array.isArray(summary.methods)) return summary;
  const byMethod = summary.byMethod ?? {};
  const { byMethod: _legacy, ...rest } = summary;
  void _legacy;
  return {
    ...rest,
    methods: Object.entries(byMethod).map(([code, amount]) => ({ ...(LEGACY_METHODS[code] ?? { id: code, name: code, kind: 'OTHER' }), amount })),
    cashSales: byMethod.CASH ?? 0,
  };
}
