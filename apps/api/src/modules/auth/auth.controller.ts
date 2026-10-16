import { Body, Controller, Get, HttpCode, Post, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Response } from 'express';
import { env } from '../../config/env';
import { AuthUser, SESSION_COOKIE } from '../../common/auth/auth-user';
import { AllowPendingPasswordChange, ClientIp, CurrentUser, Public } from '../../common/auth/decorators';
import { ChangePasswordDto, LoginDto, PinLoginDto, SetPinDto } from './auth.dto';
import { AuthService, toProfile } from './auth.service';

/**
 * A sessão fica num cookie httpOnly + SameSite=Strict:
 * o JavaScript da página não consegue lê-lo (protege contra XSS) e outros sites não conseguem usá-lo (CSRF).
 */
const cookieOptions = (): CookieOptions => ({
  httpOnly: true,
  sameSite: 'strict',
  secure: env.COOKIE_SECURE,
  path: '/',
  maxAge: env.SESSION_HOURS * 60 * 60 * 1000,
});

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async login(@Body() dto: LoginDto, @ClientIp() ip: string, @Res({ passthrough: true }) res: Response) {
    const { token, user } = await this.auth.login(dto, ip);
    res.cookie(SESSION_COOKIE, token, cookieOptions());
    return toProfile(user);
  }

  /** Troca rápida de operador no caixa: substitui a sessão atual pela do novo operador. */
  @Public()
  @Post('pin-login')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async pinLogin(@Body() dto: PinLoginDto, @ClientIp() ip: string, @Res({ passthrough: true }) res: Response) {
    const { token, user } = await this.auth.pinLogin(dto, ip);
    res.cookie(SESSION_COOKIE, token, cookieOptions());
    return toProfile(user);
  }

  @Post('logout')
  @HttpCode(204)
  @AllowPendingPasswordChange()
  async logout(@CurrentUser() user: AuthUser, @ClientIp() ip: string, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(user.id, ip);
    res.clearCookie(SESSION_COOKIE, { ...cookieOptions(), maxAge: undefined });
  }

  @Get('me')
  @AllowPendingPasswordChange()
  me(@CurrentUser() user: AuthUser) {
    return this.auth.getProfile(user.id);
  }

  @Post('change-password')
  @HttpCode(200)
  @AllowPendingPasswordChange()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
    @ClientIp() ip: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { token, user: updated } = await this.auth.changePassword(user.id, dto, ip);
    res.cookie(SESSION_COOKIE, token, cookieOptions());
    return toProfile(updated);
  }

  @Post('pin')
  @HttpCode(204)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  setPin(@CurrentUser() user: AuthUser, @Body() dto: SetPinDto, @ClientIp() ip: string) {
    return this.auth.setPin(user.id, dto, ip);
  }
}
