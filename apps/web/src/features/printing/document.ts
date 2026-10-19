/**
 * Modelo de documento impresso (comprovante, orçamento, fechamento de caixa).
 * Os "construtores" montam a lista de blocos; os "renderizadores" transformam em HTML
 * (bobina térmica 80/58 mm ou folha A4) ou em PDF — o conteúdo é o mesmo em todos os formatos.
 */
import { formatDateTime, formatMoney, formatNumber } from '@/lib/format';
import { formatDocument } from '@/lib/document';
import { CASH_MOVEMENT_LABELS, NON_FISCAL_NOTICE, REFUND_METHOD_LABELS, UNIT_SHORT } from '@/lib/labels';
import type { CashMovement, CashSession, CustomerReceipt, Sale, SaleReturn, StoreBranding, StoreCredit } from '@/lib/types';

export type Block =
  | { kind: 'logo'; src: string }
  | { kind: 'title'; text: string }
  | { kind: 'text'; text: string; align?: 'left' | 'center' | 'right'; bold?: boolean; small?: boolean }
  | { kind: 'pair'; left: string; right: string; bold?: boolean; large?: boolean }
  | { kind: 'separator' }
  | { kind: 'items'; rows: { description: string; detail: string; total: string; discount?: string }[] }
  | { kind: 'signature'; label: string }
  | { kind: 'space' };

export interface PrintDocument {
  /** Nome do arquivo PDF / título da janela de impressão. */
  title: string;
  blocks: Block[];
}

function header(store: StoreBranding, title: string, logo: string | null): Block[] {
  const blocks: Block[] = [];
  if (logo) blocks.push({ kind: 'logo', src: logo });
  blocks.push({ kind: 'title', text: store.name });
  for (const info of [store.document, store.address, store.phone, store.receiptHeader]) {
    if (info) blocks.push({ kind: 'text', text: info, align: 'center', small: true });
  }
  blocks.push(
    { kind: 'separator' },
    { kind: 'text', text: NON_FISCAL_NOTICE.toUpperCase(), align: 'center', bold: true },
    { kind: 'text', text: title, align: 'center', bold: true },
    { kind: 'separator' },
  );
  return blocks;
}

function footer(store: StoreBranding): Block[] {
  const blocks: Block[] = [{ kind: 'separator' }];
  if (store.receiptFooter) blocks.push({ kind: 'text', text: store.receiptFooter, align: 'center' });
  blocks.push({ kind: 'text', text: NON_FISCAL_NOTICE, align: 'center', small: true });
  return blocks;
}

const saleNumber = (sale: Sale) => (sale.number > 0 ? `Nº ${String(sale.number).padStart(6, '0')}` : 'OFFLINE');

/** Comprovante de venda não fiscal. */
export function saleDocument(sale: Sale, store: StoreBranding, options: { copy?: boolean; logo?: string | null } = {}): PrintDocument {
  const blocks = header(store, `COMPROVANTE DE VENDA ${saleNumber(sale)}`, options.logo ?? null);
  if (options.copy) blocks.push({ kind: 'text', text: '*** 2ª VIA ***', align: 'center', bold: true });
  if (sale.status === 'CANCELED') blocks.push({ kind: 'text', text: '*** VENDA CANCELADA ***', align: 'center', bold: true });
  if (sale.number === 0) {
    blocks.push({ kind: 'text', text: 'Registrada sem internet — o número sai na sincronização', align: 'center', small: true });
  }
  blocks.push(
    { kind: 'text', text: `${formatDateTime(sale.occurredAt)} · ${sale.session.terminal}`, small: true },
    { kind: 'text', text: `Operador: ${sale.operator.name}`, small: true },
    ...(sale.customer?.name ? [{ kind: 'text', text: `Cliente: ${sale.customer.name}`, small: true } as Block] : []),
    ...(sale.customerDocument
      ? [{ kind: 'text', text: `CPF/CNPJ do consumidor: ${formatDocument(sale.customerDocument)}`, small: true } as Block]
      : []),
    { kind: 'separator' },
    {
      kind: 'items',
      rows: sale.items.map((item) => ({
        description: `${String(item.position).padStart(3, '0')} ${item.productName}`,
        detail: `${formatNumber(item.quantity)} ${UNIT_SHORT[item.unit]} × ${formatMoney(item.unitPrice)}`,
        total: formatMoney(Math.round(item.quantity * item.unitPrice * 100) / 100),
        discount: item.discount > 0 ? `Desconto −${formatMoney(item.discount)}` : undefined,
      })),
    },
    { kind: 'separator' },
    { kind: 'pair', left: 'Subtotal', right: formatMoney(sale.grossTotal) },
  );
  const discount = sale.itemsDiscount + sale.orderDiscount;
  if (discount > 0) blocks.push({ kind: 'pair', left: 'Descontos', right: `−${formatMoney(discount)}` });
  blocks.push({ kind: 'pair', left: 'TOTAL', right: formatMoney(sale.total), bold: true, large: true });
  for (const payment of sale.payments) {
    blocks.push({ kind: 'pair', left: payment.name, right: formatMoney(payment.amount) });
    if (payment.storeCreditCode) blocks.push({ kind: 'text', text: `Vale ${payment.storeCreditCode}`, small: true });
    if (payment.kind === 'ON_ACCOUNT' && payment.installments && payment.installments > 1) {
      blocks.push({ kind: 'text', text: `Em ${payment.installments} parcelas de ${formatMoney(Math.round((payment.amount / payment.installments) * 100) / 100)}`, small: true });
    }
  }
  if (sale.change > 0) blocks.push({ kind: 'pair', left: 'Troco', right: formatMoney(sale.change), bold: true });
  if (sale.payments.some((p) => p.kind === 'ON_ACCOUNT')) blocks.push({ kind: 'space' }, { kind: 'signature', label: 'Assinatura do cliente (fiado)' });
  if (sale.status === 'CANCELED' && sale.cancelReason) {
    blocks.push({ kind: 'text', text: `Motivo do cancelamento: ${sale.cancelReason}`, small: true });
  }
  return { title: `Venda ${saleNumber(sale)}`, blocks: [...blocks, ...footer(store)] };
}

