import { useQuery } from '@tanstack/react-query';
import { ArrowDownCircle, ArrowUpCircle, CloudOff, LockOpen, Monitor } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { ErrorState, LoadingState } from '@/components/ui/Display';
import { Field, Input, Textarea } from '@/components/ui/Form';
import { Modal } from '@/components/ui/Modal';
import { errorMessage, http, isCanceled } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDateTime, formatMoney, parseMoney } from '@/lib/format';
import { CASH_MOVEMENT_LABELS } from '@/lib/labels';
import type { CashMovement, CashMovementType, CashSession } from '@/lib/types';
import { useBranding } from '../../branding/BrandingProvider';
import { MoneyInput } from './MoneyInput';

/** Tela de abertura de caixa: nome do terminal e troco inicial (suprimento de abertura). */
export function OpenCashScreen({
  terminal,
  online,
  onOpen,
}: {
  terminal: string;
  online: boolean;
  onOpen: (terminal: string, openingAmount: number) => Promise<void>;
}) {
  const { branding, logo } = useBranding();
  const [name, setName] = useState(terminal);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const value = amount.trim() === '' ? 0 : parseMoney(amount);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (Number.isNaN(value) || value < 0 || !name.trim()) return;
    setLoading(true);
    setError(undefined);
    try {
      await onOpen(name.trim(), value);
    } catch (e) {
      if (!isCanceled(e)) setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
        <div className="flex items-center gap-3">
          <img src={logo} alt="" className="size-11 rounded-xl object-contain" />
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Abrir caixa</h1>
            <p className="text-sm text-slate-500">{branding.name}</p>
          </div>
        </div>
        <Field label="Terminal" hint="Nome deste caixa (fica salvo neste computador)">
          {(id) => (
            <div className="relative">
              <Monitor className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
              <Input id={id} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} className="pl-9" />
            </div>
          )}
        </Field>
        <div>
          <label htmlFor="opening-amount" className="mb-1.5 block text-sm font-medium text-slate-700">
            Troco inicial (fundo de caixa)
          </label>
          <MoneyInput id="opening-amount" autoFocus value={amount} placeholder="0,00" onChange={(e) => setAmount(e.target.value)} aria-invalid={Number.isNaN(value)} />
        </div>
        {!online && (
          <p className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <CloudOff className="size-4 shrink-0" /> Sem internet: a abertura do caixa precisa de conexão. Depois de aberto, o caixa vende offline.
          </p>
        )}
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <Button type="submit" size="lg" className="w-full" loading={loading} disabled={!online || Number.isNaN(value)} icon={<LockOpen className="size-5" />}>
          Abrir caixa
        </Button>
        <p className="text-center text-xs text-slate-400">
          <Link to="/" className="hover:underline">
            Voltar ao painel
          </Link>
        </p>
      </form>
    </div>
  );
}

/** Sangria (retirada) ou suprimento (entrada) de dinheiro, com justificativa obrigatória (F6). */
export function CashMovementModal({
  open,
  session,
  onClose,
  onDone,
}: {
  open: boolean;
  session: CashSession;
  onClose: () => void;
  onDone: (movement: CashMovement & { terminal: string }) => void;
}) {
  const [type, setType] = useState<CashMovementType>('WITHDRAWAL');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const value = parseMoney(amount);
  const valid = value > 0 && reason.trim().length >= 3;

  useEffect(() => {
    if (!open) return;
    setType('WITHDRAWAL');
    setAmount('');
    setReason('');
    setError(undefined);
  }, [open]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    setLoading(true);
    setError(undefined);
    try {
      const movement = await http.post<CashMovement & { terminal: string }>(`/cash/${session.id}/movements`, {
        type,
        amount: value,
        reason: reason.trim(),
      });
      onDone(movement);
    } catch (e) {
      if (!isCanceled(e)) setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Sangria / suprimento" size="sm">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-2" role="radiogroup">
          {(['WITHDRAWAL', 'SUPPLY'] as const).map((option) => {
            const Icon = option === 'WITHDRAWAL' ? ArrowUpCircle : ArrowDownCircle;
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={type === option}
                onClick={() => setType(option)}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-lg border px-3 py-3 text-sm font-semibold transition',
                  type === option ? 'border-brand-600 bg-brand-50 text-brand-800 ring-1 ring-brand-600' : 'border-slate-200 text-slate-600 hover:bg-slate-50',
                )}
              >
                <Icon className="size-5" />
                {CASH_MOVEMENT_LABELS[option]}
                <span className="text-xs font-normal text-slate-500">{option === 'WITHDRAWAL' ? 'Retirar dinheiro' : 'Colocar dinheiro'}</span>
              </button>
            );
          })}
        </div>
        <div>
          <label htmlFor="movement-amount" className="mb-1.5 block text-sm font-medium text-slate-700">
            Valor
          </label>
          <MoneyInput id="movement-amount" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} />
          {type === 'WITHDRAWAL' && (
            <p className="mt-1 text-xs text-slate-500">Dinheiro esperado na gaveta: {formatMoney(session.summary.expectedCash)}</p>
          )}
        </div>
        <Field label="Justificativa" hint="Obrigatória. Ex.: depósito no cofre, troco do banco.">
          {(id) => <Textarea id={id} maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />}
        </Field>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <Button type="submit" size="lg" className="w-full" loading={loading} disabled={!valid}>
          Registrar {CASH_MOVEMENT_LABELS[type].toLowerCase()}
        </Button>
      </form>
    </Modal>
  );
}

