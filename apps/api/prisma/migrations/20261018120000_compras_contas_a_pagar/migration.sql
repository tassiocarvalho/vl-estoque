-- DRS v2: fornecedores (RF17), entrada de mercadoria por nota com custo médio (RF18) e contas a pagar (RF24).
-- O custo do produto passa a ter 4 casas (custo médio ponderado); nenhum dado existente é perdido.

-- CreateEnum
CREATE TYPE "PurchaseInvoiceStatus" AS ENUM ('DRAFT', 'FINALIZED', 'CANCELED');

-- CreateEnum
CREATE TYPE "PayableStatus" AS ENUM ('OPEN', 'PAID', 'CANCELED');

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "lastCost" DECIMAL(14,4) NOT NULL DEFAULT 0,
ALTER COLUMN "costPrice" SET DATA TYPE DECIMAL(14,4);

-- AlterTable
ALTER TABLE "sale_items" ALTER COLUMN "unitCost" SET DATA TYPE DECIMAL(14,4);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "tradeName" TEXT,
    "document" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "contactName" TEXT,
    "leadTimeDays" INTEGER,
    "paymentTerms" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_suppliers" (
    "productId" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "supplierCode" TEXT,
    "factor" DECIMAL(12,3) NOT NULL DEFAULT 1,
    "lastCost" DECIMAL(14,4),
    "lastPurchaseAt" TIMESTAMP(3),
    "preferred" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_suppliers_pkey" PRIMARY KEY ("productId","supplierId")
);

-- CreateTable
CREATE TABLE "purchase_invoices" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "supplierId" UUID,
    "documentNumber" TEXT,
    "series" TEXT,
    "accessKey" TEXT,
    "issueDate" DATE,
    "status" "PurchaseInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "freight" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "otherCosts" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "declaredTotal" DECIMAL(12,2),
    "installments" JSONB,
    "notes" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "createdById" UUID,
    "finalizedById" UUID,
    "finalizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_invoice_items" (
    "id" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "productId" UUID,
    "supplierCode" TEXT,
    "description" TEXT NOT NULL,
    "barcode" TEXT,
    "purchaseUnit" TEXT,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unitCost" DECIMAL(14,4) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "factor" DECIMAL(12,3) NOT NULL DEFAULT 1,

    CONSTRAINT "purchase_invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_categories" (
    "id" UUID NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payables" (
    "id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "categoryId" UUID NOT NULL,
    "supplierId" UUID,
    "invoiceId" UUID,
    "documentNumber" TEXT,
    "installment" INTEGER NOT NULL DEFAULT 1,
    "installments" INTEGER NOT NULL DEFAULT 1,
    "dueDate" DATE NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "PayableStatus" NOT NULL DEFAULT 'OPEN',
    "paidAt" DATE,
    "paidAmount" DECIMAL(12,2),
    "paymentMethodName" TEXT,
    "notes" TEXT,
    "attachment" BYTEA,
    "attachmentName" TEXT,
    "attachmentType" TEXT,
    "createdById" UUID,
    "paidById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payables_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_document_key" ON "suppliers"("document");

-- CreateIndex
CREATE INDEX "suppliers_name_idx" ON "suppliers"("name");

-- CreateIndex
CREATE INDEX "product_suppliers_supplierId_supplierCode_idx" ON "product_suppliers"("supplierId", "supplierCode");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_invoices_number_key" ON "purchase_invoices"("number");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_invoices_accessKey_key" ON "purchase_invoices"("accessKey");

-- CreateIndex
CREATE INDEX "purchase_invoices_status_createdAt_idx" ON "purchase_invoices"("status", "createdAt");

-- CreateIndex
CREATE INDEX "purchase_invoice_items_invoiceId_idx" ON "purchase_invoice_items"("invoiceId");

-- CreateIndex
CREATE INDEX "purchase_invoice_items_productId_idx" ON "purchase_invoice_items"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "expense_categories_code_key" ON "expense_categories"("code");

-- CreateIndex
CREATE UNIQUE INDEX "expense_categories_name_key" ON "expense_categories"("name");

-- CreateIndex
CREATE INDEX "payables_status_dueDate_idx" ON "payables"("status", "dueDate");

-- CreateIndex
CREATE INDEX "payables_paidAt_idx" ON "payables"("paidAt");

-- CreateIndex
CREATE INDEX "payables_invoiceId_idx" ON "payables"("invoiceId");

-- AddForeignKey
ALTER TABLE "product_suppliers" ADD CONSTRAINT "product_suppliers_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_suppliers" ADD CONSTRAINT "product_suppliers_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_finalizedById_fkey" FOREIGN KEY ("finalizedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoice_items" ADD CONSTRAINT "purchase_invoice_items_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "purchase_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoice_items" ADD CONSTRAINT "purchase_invoice_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payables" ADD CONSTRAINT "payables_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payables" ADD CONSTRAINT "payables_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payables" ADD CONSTRAINT "payables_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "purchase_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- O último custo começa igual ao custo atual.
UPDATE "products" SET "lastCost" = "costPrice";

-- Categorias de despesa de fábrica (a loja pode criar outras).
INSERT INTO "expense_categories" ("id", "code", "name") VALUES
  (gen_random_uuid(), 'MERCHANDISE', 'Compra de mercadorias'),
  (gen_random_uuid(), NULL, 'Aluguel'),
  (gen_random_uuid(), NULL, 'Energia elétrica'),
  (gen_random_uuid(), NULL, 'Água'),
  (gen_random_uuid(), NULL, 'Internet e telefone'),
  (gen_random_uuid(), NULL, 'Salários e encargos'),
  (gen_random_uuid(), NULL, 'Impostos e taxas'),
  (gen_random_uuid(), NULL, 'Manutenção'),
  (gen_random_uuid(), NULL, 'Outras despesas');
