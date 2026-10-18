import {
  Body,
  Controller,
  Get,
  HttpCode,
  Injectable,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { PartialType } from '@nestjs/mapped-types';
import { Prisma, SaleStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsEmail,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { AuthUser } from '../../common/auth/auth-user';
import { ClientIp, CurrentUser, RequirePermissions } from '../../common/auth/decorators';
import { hasPermission, Permission } from '../../common/auth/permissions';
import { toNumber } from '../../common/decimal';
import { isValidDocument, onlyDigits } from '../../common/document';
import { badRequest, conflict, notFound } from '../../common/errors';
import { Paginated, PaginationQueryDto, toSkipTake } from '../../common/pagination';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SettingsService } from '../settings/settings.service';

const CONSENT_CHANNELS = ['balcao', 'telefone', 'online', 'outro'] as const;

const trimOrNull = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() || null : value);
const digitsOrNull = ({ value }: { value: unknown }) => (typeof value === 'string' ? onlyDigits(value) || null : value);

/** CPF/CNPJ válido pelos dígitos verificadores (campo opcional). */
const validDocument = (value: unknown) => value == null || (typeof value === 'string' && isValidDocument(value));

class CustomerDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(2, 120, { message: 'Informe o nome do cliente (2 a 120 caracteres)' })
  name: string;

  @IsOptional()
  @Transform(digitsOrNull)
  @ValidateIf((_, v) => v !== null)
  @Matches(/^(\d{11}|\d{14})$/, { message: 'CPF deve ter 11 números ou CNPJ 14 números' })
  document?: string | null;

  @IsOptional()
  @Transform(digitsOrNull)
  @ValidateIf((_, v) => v !== null)
  @Matches(/^\d{10,13}$/, { message: 'Telefone inválido: use DDD + número' })
  phone?: string | null;

  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_, v) => v !== null)
  @IsEmail({}, { message: 'E-mail inválido' })
  @MaxLength(120)
  email?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Type(() => Date)
  @IsDate({ message: 'Data de nascimento inválida' })
  birthDate?: Date | null;

  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(200)
  address?: string | null;

  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(500)
  notes?: string | null;

  /** LGPD: o cliente autorizou o cadastro dos dados pessoais. */
  @IsOptional()
  @IsBoolean()
  consent?: boolean;

  @IsOptional()
  @IsIn(CONSENT_CHANNELS)
  consentChannel?: (typeof CONSENT_CHANNELS)[number];

  @IsOptional()
  @IsBoolean()
  marketingConsent?: boolean;

  /** Limite do fiado (só o gerente ou o administrador define). */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Limite de fiado inválido' })
  @Min(0)
  @Max(1_000_000)
  creditLimit?: number;
}

class CreateCustomerDto extends CustomerDto {}

class UpdateCustomerDto extends PartialType(CustomerDto) {
  /** Inativar/reativar exige customer:manage (verificado no serviço). */
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

class ListCustomersQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || undefined : value))
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsIn(['active', 'inactive', 'all'])
  status?: 'active' | 'inactive' | 'all';
}

type CustomerRow = Prisma.CustomerGetPayload<object>;

const toCustomerView = (c: CustomerRow) => ({
  id: c.id,
  name: c.name,
  document: c.document,
  phone: c.phone,
  email: c.email,
  birthDate: c.birthDate,
  address: c.address,
  notes: c.notes,
  active: c.active,
  consentAt: c.consentAt,
  consentChannel: c.consentChannel,
  marketingConsent: c.marketingConsent,
  creditLimit: toNumber(c.creditLimit),
  anonymizedAt: c.anonymizedAt,
  createdAt: c.createdAt,
  updatedAt: c.updatedAt,
});

