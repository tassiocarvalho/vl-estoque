/**
 * Cálculo da venda — domínio puro, sem banco nem framework.
 *
 * Todo dinheiro é tratado em CENTAVOS inteiros: somar R$ 0,10 + R$ 0,20 dá exatamente R$ 0,30.
 * Quantidades têm até 3 casas (venda por quilo).
 *
 *   total do item  = preço × quantidade − desconto do item
 *   subtotal       = Σ totais dos itens
 *   total da venda = subtotal − desconto no total
 *   troco          = pago − total   (só pode sair do dinheiro)
 */

export type DiscountKind = 'AMOUNT' | 'PERCENT';
export type PaymentMethodKind = 'CASH' | 'PIX' | 'CREDIT_CARD' | 'DEBIT_CARD';

export interface Discount {
  type: DiscountKind;
  /** R$ (AMOUNT) ou % (PERCENT). */
  value: number;
}

export interface SaleItemInput {
  quantity: number;
  unitPrice: number;
  discount?: Discount | null;
}

export interface CalculatedItem {
  grossCents: number;
  discountCents: number;
  totalCents: number;
}

export interface SaleTotals {
  items: CalculatedItem[];
  grossCents: number;
  itemsDiscountCents: number;
  /** Soma dos itens já com os descontos de item. */
  subtotalCents: number;
  orderDiscountCents: number;
  totalCents: number;
  /** Maior percentual de desconto concedido (item ou total) — usado no controle de permissão. */
  maxDiscountPercent: number;
}

export class SaleRuleError extends Error {}

export const toCents = (reais: number) => Math.round(reais * 100);
export const fromCents = (cents: number) => cents / 100;

/** Valor do desconto em centavos, nunca maior que a base nem negativo. */
export function discountCents(baseCents: number, discount?: Discount | null): number {
  if (!discount || discount.value <= 0 || baseCents <= 0) return 0;
  if (discount.type === 'PERCENT') {
    if (discount.value > 100) throw new SaleRuleError('O desconto não pode passar de 100%');
    return Math.min(Math.round((baseCents * discount.value) / 100), baseCents);
  }
  const cents = toCents(discount.value);
  if (cents > baseCents) throw new SaleRuleError('O desconto não pode ser maior que o valor');
  return cents;
}

const percentOf = (partCents: number, baseCents: number) => (baseCents > 0 ? (partCents / baseCents) * 100 : 0);

export function calculateSale(items: SaleItemInput[], orderDiscount?: Discount | null): SaleTotals {
  if (items.length === 0) throw new SaleRuleError('A venda não tem itens');

  let maxDiscountPercent = 0;
  const calculated = items.map((item) => {
    if (!(item.quantity > 0)) throw new SaleRuleError('Quantidade inválida');
    if (item.unitPrice < 0) throw new SaleRuleError('Preço inválido');
    const grossCents = Math.round(toCents(item.unitPrice) * item.quantity);
    const itemDiscount = discountCents(grossCents, item.discount);
    maxDiscountPercent = Math.max(maxDiscountPercent, percentOf(itemDiscount, grossCents));
    return { grossCents, discountCents: itemDiscount, totalCents: grossCents - itemDiscount };
  });

  const grossCents = calculated.reduce((sum, item) => sum + item.grossCents, 0);
  const itemsDiscountCents = calculated.reduce((sum, item) => sum + item.discountCents, 0);
  const subtotalCents = grossCents - itemsDiscountCents;
  const orderDiscountCents = discountCents(subtotalCents, orderDiscount);
  maxDiscountPercent = Math.max(maxDiscountPercent, percentOf(orderDiscountCents, subtotalCents));

  return {
    items: calculated,
    grossCents,
    itemsDiscountCents,
    subtotalCents,
    orderDiscountCents,
    totalCents: subtotalCents - orderDiscountCents,
    maxDiscountPercent: Math.round(maxDiscountPercent * 100) / 100,
  };
}

export interface PaymentInput {
  method: PaymentMethodKind;
  amount: number;
}

export interface Settlement {
  paidCents: number;
  changeCents: number;
}

/**
 * Confere os pagamentos (podem ser vários na mesma venda, ex.: R$ 20 em dinheiro + R$ 30 no PIX):
 *  - a soma precisa cobrir o total;
 *  - só o dinheiro gera troco (PIX e cartão não podem passar do que falta pagar).
 */
export function settlePayments(totalCents: number, payments: PaymentInput[]): Settlement {
  if (payments.length === 0) throw new SaleRuleError('Informe a forma de pagamento');
  if (payments.some((p) => !(p.amount > 0))) throw new SaleRuleError('Valor de pagamento inválido');

  const paidCents = payments.reduce((sum, p) => sum + toCents(p.amount), 0);
  if (paidCents < totalCents) throw new SaleRuleError('O valor pago não cobre o total da venda');

  const changeCents = paidCents - totalCents;
  const cashCents = payments.filter((p) => p.method === 'CASH').reduce((sum, p) => sum + toCents(p.amount), 0);
  if (changeCents > cashCents) {
    throw new SaleRuleError('Troco só pode ser dado em dinheiro: o valor em PIX/cartão passa do total');
  }
  return { paidCents, changeCents };
}
