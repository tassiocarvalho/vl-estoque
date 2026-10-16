import { describe, expect, it } from 'vitest';
import { encodePc860, EscPosBuilder, pairLine, wrap } from './escpos';

describe('encodePc860', () => {
  it('mantém o ASCII e converte acentos do português', () => {
    expect(encodePc860('Pão')).toEqual([0x50, 0x84, 0x6f]);
    expect(encodePc860('AÇÚCAR')).toEqual([0x41, 0x80, 0x96, 0x43, 0x41, 0x52]);
  });

  it('remove o acento de caracteres que não existem na página de código', () => {
    expect(encodePc860('ŷ')).toEqual([0x79]);
    expect(encodePc860('€')).toEqual([0x3f]);
  });
});

describe('layout', () => {
  it('alinha texto e valor nas pontas da linha', () => {
    expect(pairLine('Total', 'R$ 10,00', 20)).toBe('Total       R$ 10,00');
    expect(pairLine('Nome muito comprido do produto', '9,99', 16)).toHaveLength(16);
  });

  it('quebra o texto na largura da bobina', () => {
    expect(wrap('Obrigado pela preferência, volte sempre', 16)).toEqual([
      'Obrigado pela',
      'preferência,',
      'volte sempre',
    ]);
  });
});

describe('EscPosBuilder', () => {
  it('começa inicializando a impressora com a página de código PC860', () => {
    const bytes = [...new EscPosBuilder(48).build()];
    expect(bytes).toEqual([0x1b, 0x40, 0x1b, 0x74, 3]);
  });

  it('gera os comandos de gaveta e corte', () => {
    const bytes = [...new EscPosBuilder(48).openDrawer().cut().build()].slice(5);
    expect(bytes).toEqual([0x1b, 0x70, 0x00, 0x19, 0xfa, 0x1b, 0x64, 4, 0x1d, 0x56, 0x42, 0x00]);
  });
});
