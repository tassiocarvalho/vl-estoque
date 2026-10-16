import type { MovementType, PurchaseRequestStatus, Role, StockStatus, Unit } from './types';

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Administrador',
  STOCKIST: 'Estoquista',
  CASHIER: 'Caixa',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  ADMIN: 'Acesso total: usuários, configurações, lixeira e auditoria.',
  STOCKIST: 'Cadastra produtos, registra entradas e saídas, pedidos e relatórios.',
  CASHIER: 'Consulta produtos e registra saídas (vendas).',
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
  'auth.accept-terms': 'Aceitou o termo de uso e privacidade',
  'auth.update-email': 'Alterou o e-mail',
  'auth.export-data': 'Baixou os próprios dados (LGPD)',
  'auth.recovery-requested': 'Pediu código de recuperação de senha',
  'auth.recovery-throttled': 'Excedeu pedidos de recuperação de senha',
  'auth.recovery-mail-failed': 'Falha ao enviar e-mail de recuperação',
  'auth.password-recovered': 'Redefiniu a senha pelo e-mail',
  'user.anonymize': 'Anonimizou usuário (LGPD)',
  'settings.mail': 'Alterou o e-mail de envio',
  'settings.company': 'Alterou os dados da empresa',
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
};
