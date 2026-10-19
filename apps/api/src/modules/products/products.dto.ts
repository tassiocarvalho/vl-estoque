import { PartialType, OmitType } from '@nestjs/mapped-types';
import { Unit } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
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
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const emptyToUndefined = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? undefined : typeof value === 'string' ? value.trim() : value;

/** Campo vazio vira null — permite apagar o código de barras na edição. */
const emptyToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;

const QUANTITY = { maxDecimalPlaces: 3 };

export class KitComponentDto {
  @IsUUID('all', { message: 'Item do kit inválido' })
  productId: string;

  @IsNumber({ maxDecimalPlaces: 3 }, { message: 'Quantidade do item do kit inválida' })
  @Min(0.001)
  @Max(10_000)
  quantity: number;
}
/** Valida o campo se a reposição estiver ligada (ou não informada) ou se o valor vier preenchido. */
const replenishmentOn = (dto: { replenishmentEnabled?: boolean; isKit?: boolean }, value: unknown) =>
  value !== undefined || (!dto.isKit && dto.replenishmentEnabled !== false);
const MONEY = { maxDecimalPlaces: 2 };

export class CreateProductDto {
  @Transform(trim)
  @IsString()
  @Length(2, 120)
  name: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Matches(/^[A-Z0-9._-]{1,40}$/, { message: 'SKU: use até 40 letras, números, ponto, hífen ou _' })
  sku: string;

  @IsOptional()
  @Transform(emptyToNull)
  @Matches(/^\d{8,14}$/, { message: 'Código de barras (EAN/GTIN) deve ter de 8 a 14 números' })
  barcode?: string | null;

  @IsUUID('all', { message: 'Selecione a categoria' })
  categoryId: string;

  @IsEnum(Unit, { message: 'Unidade de medida inválida' })
  unit: Unit;

  /** Controla consumo e reposição (ponto de pedido e solicitação automática). Padrão: ligado. */
  @IsOptional()
  @IsBoolean()
  replenishmentEnabled?: boolean;

  // Consumo e prazo só são obrigatórios com a reposição ligada.
  @ValidateIf(replenishmentOn)
  @IsNumber(QUANTITY)
  @Min(0)
  @Max(1_000_000)
  avgDailyConsumption: number;

  @ValidateIf(replenishmentOn)
  @IsNumber(QUANTITY)
  @Min(0)
  @Max(1_000_000)
  maxDailyConsumption: number;

  @ValidateIf(replenishmentOn)
  @IsInt()
  @Min(0)
  @Max(365)
  leadTimeDays: number;

  /** Custo médio (atualizado sozinho pelas notas de entrada; pode ser ajustado à mão). */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 }, { message: 'Preço de custo inválido' })
  @Min(0)
  @Max(1_000_000)
  costPrice?: number;

  /** Preço cobrado no caixa. */
  @IsOptional()
  @IsNumber(MONEY, { message: 'Preço de venda inválido' })
  @Min(0)
  @Max(1_000_000)
  salePrice?: number;

  /** Kit / combo: sem estoque próprio; a venda baixa os itens de "components". */
  @IsOptional()
  @IsBoolean()
  isKit?: boolean;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => KitComponentDto)
  @IsArray()
  @ArrayMaxSize(30)
  components?: KitComponentDto[];

  /** Código do produto na balança (PLU) — etiqueta com peso ou preço embutido. */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/\D/g, '').replace(/^0+(?=\d)/, '') || null : value))
  @ValidateIf((_, v) => v !== null)
  @Matches(/^\d{1,6}$/, { message: 'Código da balança: de 1 a 6 números' })
  scaleCode?: string | null;

  /** Saldo inicial ao cadastrar (gera uma movimentação de "estoque inicial"). */
  @IsOptional()
  @IsNumber(QUANTITY)
  @Min(0)
  @Max(1_000_000)
  initialStock?: number;
}

export class UpdateProductDto extends PartialType(OmitType(CreateProductDto, ['initialStock'] as const)) {}

export const STOCK_STATUS_FILTERS = ['OUT_OF_STOCK', 'CRITICAL', 'REORDER', 'OK', 'ATTENTION'] as const;
export type StockStatusFilter = (typeof STOCK_STATUS_FILTERS)[number];

export class ListProductsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @Length(1, 120)
  search?: string;

  @IsOptional()
  @IsIn(STOCK_STATUS_FILTERS)
  status?: StockStatusFilter;

  @IsOptional()
  @IsUUID()
  categoryId?: string;
}

export class LookupQueryDto {
  @Transform(trim)
  @IsString()
  @Length(1, 40)
  code: string;

  /** "true": o código é o da balança (PLU), lido da etiqueta. */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  scale?: boolean;
}

