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
  email: string | null;
  role: Role;
  mustChangePassword: boolean;
  hasPin: boolean;
  /** Ciência da versão atual do Termo de Uso e Política de Privacidade. */
  termsAccepted: boolean;
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
  /** Custo médio ponderado (atualizado pelas notas de entrada). */
  costPrice: number;
  /** Custo unitário da última nota de entrada. */
  lastCost: number;
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
  product: { id: string; name: string; sku: string; barcode: string | null; unit: Unit; currentStock: number; lastCost: number };
  /** Fornecedor preferencial (ou o da última compra). */
  supplier: {
    id: string;
    name: string;
    tradeName: string | null;
    phone: string | null;
    supplierCode: string | null;
    preferred: boolean;
    lastCost: number | null;
  } | null;
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
  email: string | null;
  termsAcceptedAt: string | null;
  anonymized: boolean;
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

export interface CompanyInfo {
  name: string;
  cnpj: string;
  address: string;
  dpoName: string;
  dpoEmail: string;
}

export interface LegalInfo {
  termsVersion: string;
  company: CompanyInfo;
}

export interface MailSettings {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  fromName: string;
  hasPassword: boolean;
  configured: boolean;
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

/** Natureza da forma de pagamento (as formas em si são configuráveis). */
export type PaymentKind = 'CASH' | 'PIX' | 'CREDIT_CARD' | 'DEBIT_CARD' | 'VOUCHER' | 'CHECK' | 'OTHER';

export interface PaymentMethod {
  id: string;
  code: string | null;
  name: string;
  kind: PaymentKind;
  active: boolean;
  allowsChange: boolean;
  requiresCustomer: boolean;
  feePercent: number;
  settlementDays: number;
  position: number;
  /** Forma de fábrica (não pode ser excluída). */
  system: boolean;
}

/** Forma de pagamento registrada numa venda (cópia do nome no momento da venda). */
export interface SalePaymentLine {
  methodId: string;
  name: string;
  kind: PaymentKind;
  amount: number;
}

export interface MethodTotal {
  id: string;
  name: string;
  kind: PaymentKind;
  amount: number;
}

export interface Customer {
  id: string;
  name: string;
  document: string | null;
  phone: string | null;
  email: string | null;
  birthDate: string | null;
  address: string | null;
  notes: string | null;
  active: boolean;
  consentAt: string | null;
  consentChannel: string | null;
  marketingConsent: boolean;
  anonymizedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerDetail extends Customer {
  stats: { purchases: number; total: number; averageTicket: number; lastPurchaseAt: string | null };
}
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
  methods: MethodTotal[];
  cashSales: number;
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
  customer: { id: string; name: string | null } | null;
  customerDocument: string | null;
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
  payments: SalePaymentLine[];
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
  methods: MethodTotal[];
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

// ─── Compras ──────────────────────────────────────────────────────────────────

export interface Supplier {
  id: string;
  name: string;
  tradeName: string | null;
  document: string | null;
  phone: string | null;
  email: string | null;
  contactName: string | null;
  leadTimeDays: number | null;
  paymentTerms: string | null;
  notes: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductSupplierLink {
  productId: string;
  supplierId: string;
  product: { id: string; name: string; sku: string; unit: Unit; costPrice: number; deletedAt: string | null };
  supplier: { id: string; name: string; tradeName: string | null };
  supplierCode: string | null;
  factor: number;
  lastCost: number | null;
  lastPurchaseAt: string | null;
  preferred: boolean;
}

export interface SupplierDetail extends Supplier {
  products: ProductSupplierLink[];
  stats: { invoices: number; lastPurchaseAt: string | null; openPayables: number; openAmount: number };
}

export type PurchaseInvoiceStatus = 'DRAFT' | 'FINALIZED' | 'CANCELED';

export interface Installment {
  dueDate: string;
  amount: number;
}

export interface PurchaseInvoiceItem {
  id: string;
  position: number;
  productId: string | null;
  product: {
    id: string;
    name: string;
    sku: string;
    barcode: string | null;
    unit: Unit;
    costPrice: number;
    salePrice: number;
    deletedAt: string | null;
  } | null;
  supplierCode: string | null;
  description: string;
  barcode: string | null;
  purchaseUnit: string | null;
  quantity: number;
  unitCost: number;
  total: number;
  factor: number;
}

export interface PurchaseInvoice {
  id: string;
  number: number;
  status: PurchaseInvoiceStatus;
  source: 'MANUAL' | 'XML';
  supplier: { id: string; name: string; tradeName: string | null; document: string | null } | null;
  documentNumber: string | null;
  series: string | null;
  accessKey: string | null;
  issueDate: string | null;
  freight: number;
  otherCosts: number;
  discount: number;
  declaredTotal: number | null;
  productsTotal: number;
  total: number;
  installments: Installment[];
  notes: string | null;
  createdBy: { id: string; name: string } | null;
  finalizedBy: { id: string; name: string } | null;
  finalizedAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: PurchaseInvoiceItem[];
  payables: { id: string; installment: number; installments: number; dueDate: string; amount: number; status: PayableStatus }[];
}

export type PurchaseInvoiceListItem = Omit<PurchaseInvoice, 'items'> & { itemsCount: number };

export interface ImportPreviewRow {
  line: number;
  sku: string;
  name: string | null;
  action: 'create' | 'update';
  errors: string[];
}

export interface ImportResult {
  applied: boolean;
  summary: { rows: number; create: number; update: number; errors: number; ignoredColumns: string[] };
  rows: ImportPreviewRow[];
}

// ─── Financeiro ───────────────────────────────────────────────────────────────

export type PayableStatus = 'OPEN' | 'PAID' | 'CANCELED';

export interface ExpenseCategory {
  id: string;
  code: string | null;
  name: string;
  active: boolean;
}

export interface Payable {
  id: string;
  description: string;
  category: { id: string; name: string; code: string | null };
  supplier: { id: string; name: string; tradeName: string | null } | null;
  invoice: { id: string; number: number; documentNumber: string | null } | null;
  documentNumber: string | null;
  installment: number;
  installments: number;
  dueDate: string;
  amount: number;
  status: PayableStatus;
  paidAt: string | null;
  paidAmount: number | null;
  paymentMethodName: string | null;
  notes: string | null;
  attachmentName: string | null;
  attachmentType: string | null;
  hasAttachment: boolean;
  overdue: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AmountCount {
  count: number;
  amount: number;
}

export interface PayablesSummary {
  overdue: AmountCount;
  today: AmountCount;
  next7: AmountCount;
  open: AmountCount;
}
