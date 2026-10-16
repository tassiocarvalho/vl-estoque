import { createHash } from 'node:crypto';

/**
 * UUID determinístico a partir de uma semente — garante idempotência:
 * reenviar a mesma venda gera os mesmos ids de movimentação e não duplica a baixa.
 */
export const deterministicUuid = (seed: string) => {
  const hex = createHash('sha256').update(seed).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};
