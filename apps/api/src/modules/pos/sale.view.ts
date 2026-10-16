import { Prisma } from '@prisma/client';
import { toNumber } from '../../common/decimal';

export const saleInclude = {
  items: { orderBy: { position: 'asc' } },
  payments: true,
  session: { select: { id: true, terminal: true, status: true } },
  operator: { select: { id: true, name: true } },
  discountAuthorizedBy: { select: { id: true, name: true } },
  canceledBy: { select: { id: true, name: true } },
} satisfies Prisma.SaleInclude;

type SaleWithRelations = Prisma.SaleGetPayload<{ include: typeof saleInclude }>;

const optionalNumber = (value: Prisma.Decimal | null) => (value === null ? null : toNumber(value));

export function toSaleView(sale: SaleWithRelations) {
  return {
    id: sale.id,
    number: sale.number,
    status: sale.status,
    session: sale.session,
    operator: sale.operator,
    grossTotal: toNumber(sale.grossTotal),
    itemsDiscount: toNumber(sale.itemsDiscount),
    orderDiscountType: sale.orderDiscountType,
    orderDiscountValue: optionalNumber(sale.orderDiscountValue),
    orderDiscount: toNumber(sale.orderDiscount),
    total: toNumber(sale.total),
    paidTotal: toNumber(sale.paidTotal),
    change: toNumber(sale.change),
    discountAuthorizedBy: sale.discountAuthorizedBy,
    offline: sale.offline,
    occurredAt: sale.occurredAt,
    canceledAt: sale.canceledAt,
    canceledBy: sale.canceledBy,
    cancelReason: sale.cancelReason,
    items: sale.items.map((item) => ({
      id: item.id,
      position: item.position,
      productId: item.productId,
      productName: item.productName,
      sku: item.sku,
      unit: item.unit,
      quantity: toNumber(item.quantity),
      unitPrice: toNumber(item.unitPrice),
      discountType: item.discountType,
      discountValue: optionalNumber(item.discountValue),
      discount: toNumber(item.discount),
      total: toNumber(item.total),
    })),
    payments: sale.payments.map((p) => ({ method: p.method, amount: toNumber(p.amount) })),
  };
}

export type SaleView = ReturnType<typeof toSaleView>;
