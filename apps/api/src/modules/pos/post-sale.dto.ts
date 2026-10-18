import { RefundMethod } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDate,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const MONEY = { maxDecimalPlaces: 2 };
const MAX_MONEY = 1_000_000;

// ─── Devolução ───────────────────────────────────────────────────────────────

export class ReturnItemDto {
  @IsUUID()
  saleItemId: string;

  @IsNumber({ maxDecimalPlaces: 3 }, { message: 'Quantidade inválida' })
  @Min(0.001, { message: 'A quantidade deve ser maior que zero' })
  @Max(100_000)
  quantity: number;

  /** Volta ao estoque (padrão) ou é perda (produto avariado). */
  @IsBoolean()
  restock: boolean;
}

export class CreateReturnDto {
  /** Gerado no caixa: reenviar a mesma devolução não duplica. */
  @IsUUID()
  id: string;

  @IsUUID()
  saleId: string;

  /** Caixa aberto onde a devolução está sendo feita (obrigatório para devolver em dinheiro). */
  @IsOptional()
  @IsUUID()
  sessionId?: string;

  @ValidateNested({ each: true })
  @Type(() => ReturnItemDto)
  @IsArray()
  @ArrayMinSize(1, { message: 'Escolha ao menos um item para devolver' })
  @ArrayMaxSize(500)
  items: ReturnItemDto[];

  @IsEnum(RefundMethod, { message: 'Forma de reembolso inválida' })
  refundMethod: RefundMethod;

  @Transform(trim)
  @IsString()
  @Length(3, 200, { message: 'Informe o motivo da devolução (mínimo de 3 caracteres)' })
  reason: string;
}

export class ListReturnsQueryDto extends PaginationQueryDto {
  @IsOptional() @IsUUID()
  saleId?: string;

  @IsOptional() @IsUUID()
  sessionId?: string;

  @IsOptional() @Type(() => Date) @IsDate()
  from?: Date;

  @IsOptional() @Type(() => Date) @IsDate()
  to?: Date;
}

// ─── Vale-troca ──────────────────────────────────────────────────────────────

export class LookupCreditQueryDto {
  @Transform(trim)
  @Matches(/^[A-Za-z0-9-]{4,20}$/, { message: 'Código do vale inválido' })
  code: string;
}

export class ListCreditsQueryDto {
  @IsOptional() @IsUUID()
  customerId?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  active?: boolean;
}

// ─── Fiado ───────────────────────────────────────────────────────────────────

export class CreateReceiptDto {
  /** Gerado no caixa: reenviar o mesmo recebimento não duplica. */
  @IsUUID()
  id: string;

  @IsUUID()
  sessionId: string;

  @IsUUID()
  customerId: string;

  @IsUUID('all', { message: 'Escolha a forma de pagamento' })
  methodId: string;

  /** Valor abatido da dívida. */
  @IsNumber(MONEY, { message: 'Valor inválido' })
  @Min(0.01, { message: 'O valor deve ser maior que zero' })
  @Max(MAX_MONEY)
  amount: number;

  /** Valor entregue pelo cliente (em dinheiro pode ser maior: a diferença é o troco). */
  @IsOptional()
  @IsNumber(MONEY, { message: 'Valor entregue inválido' })
  @Min(0.01)
  @Max(MAX_MONEY)
  received?: number;
}

export class ListReceivablesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(['open', 'paid', 'canceled', 'all'])
  status?: 'open' | 'paid' | 'canceled' | 'all';

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  overdue?: boolean;

  @IsOptional() @IsUUID()
  customerId?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || undefined : value))
  @IsString()
  @MaxLength(80)
  search?: string;
}

export class CancelReceivableDto {
  @Transform(trim)
  @IsString()
  @Length(3, 200, { message: 'Informe o motivo (mínimo de 3 caracteres)' })
  reason: string;
}
