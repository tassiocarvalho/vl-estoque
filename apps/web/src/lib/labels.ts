import type { CashMovementType, MovementType, PaymentMethod, PurchaseRequestStatus, Role, StockStatus, Unit } from './types';

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Administrador',
  MANAGER: 'Gerente',
  STOCKIST: 'Estoquista',
  CASHIER: 'Operador de caixa',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  ADMIN: 'Acesso total: usuários, configurações, ajustes de estoque, lixeira e auditoria.',
  MANAGER: 'Opera o caixa, autoriza descontos, cancelamentos e sangrias, e vê os relatórios.',
  STOCKIST: 'Cadastra produtos, registra entradas e saídas, pedidos e relatórios de estoque.',
  CASHIER: 'Abre e fecha o caixa, vende e consulta produtos.',
};

export const UNIT_LABELS: Record<Unit, string> = {
  UN: 'Unidade (un)',
  KG: 'Quilo (kg)',
  G: 'Grama (g)',
  L: 'Litro (L)',
  ML: 'Mililitro (ml)',
  M: 'Metro (m)',
  CX: 'Caixa (cx)',
  PCT: 'Pacote (pct)',
  DZ: 'Dúzia (dz)',
};

export const UNIT_SHORT: Record<Unit, string> = {
  UN: 'un',
  KG: 'kg',
  G: 'g',
  L: 'L',
  ML: 'ml',
  M: 'm',
  CX: 'cx',
  PCT: 'pct',
  DZ: 'dz',
};

export const STATUS_LABELS: Record<StockStatus, string> = {
  OUT_OF_STOCK: 'Sem estoque',
  CRITICAL: 'Crítico',
  REORDER: 'Repor',
  OK: 'Normal',
};

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  IN_PURCHASE: 'Pedido recebido',
  IN_RETURN: 'Retorno ao estoque',
  IN_ADJUSTMENT: 'Ajuste (entrada)',
  IN_SALE_CANCEL: 'Estorno de venda cancelada',
  OUT_SALE: 'Venda',
  OUT_LOSS: 'Perda / quebra / vencimento',
  OUT_ADJUSTMENT: 'Ajuste (saída)',
};

export const ENTRY_TYPES: MovementType[] = ['IN_PURCHASE', 'IN_RETURN', 'IN_ADJUSTMENT'];
export const EXIT_TYPES: MovementType[] = ['OUT_SALE', 'OUT_LOSS', 'OUT_ADJUSTMENT'];

export const PURCHASE_STATUS_LABELS: Record<PurchaseRequestStatus, string> = {
  PENDING: 'Pendente',
  ORDERED: 'Pedido feito',
  RECEIVED: 'Recebido',
  CANCELED: 'Cancelado',
};

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  'auth.login': 'Entrou no sistema',
  'auth.logout': 'Saiu do sistema',
  'auth.login-failed': 'Tentativa de login com senha errada',
  'auth.account-locked': 'Conta bloqueada por tentativas',
  'auth.change-password': 'Trocou a senha',
  'auth.set-pin': 'Definiu o PIN',
  'user.create': 'Criou usuário',
  'user.update': 'Alterou usuário',
  'user.reset-password': 'Redefiniu senha de usuário',
  'user.reset-pin': 'Redefiniu PIN de usuário',
  'product.create': 'Cadastrou produto',
  'product.update': 'Editou produto',
  'product.trash': 'Enviou produto para a lixeira',
  'product.restore': 'Restaurou produto da lixeira',
  'product.purge': 'Excluiu produto definitivamente',
  'product.purge-expired': 'Limpeza automática da lixeira',
  'purchase.create': 'Criou solicitação de pedido',
  'purchase.status': 'Alterou situação de pedido',
  'settings.update': 'Alterou configurações',
  'auth.pin-login': 'Entrou no caixa com PIN (troca de operador)',
  'pos.authorize': 'Autorizou ação no caixa (supervisor)',
  'cash.open': 'Abriu o caixa',
  'cash.close': 'Fechou o caixa',
  'cash.supply': 'Suprimento no caixa',
  'cash.withdrawal': 'Sangria no caixa',
  'cash.drawer-open': 'Abriu a gaveta de dinheiro',
  'sale.create': 'Registrou venda',
  'sale.discount': 'Concedeu desconto',
  'sale.items-removed': 'Cancelou item(ns) do cupom',
  'sale.price-divergence': 'Venda offline com preço diferente do cadastro',
  'sale.cancel': 'Cancelou venda',
  'sale.abandon': 'Cancelou o cupom inteiro antes de finalizar',
  'sale.reprint': 'Reimprimiu comprovante',
};

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Dinheiro',
  PIX: 'PIX',
  CREDIT_CARD: 'Cartão de crédito',
  DEBIT_CARD: 'Cartão de débito',
};

export const PAYMENT_METHODS: PaymentMethod[] = ['CASH', 'PIX', 'CREDIT_CARD', 'DEBIT_CARD'];

export const CASH_MOVEMENT_LABELS: Record<CashMovementType, string> = {
  SUPPLY: 'Suprimento',
  WITHDRAWAL: 'Sangria',
};

/** Menção obrigatória em todo comprovante (o sistema não é fiscal). */
export const NON_FISCAL_NOTICE = 'Documento Não Fiscal — Sem Valor Fiscal';
