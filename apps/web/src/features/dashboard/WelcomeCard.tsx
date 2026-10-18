import { BookOpen, MailWarning, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Display';
import { MANUAL_URL } from '@/lib/manual';
import { useAuth } from '../auth/AuthProvider';

const DISMISSED_KEY = 'vl-welcome-dismissed';

function wasDismissed() {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

/** Boas-vindas com o manual, até o usuário dispensar (o manual continua no menu lateral). */
export function WelcomeCard() {
  const [hidden, setHidden] = useState(wasDismissed);
  if (hidden) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      /* sem armazenamento: só esconde nesta sessão */
    }
    setHidden(true);
  };

  return (
    <Card className="relative mb-6 flex flex-col gap-4 border-brand-200 bg-brand-50/60 p-5 sm:flex-row sm:items-center">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white">
        <BookOpen className="size-5" />
      </span>
      <div className="flex-1 pr-6">
        <h2 className="text-sm font-semibold text-slate-900">Primeira vez por aqui?</h2>
        <p className="mt-0.5 text-sm text-slate-600">
          O manual explica, passo a passo, como cadastrar produtos, registrar entradas e saídas, entender os alertas de
          reposição e fazer backup. Ele fica sempre disponível em “Manual de uso”, no menu.
        </p>
      </div>
      <Button
        className="shrink-0"
        icon={<BookOpen className="size-4" />}
        onClick={() => window.open(MANUAL_URL, '_blank', 'noopener')}
      >
        Abrir manual
      </Button>
      <button
        onClick={dismiss}
        aria-label="Dispensar"
        className="absolute top-3 right-3 rounded-md p-1 text-slate-400 hover:bg-white hover:text-slate-700"
      >
        <X className="size-4" />
      </button>
    </Card>
  );
}

/** Administrador sem e-mail não consegue recuperar a senha: lembra de cadastrar. */
export function MissingEmailCard() {
  const { user } = useAuth();
  if (user?.role !== 'ADMIN' || user.email) return null;
  return (
    <Card className="mb-6 flex flex-col gap-3 border-amber-200 bg-amber-50/70 p-4 sm:flex-row sm:items-center">
      <MailWarning className="size-5 shrink-0 text-amber-600" />
      <p className="flex-1 text-sm text-slate-700">
        Cadastre o seu e-mail para conseguir recuperar a senha se esquecê-la.
      </p>
      <Link to="/perfil" className="text-sm font-medium text-amber-800 hover:underline">
        Cadastrar em Meu perfil
      </Link>
    </Card>
  );
}
