import { ShieldCheck } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Form';
import { Modal } from '@/components/ui/Modal';
import { errorMessage, http, registerAuthorizationRequester } from '@/lib/api';

export interface AuthorizationRequest {
  permission: string;
  scope?: string | null;
  message?: string;
}

export interface Authorization {
  token: string;
  supervisor: { id: string; name: string };
}

const PERMISSION_LABELS: Record<string, string> = {
  'pos:discount': 'Desconto acima do limite',
  'pos:cancel': 'Cancelamento de venda',
  'cash:movement': 'Sangria / suprimento',
  'pos:return': 'Troca / devolução',
  'pos:credit': 'Fiado fora da regra (limite ou atraso)',
};

const SupervisorContext = createContext<((request: AuthorizationRequest) => Promise<Authorization | null>) | null>(null);

/**
 * Diálogo "Autorização do supervisor": quando o operador não tem permissão para uma ação do caixa,
 * um gerente digita o próprio usuário e PIN. Usado automaticamente pelo cliente HTTP
 * e diretamente pelo caixa (ex.: antes de aplicar um desconto alto).
 */
export function SupervisorAuthProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<AuthorizationRequest | null>(null);
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const resolver = useRef<((value: Authorization | null) => void) | null>(null);

  const ask = useCallback((next: AuthorizationRequest) => {
    resolver.current?.(null);
    setRequest(next);
    setUsername('');
    setPin('');
    setError(undefined);
    return new Promise<Authorization | null>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  useEffect(() => {
    registerAuthorizationRequester(async (needed) => (await ask(needed))?.token ?? null);
    return () => registerAuthorizationRequester(null);
  }, [ask]);

  const finish = (value: Authorization | null) => {
    setRequest(null);
    resolver.current?.(value);
    resolver.current = null;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!request || !username.trim() || pin.length < 4) return;
    setLoading(true);
    setError(undefined);
    try {
      const result = await http.post<Authorization>('/pos/authorize', {
        username: username.trim(),
        pin,
        permission: request.permission,
        scope: request.scope ?? undefined,
      });
      finish(result);
    } catch (e) {
      setError(errorMessage(e));
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SupervisorContext.Provider value={ask}>
      {children}
      <Modal open={Boolean(request)} onClose={() => finish(null)} title="Autorização do supervisor" size="sm">
        <form onSubmit={submit} className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            <ShieldCheck className="mt-0.5 size-5 shrink-0" />
            <div>
              <p className="font-semibold">{request && (PERMISSION_LABELS[request.permission] ?? 'Ação restrita')}</p>
              <p>{request?.message ?? 'Esta ação precisa da autorização de um gerente.'}</p>
            </div>
          </div>
          <Field label="Usuário do supervisor">
            {(id) => (
              <Input
                id={id}
                autoFocus
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            )}
          </Field>
          <Field label="PIN do supervisor" error={error}>
            {(id) => (
              <Input
                id={id}
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                className="text-center text-xl tracking-[0.4em]"
                aria-invalid={Boolean(error)}
              />
            )}
          </Field>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => finish(null)}>
              Cancelar
            </Button>
            <Button type="submit" className="flex-1" loading={loading} disabled={!username.trim() || pin.length < 4}>
              Autorizar
            </Button>
          </div>
        </form>
      </Modal>
    </SupervisorContext.Provider>
  );
}

export function useSupervisorAuthorization() {
  const context = useContext(SupervisorContext);
  if (!context) throw new Error('useSupervisorAuthorization deve ser usado dentro de <SupervisorAuthProvider>');
  return context;
}
