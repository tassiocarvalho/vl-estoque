/** Operações que podem exigir o PIN do usuário. */
export const PIN_PROTECTED_OPERATIONS = ['productWrite', 'productDelete', 'stockIn', 'stockOut'] as const;
export type PinProtectedOperation = (typeof PIN_PROTECTED_OPERATIONS)[number];

export const THEMES = ['light', 'dark', 'system'] as const;
export type Theme = (typeof THEMES)[number];

export const PAPER_SIZES = ['80mm', '58mm', 'A4'] as const;
export type PaperSize = (typeof PAPER_SIZES)[number];

export const PRINTER_CONNECTIONS = ['browser', 'network'] as const;
export type PrinterConnection = (typeof PRINTER_CONNECTIONS)[number];

/**
 * Identidade visual (white-label): tudo o que muda de um cliente para outro
 * fica aqui — nome, logotipo, cor, tema e textos dos comprovantes.
 */
export interface StoreBranding {
  name: string;
  tagline: string;
  /** CNPJ/CPF ou outro documento, impresso no cabeçalho do comprovante. */
  document: string;
  address: string;
  phone: string;
  /** Cor principal em hexadecimal (#RRGGBB). Os tons claros e escuros são derivados dela. */
  primaryColor: string;
  theme: Theme;
  /** Logotipo como data URL (PNG, JPEG, WebP ou SVG). Nulo = ícone padrão. */
  logo: string | null;
  receiptHeader: string;
  receiptFooter: string;
}

export interface PrinterSettings {
  paper: PaperSize;
  /** Imprime o comprovante sozinho ao finalizar a venda. */
  autoPrint: boolean;
  /** browser = impressora instalada no Windows (USB, serial ou rede); network = ESC/POS direto pela rede. */
  connection: PrinterConnection;
  host: string;
  port: number;
  /** Abre a gaveta de dinheiro (comando ESC/POS) nas vendas com dinheiro. */
  openDrawerOnCash: boolean;
}

export interface PosSettings {
  /** Desconto máximo (%) que o operador pode dar sem autorização de um supervisor. */
  maxDiscountPercent: number;
  /** Bloqueia vender item sem saldo. Desligado: o caixa vende e o estoque fica negativo. */
  blockSaleWithoutStock: boolean;
  /** Prazo (dias) para troca e devolução; depois disso só com autorização do gerente. */
  returnDays: number;
  /** Validade do vale-troca em dias (0 = não vence). */
  voucherValidityDays: number;
}

/** Fiado / crediário. */
export interface CreditSettings {
  /** Dias até o vencimento da 1ª parcela. */
  firstDueDays: number;
  /** Dias entre as parcelas. */
  intervalDays: number;
  /** Bloqueia novo fiado de cliente com parcela vencida (o gerente pode liberar). */
  blockOverdue: boolean;
  /** Limite sugerido para clientes novos (0 = fiado não liberado até o gerente definir). */
  defaultLimit: number;
}

/** Parâmetros do sistema que o administrador pode alterar sem reprogramar. */
export interface SystemSettings {
  /** Dias que um produto excluído fica na lixeira antes de ser apagado definitivamente. */
  trashRetentionDays: number;
  /** Dias de consumo que o pedido sugerido deve cobrir após a chegada da mercadoria. */
  orderCoverageDays: number;
  /** Permite registrar saída maior que o saldo (deixa o estoque negativo). */
  allowNegativeStock: boolean;
  /** Quais operações pedem o PIN do usuário. */
  pinRequired: Record<PinProtectedOperation, boolean>;
  store: StoreBranding;
  printer: PrinterSettings;
  pos: PosSettings;
  credit: CreditSettings;
}

export const DEFAULT_SETTINGS: SystemSettings = {
  trashRetentionDays: 15,
  orderCoverageDays: 7,
  allowNegativeStock: false,
  pinRequired: {
    productWrite: true,
    productDelete: true,
    stockIn: true,
    stockOut: true,
  },
  store: {
    name: 'SuaLojaAqui',
    tagline: 'Vendas e estoque',
    document: '',
    address: '',
    phone: '',
    primaryColor: '#0f766e',
    theme: 'system',
    logo: null,
    receiptHeader: '',
    receiptFooter: 'Obrigado pela preferência!',
  },
  printer: {
    paper: '80mm',
    autoPrint: false,
    connection: 'browser',
    host: '',
    port: 9100,
    openDrawerOnCash: false,
  },
  pos: {
    maxDiscountPercent: 0,
    blockSaleWithoutStock: false,
    returnDays: 30,
    voucherValidityDays: 180,
  },
  credit: {
    firstDueDays: 30,
    intervalDays: 30,
    blockOverdue: true,
    defaultLimit: 0,
  },
};

/** Grupos de configuração que são objetos (mesclados campo a campo nas alterações). */
export const NESTED_SETTINGS = ['pinRequired', 'store', 'printer', 'pos', 'credit'] as const;
