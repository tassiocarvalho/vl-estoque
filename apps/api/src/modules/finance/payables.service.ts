import { Injectable } from '@nestjs/common';
import { PayableStatus, Prisma } from '@prisma/client';
import { AuthUser } from '../../common/auth/auth-user';
import { toNumber } from '../../common/decimal';
import { badRequest, conflict, notFound } from '../../common/errors';
import { toJson } from '../../common/json';
import { Paginated, toSkipTake } from '../../common/pagination';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CostingError, splitInstallments } from '../purchases/domain/costing';
import {
  AttachmentDto,
  CreatePayableDto,
  ExpenseCategoryDto,
  ListPayablesQueryDto,
  PayPayableDto,
  UpdateExpenseCategoryDto,
  UpdatePayableDto,
} from './finance.dto';
import { addDays, dateOnly, isoDate, todayIso } from './dates';

const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;

const payableSelect = {
  id: true,
  description: true,
  category: { select: { id: true, name: true, code: true } },
  supplier: { select: { id: true, name: true, tradeName: true } },
  invoice: { select: { id: true, number: true, documentNumber: true } },
  documentNumber: true,
  installment: true,
  installments: true,
  dueDate: true,
  amount: true,
  status: true,
  paidAt: true,
  paidAmount: true,
  paymentMethodName: true,
  notes: true,
  attachmentName: true,
  attachmentType: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PayableSelect;

type PayableRow = Prisma.PayableGetPayload<{ select: typeof payableSelect }>;

const toPayableView = (p: PayableRow) => ({
  ...p,
  dueDate: isoDate(p.dueDate)!,
  paidAt: isoDate(p.paidAt),
  amount: toNumber(p.amount),
  paidAmount: p.paidAmount === null ? null : toNumber(p.paidAmount),
  hasAttachment: Boolean(p.attachmentName),
  overdue: p.status === PayableStatus.OPEN && isoDate(p.dueDate)! < todayIso(),
});

/** Confere o tipo real do arquivo pelos primeiros bytes (não confia só no nome). */
function matchesType(data: Buffer, type: string) {
  const head = data.subarray(0, 12);
  if (type === 'application/pdf') return head.subarray(0, 4).toString('latin1') === '%PDF';
  if (type === 'image/png') return head[0] === 0x89 && head.subarray(1, 4).toString('latin1') === 'PNG';
  if (type === 'image/jpeg') return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  if (type === 'image/webp') return head.subarray(0, 4).toString('latin1') === 'RIFF' && head.subarray(8, 12).toString('latin1') === 'WEBP';
  return false;
}

@Injectable()
export class PayablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ─── Categorias de despesa ────────────────────────────────────────────────

  async categories(all = false) {
    return this.prisma.expenseCategory.findMany({ where: all ? {} : { active: true }, orderBy: { name: 'asc' } });
  }

  async createCategory(dto: ExpenseCategoryDto, user: AuthUser, ip: string) {
    await this.assertUniqueCategory(dto.name);
    const category = await this.prisma.expenseCategory.create({ data: { name: dto.name } });
    await this.log(user, ip, 'expense-category.create', category.id, { name: dto.name });
    return category;
  }

  async updateCategory(id: string, dto: UpdateExpenseCategoryDto, user: AuthUser, ip: string) {
    const current = await this.prisma.expenseCategory.findUnique({ where: { id } });
    if (!current) throw notFound('Categoria de despesa');
    if (current.code && dto.active === false) throw badRequest('Esta categoria é usada pelas notas de entrada e não pode ser desativada');
    if (dto.name && dto.name !== current.name) await this.assertUniqueCategory(dto.name, id);
    const category = await this.prisma.expenseCategory.update({ where: { id }, data: dto });
    await this.log(user, ip, 'expense-category.update', id, toJson(dto));
    return category;
  }

  // ─── Contas a pagar ───────────────────────────────────────────────────────

  async list(query: ListPayablesQueryDto): Promise<Paginated<ReturnType<typeof toPayableView>> & { summary: Awaited<ReturnType<PayablesService['summary']>> }> {
    const status = query.status ?? 'open';
    const today = todayIso();
    const dueRange: Record<string, { gte?: Date; lt?: Date; lte?: Date }> = {
      overdue: { lt: dateOnly(today) },
      today: { gte: dateOnly(today), lte: dateOnly(today) },
      week: { gte: dateOnly(today), lte: dateOnly(addDays(today, 7)) },
      month: { gte: dateOnly(today), lte: dateOnly(addDays(today, 30)) },
    };
    const period = query.from || query.to ? { gte: query.from ? dateOnly(query.from) : undefined, lte: query.to ? dateOnly(query.to) : undefined } : undefined;

    const where: Prisma.PayableWhereInput = {
      ...(status !== 'all' && { status: status.toUpperCase() as PayableStatus }),
      ...(query.due && { status: PayableStatus.OPEN, dueDate: dueRange[query.due] }),
      ...(period && (status === 'paid' ? { paidAt: period } : { dueDate: period })),
      ...(query.supplierId && { supplierId: query.supplierId }),
      ...(query.categoryId && { categoryId: query.categoryId }),
      ...(query.search && {
        OR: [
          { description: { contains: query.search, mode: 'insensitive' } },
          { documentNumber: { contains: query.search } },
          { supplier: { name: { contains: query.search, mode: 'insensitive' } } },
          { supplier: { tradeName: { contains: query.search, mode: 'insensitive' } } },
        ],
      }),
    };
    const orderBy: Prisma.PayableOrderByWithRelationInput[] =
      status === 'paid' ? [{ paidAt: 'desc' }, { dueDate: 'desc' }] : [{ dueDate: 'asc' }, { installment: 'asc' }];

    const [rows, total, summary] = await Promise.all([
      this.prisma.payable.findMany({ where, select: payableSelect, orderBy, ...toSkipTake(query) }),
      this.prisma.payable.count({ where }),
      this.summary(),
    ]);
    return { items: rows.map(toPayableView), total, page: query.page, pageSize: query.pageSize, summary };
  }

  /** Agenda: vencidas, vencendo hoje, nos próximos 7 dias e total em aberto. */
  async summary() {
    const today = todayIso();
    const sum = (dueDate?: Prisma.DateTimeFilter) =>
      this.prisma.payable.aggregate({ where: { status: PayableStatus.OPEN, ...(dueDate && { dueDate }) }, _sum: { amount: true }, _count: { _all: true } });
    const [overdue, dueToday, next7, open] = await Promise.all([
      sum({ lt: dateOnly(today) }),
      sum({ gte: dateOnly(today), lte: dateOnly(today) }),
      sum({ gt: dateOnly(today), lte: dateOnly(addDays(today, 7)) }),
      sum(),
    ]);
    const view = (a: typeof open) => ({ count: a._count._all, amount: toNumber(a._sum.amount) });
    return { overdue: view(overdue), today: view(dueToday), next7: view(next7), open: view(open) };
  }

  async findOne(id: string) {
    const payable = await this.prisma.payable.findUnique({ where: { id }, select: payableSelect });
    if (!payable) throw notFound('Conta a pagar');
    return toPayableView(payable);
  }

  /** Lança a conta (em uma ou várias parcelas iguais). */
  async create(dto: CreatePayableDto, user: AuthUser, ip: string) {
    await this.assertRefs(dto.categoryId, dto.supplierId);
    let parts: ReturnType<typeof splitInstallments>;
    try {
      parts = splitInstallments(dto.amount, dto.installments ?? 1, dto.dueDate, dto.intervalDays ?? 30);
    } catch (error) {
      if (error instanceof CostingError) throw badRequest(error.message);
      throw error;
    }
    const ids = await this.prisma.$transaction(
      parts.map((part) =>
        this.prisma.payable.create({
          data: {
            description: dto.description,
            categoryId: dto.categoryId,
            supplierId: dto.supplierId ?? null,
            documentNumber: dto.documentNumber ?? null,
            installment: part.installment,
            installments: parts.length,
            dueDate: dateOnly(part.dueDate),
            amount: part.amount,
            notes: dto.notes ?? null,
            createdById: user.id,
          },
          select: { id: true },
        }),
      ),
    );
    await this.log(user, ip, 'payable.create', ids[0].id, { description: dto.description, amount: dto.amount, installments: parts.length });
    const rows = await this.prisma.payable.findMany({ where: { id: { in: ids.map((i) => i.id) } }, select: payableSelect, orderBy: { installment: 'asc' } });
    return rows.map(toPayableView);
  }

  async update(id: string, dto: UpdatePayableDto, user: AuthUser, ip: string) {
    const current = await this.findRow(id);
    if (current.status !== PayableStatus.OPEN) throw badRequest('Só contas em aberto podem ser alteradas');
    await this.assertRefs(dto.categoryId, dto.supplierId);
    await this.prisma.payable.update({
      where: { id },
      data: { ...dto, ...(dto.dueDate && { dueDate: dateOnly(dto.dueDate) }) },
    });
    await this.log(user, ip, 'payable.update', id, toJson(dto));
    return this.findOne(id);
  }

  /** Baixa: registra o pagamento. */
  async pay(id: string, dto: PayPayableDto, user: AuthUser, ip: string) {
    if (dto.paidAt > addDays(todayIso(), 1)) throw badRequest('A data do pagamento não pode estar no futuro');
    const { count } = await this.prisma.payable.updateMany({
      where: { id, status: PayableStatus.OPEN },
      data: { status: PayableStatus.PAID, paidAt: dateOnly(dto.paidAt), paidAmount: dto.paidAmount, paymentMethodName: dto.paymentMethodName, paidById: user.id },
    });
    if (!count) await this.failNotOpen(id);
    await this.log(user, ip, 'payable.pay', id, toJson(dto));
    return this.findOne(id);
  }

  /** Desfaz a baixa (pagamento lançado por engano). */
  async reopen(id: string, user: AuthUser, ip: string) {
    const { count } = await this.prisma.payable.updateMany({
      where: { id, status: PayableStatus.PAID },
      data: { status: PayableStatus.OPEN, paidAt: null, paidAmount: null, paymentMethodName: null, paidById: null },
    });
    if (!count) throw badRequest('Só contas pagas podem ser reabertas');
    await this.log(user, ip, 'payable.reopen', id);
    return this.findOne(id);
  }

  async cancel(id: string, user: AuthUser, ip: string) {
    const { count } = await this.prisma.payable.updateMany({ where: { id, status: PayableStatus.OPEN }, data: { status: PayableStatus.CANCELED } });
    if (!count) await this.failNotOpen(id);
    await this.log(user, ip, 'payable.cancel', id);
    return this.findOne(id);
  }

  async attach(id: string, dto: AttachmentDto, user: AuthUser, ip: string) {
    await this.findRow(id);
    const data = Buffer.from(dto.data, 'base64');
    if (data.length === 0 || data.length > MAX_ATTACHMENT_BYTES) throw badRequest('O comprovante deve ter até 2 MB');
    if (!matchesType(data, dto.type)) throw badRequest('O arquivo não corresponde ao tipo informado (PDF, PNG, JPEG ou WebP)');
    await this.prisma.payable.update({ where: { id }, data: { attachment: data, attachmentName: dto.name, attachmentType: dto.type } });
    await this.log(user, ip, 'payable.attach', id, { name: dto.name, bytes: data.length });
    return this.findOne(id);
  }

  async attachment(id: string) {
    const payable = await this.prisma.payable.findUnique({
      where: { id },
      select: { attachment: true, attachmentName: true, attachmentType: true },
    });
    if (!payable?.attachment || !payable.attachmentType) throw notFound('Comprovante');
    return { data: Buffer.from(payable.attachment), name: payable.attachmentName ?? 'comprovante', type: payable.attachmentType };
  }

  async removeAttachment(id: string, user: AuthUser, ip: string) {
    await this.findRow(id);
    await this.prisma.payable.update({ where: { id }, data: { attachment: null, attachmentName: null, attachmentType: null } });
    await this.log(user, ip, 'payable.detach', id);
    return this.findOne(id);
  }

  private async findRow(id: string) {
    const payable = await this.prisma.payable.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!payable) throw notFound('Conta a pagar');
    return payable;
  }

  /** Conta inexistente (404) ou que não está mais em aberto (400). */
  private async failNotOpen(id: string): Promise<never> {
    await this.findRow(id);
    throw badRequest('Esta conta não está em aberto');
  }

  private async assertRefs(categoryId?: string, supplierId?: string | null) {
    if (categoryId) {
      const category = await this.prisma.expenseCategory.findUnique({ where: { id: categoryId } });
      if (!category) throw notFound('Categoria de despesa');
    }
    if (supplierId) {
      const supplier = await this.prisma.supplier.findUnique({ where: { id: supplierId } });
      if (!supplier) throw notFound('Fornecedor');
    }
  }

  private async assertUniqueCategory(name: string, exceptId?: string) {
    const duplicate = await this.prisma.expenseCategory.findFirst({
      where: { name: { equals: name, mode: 'insensitive' }, ...(exceptId && { id: { not: exceptId } }) },
    });
    if (duplicate) throw conflict('Já existe uma categoria com esse nome');
  }

  private log(user: AuthUser, ip: string, action: string, entityId: string, details?: Prisma.InputJsonValue) {
    return this.audit.log({ userId: user.id, action, entity: 'payable', entityId, details, ip });
  }
}
