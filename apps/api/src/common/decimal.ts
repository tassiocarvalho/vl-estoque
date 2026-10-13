import { Prisma } from '@prisma/client';

/** Converte Decimal do banco em number para as respostas da API. */
export const toNumber = (value: Prisma.Decimal | number | null | undefined): number =>
  value == null ? 0 : Number(value);

/** Arredonda para 3 casas — mesma precisão das colunas de quantidade. */
export const round3 = (value: number) => Math.round(value * 1000) / 1000;
