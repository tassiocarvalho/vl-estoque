/** Espelha as permissões da API (apps/api/src/common/auth/permissions.ts). */
export const P = {
  PRODUCT_READ: 'product:read',
  PRODUCT_WRITE: 'product:write',
  PRODUCT_DELETE: 'product:delete',
  TRASH_MANAGE: 'trash:manage',
  CATEGORY_MANAGE: 'category:manage',
  STOCK_IN: 'stock:in',
  STOCK_OUT: 'stock:out',
  STOCK_ADJUST: 'stock:adjust',
  MOVEMENT_READ: 'movement:read',
  PURCHASE_READ: 'purchase:read',
  PURCHASE_MANAGE: 'purchase:manage',
  REPORT_READ: 'report:read',
  USER_MANAGE: 'user:manage',
  SETTINGS_MANAGE: 'settings:manage',
  AUDIT_READ: 'audit:read',
  POS_SELL: 'pos:sell',
  POS_DISCOUNT: 'pos:discount',
  POS_CANCEL: 'pos:cancel',
  CASH_MOVEMENT: 'cash:movement',
  SALES_READ: 'sales:read',
  CUSTOMER_READ: 'customer:read',
  CUSTOMER_WRITE: 'customer:write',
  CUSTOMER_MANAGE: 'customer:manage',
} as const;

export type Permission = (typeof P)[keyof typeof P];
