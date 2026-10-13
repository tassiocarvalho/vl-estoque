import { KeyRound } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Form';
import { Modal } from '@/components/ui/Modal';
import { registerPinRequester } from '@/lib/api';

/**
 * Diálogo global de PIN. Quando a API responde "PIN obrigatório",
 * o cliente HTTP chama este diálogo e repete a operação com o PIN digitado.
 */
export function PinProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [reason, setReason] = useState<string>();
  const resolver = useRef<((pin: string | null) => void) | null>(null);

  const ask = useCallback((message?: string) => {
    setReason(message);
    setPin('');
    setOpen(true);
    return new Promise<string | null>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  useEffect(() => {
    registerPinRequester(ask);
    return () => registerPinRequester(null);
  }, [ask]);

  const finish = (value: string | null) => {
    setOpen(false);
    resolver.current?.(value);
    resolver.current = null;
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (/^\d{4,6}$/.test(pin)) finish(pin);
  };

  return (
    <>
      {children}
      <Modal open={open} onClose={() => finish(null)} title="Confirme com seu PIN" size="sm">
        <form onSubmit={submit} className="flex flex-col items-center gap-4 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-brand-50 text-brand-700">
            <KeyRound className="size-6" />
          </span>
          <p className="text-sm text-slate-500">
            {reason ?? 'Esta operação exige o seu PIN pessoal de 4 a 6 números.'}
          </p>
          <Input
            autoFocus
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
            className="h-12 text-center text-2xl tracking-[0.5em]"
            aria-label="PIN"
            aria-invalid={Boolean(reason)}
          />
          <div className="flex w-full gap-2">
            <Button variant="outline" className="flex-1" onClick={() => finish(null)}>
              Cancelar
            </Button>
            <Button type="submit" className="flex-1" disabled={pin.length < 4}>
              Confirmar
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
