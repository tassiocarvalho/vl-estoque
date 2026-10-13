/**
 * Regras de reposição de estoque — domínio puro, sem banco nem framework (fácil de testar e de alterar).
 *
 *   Estoque Mínimo        EM = Consumo Médio Diário × Tempo de Reposição
 *   Estoque de Segurança  ES = (Consumo Máximo Diário − Consumo Médio Diário) × Tempo de Reposição
 *   Ponto de Pedido       PP = (Consumo Médio Diário × Tempo de Reposição) + ES
 */

export interface ConsumptionProfile {
  avgDailyConsumption: number;
  maxDailyConsumption: number;
  /** Tempo de entrega do fornecedor (lead time), em dias. */
  leadTimeDays: number;
}

export interface ReplenishmentIndicators {
  minimumStock: number;
  safetyStock: number;
  reorderPoint: number;
}

export type StockStatus = 'OUT_OF_STOCK' | 'CRITICAL' | 'REORDER' | 'OK';

const round3 = (value: number) => Math.round(value * 1000) / 1000;

export function calculateIndicators(profile: ConsumptionProfile): ReplenishmentIndicators {
  const { avgDailyConsumption: avg, maxDailyConsumption: max, leadTimeDays: lead } = profile;

  const minimumStock = avg * lead;
  const safetyStock = Math.max(max - avg, 0) * lead;

  return {
    minimumStock: round3(minimumStock),
    safetyStock: round3(safetyStock),
    reorderPoint: round3(minimumStock + safetyStock),
  };
}

/**
 * Situação do item:
 *  - OUT_OF_STOCK: sem estoque (ruptura)
 *  - CRITICAL:     abaixo do estoque de segurança
 *  - REORDER:      atingiu o ponto de pedido — hora de pedir
 *  - OK:           acima do ponto de pedido
 */
export function classifyStock(currentStock: number, indicators: ReplenishmentIndicators): StockStatus {
  if (currentStock <= 0) return 'OUT_OF_STOCK';
  if (currentStock <= indicators.safetyStock) return 'CRITICAL';
  if (currentStock <= indicators.reorderPoint) return 'REORDER';
  return 'OK';
}

export const needsReorder = (currentStock: number, indicators: ReplenishmentIndicators) =>
  currentStock <= indicators.reorderPoint;

/**
 * Quantidade sugerida para o pedido: o suficiente para, quando a mercadoria chegar,
 * o estoque cobrir o consumo de `coverageDays` dias além do estoque de segurança.
 *
 *   alvo = ES + Consumo Médio × (Tempo de Reposição + Dias de Cobertura)
 *   sugerido = alvo − saldo atual   (arredondado para cima, nunca negativo)
 *
 * Premissa configurável (o documento de requisitos não define a regra de quantidade).
 */
export function suggestOrderQuantity(
  currentStock: number,
  profile: ConsumptionProfile,
  coverageDays: number,
): number {
  const { safetyStock } = calculateIndicators(profile);
  const target = safetyStock + profile.avgDailyConsumption * (profile.leadTimeDays + coverageDays);
  return Math.max(Math.ceil(round3(target - currentStock)), 0);
}
