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
  /** Ajuste manual de inventário (entrada ou saída): restrito ao administrador. */
  STOCK_ADJUST = 'stock:adjust',
  MOVEMENT_READ = 'movement:read',
  PURCHASE_READ = 'purchase:read',
  PURCHASE_MANAGE = 'purchase:manage',
  REPORT_READ = 'report:read',
  USER_MANAGE = 'user:manage',
  SETTINGS_MANAGE = 'settings:manage',
  AUDIT_READ = 'audit:read',

  // ─── Frente de caixa ───
  /** Abrir/fechar o próprio caixa e vender. */
  POS_SELL = 'pos:sell',
  /** Dar desconto acima do limite livre do operador. */
  POS_DISCOUNT = 'pos:discount',
  /** Cancelar uma venda já finalizada (estorna o estoque). */
  POS_CANCEL = 'pos:cancel',
  /** Sangria e suprimento. */
  CASH_MOVEMENT = 'cash:movement',
  /** Consultar vendas e caixas de todos os operadores. */
  SALES_READ = 'sales:read',
  /** Troca e devolução de venda (o operador sem ela pede autorização do supervisor). */
  POS_RETURN = 'pos:return',
  /** Liberar fiado acima do limite ou de cliente com parcela vencida. */
  POS_CREDIT = 'pos:credit',

  // ─── Clientes ───
  CUSTOMER_READ = 'customer:read',
  /** Cadastrar e editar (inclusive no caixa). */
  CUSTOMER_WRITE = 'customer:write',
  /** Inativar e atender pedidos da LGPD (exportar e anonimizar dados). */
  CUSTOMER_MANAGE = 'customer:manage',

  // ─── Financeiro ───
  /** Contas a pagar, fluxo de caixa e resultado. */
  FINANCE_READ = 'finance:read',
  FINANCE_MANAGE = 'finance:manage',
}

const CASHIER: Permission[] = [
  Permission.PRODUCT_READ,
  Permission.POS_SELL,
  Permission.CUSTOMER_READ,
  Permission.CUSTOMER_WRITE,
];

const STOCKIST: Permission[] = [
  Permission.PRODUCT_READ,
  Permission.PRODUCT_WRITE,
  Permission.CATEGORY_MANAGE,
  Permission.STOCK_IN,
  Permission.STOCK_OUT,
  Permission.MOVEMENT_READ,
  Permission.PURCHASE_READ,
  Permission.PURCHASE_MANAGE,
  Permission.REPORT_READ,
];

/** Gerente: opera o caixa, autoriza descontos/cancelamentos e vê relatórios. */
const MANAGER: Permission[] = [
  ...CASHIER,
  Permission.POS_DISCOUNT,
  Permission.POS_CANCEL,
  Permission.POS_RETURN,
  Permission.POS_CREDIT,
  Permission.CASH_MOVEMENT,
  Permission.SALES_READ,
  Permission.REPORT_READ,
  Permission.MOVEMENT_READ,
  Permission.PURCHASE_READ,
  Permission.CUSTOMER_MANAGE,
  Permission.FINANCE_READ,
  Permission.FINANCE_MANAGE,
];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  CASHIER,
  STOCKIST,
  MANAGER,
  ADMIN: Object.values(Permission),
};

export const hasPermission = (role: Role, permission: Permission) =>
  ROLE_PERMISSIONS[role].includes(permission);

/** Permissões que um supervisor pode liberar pontualmente no caixa com o próprio PIN. */
export const AUTHORIZABLE_PERMISSIONS = [
  Permission.POS_DISCOUNT,
  Permission.POS_CANCEL,
  Permission.CASH_MOVEMENT,
  Permission.POS_RETURN,
  Permission.POS_CREDIT,
] as const;
export type AuthorizablePermission = (typeof AUTHORIZABLE_PERMISSIONS)[number];
