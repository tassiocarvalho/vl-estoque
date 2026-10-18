import { Injectable } from '@nestjs/common';
import { MovementType, Prisma, Unit } from '@prisma/client';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsString, MaxLength } from 'class-validator';
import { toNumber } from '../../common/decimal';
import { badRequest } from '../../common/errors';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { calculateIndicators, ConsumptionProfile } from './domain/replenishment';
import { IMPORT_COLUMNS, ImportColumn, ImportedProduct, normalizeHeader, parseImportRow } from './domain/product-import';

export class ImportProductsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(60)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  headers: string[];

  /** Linhas da planilha (cada uma, as células na ordem do cabeçalho). Validadas no serviço. */
  @IsArray()
  @ArrayMinSize(1, { message: 'A planilha não tem linhas' })
  @ArrayMaxSize(5000, { message: 'No máximo 5.000 produtos por importação' })
  rows: string[][];

  /** create: só cadastra novos. upsert: cadastra os novos e atualiza os existentes (pelo SKU). */
  @IsIn(['create', 'upsert'])
  mode: 'create' | 'upsert';

  @IsBoolean()
  createCategories: boolean;

  /** Só confere (pré-visualização), sem gravar. */
  @IsBoolean()
  dryRun: boolean;
}

export interface ImportRowResult {
  line: number;
  sku: string;
  name: string | null;
  action: 'create' | 'update';
  errors: string[];
}

type CategoryRow = { id: string; name: string; parentId: string | null };
const key = (text: string) => text.trim().toLowerCase();

