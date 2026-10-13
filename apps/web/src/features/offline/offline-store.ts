import { createStore, del, entries, get, set } from 'idb-keyval';
import type { MovementType, Product, Unit } from '@/lib/types';

/**
 * Armazenamento local (IndexedDB) para funcionar sem internet:
 *  - outbox:  movimentações registradas offline, aguardando envio;
 *  - catalog: cópia resumida dos produtos, para encontrar itens pela bipagem offline.
 */
const outboxStore = createStore('vl-estoque-outbox', 'movements');
const catalogStore = createStore('vl-estoque-catalog', 'catalog');

export interface PendingMovement {
  id: string;
  kind: 'entries' | 'exits';
  payload: {
    id: string;
    productId: string;
    type: MovementType;
    quantity: number;
    note?: string;
    occurredAt: string;
  };
  productName: string;
  unit: Unit;
  error?: string;
}

export const outbox = {
  async list(): Promise<PendingMovement[]> {
    const all = await entries<string, PendingMovement>(outboxStore);
    return all.map(([, value]) => value).sort((a, b) => a.payload.occurredAt.localeCompare(b.payload.occurredAt));
  },
  add: (movement: PendingMovement) => set(movement.id, movement, outboxStore),
  remove: (id: string) => del(id, outboxStore),
  async markError(id: string, error: string) {
    const current = await get<PendingMovement>(id, outboxStore);
    if (current) await set(id, { ...current, error }, outboxStore);
  },
};

export type CatalogItem = Pick<Product, 'id' | 'name' | 'sku' | 'barcode' | 'unit' | 'currentStock' | 'status'>;

const CATALOG_KEY = 'products';

export const catalog = {
  save: (items: CatalogItem[]) => set(CATALOG_KEY, items, catalogStore),
  all: async () => (await get<CatalogItem[]>(CATALOG_KEY, catalogStore)) ?? [],
  async findByCode(code: string) {
    const normalized = code.trim().toUpperCase();
    return (await this.all()).find((p) => p.barcode === code.trim() || p.sku === normalized);
  },
  async search(term: string, limit = 8) {
    const query = term.trim().toLowerCase();
    return (await this.all())
      .filter((p) => p.name.toLowerCase().includes(query) || p.sku.toLowerCase().includes(query) || p.barcode === term)
      .slice(0, limit);
  },
};
