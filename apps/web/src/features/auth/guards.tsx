import { Lock } from 'lucide-react';
import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { LoadingState } from '@/components/ui/Display';
import type { Permission } from '@/lib/permissions';
import { useAuth } from './AuthProvider';

/** Exige login; se a senha for provisória ou o termo de uso estiver pendente, resolve isso antes de tudo. */
export function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingState label="Verificando sessão..." />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (user.mustChangePassword) {
    return location.pathname === '/trocar-senha' ? <Outlet /> : <Navigate to="/trocar-senha" replace />;
  }
  // Termo de Uso e Política de Privacidade (LGPD): ciência da versão atual antes de usar o sistema.
  if (!user.termsAccepted && location.pathname !== '/aceitar-termos') {
    return <Navigate to="/aceitar-termos" replace />;
  }
  return <Outlet />;
}

/** Esconde a página se o perfil do usuário não tiver permissão (a API também bloqueia). */
export function RequirePermission({ permission, children }: { permission: Permission; children: ReactNode }) {
  const { can } = useAuth();
  if (can(permission)) return <>{children}</>;

  return (
    <div className="flex flex-col items-center py-24 text-center">
      <span className="mb-3 flex size-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
        <Lock className="size-6" />
      </span>
      <h1 className="text-lg font-semibold text-slate-900">Acesso restrito</h1>
      <p className="mt-1 text-sm text-slate-500">Seu perfil não tem permissão para acessar esta área.</p>
    </div>
  );
}