@Injectable()
export class ProductImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Catálogo no mesmo layout da importação (para reajustar preços na planilha e reimportar). */
  async export() {
    const products = await this.prisma.product.findMany({
      where: { deletedAt: null },
      include: { category: { include: { parent: true } } },
      orderBy: { name: 'asc' },
    });
    return {
      columns: IMPORT_COLUMNS,
      rows: products.map((p) => ({
        nome: p.name,
        sku: p.sku,
        codigo_barras: p.barcode ?? '',
        categoria: p.category.parent?.name ?? p.category.name,
        subcategoria: p.category.parent ? p.category.name : '',
        unidade: p.unit,
        preco_venda: toNumber(p.salePrice),
        custo: toNumber(p.costPrice),
        estoque_inicial: toNumber(p.currentStock),
        reposicao: p.replenishmentEnabled ? 'sim' : 'não',
        consumo_medio: toNumber(p.avgDailyConsumption),
        consumo_maximo: toNumber(p.maxDailyConsumption),
        prazo_entrega: p.leadTimeDays,
      })),
    };
  }

  async import(dto: ImportProductsDto, actor: { id: string; ip: string }) {
    if (dto.rows.some((row) => !Array.isArray(row) || row.length > 60 || row.some((cell) => typeof cell !== 'string' || cell.length > 300))) {
      throw badRequest('Planilha em formato inválido');
    }
    const columns = dto.headers.map(normalizeHeader);
    if (!columns.includes('sku')) throw badRequest('A planilha precisa da coluna "sku" (código interno)');
    const ignoredColumns = dto.headers.filter((_, index) => columns[index] === null && dto.headers[index].trim());

    const raws = dto.rows.map((cells) => {
      const raw: Partial<Record<ImportColumn, string>> = {};
      columns.forEach((column, index) => {
        if (column) raw[column] = cells[index] ?? '';
      });
      return raw;
    });
    // Linhas totalmente vazias (comuns no fim do CSV do Excel) são ignoradas.
    const lines = raws.map((raw, index) => ({ raw, line: index + 2 })).filter(({ raw }) => Object.values(raw).some((v) => v?.trim()));

    const skus = lines.map(({ raw }) => (raw.sku ?? '').trim().toUpperCase()).filter(Boolean);
    const barcodes = lines.map(({ raw }) => (raw.codigo_barras ?? '').replace(/\s/g, '')).filter(Boolean);
    const [existingBySku, existingByBarcode, categories] = await Promise.all([
      this.prisma.product.findMany({ where: { sku: { in: skus } } }),
      this.prisma.product.findMany({ where: { barcode: { in: barcodes } }, select: { id: true, sku: true, name: true, barcode: true } }),
      this.prisma.category.findMany({ select: { id: true, name: true, parentId: true } }),
    ]);
    const bySku = new Map(existingBySku.map((p) => [p.sku, p]));
    const seenSku = new Map<string, number>();
    const seenBarcode = new Map<string, number>();

    const results: ImportRowResult[] = [];
    const valid: { product: ImportedProduct; existing?: (typeof existingBySku)[number] }[] = [];

    for (const { raw, line } of lines) {
      const sku = (raw.sku ?? '').trim().toUpperCase();
      const existing = bySku.get(sku);
      const { product, errors } = parseImportRow(raw, !existing);

      if (existing?.deletedAt) errors.push('Este SKU é de um produto que está na lixeira: restaure-o antes');
      else if (existing && dto.mode === 'create') errors.push('SKU já cadastrado (escolha "cadastrar e atualizar")');
      if (sku && seenSku.has(sku)) errors.push(`SKU repetido na planilha (linha ${seenSku.get(sku)})`);
      if (sku) seenSku.set(sku, line);

      if (product.barcode) {
        if (seenBarcode.has(product.barcode)) errors.push(`Código de barras repetido na planilha (linha ${seenBarcode.get(product.barcode)})`);
        seenBarcode.set(product.barcode, line);
        const owner = existingByBarcode.find((p) => p.barcode === product.barcode);
        if (owner && owner.sku !== sku) errors.push(`Código de barras já usado por "${owner.name}" (${owner.sku})`);
      }

      if (product.category && !dto.createCategories && !this.findCategory(categories, product.category, product.subcategory)) {
        const name = product.subcategory ? `${product.category} › ${product.subcategory}` : product.category;
        errors.push(`Categoria "${name}" não existe (marque "criar as categorias que faltam")`);
      }

      if (existing && !errors.length) {
        const avg = product.avgDailyConsumption ?? toNumber(existing.avgDailyConsumption);
        const max = product.maxDailyConsumption ?? toNumber(existing.maxDailyConsumption);
        if (max < avg) errors.push('O consumo máximo não pode ser menor que o médio');
      }

      results.push({ line, sku, name: product.name ?? existing?.name ?? null, action: existing ? 'update' : 'create', errors });
      if (!errors.length) valid.push({ product, existing });
    }

    const summary = {
      rows: results.length,
      create: results.filter((r) => r.action === 'create' && !r.errors.length).length,
      update: results.filter((r) => r.action === 'update' && !r.errors.length).length,
      errors: results.filter((r) => r.errors.length).length,
      ignoredColumns,
    };
    if (dto.dryRun || summary.errors > 0 || results.length === 0) return { applied: false, summary, rows: results };

    await this.prisma.$transaction(
      async (tx) => {
        const cache = new Map<string, string>();
        const categoryId = async (name: string, sub: string | null | undefined) => {
          const cacheKey = `${key(name)}/${key(sub ?? '')}`;
          const cached = cache.get(cacheKey);
          if (cached) return cached;
          let parent = categories.find((c) => !c.parentId && key(c.name) === key(name));
          if (!parent) {
            parent = await tx.category.create({ data: { name: name.trim() }, select: { id: true, name: true, parentId: true } });
            categories.push(parent);
          }
          let id = parent.id;
          if (sub) {
            let child = categories.find((c) => c.parentId === parent!.id && key(c.name) === key(sub));
            if (!child) {
              child = await tx.category.create({ data: { name: sub.trim(), parentId: parent.id }, select: { id: true, name: true, parentId: true } });
              categories.push(child);
            }
            id = child.id;
          }
          cache.set(cacheKey, id);
          return id;
        };

        for (const { product, existing } of valid) {
          const category = product.category ? await categoryId(product.category, product.subcategory) : undefined;
          if (existing) {
            const enabled = product.replenishmentEnabled ?? existing.replenishmentEnabled;
            const profile = this.profile(enabled, {
              avgDailyConsumption: product.avgDailyConsumption ?? toNumber(existing.avgDailyConsumption),
              maxDailyConsumption: product.maxDailyConsumption ?? toNumber(existing.maxDailyConsumption),
              leadTimeDays: product.leadTimeDays ?? existing.leadTimeDays,
            });
            await tx.product.update({
              where: { id: existing.id },
              data: {
                ...(product.name && { name: product.name }),
                ...(product.barcode && { barcode: product.barcode }),
                ...(category && { categoryId: category }),
                ...(product.unit && { unit: product.unit as Unit }),
                ...(product.salePrice !== undefined && { salePrice: product.salePrice }),
                ...(product.costPrice !== undefined && { costPrice: product.costPrice }),
                replenishmentEnabled: enabled,
                ...profile,
                ...calculateIndicators(profile),
              },
            });
            continue;
          }
          const enabled = product.replenishmentEnabled ?? true;
          const profile = this.profile(enabled, product);
          const initialStock = product.initialStock ?? 0;
          const created = await tx.product.create({
            data: {
              name: product.name!,
              sku: product.sku,
              barcode: product.barcode ?? null,
              categoryId: category!,
              unit: product.unit as Unit,
              salePrice: product.salePrice ?? 0,
              costPrice: product.costPrice ?? 0,
              lastCost: product.costPrice ?? 0,
              replenishmentEnabled: enabled,
              ...profile,
              ...calculateIndicators(profile),
              currentStock: initialStock,
            },
          });
          if (initialStock > 0) {
            await tx.stockMovement.create({
              data: {
                productId: created.id,
                type: MovementType.IN_ADJUSTMENT,
                quantity: initialStock,
                balanceAfter: initialStock,
                note: 'Estoque inicial (importação de planilha)',
                userId: actor.id,
                occurredAt: new Date(),
              },
            });
          }
        }
      },
      { timeout: 120_000 },
    );

    await this.audit.log({
      userId: actor.id,
      action: 'product.import',
      entity: 'product',
      details: { created: summary.create, updated: summary.update, mode: dto.mode } as Prisma.InputJsonValue,
      ip: actor.ip,
    });
    return { applied: true, summary, rows: results };
  }

  private findCategory(categories: CategoryRow[], name: string, sub: string | null | undefined) {
    const parent = categories.find((c) => !c.parentId && key(c.name) === key(name));
    if (!parent || !sub) return parent;
    return categories.find((c) => c.parentId === parent.id && key(c.name) === key(sub));
  }

  private profile(enabled: boolean, values: Partial<ConsumptionProfile>): ConsumptionProfile {
    if (!enabled) return { avgDailyConsumption: 0, maxDailyConsumption: 0, leadTimeDays: 0 };
    return {
      avgDailyConsumption: values.avgDailyConsumption ?? 0,
      maxDailyConsumption: values.maxDailyConsumption ?? values.avgDailyConsumption ?? 0,
      leadTimeDays: values.leadTimeDays ?? 0,
    };
  }
}
