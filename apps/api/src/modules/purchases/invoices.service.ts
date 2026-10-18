import { HttpStatus, Injectable } from '@nestjs/common';
import { MovementSource, MovementType, Prisma, PurchaseInvoiceStatus, PurchaseRequestStatus } from '@prisma/client';
import { AuthUser } from '../../common/auth/auth-user';
import { toNumber } from '../../common/decimal';
import { isValidDocument, onlyDigits } from '../../common/document';
import { AppException, badRequest, ErrorCode, notFound } from '../../common/errors';
import { deterministicUuid } from '../../common/ids';
import { toJson } from '../../common/json';
import { Paginated, toSkipTake } from '../../common/pagination';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SettingsService } from '../settings/settings.service';
import { StockService } from '../stock/stock.service';
import { CostingError, costInvoice, fromCents, toCents, weightedAverageCost } from './domain/costing';
import { NfeXmlError, parseNfe } from './domain/nfe-xml';
import { InstallmentDto, ListInvoicesQueryDto, SaveInvoiceDto } from './purchases.dto';

export const MERCHANDISE_CATEGORY = 'MERCHANDISE';

const invoiceInclude = {
  supplier: { select: { id: true, name: true, tradeName: true, document: true } },
  createdBy: { select: { id: true, name: true } },
  finalizedBy: { select: { id: true, name: true } },
  items: {
    orderBy: { position: 'asc' },
    include: {
      product: { select: { id: true, name: true, sku: true, barcode: true, unit: true, costPrice: true, salePrice: true, deletedAt: true } },
    },
  },
  payables: {
    orderBy: { installment: 'asc' },
    select: { id: true, installment: true, installments: true, dueDate: true, amount: true, status: true },
  },
} satisfies Prisma.PurchaseInvoiceInclude;

type InvoiceRow = Prisma.PurchaseInvoiceGetPayload<{ include: typeof invoiceInclude }>;

const isoDate = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null);
const round2 = (value: number) => Math.round(value * 100) / 100;

/** Soma dos itens e total da nota (produtos + frete + despesas − desconto), em centavos. */
function invoiceTotals(invoice: { items: { total: Prisma.Decimal }[]; freight: Prisma.Decimal; otherCosts: Prisma.Decimal; discount: Prisma.Decimal }) {
  const productsCents = invoice.items.reduce((sum, item) => sum + toCents(toNumber(item.total)), 0);
  const totalCents = productsCents + toCents(toNumber(invoice.freight)) + toCents(toNumber(invoice.otherCosts)) - toCents(toNumber(invoice.discount));
  return { productsCents, totalCents };
}

const readInstallments = (value: Prisma.JsonValue | null): InstallmentDto[] =>
  Array.isArray(value) ? (value as unknown as InstallmentDto[]) : [];

export function toInvoiceView(invoice: InvoiceRow) {
  const { productsCents, totalCents } = invoiceTotals(invoice);
  return {
    id: invoice.id,
    number: invoice.number,
    status: invoice.status,
    source: invoice.source,
    supplier: invoice.supplier,
    documentNumber: invoice.documentNumber,
    series: invoice.series,
    accessKey: invoice.accessKey,
    issueDate: isoDate(invoice.issueDate),
    freight: toNumber(invoice.freight),
    otherCosts: toNumber(invoice.otherCosts),
    discount: toNumber(invoice.discount),
    declaredTotal: invoice.declaredTotal === null ? null : toNumber(invoice.declaredTotal),
    productsTotal: fromCents(productsCents),
    total: fromCents(totalCents),
    installments: readInstallments(invoice.installments),
    notes: invoice.notes,
    createdBy: invoice.createdBy,
    finalizedBy: invoice.finalizedBy,
    finalizedAt: invoice.finalizedAt,
    createdAt: invoice.createdAt,
    updatedAt: invoice.updatedAt,
    items: invoice.items.map((item) => ({
      id: item.id,
      position: item.position,
      productId: item.productId,
      product: item.product
        ? { ...item.product, costPrice: toNumber(item.product.costPrice), salePrice: toNumber(item.product.salePrice) }
        : null,
      supplierCode: item.supplierCode,
      description: item.description,
      barcode: item.barcode,
      purchaseUnit: item.purchaseUnit,
      quantity: toNumber(item.quantity),
      unitCost: toNumber(item.unitCost),
      total: toNumber(item.total),
      factor: toNumber(item.factor),
    })),
    payables: invoice.payables.map((p) => ({ ...p, dueDate: isoDate(p.dueDate), amount: toNumber(p.amount) })),
  };
}

