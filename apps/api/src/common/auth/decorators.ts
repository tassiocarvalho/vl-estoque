import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { AuthenticatedRequest } from './auth-user';
import type { Permission } from './permissions';
import type { PinProtectedOperation } from '../../modules/settings/settings.types';

export const IS_PUBLIC = 'auth:public';
export const ALLOW_PENDING_PASSWORD = 'auth:allow-pending-password';
export const REQUIRED_PERMISSIONS = 'auth:permissions';
export const PIN_OPERATION = 'auth:pin-operation';

/** Rota acessível sem login. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Rota acessível mesmo antes de o usuário trocar a senha inicial e aceitar o termo de uso. */
export const AllowPendingPasswordChange = () => SetMetadata(ALLOW_PENDING_PASSWORD, true);

/** Exige que o perfil do usuário tenha todas as permissões informadas. */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(REQUIRED_PERMISSIONS, permissions);

/** Exige o PIN do usuário (se a operação estiver configurada como protegida). */
export const RequirePin = (operation: PinProtectedOperation) => SetMetadata(PIN_OPERATION, operation);

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<AuthenticatedRequest>().user,
);

export const ClientIp = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<AuthenticatedRequest>().ip,
);
