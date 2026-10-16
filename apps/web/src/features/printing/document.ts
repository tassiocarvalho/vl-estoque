/**
 * Modelo de documento impresso (comprovante, orçamento, fechamento de caixa).
 * Os "construtores" montam a lista de blocos; os "renderizadores" transformam em HTML
 * (bobina térmica 80/58 mm ou folha A4) ou em PDF — o conteúdo é o mesmo em todos os formatos.
 */
import { formatDateTime, formatMoney, formatNumber } from '@/lib/format';
import { CASH_MOVEMENT_LABELS, NON_FISCAL_NOTICE, PAYMENT_LABELS, PAYMENT_METHODS, UNIT_SHORT } from '@/lib/labels';
import type { CashMovement, CashSession, Sale, StoreBranding } from '@/lib/types';

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
    blocks.push({ kind: 'pair', left: PAYMENT_LABELS[payment.method], right: formatMoney(payment.amount) });
  }
  if (sale.change > 0) blocks.push({ kind: 'pair', left: 'Troco', right: formatMoney(sale.change), bold: true });
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
    ...PAYMENT_METHODS.map((method): Block => ({ kind: 'pair', left: PAYMENT_LABELS[method], right: formatMoney(summary.byMethod[method]) })),
    { kind: 'separator' },
    { kind: 'pair', left: 'Troco inicial', right: formatMoney(summary.openingAmount) },
    { kind: 'pair', left: 'Suprimentos', right: formatMoney(summary.supplies) },
    { kind: 'pair', left: 'Sangrias', right: `−${formatMoney(summary.withdrawals)}` },
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