export interface QuoteData {
  items: { name: string; unit: Sale['items'][number]['unit']; quantity: number; unitPrice: number; discount: number; total: number }[];
  gross: number;
  discount: number;
  total: number;
  operator: string;
}

/** Orçamento (não reserva estoque e não é venda). */
export function quoteDocument(quote: QuoteData, store: StoreBranding, logo: string | null): PrintDocument {
  const now = new Date();
  const validUntil = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const blocks = header(store, 'ORÇAMENTO', logo);
  blocks.push(
    { kind: 'text', text: `${formatDateTime(now)} · Atendente: ${quote.operator}`, small: true },
    { kind: 'separator' },
    {
      kind: 'items',
      rows: quote.items.map((item, index) => ({
        description: `${String(index + 1).padStart(3, '0')} ${item.name}`,
        detail: `${formatNumber(item.quantity)} ${UNIT_SHORT[item.unit]} × ${formatMoney(item.unitPrice)}`,
        total: formatMoney(Math.round(item.quantity * item.unitPrice * 100) / 100),
        discount: item.discount > 0 ? `Desconto −${formatMoney(item.discount)}` : undefined,
      })),
    },
    { kind: 'separator' },
    { kind: 'pair', left: 'Subtotal', right: formatMoney(quote.gross) },
  );
  if (quote.discount > 0) blocks.push({ kind: 'pair', left: 'Descontos', right: `−${formatMoney(quote.discount)}` });
  blocks.push(
    { kind: 'pair', left: 'TOTAL', right: formatMoney(quote.total), bold: true, large: true },
    { kind: 'text', text: `Orçamento válido até ${validUntil.toLocaleDateString('pt-BR')}. Preços sujeitos a alteração e à disponibilidade de estoque.`, small: true },
  );
  return { title: 'Orçamento', blocks: [...blocks, ...footer(store)] };
}

