-- Fase 1 do DRS v2: clientes (RF12/RF22), cliente/CPF na venda (RF13) e formas de pagamento configuráveis (RF14).
-- Os pagamentos já registrados são convertidos para as novas formas, sem perda de dados.

-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('CASH', 'PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'VOUCHER', 'CHECK', 'OTHER');

-- CreateTable
CREATE TABLE "payment_methods" (
    "id" UUID NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "kind" "PaymentKind" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "allowsChange" BOOLEAN NOT NULL DEFAULT false,
    "requiresCustomer" BOOLEAN NOT NULL DEFAULT false,
    "feePercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "settlementDays" INTEGER NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_methods_code_key" ON "payment_methods"("code");

-- Formas de pagamento de fábrica (os códigos das quatro primeiras são os do enum antigo).
INSERT INTO "payment_methods" ("id", "code", "name", "kind", "active", "allowsChange", "position", "updatedAt") VALUES
  (gen_random_uuid(), 'CASH',          'Dinheiro',          'CASH',        true,  true,  1, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'PIX',           'PIX',               'PIX',         true,  false, 2, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'CREDIT_CARD',   'Cartão de crédito', 'CREDIT_CARD', true,  false, 3, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'DEBIT_CARD',    'Cartão de débito',  'DEBIT_CARD',  true,  false, 4, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'MEAL_VOUCHER',  'Vale-alimentação',  'VOUCHER',     true,  false, 5, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'FOOD_VOUCHER',  'Vale-refeição',     'VOUCHER',     true,  false, 6, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'CHECK',         'Cheque',            'CHECK',       false, false, 7, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'OTHER',         'Outros',            'OTHER',       false, false, 8, CURRENT_TIMESTAMP);

-- Pagamentos existentes: liga cada um à forma correspondente e guarda o nome/natureza.
ALTER TABLE "sale_payments"
  ADD COLUMN "paymentMethodId" UUID,
  ADD COLUMN "methodName" TEXT,
  ADD COLUMN "methodKind" "PaymentKind";

UPDATE "sale_payments" sp
SET "paymentMethodId" = pm."id", "methodName" = pm."name", "methodKind" = pm."kind"
FROM "payment_methods" pm
WHERE pm."code" = sp."method"::text;

ALTER TABLE "sale_payments"
  ALTER COLUMN "paymentMethodId" SET NOT NULL,
  ALTER COLUMN "methodName" SET NOT NULL,
  ALTER COLUMN "methodKind" SET NOT NULL,
  DROP COLUMN "method";

DROP TYPE "PaymentMethod";

CREATE INDEX "sale_payments_paymentMethodId_idx" ON "sale_payments"("paymentMethodId");
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "payment_methods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "document" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "birthDate" DATE,
    "address" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "consentAt" TIMESTAMP(3),
    "consentChannel" TEXT,
    "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
    "anonymizedAt" TIMESTAMP(3),
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customers_document_key" ON "customers"("document");
CREATE INDEX "customers_name_idx" ON "customers"("name");
CREATE INDEX "customers_phone_idx" ON "customers"("phone");

-- Cliente e CPF na venda
ALTER TABLE "sales" ADD COLUMN "customerDocument" TEXT,
ADD COLUMN "customerId" UUID,
ADD COLUMN "customerName" TEXT;

CREATE INDEX "sales_customerId_idx" ON "sales"("customerId");
ALTER TABLE "sales" ADD CONSTRAINT "sales_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
