import { IsString, Length, Matches, MaxLength } from 'class-validator';
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

/** Troca rápida de operador no caixa: usuário + PIN. */
export class PinLoginDto {
  @IsString()
  @Length(1, 50)
  username: string;

  @Matches(PIN_RULE, { message: PIN_RULE_MESSAGE })
  pin: string;
}

export class ChangePasswordDto {
  @IsString()
  @MaxLength(72)
  currentPassword: string;

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
