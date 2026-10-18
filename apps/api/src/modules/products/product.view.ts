import { Category, Prisma, Product } from '@prisma/client';
import { toNumber } from '../../common/decimal';
import { classifyStock } from './domain/replenishment';

/** Inclusão padrão para montar a visão do produto (categoria + categoria pai). */
export const productInclude = {
  category: { include: { parent: true } },
} satisfies Prisma.ProductInclude;

type ProductWithCategory = Product & { category: Category & { parent: Category | null } };

export function toProductView(product: ProductWithCategory) {
  const indicators = {
    minimumStock: toNumber(product.minimumStock),
    safetyStock: toNumber(product.safetyStock),
    reorderPoint: toNumber(product.reorderPoint),
  };
  const currentStock = toNumber(product.currentStock);
  const { category } = product;

  return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    barcode: product.barcode,
    unit: product.unit,
    category: {
      id: category.id,
      name: category.name,
      path: category.parent ? `${category.parent.name} › ${category.name}` : category.name,
    },
    replenishmentEnabled: product.replenishmentEnabled,
    avgDailyConsumption: toNumber(product.avgDailyConsumption),
    maxDailyConsumption: toNumber(product.maxDailyConsumption),
    leadTimeDays: product.leadTimeDays,
    currentStock,
    costPrice: toNumber(product.costPrice),
    lastCost: toNumber(product.lastCost),
    salePrice: toNumber(product.salePrice),
    ...indicators,
    status: classifyStock(currentStock, indicators),
    deletedAt: product.deletedAt,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

export type ProductView = ReturnType<typeof toProductView>;
