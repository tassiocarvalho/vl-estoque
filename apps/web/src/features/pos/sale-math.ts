/**
 * Cálculo da venda no caixa — espelho exato de apps/api/src/modules/pos/domain/sale-calculator.ts.
 * Precisa existir também no navegador porque o caixa vende sem internet.
 * Dinheiro em CENTAVOS inteiros (sem erro de arredondamento).
 */
// Caminho relativo (e não '@/'): o teste de paridade da API importa este arquivo.
import type { Discount } from '../../lib/types';

export const toCents = (reais: number) => Math.round(reais * 100);
export const fromCents = (cents: number) => cents / 100;

export class SaleRuleError extends Error {}

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

const percentOf = (part: number, base: number) => (base > 0 ? (part / base) * 100 : 0);

export interface LineInput {
  quantity: number;
  unitPrice: number;
  discount?: Discount | null;
}

export function calculateSale(items: LineInput[], orderDiscount?: Discount | null) {
  let maxDiscountPercent = 0;
  const lines = items.map((item) => {
    const grossCents = Math.round(toCents(item.unitPrice) * item.quantity);
    const itemDiscount = discountCents(grossCents, item.discount);
    maxDiscountPercent = Math.max(maxDiscountPercent, percentOf(itemDiscount, grossCents));
    return { grossCents, discountCents: itemDiscount, totalCents: grossCents - itemDiscount };
  });
  const grossCents = lines.reduce((sum, l) => sum + l.grossCents, 0);
  const itemsDiscountCents = lines.reduce((sum, l) => sum + l.discountCents, 0);
  const subtotalCents = grossCents - itemsDiscountCents;
  const orderDiscountCents = discountCents(subtotalCents, orderDiscount);
  maxDiscountPercent = Math.max(maxDiscountPercent, percentOf(orderDiscountCents, subtotalCents));
  return {
    lines,
    grossCents,
    itemsDiscountCents,
    subtotalCents,
    orderDiscountCents,
    totalCents: subtotalCents - orderDiscountCents,
    maxDiscountPercent: Math.round(maxDiscountPercent * 100) / 100,
  };
}

export interface PaymentLine {
  methodId: string;
  amount: number;
  /** Cópia da regra da forma: aceita valor maior que o devido (troco). */
  allowsChange: boolean;
}

/** Situação do pagamento enquanto o operador lança as formas (dinheiro + PIX, por exemplo). */
export function paymentStatus(totalCents: number, payments: PaymentLine[]) {
  const paidCents = payments.reduce((sum, p) => sum + toCents(p.amount), 0);
  const cashCents = payments.filter((p) => p.allowsChange).reduce((sum, p) => sum + toCents(p.amount), 0);
  const remainingCents = Math.max(totalCents - paidCents, 0);
  const changeCents = Math.max(paidCents - totalCents, 0);
  return {
    paidCents,
    remainingCents,
    changeCents,
    /** Troco só pode sair de forma que aceita troco (o dinheiro, por padrão). */
    changeFromNonCash: changeCents > cashCents,
    complete: paidCents >= totalCents && changeCents <= cashCents && payments.length > 0,
  };
}
