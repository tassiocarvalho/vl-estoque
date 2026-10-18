import { describe, expect, it } from 'vitest';
import { normalizeHeader, parseBrNumber, parseImportRow } from './product-import';

describe('planilha de produtos', () => {
  it('reconhece o cabeçalho pelo rótulo ou pela chave, com ou sem acento', () => {
    expect(normalizeHeader('Preço de venda')).toBe('preco_venda');
    expect(normalizeHeader('codigo_barras')).toBe('codigo_barras');
    expect(normalizeHeader('Código de barras (EAN)')).toBe('codigo_barras');
    expect(normalizeHeader('Estoque inicial (só produtos novos)')).toBe('estoque_inicial');
    expect(normalizeHeader('Coluna estranha')).toBeNull();
  });

  it('lê números no formato brasileiro', () => {
    expect(parseBrNumber('1.234,56')).toBe(1234.56);
    expect(parseBrNumber('R$ 12,5')).toBe(12.5);
    expect(parseBrNumber('7.5')).toBe(7.5);
    expect(parseBrNumber('')).toBeUndefined();
    expect(parseBrNumber('abc')).toBeNaN();
  });

  it('produto novo exige nome, categoria e unidade', () => {
    const { product, errors } = parseImportRow(
      { nome: 'Arroz 5kg', sku: 'arroz-5', categoria: 'Mercearia', unidade: 'un', preco_venda: '27,90', reposicao: 'não' },
      true,
    );
    expect(errors).toEqual([]);
    expect(product).toMatchObject({ sku: 'ARROZ-5', name: 'Arroz 5kg', unit: 'UN', salePrice: 27.9, replenishmentEnabled: false, subcategory: null });

    expect(parseImportRow({ sku: 'X1' }, true).errors).toEqual(['Informe o nome', 'Informe a categoria', 'Informe a unidade']);
  });

  it('na atualização, célula vazia mantém o valor', () => {
    const { product, errors } = parseImportRow({ sku: 'ARROZ-5', preco_venda: '29,90' }, false);
    expect(errors).toEqual([]);
    expect(product).toEqual({ sku: 'ARROZ-5', salePrice: 29.9 });
  });

  it('aponta os erros da linha', () => {
    const { errors } = parseImportRow(
      { nome: 'X', sku: 'com espaço', codigo_barras: '7,89E+12', unidade: 'caixa', preco_venda: '-1', reposicao: 'talvez', consumo_medio: '5', consumo_maximo: '2' },
      false,
    );
    expect(errors).toHaveLength(7);
  });
});
