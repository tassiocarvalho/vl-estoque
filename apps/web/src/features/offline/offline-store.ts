import { createStore, del, entries, get, set } from 'idb-keyval';
import type { Customer, Discount, MovementType, Product, Unit } from '@/lib/types';

/**
 * Armazenamento local (IndexedDB) para funcionar sem internet:
 *  - outbox:  movimentações registradas offline, aguardando envio;
 *  - sales:   vendas do caixa feitas offline, aguardando envio;
 *  - catalog: cópia resumida dos produtos (com preço), para vender e bipar offline;
 *  - customers: nome e documento dos clientes ativos, para identificar o cliente offline
 *    (dados pessoais: apagados do aparelho no logout).
 */
const outboxStore = createStore('vl-estoque-outbox', 'movements');
const salesStore = createStore('pdv-sales-outbox', 'sales');
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

/** Corpo do POST /sales, guardado como foi montado no caixa. */
export interface SalePayload {
  id: string;
  sessionId: string;
  occurredAt: string;
  items: { productId: string; quantity: number; unitPrice: number; discount?: Discount }[];
  orderDiscount?: Discount;
  /** methodId: forma cadastrada. method: código de fábrica (vendas offline de versões anteriores). */
  payments: { methodId?: string; method?: string; amount: number }[];
  customerId?: string;
  customerDocument?: string;
  removedItems?: { productId: string; name: string; quantity: number; at: string }[];
}

export interface PendingSale {
  id: string;
  payload: SalePayload;
  /** Token de autorização de desconto do supervisor (preso a esta venda). */
  authorizationToken?: string;
  total: number;
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

export const salesOutbox = {
  async list(): Promise<PendingSale[]> {
    const all = await entries<string, PendingSale>(salesStore);
    return all.map(([, value]) => value).sort((a, b) => a.payload.occurredAt.localeCompare(b.payload.occurredAt));
  },
  add: (sale: PendingSale) => set(sale.id, sale, salesStore),
  remove: (id: string) => del(id, salesStore),
  async markError(id: string, error: string) {
    const current = await get<PendingSale>(id, salesStore);
    if (current) await set(id, { ...current, error }, salesStore);
  },
};

export type CatalogItem = Pick<
  Product,
  'id' | 'name' | 'sku' | 'barcode' | 'unit' | 'currentStock' | 'status' | 'salePrice'
>;

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

export type CachedCustomer = Pick<Customer, 'id' | 'name' | 'document' | 'phone'>;

const CUSTOMERS_KEY = 'customers';

export const customersCache = {
  save: (items: CachedCustomer[]) => set(CUSTOMERS_KEY, items, catalogStore),
  clear: () => del(CUSTOMERS_KEY, catalogStore),
  async search(term: string, limit = 8): Promise<CachedCustomer[]> {
    const all = (await get<CachedCustomer[]>(CUSTOMERS_KEY, catalogStore)) ?? [];
    const query = term.trim().toLowerCase();
    const digits = term.replace(/\D/g, '');
    return all
      .filter(
        (c) =>
          c.name.toLowerCase().includes(query) ||
          (digits.length >= 3 && (c.document?.startsWith(digits) || c.phone?.includes(digits))),
      )
      .slice(0, limit);
  },
};
