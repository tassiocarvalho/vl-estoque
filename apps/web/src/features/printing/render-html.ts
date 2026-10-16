import type { PaperSize } from '@/lib/types';
import type { Block, PrintDocument } from './document';

const escape = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const PAGE_CSS: Record<PaperSize, string> = {
  // Bobina térmica: largura fixa, altura acompanha o conteúdo.
  '80mm': '@page { size: 80mm auto; margin: 0 } body { width: 72mm; padding: 3mm 4mm; font-size: 12px }',
  '58mm': '@page { size: 58mm auto; margin: 0 } body { width: 50mm; padding: 2mm 4mm; font-size: 10.5px }',
  A4: '@page { size: A4; margin: 18mm } body { max-width: 150mm; margin: 0 auto; font-size: 13px }',
};

function renderBlock(block: Block): string {
  switch (block.kind) {
    case 'logo':
      return `<div class="center"><img class="logo" src="${escape(block.src)}" alt=""></div>`;
    case 'title':
      return `<div class="title">${escape(block.text)}</div>`;
    case 'text':
      return `<div class="${[block.align ?? 'left', block.bold && 'bold', block.small && 'small'].filter(Boolean).join(' ')}">${escape(block.text)}</div>`;
    case 'pair':
      return `<div class="pair${block.bold ? ' bold' : ''}${block.large ? ' large' : ''}"><span>${escape(block.left)}</span><span>${escape(block.right)}</span></div>`;
    case 'separator':
      return '<hr>';
    case 'items':
      return block.rows
        .map(
          (row) =>
            `<div class="item"><div>${escape(row.description)}</div><div class="pair small"><span>${escape(row.detail)}</span><span>${escape(row.total)}</span></div>${
              row.discount ? `<div class="pair small"><span>${escape(row.discount)}</span><span></span></div>` : ''
            }</div>`,
        )
        .join('');
    case 'signature':
      return `<div class="signature">${escape(block.label)}</div>`;
    case 'space':
      return '<div class="space"></div>';
  }
}

/** HTML completo e independente do app (sempre claro, sem depender do tema). */
export function renderHtml(doc: PrintDocument, paper: PaperSize): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escape(doc.title)}</title><style>
${PAGE_CSS[paper]}
* { box-sizing: border-box }
html, body { margin: 0; background: #fff; color: #000 }
body { font-family: ${paper === 'A4' ? "'Segoe UI', Arial, sans-serif" : "'Consolas', 'Courier New', monospace"}; line-height: 1.35 }
.center { text-align: center } .left { text-align: left } .right { text-align: right }
.bold { font-weight: 700 } .small { font-size: 0.85em }
.title { text-align: center; font-weight: 700; font-size: 1.35em; margin: 2px 0 }
.logo { max-width: 45%; max-height: 70px; object-fit: contain; margin-bottom: 4px }
.pair { display: flex; justify-content: space-between; gap: 8px }
.pair span:last-child { white-space: nowrap; text-align: right }
.large { font-size: 1.3em }
.item { margin: 3px 0; break-inside: avoid }
hr { border: 0; border-top: 1px dashed #000; margin: 6px 0 }
.space { height: 28px }
.signature { margin: 12px auto 0; width: 80%; border-top: 1px solid #000; text-align: center; font-size: 0.85em; padding-top: 2px }
</style></head><body>${doc.blocks.map(renderBlock).join('')}</body></html>`;
}

/**
 * Imprime pelo navegador numa janela invisível (iframe): funciona com qualquer impressora
 * instalada no Windows — térmica USB/serial com o driver do fabricante, rede ou A4.
 * Para imprimir sem a janela de confirmação, abra o navegador com --kiosk-printing.
 */
export function printHtml(html: string): Promise<void> {
  return new Promise((resolve) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    frame.srcdoc = html;
    frame.onload = () => {
      const win = frame.contentWindow;
      if (!win) return resolve();
      let finished = false;
      const done = () => {
        if (finished) return;
        finished = true;
        // Devolve o teclado ao caixa (o iframe recebe o foco para imprimir).
        if (document.activeElement === frame) frame.blur();
        window.focus();
        setTimeout(() => frame.remove(), 1000);
        resolve();
      };
      win.addEventListener('afterprint', done, { once: true });
      // Espera o logotipo carregar antes de imprimir.
      const images = [...win.document.images].filter((img) => !img.complete);
      const settled = (img: HTMLImageElement) =>
        new Promise((r) => {
          img.addEventListener('load', r, { once: true });
          img.addEventListener('error', r, { once: true });
        });
      void Promise.all(images.map(settled)).then(() => {
        win.focus();
        win.print(); // bloqueia até a janela de impressão fechar (ou envia direto com --kiosk-printing)
        done();
      });
    };
    document.body.appendChild(frame);
  });
}
