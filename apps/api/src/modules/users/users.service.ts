import { Injectable } from '@nestjs/common';
import { Role, User } from '@prisma/client';
import { badRequest, conflict, notFound } from '../../common/errors';
import { PrismaService } from '../../common/prisma/prisma.service';
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
  role: user.role,
  active: user.active,
  hasPin: user.pinHash !== null,
  mustChangePassword: user.mustChangePassword,
  locked: user.lockedUntil !== null && user.lockedUntil > new Date(),
  lastLoginAt: user.lastLoginAt,
  createdAt: user.createdAt,
});

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

    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        username: dto.username,
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

    if (id === actor.id && (dto.active === false || (dto.role && dto.role !== user.role))) {
      throw badRequest('Você não pode desativar nem alterar o perfil do seu próprio usuário');
    }
    const losesAdmin = user.role === Role.ADMIN && (dto.active === false || (dto.role && dto.role !== Role.ADMIN));
    if (losesAdmin) await this.assertAnotherActiveAdmin(id);

    const revokeSessions = dto.active === false || (dto.role !== undefined && dto.role !== user.role);
    const updated = await this.prisma.user.update({
      where: { id },
      data: { ...dto, ...(revokeSessions && { tokenVersion: { increment: 1 } }) },
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
