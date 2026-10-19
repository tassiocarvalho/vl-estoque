import { Injectable } from '@nestjs/common';
import { MovementType, Prisma } from '@prisma/client';
import { toNumber } from '../../common/decimal';
import { badRequest, notFound } from '../../common/errors';
import { toJson } from '../../common/json';
import { Paginated, toSkipTake } from '../../common/pagination';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { calculateIndicators, ConsumptionProfile } from './domain/replenishment';
import { productInclude, ProductView, toProductView } from './product.view';
import { CreateProductDto, ListProductsQueryDto, StockStatusFilter, UpdateProductDto } from './products.dto';

interface Actor {
  id: string;
  ip: string;
}

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListProductsQueryDto): Promise<Paginated<ProductView>> {
    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      ...(query.categoryId && {
        OR: [{ categoryId: query.categoryId }, { category: { parentId: query.categoryId } }],
      }),
      ...(query.search && {
        AND: [
          {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { sku: { contains: query.search, mode: 'insensitive' } },
              { barcode: query.search },
            ],
          },
        ],
      }),
      ...this.statusFilter(query.status),
    };

    const [products, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({ where, include: productInclude, orderBy: { name: 'asc' }, ...toSkipTake(query) }),
      this.prisma.product.count({ where }),
    ]);
    return { items: products.map(toProductView), total, page: query.page, pageSize: query.pageSize };
  }

  async findById(id: string): Promise<ProductView> {
    const product = await this.prisma.product.findFirst({ where: { id, deletedAt: null }, include: productInclude });
    if (!product) throw notFound('Produto');
    return toProductView(product);
  }

  /** Produto pelo código da balança (etiqueta com peso ou preço embutido). */
  async lookupScale(scaleCode: string): Promise<ProductView> {
    const normalized = scaleCode.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
    const product = await this.prisma.product.findFirst({ where: { deletedAt: null, scaleCode: normalized }, include: productInclude });
    if (!product) throw notFound(`Produto com código de balança "${normalized}"`);
    return toProductView(product);
  }

  /** Busca exata por SKU ou código de barras — usada na bipagem. */
  async lookup(code: string): Promise<ProductView> {
    const product = await this.prisma.product.findFirst({
      where: { deletedAt: null, OR: [{ barcode: code }, { sku: code.toUpperCase() }] },
      include: productInclude,
    });
    if (!product) throw notFound(`Produto com código "${code}"`);
    return toProductView(product);
  }

  async create(dto: CreateProductDto, actor: Actor): Promise<ProductView> {
    const { initialStock: rawStock = 0, components, ...input } = dto;
    const isKit = input.isKit ?? false;
    // Kit não tem estoque próprio nem reposição: quem tem são os itens dele.
    const initialStock = isKit ? 0 : rawStock;
    if (isKit) await this.assertComponents(components, null);
    await this.assertScaleCode(input.scaleCode);
    const data = { ...input, ...(isKit && { replenishmentEnabled: false }), ...this.consumptionFor(isKit ? false : (input.replenishmentEnabled ?? true), input) };
    this.assertConsumption(data);
    await this.assertCategory(data.categoryId);

    const product = await this.prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          ...data,
          ...calculateIndicators(data),
          currentStock: initialStock,
          ...(isKit && components?.length && { kitComponents: { create: components.map((c) => ({ componentId: c.productId, quantity: c.quantity })) } }),
        },
        include: productInclude,
      });
      if (initialStock > 0) {
        await tx.stockMovement.create({
          data: {
            productId: created.id,
            type: MovementType.IN_ADJUSTMENT,
            quantity: initialStock,
            balanceAfter: initialStock,
            note: 'Estoque inicial no cadastro',
            userId: actor.id,
            occurredAt: new Date(),
          },
        });
      }
      return created;
    });

    await this.log(actor, 'product.create', product.id, { sku: product.sku, name: product.name });
    return toProductView(product);
  }

  async update(id: string, dto: UpdateProductDto, actor: Actor): Promise<ProductView> {
    const current = await this.prisma.product.findFirst({ where: { id, deletedAt: null } });
    if (!current) throw notFound('Produto');
    if (dto.categoryId) await this.assertCategory(dto.categoryId);
    const { components, ...changes } = dto;
    const isKit = dto.isKit ?? current.isKit;
    if (isKit && !current.isKit && toNumber(current.currentStock) !== 0) {
      throw badRequest('Zere o estoque do produto antes de transformá-lo em kit (kit não tem estoque próprio)');
    }
    if (isKit && (components !== undefined || !current.isKit)) await this.assertComponents(components, id);
    if (dto.scaleCode !== undefined) await this.assertScaleCode(dto.scaleCode, id);

    const enabled = isKit ? false : (dto.replenishmentEnabled ?? current.replenishmentEnabled);
    const profile: ConsumptionProfile = this.consumptionFor(enabled, {
      avgDailyConsumption: dto.avgDailyConsumption ?? toNumber(current.avgDailyConsumption),
      maxDailyConsumption: dto.maxDailyConsumption ?? toNumber(current.maxDailyConsumption),
      leadTimeDays: dto.leadTimeDays ?? current.leadTimeDays,
    });
    this.assertConsumption(profile);

    const product = await this.prisma.$transaction(async (tx) => {
      if (components !== undefined || (!isKit && current.isKit)) {
        await tx.kitComponent.deleteMany({ where: { kitId: id } });
        if (isKit && components?.length) {
          await tx.kitComponent.createMany({ data: components.map((c) => ({ kitId: id, componentId: c.productId, quantity: c.quantity })) });
        }
      }
      return tx.product.update({
        where: { id },
        data: { ...changes, replenishmentEnabled: enabled, ...profile, ...calculateIndicators(profile) },
        include: productInclude,
      });
    });
    await this.log(actor, 'product.update', id, toJson(dto));
    return toProductView(product);
  }

  /** Envia para a lixeira: o produto some das listas mas pode ser recuperado dentro do prazo. */
  async moveToTrash(id: string, actor: Actor) {
    const product = await this.prisma.product.findFirst({ where: { id, deletedAt: null } });
    if (!product) throw notFound('Produto');
    await this.prisma.product.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.log(actor, 'product.trash', id, { sku: product.sku, name: product.name });
  }

  private statusFilter(status?: StockStatusFilter): Prisma.ProductWhereInput {
    const { fields } = this.prisma.product;
    switch (status) {
      case 'OUT_OF_STOCK':
        return { currentStock: { lte: 0 }, isKit: false };
      case 'CRITICAL':
        return { AND: [{ currentStock: { gt: 0 } }, { currentStock: { lte: fields.safetyStock } }] };
      case 'REORDER':
        return { AND: [{ currentStock: { gt: fields.safetyStock } }, { currentStock: { lte: fields.reorderPoint } }] };
      case 'OK':
        return { currentStock: { gt: fields.reorderPoint } };
      case 'ATTENTION':
        return { currentStock: { lte: fields.reorderPoint }, isKit: false };
      default:
        return {};
    }
  }

  /** Reposição desligada: consumo e prazo zerados (EM, ES e PP também ficam zero). */
  private consumptionFor(enabled: boolean, values: Partial<ConsumptionProfile>): ConsumptionProfile {
    if (!enabled) return { avgDailyConsumption: 0, maxDailyConsumption: 0, leadTimeDays: 0 };
    return {
      avgDailyConsumption: values.avgDailyConsumption ?? 0,
      maxDailyConsumption: values.maxDailyConsumption ?? 0,
      leadTimeDays: values.leadTimeDays ?? 0,
    };
  }

  /** Itens do kit: existem, não são kits e não repetem; um kit precisa de ao menos 1 item. */
  private async assertComponents(components: { productId: string; quantity: number }[] | undefined, kitId: string | null) {
    if (!components?.length) throw badRequest('Informe os itens do kit');
    const ids = components.map((c) => c.productId);
    if (new Set(ids).size !== ids.length) throw badRequest('Item repetido no kit');
    if (kitId && ids.includes(kitId)) throw badRequest('Um kit não pode conter ele mesmo');
    const found = await this.prisma.product.findMany({ where: { id: { in: ids }, deletedAt: null }, select: { id: true, name: true, isKit: true } });
    if (found.length !== ids.length) throw notFound('Item do kit');
    const nested = found.find((p) => p.isKit);
    if (nested) throw badRequest(`"${nested.name}" já é um kit: monte o kit só com produtos simples`);
  }

  private async assertScaleCode(scaleCode: string | null | undefined, exceptId?: string) {
    if (!scaleCode) return;
    const existing = await this.prisma.product.findFirst({ where: { scaleCode, ...(exceptId && { id: { not: exceptId } }) } });
    if (existing) throw badRequest(`O código de balança ${scaleCode} já é do produto "${existing.name}"`);
  }

  private assertConsumption({ avgDailyConsumption, maxDailyConsumption }: ConsumptionProfile) {
    if (maxDailyConsumption < avgDailyConsumption) {
      throw badRequest('O consumo máximo diário não pode ser menor que o consumo médio');
    }
  }

  private async assertCategory(categoryId: string) {
    const exists = await this.prisma.category.findUnique({ where: { id: categoryId } });
    if (!exists) throw notFound('Categoria');
  }

  private log(actor: Actor, action: string, entityId: string, details?: Prisma.InputJsonValue) {
    return this.audit.log({ userId: actor.id, action, entity: 'product', entityId, details, ip: actor.ip });
  }
}
