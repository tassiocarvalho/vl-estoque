import { MovementType, Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { SettingsService } from '../settings/settings.service';
import { DEFAULT_SETTINGS } from '../settings/settings.types';
import { StockService } from './stock.service';

const MOVEMENT_ID = '0b6f1c3e-6d4a-4f0e-9a3b-2f1d5c7e8a90';
const PRODUCT_ID = '5a1e2d3c-4b5a-4c6d-8e7f-9a0b1c2d3e4f';

const savedMovement = (overrides: Record<string, unknown> = {}) => ({
  id: MOVEMENT_ID,
  productId: PRODUCT_ID,
  type: MovementType.OUT_SALE,
  quantity: new Prisma.Decimal(1),
  balanceAfter: new Prisma.Decimal(9),
  note: null,
  source: 'APP',
  userId: 'user-1',
  occurredAt: new Date('2026-11-23T10:00:00Z'),
  createdAt: new Date(),
  product: { id: PRODUCT_ID, name: 'Pão de forma', sku: 'PAO-1', unit: 'UN' },
  user: { id: 'user-1', name: 'Caixa' },
  ...overrides,
});

const product = {
  id: PRODUCT_ID,
  name: 'Pão de forma',
  sku: 'PAO-1',
  barcode: null,
  unit: 'UN',
  currentStock: new Prisma.Decimal(9),
  avgDailyConsumption: new Prisma.Decimal(1),
  maxDailyConsumption: new Prisma.Decimal(2),
  leadTimeDays: 1,
  categoryId: 'cat-1',
  category: { id: 'cat-1', name: 'Padaria', parentId: null, parent: null },
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

/** Banco falso: cada teste diz como o "create" se comporta. */
function setup(create: (args: { data: Record<string, unknown> }) => unknown) {
  const tx = {
    stockMovement: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn(create) },
    product: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: vi.fn().mockResolvedValue(product),
      findFirst: vi.fn(),
    },
    purchaseRequest: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
  };
  const prisma = {
    $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    stockMovement: { findUnique: vi.fn().mockResolvedValue(savedMovement()) },
  };
  const settings = { get: vi.fn().mockResolvedValue(DEFAULT_SETTINGS) };
  const service = new StockService(prisma as unknown as PrismaService, settings as unknown as SettingsService);
  return { service, tx, prisma };
}

const command = (occurredAt?: Date) => ({
  id: MOVEMENT_ID,
  productId: PRODUCT_ID,
  type: MovementType.OUT_SALE,
  quantity: 1,
  occurredAt,
  userId: 'user-1',
});

describe('StockService.register — sincronização da fila offline', () => {
  it('trata como já registrado quando a mesma movimentação chega ao mesmo tempo (P2002)', async () => {
    const { service } = setup(() => {
      throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['id'] },
      });
    });

    const result = await service.register(command());

    expect(result.duplicated).toBe(true);
    expect(result.movement.id).toBe(MOVEMENT_ID);
  });

  it('não esconde outros erros do banco', async () => {
    const { service } = setup(() => {
      throw new Prisma.PrismaClientKnownRequestError('Foreign key failed', { code: 'P2003', clientVersion: 'test' });
    });

    await expect(service.register(command())).rejects.toMatchObject({ code: 'P2003' });
  });

  it('não grava de novo uma movimentação que já existe', async () => {
    const { service, tx } = setup((args) => savedMovement(args.data));
    tx.stockMovement.findUnique.mockResolvedValue(savedMovement());

    const result = await service.register(command());

    expect(result.duplicated).toBe(true);
    expect(tx.product.updateMany).not.toHaveBeenCalled();
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });

  it('mantém o horário em que o registro foi feito offline', async () => {
    const { service, tx } = setup((args) => savedMovement(args.data));
    const madeOffline = new Date(Date.now() - 3 * 60 * 60_000);

    await service.register(command(madeOffline));

    expect(tx.stockMovement.create.mock.calls[0][0].data.occurredAt).toEqual(madeOffline);
  });

  it('usa o horário do servidor quando o relógio do aparelho está adiantado', async () => {
    const { service, tx } = setup((args) => savedMovement(args.data));
    const before = Date.now();

    await service.register(command(new Date(Date.now() + 10 * 60_000)));

    const saved = tx.stockMovement.create.mock.calls[0][0].data.occurredAt as Date;
    expect(saved.getTime()).toBeGreaterThanOrEqual(before);
    expect(saved.getTime()).toBeLessThanOrEqual(Date.now());
  });
});
