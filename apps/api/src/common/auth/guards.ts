import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { AppException, ErrorCode } from '../errors';
import { verifySecret } from '../security/password';
import { TERMS_VERSION } from '../../modules/legal/terms';
import { SettingsService } from '../../modules/settings/settings.service';
import type { PinProtectedOperation } from '../../modules/settings/settings.types';
import { AuthenticatedRequest, SESSION_COOKIE, SessionPayload } from './auth-user';
import { ALLOW_PENDING_PASSWORD, IS_PUBLIC, PIN_OPERATION, REQUIRED_PERMISSIONS } from './decorators';
import { hasPermission, Permission } from './permissions';

const sessionExpired = () => new UnauthorizedException('Sessão expirada. Faça login novamente.');

const isPublic = (reflector: Reflector, ctx: ExecutionContext) =>
  reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]) ?? false;

/** Valida o cookie de sessão e confirma no banco que o usuário continua ativo. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (isPublic(this.reflector, ctx)) return true;

    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const token: string | undefined = request.cookies?.[SESSION_COOKIE];
    if (!token) throw sessionExpired();

    let payload: SessionPayload;
    try {
      payload = await this.jwt.verifyAsync<SessionPayload>(token);
    } catch {
      throw sessionExpired();
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.active || user.tokenVersion !== payload.tv) throw sessionExpired();

    request.user = {
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
      email: user.email,
      mustChangePassword: user.mustChangePassword,
      hasPin: user.pinHash !== null,
      termsAccepted: user.termsVersion === TERMS_VERSION,
    };

    const allowPending = this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_PASSWORD, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (user.mustChangePassword && !allowPending) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'Troque sua senha para continuar',
        ErrorCode.PASSWORD_CHANGE_REQUIRED,
      );
    }
    if (!request.user.termsAccepted && !allowPending) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'Leia e aceite o Termo de Uso e a Política de Privacidade para continuar',
        ErrorCode.TERMS_ACCEPTANCE_REQUIRED,
      );
    }
    return true;
  }
}

/** Bloqueia a rota se o perfil do usuário não tiver as permissões exigidas. */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    if (isPublic(this.reflector, ctx)) return true;

    const required = this.reflector.getAllAndOverride<Permission[]>(REQUIRED_PERMISSIONS, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required?.length) return true;

    const { user } = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    if (required.every((permission) => hasPermission(user.role, permission))) return true;

    throw new ForbiddenException('Seu perfil não tem permissão para esta ação');
  }
}

const MAX_PIN_ATTEMPTS = 5;
const PIN_LOCK_MS = 5 * 60_000;

/**
 * Confirma o PIN do usuário em operações sensíveis (cadastrar, excluir, movimentar estoque).
 * Quais operações pedem PIN é definido nas configurações do sistema.
 */
@Injectable()
export class PinGuard implements CanActivate {
  private readonly failures = new Map<string, { count: number; lockedUntil: number }>();

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const operation = this.reflector.get<PinProtectedOperation | undefined>(
      PIN_OPERATION,
      ctx.getHandler(),
    );
    if (!operation) return true;

    const { pinRequired } = await this.settings.get();
    if (!pinRequired[operation]) return true;

    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = request.user.id;
    this.assertNotLocked(userId);

    const pin = request.header('x-operation-pin');
    if (!pin) {
      throw new AppException(HttpStatus.PRECONDITION_REQUIRED, 'Informe seu PIN', ErrorCode.PIN_REQUIRED);
    }

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { pinHash: true },
    });
    if (!user.pinHash) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'Você ainda não cadastrou um PIN. Acesse "Meu perfil" para criar.',
        ErrorCode.PIN_NOT_SET,
      );
    }

    if (await verifySecret(user.pinHash, pin)) {
      this.failures.delete(userId);
      return true;
    }

    this.registerFailure(userId);
    throw new AppException(HttpStatus.FORBIDDEN, 'PIN incorreto', ErrorCode.PIN_INVALID);
  }

  private assertNotLocked(userId: string) {
    const entry = this.failures.get(userId);
    if (entry && entry.lockedUntil > Date.now()) {
      throw new AppException(
        HttpStatus.TOO_MANY_REQUESTS,
        'Muitas tentativas de PIN incorretas. Aguarde 5 minutos.',
        ErrorCode.PIN_INVALID,
      );
    }
  }

  private registerFailure(userId: string) {
    const count = (this.failures.get(userId)?.count ?? 0) + 1;
    const lockedUntil = count >= MAX_PIN_ATTEMPTS ? Date.now() + PIN_LOCK_MS : 0;
    this.failures.set(userId, { count: lockedUntil ? 0 : count, lockedUntil });
  }
}
