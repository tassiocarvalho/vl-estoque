/** Tipos das respostas da API. */

export type Role = 'ADMIN' | 'MANAGER' | 'STOCKIST' | 'CASHIER';
export type Unit = 'UN' | 'KG' | 'G' | 'L' | 'ML' | 'M' | 'CX' | 'PCT' | 'DZ';
export type StockStatus = 'OUT_OF_STOCK' | 'CRITICAL' | 'REORDER' | 'OK';
export type MovementType =
  | 'IN_PURCHASE'
  | 'IN_RETURN'
  | 'IN_ADJUSTMENT'
  | 'IN_SALE_CANCEL'
  | 'IN_SALE_RETURN'
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
  /** Kit / combo: o saldo é quantos dá para montar com o estoque dos itens. */
  isKit: boolean;
  /** Código do produto na balança (etiqueta com peso ou preço embutido). */
  scaleCode: string | null;
  components: { productId: string; name: string; sku: string; unit: Unit; quantity: number; stock: number; costPrice: number }[];
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
  /** Prazo (dias) para troca e devolução (0 = sem prazo). */
  returnDays: number;
  /** Validade do vale-troca em dias (0 = não vence). */
  voucherValidityDays: number;
}

export interface ScaleSettings {
  enabled: boolean;
  prefix: string;
  codeLength: number;
  mode: 'PRICE' | 'WEIGHT';
}

export interface CreditSettings {
  firstDueDays: number;
  intervalDays: number;
  blockOverdue: boolean;
  defaultLimit: number;
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
  credit: CreditSettings;
  scale: ScaleSettings;
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
export type PaymentKind = 'CASH' | 'PIX' | 'CREDIT_CARD' | 'DEBIT_CARD' | 'VOUCHER' | 'CHECK' | 'OTHER' | 'STORE_CREDIT' | 'ON_ACCOUNT';

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
  /** Vale-troca usado neste pagamento. */
  storeCreditCode?: string | null;
  /** Parcelas do fiado. */
  installments?: number | null;
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
  /** Limite do fiado (0 = não liberado). */
  creditLimit: number;
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
  receiptsCount: number;
  receiptsTotal: number;
  receiptMethods: MethodTotal[];
  cashReceipts: number;
  returnsCount: number;
  returnsTotal: number;
  cashRefunds: number;
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
  /** Quantidade já devolvida (trocas e devoluções). */
  returnedQuantity?: number;
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
  returns?: { id: string; number: number; total: number; refundMethod: RefundMethod; createdAt: string }[];
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
    returnsCount?: number;
    returns?: number;
    netAfterReturns?: number;
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

// ─── Pós-venda: devolução, vale-troca e fiado ─────────────────────────────────

export type RefundMethod = 'CASH' | 'ORIGINAL' | 'STORE_CREDIT' | 'ACCOUNT';

export interface ReturnPreview {
  sale: {
    id: string;
    number: number;
    status: SaleStatus;
    occurredAt: string;
    total: number;
    customer: { id: string; name: string } | null;
    payments: { name: string; kind: PaymentKind; amount: number }[];
  };
  daysSinceSale: number;
  deadlineDays: number;
  withinDeadline: boolean;
  items: {
    saleItemId: string;
    productId: string;
    productName: string;
    unit: Unit;
    soldQuantity: number;
    returnedQuantity: number;
    returnableQuantity: number;
    paidTotal: number;
    refundableRemaining: number;
  }[];
  previousReturns: { id: string; number: number; total: number; refundMethod: RefundMethod; createdAt: string }[];
  refundOptions: { cash: boolean; original: string | null; storeCredit: boolean; account: number | null };
}

export interface SaleReturn {
  id: string;
  number: number;
  sale: { id: string; number: number; occurredAt: string };
  session: { id: string; terminal: string } | null;
  customer: { id: string; name: string } | null;
  user: { id: string; name: string };
  authorizedBy: { id: string; name: string } | null;
  reason: string;
  refundMethod: RefundMethod;
  refundMethodName: string | null;
  total: number;
  storeCredit: { id: string; code: string; amount: number; balance: number; expiresAt: string | null } | null;
  createdAt: string;
  items: { id: string; saleItemId: string; productId: string; productName: string; unit: Unit; quantity: number; amount: number; restock: boolean }[];
}

export type StoreCreditStatus = 'ACTIVE' | 'USED' | 'EXPIRED' | 'CANCELED';

export interface StoreCredit {
  id: string;
  code: string;
  customer: { id: string; name: string } | null;
  amount: number;
  balance: number;
  expiresAt: string | null;
  note: string | null;
  createdAt: string;
  canceledAt: string | null;
  status: StoreCreditStatus;
  origin: { returnId: string; returnNumber: number; saleNumber: number } | null;
  entries: { id: string; type: 'ISSUE' | 'REDEEM' | 'REVERSAL' | 'CANCEL'; amount: number; saleId: string | null; createdAt: string }[];
}

export type ReceivableStatus = 'OPEN' | 'PAID' | 'CANCELED';

export interface Receivable {
  id: string;
  customer: { id: string; name: string; phone: string | null };
  sale: { id: string; number: number } | null;
  description: string;
  installment: number;
  installments: number;
  dueDate: string;
  amount: number;
  paidAmount: number;
  balance: number;
  status: ReceivableStatus;
  overdue: boolean;
  daysOverdue: number;
  paidAt: string | null;
  canceledAt: string | null;
  createdAt: string;
}

export interface CreditInfo {
  customerId: string;
  limit: number;
  open: number;
  overdue: number;
  overdueCount: number;
  oldestOverdue: string | null;
  available: number;
  storeCredit: { count: number; balance: number };
  installments: Receivable[];
}

export interface CustomerReceipt {
  id: string;
  number: number;
  customer: { id: string; name: string };
  session: { id: string; terminal: string };
  user: { id: string; name: string };
  methodId: string;
  methodName: string;
  methodKind: PaymentKind;
  amount: number;
  received: number;
  change: number;
  occurredAt: string;
  allocations: { receivableId: string; description: string; installment: number; installments: number; dueDate: string | null; amount: number }[];
  balanceAfter: number | null;
}

export interface CustomerStatement {
  credit: Omit<CreditInfo, 'installments'>;
  receivables: Receivable[];
  receipts: CustomerReceipt[];
}

export interface ReceivablesSummary {
  open: number;
  overdue: number;
  customers: number;
  overdueCustomers: number;
  aging: { current: number; d1_30: number; d31_60: number; d61_90: number; d90: number };
  debtors: { customer: { id: string; name: string; phone: string | null }; open: number; overdue: number; oldestDays: number }[];
}
