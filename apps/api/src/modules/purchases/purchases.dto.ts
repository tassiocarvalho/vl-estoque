import { PartialType } from '@nestjs/mapped-types';
import { PurchaseInvoiceStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
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
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { onlyDigits } from '../../common/document';
import { PaginationQueryDto } from '../../common/pagination';

const trimOrNull = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() || null : value);
const trimOrUndefined = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() || undefined : value);
const digitsOrNull = ({ value }: { value: unknown }) => (typeof value === 'string' ? onlyDigits(value) || null : value);
const MONEY = { maxDecimalPlaces: 2 };
const MAX_MONEY = 10_000_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// ─── Fornecedores ────────────────────────────────────────────────────────────

export class SupplierDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(2, 120, { message: 'Informe a razão social ou o nome (2 a 120 caracteres)' })
  name: string;

  @IsOptional() @Transform(trimOrNull) @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(120)
  tradeName?: string | null;

  @IsOptional()
  @Transform(digitsOrNull)
  @ValidateIf((_, v) => v !== null)
  @Matches(/^(\d{11}|\d{14})$/, { message: 'CNPJ deve ter 14 números (ou CPF 11)' })
  document?: string | null;

  @IsOptional()
  @Transform(digitsOrNull)
  @ValidateIf((_, v) => v !== null)
  @Matches(/^\d{10,13}$/, { message: 'Telefone inválido: use DDD + número' })
  phone?: string | null;

  @IsOptional() @Transform(trimOrNull) @ValidateIf((_, v) => v !== null) @IsEmail({}, { message: 'E-mail inválido' }) @MaxLength(120)
  email?: string | null;

  @IsOptional() @Transform(trimOrNull) @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(80)
  contactName?: string | null;

  @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(0) @Max(365)
  leadTimeDays?: number | null;

  @IsOptional() @Transform(trimOrNull) @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(80)
  paymentTerms?: string | null;

  @IsOptional() @Transform(trimOrNull) @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(500)
  notes?: string | null;
}

export class UpdateSupplierDto extends PartialType(SupplierDto) {
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class ListSuppliersQueryDto extends PaginationQueryDto {
  @IsOptional() @Transform(trimOrUndefined) @IsString() @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsIn(['active', 'inactive', 'all'])
  status?: 'active' | 'inactive' | 'all';
}

/** Vínculo produto × fornecedor (código no fornecedor, conversão e preferido). */
export class ProductSupplierDto {
  @IsOptional() @Transform(trimOrNull) @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(60)
  supplierCode?: string | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 }, { message: 'Fator de conversão inválido' })
  @Min(0.001)
  @Max(100_000)
  factor?: number;

  @IsOptional()
  @IsBoolean()
  preferred?: boolean;
}

// ─── Notas de entrada ────────────────────────────────────────────────────────

export class InvoiceItemDto {
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID('all', { message: 'Produto inválido' })
  productId?: string | null;

  @IsOptional() @Transform(trimOrNull) @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(60)
  supplierCode?: string | null;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 200, { message: 'Descrição do item: até 200 caracteres' })
  description: string;

  @IsOptional() @Transform(trimOrNull) @ValidateIf((_, v) => v !== null) @Matches(/^\d{8,14}$/)
  barcode?: string | null;

  @IsOptional() @Transform(trimOrNull) @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(10)
  purchaseUnit?: string | null;

  @IsNumber({ maxDecimalPlaces: 3 }, { message: 'Quantidade inválida' })
  @Min(0.001, { message: 'A quantidade deve ser maior que zero' })
  @Max(1_000_000)
  quantity: number;

  @IsNumber({ maxDecimalPlaces: 4 }, { message: 'Custo unitário inválido' })
  @Min(0)
  @Max(MAX_MONEY)
  unitCost: number;

  /** Valor do item na nota (padrão: quantidade × custo unitário). */
  @IsOptional()
  @IsNumber(MONEY, { message: 'Valor do item inválido' })
  @Min(0)
  @Max(MAX_MONEY)
  total?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 }, { message: 'Fator de conversão inválido' })
  @Min(0.001)
  @Max(100_000)
  factor?: number;
}

export class InstallmentDto {
  @Matches(ISO_DATE, { message: 'Vencimento inválido' })
  dueDate: string;

  @IsNumber(MONEY, { message: 'Valor da parcela inválido' })
  @Min(0.01)
  @Max(MAX_MONEY)
  amount: number;
}

export class SaveInvoiceDto {
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID()
  supplierId?: string | null;

  @IsOptional() @Transform(trimOrNull) @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(20)
  documentNumber?: string | null;

  @IsOptional() @Transform(trimOrNull) @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(5)
  series?: string | null;

  @IsOptional() @ValidateIf((_, v) => v !== null) @Matches(ISO_DATE, { message: 'Data de emissão inválida' })
  issueDate?: string | null;

  @IsOptional() @IsNumber(MONEY) @Min(0) @Max(MAX_MONEY)
  freight?: number;

  @IsOptional() @IsNumber(MONEY) @Min(0) @Max(MAX_MONEY)
  otherCosts?: number;

  @IsOptional() @IsNumber(MONEY) @Min(0) @Max(MAX_MONEY)
  discount?: number;

  @IsOptional() @ValidateIf((_, v) => v !== null) @IsNumber(MONEY) @Min(0) @Max(MAX_MONEY)
  declaredTotal?: number | null;

  @IsOptional() @Transform(trimOrNull) @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(500)
  notes?: string | null;

  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  @IsArray()
  @ArrayMaxSize(500)
  items: InvoiceItemDto[];

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => InstallmentDto)
  @IsArray()
  @ArrayMaxSize(60)
  installments?: InstallmentDto[];
}

export class ImportXmlDto {
  @IsString()
  @Length(50, 5_000_000, { message: 'Arquivo XML vazio ou grande demais' })
  xml: string;
}

export class ListInvoicesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(PurchaseInvoiceStatus)
  status?: PurchaseInvoiceStatus;

  @IsOptional() @IsUUID()
  supplierId?: string;

  @IsOptional() @Transform(trimOrUndefined) @IsString() @MaxLength(60)
  search?: string;
}
