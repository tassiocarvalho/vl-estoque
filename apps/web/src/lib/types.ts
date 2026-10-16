/** Tipos das respostas da API. */

export type Role = 'ADMIN' | 'MANAGER' | 'STOCKIST' | 'CASHIER';
export type Unit = 'UN' | 'KG' | 'G' | 'L' | 'ML' | 'M' | 'CX' | 'PCT' | 'DZ';
export type StockStatus = 'OUT_OF_STOCK' | 'CRITICAL' | 'REORDER' | 'OK';
export type MovementType =
  | 'IN_PURCHASE'
  | 'IN_RETURN'
  | 'IN_ADJUSTMENT'
  | 'IN_SALE_CANCEL'
  | 'OUT_SALE'
  | 'OUT_LOSS'
  | 'OUT_ADJUSTMENT';
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
  /** Desligado: sem consumo/prazo, ponto de pedido nem solicitação automática. */
  replenishmentEnabled: boolean;
  avgDailyConsumption: number;
  maxDailyConsumption: number;
  leadTimeDays: number;
  currentStock: number;
  costPrice: number;
  salePrice: number;
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

export type Theme = 'light' | 'dark' | 'system';
export type PaperSize = '80mm' | '58mm' | 'A4';

/** Identidade visual da loja (white-label). */
export interface StoreBranding {
  name: string;
  tagline: string;
  document: string;
  address: string;
  phone: string;
  primaryColor: string;
  theme: Theme;
  logo: string | null;
  receiptHeader: string;
  receiptFooter: string;
}

export interface PrinterSettings {
  paper: PaperSize;
  autoPrint: boolean;
  connection: 'browser' | 'network';
  host: string;
  port: number;
  openDrawerOnCash: boolean;
}

export interface PosSettings {
  maxDiscountPercent: number;
  blockSaleWithoutStock: boolean;
}

export interface SystemSettings {
  trashRetentionDays: number;
  orderCoverageDays: number;
  allowNegativeStock: boolean;
  pinRequired: { productWrite: boolean; productDelete: boolean; stockIn: boolean; stockOut: boolean };
  store: StoreBranding;
  printer: PrinterSettings;
  pos: PosSettings;
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

// ─── Frente de caixa ──────────────────────────────────────────────────────────

export type PaymentMethod = 'CASH' | 'PIX' | 'CREDIT_CARD' | 'DEBIT_CARD';
export type DiscountType = 'AMOUNT' | 'PERCENT';
export type SaleStatus = 'COMPLETED' | 'CANCELED';
export type CashMovementType = 'SUPPLY' | 'WITHDRAWAL';

export interface Discount {
  type: DiscountType;
  value: number;
}

export interface CashSummary {
  openingAmount: number;
  salesCount: number;
  canceledCount: number;
  salesTotal: number;
  byMethod: Record<PaymentMethod, number>;
  supplies: number;
  withdrawals: number;
  expectedCash: number;
}

export interface CashMovement {
  id: string;
  type: CashMovementType;
  amount: number;
  reason: string;
  user: { id: string; name: string };
  authorizedBy: { id: string; name: string } | null;
  createdAt: string;
}

export interface CashSession {
  id: string;
  terminal: string;
  status: 'OPEN' | 'CLOSED';
  openingAmount: number;
  openedAt: string;
  openedBy: { id: string; name: string };
  closedAt: string | null;
  closedBy: { id: string; name: string } | null;
  expectedCash: number | null;
  countedCash: number | null;
  difference: number | null;
  closingNote: string | null;
  summary: CashSummary;
  movements: CashMovement[];
}

export interface CashSessionListItem {
  id: string;
  terminal: string;
  status: 'OPEN' | 'CLOSED';
  openingAmount: number;
  openedAt: string;
  openedBy: { id: string; name: string };
  closedAt: string | null;
  closedBy: { id: string; name: string } | null;
  salesCount: number;
  salesTotal: number | null;
  expectedCash: number | null;
  countedCash: number | null;
  difference: number | null;
}

export interface SaleItem {
  id: string;
  position: number;
  productId: string;
  productName: string;
  sku: string;
  unit: Unit;
  quantity: number;
  unitPrice: number;
  discountType: DiscountType | null;
  discountValue: number | null;
  discount: number;
  total: number;
}

export interface Sale {
  id: string;
  number: number;
  status: SaleStatus;
  session: { id: string; terminal: string; status: 'OPEN' | 'CLOSED' };
  operator: { id: string; name: string };
  grossTotal: number;
  itemsDiscount: number;
  orderDiscountType: DiscountType | null;
  orderDiscountValue: number | null;
  orderDiscount: number;
  total: number;
  paidTotal: number;
  change: number;
  discountAuthorizedBy: { id: string; name: string } | null;
  offline: boolean;
  occurredAt: string;
  canceledAt: string | null;
  canceledBy: { id: string; name: string } | null;
  cancelReason: string | null;
  items: SaleItem[];
  payments: { method: PaymentMethod; amount: number }[];
}

export interface SalesReport {
  period: { from: string; to: string };
  totals: {
    salesCount: number;
    canceledCount: number;
    gross: number;
    discounts: number;
    net: number;
    averageTicket: number;
    cost: number;
    margin: number;
  };
  byMethod: Record<PaymentMethod, number>;
  byOperator: { operator: { id: string; name: string }; count: number; total: number }[];
  byDay: { date: string; count: number; total: number }[];
  topProducts: {
    productId: string;
    name: string;
    sku: string;
    unit: Unit;
    quantity: number;
    revenue: number;
    cost: number;
    margin: number;
  }[];
}
