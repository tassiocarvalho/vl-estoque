import {
  Body,
  Controller,
  Delete,
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
import { PaymentKind, PaymentMethod, Prisma } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { AuthUser } from '../../common/auth/auth-user';
import { ClientIp, CurrentUser, RequirePermissions } from '../../common/auth/decorators';
import { Permission } from '../../common/auth/permissions';
import { toNumber } from '../../common/decimal';
import { badRequest, conflict, notFound } from '../../common/errors';
import { toJson } from '../../common/json';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

class CreatePaymentMethodDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(2, 40, { message: 'Nome de 2 a 40 caracteres' })
  name: string;

  @IsEnum(PaymentKind, { message: 'Tipo de forma de pagamento inválido' })
  kind: PaymentKind;

  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsBoolean() allowsChange?: boolean;
  @IsOptional() @IsBoolean() requiresCustomer?: boolean;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Taxa inválida' })
  @Min(0)
  @Max(100)
  feePercent?: number;

  @IsOptional() @IsInt() @Min(0) @Max(365) settlementDays?: number;
  @IsOptional() @IsInt() @Min(0) @Max(1000) position?: number;
}

class UpdatePaymentMethodDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(2, 40, { message: 'Nome de 2 a 40 caracteres' })
  name?: string;

  @IsOptional() @IsEnum(PaymentKind) kind?: PaymentKind;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsBoolean() allowsChange?: boolean;
  @IsOptional() @IsBoolean() requiresCustomer?: boolean;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) feePercent?: number;
  @IsOptional() @IsInt() @Min(0) @Max(365) settlementDays?: number;
  @IsOptional() @IsInt() @Min(0) @Max(1000) position?: number;
}

class ListQueryDto {
  /** Inclui as formas desativadas (tela de configurações). */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  all?: boolean;
}

export const toPaymentMethodView = (m: PaymentMethod) => ({
  id: m.id,
  code: m.code,
  name: m.name,
  kind: m.kind,
  active: m.active,
  allowsChange: m.allowsChange,
  requiresCustomer: m.requiresCustomer,
  feePercent: toNumber(m.feePercent),
  settlementDays: m.settlementDays,
  position: m.position,
  system: m.code !== null,
});

/** A forma "Dinheiro" de fábrica: é a que entra na gaveta e não pode ser desativada nem mudar de tipo. */
const CASH_CODE = 'CASH';
/** Naturezas exclusivas das formas de fábrica (cada uma tem regras próprias no caixa). */
const SYSTEM_KINDS: PaymentKind[] = [PaymentKind.CASH, PaymentKind.STORE_CREDIT, PaymentKind.ON_ACCOUNT];
/** Vale-troca e fiado nunca dão troco em dinheiro. */
const NO_CHANGE_KINDS: PaymentKind[] = [PaymentKind.STORE_CREDIT, PaymentKind.ON_ACCOUNT];

@Injectable()
export class PaymentMethodsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(all = false) {
    const methods = await this.prisma.paymentMethod.findMany({
      where: all ? {} : { active: true },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
    });
    return methods.map(toPaymentMethodView);
  }

  async create(dto: CreatePaymentMethodDto, user: AuthUser, ip: string) {
    if (SYSTEM_KINDS.includes(dto.kind)) throw badRequest('Dinheiro, vale-troca e fiado já existem. Crie a nova forma com outro tipo.');
    await this.assertUniqueName(dto.name);
    const last = await this.prisma.paymentMethod.aggregate({ _max: { position: true } });
    const method = await this.prisma.paymentMethod.create({
      data: { ...dto, position: dto.position ?? (last._max.position ?? 0) + 1 },
    });
    await this.log(user, ip, 'payment-method.create', method.id, toJson(dto));
    return toPaymentMethodView(method);
  }

  async update(id: string, dto: UpdatePaymentMethodDto, user: AuthUser, ip: string) {
    const current = await this.findOrFail(id);
    if (current.code === CASH_CODE) {
      if (dto.active === false) throw badRequest('A forma "Dinheiro" não pode ser desativada');
      if (dto.kind && dto.kind !== PaymentKind.CASH) throw badRequest('A forma "Dinheiro" não pode mudar de tipo');
    } else if (dto.kind && dto.kind !== current.kind && (SYSTEM_KINDS.includes(dto.kind) || SYSTEM_KINDS.includes(current.kind))) {
      throw badRequest('Dinheiro, vale-troca e fiado são formas de fábrica: o tipo não pode ser trocado');
    }
    if (dto.allowsChange && NO_CHANGE_KINDS.includes(current.kind)) throw badRequest('Vale-troca e fiado não podem dar troco');
    if (current.kind === PaymentKind.ON_ACCOUNT && dto.requiresCustomer === false) throw badRequest('O fiado sempre exige o cliente identificado');
    if (dto.name && dto.name !== current.name) await this.assertUniqueName(dto.name, id);
    const method = await this.prisma.paymentMethod.update({ where: { id }, data: dto });
    await this.log(user, ip, 'payment-method.update', id, toJson(dto));
    return toPaymentMethodView(method);
  }

  /** Só formas criadas pela loja e nunca usadas podem ser excluídas; as demais são desativadas. */
  async remove(id: string, user: AuthUser, ip: string) {
    const current = await this.findOrFail(id);
    if (current.code) throw badRequest('Formas de fábrica não podem ser excluídas: desative-a');
    const used = await this.prisma.salePayment.count({ where: { paymentMethodId: id } });
    if (used) throw conflict('Esta forma já foi usada em vendas: desative-a em vez de excluir');
    await this.prisma.paymentMethod.delete({ where: { id } });
    await this.log(user, ip, 'payment-method.delete', id, { name: current.name });
  }

  private async findOrFail(id: string) {
    const method = await this.prisma.paymentMethod.findUnique({ where: { id } });
    if (!method) throw notFound('Forma de pagamento');
    return method;
  }

  private async assertUniqueName(name: string, exceptId?: string) {
    const duplicate = await this.prisma.paymentMethod.findFirst({
      where: { name: { equals: name, mode: 'insensitive' }, ...(exceptId && { id: { not: exceptId } }) },
    });
    if (duplicate) throw conflict('Já existe uma forma de pagamento com esse nome');
  }

  private log(user: AuthUser, ip: string, action: string, entityId: string, details?: Prisma.InputJsonValue) {
    return this.audit.log({ userId: user.id, action, entity: 'payment-method', entityId, details, ip });
  }
}

@Controller('payment-methods')
class PaymentMethodsController {
  constructor(private readonly methods: PaymentMethodsService) {}

  /** Qualquer usuário logado: o caixa precisa da lista (inclusive para vender offline). */
  @Get()
  list(@Query() { all }: ListQueryDto) {
    return this.methods.list(all);
  }

  @Post()
  @RequirePermissions(Permission.SETTINGS_MANAGE)
  create(@Body() dto: CreatePaymentMethodDto, @CurrentUser() user: AuthUser, @ClientIp() ip: string) {
    return this.methods.create(dto, user, ip);
  }

  @Patch(':id')
  @RequirePermissions(Permission.SETTINGS_MANAGE)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePaymentMethodDto,
    @CurrentUser() user: AuthUser,
    @ClientIp() ip: string,
  ) {
    return this.methods.update(id, dto, user, ip);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(Permission.SETTINGS_MANAGE)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser, @ClientIp() ip: string) {
    return this.methods.remove(id, user, ip);
  }
}

@Module({
  controllers: [PaymentMethodsController],
  providers: [PaymentMethodsService],
  exports: [PaymentMethodsService],
})
export class PaymentMethodsModule {}
