import { BookOpen, KeyRound } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/Display';
import { MANUAL_URL } from '@/lib/manual';
import { useAuth } from './AuthProvider';
import { FirstAccessForm } from './FirstAccessForm';

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
        <h1 className="text-xl font-semibold text-slate-900">Bem-vindo, {user?.name.split(' ')[0]}!</h1>
        <p className="mt-1 mb-6 text-sm text-slate-500">
          Você entrou com um acesso provisório. Crie agora a sua senha pessoal. É com ela que você vai entrar no sistema
          daqui pra frente (usuário: <strong className="font-medium text-slate-700">{user?.username}</strong>).
        </p>
        <FirstAccessForm onDone={() => navigate('/', { replace: true })} />

        <div className="mt-6 flex items-center justify-between gap-4 border-t border-slate-100 pt-4 text-sm">
          <a
            href={MANUAL_URL}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-1.5 font-medium text-brand-700 hover:text-brand-800"
          >
            <BookOpen className="size-4" /> Manual de uso (PDF)
          </a>
          <button
            onClick={() => void logout().then(() => navigate('/login', { replace: true }))}
            className="text-slate-500 hover:text-slate-800"
          >
            Sair
          </button>
        </div>
      </Card>
    </div>
  );
}
