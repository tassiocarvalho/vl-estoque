import { Role } from '@prisma/client';

/** Ações que podem ser liberadas ou bloqueadas por perfil de usuário. */
export enum Permission {
  PRODUCT_READ = 'product:read',
  PRODUCT_WRITE = 'product:write',
  PRODUCT_DELETE = 'product:delete',
  TRASH_MANAGE = 'trash:manage',
  CATEGORY_MANAGE = 'category:manage',
  STOCK_IN = 'stock:in',
  STOCK_OUT = 'stock:out',
  MOVEMENT_READ = 'movement:read',
  PURCHASE_READ = 'purchase:read',
  PURCHASE_MANAGE = 'purchase:manage',
  REPORT_READ = 'report:read',
  USER_MANAGE = 'user:manage',
  SETTINGS_MANAGE = 'settings:manage',
  AUDIT_READ = 'audit:read',
}

const CASHIER: Permission[] = [Permission.PRODUCT_READ, Permission.STOCK_OUT];

const STOCKIST: Permission[] = [
  ...CASHIER,
  Permission.PRODUCT_WRITE,
  Permission.CATEGORY_MANAGE,
  Permission.STOCK_IN,
  Permission.MOVEMENT_READ,
  Permission.PURCHASE_READ,
  Permission.PURCHASE_MANAGE,
  Permission.REPORT_READ,
];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  CASHIER,
  STOCKIST,
  ADMIN: Object.values(Permission),
};

export const hasPermission = (role: Role, permission: Permission) =>
  ROLE_PERMISSIONS[role].includes(permission);
