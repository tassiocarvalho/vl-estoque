-- Etiqueta de balança (código do produto na balança) e kits / combos.

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "isKit" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "scaleCode" TEXT;

-- AlterTable
ALTER TABLE "sale_items" ADD COLUMN     "kitComponents" JSONB;

-- CreateTable
CREATE TABLE "kit_components" (
    "kitId" UUID NOT NULL,
    "componentId" UUID NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "kit_components_pkey" PRIMARY KEY ("kitId","componentId")
);

-- CreateIndex
CREATE INDEX "kit_components_componentId_idx" ON "kit_components"("componentId");

-- CreateIndex
CREATE UNIQUE INDEX "products_scaleCode_key" ON "products"("scaleCode");

-- AddForeignKey
ALTER TABLE "kit_components" ADD CONSTRAINT "kit_components_kitId_fkey" FOREIGN KEY ("kitId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kit_components" ADD CONSTRAINT "kit_components_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

