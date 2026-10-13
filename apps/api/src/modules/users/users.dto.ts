import { Role } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString, Length, Matches } from 'class-validator';
import {
  PASSWORD_RULE,
  PASSWORD_RULE_MESSAGE,
  PIN_RULE,
  PIN_RULE_MESSAGE,
} from '../../common/security/password';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateUserDto {
  @Transform(trim)
  @IsString()
  @Length(2, 80)
  name: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @Matches(/^[a-z0-9._-]{3,30}$/, {
    message: 'Usuário deve ter de 3 a 30 caracteres: letras minúsculas, números, ponto, hífen ou _',
  })
  username: string;

  @IsEnum(Role, { message: 'Perfil inválido' })
  role: Role;

  @Matches(PASSWORD_RULE, { message: PASSWORD_RULE_MESSAGE })
  password: string;

  @IsOptional()
  @Matches(PIN_RULE, { message: PIN_RULE_MESSAGE })
  pin?: string;
}

export class UpdateUserDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 80)
  name?: string;

  @IsOptional()
  @IsEnum(Role, { message: 'Perfil inválido' })
  role?: Role;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class ResetPasswordDto {
  @Matches(PASSWORD_RULE, { message: PASSWORD_RULE_MESSAGE })
  password: string;
}

export class ResetPinDto {
  @Matches(PIN_RULE, { message: PIN_RULE_MESSAGE })
  pin: string;
}
