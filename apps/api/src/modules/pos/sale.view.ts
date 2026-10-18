import { Prisma } from '@prisma/client';
import { toNumber } from '../../common/decimal';

export const saleInclude = {
  items: { orderBy: { position: 'asc' }, include: { returnItems: { select: { quantity: true } } } },
  payments: { include: { storeCredit: { select: { code: true } } } },
  returns: { select: { id: true, number: true, total: true, refundMethod: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
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
    customer: sale.customerId ? { id: sale.customerId, name: sale.customerName } : null,
    customerDocument: sale.customerDocument,
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
      returnedQuantity: Math.round(item.returnItems.reduce((sum, r) => sum + toNumber(r.quantity), 0) * 1000) / 1000,
    })),
    payments: sale.payments.map((p) => ({
      methodId: p.paymentMethodId,
      name: p.methodName,
      kind: p.methodKind,
      amount: toNumber(p.amount),
      storeCreditCode: p.storeCredit?.code ?? null,
      installments: p.installments,
    })),
    returns: sale.returns.map((r) => ({ ...r, total: toNumber(r.total) })),
  };
}

export type SaleView = ReturnType<typeof toSaleView>;
