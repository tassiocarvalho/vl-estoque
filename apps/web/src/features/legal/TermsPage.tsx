import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card, ErrorState, LoadingState } from '@/components/ui/Display';
import { useLegal } from './api';
import { TermsContent } from './TermsContent';

/** Página pública com o Termo de Uso e Política de Privacidade (acessível com ou sem login). */
export function TermsPage() {
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useLegal();

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <button
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="size-4" /> Voltar
        </button>
        <Card className="p-6 sm:p-10">
          <div className="mb-6 flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
              <ShieldCheck className="size-6" />
            </span>
            <h1 className="text-xl font-semibold text-slate-900">Termo de Uso e Política de Privacidade</h1>
          </div>
          {isLoading && <LoadingState />}
          {isError && <ErrorState message="Não foi possível carregar o termo" onRetry={refetch} />}
          {data && <TermsContent company={data.company} version={data.termsVersion} />}
        </Card>
      </div>
    </div>
  );
}