/** Leitura parcial (caixa aberto) ou fechamento de caixa. */
export function cashReportDocument(session: CashSession, store: StoreBranding, logo: string | null): PrintDocument {
  const closed = session.status === 'CLOSED';
  const { summary } = session;
  const blocks = header(store, closed ? 'FECHAMENTO DE CAIXA' : 'LEITURA PARCIAL DO CAIXA', logo);
  blocks.push(
    { kind: 'text', text: session.terminal, bold: true },
    { kind: 'text', text: `Abertura: ${formatDateTime(session.openedAt)} (${session.openedBy.name})`, small: true },
  );
  if (closed && session.closedAt) {
    blocks.push({ kind: 'text', text: `Fechamento: ${formatDateTime(session.closedAt)} (${session.closedBy?.name ?? ''})`, small: true });
  }
  blocks.push(
    { kind: 'separator' },
    { kind: 'pair', left: 'Vendas', right: String(summary.salesCount) },
    { kind: 'pair', left: 'Vendas canceladas', right: String(summary.canceledCount) },
    { kind: 'pair', left: 'Total vendido', right: formatMoney(summary.salesTotal), bold: true },
    { kind: 'separator' },
    ...summary.methods.map((method): Block => ({ kind: 'pair', left: method.name, right: formatMoney(method.amount) })),
    { kind: 'separator' },
    ...(summary.receiptsCount
      ? [
          { kind: 'separator' } as Block,
          { kind: 'text', text: `Recebimentos de fiado (${summary.receiptsCount})`, bold: true } as Block,
          ...summary.receiptMethods.map((m): Block => ({ kind: 'pair', left: m.name, right: formatMoney(m.amount) })),
        ]
      : []),
    ...(summary.returnsCount ? [{ kind: 'pair', left: `Devoluções (${summary.returnsCount})`, right: formatMoney(summary.returnsTotal) } as Block] : []),
    { kind: 'separator' },
    { kind: 'pair', left: 'Troco inicial', right: formatMoney(summary.openingAmount) },
    { kind: 'pair', left: 'Suprimentos', right: formatMoney(summary.supplies) },
    { kind: 'pair', left: 'Sangrias', right: `−${formatMoney(summary.withdrawals)}` },
    ...(summary.cashReceipts ? [{ kind: 'pair', left: 'Fiado recebido em dinheiro', right: formatMoney(summary.cashReceipts) } as Block] : []),
    ...(summary.cashRefunds ? [{ kind: 'pair', left: 'Devolvido em dinheiro', right: `−${formatMoney(summary.cashRefunds)}` } as Block] : []),
    { kind: 'pair', left: 'Dinheiro esperado', right: formatMoney(summary.expectedCash), bold: true },
  );
  if (closed && session.countedCash !== null) {
    const difference = session.difference ?? 0;
    blocks.push(
      { kind: 'pair', left: 'Dinheiro contado', right: formatMoney(session.countedCash) },
      { kind: 'pair', left: difference < 0 ? 'Falta' : difference > 0 ? 'Sobra' : 'Diferença', right: formatMoney(Math.abs(difference)), bold: true },
    );
    if (session.closingNote) blocks.push({ kind: 'text', text: `Obs.: ${session.closingNote}`, small: true });
  }
  if (session.movements.length) {
    blocks.push({ kind: 'separator' }, { kind: 'text', text: 'Sangrias e suprimentos', bold: true });
    for (const m of session.movements) {
      blocks.push(
        { kind: 'pair', left: `${CASH_MOVEMENT_LABELS[m.type]} · ${m.user.name}`, right: formatMoney(m.amount) },
        { kind: 'text', text: m.reason, small: true },
      );
    }
  }
  blocks.push({ kind: 'space' }, { kind: 'signature', label: 'Assinatura do operador' });
  return { title: closed ? 'Fechamento de caixa' : 'Leitura do caixa', blocks: [...blocks, ...footer(store)] };
}

/** Comprovante de sangria ou suprimento. */
export function cashMovementDocument(
  movement: CashMovement & { terminal: string },
  store: StoreBranding,
  logo: string | null,
): PrintDocument {
  const label = CASH_MOVEMENT_LABELS[movement.type].toUpperCase();
  const blocks = header(store, `COMPROVANTE DE ${label}`, logo);
  blocks.push(
    { kind: 'text', text: `${formatDateTime(movement.createdAt)} · ${movement.terminal}`, small: true },
    { kind: 'text', text: `Operador: ${movement.user.name}`, small: true },
  );
  if (movement.authorizedBy) blocks.push({ kind: 'text', text: `Autorizado por: ${movement.authorizedBy.name}`, small: true });
  blocks.push(
    { kind: 'separator' },
    { kind: 'pair', left: 'Valor', right: formatMoney(movement.amount), bold: true, large: true },
    { kind: 'text', text: `Motivo: ${movement.reason}` },
    { kind: 'space' },
    { kind: 'signature', label: 'Assinatura' },
  );
  return { title: CASH_MOVEMENT_LABELS[movement.type], blocks: [...blocks, ...footer(store)] };
}

const day = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR');

/** Bloco do vale-troca (código grande para o cliente apresentar na próxima compra). */
function voucherBlocks(credit: { code: string; balance: number; expiresAt: string | null }, customer: string | null): Block[] {
  return [
    { kind: 'separator' },
    { kind: 'text', text: 'VALE-TROCA', align: 'center', bold: true },
    { kind: 'title', text: credit.code },
    { kind: 'pair', left: 'Saldo', right: formatMoney(credit.balance), bold: true, large: true },
    { kind: 'text', text: credit.expiresAt ? `Válido até ${day(credit.expiresAt)}` : 'Sem data de validade', align: 'center', small: true },
    ...(customer ? [{ kind: 'text', text: `Cliente: ${customer}`, align: 'center', small: true } as Block] : []),
    { kind: 'text', text: 'Apresente este código no caixa para usar o saldo.', align: 'center', small: true },
  ];
}

