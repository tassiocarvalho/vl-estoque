import { describe, expect, it } from 'vitest';
import { buildCashFlow, netOfFee, settlementDate } from './cash-flow';

describe('fluxo de caixa', () => {
  it('cartão de crédito cai em D+30 já sem a taxa', () => {
    expect(settlementDate('2026-10-10', 30)).toBe('2026-11-09');
    expect(settlementDate('2026-10-10', 0)).toBe('2026-10-10');
    // R$ 100,00 com 3,49% de taxa = R$ 96,51
    expect(netOfFee(10000, 3.49)).toBe(9651);
  });

  it('separa realizado (até hoje) de previsto e acumula o saldo dia a dia', () => {
    const flow = buildCashFlow(
      [
        { date: '2026-10-01', cents: 50000, direction: 'IN', category: 'Vendas · Dinheiro' },
        { date: '2026-10-02', cents: 20000, direction: 'OUT', category: 'Aluguel' },
        { date: '2026-10-04', cents: 9651, direction: 'IN', category: 'Vendas · Cartão de crédito' },
        { date: '2026-10-04', cents: 5000, direction: 'OUT', category: 'Energia' },
        { date: '2026-11-30', cents: 999, direction: 'IN', category: 'fora do período' },
      ],
      '2026-10-01',
      '2026-10-04',
      '2026-10-02',
    );
    expect(flow.days.map((d) => d.date)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
    expect(flow.days.map((d) => d.cumulative)).toEqual([500, 300, 300, 346.51]);
    expect(flow.totals).toEqual({ inRealized: 500, outRealized: 200, inProjected: 96.51, outProjected: 50, balance: 346.51 });
    expect(flow.categories.in[0]).toEqual({ category: 'Vendas · Dinheiro', realized: 500, projected: 0 });
    expect(flow.categories.out.map((c) => c.category)).toEqual(['Aluguel', 'Energia']);
  });
});
