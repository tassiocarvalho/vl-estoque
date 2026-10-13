/** Operações que podem exigir o PIN do usuário. */
export const PIN_PROTECTED_OPERATIONS = ['productWrite', 'productDelete', 'stockIn', 'stockOut'] as const;
export type PinProtectedOperation = (typeof PIN_PROTECTED_OPERATIONS)[number];

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
};
