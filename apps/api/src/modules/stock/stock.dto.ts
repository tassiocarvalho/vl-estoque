import { MovementType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxDate,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination';

export const ENTRY_TYPES = [MovementType.IN_PURCHASE, MovementType.IN_RETURN, MovementType.IN_ADJUSTMENT] as const;
export const EXIT_TYPES = [MovementType.OUT_SALE, MovementType.OUT_LOSS, MovementType.OUT_ADJUSTMENT] as const;

export const isEntry = (type: MovementType) => (ENTRY_TYPES as readonly MovementType[]).includes(type);

const trimOrUndefined = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || undefined : value;

/** Tolerância de relógio entre o dispositivo e o servidor. */
const inNearFuture = () => new Date(Date.now() + 5 * 60_000);

abstract class MovementDto {
  /** UUID gerado no dispositivo: torna o envio idempotente (reenvio offline não duplica). */
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsUUID()
  productId: string;

  @IsNumber({ maxDecimalPlaces: 3 }, { message: 'Quantidade inválida' })
  @Min(0.001, { message: 'A quantidade deve ser maior que zero' })
  @Max(1_000_000)
  quantity: number;

  @IsOptional()
  @Transform(trimOrUndefined)
  @IsString()
  @MaxLength(200)
  note?: string;

  /** Quando aconteceu (registros feitos offline chegam depois). */
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  @MaxDate(inNearFuture, { message: 'Data da movimentação no futuro' })
  occurredAt?: Date;
}

export class RegisterEntryDto extends MovementDto {
  @IsIn(ENTRY_TYPES, { message: 'Tipo de entrada inválido' })
  type: MovementType;
}

export class RegisterExitDto extends MovementDto {
  @IsIn(EXIT_TYPES, { message: 'Tipo de saída inválido' })
  type: MovementType;
}

export class ListMovementsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsEnum(MovementType)
  type?: MovementType;

  @IsOptional()
  @IsIn(['IN', 'OUT'])
  direction?: 'IN' | 'OUT';

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;
}
