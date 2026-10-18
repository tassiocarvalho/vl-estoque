import { describe, expect, it } from 'vitest';
import { allocateProportionally, CostingError, costInvoice, splitInstallments, weightedAverageCost } from './costing';

describe('rateio proporcional', () => {
  it('a soma das partes é exatamente o valor rateado', () => {
    const parts = allocateProportionally([10000, 10000, 10000], 100);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(100);
    expect(parts.sort()).toEqual([33, 33, 34]);
  });

  it('desconto (valor negativo) também é rateado', () => {
    expect(allocateProportionally([30000, 10000], -400)).toEqual([-300, -100]);
  });

  it('itens sem valor (bonificação) dividem igualmente', () => {
    expect(allocateProportionally([0, 0], 101).reduce((a, b) => a + b, 0)).toBe(101);
  });
});

describe('custo da nota', () => {
  it('rateia frete, despesas e desconto e converte para a unidade do produto', () => {
    // Fardo com 6 unidades: 2 fardos = 12 unidades.
    const [arroz, feijao] = costInvoice(
      [
        { quantity: 2, factor: 6, total: 241 },
        { quantity: 10, factor: 1, total: 80 },
      ],
      { freight: 15, otherCosts: 5, discount: 6 },
    );
    expect(arroz.stockQuantity).toBe(12);
    expect(feijao.stockQuantity).toBe(10);
    expect(arroz.cost + feijao.cost).toBeCloseTo(335, 2);
    expect(arroz.unitCost).toBeCloseTo(arroz.cost / 12, 4);
  });

  it('recusa desconto maior que o item', () => {
    expect(() => costInvoice([{ quantity: 1, factor: 1, total: 1 }], { freight: 0, otherCosts: 0, discount: 5 })).toThrow(CostingError);
  });
});

describe('custo médio ponderado', () => {
  it('pondera saldo anterior e entrada', () => {
    // 10 a R$ 5,00 + 30 a R$ 7,00 = 40 a R$ 6,50
    expect(weightedAverageCost(10, 5, 30, 7)).toBe(6.5);
  });

  it('sem saldo (ou negativo), vale o custo da entrada', () => {
    expect(weightedAverageCost(0, 5, 10, 7.25)).toBe(7.25);
    expect(weightedAverageCost(-3, 5, 10, 7.25)).toBe(7.25);
  });
});

describe('parcelas', () => {
  it('divide em parcelas iguais com a diferença de centavos na primeira', () => {
    expect(splitInstallments(100, 3, '2026-11-10')).toEqual([
      { installment: 1, dueDate: '2026-11-10', amount: 33.34 },
      { installment: 2, dueDate: '2026-12-10', amount: 33.33 },
      { installment: 3, dueDate: '2027-01-09', amount: 33.33 },
    ]);
  });
});
