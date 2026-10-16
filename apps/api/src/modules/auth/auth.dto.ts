import { IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import {
  PASSWORD_RULE,
  PASSWORD_RULE_MESSAGE,
  PIN_RULE,
  PIN_RULE_MESSAGE,
} from '../../common/security/password';

export class LoginDto {
  @IsString()
  @Length(1, 50)
  username: string;

  @IsString()
  @Length(1, 72)
  password: string;
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
}

export class SetPinDto {
  @IsString()
  @MaxLength(72)
  currentPassword: string;

  @Matches(PIN_RULE, { message: PIN_RULE_MESSAGE })
  pin: string;
}
