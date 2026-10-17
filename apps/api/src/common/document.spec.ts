import { describe, expect, it } from 'vitest';
import { formatDocument, isValidCnpj, isValidCpf, isValidDocument } from './document';

describe('CPF', () => {
  it('aceita CPF válido, com ou sem pontuação', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true);
    expect(isValidCpf('52998224725')).toBe(true);
  });

  it('recusa dígito verificador errado, sequência repetida e tamanho errado', () => {
    expect(isValidCpf('529.982.247-24')).toBe(false);
    expect(isValidCpf('111.111.111-11')).toBe(false);
    expect(isValidCpf('1234567890')).toBe(false);
  });
});

describe('CNPJ', () => {
  it('aceita CNPJ válido e recusa inválido', () => {
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true);
    expect(isValidCnpj('11.222.333/0001-80')).toBe(false);
    expect(isValidCnpj('00000000000000')).toBe(false);
  });
});

describe('documento', () => {
  it('decide entre CPF e CNPJ pelo tamanho', () => {
    expect(isValidDocument('52998224725')).toBe(true);
    expect(isValidDocument('11222333000181')).toBe(true);
    expect(isValidDocument('123')).toBe(false);
  });

  it('formata para impressão', () => {
    expect(formatDocument('52998224725')).toBe('529.982.247-25');
    expect(formatDocument('11222333000181')).toBe('11.222.333/0001-81');
  });
});

describe('paridade com o navegador', () => {
  it('a validação do caixa concorda com a da API', async () => {
    const browser = await import('../../../web/src/lib/document');
    const samples = ['52998224725', '52998224724', '11222333000181', '11222333000180', '11111111111', '123', '00000000000000', '39053344705'];
    for (const sample of samples) {
      expect(browser.isValidDocument(sample)).toBe(isValidDocument(sample));
      expect(browser.formatDocument(sample)).toBe(formatDocument(sample));
    }
  });
});