/** Fechamento do caixa (F10): confere o resumo, informa o dinheiro contado e vê a diferença. */
export function CloseCashModal({
  open,
  sessionId,
  pendingSales,
  onClose,
  onClosed,
}: {
  open: boolean;
  sessionId: string;
  pendingSales: number;
  onClose: () => void;
  onClosed: (session: CashSession) => void;
}) {
  const { data: session, isLoading, isError, refetch } = useQuery({
    queryKey: ['cash', 'report', sessionId],
    queryFn: () => http.get<CashSession>(`/cash/sessions/${sessionId}`),
    enabled: open,
    staleTime: 0,
  });
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCounted('');
    setNote('');
    setError(undefined);
  }, [open]);

  const countedValue = parseMoney(counted);
  const difference = session && !Number.isNaN(countedValue) ? Math.round((countedValue - session.summary.expectedCash) * 100) / 100 : null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (Number.isNaN(countedValue) || pendingSales > 0) return;
    setLoading(true);
    setError(undefined);
    try {
      const closed = await http.post<CashSession>(`/cash/${sessionId}/close`, { countedCash: countedValue, note: note.trim() || undefined });
      onClosed(closed);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Fechar caixa" size="lg">
      {isLoading ? (
        <LoadingState />
      ) : isError || !session ? (
        <ErrorState message="Não foi possível carregar o resumo do caixa (é preciso estar online)" onRetry={refetch} />
      ) : (
        <form onSubmit={submit} className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-1.5 text-sm">
            <p className="mb-2 text-slate-500">
              {session.terminal} · aberto em {formatDateTime(session.openedAt)} por {session.openedBy.name}
            </p>
            <Line label="Vendas" value={String(session.summary.salesCount)} />
            <Line label="Canceladas" value={String(session.summary.canceledCount)} />
            <Line label="Total vendido" value={formatMoney(session.summary.salesTotal)} strong />
            <hr className="my-2 border-slate-200" />
            {session.summary.methods.map((m) => (
              <Line key={m.id} label={m.name} value={formatMoney(m.amount)} />
            ))}
            <hr className="my-2 border-slate-200" />
            <Line label="Troco inicial" value={formatMoney(session.summary.openingAmount)} />
            <Line label="Suprimentos" value={formatMoney(session.summary.supplies)} />
            <Line label="Sangrias" value={`−${formatMoney(session.summary.withdrawals)}`} />
            <Line label="Dinheiro esperado na gaveta" value={formatMoney(session.summary.expectedCash)} strong />
          </div>
          <div className="space-y-4">
            <div>
              <label htmlFor="counted-cash" className="mb-1.5 block text-sm font-medium text-slate-700">
                Dinheiro contado na gaveta
              </label>
              <MoneyInput id="counted-cash" autoFocus value={counted} onChange={(e) => setCounted(e.target.value)} />
            </div>
            {difference !== null && (
              <div
                className={cn(
                  'rounded-lg px-3 py-2 text-center',
                  difference === 0 ? 'bg-emerald-50 text-emerald-700' : difference < 0 ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800',
                )}
              >
                <p className="text-xs font-semibold uppercase">{difference === 0 ? 'Caixa confere' : difference < 0 ? 'Falta' : 'Sobra'}</p>
                <p className="text-2xl font-bold tabular-nums">{formatMoney(Math.abs(difference))}</p>
              </div>
            )}
            <Field label="Observação (opcional)">
              {(id) => <Textarea id={id} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />}
            </Field>
            {pendingSales > 0 && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Há {pendingSales} venda(s) feita(s) sem internet ainda não enviada(s). Aguarde o envio para fechar.
              </p>
            )}
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <Button type="submit" variant="danger" size="lg" className="w-full" loading={loading} disabled={Number.isNaN(countedValue) || pendingSales > 0}>
              Fechar caixa e imprimir
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn('flex justify-between gap-3', strong && 'font-semibold text-slate-900')}>
      <span className={strong ? undefined : 'text-slate-600'}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
