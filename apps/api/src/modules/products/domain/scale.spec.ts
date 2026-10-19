/**
 * A leitura da etiqueta de balança roda no navegador (o caixa vende offline): o teste fica aqui,
 * junto dos demais testes de domínio.
 */
import { describe, expect, it } from 'vitest';
import { ean13Valid, normalizeScaleCode, parseScaleLabel, quantityForPrice } from '../../../../../web/src/lib/scale';

const PRICE = { enabled: true, prefix: '2', codeLength: 4, mode: 'PRICE' as const };
const WEIGHT = { ...PRICE, mode: 'WEIGHT' as const };

/** Monta um EAN-13 válido a partir dos 12 primeiros dígitos. */
const ean = (twelve: string) => {
  const sum = [...twelve].map(Number).reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3), 0);
  return `${twelve}${(10 - (sum % 10)) % 10}`;
};

describe('etiqueta de balança', () => {
  it('confere o dígito verificador do EAN-13', () => {
    expect(ean13Valid('7891234567895')).toBe(true);
    expect(ean13Valid('7891234567890')).toBe(false);
  });

  it('modo preço: 2 + código 0042 + preço R$ 15,87', () => {
    expect(parseScaleLabel(ean('200420001587'), PRICE)).toEqual({ scaleCode: '42', priceCents: 1587, weightKg: null });
  });

  it('modo peso: 0,455 kg', () => {
    expect(parseScaleLabel(ean('200420000455'), WEIGHT)).toEqual({ scaleCode: '42', priceCents: null, weightKg: 0.455 });
  });

  it('código do produto com 6 dígitos (2 000001 00760 D)', () => {
    expect(parseScaleLabel(ean('200000100760'), { ...PRICE, codeLength: 6 })).toEqual({ scaleCode: '1', priceCents: 760, weightKg: null });
  });

  it('ignora códigos que não são da balança', () => {
    expect(parseScaleLabel('7891234567895', PRICE)).toBeNull(); // outro prefixo
    expect(parseScaleLabel(ean('200420001587'), { ...PRICE, enabled: false })).toBeNull();
    expect(parseScaleLabel('2004200015870', PRICE)).toBeNull(); // dígito verificador errado
  });

  it('quantidade que faz o total bater com o preço da etiqueta', () => {
    // Até R$ 10/kg cada grama vale menos de 1 centavo: sempre existe um peso que bate exatamente.
    const exact = quantityForPrice(487, 9.99);
    expect(Math.round(999 * exact)).toBe(487);
    // Produto caro (R$ 34,90/kg): cada grama soma ~3,5 centavos; fica o peso mais próximo.
    const close = quantityForPrice(1587, 34.9);
    expect(Math.abs(Math.round(3490 * close) - 1587)).toBeLessThanOrEqual(2);
  });

  it('normaliza o código (sem zeros à esquerda)', () => {
    expect(normalizeScaleCode('0042')).toBe('42');
    expect(normalizeScaleCode('')).toBe('');
  });
});
