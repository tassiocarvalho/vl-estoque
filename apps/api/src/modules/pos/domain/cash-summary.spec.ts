import { describe, expect, it } from 'vitest';
import { cashDifference, normalizeCashSummary, summarizeCashSession } from './cash-summary';

const CASH = { id: 'm-cash', name: 'Dinheiro', kind: 'CASH' as const };
const PIX = { id: 'm-pix', name: 'PIX', kind: 'PIX' as const };
const CREDIT = { id: 'm-credit', name: 'Cartão de crédito', kind: 'CREDIT_CARD' as const };
const DEBIT = { id: 'm-debit', name: 'Cartão de débito', kind: 'DEBIT_CARD' as const };
const VR = { id: 'm-vr', name: 'Vale-refeição', kind: 'VOUCHER' as const };

const amountOf = (summary: ReturnType<typeof summarizeCashSession>, id: string) =>
  summary.methods.find((m) => m.id === id)?.amount;

describe('summarizeCashSession', () => {
  const sales = [
    { canceled: false, total: 43.2, change: 6.8, payments: [{ ...CASH, amount: 50 }] },
    { canceled: false, total: 50, change: 0, payments: [{ ...CASH, amount: 20 }, { ...PIX, amount: 30 }] },
    { canceled: false, total: 12.5, change: 0, payments: [{ ...CREDIT, amount: 12.5 }] },
    { canceled: true, total: 99, change: 0, payments: [{ ...CASH, amount: 99 }] },
  ];

  it('totaliza por forma de pagamento, descontando o troco do dinheiro', () => {
    const summary = summarizeCashSession(100, sales, [], [CASH, PIX, CREDIT, DEBIT]);
    expect(amountOf(summary, CASH.id)).toBe(63.2);
    expect(amountOf(summary, PIX.id)).toBe(30);
    expect(amountOf(summary, CREDIT.id)).toBe(12.5);
    expect(amountOf(summary, DEBIT.id)).toBe(0); // forma ativa sem movimento aparece zerada
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
    expect(summary.cashSales).toBe(63.2);
  });

  it('formas novas (vale) aparecem no resumo e não entram na gaveta', () => {
    const summary = summarizeCashSession(0, [{ canceled: false, total: 30, change: 0, payments: [{ ...VR, amount: 30 }] }], []);
    expect(amountOf(summary, VR.id)).toBe(30);
    expect(summary.expectedCash).toBe(0);
  });

  it('troco gerado por outra forma (ex.: cheque) também sai da gaveta', () => {
    const check = { id: 'm-check', name: 'Cheque', kind: 'CHECK' as const };
    const summary = summarizeCashSession(50, [{ canceled: false, total: 80, change: 20, payments: [{ ...check, amount: 100 }] }], [], [CASH]);
    expect(summary.expectedCash).toBe(30);
  });

  it('turno sem vendas espera apenas o troco inicial', () => {
    expect(summarizeCashSession(150, [], []).expectedCash).toBe(150);
  });
});

describe('normalizeCashSummary', () => {
  it('converte fechamentos gravados no formato antigo', () => {
    const legacy = { openingAmount: 100, salesCount: 1, canceledCount: 0, salesTotal: 50, byMethod: { CASH: 20, PIX: 30, CREDIT_CARD: 0, DEBIT_CARD: 0 }, supplies: 0, withdrawals: 0, expectedCash: 120 };
    const summary = normalizeCashSummary(legacy);
    expect(summary.methods.find((m) => m.kind === 'PIX')).toMatchObject({ name: 'PIX', amount: 30 });
    expect(summary.cashSales).toBe(20);
    expect('byMethod' in summary).toBe(false);
  });
});

describe('cashDifference', () => {
  it('negativo é falta e positivo é sobra, sem erro de arredondamento', () => {
    expect(cashDifference(93.1, 93.2)).toBe(-0.1);
    expect(cashDifference(100.3, 100.1)).toBe(0.2);
    expect(cashDifference(10, 10)).toBe(0);
  });
});
