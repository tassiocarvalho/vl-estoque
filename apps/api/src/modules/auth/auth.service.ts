import { HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role, User } from '@prisma/client';
import { randomInt } from 'node:crypto';
import { AuthUser, SessionPayload } from '../../common/auth/auth-user';
import { ROLE_PERMISSIONS } from '../../common/auth/permissions';
import { AppException, badRequest, conflict } from '../../common/errors';
import { PrismaService } from '../../common/prisma/prisma.service';
import { hashSecret, simulateVerification, verifySecret } from '../../common/security/password';
import { AuditService } from '../audit/audit.service';
import { TERMS_VERSION } from '../legal/terms';
import { MailService, type MailMessage } from '../mail/mail.module';
import { ChangePasswordDto, LoginDto, RecoverPasswordDto, SetPinDto, UpdateProfileDto } from './auth.dto';

const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const INVALID_CREDENTIALS = 'Usuário ou senha inválidos';
const RECOVERY_CODE_MINUTES = 15;
const MAX_RECOVERY_ATTEMPTS = 5;
const MAX_RECOVERY_CODES_PER_HOUR = 3;

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);

function recoveryEmail(user: User & { email: string }, code: string): MailMessage {
  const firstName = user.name.split(' ')[0];
  return {
    to: user.email,
    subject: `${code} é o seu código para redefinir a senha — V&L Estoque`,
    text:
      `Olá, ${firstName}!\n\nRecebemos um pedido para redefinir a senha do usuário "${user.username}" no V&L Estoque.\n\n` +
      `Seu código: ${code}\n\nEle vale por ${RECOVERY_CODE_MINUTES} minutos e só pode ser usado uma vez.\n\n` +
      'Se não foi você, ignore este e-mail: a sua senha continua a mesma. Nunca informe este código a ninguém.',
    html:
      `<p>Olá, ${escapeHtml(firstName)}!</p>` +
      `<p>Recebemos um pedido para redefinir a senha do usuário <b>${escapeHtml(user.username)}</b> no V&amp;L Estoque.</p>` +
      `<p style="font-size:28px;font-weight:bold;letter-spacing:6px;color:#134337">${code}</p>` +
      `<p>Ele vale por ${RECOVERY_CODE_MINUTES} minutos e só pode ser usado uma vez.</p>` +
      '<p style="color:#64748b">Se não foi você, ignore este e-mail: a sua senha continua a mesma. ' +
      'Nunca informe este código a ninguém.</p>',
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {}

  /** Autentica e devolve o token de sessão. Bloqueia a conta após tentativas seguidas erradas. */
  async login({ username, password }: LoginDto, ip: string): Promise<{ token: string; user: User }> {
    const user = await this.prisma.user.findUnique({ where: { username: username.trim().toLowerCase() } });

    if (!user || !user.active) {
      await simulateVerification(password); // evita descobrir usuários pelo tempo de resposta
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
      throw new AppException(
        HttpStatus.TOO_MANY_REQUESTS,
        `Conta bloqueada por excesso de tentativas. Tente novamente em ${minutes} min.`,
      );
    }

    if (!(await verifySecret(user.passwordHash, password))) {
      await this.registerFailedLogin(user, ip);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    await this.audit.log({ userId: user.id, action: 'auth.login', entity: 'user', entityId: user.id, ip });

    return { token: await this.signSession(updated), user: updated };
  }

  /** Revoga todas as sessões do usuário. */
  async logout(userId: string, ip: string) {
    await this.prisma.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } });
    await this.audit.log({ userId, action: 'auth.logout', entity: 'user', entityId: userId, ip });
  }

  /**
   * Troca de senha. No primeiro acesso (senha provisória), a senha atual não é pedida de novo, porque
   * já foi conferida no login. Nesse mesmo passo o usuário cria o PIN, informa o e-mail (obrigatório
   * para administradores) e dá ciência do Termo de Uso e Política de Privacidade.
   */
  async changePassword(userId: string, dto: ChangePasswordDto, ip: string) {
    let user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const firstAccess = user.mustChangePassword;
    if (!firstAccess) user = await this.verifyCurrentPassword(userId, dto.currentPassword ?? '');
    if (dto.pin && !firstAccess) throw badRequest('Para trocar o PIN, use “PIN de confirmação” em Meu perfil');
    if (dto.email && !firstAccess) throw badRequest('Para trocar o e-mail, use “Meu perfil”');
    if (await verifySecret(user.passwordHash, dto.newPassword)) throw badRequest('A nova senha deve ser diferente da atual');

    const acceptsTerms = firstAccess && dto.acceptTerms === true;
    if (firstAccess && user.termsVersion !== TERMS_VERSION && !acceptsTerms) {
      throw badRequest('Para continuar, é preciso aceitar o Termo de Uso e a Política de Privacidade');
    }
    const email = firstAccess ? (dto.email ?? user.email) : user.email;
    if (user.role === Role.ADMIN && !email) throw badRequest('Informe um e-mail: ele é usado para recuperar a senha');
    if (email && email !== user.email) await this.assertEmailAvailable(email, user.id);

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashSecret(dto.newPassword),
        mustChangePassword: false,
        tokenVersion: { increment: 1 }, // derruba sessões abertas em outros dispositivos
        ...(dto.pin && { pinHash: await hashSecret(dto.pin) }),
        ...(firstAccess && { email }),
        ...(acceptsTerms && { termsVersion: TERMS_VERSION, termsAcceptedAt: new Date() }),
      },
    });
    await this.audit.log({ userId, action: 'auth.change-password', entity: 'user', entityId: userId, ip });
    if (acceptsTerms) await this.logTermsAcceptance(userId, ip);
    return { token: await this.signSession(updated), user: updated };
  }

  /** Ciência do Termo de Uso e Política de Privacidade (pedida de novo quando o texto muda). */
  async acceptTerms(userId: string, version: string, ip: string) {
    if (version !== TERMS_VERSION) {
      throw badRequest('O termo foi atualizado. Recarregue a página para ler a versão atual.');
    }
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { termsVersion: TERMS_VERSION, termsAcceptedAt: new Date() },
    });
    await this.logTermsAcceptance(userId, ip);
    return user;
  }

  /** O próprio usuário corrige o e-mail (LGPD, art. 18, III), confirmando a senha. */
  async updateProfile(userId: string, dto: UpdateProfileDto, ip: string) {
    const user = await this.verifyCurrentPassword(userId, dto.currentPassword);
    const email = dto.email || null;
    if (!email && user.role === Role.ADMIN) {
      throw badRequest('Administradores precisam de um e-mail para recuperar a senha');
    }
    if (email && email !== user.email) await this.assertEmailAvailable(email, userId);

    const updated = await this.prisma.user.update({ where: { id: userId }, data: { email } });
    await this.audit.log({ userId, action: 'auth.update-email', entity: 'user', entityId: userId, ip });
    return updated;
  }

  /** Cópia dos dados pessoais do próprio usuário (LGPD, art. 18, II e V: acesso e portabilidade). */
  async exportMyData(userId: string, ip: string) {
    const [user, auditLogs, movements, purchaseRequests] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId } }),
      this.prisma.auditLog.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, action: true, entity: true, entityId: true, ip: true },
      }),
      this.prisma.stockMovement.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, type: true, quantity: true, product: { select: { sku: true, name: true } } },
      }),
      this.prisma.purchaseRequest.findMany({
        where: { createdById: userId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, status: true, product: { select: { sku: true, name: true } } },
      }),
    ]);
    await this.audit.log({ userId, action: 'auth.export-data', entity: 'user', entityId: userId, ip });
    return {
      geradoEm: new Date().toISOString(),
      aviso:
        'Dados pessoais tratados pelo V&L Estoque (LGPD, art. 18). ' +
        'Senha e PIN são guardados apenas como hash irreversível e por isso não aparecem aqui.',
      usuario: {
        nome: user.name,
        login: user.username,
        email: user.email,
        perfil: user.role,
        ativo: user.active,
        pinCadastrado: user.pinHash !== null,
        criadoEm: user.createdAt,
        ultimoAcesso: user.lastLoginAt,
        termoAceito: user.termsVersion ? { versao: user.termsVersion, em: user.termsAcceptedAt } : null,
      },
      registrosDeAuditoria: auditLogs,
      movimentacoesRegistradas: movements,
      solicitacoesDePedidoCriadas: purchaseRequests,
    };
  }

  // ─── Recuperação de senha por e-mail ──────────────────────────────────────────

  /** Se a recuperação por e-mail está disponível (usado pela tela "Esqueci minha senha"). */
  async recoveryOptions() {
    return { email: await this.mail.isConfigured() };
  }

  /**
   * Envia um código de 6 números para o e-mail do usuário. A resposta é sempre a mesma,
   * exista ou não o usuário, para não revelar quem tem conta no sistema.
   */
  async forgotPassword(identifier: string, ip: string) {
    const user = await this.findByLoginOrEmail(identifier);
    if (!user?.email || !(await this.mail.isConfigured())) {
      await simulateVerification(identifier);
      return;
    }

    const recent = await this.prisma.passwordReset.count({
      where: { userId: user.id, createdAt: { gte: new Date(Date.now() - 60 * 60_000) } },
    });
    if (recent >= MAX_RECOVERY_CODES_PER_HOUR) {
      await this.audit.log({ userId: user.id, action: 'auth.recovery-throttled', entity: 'user', entityId: user.id, ip });
      return;
    }

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const codeHash = await hashSecret(code);
    await this.prisma.$transaction([
      // Só o código mais recente vale.
      this.prisma.passwordReset.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } }),
      this.prisma.passwordReset.create({
        data: { userId: user.id, codeHash, expiresAt: new Date(Date.now() + RECOVERY_CODE_MINUTES * 60_000), ip },
      }),
    ]);
    await this.audit.log({ userId: user.id, action: 'auth.recovery-requested', entity: 'user', entityId: user.id, ip });

    this.mail.sendInBackground(recoveryEmail({ ...user, email: user.email }, code), () => {
      void this.audit.log({ userId: user.id, action: 'auth.recovery-mail-failed', entity: 'user', entityId: user.id, ip });
    });
  }

  /** Confere o código e define a nova senha. Encerra todas as sessões abertas do usuário. */
  async recoverPassword(dto: RecoverPasswordDto, ip: string) {
    const invalid = badRequest('Código inválido ou expirado. Confira o e-mail ou peça um novo código.');
    const user = await this.findByLoginOrEmail(dto.identifier);
    if (!user) {
      await simulateVerification(dto.code);
      throw invalid;
    }

    const reset = await this.prisma.passwordReset.findFirst({
      where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!reset) throw invalid;
    if (reset.attempts >= MAX_RECOVERY_ATTEMPTS) {
      await this.prisma.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } });
      throw badRequest('Muitas tentativas com o código errado. Peça um novo código.');
    }
    if (!(await verifySecret(reset.codeHash, dto.code))) {
      await this.prisma.passwordReset.update({ where: { id: reset.id }, data: { attempts: { increment: 1 } } });
      throw invalid;
    }
    if (await verifySecret(user.passwordHash, dto.newPassword)) {
      throw badRequest('A nova senha deve ser diferente da atual');
    }

    const passwordHash = await hashSecret(dto.newPassword);
    await this.prisma.$transaction([
      this.prisma.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } }),
      this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash, mustChangePassword: false, failedLoginAttempts: 0, lockedUntil: null, tokenVersion: { increment: 1 } },
      }),
    ]);
    await this.audit.log({ userId: user.id, action: 'auth.password-recovered', entity: 'user', entityId: user.id, ip });
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

  private findByLoginOrEmail(identifier: string) {
    const value = identifier.trim().toLowerCase();
    return this.prisma.user.findFirst({ where: { active: true, OR: [{ username: value }, { email: value }] } });
  }

  private async assertEmailAvailable(email: string, userId: string) {
    const owner = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (owner && owner.id !== userId) throw conflict('Este e-mail já está em uso por outro usuário');
  }

  private logTermsAcceptance(userId: string, ip: string) {
    return this.audit.log({
      userId,
      action: 'auth.accept-terms',
      entity: 'user',
      entityId: userId,
      details: { version: TERMS_VERSION },
      ip,
    });
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
  email: user.email,
  mustChangePassword: user.mustChangePassword,
  hasPin: user.pinHash !== null,
  termsAccepted: user.termsVersion === TERMS_VERSION,
  permissions: ROLE_PERMISSIONS[user.role],
});
