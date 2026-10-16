/**
 * O caixa calcula a venda no navegador (para vender sem internet) e a API recalcula ao receber.
 * Este teste garante que as duas implementações dão SEMPRE o mesmo resultado.
 */
import { describe, expect, it } from 'vitest';
import * as browser from '../../../../../web/src/features/pos/sale-math';
import { calculateSale, Discount, discountCents } from './sale-calculator';

/** Gerador pseudoaleatório com semente fixa: o teste é reproduzível. */
function random(seed: number) {
  return () => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31;
    return seed / 2 ** 31;
  };
}

describe('paridade do cálculo: navegador × servidor', () => {
  it('dá o mesmo resultado em 2.000 vendas aleatórias', () => {
    const next = random(2026);
    const price = () => Math.round(next() * 20_000) / 100; // até R$ 200,00
    const quantity = () => (next() < 0.3 ? Math.round(next() * 3000) / 1000 + 0.001 : Math.ceil(next() * 12));
    const discount = (base: number): Discount | null => {
      const roll = next();
      if (roll < 0.6) return null;
      if (roll < 0.8) return { type: 'PERCENT', value: Math.round(next() * 5000) / 100 };
      return { type: 'AMOUNT', value: Math.round(next() * base * 50) / 100 };
    };

    for (let i = 0; i < 2000; i++) {
      const items = Array.from({ length: 1 + Math.floor(next() * 6) }, () => {
        const item = { quantity: quantity(), unitPrice: price() };
        return { ...item, discount: discount(item.unitPrice * item.quantity) };
      });
      const order = discount(10);
      let server: unknown;
      let client: unknown;
      try {
        server = calculateSale(items, order);
      } catch (error) {
        server = (error as Error).message;
      }
      try {
        client = browser.calculateSale(items, order);
      } catch (error) {
        client = (error as Error).message;
      }
      // O servidor chama as linhas de "items" e o navegador de "lines": compara o conteúdo.
      const comparable = (value: unknown) => {
        if (typeof value === 'string') return value;
        const { items: serverRows, lines: clientRows, ...totals } = value as Record<string, unknown>;
        return { ...totals, rows: serverRows ?? clientRows };
      };
      expect(comparable(client)).toEqual(comparable(server));
    }
  });

  it('descontos idênticos, inclusive nos limites', () => {
    for (const [base, d] of [
      [999, { type: 'PERCENT', value: 10 }],
      [500, { type: 'AMOUNT', value: 5 }],
      [1, { type: 'PERCENT', value: 50 }],
    ] as [number, Discount][]) {
      expect(browser.discountCents(base, d)).toBe(discountCents(base, d));
    }
  });
});
