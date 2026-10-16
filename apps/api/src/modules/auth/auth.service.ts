import { HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import { AuthUser, SessionPayload } from '../../common/auth/auth-user';
import { ROLE_PERMISSIONS } from '../../common/auth/permissions';
import { AppException, badRequest } from '../../common/errors';
import { PrismaService } from '../../common/prisma/prisma.service';
import { hashSecret, simulateVerification, verifySecret } from '../../common/security/password';
import { AuditService } from '../audit/audit.service';
import { ChangePasswordDto, LoginDto, PinLoginDto, SetPinDto } from './auth.dto';

const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const INVALID_CREDENTIALS = 'Usuário ou senha inválidos';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  /** Autentica e devolve o token de sessão. Bloqueia a conta após tentativas seguidas erradas. */
  login({ username, password }: LoginDto, ip: string): Promise<{ token: string; user: User }> {
    return this.authenticate(username, password, (user) => user.passwordHash, 'auth.login', ip);
  }

  /**
   * Troca rápida de operador no caixa (usuário + PIN). Mesmas proteções do login com senha;
   * quem ainda tem senha provisória precisa entrar com a senha para trocá-la.
   */
  async pinLogin({ username, pin }: PinLoginDto, ip: string): Promise<{ token: string; user: User }> {
    const result = await this.authenticate(username, pin, (user) => user.pinHash, 'auth.pin-login', ip);
    if (result.user.mustChangePassword) {
      throw badRequest('Este usuário ainda tem senha provisória: entre com usuário e senha');
    }
    return result;
  }

  private async authenticate(
    username: string,
    secret: string,
    hashOf: (user: User) => string | null,
    action: string,
    ip: string,
  ): Promise<{ token: string; user: User }> {
    const user = await this.prisma.user.findUnique({ where: { username: username.trim().toLowerCase() } });
    const hashed = user ? hashOf(user) : null;

    if (!user || !user.active || !hashed) {
      await simulateVerification(secret); // evita descobrir usuários pelo tempo de resposta
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
      throw new AppException(
        HttpStatus.TOO_MANY_REQUESTS,
        `Conta bloqueada por excesso de tentativas. Tente novamente em ${minutes} min.`,
      );
    }

    if (!(await verifySecret(hashed, secret))) {
      await this.registerFailedLogin(user, ip);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    await this.audit.log({ userId: user.id, action, entity: 'user', entityId: user.id, ip });

    return { token: await this.signSession(updated), user: updated };
  }

  /** Revoga todas as sessões do usuário. */
  async logout(userId: string, ip: string) {
    await this.prisma.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } });
    await this.audit.log({ userId, action: 'auth.logout', entity: 'user', entityId: userId, ip });
  }

  async changePassword(userId: string, dto: ChangePasswordDto, ip: string) {
    const user = await this.verifyCurrentPassword(userId, dto.currentPassword);
    if (dto.currentPassword === dto.newPassword) throw badRequest('A nova senha deve ser diferente da atual');

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashSecret(dto.newPassword),
        mustChangePassword: false,
        tokenVersion: { increment: 1 }, // derruba sessões abertas em outros dispositivos
      },
    });
    await this.audit.log({ userId, action: 'auth.change-password', entity: 'user', entityId: userId, ip });
    return { token: await this.signSession(updated), user: updated };
  }

  async setPin(userId: string, dto: SetPinDto, ip: string) {
    await this.verifyCurrentPassword(userId, dto.currentPassword);
    await this.prisma.user.update({ where: { id: userId }, data: { pinHash: await hashSecret(dto.pin) } });
    await this.audit.log({ userId, action: 'auth.set-pin', entity: 'user', entityId: userId, ip });
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return toProfile(user);
  }

  private signSession(user: User) {
    const payload: SessionPayload = { sub: user.id, tv: user.tokenVersion };
    return this.jwt.signAsync(payload);
  }

  private async verifyCurrentPassword(userId: string, password: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await verifySecret(user.passwordHash, password))) throw badRequest('Senha atual incorreta');
    return user;
  }

  private async registerFailedLogin(user: User, ip: string) {
    const attempts = user.failedLoginAttempts + 1;
    const shouldLock = attempts >= MAX_LOGIN_ATTEMPTS;

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: shouldLock ? 0 : attempts,
        lockedUntil: shouldLock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
      },
    });
    await this.audit.log({
      userId: user.id,
      action: shouldLock ? 'auth.account-locked' : 'auth.login-failed',
      entity: 'user',
      entityId: user.id,
      ip,
    });
  }
}

export const toProfile = (user: User): AuthUser & { permissions: readonly string[] } => ({
  id: user.id,
  name: user.name,
  username: user.username,
  role: user.role,
  mustChangePassword: user.mustChangePassword,
  hasPin: user.pinHash !== null,
  permissions: ROLE_PERMISSIONS[user.role],
});
