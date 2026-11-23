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
  /** Quem registrou: só essa pessoa envia (com o PIN dela), mesmo em computador compartilhado. */
  userId?: string;
  userName?: string;
  error?: string;
}

/** Registros antigos (sem dono) são enviados por quem estiver conectado. */
export const belongsTo = (item: Pick<PendingMovement, 'userId'>, userId: string) =>
  !item.userId || item.userId === userId;

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
  async clearError(id: string) {
    const current = await get<PendingMovement>(id, outboxStore);
    if (current) await set(id, { ...current, error: undefined }, outboxStore);
  },
};

export type CatalogItem = Pick<Product, 'id' | 'name' | 'sku' | 'barcode' | 'unit' | 'currentStock' | 'status'>;

const CATALOG_KEY = 'products';

const round3 = (value: number) => Math.round(value * 1000) / 1000;

/** Quanto cada registro ainda não enviado muda o saldo de cada produto. */
export function pendingDeltas(items: PendingMovement[]): Map<string, number> {
  const deltas = new Map<string, number>();
  for (const { kind, payload } of items) {
    const delta = kind === 'entries' ? payload.quantity : -payload.quantity;
    deltas.set(payload.productId, round3((deltas.get(payload.productId) ?? 0) + delta));
  }
  return deltas;
}

/** Aplica os registros ainda não enviados ao saldo do catálogo local. */
export function applyDeltas(items: CatalogItem[], deltas: Map<string, number>): CatalogItem[] {
  if (deltas.size === 0) return items;
  return items.map((item) => {
    const delta = deltas.get(item.id);
    return delta ? { ...item, currentStock: round3(item.currentStock + delta) } : item;
  });
}

export const catalog = {
  save: (items: CatalogItem[]) => set(CATALOG_KEY, items, catalogStore),
  all: async () => (await get<CatalogItem[]>(CATALOG_KEY, catalogStore)) ?? [],
  /** Atualiza o saldo local depois de um registro offline (a próxima bipagem já vê o saldo novo). */
  async adjust(movement: PendingMovement) {
    const items = await this.all();
    if (items.length > 0) await this.save(applyDeltas(items, pendingDeltas([movement])));
  },
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
