import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsOptional, IsString, Length, Matches, MaxLength, ValidateIf } from 'class-validator';
import {
  PASSWORD_RULE,
  PASSWORD_RULE_MESSAGE,
  PIN_RULE,
  PIN_RULE_MESSAGE,
} from '../../common/security/password';

const normalizeEmail = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);

export class LoginDto {
  @IsString()
  @Length(1, 50)
  username: string;

  @IsString()
  @Length(1, 72)
  password: string;
}

/** Troca rápida de operador no caixa: usuário + PIN. */
export class PinLoginDto {
  @IsString()
  @Length(1, 50)
  username: string;

  @Matches(PIN_RULE, { message: PIN_RULE_MESSAGE })
  pin: string;
}

export class ChangePasswordDto {
  /** Dispensada no primeiro acesso: a senha provisória já foi conferida no login. */
  @IsOptional()
  @IsString()
  @MaxLength(72)
  currentPassword?: string;

  @Matches(PASSWORD_RULE, { message: PASSWORD_RULE_MESSAGE })
  newPassword: string;

  /** No primeiro acesso, o PIN pode ser criado junto com a senha. */
  @IsOptional()
  @Matches(PIN_RULE, { message: PIN_RULE_MESSAGE })
  pin?: string;

  /** No primeiro acesso: e-mail para recuperar a senha (obrigatório para administradores). */
  @IsOptional()
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'E-mail inválido' })
  @MaxLength(120)
  email?: string;

  /** No primeiro acesso: ciência do Termo de Uso e Política de Privacidade. */
  @IsOptional()
  @IsBoolean()
  acceptTerms?: boolean;
}

export class AcceptTermsDto {
  @IsString()
  @MaxLength(20)
  version: string;
}

export class UpdateProfileDto {
  /** Vazio remove o e-mail (não permitido para administradores). */
  @Transform(normalizeEmail)
  @ValidateIf((dto: UpdateProfileDto) => dto.email !== '')
  @IsEmail({}, { message: 'E-mail inválido' })
  @MaxLength(120)
  email: string;

  @IsString()
  @MaxLength(72)
  currentPassword: string;
}

export class ForgotPasswordDto {
  /** Login ou e-mail. */
  @Transform(normalizeEmail)
  @IsString()
  @Length(1, 120)
  identifier: string;
}

export class RecoverPasswordDto extends ForgotPasswordDto {
  @Matches(/^\d{6}$/, { message: 'O código tem 6 números' })
  code: string;

  @Matches(PASSWORD_RULE, { message: PASSWORD_RULE_MESSAGE })
  newPassword: string;
}

export class SetPinDto {
  @IsString()
  @MaxLength(72)
  currentPassword: string;

  @Matches(PIN_RULE, { message: PIN_RULE_MESSAGE })
  pin: string;
}