/** Comprovante de troca/devolução (com o vale-troca, quando o reembolso for em crédito). */
export function returnDocument(saleReturn: SaleReturn, store: StoreBranding, logo: string | null): PrintDocument {
  const number = `Nº ${String(saleReturn.number).padStart(6, '0')}`;
  const blocks = header(store, `COMPROVANTE DE DEVOLUÇÃO ${number}`, logo);
  blocks.push(
    { kind: 'text', text: `${formatDateTime(saleReturn.createdAt)}${saleReturn.session ? ` · ${saleReturn.session.terminal}` : ''}`, small: true },
    { kind: 'text', text: `Venda de origem: Nº ${String(saleReturn.sale.number).padStart(6, '0')} (${formatDateTime(saleReturn.sale.occurredAt)})`, small: true },
    { kind: 'text', text: `Operador: ${saleReturn.user.name}`, small: true },
    ...(saleReturn.authorizedBy ? [{ kind: 'text', text: `Autorizado por: ${saleReturn.authorizedBy.name}`, small: true } as Block] : []),
    ...(saleReturn.customer ? [{ kind: 'text', text: `Cliente: ${saleReturn.customer.name}`, small: true } as Block] : []),
    { kind: 'separator' },
    {
      kind: 'items',
      rows: saleReturn.items.map((item) => ({
        description: item.productName,
        detail: `${formatNumber(item.quantity)} ${UNIT_SHORT[item.unit]}${item.restock ? '' : ' (avariado)'}`,
        total: formatMoney(item.amount),
      })),
    },
    { kind: 'separator' },
    { kind: 'pair', left: 'TOTAL DEVOLVIDO', right: formatMoney(saleReturn.total), bold: true, large: true },
    { kind: 'pair', left: 'Reembolso', right: saleReturn.refundMethodName ?? REFUND_METHOD_LABELS[saleReturn.refundMethod] },
    { kind: 'text', text: `Motivo: ${saleReturn.reason}`, small: true },
  );
  if (saleReturn.storeCredit) blocks.push(...voucherBlocks(saleReturn.storeCredit, saleReturn.customer?.name ?? null));
  blocks.push({ kind: 'space' }, { kind: 'signature', label: 'Assinatura do cliente' });
  return { title: `Devolução ${number}`, blocks: [...blocks, ...footer(store)] };
}

/** Segunda via / consulta do vale-troca. */
export function voucherDocument(credit: StoreCredit, store: StoreBranding, logo: string | null): PrintDocument {
  const blocks = header(store, 'VALE-TROCA', logo);
  if (credit.origin) blocks.push({ kind: 'text', text: `Origem: devolução nº ${credit.origin.returnNumber} (venda nº ${credit.origin.saleNumber})`, small: true });
  blocks.push(...voucherBlocks(credit, credit.customer?.name ?? null));
  return { title: `Vale ${credit.code}`, blocks: [...blocks, ...footer(store)] };
}

/** Recibo do pagamento de fiado. */
export function receiptDocument(receipt: CustomerReceipt, store: StoreBranding, logo: string | null): PrintDocument {
  const number = `Nº ${String(receipt.number).padStart(6, '0')}`;
  const blocks = header(store, `RECIBO DE PAGAMENTO ${number}`, logo);
  blocks.push(
    { kind: 'text', text: `${formatDateTime(receipt.occurredAt)} · ${receipt.session.terminal}`, small: true },
    { kind: 'text', text: `Cliente: ${receipt.customer.name}`, bold: true },
    { kind: 'text', text: `Recebido por: ${receipt.user.name}`, small: true },
    { kind: 'separator' },
    ...receipt.allocations.map((a): Block => ({
      kind: 'pair',
      left: `${a.description}${a.installments > 1 ? ` (${a.installment}/${a.installments})` : ''}${a.dueDate ? ` · venc. ${day(a.dueDate)}` : ''}`,
      right: formatMoney(a.amount),
    })),
    { kind: 'separator' },
    { kind: 'pair', left: 'VALOR PAGO', right: formatMoney(receipt.amount), bold: true, large: true },
    { kind: 'pair', left: receipt.methodName, right: formatMoney(receipt.received) },
  );
  if (receipt.change > 0) blocks.push({ kind: 'pair', left: 'Troco', right: formatMoney(receipt.change), bold: true });
  if (receipt.balanceAfter !== null) blocks.push({ kind: 'pair', left: 'Saldo devedor restante', right: formatMoney(receipt.balanceAfter) });
  blocks.push({ kind: 'space' }, { kind: 'signature', label: 'Assinatura de quem recebeu' });
  return { title: `Recibo ${number}`, blocks: [...blocks, ...footer(store)] };
}
