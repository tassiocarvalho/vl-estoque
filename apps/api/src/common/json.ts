import { Prisma } from '@prisma/client';

/** Converte qualquer objeto (ex.: DTOs) em JSON puro para gravar em colunas Json. */
export const toJson = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
