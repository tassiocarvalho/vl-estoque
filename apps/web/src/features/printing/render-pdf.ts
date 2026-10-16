import type { PaperSize } from '@/lib/types';
import type { PrintDocument } from './document';

/** Nome de arquivo seguro: "Venda Nº 000123" → "venda-n-000123.pdf". */
const fileName = (title: string) =>
  `${title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}.pdf`;

/**
 * As fontes padrão do PDF usam a codificação WinAnsi: o sinal de menos tipográfico (−) e outros
 * símbolos fora dela saem trocados. Converte para equivalentes seguros.
 */
const pdfText = (text: string) =>
  text
    .replace(/\u2212/g, '-')
    .replace(/[\u00a0\u202f]/g, ' ')
    .replace(/[^\u0000-\u00ff\u2013\u2014\u2018\u2019\u201c\u201d\u2022\u2026\u20ac]/g, '?');

/**
 * Gera e baixa o PDF do documento (A4 ou no formato da bobina).
 * O jsPDF só é carregado quando alguém pede um PDF — não pesa na abertura do caixa.
 */
export async function downloadPdf(doc: PrintDocument, paper: PaperSize) {
  const { jsPDF } = await import('jspdf');
  const a4 = paper === 'A4';
  const width = a4 ? 210 : paper === '80mm' ? 80 : 58;
  const margin = a4 ? 25 : 4;
  const contentWidth = width - margin * 2;
  const base = a4 ? 10.5 : paper === '80mm' ? 8.5 : 7.5;
  const lineHeight = (size: number) => size * 0.45;

  const render = (pdf: InstanceType<typeof jsPDF> | null) => {
    let y = margin;
    const write = (text: string, options: { size?: number; bold?: boolean; align?: 'left' | 'center' | 'right' } = {}) => {
      const size = options.size ?? base;
      if (pdf) {
        pdf.setFont('helvetica', options.bold ? 'bold' : 'normal').setFontSize(size);
      }
      const lines: string[] = pdf ? pdf.splitTextToSize(pdfText(text), contentWidth) : [text];
      for (const line of lines) {
        y += lineHeight(size);
        if (pdf) {
          if (a4 && y > 297 - margin) {
            pdf.addPage();
            y = margin + lineHeight(size);
          }
          const x = options.align === 'center' ? width / 2 : options.align === 'right' ? width - margin : margin;
          pdf.text(line, x, y, { align: options.align ?? 'left' });
        }
      }
    };
    const pair = (left: string, right: string, options: { size?: number; bold?: boolean } = {}) => {
      const size = options.size ?? base;
      y += lineHeight(size);
      if (!pdf) return;
      pdf.setFont('helvetica', options.bold ? 'bold' : 'normal').setFontSize(size);
      const rightText = pdfText(right);
      const rightWidth = pdf.getTextWidth(rightText);
      const leftText = pdf.splitTextToSize(pdfText(left), contentWidth - rightWidth - 3)[0] as string;
      pdf.text(leftText, margin, y);
      pdf.text(rightText, width - margin, y, { align: 'right' });
    };
    const rule = () => {
      y += 2;
      if (pdf) {
        pdf.setLineDashPattern([1, 1], 0).setLineWidth(0.2).line(margin, y, width - margin, y);
      }
      y += 1;
    };

    for (const block of doc.blocks) {
      switch (block.kind) {
        case 'logo':
          if (/^data:image\/(png|jpe?g)/.test(block.src) && pdf) {
            const props = pdf.getImageProperties(block.src);
            const height = Math.min(18, (props.height / props.width) * contentWidth * 0.45);
            const w = (props.width / props.height) * height;
            pdf.addImage(block.src, (width - w) / 2, y, w, height);
            y += height + 1;
          } else if (/^data:image\/(png|jpe?g)/.test(block.src)) y += 19;
          break;
        case 'title':
          write(block.text, { size: base * 1.45, bold: true, align: 'center' });
          y += 1;
          break;
        case 'text':
          write(block.text, { size: block.small ? base * 0.88 : base, bold: block.bold, align: block.align });
          break;
        case 'pair':
          pair(block.left, block.right, { size: block.large ? base * 1.3 : base, bold: block.bold });
          break;
        case 'separator':
          rule();
          break;
        case 'items':
          for (const row of block.rows) {
            write(row.description);
            pair(row.detail, row.total, { size: base * 0.9 });
            if (row.discount) write(row.discount, { size: base * 0.9 });
            y += 0.8;
          }
          break;
        case 'space':
          y += 8;
          break;
        case 'signature':
          y += 6;
          if (pdf) pdf.setLineDashPattern([], 0).line(width * 0.2, y, width * 0.8, y);
          write(block.label, { size: base * 0.88, align: 'center' });
          break;
      }
    }
    return y + margin;
  };

  // Bobina: uma passada de medição numa página bem comprida dá a altura exata do comprovante.
  const height = a4 ? 297 : render(new jsPDF({ unit: 'mm', format: [width, 5000] })) + 4;
  const pdf = new jsPDF({ unit: 'mm', format: a4 ? 'a4' : [width, Math.max(height, 60)] });
  pdf.setProperties({ title: doc.title });
  render(pdf);
  pdf.save(fileName(doc.title));
}
