/**
 * Fluxo de caixa — domínio puro, dinheiro em centavos.
 *
 *  - Venda no cartão entra na conta no dia da venda + prazo de recebimento da forma, já sem a taxa.
 *  - Até hoje é "realizado"; depois de hoje é "previsto" (cartões a receber, fiado e contas a vencer).
 *  - Saldo acumulado: soma das entradas menos as saídas, dia a dia, a partir do início do período.
 */

export interface FlowEvent {
  /** Dia em que o dinheiro entra ou sai (aaaa-mm-dd). */
  date: string;
  /** Valor em centavos (sempre positivo). */
  cents: number;
  direction: 'IN' | 'OUT';
  category: string;
}

export interface FlowDay {
  date: string;
  inRealized: number;
  outRealized: number;
  inProjected: number;
  outProjected: number;
  net: number;
  cumulative: number;
}

export interface FlowCategory {
  category: string;
  realized: number;
  projected: number;
}

const addDays = (iso: string, days: number) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);

/** Dia em que o dinheiro cai na conta (prazo de recebimento da forma de pagamento). */
export const settlementDate = (day: string, settlementDays: number) => (settlementDays > 0 ? addDays(day, settlementDays) : day);

/** Valor líquido depois da taxa da operadora. */
export const netOfFee = (cents: number, feePercent: number) => cents - Math.round((cents * feePercent) / 100);

/** Monta a série diária (todos os dias do período, mesmo sem movimento) e os totais por categoria. */
export function buildCashFlow(events: FlowEvent[], from: string, to: string, today: string) {
  const days = new Map<string, { inR: number; outR: number; inP: number; outP: number }>();
  for (let day = from; day <= to; day = addDays(day, 1)) days.set(day, { inR: 0, outR: 0, inP: 0, outP: 0 });

  const categories = { IN: new Map<string, { r: number; p: number }>(), OUT: new Map<string, { r: number; p: number }>() };
  for (const event of events) {
    const entry = days.get(event.date);
    if (!entry || event.cents <= 0) continue;
    const projected = event.date > today;
    if (event.direction === 'IN') {
      if (projected) entry.inP += event.cents;
      else entry.inR += event.cents;
    } else if (projected) entry.outP += event.cents;
    else entry.outR += event.cents;
    const cat = categories[event.direction].get(event.category) ?? { r: 0, p: 0 };
    if (projected) cat.p += event.cents;
    else cat.r += event.cents;
    categories[event.direction].set(event.category, cat);
  }

  let cumulative = 0;
  const series: FlowDay[] = [...days.entries()].map(([date, d]) => {
    const net = d.inR + d.inP - d.outR - d.outP;
    cumulative += net;
    return { date, inRealized: d.inR / 100, outRealized: d.outR / 100, inProjected: d.inP / 100, outProjected: d.outP / 100, net: net / 100, cumulative: cumulative / 100 };
  });

  const sum = (key: 'inR' | 'outR' | 'inP' | 'outP') => [...days.values()].reduce((s, d) => s + d[key], 0) / 100;
  const list = (map: Map<string, { r: number; p: number }>): FlowCategory[] =>
    [...map.entries()]
      .map(([category, v]) => ({ category, realized: v.r / 100, projected: v.p / 100 }))
      .sort((a, b) => b.realized + b.projected - (a.realized + a.projected));

  const totals = { inRealized: sum('inR'), outRealized: sum('outR'), inProjected: sum('inP'), outProjected: sum('outP') };
  return {
    days: series,
    totals: { ...totals, balance: Math.round((totals.inRealized + totals.inProjected - totals.outRealized - totals.outProjected) * 100) / 100 },
    categories: { in: list(categories.IN), out: list(categories.OUT) },
  };
}
