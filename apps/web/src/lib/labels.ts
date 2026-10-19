import type {
  CashMovementType,
  MovementType,
  PayableStatus,
  PaymentKind,
  PurchaseInvoiceStatus,
  PurchaseRequestStatus,
  RefundMethod,
  Role,
  StockStatus,
  Unit,
} from './types';

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
  IN_SALE_RETURN: 'Devolução de venda',
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
  'customer.create': 'Cadastrou cliente',
  'customer.update': 'Alterou cliente',
  'customer.export': 'Exportou dados do cliente (LGPD)',
  'customer.anonymize': 'Apagou dados pessoais do cliente (LGPD)',
  'payment-method.create': 'Criou forma de pagamento',
  'payment-method.update': 'Alterou forma de pagamento',
  'payment-method.delete': 'Excluiu forma de pagamento',
  'supplier.create': 'Cadastrou fornecedor',
  'supplier.update': 'Alterou fornecedor',
  'supplier.link-product': 'Ligou produto ao fornecedor',
  'supplier.unlink-product': 'Desligou produto do fornecedor',
  'invoice.create': 'Criou nota de entrada',
  'invoice.update': 'Alterou nota de entrada (rascunho)',
  'invoice.delete': 'Excluiu rascunho de nota de entrada',
  'invoice.import-xml': 'Importou XML de NF-e',
  'invoice.finalize': 'Lançou nota de entrada',
  'product.import': 'Importou produtos por planilha',
  'expense-category.create': 'Criou categoria de despesa',
  'expense-category.update': 'Alterou categoria de despesa',
  'payable.create': 'Lançou conta a pagar',
  'payable.update': 'Alterou conta a pagar',
  'payable.pay': 'Pagou conta',
  'payable.reopen': 'Desfez pagamento de conta',
  'payable.cancel': 'Cancelou conta a pagar',
  'payable.attach': 'Anexou comprovante de conta',
  'payable.detach': 'Removeu comprovante de conta',
  'sale.return': 'Registrou troca/devolução',
  'sale.credit-override': 'Fiado liberado pelo gerente',
  'credit.receive': 'Recebeu fiado no caixa',
  'credit.cancel': 'Cancelou parcela de fiado',
  'store-credit.cancel': 'Cancelou vale-troca',
};

export const INVOICE_STATUS_LABELS: Record<PurchaseInvoiceStatus, string> = {
  DRAFT: 'Rascunho',
  FINALIZED: 'Lançada',
  CANCELED: 'Cancelada',
};

export const PAYABLE_STATUS_LABELS: Record<PayableStatus, string> = {
  OPEN: 'Em aberto',
  PAID: 'Paga',
  CANCELED: 'Cancelada',
};

export const PAYMENT_KIND_LABELS: Record<PaymentKind, string> = {
  CASH: 'Dinheiro',
  PIX: 'PIX',
  CREDIT_CARD: 'Cartão de crédito',
  DEBIT_CARD: 'Cartão de débito',
  VOUCHER: 'Vale (alimentação, refeição...)',
  CHECK: 'Cheque',
  OTHER: 'Outros',
  STORE_CREDIT: 'Vale-troca / crédito',
  ON_ACCOUNT: 'Fiado / crediário',
};

export const REFUND_METHOD_LABELS: Record<RefundMethod, string> = {
  CASH: 'Dinheiro',
  ORIGINAL: 'Estorno na forma original',
  STORE_CREDIT: 'Vale-troca',
  ACCOUNT: 'Abatido do fiado',
};

/** Teclas das formas de pagamento no caixa (F5 é "confirmar"). */
export const PAYMENT_SHORTCUTS = ['F1', 'F2', 'F3', 'F4', 'F6', 'F7', 'F8', 'F9'];

export const CASH_MOVEMENT_LABELS: Record<CashMovementType, string> = {
  SUPPLY: 'Suprimento',
  WITHDRAWAL: 'Sangria',
};

/** Menção obrigatória em todo comprovante (o sistema não é fiscal). */
export const NON_FISCAL_NOTICE = 'Documento Não Fiscal — Sem Valor Fiscal';