interface Actor {
  user: AuthUser;
  ip: string;
}

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
  ) {}

  async list(query: ListCustomersQueryDto): Promise<Paginated<ReturnType<typeof toCustomerView>>> {
    const term = query.search;
    const digits = term ? onlyDigits(term) : '';
    const where: Prisma.CustomerWhereInput = {
      ...(query.status !== 'all' && { active: query.status !== 'inactive' }),
      ...(term && {
        OR: [
          { name: { contains: term, mode: 'insensitive' } },
          ...(digits.length >= 3 ? [{ document: { startsWith: digits } }, { phone: { contains: digits } }] : []),
        ],
      }),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({ where, orderBy: { name: 'asc' }, ...toSkipTake(query) }),
      this.prisma.customer.count({ where }),
    ]);
    return { items: items.map(toCustomerView), total, page: query.page, pageSize: query.pageSize };
  }

  /** Detalhe com o resumo de compras. */
  async findOne(id: string) {
    const customer = await this.findOrFail(id);
    const [stats, last] = await Promise.all([
      this.prisma.sale.aggregate({
        where: { customerId: id, status: SaleStatus.COMPLETED },
        _count: { _all: true },
        _sum: { total: true },
      }),
      this.prisma.sale.findFirst({
        where: { customerId: id, status: SaleStatus.COMPLETED },
        orderBy: { occurredAt: 'desc' },
        select: { occurredAt: true },
      }),
    ]);
    return {
      ...toCustomerView(customer),
      stats: {
        purchases: stats._count._all,
        total: toNumber(stats._sum.total),
        averageTicket: stats._count._all ? Math.round((toNumber(stats._sum.total) / stats._count._all) * 100) / 100 : 0,
        lastPurchaseAt: last?.occurredAt ?? null,
      },
    };
  }

  async create(dto: CreateCustomerDto, { user, ip }: Actor, canManage = false) {
    if (dto.creditLimit !== undefined && !canManage) throw badRequest('Somente o gerente ou o administrador define o limite do fiado');
    const { credit } = await this.settings.get();
    this.assertDocument(dto.document);
    this.assertConsent(dto);
    await this.assertUniqueDocument(dto.document);
    const customer = await this.prisma.customer.create({
      data: {
        name: dto.name,
        document: dto.document ?? null,
        phone: dto.phone ?? null,
        email: dto.email ?? null,
        birthDate: dto.birthDate ?? null,
        address: dto.address ?? null,
        notes: dto.notes ?? null,
        ...this.consentData(dto),
        creditLimit: dto.creditLimit ?? credit.defaultLimit,
        createdById: user.id,
      },
    });
    await this.log(user, ip, 'customer.create', customer.id, { name: customer.name });
    return toCustomerView(customer);
  }

  async update(id: string, dto: UpdateCustomerDto, { user, ip }: Actor, canManage: boolean) {
    const current = await this.findOrFail(id);
    if (current.anonymizedAt) throw badRequest('Os dados deste cliente foram apagados a pedido dele (LGPD)');
    if (dto.active !== undefined && dto.active !== current.active && !canManage) {
      throw badRequest('Somente o gerente ou o administrador pode inativar ou reativar clientes');
    }
    if (dto.creditLimit !== undefined && dto.creditLimit !== toNumber(current.creditLimit) && !canManage) {
      throw badRequest('Somente o gerente ou o administrador define o limite do fiado');
    }
    if (dto.document !== undefined) {
      this.assertDocument(dto.document);
      if (dto.document !== current.document) await this.assertUniqueDocument(dto.document, id);
    }
    const consent = dto.consent === undefined ? {} : this.consentData(dto, current.consentAt);
    const data: Prisma.CustomerUpdateInput = {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.document !== undefined && { document: dto.document }),
      ...(dto.phone !== undefined && { phone: dto.phone }),
      ...(dto.email !== undefined && { email: dto.email }),
      ...(dto.birthDate !== undefined && { birthDate: dto.birthDate }),
      ...(dto.address !== undefined && { address: dto.address }),
      ...(dto.notes !== undefined && { notes: dto.notes }),
      ...(dto.active !== undefined && { active: dto.active }),
      ...(dto.marketingConsent !== undefined && { marketingConsent: dto.marketingConsent }),
      ...(dto.creditLimit !== undefined && { creditLimit: dto.creditLimit }),
      ...consent,
    };
    const customer = await this.prisma.customer.update({ where: { id }, data });
    await this.log(user, ip, 'customer.update', id, { fields: Object.keys(data) });
    return toCustomerView(customer);
  }

  /** LGPD: todos os dados que a loja tem do titular, para entregar a ele. */
  async export(id: string, { user, ip }: Actor) {
    const customer = await this.findOrFail(id);
    const sales = await this.prisma.sale.findMany({
      where: { customerId: id },
      orderBy: { occurredAt: 'asc' },
      select: {
        number: true,
        occurredAt: true,
        status: true,
        total: true,
        customerDocument: true,
        items: { select: { productName: true, quantity: true, unitPrice: true, total: true } },
        payments: { select: { methodName: true, amount: true } },
      },
    });
    const [receivables, credits] = await Promise.all([
      this.prisma.receivable.findMany({ where: { customerId: id }, orderBy: { dueDate: 'asc' } }),
      this.prisma.storeCredit.findMany({ where: { customerId: id }, orderBy: { createdAt: 'asc' } }),
    ]);
    await this.log(user, ip, 'customer.export', id);
    return {
      fiado: receivables.map((r) => ({
        description: r.description,
        installment: `${r.installment}/${r.installments}`,
        dueDate: r.dueDate,
        amount: toNumber(r.amount),
        paid: toNumber(r.paidAmount),
        status: r.status,
      })),
      vales: credits.map((c) => ({ code: c.code, amount: toNumber(c.amount), balance: toNumber(c.balance), expiresAt: c.expiresAt, createdAt: c.createdAt })),
      exportedAt: new Date(),
      customer: toCustomerView(customer),
      purchases: sales.map((s) => ({
        number: s.number,
        occurredAt: s.occurredAt,
        status: s.status,
        total: toNumber(s.total),
        document: s.customerDocument,
        items: s.items.map((i) => ({ product: i.productName, quantity: toNumber(i.quantity), unitPrice: toNumber(i.unitPrice), total: toNumber(i.total) })),
        payments: s.payments.map((p) => ({ method: p.methodName, amount: toNumber(p.amount) })),
      })),
    };
  }

  /**
   * LGPD: apaga os dados pessoais a pedido do titular. As vendas continuam (são registro da loja),
   * mas sem nome nem documento do cliente.
   */
  async anonymize(id: string, { user, ip }: Actor) {
    const current = await this.findOrFail(id);
    if (current.anonymizedAt) throw badRequest('Os dados deste cliente já foram apagados');
    const openDebt = await this.prisma.receivable.count({ where: { customerId: id, status: 'OPEN' } });
    if (openDebt) {
      throw badRequest('O cliente tem fiado em aberto: a loja precisa dos dados para a cobrança (LGPD, art. 16). Quite ou cancele as parcelas antes.');
    }
    const customer = await this.prisma.$transaction(async (tx) => {
      await tx.sale.updateMany({ where: { customerId: id }, data: { customerName: null, customerDocument: null } });
      return tx.customer.update({
        where: { id },
        data: {
          name: 'Cliente anonimizado',
          document: null,
          phone: null,
          email: null,
          birthDate: null,
          address: null,
          notes: null,
          active: false,
          marketingConsent: false,
          anonymizedAt: new Date(),
        },
      });
    });
    await this.log(user, ip, 'customer.anonymize', id);
    return toCustomerView(customer);
  }

  async findOrFail(id: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) throw notFound('Cliente');
    return customer;
  }

  private assertDocument(document: string | null | undefined) {
    if (!validDocument(document)) throw badRequest('CPF/CNPJ inválido: confira os números');
  }

  /** Dados pessoais além do nome só com o consentimento registrado (LGPD). */
  private assertConsent(dto: Partial<CustomerDto>) {
    const personal = dto.document || dto.phone || dto.email || dto.birthDate || dto.address;
    if (personal && !dto.consent) {
      throw badRequest('Confirme que o cliente autorizou o cadastro dos dados pessoais (LGPD)');
    }
  }

  private consentData(dto: Partial<CustomerDto>, current?: Date | null) {
    if (!dto.consent) return { consentAt: null, consentChannel: null };
    return { consentAt: current ?? new Date(), consentChannel: dto.consentChannel ?? 'balcao' };
  }

  private async assertUniqueDocument(document: string | null | undefined, exceptId?: string) {
    if (!document) return;
    const existing = await this.prisma.customer.findUnique({ where: { document } });
    if (existing && existing.id !== exceptId) throw conflict(`Já existe um cliente com este CPF/CNPJ: ${existing.name}`);
  }

  private log(user: AuthUser, ip: string, action: string, entityId: string, details?: Prisma.InputJsonValue) {
    return this.audit.log({ userId: user.id, action, entity: 'customer', entityId, details, ip });
  }
}

