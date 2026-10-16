import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { badRequest, notFound } from '../../common/errors';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SettingsService } from '../settings/settings.service';
import { productInclude, toProductView } from './product.view';

const DAY_MS = 24 * 60 * 60 * 1000;

interface Actor {
  id: string;
  ip: string;
}

/**
 * Lixeira de produtos: a exclusão é "suave" por N dias (configurável, padrão 15).
 * Depois do prazo o produto e todo o seu histórico são apagados definitivamente.
 */
@Injectable()
export class TrashService implements OnApplicationBootstrap {
  private readonly logger = new Logger(TrashService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    const { trashRetentionDays } = await this.settings.get();
    const products = await this.prisma.product.findMany({
      where: { deletedAt: { not: null } },
      include: productInclude,
      orderBy: { deletedAt: 'desc' },
    });

    return products.map((product) => {
      const purgeAt = new Date(product.deletedAt!.getTime() + trashRetentionDays * DAY_MS);
      return {
        ...toProductView(product),
        purgeAt,
        daysLeft: Math.max(Math.ceil((purgeAt.getTime() - Date.now()) / DAY_MS), 0),
      };
    });
  }

  async restore(id: string, actor: Actor) {
    const product = await this.findInTrash(id);
    await this.prisma.product.update({ where: { id }, data: { deletedAt: null } });
    await this.log(actor, 'product.restore', id, product.sku);
  }

  /** Exclusão definitiva antecipada (apaga o histórico do produto). */
  async purge(id: string, actor: Actor) {
    const product = await this.findInTrash(id);
    if (await this.prisma.saleItem.count({ where: { productId: id } })) {
      throw badRequest('Este produto tem vendas registradas e não pode ser apagado definitivamente (fica na lixeira)');
    }
    await this.prisma.product.delete({ where: { id } });
    await this.log(actor, 'product.purge', id, product.sku);
  }

  /** Roda todo dia às 3h e também quando o sistema inicia. */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeExpired() {
    const { trashRetentionDays } = await this.settings.get();
    const limit = new Date(Date.now() - trashRetentionDays * DAY_MS);
    // Produtos com vendas nunca são apagados: o histórico de vendas é registro financeiro.
    const expired = await this.prisma.product.findMany({
      where: { deletedAt: { lte: limit }, saleItems: { none: {} } },
      select: { id: true, sku: true },
    });
    if (expired.length === 0) return;

    await this.prisma.product.deleteMany({ where: { id: { in: expired.map((p) => p.id) } } });
    await this.audit.log({
      action: 'product.purge-expired',
      entity: 'product',
      details: { skus: expired.map((p) => p.sku) },
    });
    this.logger.log(`${expired.length} produto(s) removido(s) definitivamente da lixeira`);
  }

  onApplicationBootstrap() {
    void this.purgeExpired().catch((error) => this.logger.error('Falha ao limpar a lixeira', error));
  }

  private async findInTrash(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw notFound('Produto');
    if (!product.deletedAt) throw badRequest('Este produto não está na lixeira');
    return product;
  }

  private log(actor: Actor, action: string, entityId: string, sku: string) {
    return this.audit.log({ userId: actor.id, action, entity: 'product', entityId, details: { sku }, ip: actor.ip });
  }
}
