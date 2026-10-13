import { Role } from '@prisma/client';
import type { Request } from 'express';

/** Usuário autenticado anexado à requisição pelo AuthGuard. */
export interface AuthUser {
  id: string;
  name: string;
  username: string;
  role: Role;
  mustChangePassword: boolean;
  hasPin: boolean;
}

export interface AuthenticatedRequest extends Request {
  user: AuthUser;
}

export interface SessionPayload {
  sub: string;
  /** Versão do token: se não bater com a do banco, a sessão foi revogada. */
  tv: number;
}

export const SESSION_COOKIE = 'vl_session';