@Controller('customers')
class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  @RequirePermissions(Permission.CUSTOMER_READ)
  list(@Query() query: ListCustomersQueryDto) {
    return this.customers.list(query);
  }

  @Get(':id')
  @RequirePermissions(Permission.CUSTOMER_READ)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.customers.findOne(id);
  }

  @Post()
  @RequirePermissions(Permission.CUSTOMER_WRITE)
  create(@Body() dto: CreateCustomerDto, @CurrentUser() user: AuthUser, @ClientIp() ip: string) {
    return this.customers.create(dto, { user, ip }, hasPermission(user.role, Permission.CUSTOMER_MANAGE));
  }

  @Patch(':id')
  @RequirePermissions(Permission.CUSTOMER_WRITE)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerDto,
    @CurrentUser() user: AuthUser,
    @ClientIp() ip: string,
  ) {
    const canManage = hasPermission(user.role, Permission.CUSTOMER_MANAGE);
    return this.customers.update(id, dto, { user, ip }, canManage);
  }

  @Get(':id/export')
  @RequirePermissions(Permission.CUSTOMER_MANAGE)
  export(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser, @ClientIp() ip: string) {
    return this.customers.export(id, { user, ip });
  }

  @Post(':id/anonymize')
  @HttpCode(200)
  @RequirePermissions(Permission.CUSTOMER_MANAGE)
  anonymize(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser, @ClientIp() ip: string) {
    return this.customers.anonymize(id, { user, ip });
  }
}

@Module({
  controllers: [CustomersController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
