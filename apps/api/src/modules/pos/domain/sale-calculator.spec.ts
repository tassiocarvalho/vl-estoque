import { describe, expect, it } from 'vitest';
import { calculateSale, discountCents, SaleRuleError, settlePayments } from './sale-calculator';

describe('discountCents', () => {
  it('aplica desconto em valor fixo', () => {
    expect(discountCents(1000, { type: 'AMOUNT', value: 2.5 })).toBe(250);
  });

  it('aplica desconto percentual com arredondamento ao centavo', () => {
    expect(discountCents(999, { type: 'PERCENT', value: 10 })).toBe(100);
  });

  it('não aceita desconto maior que o valor', () => {
    expect(() => discountCents(500, { type: 'AMOUNT', value: 6 })).toThrow(SaleRuleError);
    expect(() => discountCents(500, { type: 'PERCENT', value: 101 })).toThrow(SaleRuleError);
  });

  it('desconto vazio ou zero não altera o valor', () => {
    expect(discountCents(500, null)).toBe(0);
    expect(discountCents(500, { type: 'PERCENT', value: 0 })).toBe(0);
  });
});

describe('calculateSale', () => {
  it('soma itens sem erro de ponto flutuante', () => {
    const totals = calculateSale([
      { quantity: 1, unitPrice: 0.1 },
      { quantity: 1, unitPrice: 0.2 },
    ]);
    expect(totals.totalCents).toBe(30);
  });

  it('calcula venda por peso (quilo) arredondando ao centavo', () => {
    // 0,755 kg × R$ 12,99 = R$ 9,80745 → R$ 9,81
    const totals = calculateSale([{ quantity: 0.755, unitPrice: 12.99 }]);
    expect(totals.totalCents).toBe(981);
  });

  it('aplica desconto por item e no total, nessa ordem', () => {
    const totals = calculateSale(
      [
        { quantity: 2, unitPrice: 10, discount: { type: 'AMOUNT', value: 2 } }, // 20 − 2 = 18
        { quantity: 1, unitPrice: 30 }, // 30
      ],
      { type: 'PERCENT', value: 10 }, // 48 − 4,80
    );
    expect(totals.grossCents).toBe(5000);
    expect(totals.itemsDiscountCents).toBe(200);
    expect(totals.subtotalCents).toBe(4800);
    expect(totals.orderDiscountCents).toBe(480);
    expect(totals.totalCents).toBe(4320);
    expect(totals.maxDiscountPercent).toBe(10);
  });

  it('informa o maior percentual de desconto concedido', () => {
    const totals = calculateSale([{ quantity: 1, unitPrice: 10, discount: { type: 'AMOUNT', value: 2.5 } }]);
    expect(totals.maxDiscountPercent).toBe(25);
  });

  it('rejeita venda vazia e quantidade inválida', () => {
    expect(() => calculateSale([])).toThrow(SaleRuleError);
    expect(() => calculateSale([{ quantity: 0, unitPrice: 1 }])).toThrow(SaleRuleError);
  });
});

describe('settlePayments', () => {
  it('aceita vários pagamentos na mesma venda (dinheiro + PIX)', () => {
    expect(settlePayments(5000, [
      { method: 'CASH', amount: 20 },
      { method: 'PIX', amount: 30 },
    ])).toEqual({ paidCents: 5000, changeCents: 0 });
  });

  it('calcula o troco do dinheiro', () => {
    expect(settlePayments(4320, [{ method: 'CASH', amount: 50 }])).toEqual({ paidCents: 5000, changeCents: 680 });
  });

  it('dinheiro + cartão com troco só do dinheiro', () => {
    expect(settlePayments(4500, [
      { method: 'CREDIT_CARD', amount: 30 },
      { method: 'CASH', amount: 20 },
    ])).toEqual({ paidCents: 5000, changeCents: 500 });
  });

  it('bloqueia pagamento insuficiente', () => {
    expect(() => settlePayments(5000, [{ method: 'PIX', amount: 49.99 }])).toThrow(SaleRuleError);
  });

  it('bloqueia troco vindo de PIX ou cartão', () => {
    expect(() => settlePayments(5000, [{ method: 'DEBIT_CARD', amount: 60 }])).toThrow(/Troco/);
  });
});