export type InvoiceView = ReturnType<typeof toInvoiceView>;

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListInvoicesQueryDto): Promise<Paginated<Omit<InvoiceView, 'items'> & { itemsCount: number }>> {
    const where: Prisma.PurchaseInvoiceWhereInput = {
      ...(query.status && { status: query.status }),
      ...(query.supplierId && { supplierId: query.supplierId }),
      ...(query.search && {
        OR: [
          { documentNumber: { contains: query.search } },
          { supplier: { name: { contains: query.search, mode: 'insensitive' } } },
          { supplier: { tradeName: { contains: query.search, mode: 'insensitive' } } },
          ...(/^\d+$/.test(query.search) ? [{ number: Number(query.search) }] : []),
        ],
      }),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.purchaseInvoice.findMany({ where, include: invoiceInclude, orderBy: { createdAt: 'desc' }, ...toSkipTake(query) }),
      this.prisma.purchaseInvoice.count({ where }),
    ]);
    return {
      items: rows.map((row) => {
        const { items, ...view } = toInvoiceView(row);
        return { ...view, itemsCount: items.length };
      }),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async findOne(id: string) {
    const invoice = await this.prisma.purchaseInvoice.findUnique({ where: { id }, include: invoiceInclude });
    if (!invoice) throw notFound('Nota de entrada');
    return toInvoiceView(invoice);
  }

  /** Nova nota digitada (fica em rascunho até ser finalizada). */
  async create(dto: SaveInvoiceDto, user: AuthUser, ip: string) {
    await this.validate(dto);
    const invoice = await this.prisma.purchaseInvoice.create({
      data: { ...this.header(dto), createdById: user.id, items: { create: this.items(dto) } },
      include: invoiceInclude,
    });
    await this.log(user, ip, 'invoice.create', invoice.id, { number: invoice.number });
    return toInvoiceView(invoice);
  }

  /** Salva o rascunho (cabeçalho, itens e parcelas). */
  async update(id: string, dto: SaveInvoiceDto, user: AuthUser, ip: string) {
    await this.findDraft(id);
    await this.validate(dto);
    const invoice = await this.prisma.$transaction(async (tx) => {
      await tx.purchaseInvoiceItem.deleteMany({ where: { invoiceId: id } });
      return tx.purchaseInvoice.update({
        where: { id },
        data: { ...this.header(dto), items: { create: this.items(dto) } },
        include: invoiceInclude,
      });
    });
    await this.log(user, ip, 'invoice.update', id, { number: invoice.number, items: dto.items.length });
    return toInvoiceView(invoice);
  }

  async remove(id: string, user: AuthUser, ip: string) {
    const invoice = await this.findDraft(id);
    await this.prisma.purchaseInvoice.deleteMany({ where: { id, status: PurchaseInvoiceStatus.DRAFT } });
    await this.log(user, ip, 'invoice.delete', id, { number: invoice.number });
  }

  /**
   * Importa o XML da NF-e do fornecedor como rascunho: cadastra o fornecedor (se ainda não existir)
   * e associa os itens aos produtos pelo código de barras ou pelo código usado nas compras anteriores.
   */
  async importXml(xml: string, user: AuthUser, ip: string) {
    let nfe: ReturnType<typeof parseNfe>;
    try {
      nfe = parseNfe(xml);
    } catch (error) {
      if (error instanceof NfeXmlError) throw badRequest(error.message);
      throw badRequest('Não foi possível ler o arquivo XML');
    }
    if (nfe.accessKey) {
      const existing = await this.prisma.purchaseInvoice.findUnique({ where: { accessKey: nfe.accessKey } });
      if (existing) {
        throw new AppException(HttpStatus.CONFLICT, `Esta nota já foi importada (entrada nº ${existing.number})`, ErrorCode.CONFLICT, {
          invoiceId: existing.id,
        });
      }
    }

    const supplier = await this.findOrCreateSupplier(nfe.supplier, user, ip);
    const barcodes = nfe.items.flatMap((item) => (item.barcode ? [item.barcode] : []));
    const codes = nfe.items.map((item) => item.code).filter(Boolean);
    const [byBarcode, links] = await Promise.all([
      this.prisma.product.findMany({ where: { barcode: { in: barcodes }, deletedAt: null }, select: { id: true, barcode: true } }),
      supplier
        ? this.prisma.productSupplier.findMany({
            where: { supplierId: supplier.id, supplierCode: { in: codes }, product: { deletedAt: null } },
            select: { productId: true, supplierCode: true, factor: true },
          })
        : Promise.resolve([]),
    ]);

    const invoice = await this.prisma.purchaseInvoice.create({
      data: {
        supplierId: supplier?.id ?? null,
        documentNumber: nfe.number,
        series: nfe.series,
        accessKey: nfe.accessKey,
        issueDate: nfe.issueDate ? new Date(`${nfe.issueDate}T00:00:00Z`) : null,
        freight: nfe.freight,
        otherCosts: nfe.otherCosts,
        discount: nfe.discount,
        declaredTotal: nfe.total,
        installments: nfe.installments.length ? toJson(nfe.installments.map(({ dueDate, amount }) => ({ dueDate, amount }))) : undefined,
        source: 'XML',
        createdById: user.id,
        items: {
          create: nfe.items.map((item, index) => {
            // O código do fornecedor tem prioridade: ele também guarda a conversão (caixa → unidades).
            const link = links.find((l) => l.supplierCode === item.code);
            const product = link?.productId ?? byBarcode.find((p) => p.barcode === item.barcode)?.id ?? null;
            return {
              position: index + 1,
              productId: product,
              supplierCode: item.code || null,
              description: item.description.slice(0, 200),
              barcode: item.barcode,
              purchaseUnit: item.unit.slice(0, 10),
              quantity: item.quantity,
              unitCost: item.unitCost,
              total: item.total,
              factor: link ? link.factor : 1,
            };
          }),
        },
      },
      include: invoiceInclude,
    });
    await this.log(user, ip, 'invoice.import-xml', invoice.id, { number: invoice.number, accessKey: nfe.accessKey, items: nfe.items.length });
    return toInvoiceView(invoice);
  }

  /**
   * Lança a nota: entrada no estoque, custo médio e último custo de cada produto, vínculo com o fornecedor,
   * fecha as solicitações de pedido em aberto e gera as contas a pagar das parcelas. Tudo ou nada.
   */
  async finalize(id: string, user: AuthUser, ip: string) {
    const invoice = await this.prisma.purchaseInvoice.findUnique({ where: { id }, include: invoiceInclude });
    if (!invoice) throw notFound('Nota de entrada');
    if (invoice.status !== PurchaseInvoiceStatus.DRAFT) throw badRequest('Esta nota já foi lançada');
    if (invoice.items.length === 0) throw badRequest('A nota não tem itens');
    const pending = invoice.items.find((item) => !item.productId || !item.product || item.product.deletedAt);
    if (pending) throw badRequest(`Associe o item ${pending.position} ("${pending.description}") a um produto do cadastro`);

    const { totalCents } = invoiceTotals(invoice);
    if (invoice.declaredTotal !== null && Math.abs(toCents(toNumber(invoice.declaredTotal)) - totalCents) > 1) {
      throw badRequest(
        `O total da nota (R$ ${toNumber(invoice.declaredTotal).toFixed(2)}) não confere com a soma dos itens, frete, despesas e desconto (R$ ${fromCents(totalCents).toFixed(2)})`,
      );
    }
    const installments = readInstallments(invoice.installments);
    const installmentsCents = installments.reduce((sum, i) => sum + toCents(i.amount), 0);
    if (installments.length && installmentsCents !== totalCents) {
      throw badRequest(`A soma das parcelas (R$ ${fromCents(installmentsCents).toFixed(2)}) é diferente do total da nota (R$ ${fromCents(totalCents).toFixed(2)})`);
    }

    let costed: ReturnType<typeof costInvoice>;
    try {
      costed = costInvoice(
        invoice.items.map((item) => ({ quantity: toNumber(item.quantity), factor: toNumber(item.factor), total: toNumber(item.total) })),
        { freight: toNumber(invoice.freight), otherCosts: toNumber(invoice.otherCosts), discount: toNumber(invoice.discount) },
      );
    } catch (error) {
      if (error instanceof CostingError) throw badRequest(error.message);
      throw error;
    }

    const settings = await this.settings.get();
    const supplierName = invoice.supplier?.tradeName || invoice.supplier?.name;
    const note = [`Nota ${invoice.documentNumber ?? 's/ nº'}`, supplierName, `entrada nº ${invoice.number}`].filter(Boolean).join(' · ');
    const now = new Date();

    await this.prisma.$transaction(
      async (tx) => {
        const { count } = await tx.purchaseInvoice.updateMany({
          where: { id, status: PurchaseInvoiceStatus.DRAFT },
          data: { status: PurchaseInvoiceStatus.FINALIZED, finalizedById: user.id, finalizedAt: now },
        });
        if (count === 0) throw badRequest('Esta nota já foi lançada');

        for (const [index, item] of invoice.items.entries()) {
          const line = costed[index];
          const before = await tx.product.findUniqueOrThrow({ where: { id: item.productId! } });
          await this.stock.registerInTransaction(
            tx,
            {
              id: deterministicUuid(`invoice:${id}:${item.position}`),
              productId: item.productId!,
              type: MovementType.IN_PURCHASE,
              quantity: line.stockQuantity,
              note: note.slice(0, 200),
              source: MovementSource.APP,
              userId: user.id,
              occurredAt: now,
            },
            { allowNegative: true, coverageDays: settings.orderCoverageDays },
          );
          await tx.product.update({
            where: { id: item.productId! },
            data: {
              costPrice: weightedAverageCost(toNumber(before.currentStock), toNumber(before.costPrice), line.stockQuantity, line.unitCost),
              lastCost: line.unitCost,
            },
          });
          if (invoice.supplierId) {
            const link = { factor: item.factor, lastCost: line.unitCost, lastPurchaseAt: now };
            await tx.productSupplier.upsert({
              where: { productId_supplierId: { productId: item.productId!, supplierId: invoice.supplierId } },
              create: { productId: item.productId!, supplierId: invoice.supplierId, supplierCode: item.supplierCode, ...link },
              update: { ...link, ...(item.supplierCode && { supplierCode: item.supplierCode }) },
            });
          }
        }

        await tx.purchaseRequest.updateMany({
          where: {
            productId: { in: invoice.items.map((item) => item.productId!) },
            status: { in: [PurchaseRequestStatus.PENDING, PurchaseRequestStatus.ORDERED] },
          },
          data: { status: PurchaseRequestStatus.RECEIVED, closedAt: now },
        });

        if (installments.length) {
          const category = await tx.expenseCategory.upsert({
            where: { code: MERCHANDISE_CATEGORY },
            create: { code: MERCHANDISE_CATEGORY, name: 'Compra de mercadorias' },
            update: {},
          });
          await tx.payable.createMany({
            data: installments.map((installment, index) => ({
              description: `Nota ${invoice.documentNumber ?? `entrada nº ${invoice.number}`}${supplierName ? ` · ${supplierName}` : ''}`.slice(0, 200),
              categoryId: category.id,
              supplierId: invoice.supplierId,
              invoiceId: id,
              documentNumber: invoice.documentNumber,
              installment: index + 1,
              installments: installments.length,
              dueDate: new Date(`${installment.dueDate}T00:00:00Z`),
              amount: installment.amount,
              createdById: user.id,
            })),
          });
        }
      },
      { timeout: 60_000 },
    );

    await this.log(user, ip, 'invoice.finalize', id, { number: invoice.number, total: fromCents(totalCents), items: invoice.items.length });
    return this.findOne(id);
  }

  private async findDraft(id: string) {
    const invoice = await this.prisma.purchaseInvoice.findUnique({ where: { id } });
    if (!invoice) throw notFound('Nota de entrada');
    if (invoice.status !== PurchaseInvoiceStatus.DRAFT) throw badRequest('Nota já lançada: não pode ser alterada');
    return invoice;
  }

  private async validate(dto: SaveInvoiceDto) {
    if (dto.supplierId) {
      const supplier = await this.prisma.supplier.findUnique({ where: { id: dto.supplierId } });
      if (!supplier) throw notFound('Fornecedor');
    }
    const ids = [...new Set(dto.items.flatMap((item) => (item.productId ? [item.productId] : [])))];
    if (ids.length) {
      const found = await this.prisma.product.count({ where: { id: { in: ids }, deletedAt: null } });
      if (found !== ids.length) throw notFound('Produto da nota');
    }
  }

  private header(dto: SaveInvoiceDto) {
    return {
      supplierId: dto.supplierId ?? null,
      documentNumber: dto.documentNumber ?? null,
      series: dto.series ?? null,
      issueDate: dto.issueDate ? new Date(`${dto.issueDate}T00:00:00Z`) : null,
      freight: dto.freight ?? 0,
      otherCosts: dto.otherCosts ?? 0,
      discount: dto.discount ?? 0,
      declaredTotal: dto.declaredTotal ?? null,
      notes: dto.notes ?? null,
      installments: dto.installments?.length ? toJson(dto.installments) : Prisma.DbNull,
    };
  }

  private items(dto: SaveInvoiceDto) {
    return dto.items.map((item, index) => ({
      position: index + 1,
      productId: item.productId ?? null,
      supplierCode: item.supplierCode ?? null,
      description: item.description,
      barcode: item.barcode ?? null,
      purchaseUnit: item.purchaseUnit ?? null,
      quantity: item.quantity,
      unitCost: item.unitCost,
      total: item.total ?? round2(item.quantity * item.unitCost),
      factor: item.factor ?? 1,
    }));
  }

  /** Fornecedor da nota pelo CNPJ/CPF; cadastra se ainda não existir. */
  private async findOrCreateSupplier(data: ReturnType<typeof parseNfe>['supplier'], user: AuthUser, ip: string) {
    const document = data.document && isValidDocument(data.document) ? onlyDigits(data.document) : null;
    if (document) {
      const existing = await this.prisma.supplier.findUnique({ where: { document } });
      if (existing) return existing;
    }
    const phone = data.phone && /^\d{10,13}$/.test(onlyDigits(data.phone)) ? onlyDigits(data.phone) : null;
    const supplier = await this.prisma.supplier.create({
      data: { name: data.name.slice(0, 120), tradeName: data.tradeName?.slice(0, 120) ?? null, document, phone, email: data.email },
    });
    await this.audit.log({ userId: user.id, action: 'supplier.create', entity: 'supplier', entityId: supplier.id, details: { name: supplier.name, from: 'xml' }, ip });
    return supplier;
  }

  private log(user: AuthUser, ip: string, action: string, entityId: string, details?: Prisma.InputJsonValue) {
    return this.audit.log({ userId: user.id, action, entity: 'invoice', entityId, details, ip });
  }
}
