/** Tipos das respostas da API. */

export type Role = 'ADMIN' | 'STOCKIST' | 'CASHIER';
export type Unit = 'UN' | 'KG' | 'G' | 'L' | 'ML' | 'M' | 'CX' | 'PCT' | 'DZ';
export type StockStatus = 'OUT_OF_STOCK' | 'CRITICAL' | 'REORDER' | 'OK';
export type MovementType = 'IN_PURCHASE' | 'IN_RETURN' | 'IN_ADJUSTMENT' | 'OUT_SALE' | 'OUT_LOSS' | 'OUT_ADJUSTMENT';
export type PurchaseRequestStatus = 'PENDING' | 'ORDERED' | 'RECEIVED' | 'CANCELED';

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Profile {
  id: string;
  name: string;
  username: string;
  role: Role;
  mustChangePassword: boolean;
  hasPin: boolean;
  permissions: string[];
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  unit: Unit;
  category: { id: string; name: string; path: string };
  avgDailyConsumption: number;
  maxDailyConsumption: number;
  leadTimeDays: number;
  currentStock: number;
  minimumStock: number;
  safetyStock: number;
  reorderPoint: number;
  status: StockStatus;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TrashedProduct extends Product {
  purgeAt: string;
  daysLeft: number;
}

export interface Category {
  id: string;
  name: string;
  parentId: string | null;
  _count: { products: number };
  children: (Omit<Category, 'children'> & { children?: never })[];
}

export interface Movement {
  id: string;
  productId: string;
  type: MovementType;
  direction: 'IN' | 'OUT';
  quantity: number;
  balanceAfter: number;
  note: string | null;
  source: 'APP' | 'PDV';
  occurredAt: string;
  product: { id: string; name: string; sku: string; unit: Unit };
  user: { id: string; name: string } | null;
}

export interface RegisterMovementResult {
  movement: Movement;
  product?: Product;
  purchaseRequestCreated: boolean;
  duplicated: boolean;
}

export interface PurchaseRequest {
  id: string;
  status: PurchaseRequestStatus;
  suggestedQuantity: number;
  stockAtRequest: number;
  reorderPoint: number;
  note: string | null;
  automatic: boolean;
  createdAt: string;
  closedAt: string | null;
  product: { id: string; name: string; sku: string; barcode: string | null; unit: Unit; currentStock: number };
  createdBy: { id: string; name: string } | null;
}

export interface UserAccount {
  id: string;
  name: string;
  username: string;
  role: Role;
  active: boolean;
  hasPin: boolean;
  mustChangePassword: boolean;
  locked: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface SystemSettings {
  trashRetentionDays: number;
  orderCoverageDays: number;
  allowNegativeStock: boolean;
  pinRequired: { productWrite: boolean; productDelete: boolean; stockIn: boolean; stockOut: boolean };
}

export interface Dashboard {
  products: { total: number; outOfStock: number; critical: number; reorder: number; ok: number };
  openPurchaseRequests: number;
  today: { entries: number; exits: number };
  alerts: Product[];
}

export interface ReportRow {
  product: { id: string; name: string; sku: string; unit: Unit; category: string };
  entries: number;
  exits: number;
  net: number;
  movements: number;
  currentStock: number;
  reorderPoint: number;
  status: StockStatus;
}

export interface MovementsReport {
  period: { from: string; to: string };
  totals: { entryCount: number; exitCount: number; productsMoved: number };
  byType: Record<MovementType, number>;
  rows: ReportRow[];
  stagnant: ReportRow[];
  ruptures: ReportRow[];
  purchaseRequests: (Omit<PurchaseRequest, 'product' | 'automatic'> & {
    product: { name: string; sku: string; unit: Unit };
  })[];
}

export interface AuditLog {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  details: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
  user: { name: string; username: string } | null;
}
