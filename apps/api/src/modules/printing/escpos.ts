/**
 * Gerador de comandos ESC/POS — o "idioma" das impressoras térmicas (Epson, Elgin, Bematech,
 * Daruma, Tanca, Sweda e genéricas em modo ESC/POS). Domínio puro: só monta os bytes.
 *
 * O texto sai na página de código PC860 (português), então "ç", "ã" e "é" saem corretos.
 */

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

/** Página de código PC860 (Português) — seleção ESC t 3. */
const CODEPAGE_PC860 = 3;

const PC860: Record<string, number> = {
  Ç: 0x80, ü: 0x81, é: 0x82, â: 0x83, ã: 0x84, à: 0x85, Á: 0x86, ç: 0x87, ê: 0x88, Ê: 0x89,
  è: 0x8a, Í: 0x8b, Ô: 0x8c, ì: 0x8d, Ã: 0x8e, Â: 0x8f, É: 0x90, À: 0x91, È: 0x92, ô: 0x93,
  õ: 0x94, ò: 0x95, Ú: 0x96, ù: 0x97, Ì: 0x98, Õ: 0x99, Ü: 0x9a, Ó: 0x9f, á: 0xa0, í: 0xa1,
  ó: 0xa2, ú: 0xa3, ñ: 0xa4, Ñ: 0xa5, ª: 0xa6, º: 0xa7, '°': 0xf8,
};

/** Converte texto para bytes PC860; caracteres sem equivalente perdem o acento ou viram "?". */
export function encodePc860(text: string): number[] {
  const bytes: number[] = [];
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (code >= 0x20 && code < 0x7f) bytes.push(code);
    else if (PC860[char] !== undefined) bytes.push(PC860[char]);
    else {
      const plain = char.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const fallback = plain.charCodeAt(0);
      bytes.push(plain && fallback >= 0x20 && fallback < 0x7f ? fallback : 0x3f);
    }
  }
  return bytes;
}

export type Align = 'left' | 'center' | 'right';

const ALIGN: Record<Align, number> = { left: 0, center: 1, right: 2 };

export class EscPosBuilder {
  private readonly bytes: number[] = [ESC, 0x40, ESC, 0x74, CODEPAGE_PC860];

  /** Colunas da linha na fonte padrão: 48 (bobina de 80 mm) ou 32 (58 mm). */
  constructor(readonly columns: number) {}

  align(align: Align) {
    this.bytes.push(ESC, 0x61, ALIGN[align]);
    return this;
  }

  bold(on: boolean) {
    this.bytes.push(ESC, 0x45, on ? 1 : 0);
    return this;
  }

  /** Letra em tamanho duplo (altura e largura) — total da venda, por exemplo. */
  large(on: boolean) {
    this.bytes.push(GS, 0x21, on ? 0x11 : 0x00);
    return this;
  }

  text(content: string) {
    this.bytes.push(...encodePc860(content));
    return this;
  }

  line(content = '') {
    return this.text(content).newline();
  }

  newline(count = 1) {
    for (let i = 0; i < count; i++) this.bytes.push(LF);
    return this;
  }

  /** Quebra o texto em várias linhas respeitando a largura da bobina. */
  wrapped(content: string) {
    for (const part of wrap(content, this.columns)) this.line(part);
    return this;
  }

  /** Texto à esquerda e valor à direita na mesma linha (ex.: "Total ........ R$ 10,00"). */
  pair(left: string, right: string) {
    return this.line(pairLine(left, right, this.columns));
  }

  separator(char = '-') {
    return this.line(char.repeat(this.columns));
  }

  /** Pulso para abrir a gaveta de dinheiro ligada à impressora (ESC p 0 25 250). */
  openDrawer() {
    this.bytes.push(ESC, 0x70, 0x00, 0x19, 0xfa);
    return this;
  }

  /** Avança o papel e faz o corte parcial. */
  cut() {
    this.bytes.push(ESC, 0x64, 4, GS, 0x56, 0x42, 0x00);
    return this;
  }

  build(): Buffer {
    return Buffer.from(this.bytes);
  }
}

export function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let current = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (word.length > width) {
        if (current) lines.push(current);
        for (let i = 0; i < word.length; i += width) lines.push(word.slice(i, i + width));
        current = '';
        continue;
      }
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length > width) {
        lines.push(current);
        current = word;
      } else current = candidate;
    }
    lines.push(current);
  }
  return lines;
}

export function pairLine(left: string, right: string, width: number): string {
  const space = width - right.length - 1;
  const trimmed = left.length > space ? left.slice(0, Math.max(space, 0)) : left;
  return `${trimmed}${' '.repeat(Math.max(width - trimmed.length - right.length, 1))}${right}`;
}
