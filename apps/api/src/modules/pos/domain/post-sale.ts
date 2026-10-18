/**
 * Regras do pós-venda — domínio puro, dinheiro em centavos.
 *
 *  - Devolução: o cliente recebe o que de fato pagou pelo item. O desconto no total da venda é rateado
 *    entre os itens (maior resto), então devolver tudo devolve exatamente o total da venda.
 *  - Recebimento de fiado: abate das parcelas mais antigas para as mais novas.
 */
import { randomInt } from 'node:crypto';
import { allocateProportionally } from '../../purchases/domain/costing';

export class PostSaleError extends Error {}

/** Quanto o cliente pagou por cada item (total do item menos a parte do desconto no total). */
export function netItemValues(itemTotalsCents: number[], orderDiscountCents: number): number[] {
  const discount = allocateProportionally(itemTotalsCents, orderDiscountCents);
  return itemTotalsCents.map((total, index) => total - discount[index]);
}

export interface ItemReturnState {
  /** Valor líquido pago pelo item inteiro. */
  netCents: number;
  soldQuantity: number;
  returnedQuantity: number;
  refundedCents: number;
}

const EPSILON = 0.0005;

/** Quantidade que ainda pode ser devolvida. */
export const returnableQuantity = (item: ItemReturnState) =>
  Math.max(Math.round((item.soldQuantity - item.returnedQuantity) * 1000) / 1000, 0);

/**
 * Reembolso por devolver `quantity` do item. A última devolução do item leva o restante exato
 * (sem sobrar nem faltar centavo por arredondamento).
 */
export function refundForItem(item: ItemReturnState, quantity: number): number {
  if (!(quantity > 0)) throw new PostSaleError('Quantidade a devolver inválida');
  const available = returnableQuantity(item);
  if (quantity > available + EPSILON) {
    throw new PostSaleError(`Só restam ${available.toLocaleString('pt-BR')} para devolver deste item`);
  }
  if (Math.abs(quantity - available) < EPSILON) return item.netCents - item.refundedCents;
  return Math.min(Math.round((item.netCents * quantity) / item.soldQuantity), item.netCents - item.refundedCents);
}

export interface OpenInstallment {
  id: string;
  /** Saldo em aberto da parcela. */
  dueCents: number;
}

/** Distribui um recebimento entre as parcelas (já ordenadas da mais antiga para a mais nova). */
export function allocateReceipt(installments: OpenInstallment[], amountCents: number) {
  if (!(amountCents > 0)) throw new PostSaleError('Valor do recebimento inválido');
  const totalDue = installments.reduce((sum, i) => sum + i.dueCents, 0);
  if (amountCents > totalDue) throw new PostSaleError('O valor é maior que o saldo devedor do cliente');
  const allocations: { id: string; cents: number }[] = [];
  let rest = amountCents;
  for (const installment of installments) {
    if (rest <= 0) break;
    const cents = Math.min(rest, installment.dueCents);
    if (cents > 0) allocations.push({ id: installment.id, cents });
    rest -= cents;
  }
  return allocations;
}

/**
 * Abate uma devolução do fiado da venda: começa pela última parcela (a que vence por último),
 * sem mexer no que já foi pago.
 */
export function reduceInstallments(installments: OpenInstallment[], amountCents: number) {
  const totalDue = installments.reduce((sum, i) => sum + i.dueCents, 0);
  if (amountCents > totalDue) {
    throw new PostSaleError('O valor é maior que o fiado em aberto desta venda');
  }
  return allocateReceipt([...installments].reverse(), amountCents);
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Código do vale-troca: fácil de ditar, sem 0/O nem 1/I (ex.: VT-7KQ3M9XP). */
export function voucherCode(): string {
  let code = '';
  for (let i = 0; i < 8; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return `VT-${code}`;
}

/** Situação do vale para a tela e o caixa. */
export function creditStatus(credit: { balanceCents: number; expiresAt: string | null; canceled: boolean }, today: string) {
  if (credit.canceled) return 'CANCELED' as const;
  if (credit.balanceCents <= 0) return 'USED' as const;
  if (credit.expiresAt && credit.expiresAt < today) return 'EXPIRED' as const;
  return 'ACTIVE' as const;
}
