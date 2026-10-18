/**
 * Documento em blocos (o mesmo modelo que o navegador usa para imprimir e gerar PDF) → ESC/POS.
 * Usado pelos comprovantes do pós-venda (devolução, vale-troca, recebimento de fiado) na impressora de rede.
 */
import { EscPosBuilder } from './escpos';

export type PrintBlock =
  | { kind: 'logo'; src: string }
  | { kind: 'title'; text: string }
  | { kind: 'text'; text: string; align?: 'left' | 'center' | 'right'; bold?: boolean; small?: boolean }
  | { kind: 'pair'; left: string; right: string; bold?: boolean; large?: boolean }
  | { kind: 'separator' }
  | { kind: 'items'; rows: { description: string; detail: string; total: string; discount?: string }[] }
  | { kind: 'signature'; label: string }
  | { kind: 'space' };

const KINDS = new Set(['logo', 'title', 'text', 'pair', 'separator', 'items', 'signature', 'space']);
const str = (value: unknown, max = 400) => typeof value === 'string' && value.length <= max;

/** Confere a estrutura recebida do navegador (nada além de textos curtos é aceito). */
export function validBlocks(blocks: unknown): blocks is PrintBlock[] {
  if (!Array.isArray(blocks) || blocks.length === 0 || blocks.length > 400) return false;
  return blocks.every((raw) => {
    if (!raw || typeof raw !== 'object') return false;
    const block = raw as Record<string, unknown>;
    if (!KINDS.has(block.kind as string)) return false;
    switch (block.kind) {
      case 'logo':
        return str(block.src, 300_000);
      case 'title':
        return str(block.text);
      case 'text':
        return str(block.text);
      case 'pair':
        return str(block.left) && str(block.right);
      case 'signature':
        return str(block.label);
      case 'items':
        return (
          Array.isArray(block.rows) &&
          block.rows.length <= 500 &&
          block.rows.every((row: Record<string, unknown>) => str(row?.description) && str(row?.detail) && str(row?.total) && (row.discount === undefined || str(row.discount)))
        );
      default:
        return true;
    }
  });
}

export function blocksToEscPos(blocks: PrintBlock[], columns: number, options: { openDrawer?: boolean } = {}) {
  const doc = new EscPosBuilder(columns);
  if (options.openDrawer) doc.openDrawer();
  for (const block of blocks) {
    switch (block.kind) {
      case 'logo':
        break; // logotipo só na impressão pelo navegador
      case 'title':
        doc.align('center').bold(true).large(true).wrapped(block.text).large(false).bold(false).align('left');
        break;
      case 'text':
        doc.align(block.align ?? 'left').bold(Boolean(block.bold)).wrapped(block.text).bold(false).align('left');
        break;
      case 'pair':
        doc.bold(Boolean(block.bold)).large(Boolean(block.large)).pair(block.left, block.right).large(false).bold(false);
        break;
      case 'separator':
        doc.separator();
        break;
      case 'items':
        for (const row of block.rows) {
          doc.wrapped(row.description).pair(`    ${row.detail}`, row.total);
          if (row.discount) doc.pair(`    ${row.discount}`, '');
        }
        break;
      case 'signature':
        doc.newline(2).align('center').line('_'.repeat(Math.min(columns, 32))).line(block.label).align('left');
        break;
      case 'space':
        doc.newline();
        break;
    }
  }
  return doc.newline().cut().build();
}
