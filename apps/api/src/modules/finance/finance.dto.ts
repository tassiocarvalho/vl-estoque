import { PartialType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination';

const trimOrNull = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() || null : value);
const trimOrUndefined = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() || undefined : value);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONEY = { maxDecimalPlaces: 2 };
const MAX_MONEY = 10_000_000;

export class ExpenseCategoryDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(2, 60, { message: 'Nome de 2 a 60 caracteres' })
  name: string;
}

export class UpdateExpenseCategoryDto extends PartialType(ExpenseCategoryDto) {
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class CreatePayableDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(2, 200, { message: 'Descreva a conta (2 a 200 caracteres)' })
  description: string;

  @IsUUID('all', { message: 'Escolha a categoria' })
  categoryId: string;

  @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID()
  supplierId?: string | null;

  @IsOptional() @Transform(trimOrNull) @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(40)
  documentNumber?: string | null;

  /** Valor total (dividido entre as parcelas). */
  @IsNumber(MONEY, { message: 'Valor inválido' })
  @Min(0.01, { message: 'O valor deve ser maior que zero' })
  @Max(MAX_MONEY)
  amount: number;

  /** Vencimento da primeira parcela. */
  @Matches(ISO_DATE, { message: 'Vencimento inválido' })
  dueDate: string;

  @IsOptional() @IsInt() @Min(1) @Max(60)
  installments?: number;

  /** Dias entre as parcelas (padrão: 30). */
  @IsOptional() @IsInt() @Min(1) @Max(365)
  intervalDays?: number;

  @IsOptional() @Transform(trimOrNull) @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(500)
  notes?: string | null;
}

export class UpdatePayableDto {
  @IsOptional() @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value)) @IsString() @Length(2, 200)
  description?: string;

  @IsOptional() @IsUUID()
  categoryId?: string;

  @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID()
  supplierId?: string | null;

  @IsOptional() @Transform(trimOrNull) @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(40)
  documentNumber?: string | null;

  @IsOptional() @IsNumber(MONEY) @Min(0.01) @Max(MAX_MONEY)
  amount?: number;

  @IsOptional() @Matches(ISO_DATE, { message: 'Vencimento inválido' })
  dueDate?: string;

  @IsOptional() @Transform(trimOrNull) @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(500)
  notes?: string | null;
}

export class PayPayableDto {
  @Matches(ISO_DATE, { message: 'Data do pagamento inválida' })
  paidAt: string;

  /** Valor efetivamente pago (com juros ou desconto, se houver). */
  @IsNumber(MONEY, { message: 'Valor pago inválido' })
  @Min(0.01)
  @Max(MAX_MONEY)
  paidAmount: number;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(2, 40, { message: 'Informe como foi pago (ex.: PIX, boleto, dinheiro)' })
  paymentMethodName: string;
}

export class AttachmentDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 120)
  name: string;

  @IsIn(['application/pdf', 'image/png', 'image/jpeg', 'image/webp'], { message: 'Anexe um PDF ou uma imagem (PNG, JPEG ou WebP)' })
  type: string;

  /** Conteúdo em base64 (até 2 MB). */
  @IsString()
  @Length(4, 2_800_000, { message: 'O comprovante deve ter até 2 MB' })
  data: string;
}

export const DUE_FILTERS = ['overdue', 'today', 'week', 'month'] as const;
export type DueFilter = (typeof DUE_FILTERS)[number];

export class ListPayablesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(['open', 'paid', 'canceled', 'all'])
  status?: 'open' | 'paid' | 'canceled' | 'all';

  /** Atalhos da agenda (contas em aberto). */
  @IsOptional()
  @IsIn(DUE_FILTERS)
  due?: DueFilter;

  /** Período do vencimento (ou do pagamento, nas pagas). */
  @IsOptional() @Matches(ISO_DATE)
  from?: string;

  @IsOptional() @Matches(ISO_DATE)
  to?: string;

  @IsOptional() @IsUUID()
  supplierId?: string;

  @IsOptional() @IsUUID()
  categoryId?: string;

  @IsOptional() @Transform(trimOrUndefined) @IsString() @MaxLength(80)
  search?: string;
}

export class PeriodQueryDto {
  @IsOptional() @Matches(ISO_DATE)
  from?: string;

  @IsOptional() @Matches(ISO_DATE)
  to?: string;
}

