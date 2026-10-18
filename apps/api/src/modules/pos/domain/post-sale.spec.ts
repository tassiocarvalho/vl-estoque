import { describe, expect, it } from 'vitest';
import { allocateReceipt, creditStatus, netItemValues, PostSaleError, reduceInstallments, refundForItem, returnableQuantity, voucherCode } from './post-sale';

describe('devolução', () => {
  it('rateia o desconto no total entre os itens; a soma é o total da venda', () => {
    // Itens de R$ 30,00 e R$ 10,00 com R$ 4,00 de desconto no total (venda de R$ 36,00).
    const net = netItemValues([3000, 1000], 400);
    expect(net).toEqual([2700, 900]);
    expect(net[0] + net[1]).toBe(3600);
  });

  it('devolução parcial é proporcional à quantidade', () => {
    const item = { netCents: 2700, soldQuantity: 3, returnedQuantity: 0, refundedCents: 0 };
    expect(refundForItem(item, 1)).toBe(900);
  });

  it('a última devolução do item leva o restante exato (sem perder centavo)', () => {
    const item = { netCents: 1000, soldQuantity: 3, returnedQuantity: 0, refundedCents: 0 };
    const first = refundForItem(item, 1);
    const second = refundForItem({ ...item, returnedQuantity: 1, refundedCents: first }, 1);
    const last = refundForItem({ ...item, returnedQuantity: 2, refundedCents: first + second }, 1);
    expect([first, second, last]).toEqual([333, 333, 334]);
  });

  it('não deixa devolver mais do que foi vendido (somando as devoluções anteriores)', () => {
    const item = { netCents: 1000, soldQuantity: 2, returnedQuantity: 1.5, refundedCents: 750 };
    expect(returnableQuantity(item)).toBe(0.5);
    expect(() => refundForItem(item, 1)).toThrow(PostSaleError);
    expect(refundForItem(item, 0.5)).toBe(250);
  });
});

describe('fiado', () => {
  const installments = [
    { id: 'a', dueCents: 5000 },
    { id: 'b', dueCents: 5000 },
    { id: 'c', dueCents: 5000 },
  ];

  it('recebimento abate das parcelas mais antigas', () => {
    expect(allocateReceipt(installments, 7000)).toEqual([
      { id: 'a', cents: 5000 },
      { id: 'b', cents: 2000 },
    ]);
  });

  it('não recebe mais que o saldo devedor', () => {
    expect(() => allocateReceipt(installments, 15001)).toThrow(PostSaleError);
  });

  it('devolução abate do fiado começando pela última parcela', () => {
    expect(reduceInstallments(installments, 6000)).toEqual([
      { id: 'c', cents: 5000 },
      { id: 'b', cents: 1000 },
    ]);
  });
});

describe('vale-troca', () => {
  it('código sem caracteres ambíguos', () => {
    for (let i = 0; i < 50; i++) expect(voucherCode()).toMatch(/^VT-[A-HJ-NP-Z2-9]{8}$/);
  });

  it('situação do vale', () => {
    const base = { balanceCents: 1000, expiresAt: '2026-12-31', canceled: false };
    expect(creditStatus(base, '2026-10-18')).toBe('ACTIVE');
    expect(creditStatus({ ...base, expiresAt: '2026-10-01' }, '2026-10-18')).toBe('EXPIRED');
    expect(creditStatus({ ...base, balanceCents: 0 }, '2026-10-18')).toBe('USED');
    expect(creditStatus({ ...base, canceled: true }, '2026-10-18')).toBe('CANCELED');
  });
});
