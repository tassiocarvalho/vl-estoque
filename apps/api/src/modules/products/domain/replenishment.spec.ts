import { describe, expect, it } from 'vitest';
import { calculateIndicators, classifyStock, needsReorder, suggestOrderQuantity } from './replenishment';

// Pão de forma: vende em média 20/dia, no máximo 30/dia, fornecedor entrega em 3 dias.
const breadProfile = { avgDailyConsumption: 20, maxDailyConsumption: 30, leadTimeDays: 3 };

describe('calculateIndicators', () => {
  it('calcula EM, ES e PP conforme as fórmulas do documento', () => {
    expect(calculateIndicators(breadProfile)).toEqual({
      minimumStock: 60, // 20 × 3
      safetyStock: 30, // (30 − 20) × 3
      reorderPoint: 90, // 60 + 30
    });
  });

  it('não gera estoque de segurança negativo se o máximo informado for menor que a média', () => {
    const indicators = calculateIndicators({ avgDailyConsumption: 10, maxDailyConsumption: 5, leadTimeDays: 2 });
    expect(indicators.safetyStock).toBe(0);
    expect(indicators.reorderPoint).toBe(20);
  });

  it('mantém precisão de 3 casas para itens vendidos a granel (kg)', () => {
    const indicators = calculateIndicators({ avgDailyConsumption: 1.1, maxDailyConsumption: 1.3, leadTimeDays: 3 });
    expect(indicators).toEqual({ minimumStock: 3.3, safetyStock: 0.6, reorderPoint: 3.9 });
  });
});

describe('classifyStock', () => {
  const indicators = calculateIndicators(breadProfile);

  it.each([
    [0, 'OUT_OF_STOCK'],
    [-2, 'OUT_OF_STOCK'],
    [30, 'CRITICAL'],
    [31, 'REORDER'],
    [90, 'REORDER'],
    [91, 'OK'],
  ])('saldo %d → %s', (stock, expected) => {
    expect(classifyStock(stock, indicators)).toBe(expected);
  });

  it('indica reposição ao atingir o ponto de pedido', () => {
    expect(needsReorder(90, indicators)).toBe(true);
    expect(needsReorder(91, indicators)).toBe(false);
  });
});

describe('suggestOrderQuantity', () => {
  it('sugere repor até cobrir o lead time + dias de cobertura + estoque de segurança', () => {
    // alvo = 30 + 20 × (3 + 7) = 230 → 230 − 90 = 140
    expect(suggestOrderQuantity(90, breadProfile, 7)).toBe(140);
  });

  it('nunca sugere quantidade negativa', () => {
    expect(suggestOrderQuantity(1000, breadProfile, 7)).toBe(0);
  });

  it('arredonda para cima', () => {
    expect(suggestOrderQuantity(0, { avgDailyConsumption: 1.1, maxDailyConsumption: 1.3, leadTimeDays: 1 }, 1)).toBe(3);
  });
});
