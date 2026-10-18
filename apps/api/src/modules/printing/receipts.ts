/**
 * Layout dos comprovantes NÃO FISCAIS na bobina térmica (ESC/POS).
 * Todo comprovante traz a menção obrigatória "Documento Não Fiscal — Sem Valor Fiscal".
 */
import { formatDocument } from '../../common/document';
import type { CashSummary } from '../pos/domain/cash-summary';
import type { SaleView } from '../pos/sale.view';
import type { StoreBranding } from '../settings/settings.types';
import { EscPosBuilder } from './escpos';

export const NON_FISCAL_NOTICE = 'DOCUMENTO NÃO FISCAL - SEM VALOR FISCAL';


const money = (value: number) => `R$ ${value.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
const quantity = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
const dateTime = (value: Date | string) =>
  new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

function header(doc: EscPosBuilder, store: StoreBranding, title: string) {
  doc.align('center').bold(true).large(true).line(store.name).large(false).bold(false);
  for (const info of [store.document, store.address, store.phone, store.receiptHeader]) {
    if (info) doc.wrapped(info);
  }
  doc.separator().bold(true).wrapped(NON_FISCAL_NOTICE).bold(false).line(title).separator().align('left');
}

function footer(doc: EscPosBuilder, store: StoreBranding) {
  doc.separator().align('center');
  if (store.receiptFooter) doc.wrapped(store.receiptFooter);
  doc.wrapped(NON_FISCAL_NOTICE).newline().align('left');
}

export function saleReceipt(
  sale: SaleView,
  store: StoreBranding,
  columns: number,
  options: { copy?: boolean; openDrawer?: boolean } = {},
) {
  const doc = new EscPosBuilder(columns);
  if (options.openDrawer) doc.openDrawer();
  header(doc, store, `COMPROVANTE DE VENDA Nº ${String(sale.number).padStart(6, '0')}`);
  if (options.copy) doc.align('center').bold(true).line('*** 2ª VIA ***').bold(false).align('left');
  if (sale.status === 'CANCELED') doc.align('center').bold(true).line('*** VENDA CANCELADA ***').bold(false).align('left');

  doc.line(`${dateTime(sale.occurredAt)}  ${sale.session.terminal}`).line(`Operador: ${sale.operator.name}`);
  if (sale.customer?.name) doc.wrapped(`Cliente: ${sale.customer.name}`);
  if (sale.customerDocument) doc.line(`CPF/CNPJ do consumidor: ${formatDocument(sale.customerDocument)}`);
  doc.separator();

  for (const item of sale.items) {
    doc.wrapped(`${String(item.position).padStart(3, '0')} ${item.productName}`);
    doc.pair(`    ${quantity(item.quantity)} ${item.unit} x ${money(item.unitPrice)}`, money(item.quantity * item.unitPrice));
    if (item.discount > 0) doc.pair('    Desconto', `-${money(item.discount)}`);
  }

  doc.separator().pair('Subtotal', money(sale.grossTotal));
  const discount = sale.itemsDiscount + sale.orderDiscount;
  if (discount > 0) doc.pair('Descontos', `-${money(discount)}`);
  doc.bold(true).large(true).pair('TOTAL', money(sale.total)).large(false).bold(false);

  for (const payment of sale.payments) {
    doc.pair(payment.name, money(payment.amount));
    if (payment.storeCreditCode) doc.line(`    Vale ${payment.storeCreditCode}`);
    if (payment.kind === 'ON_ACCOUNT' && payment.installments && payment.installments > 1) doc.line(`    Em ${payment.installments} parcelas`);
  }
  if (sale.change > 0) doc.bold(true).pair('Troco', money(sale.change)).bold(false);
  if (sale.payments.some((p) => p.kind === 'ON_ACCOUNT')) {
    doc.newline(2).align('center').line('_'.repeat(Math.min(columns, 32))).line('Assinatura do cliente (fiado)').align('left');
  }

  footer(doc, store);
  return doc.cut().build();
}

export interface CashReportData {
  terminal: string;
  status: 'OPEN' | 'CLOSED';
  openedAt: Date | string;
  openedBy: { name: string };
  closedAt: Date | string | null;
  closedBy: { name: string } | null;
  countedCash: number | null;
  difference: number | null;
  closingNote: string | null;
  summary: CashSummary;
  movements: { type: 'SUPPLY' | 'WITHDRAWAL'; amount: number; reason: string; user: { name: string } }[];
}

export function cashReport(session: CashReportData, store: StoreBranding, columns: number) {
  const doc = new EscPosBuilder(columns);
  const closed = session.status === 'CLOSED';
  header(doc, store, closed ? 'FECHAMENTO DE CAIXA' : 'LEITURA PARCIAL DO CAIXA');

  doc.line(session.terminal).line(`Abertura: ${dateTime(session.openedAt)} (${session.openedBy.name})`);
  if (closed && session.closedAt) doc.line(`Fechamento: ${dateTime(session.closedAt)} (${session.closedBy?.name ?? ''})`);

  const { summary } = session;
  doc.separator().pair('Vendas', String(summary.salesCount)).pair('Canceladas', String(summary.canceledCount));
  doc.pair('Total vendido', money(summary.salesTotal)).separator();
  for (const method of summary.methods) doc.pair(method.name, money(method.amount));
  if (summary.receiptsCount) {
    doc.separator().line(`Recebimentos de fiado (${summary.receiptsCount}):`);
    for (const method of summary.receiptMethods) doc.pair(`  ${method.name}`, money(method.amount));
  }
  if (summary.returnsCount) doc.pair(`Devoluções (${summary.returnsCount})`, money(summary.returnsTotal));
  doc.separator().pair('Troco inicial', money(summary.openingAmount));
  doc.pair('Suprimentos', money(summary.supplies)).pair('Sangrias', `-${money(summary.withdrawals)}`);
  if (summary.cashReceipts) doc.pair('Fiado recebido em dinheiro', money(summary.cashReceipts));
  if (summary.cashRefunds) doc.pair('Devolvido em dinheiro', `-${money(summary.cashRefunds)}`);
  doc.bold(true).pair('Dinheiro esperado', money(summary.expectedCash)).bold(false);

  if (closed && session.countedCash !== null) {
    doc.pair('Dinheiro contado', money(session.countedCash));
    const difference = session.difference ?? 0;
    const label = difference < 0 ? 'Falta' : difference > 0 ? 'Sobra' : 'Diferença';
    doc.bold(true).pair(label, money(Math.abs(difference))).bold(false);
    if (session.closingNote) doc.wrapped(`Obs.: ${session.closingNote}`);
  }

  if (session.movements.length) {
    doc.separator().line('Sangrias e suprimentos:');
    for (const m of session.movements) {
      doc.pair(`${m.type === 'WITHDRAWAL' ? 'Sangria' : 'Suprimento'} (${m.user.name})`, money(m.amount));
      doc.wrapped(`  ${m.reason}`);
    }
  }

  doc.newline(2).align('center').line('_'.repeat(Math.min(columns, 32))).line('Assinatura do operador');
  footer(doc, store);
  return doc.cut().build();
}

export function cashMovementReceipt(
  movement: { type: 'SUPPLY' | 'WITHDRAWAL'; amount: number; reason: string; createdAt: Date | string; user: { name: string }; authorizedBy: { name: string } | null; terminal: string },
  store: StoreBranding,
  columns: number,
) {
  const doc = new EscPosBuilder(columns);
  header(doc, store, movement.type === 'WITHDRAWAL' ? 'COMPROVANTE DE SANGRIA' : 'COMPROVANTE DE SUPRIMENTO');
  doc.line(`${dateTime(movement.createdAt)}  ${movement.terminal}`).line(`Operador: ${movement.user.name}`);
  if (movement.authorizedBy) doc.line(`Autorizado por: ${movement.authorizedBy.name}`);
  doc.separator().bold(true).large(true).pair('Valor', money(movement.amount)).large(false).bold(false);
  doc.wrapped(`Motivo: ${movement.reason}`);
  doc.newline(2).align('center').line('_'.repeat(Math.min(columns, 32))).line('Assinatura');
  footer(doc, store);
  return doc.cut().build();
}

export function testPage(store: StoreBranding, columns: number) {
  const doc = new EscPosBuilder(columns);
  header(doc, store, 'TESTE DE IMPRESSÃO');
  doc.line('Acentuação: ação, pão, café, açúcar').line('Maiúsculas: AÇÃO, PÃO, CAFÉ');
  doc.separator().pair('Item de teste', money(1234.5));
  footer(doc, store);
  return doc.cut().build();
}
