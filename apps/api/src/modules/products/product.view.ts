import { Category, KitComponent, Prisma, Product, Unit } from '@prisma/client';
import { toNumber } from '../../common/decimal';
import { classifyStock } from './domain/replenishment';

/** Inclusão padrão para montar a visão do produto (categoria + categoria pai). */
export const productInclude = {
  category: { include: { parent: true } },
  kitComponents: {
    include: { component: { select: { id: true, name: true, sku: true, unit: true, currentStock: true, costPrice: true, deletedAt: true } } },
  },
} satisfies Prisma.ProductInclude;

type ComponentRow = KitComponent & {
  component: { id: string; name: string; sku: string; unit: Unit; currentStock: Prisma.Decimal; costPrice: Prisma.Decimal; deletedAt: Date | null };
};

type ProductWithCategory = Product & { category: Category & { parent: Category | null }; kitComponents?: ComponentRow[] };

/** Kit: quantos dá para montar com o estoque dos itens, e o custo somado dos itens. */
export function kitSummary(components: ComponentRow[]) {
  const items = components.map((c) => ({
    productId: c.componentId,
    name: c.component.name,
    sku: c.component.sku,
    unit: c.component.unit,
    quantity: toNumber(c.quantity),
    stock: toNumber(c.component.currentStock),
    costPrice: toNumber(c.component.costPrice),
  }));
  const available = items.length ? Math.max(0, Math.floor(Math.min(...items.map((i) => (i.quantity > 0 ? i.stock / i.quantity : 0))))) : 0;
  const cost = Math.round(items.reduce((sum, i) => sum + i.costPrice * i.quantity, 0) * 10_000) / 10_000;
  return { items, available, cost };
}

export function toProductView(product: ProductWithCategory) {
  const indicators = {
    minimumStock: toNumber(product.minimumStock),
    safetyStock: toNumber(product.safetyStock),
    reorderPoint: toNumber(product.reorderPoint),
  };
  const kit = product.isKit ? kitSummary(product.kitComponents ?? []) : null;
  const currentStock = kit ? kit.available : toNumber(product.currentStock);
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
    replenishmentEnabled: kit ? false : product.replenishmentEnabled,
    isKit: product.isKit,
    scaleCode: product.scaleCode,
    components: kit?.items ?? [],
    avgDailyConsumption: toNumber(product.avgDailyConsumption),
    maxDailyConsumption: toNumber(product.maxDailyConsumption),
    leadTimeDays: product.leadTimeDays,
    currentStock,
    costPrice: kit ? kit.cost : toNumber(product.costPrice),
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
