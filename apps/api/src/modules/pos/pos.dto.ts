import { CashMovementType, DiscountType, PaymentMethod, SaleStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDate,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxDate,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { AUTHORIZABLE_PERMISSIONS, type AuthorizablePermission } from '../../common/auth/permissions';
import { PaginationQueryDto } from '../../common/pagination';
import { PIN_RULE, PIN_RULE_MESSAGE } from '../../common/security/password';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const MONEY = { maxDecimalPlaces: 2 };
const MAX_MONEY = 1_000_000;
/** Tolerância de relógio entre o caixa e o servidor. */
const inNearFuture = () => new Date(Date.now() + 5 * 60_000);

export class TerminalQueryDto {
  @Transform(trim)
  @IsString()
  @Length(1, 40)
  terminal: string;
}

export class OpenCashDto {
  @Transform(trim)
  @Matches(/^[\p{L}\p{N} ._-]{1,40}$/u, { message: 'Nome do terminal inválido (até 40 letras, números, espaço, ponto, hífen ou _)' })
  terminal: string;

  @IsNumber(MONEY, { message: 'Valor do troco inicial inválido' })
  @Min(0)
  @Max(MAX_MONEY)
  openingAmount: number;
}

export class CashMovementDto {
  @IsEnum(CashMovementType)
  type: CashMovementType;

  @IsNumber(MONEY, { message: 'Valor inválido' })
  @Min(0.01, { message: 'O valor deve ser maior que zero' })
  @Max(MAX_MONEY)
  amount: number;

  @Transform(trim)
  @IsString()
  @Length(3, 200, { message: 'Informe a justificativa (mínimo de 3 caracteres)' })
  reason: string;
}

export class CloseCashDto {
  @IsNumber(MONEY, { message: 'Valor contado inválido' })
  @Min(0)
  @Max(MAX_MONEY)
  countedCash: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class ListCashSessionsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;
}

export class DiscountDto {
  @IsEnum(DiscountType)
  type: DiscountType;

  @IsNumber(MONEY, { message: 'Desconto inválido' })
  @Min(0)
  @Max(MAX_MONEY)
  value: number;
}

export class SaleItemDto {
  @IsUUID()
  productId: string;

  @IsNumber({ maxDecimalPlaces: 3 }, { message: 'Quantidade inválida' })
  @Min(0.001, { message: 'A quantidade deve ser maior que zero' })
  @Max(100_000)
  quantity: number;

  /** Preço que o caixa cobrou (o caixa pode ter vendido offline com o preço salvo no aparelho). */
  @IsNumber(MONEY, { message: 'Preço inválido' })
  @Min(0)
  @Max(MAX_MONEY)
  unitPrice: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => DiscountDto)
  discount?: DiscountDto;
}

export class PaymentDto {
  @IsEnum(PaymentMethod, { message: 'Forma de pagamento inválida' })
  method: PaymentMethod;

  @IsNumber(MONEY, { message: 'Valor de pagamento inválido' })
  @Min(0.01)
  @Max(MAX_MONEY)
  amount: number;
}

/** Item retirado do cupom antes de finalizar — vai para a auditoria. */
export class RemovedItemDto {
  @IsUUID()
  productId: string;

  @Transform(trim)
  @IsString()
  @MaxLength(120)
  name: string;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(100_000)
  quantity: number;

  @Type(() => Date)
  @IsDate()
  at: Date;
}

export class CreateSaleDto {
  /** Gerado no caixa: reenviar a mesma venda (sincronização offline) não duplica. */
  @IsUUID()
  id: string;

  @IsUUID()
  sessionId: string;

  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  @IsArray()
  @ArrayMinSize(1, { message: 'A venda não tem itens' })
  @ArrayMaxSize(500)
  items: SaleItemDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => DiscountDto)
  orderDiscount?: DiscountDto;

  @ValidateNested({ each: true })
  @Type(() => PaymentDto)
  @IsArray()
  @ArrayMinSize(1, { message: 'Informe a forma de pagamento' })
  @ArrayMaxSize(10)
  payments: PaymentDto[];

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => RemovedItemDto)
  @IsArray()
  @ArrayMaxSize(500)
  removedItems?: RemovedItemDto[];

  @Type(() => Date)
  @IsDate()
  @MaxDate(inNearFuture, { message: 'Data da venda no futuro' })
  occurredAt: Date;

  /** Venda registrada sem internet e enviada depois. */
  @IsOptional()
  @IsBoolean()
  offline?: boolean;
}

/** Venda em andamento cancelada inteira no caixa (Esc) antes de finalizar — só para a auditoria. */
export class AbandonSaleDto {
  @IsUUID()
  saleId: string;

  @ValidateNested({ each: true })
  @Type(() => RemovedItemDto)
  @IsArray()
  @ArrayMaxSize(500)
  items: RemovedItemDto[];

  @IsNumber(MONEY)
  @Min(0)
  @Max(MAX_MONEY)
  total: number;
}

export class CancelSaleDto {
  @Transform(trim)
  @IsString()
  @Length(3, 200, { message: 'Informe o motivo do cancelamento (mínimo de 3 caracteres)' })
  reason: string;
}

export class ListSalesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  sessionId?: string;

  @IsOptional()
  @IsEnum(SaleStatus)
  status?: SaleStatus;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;

  /** Número da venda (cupom). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  number?: number;
}

export class SalesReportQueryDto {
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;
}

export class AuthorizeDto {
  @Transform(trim)
  @IsString()
  @Length(1, 50)
  username: string;

  @Matches(PIN_RULE, { message: PIN_RULE_MESSAGE })
  pin: string;

  @IsIn(AUTHORIZABLE_PERMISSIONS)
  permission: AuthorizablePermission;

  /** Id da venda, quando a autorização é de desconto (fica válida até a venda sincronizar). */
  @IsOptional()
  @IsUUID()
  scope?: string;
}
