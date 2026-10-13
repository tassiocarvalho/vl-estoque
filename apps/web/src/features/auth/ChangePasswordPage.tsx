import { KeyRound } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/Display';
import { useAuth } from './AuthProvider';
import { ChangePasswordForm } from './ChangePasswordForm';

/** Tela obrigatória no primeiro acesso (ou após o administrador redefinir a senha). */
export function ChangePasswordPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (user && !user.mustChangePassword) return <Navigate to="/" replace />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <Card className="w-full max-w-md p-8">
        <span className="mb-4 flex size-12 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
          <KeyRound className="size-6" />
        </span>
        <h1 className="text-xl font-semibold text-slate-900">Crie sua senha pessoal</h1>
        <p className="mt-1 mb-6 text-sm text-slate-500">
          Olá, {user?.name.split(' ')[0]}! Por segurança, troque a senha provisória antes de continuar.
        </p>
        <ChangePasswordForm submitLabel="Salvar e continuar" onDone={() => navigate('/', { replace: true })} />
        <button
          onClick={() => void logout().then(() => navigate('/login', { replace: true }))}
          className="mt-6 text-sm text-slate-500 hover:text-slate-800"
        >
          Sair
        </button>
      </Card>
    </div>
  );
}
