import { HttpStatus, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { AuthUser } from '../../common/auth/auth-user';
import { AuthorizablePermission, hasPermission } from '../../common/auth/permissions';
import { AppException, ErrorCode } from '../../common/errors';
import { PrismaService } from '../../common/prisma/prisma.service';
import { simulateVerification, verifySecret } from '../../common/security/password';
import { AuditService } from '../audit/audit.service';

const AUDIENCE = 'pos-authorization';
/** Autorização avulsa (sangria, cancelamento): curta e de uso único. */
const SHORT_TTL_SECONDS = 120;
/** Autorização presa a uma venda: dura o suficiente para a venda offline sincronizar depois. */
const SALE_TTL_SECONDS = 7 * 24 * 60 * 60;
const MAX_FAILURES = 5;
const LOCK_MS = 5 * 60_000;

interface AuthorizationPayload {
  /** Supervisor que autorizou. */
  sub: string;
  perm: AuthorizablePermission;
  /** Operador que pediu: o token não serve para outra pessoa. */
  op: string;
  /** Venda à qual a autorização está presa (opcional). */
  scope?: string;
  jti: string;
}

export interface AuthorizationRequest {
  username: string;
  pin: string;
  permission: AuthorizablePermission;
  scope?: string;
}

/**
 * Autorização de supervisor no caixa: quando o operador não tem permissão para uma ação
 * (desconto acima do limite, cancelamento, sangria), um gerente digita usuário e PIN
 * e a API devolve um token que libera aquela ação, só para aquele operador.
 */
@Injectable()
export class SupervisorAuthorizationService {
  private readonly failures = new Map<string, { count: number; lockedUntil: number }>();
  private readonly usedTokens = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  async authorize(operator: AuthUser, request: AuthorizationRequest, ip: string) {
    const username = request.username.trim().toLowerCase();
    this.assertNotLocked(username);

    const supervisor = await this.prisma.user.findUnique({ where: { username } });
    const valid =
      supervisor?.active && supervisor.pinHash
        ? await verifySecret(supervisor.pinHash, request.pin)
        : (await simulateVerification(request.pin), false);

    if (!supervisor || !valid) {
      this.registerFailure(username);
      throw new AppException(HttpStatus.FORBIDDEN, 'Usuário ou PIN do supervisor inválidos');
    }
    this.failures.delete(username);

    if (!hasPermission(supervisor.role, request.permission)) {
      throw new AppException(HttpStatus.FORBIDDEN, `${supervisor.name} não tem permissão para autorizar esta ação`);
    }

    const payload: AuthorizationPayload = {
      sub: supervisor.id,
      perm: request.permission,
      op: operator.id,
      scope: request.scope,
      jti: randomUUID(),
    };
    const expiresIn = request.scope ? SALE_TTL_SECONDS : SHORT_TTL_SECONDS;
    const token = await this.jwt.signAsync(payload, { audience: AUDIENCE, expiresIn });

    await this.audit.log({
      userId: supervisor.id,
      action: 'pos.authorize',
      entity: 'user',
      entityId: operator.id,
      details: { permission: request.permission, operator: operator.username, scope: request.scope ?? null },
      ip,
    });
    return { token, supervisor: { id: supervisor.id, name: supervisor.name }, expiresIn };
  }

  /**
   * Confere se o operador pode fazer a ação: por permissão do próprio perfil ou por um token
   * de supervisor válido. Devolve o id do supervisor (ou null quando o próprio operador pode).
   */
  async resolve(
    operator: AuthUser,
    permission: AuthorizablePermission,
    token: string | undefined,
    options: { scope?: string; reason: string } = { reason: 'Esta ação' },
  ): Promise<string | null> {
    if (hasPermission(operator.role, permission)) return null;

    const required = () =>
      new AppException(
        HttpStatus.FORBIDDEN,
        `${options.reason} precisa da autorização de um supervisor`,
        ErrorCode.AUTHORIZATION_REQUIRED,
        { permission, scope: options.scope ?? null },
      );
    if (!token) throw required();

    // O cabeçalho pode trazer vários tokens separados por vírgula (ex.: desconto e fiado na mesma venda).
    let payload: AuthorizationPayload | undefined;
    for (const candidate of token.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 5)) {
      const decoded = await this.jwt.verifyAsync<AuthorizationPayload>(candidate, { audience: AUDIENCE }).catch(() => undefined);
      if (decoded && decoded.perm === permission && decoded.op === operator.id && (decoded.scope ?? undefined) === options.scope) {
        payload = decoded;
        break;
      }
    }
    if (!payload) throw required();

    // Sem escopo, a autorização vale uma única vez.
    if (!payload.scope) {
      this.forgetExpiredTokens();
      if (this.usedTokens.has(payload.jti)) throw required();
      this.usedTokens.set(payload.jti, Date.now() + SHORT_TTL_SECONDS * 1000);
    }

    const supervisor = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!supervisor?.active || !hasPermission(supervisor.role, permission)) throw required();
    return supervisor.id;
  }

  private assertNotLocked(username: string) {
    const entry = this.failures.get(username);
    if (entry && entry.lockedUntil > Date.now()) {
      throw new AppException(HttpStatus.TOO_MANY_REQUESTS, 'Muitas tentativas de PIN incorretas. Aguarde 5 minutos.');
    }
  }

  private registerFailure(username: string) {
    const count = (this.failures.get(username)?.count ?? 0) + 1;
    const lockedUntil = count >= MAX_FAILURES ? Date.now() + LOCK_MS : 0;
    this.failures.set(username, { count: lockedUntil ? 0 : count, lockedUntil });
  }

  private forgetExpiredTokens() {
    const now = Date.now();
    for (const [jti, expiresAt] of this.usedTokens) if (expiresAt < now) this.usedTokens.delete(jti);
  }
}
