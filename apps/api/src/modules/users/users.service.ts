import { Injectable } from '@nestjs/common';
import { Role, User } from '@prisma/client';
import { badRequest, conflict, notFound } from '../../common/errors';
import { PrismaService } from '../../common/prisma/prisma.service';
import { randomBytes } from 'node:crypto';
import { hashSecret } from '../../common/security/password';
import { AuditService } from '../audit/audit.service';
import { CreateUserDto, UpdateUserDto } from './users.dto';

interface Actor {
  id: string;
  ip: string;
}

/** Dados do usuário que podem sair da API (nunca expõe hashes). */
const toUserView = (user: User) => ({
  id: user.id,
  name: user.name,
  username: user.username,
  email: user.email,
  role: user.role,
  active: user.active,
  hasPin: user.pinHash !== null,
  mustChangePassword: user.mustChangePassword,
  locked: user.lockedUntil !== null && user.lockedUntil > new Date(),
  lastLoginAt: user.lastLoginAt,
  termsAcceptedAt: user.termsAcceptedAt,
  anonymized: user.anonymizedAt !== null,
  createdAt: user.createdAt,
});

const ADMIN_EMAIL_REQUIRED = 'Administradores precisam de um e-mail (usado para recuperar a senha)';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    const users = await this.prisma.user.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }] });
    return users.map(toUserView);
  }

  async create(dto: CreateUserDto, actor: Actor) {
    const exists = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (exists) throw conflict('Já existe um usuário com esse login');
    const email = dto.email || null;
    if (dto.role === Role.ADMIN && !email) throw badRequest(ADMIN_EMAIL_REQUIRED);
    if (email) await this.assertEmailAvailable(email);

    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        username: dto.username,
        email,
        role: dto.role,
        passwordHash: await hashSecret(dto.password),
        pinHash: dto.pin ? await hashSecret(dto.pin) : null,
        mustChangePassword: true, // senha definida pelo administrador é provisória
      },
    });
    await this.log(actor, 'user.create', user.id, { username: user.username, role: user.role });
    return toUserView(user);
  }

  async update(id: string, dto: UpdateUserDto, actor: Actor) {
    const user = await this.findOrFail(id);

    if (user.anonymizedAt) throw badRequest('Este usuário foi anonimizado e não pode mais ser alterado');
    if (id === actor.id && (dto.active === false || (dto.role && dto.role !== user.role))) {
      throw badRequest('Você não pode desativar nem alterar o perfil do seu próprio usuário');
    }
    const losesAdmin = user.role === Role.ADMIN && (dto.active === false || (dto.role && dto.role !== Role.ADMIN));
    if (losesAdmin) await this.assertAnotherActiveAdmin(id);

    const email = dto.email === undefined ? user.email : dto.email || null;
    if ((dto.role ?? user.role) === Role.ADMIN && !email) throw badRequest(ADMIN_EMAIL_REQUIRED);
    if (email && email !== user.email) await this.assertEmailAvailable(email, id);

    const revokeSessions = dto.active === false || (dto.role !== undefined && dto.role !== user.role);
    const updated = await this.prisma.user.update({
      where: { id },
      data: { ...dto, email, ...(revokeSessions && { tokenVersion: { increment: 1 } }) },
    });
    await this.log(actor, 'user.update', id, { ...dto });
    return toUserView(updated);
  }

  /** O administrador define uma senha provisória; o usuário troca no próximo acesso. */
  async resetPassword(id: string, password: string, actor: Actor) {
    await this.findOrFail(id);
    await this.prisma.user.update({
      where: { id },
      data: {
        passwordHash: await hashSecret(password),
        mustChangePassword: true,
        failedLoginAttempts: 0,
        lockedUntil: null,
        tokenVersion: { increment: 1 },
      },
    });
    await this.log(actor, 'user.reset-password', id);
  }

  async resetPin(id: string, pin: string, actor: Actor) {
    await this.findOrFail(id);
    await this.prisma.user.update({ where: { id }, data: { pinHash: await hashSecret(pin) } });
    await this.log(actor, 'user.reset-pin', id);
  }

  /**
   * Anonimiza um usuário desativado (LGPD, art. 18, IV e VI): apaga nome, login, e-mail, credenciais e IPs.
   * As movimentações continuam no histórico do estoque, mas sem identificar a pessoa.
   */
  async anonymize(id: string, actor: Actor) {
    const user = await this.findOrFail(id);
    if (id === actor.id) throw badRequest('Você não pode anonimizar o seu próprio usuário');
    if (user.active) throw badRequest('Desative o usuário antes de anonimizar');
    if (user.anonymizedAt) throw badRequest('Este usuário já foi anonimizado');

    const tag = randomBytes(4).toString('hex');
    const [updated] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: {
          name: `Usuário removido ${tag}`,
          username: `removido-${tag}`,
          email: null,
          pinHash: null,
          passwordHash: await hashSecret(randomBytes(32).toString('base64')),
          lastLoginAt: null,
          anonymizedAt: new Date(),
          tokenVersion: { increment: 1 },
        },
      }),
      this.prisma.auditLog.updateMany({ where: { userId: id }, data: { ip: null } }),
      this.prisma.passwordReset.deleteMany({ where: { userId: id } }),
    ]);
    await this.log(actor, 'user.anonymize', id);
    return toUserView(updated);
  }

  private async assertEmailAvailable(email: string, exceptId?: string) {
    const owner = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (owner && owner.id !== exceptId) throw conflict('Este e-mail já está em uso por outro usuário');
  }

  private async findOrFail(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw notFound('Usuário');
    return user;
  }

  private async assertAnotherActiveAdmin(exceptId: string) {
    const admins = await this.prisma.user.count({
      where: { role: Role.ADMIN, active: true, id: { not: exceptId } },
    });
    if (admins === 0) throw badRequest('O sistema precisa ter pelo menos um administrador ativo');
  }

  private log(actor: Actor, action: string, entityId: string, details?: Record<string, string | boolean>) {
    return this.audit.log({ userId: actor.id, action, entity: 'user', entityId, details, ip: actor.ip });
  }
}
