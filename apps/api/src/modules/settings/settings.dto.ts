import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PAPER_SIZES, PRINTER_CONNECTIONS, THEMES } from './settings.types';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

class PinRequiredDto {
  @IsOptional() @IsBoolean() productWrite?: boolean;
  @IsOptional() @IsBoolean() productDelete?: boolean;
  @IsOptional() @IsBoolean() stockIn?: boolean;
  @IsOptional() @IsBoolean() stockOut?: boolean;
}

/** ~150 KB de imagem. Só formatos de imagem: o logotipo é exibido em <img>, nunca como HTML. */
export const MAX_LOGO_LENGTH = 200_000;
const LOGO_PATTERN = /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/]+={0,2}$/;

class StoreBrandingDto {
  @IsOptional() @Transform(trim) @IsString() @Length(1, 60) name?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(80) tagline?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(40) document?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(160) address?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(40) phone?: string;

  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'Cor inválida: use o formato #RRGGBB' })
  primaryColor?: string;

  @IsOptional() @IsIn(THEMES) theme?: (typeof THEMES)[number];

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(MAX_LOGO_LENGTH, { message: 'Logotipo muito grande: use uma imagem de até 150 KB' })
  @Matches(LOGO_PATTERN, { message: 'Logotipo inválido: use PNG, JPEG, WebP ou SVG' })
  logo?: string | null;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(300) receiptHeader?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(300) receiptFooter?: string;
}

class PrinterSettingsDto {
  @IsOptional() @IsIn(PAPER_SIZES) paper?: (typeof PAPER_SIZES)[number];
  @IsOptional() @IsBoolean() autoPrint?: boolean;
  @IsOptional() @IsIn(PRINTER_CONNECTIONS) connection?: (typeof PRINTER_CONNECTIONS)[number];

  @IsOptional()
  @Transform(trim)
  @Matches(/^([A-Za-z0-9.-]{1,253})?$/, { message: 'Endereço da impressora inválido (IP ou nome na rede)' })
  host?: string;

  @IsOptional() @IsInt() @Min(1) @Max(65535) port?: number;
  @IsOptional() @IsBoolean() openDrawerOnCash?: boolean;
}

class PosSettingsDto {
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) maxDiscountPercent?: number;
  @IsOptional() @IsBoolean() blockSaleWithoutStock?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(365) returnDays?: number;
  @IsOptional() @IsInt() @Min(0) @Max(3650) voucherValidityDays?: number;
}

class ScaleSettingsDto {
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @Matches(/^\d$/, { message: 'Prefixo da balança: um dígito (normalmente 2)' }) prefix?: string;
  @IsOptional() @IsInt() @Min(4) @Max(6) codeLength?: number;
  @IsOptional() @IsIn(['PRICE', 'WEIGHT']) mode?: 'PRICE' | 'WEIGHT';
}

class CreditSettingsDto {
  @IsOptional() @IsInt() @Min(0) @Max(365) firstDueDays?: number;
  @IsOptional() @IsInt() @Min(1) @Max(365) intervalDays?: number;
  @IsOptional() @IsBoolean() blockOverdue?: boolean;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(1_000_000) defaultLimit?: number;
}

export class UpdateSettingsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  trashRetentionDays?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(180)
  orderCoverageDays?: number;

  @IsOptional()
  @IsBoolean()
  allowNegativeStock?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => PinRequiredDto)
  pinRequired?: PinRequiredDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => StoreBrandingDto)
  store?: StoreBrandingDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => PrinterSettingsDto)
  printer?: PrinterSettingsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => PosSettingsDto)
  pos?: PosSettingsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreditSettingsDto)
  credit?: CreditSettingsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ScaleSettingsDto)
  scale?: ScaleSettingsDto;
}
