/**
 * Etiqueta de balança (EAN-13 com peso ou preço embutido) — domínio puro.
 *
 * Formato mais comum no Brasil:  2 CCCC 0PPPPP D
 *   2      prefixo da balança (configurável)
 *   CCCC   código do produto na balança (PLU), com 4 a 6 dígitos (configurável)
 *   PPPPP  preço total em centavos (modo PREÇO) ou peso em gramas (modo PESO), até o penúltimo dígito
 *   D      dígito verificador do EAN-13
 */

export interface ScaleSettings {
  enabled: boolean;
  /** Primeiro dígito das etiquetas da balança (normalmente "2"). */
  prefix: string;
  /** Quantidade de dígitos do código do produto (PLU). */
  codeLength: number;
  /** PRICE: a etiqueta traz o preço total. WEIGHT: traz o peso em gramas. */
  mode: 'PRICE' | 'WEIGHT';
}

export interface ScaleLabel {
  /** Código do produto na balança, sem zeros à esquerda. */
  scaleCode: string;
  /** Preço total em centavos (modo PREÇO) ou peso em kg (modo PESO). */
  priceCents: number | null;
  weightKg: number | null;
}

/** Dígito verificador do EAN-13. */
export function ean13Valid(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false;
  const digits = [...code].map(Number);
  const sum = digits.slice(0, 12).reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10 === digits[12];
}

/** Normaliza o código do produto na balança (só números, sem zeros à esquerda). */
export const normalizeScaleCode = (code: string) => {
  const digits = code.replace(/\D/g, '');
  return digits ? String(Number(digits)) : '';
};

/** Lê a etiqueta; devolve null se o código não for de balança. */
export function parseScaleLabel(code: string, settings: ScaleSettings | null | undefined): ScaleLabel | null {
  if (!settings?.enabled) return null;
  const value = code.trim();
  if (!ean13Valid(value) || !value.startsWith(settings.prefix)) return null;
  const start = settings.prefix.length;
  const scaleCode = normalizeScaleCode(value.slice(start, start + settings.codeLength));
  const embedded = Number(value.slice(start + settings.codeLength, 12));
  if (!scaleCode || !Number.isFinite(embedded) || embedded <= 0) return null;
  return settings.mode === 'PRICE'
    ? { scaleCode, priceCents: embedded, weightKg: null }
    : { scaleCode, priceCents: null, weightKg: Math.round(embedded) / 1000 };
}

/**
 * Quantidade (3 casas) que faz o total do item bater exatamente com o preço da etiqueta
 * (o caixa calcula preço × quantidade, arredondado em centavos). Se nenhuma bater, a mais próxima.
 */
export function quantityForPrice(priceCents: number, unitPrice: number): number {
  const unitCents = Math.round(unitPrice * 100);
  if (unitCents <= 0) return 0;
  const base = Math.round((priceCents / unitCents) * 1000);
  let best = base;
  for (let delta = 0; delta <= 20; delta++) {
    for (const candidate of [base - delta, base + delta]) {
      if (candidate > 0 && Math.round((unitCents * candidate) / 1000) === priceCents) return candidate / 1000;
    }
  }
  if (best <= 0) best = 1;
  return best / 1000;
}
