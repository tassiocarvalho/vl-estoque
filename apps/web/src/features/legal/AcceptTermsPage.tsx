import { ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Card, ErrorState, LoadingState } from '@/components/ui/Display';
import { errorMessage, http } from '@/lib/api';
import type { Profile } from '@/lib/types';
import { useAuth } from '../auth/AuthProvider';
import { useLegal } from './api';
import { TermsContent } from './TermsContent';

/** Pedida quando o termo é atualizado (ou para usuários anteriores à criação do termo). */
export function AcceptTermsPage() {
  const { user, setUser, logout } = useAuth();
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useLegal();
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);

  if (user?.termsAccepted) return <Navigate to="/" replace />;

  const accept = async () => {
    if (!data) return;
    setSaving(true);
    try {
      setUser(await http.post<Profile>('/auth/accept-terms', { version: data.termsVersion }));
      navigate('/', { replace: true });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <Card className="mx-auto max-w-3xl p-6 sm:p-10">
        <div className="mb-2 flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
            <ShieldCheck className="size-6" />
          </span>
          <h1 className="text-xl font-semibold text-slate-900">Termo de Uso e Política de Privacidade</h1>
        </div>
        <p className="mb-6 text-sm text-slate-500">
          Antes de continuar, leia como o sistema trata os seus dados pessoais e as regras de uso.
        </p>
        <div className="max-h-[55vh] overflow-y-auto rounded-lg border border-slate-200 p-5">
          {isLoading && <LoadingState />}
          {isError && <ErrorState message="Não foi possível carregar o termo" onRetry={refetch} />}
          {data && <TermsContent company={data.company} version={data.termsVersion} />}
        </div>
        <label className="mt-5 flex cursor-pointer items-start gap-3 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 size-4 accent-brand-700"
          />
          Li e concordo com o Termo de Uso e estou ciente da Política de Privacidade.
        </label>
        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            onClick={() => void logout().then(() => navigate('/login', { replace: true }))}
            className="text-sm text-slate-500 hover:text-slate-800"
          >
            Sair
          </button>
          <Button onClick={accept} disabled={!agreed || !data} loading={saving}>
            Continuar
          </Button>
        </div>
      </Card>
    </div>
  );
}
