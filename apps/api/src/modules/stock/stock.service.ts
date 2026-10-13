import { HttpStatus, Injectable } from '@nestjs/common';
import { MovementSource, MovementType, Prisma, PurchaseRequestStatus } from '@prisma/client';
import { toNumber } from '../../common/decimal';
import { AppException, ErrorCode, notFound } from '../../common/errors';
import { Paginated, toSkipTake } from '../../common/pagination';
import { PrismaService } from '../../common/prisma/prisma.service';
import { needsReorder, suggestOrderQuantity } from '../products/domain/replenishment';
import { productInclude, toProductView } from '../products/product.view';
import { SettingsService } from '../settings/settings.service';
import { ENTRY_TYPES, EXIT_TYPES, isEntry, ListMovementsQueryDto } from './stock.dto';

export interface RegisterMovementCommand {
  id?: string;
  productId: string;
  type: MovementType;
  quantity: number;
  note?: string;
  occurredAt?: Date;
  userId: string | null;
  source?: MovementSource;
}

type Tx = Prisma.TransactionClient;

const OPEN_REQUEST_STATUSES = [PurchaseRequestStatus.PENDING, PurchaseRequestStatus.ORDERED];

const movementInclude = {
  product: { select: { id: true, name: true, sku: true, unit: true } },
  user: { select: { id: true, name: true } },
} satisfies Prisma.StockMovementInclude;

type MovementWithRelations = Prisma.StockMovementGetPayload<{ include: typeof movementInclude }>;

const toMovementView = (movement: MovementWithRelations) => ({
  ...movement,
  quantity: toNumber(movement.quantity),
  balanceAfter: toNumber(movement.balanceAfter),
  direction: isEntry(movement.type) ? 'IN' : 'OUT',
});

@Injectable()
export class StockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Registra uma entrada ou saída de forma atômica:
   *  1. atualiza o saldo (com trava de linha — duas vendas simultâneas não "furam" o estoque);
   *  2. grava a movimentação no livro de registros;
   *  3. em saídas, gera uma solicitação de pedido se o saldo atingiu o ponto de pedido.
   * É idempotente pelo `id`: reenviar a mesma movimentação (ex.: sincronização offline) não duplica.
   */
  async register(command: RegisterMovementCommand) {
    const settings = await this.settings.get();

    return this.prisma.$transaction(async (tx) => {
      if (command.id) {
        const existing = await tx.stockMovement.findUnique({ where: { id: command.id }, include: movementInclude });
        if (existing) return { movement: toMovementView(existing), purchaseRequestCreated: false, duplicated: true };
      }

      const entry = isEntry(command.type);
      await this.applyBalanceChange(tx, command, entry, settings.allowNegativeStock);

      const product = await tx.product.findUniqueOrThrow({ where: { id: command.productId }, include: productInclude });
      const movement = await tx.stockMovement.create({
        data: {
          id: command.id,
          productId: command.productId,
          type: command.type,
          quantity: command.quantity,
          balanceAfter: product.currentStock,
          note: command.note,
          source: command.source ?? MovementSource.APP,
          userId: command.userId,
          occurredAt: command.occurredAt ?? new Date(),
        },
        include: movementInclude,
      });

      const view = toProductView(product);
      const purchaseRequestCreated =
        !entry && (await this.createPurchaseRequestIfNeeded(tx, view, settings.orderCoverageDays));

      return { movement: toMovementView(movement), product: view, purchaseRequestCreated, duplicated: false };
    });
  }

  async list(query: ListMovementsQueryDto): Promise<Paginated<ReturnType<typeof toMovementView>>> {
    const typeFilter = query.type
      ? { type: query.type }
      : query.direction
        ? { type: { in: [...(query.direction === 'IN' ? ENTRY_TYPES : EXIT_TYPES)] } }
        : {};

    const where: Prisma.StockMovementWhereInput = {
      ...typeFilter,
      ...(query.productId && { productId: query.productId }),
      ...((query.from || query.to) && { occurredAt: { gte: query.from, lte: query.to } }),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.stockMovement.findMany({
        where,
        include: movementInclude,
        orderBy: { occurredAt: 'desc' },
        ...toSkipTake(query),
      }),
      this.prisma.stockMovement.count({ where }),
    ]);
    return { items: items.map(toMovementView), total, page: query.page, pageSize: query.pageSize };
  }

  private async applyBalanceChange(
    tx: Tx,
    { productId, quantity }: RegisterMovementCommand,
    entry: boolean,
    allowNegative: boolean,
  ) {
    const guard = entry || allowNegative ? {} : { currentStock: { gte: quantity } };
    const { count } = await tx.product.updateMany({
      where: { id: productId, deletedAt: null, ...guard },
      data: { currentStock: entry ? { increment: quantity } : { decrement: quantity } },
    });
    if (count === 1) return;

    const product = await tx.product.findFirst({ where: { id: productId, deletedAt: null } });
    if (!product) throw notFound('Produto');
    throw new AppException(
      HttpStatus.CONFLICT,
      `Estoque insuficiente: saldo atual de "${product.name}" é ${toNumber(product.currentStock)}`,
      ErrorCode.INSUFFICIENT_STOCK,
    );
  }

  /** Abre uma solicitação de pedido automática, se ainda não houver uma em aberto para o item. */
  private async createPurchaseRequestIfNeeded(
    tx: Tx,
    product: ReturnType<typeof toProductView>,
    coverageDays: number,
  ): Promise<boolean> {
    if (!needsReorder(product.currentStock, product)) return false;

    const open = await tx.purchaseRequest.findFirst({
      where: { productId: product.id, status: { in: OPEN_REQUEST_STATUSES } },
    });
    if (open) return false;

    await tx.purchaseRequest.create({
      data: {
        productId: product.id,
        suggestedQuantity: suggestOrderQuantity(product.currentStock, product, coverageDays),
        stockAtRequest: product.currentStock,
        reorderPoint: product.reorderPoint,
        note: 'Gerada automaticamente: estoque atingiu o ponto de pedido',
      },
    });
    return true;
  }
}
