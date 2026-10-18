import { Injectable } from '@nestjs/common';
import { Prisma, Supplier } from '@prisma/client';
import { AuthUser } from '../../common/auth/auth-user';
import { toNumber } from '../../common/decimal';
import { isValidDocument, onlyDigits } from '../../common/document';
import { badRequest, conflict, notFound } from '../../common/errors';
import { toJson } from '../../common/json';
import { Paginated, toSkipTake } from '../../common/pagination';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ListSuppliersQueryDto, ProductSupplierDto, SupplierDto, UpdateSupplierDto } from './purchases.dto';

export const toSupplierView = (s: Supplier) => ({
  id: s.id,
  name: s.name,
  tradeName: s.tradeName,
  document: s.document,
  phone: s.phone,
  email: s.email,
  contactName: s.contactName,
  leadTimeDays: s.leadTimeDays,
  paymentTerms: s.paymentTerms,
  notes: s.notes,
  active: s.active,
  createdAt: s.createdAt,
  updatedAt: s.updatedAt,
});

const linkInclude = {
  product: { select: { id: true, name: true, sku: true, unit: true, costPrice: true, deletedAt: true } },
  supplier: { select: { id: true, name: true, tradeName: true } },
} satisfies Prisma.ProductSupplierInclude;

type LinkRow = Prisma.ProductSupplierGetPayload<{ include: typeof linkInclude }>;

export const toLinkView = (link: LinkRow) => ({
  productId: link.productId,
  supplierId: link.supplierId,
  product: { ...link.product, costPrice: toNumber(link.product.costPrice) },
  supplier: link.supplier,
  supplierCode: link.supplierCode,
  factor: toNumber(link.factor),
  lastCost: link.lastCost === null ? null : toNumber(link.lastCost),
  lastPurchaseAt: link.lastPurchaseAt,
  preferred: link.preferred,
});

@Injectable()
export class SuppliersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListSuppliersQueryDto): Promise<Paginated<ReturnType<typeof toSupplierView>>> {
    const digits = query.search ? onlyDigits(query.search) : '';
    const where: Prisma.SupplierWhereInput = {
      ...(query.status !== 'all' && { active: query.status !== 'inactive' }),
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { tradeName: { contains: query.search, mode: 'insensitive' } },
          ...(digits.length >= 3 ? [{ document: { startsWith: digits } }] : []),
        ],
      }),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.supplier.findMany({ where, orderBy: { name: 'asc' }, ...toSkipTake(query) }),
      this.prisma.supplier.count({ where }),
    ]);
    return { items: items.map(toSupplierView), total, page: query.page, pageSize: query.pageSize };
  }

  /** Detalhe com os produtos fornecidos e o resumo das compras. */
  async findOne(id: string) {
    const supplier = await this.findOrFail(id);
    const [links, invoices, openPayables] = await Promise.all([
      this.prisma.productSupplier.findMany({
        where: { supplierId: id, product: { deletedAt: null } },
        include: linkInclude,
        orderBy: { product: { name: 'asc' } },
      }),
      this.prisma.purchaseInvoice.aggregate({
        where: { supplierId: id, status: 'FINALIZED' },
        _count: { _all: true },
        _max: { finalizedAt: true },
      }),
      this.prisma.payable.aggregate({ where: { supplierId: id, status: 'OPEN' }, _sum: { amount: true }, _count: { _all: true } }),
    ]);
    return {
      ...toSupplierView(supplier),
      products: links.map(toLinkView),
      stats: {
        invoices: invoices._count._all,
        lastPurchaseAt: invoices._max.finalizedAt,
        openPayables: openPayables._count._all,
        openAmount: toNumber(openPayables._sum.amount),
      },
    };
  }

  async create(dto: SupplierDto, user: AuthUser, ip: string) {
    await this.assertDocument(dto.document);
    const supplier = await this.prisma.supplier.create({ data: dto });
    await this.log(user, ip, 'supplier.create', supplier.id, { name: supplier.name });
    return toSupplierView(supplier);
  }

  async update(id: string, dto: UpdateSupplierDto, user: AuthUser, ip: string) {
    const current = await this.findOrFail(id);
    if (dto.document !== undefined && dto.document !== current.document) await this.assertDocument(dto.document, id);
    const supplier = await this.prisma.supplier.update({ where: { id }, data: dto });
    await this.log(user, ip, 'supplier.update', id, toJson(dto));
    return toSupplierView(supplier);
  }

  /** Produtos de um fornecedor ou fornecedores de um produto. */
  async links(filter: { productId?: string; supplierId?: string }) {
    const links = await this.prisma.productSupplier.findMany({
      where: filter,
      include: linkInclude,
      orderBy: [{ preferred: 'desc' }, { lastPurchaseAt: 'desc' }],
    });
    return links.map(toLinkView);
  }

  /** Liga (ou atualiza) um produto ao fornecedor. Só um fornecedor preferencial por produto. */
  async upsertLink(supplierId: string, productId: string, dto: ProductSupplierDto, user: AuthUser, ip: string) {
    await this.findOrFail(supplierId);
    const product = await this.prisma.product.findFirst({ where: { id: productId, deletedAt: null } });
    if (!product) throw notFound('Produto');
    const link = await this.prisma.$transaction(async (tx) => {
      if (dto.preferred) {
        await tx.productSupplier.updateMany({ where: { productId, supplierId: { not: supplierId } }, data: { preferred: false } });
      }
      return tx.productSupplier.upsert({
        where: { productId_supplierId: { productId, supplierId } },
        create: { productId, supplierId, ...dto },
        update: dto,
        include: linkInclude,
      });
    });
    await this.log(user, ip, 'supplier.link-product', supplierId, toJson({ productId, ...dto }));
    return toLinkView(link);
  }

  async removeLink(supplierId: string, productId: string, user: AuthUser, ip: string) {
    const { count } = await this.prisma.productSupplier.deleteMany({ where: { supplierId, productId } });
    if (!count) throw notFound('Vínculo do produto com o fornecedor');
    await this.log(user, ip, 'supplier.unlink-product', supplierId, { productId });
  }

  async findOrFail(id: string) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id } });
    if (!supplier) throw notFound('Fornecedor');
    return supplier;
  }

  private async assertDocument(document: string | null | undefined, exceptId?: string) {
    if (!document) return;
    if (!isValidDocument(document)) throw badRequest('CNPJ/CPF inválido: confira os números');
    const existing = await this.prisma.supplier.findUnique({ where: { document } });
    if (existing && existing.id !== exceptId) throw conflict(`Já existe um fornecedor com este CNPJ/CPF: ${existing.name}`);
  }

  private log(user: AuthUser, ip: string, action: string, entityId: string, details?: Prisma.InputJsonValue) {
    return this.audit.log({ userId: user.id, action, entity: 'supplier', entityId, details, ip });
  }
}
