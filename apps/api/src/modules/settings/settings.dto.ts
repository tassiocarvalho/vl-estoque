import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min, ValidateNested } from 'class-validator';

class PinRequiredDto {
  @IsOptional() @IsBoolean() productWrite?: boolean;
  @IsOptional() @IsBoolean() productDelete?: boolean;
  @IsOptional() @IsBoolean() stockIn?: boolean;
  @IsOptional() @IsBoolean() stockOut?: boolean;
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
}
