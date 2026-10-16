import { describe, expect, it } from 'vitest';
import { cashDifference, summarizeCashSession } from './cash-summary';

describe('summarizeCashSession', () => {
  const sales = [
    { canceled: false, total: 43.2, change: 6.8, payments: [{ method: 'CASH' as const, amount: 50 }] },
    {
      canceled: false,
      total: 50,
      change: 0,
      payments: [
        { method: 'CASH' as const, amount: 20 },
        { method: 'PIX' as const, amount: 30 },
      ],
    },
    { canceled: false, total: 12.5, change: 0, payments: [{ method: 'CREDIT_CARD' as const, amount: 12.5 }] },
    { canceled: true, total: 99, change: 0, payments: [{ method: 'CASH' as const, amount: 99 }] },
  ];

  it('totaliza por forma de pagamento, descontando o troco do dinheiro', () => {
    const summary = summarizeCashSession(100, sales, []);
    expect(summary.byMethod).toEqual({ CASH: 63.2, PIX: 30, CREDIT_CARD: 12.5, DEBIT_CARD: 0 });
    expect(summary.salesTotal).toBe(105.7);
    expect(summary.salesCount).toBe(3);
    expect(summary.canceledCount).toBe(1);
  });

  it('ignora vendas canceladas e considera suprimentos e sangrias no dinheiro esperado', () => {
    const summary = summarizeCashSession(100, sales, [
      { type: 'SUPPLY', amount: 50 },
      { type: 'WITHDRAWAL', amount: 120 },
    ]);
    // 100 + 50 − 120 + 63,20
    expect(summary.expectedCash).toBe(93.2);
    expect(summary.supplies).toBe(50);
    expect(summary.withdrawals).toBe(120);
  });

  it('turno sem vendas espera apenas o troco inicial', () => {
    expect(summarizeCashSession(150, [], []).expectedCash).toBe(150);
  });
});

describe('cashDifference', () => {
  it('negativo é falta e positivo é sobra, sem erro de arredondamento', () => {
    expect(cashDifference(93.1, 93.2)).toBe(-0.1);
    expect(cashDifference(100.3, 100.1)).toBe(0.2);
    expect(cashDifference(10, 10)).toBe(0);
  });
});
