/**
 * Custo das mercadorias que entram por nota — domínio puro, dinheiro em centavos.
 *
 *   custo do item          = valor do item + parte do (frete + outras despesas − desconto), proporcional ao valor
 *   custo por unidade      = custo do item ÷ (quantidade × fator de conversão)
 *   custo médio ponderado  = (saldo × custo médio + qtd que entrou × custo de entrada) ÷ (saldo + qtd)
 *
 * Com saldo zero ou negativo, o custo médio passa a ser o custo da entrada.
 */

export const toCents = (reais: number) => Math.round(reais * 100);
export const fromCents = (cents: number) => cents / 100;
const round4 = (value: number) => Math.round(value * 10_000) / 10_000;

/**
 * Rateia um valor (frete + despesas − desconto; pode ser negativo) entre os itens, proporcional ao valor
 * de cada um. Usa o maior resto: a soma das partes é exatamente o valor rateado.
 */
export function allocateProportionally(itemCents: number[], amountCents: number): number[] {
  if (itemCents.length === 0 || amountCents === 0) return itemCents.map(() => 0);
  const base = itemCents.reduce((sum, value) => sum + value, 0);
  // Itens sem valor (bonificação): rateio igual entre todos.
  const weights = base > 0 ? itemCents : itemCents.map(() => 1);
  const weightTotal = base > 0 ? base : itemCents.length;

  const sign = Math.sign(amountCents);
  const absolute = Math.abs(amountCents);
  const exact = weights.map((w) => (absolute * w) / weightTotal);
  const parts = exact.map(Math.floor);
  let rest = absolute - parts.reduce((sum, p) => sum + p, 0);
  const order = exact.map((value, index) => ({ index, fraction: value - Math.floor(value) })).sort((a, b) => b.fraction - a.fraction);
  for (const { index } of order) {
    if (rest <= 0) break;
    parts[index]++;
    rest--;
  }
  return parts.map((p) => p * sign);
}

export interface InvoiceLine {
  /** Quantidade na unidade da nota. */
  quantity: number;
  /** Unidades do produto em cada unidade da nota. */
  factor: number;
  /** Valor do item na nota (R$). */
  total: number;
}

export interface CostedLine {
  /** Quantidade que entra no estoque (na unidade do produto). */
  stockQuantity: number;
  /** Custo total do item com o rateio (R$). */
  cost: number;
  /** Custo por unidade do produto (4 casas). */
  unitCost: number;
}

export class CostingError extends Error {}

/** Custo de entrada de cada item da nota, com frete, despesas e desconto rateados. */
export function costInvoice(lines: InvoiceLine[], extras: { freight: number; otherCosts: number; discount: number }): CostedLine[] {
  const itemCents = lines.map((line) => toCents(line.total));
  const extraCents = toCents(extras.freight) + toCents(extras.otherCosts) - toCents(extras.discount);
  const allocated = allocateProportionally(itemCents, extraCents);
  return lines.map((line, index) => {
    const stockQuantity = Math.round(line.quantity * line.factor * 1000) / 1000;
    if (!(stockQuantity > 0)) throw new CostingError(`Item ${index + 1}: quantidade inválida`);
    const costCents = itemCents[index] + allocated[index];
    if (costCents < 0) throw new CostingError(`Item ${index + 1}: o desconto rateado ficou maior que o valor do item`);
    return { stockQuantity, cost: fromCents(costCents), unitCost: round4(fromCents(costCents) / stockQuantity) };
  });
}

/** Novo custo médio depois de uma entrada. */
export function weightedAverageCost(stockBefore: number, averageCost: number, quantity: number, unitCost: number): number {
  if (stockBefore <= 0 || averageCost <= 0) return round4(unitCost);
  return round4((stockBefore * averageCost + quantity * unitCost) / (stockBefore + quantity));
}

/**
 * Divide um valor em parcelas iguais (a diferença de centavos fica na primeira), com vencimentos a cada
 * `intervalDays` a partir de `firstDue` (aaaa-mm-dd).
 */
export function splitInstallments(total: number, count: number, firstDue: string, intervalDays = 30) {
  if (!(count >= 1)) throw new CostingError('Número de parcelas inválido');
  const totalCents = toCents(total);
  const base = Math.floor(totalCents / count);
  const first = totalCents - base * (count - 1);
  const start = new Date(`${firstDue}T12:00:00Z`);
  return Array.from({ length: count }, (_, index) => {
    const due = new Date(start.getTime() + index * intervalDays * 86_400_000);
    return { installment: index + 1, dueDate: due.toISOString().slice(0, 10), amount: fromCents(index === 0 ? first : base) };
  });
}
