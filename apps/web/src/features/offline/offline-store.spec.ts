import { describe, expect, it } from 'vitest';
import { applyDeltas, belongsTo, pendingDeltas, type CatalogItem, type PendingMovement } from './offline-store';

const pending = (kind: PendingMovement['kind'], productId: string, quantity: number): PendingMovement => ({
  id: `${kind}-${productId}-${quantity}`,
  kind,
  payload: { id: 'x', productId, type: kind === 'entries' ? 'IN_PURCHASE' : 'OUT_SALE', quantity, occurredAt: '2026-11-23T10:00:00Z' },
  productName: 'x',
  unit: 'KG',
});

const item = (id: string, currentStock: number): CatalogItem => ({
  id,
  name: id,
  sku: id,
  barcode: null,
  unit: 'KG',
  currentStock,
  status: 'OK',
});

describe('saldo local com registros offline', () => {
  it('soma entradas e desconta saídas por produto', () => {
    const deltas = pendingDeltas([pending('exits', 'a', 1), pending('exits', 'a', 2), pending('entries', 'a', 10), pending('exits', 'b', 0.3)]);
    expect(deltas.get('a')).toBe(7);
    expect(deltas.get('b')).toBe(-0.3);
  });

  it('evita erro de arredondamento em quantidades fracionadas (kg)', () => {
    const deltas = pendingDeltas([pending('exits', 'a', 0.1), pending('exits', 'a', 0.2)]);
    expect(applyDeltas([item('a', 1)], deltas)[0].currentStock).toBe(0.7);
  });

  it('aplica no catálogo só os produtos afetados', () => {
    const catalog = [item('a', 10), item('b', 5)];
    const result = applyDeltas(catalog, pendingDeltas([pending('exits', 'a', 3)]));
    expect(result.map((p) => p.currentStock)).toEqual([7, 5]);
    expect(result[1]).toBe(catalog[1]);
  });
});

describe('dono do registro offline', () => {
  it('só a pessoa que registrou envia; registros antigos sem dono qualquer um envia', () => {
    expect(belongsTo({ userId: 'u1' }, 'u1')).toBe(true);
    expect(belongsTo({ userId: 'u1' }, 'u2')).toBe(false);
    expect(belongsTo({ userId: undefined }, 'u2')).toBe(true);
  });
});
