import { CanActivate, ExecutionContext, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { env } from '../../config/env';

const digest = (value: string) => createHash('sha256').update(value).digest();

/** Autentica sistemas externos (PDV) pela chave do cabeçalho X-API-Key. */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    if (!env.PDV_API_KEY) throw new ServiceUnavailableException('Integração com o PDV não configurada');

    const provided = ctx.switchToHttp().getRequest<Request>().header('x-api-key') ?? '';
    // Comparação em tempo constante: não revela quantos caracteres da chave estão corretos.
    if (!timingSafeEqual(digest(provided), digest(env.PDV_API_KEY))) {
      throw new UnauthorizedException('Chave de integração inválida');
    }
    return true;
  }
}
