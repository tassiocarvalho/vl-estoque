/**
 * Estado da venda em andamento no caixa (carrinho) — reducer puro.
 * Fica salvo no aparelho: se a página recarregar ou o PC travar, a venda não se perde.
 */
import { uuid } from '@/lib/format';
import type { Discount, Unit } from '@/lib/types';

export interface CartItem {
  key: string;
  productId: string;
  name: string;
  sku: string;
  barcode: string | null;
  unit: Unit;
  unitPrice: number;
  quantity: number;
  discount: Discount | null;
}

export interface RemovedItem {
  productId: string;
  name: string;
  quantity: number;
  at: string;
}

export interface CartState {
  /** Id da venda, gerado já na abertura do cupom (garante idempotência no envio). */
  saleId: string;
  items: CartItem[];
  orderDiscount: Discount | null;
  /** Itens cancelados antes de finalizar — vão para a auditoria junto com a venda. */
  removed: RemovedItem[];
  selectedKey: string | null;
  /** Autorização de desconto do supervisor, presa a esta venda. */
  authorization: { token: string; supervisor: string } | null;
  /** Cliente identificado e/ou CPF/CNPJ na nota. */
  customer: { id: string; name: string; document: string | null } | null;
  customerDocument: string | null;
}

export type CartProduct = Pick<CartItem, 'productId' | 'name' | 'sku' | 'barcode' | 'unit' | 'unitPrice'>;

export type CartAction =
  | { type: 'add'; product: CartProduct; quantity: number }
  | { type: 'setQuantity'; key: string; quantity: number }
  | { type: 'remove'; key: string }
  | { type: 'select'; key: string | null }
  | { type: 'moveSelection'; delta: number }
  | { type: 'itemDiscount'; key: string; discount: Discount | null }
  | { type: 'orderDiscount'; discount: Discount | null }
  | { type: 'authorize'; token: string; supervisor: string }
  | { type: 'customer'; customer: CartState['customer']; document: string | null }
  | { type: 'reset' };

export const emptyCart = (): CartState => ({
  saleId: uuid(),
  items: [],
  orderDiscount: null,
  removed: [],
  selectedKey: null,
  authorization: null,
  customer: null,
  customerDocument: null,
});

const roundQuantity = (value: number) => Math.round(value * 1000) / 1000;

/** Produto vendido por peso/volume: cada pesagem é uma linha separada. */
const isWeighed = (unit: Unit) => ['KG', 'G', 'L', 'ML', 'M'].includes(unit);

export function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'add': {
      const { product, quantity } = action;
      const same = !isWeighed(product.unit)
        ? state.items.find((i) => i.productId === product.productId && !i.discount && i.unitPrice === product.unitPrice)
        : undefined;
      if (same) {
        return {
          ...state,
          items: state.items.map((i) => (i === same ? { ...i, quantity: roundQuantity(i.quantity + quantity) } : i)),
          selectedKey: same.key,
        };
      }
      const item: CartItem = { ...product, key: uuid(), quantity: roundQuantity(quantity), discount: null };
      return { ...state, items: [...state.items, item], selectedKey: item.key };
    }
    case 'setQuantity': {
      const current = state.items.find((i) => i.key === action.key);
      if (!current) return state;
      const quantity = roundQuantity(action.quantity);
      // Diminuir a quantidade também é um cancelamento parcial: fica registrado.
      const removed =
        quantity < current.quantity
          ? [...state.removed, { productId: current.productId, name: current.name, quantity: roundQuantity(current.quantity - quantity), at: new Date().toISOString() }]
          : state.removed;
      return { ...state, removed, items: state.items.map((i) => (i.key === action.key ? { ...i, quantity } : i)) };
    }
    case 'remove': {
      const index = state.items.findIndex((i) => i.key === action.key);
      if (index < 0) return state;
      const item = state.items[index];
      const items = state.items.filter((i) => i.key !== action.key);
      const next = items[Math.min(index, items.length - 1)];
      return {
        ...state,
        items,
        selectedKey: next?.key ?? null,
        removed: [...state.removed, { productId: item.productId, name: item.name, quantity: item.quantity, at: new Date().toISOString() }],
      };
    }
    case 'select':
      return { ...state, selectedKey: action.key };
    case 'moveSelection': {
      if (state.items.length === 0) return state;
      const index = state.items.findIndex((i) => i.key === state.selectedKey);
      const nextIndex = Math.min(Math.max((index < 0 ? state.items.length : index) + action.delta, 0), state.items.length - 1);
      return { ...state, selectedKey: state.items[nextIndex].key };
    }
    case 'itemDiscount':
      return { ...state, items: state.items.map((i) => (i.key === action.key ? { ...i, discount: action.discount } : i)) };
    case 'orderDiscount':
      return { ...state, orderDiscount: action.discount };
    case 'authorize':
      return { ...state, authorization: { token: action.token, supervisor: action.supervisor } };
    case 'customer':
      return { ...state, customer: action.customer, customerDocument: action.document };
    case 'reset':
      return emptyCart();
  }
}

const cartKey = (terminal: string) => `pdv:cart:${terminal}`;

export function loadCart(terminal: string): CartState {
  try {
    const raw = localStorage.getItem(cartKey(terminal));
    if (raw) {
      const parsed = JSON.parse(raw) as CartState;
      if (parsed?.saleId && Array.isArray(parsed.items)) return { ...emptyCart(), ...parsed };
    }
  } catch {
    /* carrinho corrompido ou sem armazenamento: começa vazio */
  }
  return emptyCart();
}

export function saveCart(terminal: string, cart: CartState) {
  try {
    if (cart.items.length === 0 && cart.removed.length === 0) localStorage.removeItem(cartKey(terminal));
    else localStorage.setItem(cartKey(terminal), JSON.stringify(cart));
  } catch {
    /* sem armazenamento: a venda só não sobrevive a um recarregamento */
  }
}
