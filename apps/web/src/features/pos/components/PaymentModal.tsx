import { Banknote, CreditCard, FileCheck, QrCode, Ticket, Trash2, Wallet, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button, IconButton } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/lib/cn';
import { formatDecimal, formatMoney, parseMoney } from '@/lib/format';
import { PAYMENT_SHORTCUTS } from '@/lib/labels';
import type { PaymentKind, PaymentMethod } from '@/lib/types';
import { fromCents, paymentStatus, type PaymentLine } from '../sale-math';
import { MoneyInput } from './MoneyInput';

const ICONS: Record<PaymentKind, LucideIcon> = {
  CASH: Banknote,
  PIX: QrCode,
  CREDIT_CARD: CreditCard,
  DEBIT_CARD: Wallet,
  VOUCHER: Ticket,
  CHECK: FileCheck,
  OTHER: Wallet,
};

/** Notas comuns para o troco rápido em dinheiro. */
const QUICK_CASH = [10, 20, 50, 100, 200];

interface PaymentModalProps {
  open: boolean;
  totalCents: number;
  methods: PaymentMethod[];
  /** Venda com cliente identificado (formas como o fiado exigem). */
  hasCustomer: boolean;
  onClose: () => void;
  onConfirm: (payments: PaymentLine[]) => Promise<void>;
}

/**
 * Pagamento: uma ou várias formas na mesma venda (ex.: R$ 20 em dinheiro + R$ 30 no PIX),
 * com cálculo automático do troco. As formas são as cadastradas em Configurações.
 * Atalhos: F1–F4 e F6–F9 escolhem a forma, Enter lança o valor, F5 confirma.
 */
export function PaymentModal({ open, totalCents, methods, hasCustomer, onClose, onConfirm }: PaymentModalProps) {
  const [payments, setPayments] = useState<PaymentLine[]>([]);
  const [methodId, setMethodId] = useState<string>('');
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const method = methods.find((m) => m.id === methodId) ?? methods[0];
  const status = paymentStatus(totalCents, payments);
  const typed = parseMoney(amount);
  // Troco previsto enquanto o valor ainda está sendo digitado (antes de lançar).
  const preview =
    typed > 0 && method ? paymentStatus(totalCents, [...payments, { methodId: method.id, amount: typed, allowsChange: method.allowsChange }]) : status;
  const blockedByCustomer = method?.requiresCustomer && !hasCustomer;

  useEffect(() => {
    if (!open) return;
    setPayments([]);
    setMethodId(methods.find((m) => m.kind === 'CASH')?.id ?? methods[0]?.id ?? '');
    setAmount(formatDecimal(fromCents(totalCents)));
    // Só ao abrir: a lista de formas não deve reiniciar um pagamento em andamento.
  }, [open, totalCents]);

  const focusAmount = () => requestAnimationFrame(() => inputRef.current?.select());
  const nameOf = (id: string) => methods.find((m) => m.id === id)?.name ?? 'Forma removida';

  const chooseMethod = (next: PaymentMethod) => {
    setMethodId(next.id);
    // Formas sem troco: sugere exatamente o que falta.
    if (!next.allowsChange || !amount) setAmount(status.remainingCents > 0 ? formatDecimal(fromCents(status.remainingCents)) : '');
    focusAmount();
  };

  const addPayment = (value = typed) => {
    if (!(value > 0) || !method || blockedByCustomer) return false;
    const next = [...payments, { methodId: method.id, amount: value, allowsChange: method.allowsChange }];
    setPayments(next);
    const after = paymentStatus(totalCents, next);
    setAmount(after.remainingCents > 0 ? formatDecimal(fromCents(after.remainingCents)) : '');
    focusAmount();
    return { after, next };
  };

  const confirm = async (list = payments) => {
    if (!paymentStatus(totalCents, list).complete || submitting) return;
    setSubmitting(true);
    try {
      await onConfirm(list);
    } finally {
      setSubmitting(false);
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    // Campo vazio com tudo pago: Enter confirma. Senão, Enter lança o valor (e confirma se já fechou a conta).
    if (!amount.trim()) return void confirm();
    const added = addPayment();
    if (added && added.after.complete) void confirm(added.next);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      const index = PAYMENT_SHORTCUTS.indexOf(event.key);
      if (index >= 0 && methods[index]) {
        event.preventDefault();
        chooseMethod(methods[index]);
      } else if (event.key === 'F5') {
        event.preventDefault();
        void confirm();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const invalidChange = typed > 0 && method && !method.allowsChange && Math.round(typed * 100) > status.remainingCents;

  return (
    <Modal open={open} onClose={onClose} title="Pagamento" size="lg">
      <div className="grid gap-5 sm:grid-cols-[1fr_15rem]">
        <form onSubmit={onSubmit} className="space-y-4">
          {methods.length === 0 ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Nenhuma forma de pagamento ativa. Cadastre em Configurações → Formas de pagamento.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {methods.map((option, index) => {
                const Icon = ICONS[option.kind];
                const disabled = option.requiresCustomer && !hasCustomer;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => chooseMethod(option)}
                    aria-pressed={method?.id === option.id}
                    title={disabled ? 'Identifique o cliente da venda para usar esta forma' : undefined}
                    className={cn(
                      'flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition',
                      method?.id === option.id
                        ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50',
                      disabled && 'opacity-50',
                    )}
                  >
                    <Icon className="size-5 shrink-0 text-brand-700" />
                    <span className="flex-1 text-sm leading-tight font-semibold text-slate-800">{option.name}</span>
                    {PAYMENT_SHORTCUTS[index] && <kbd className="kbd">{PAYMENT_SHORTCUTS[index]}</kbd>}
                  </button>
                );
              })}
            </div>
          )}

          <div>
            <label htmlFor="payment-amount" className="mb-1.5 block text-sm font-medium text-slate-700">
              Valor em {method?.name.toLowerCase() ?? '—'}
            </label>
            <MoneyInput
              id="payment-amount"
              ref={inputRef}
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-invalid={Boolean(invalidChange || blockedByCustomer)}
            />
            {invalidChange && (
              <p className="mt-1 text-xs font-medium text-red-600">Esta forma não pode passar do valor que falta: troco só em dinheiro.</p>
            )}
            {blockedByCustomer && (
              <p className="mt-1 text-xs font-medium text-red-600">"{method?.name}" exige identificar o cliente da venda (tecla Ins).</p>
            )}
          </div>

          {method?.kind === 'CASH' && (
            <div className="flex flex-wrap gap-2">
              {QUICK_CASH.filter((note) => note * 100 >= status.remainingCents).slice(0, 4).map((note) => (
                <Button key={note} variant="outline" size="sm" onClick={() => setAmount(formatDecimal(note))}>
                  {formatMoney(note)}
                </Button>
              ))}
            </div>
          )}

          <Button type="submit" variant="secondary" className="w-full" disabled={!(typed > 0) || Boolean(invalidChange) || blockedByCustomer}>
            Lançar pagamento <kbd className="kbd">Enter</kbd>
          </Button>

          {payments.length > 0 && (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {payments.map((p, index) => (
                <li key={index} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="font-medium text-slate-700">{nameOf(p.methodId)}</span>
                  <span className="flex items-center gap-2 tabular-nums">
                    {formatMoney(p.amount)}
                    <IconButton label="Remover pagamento" onClick={() => setPayments(payments.filter((_, i) => i !== index))}>
                      <Trash2 className="size-4" />
                    </IconButton>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </form>

        <div className="flex flex-col gap-3 rounded-xl bg-slate-50 p-4">
          <Summary label="Total da venda" value={formatMoney(fromCents(totalCents))} />
          <Summary label="Pago" value={formatMoney(fromCents(status.paidCents))} />
          <Summary label="Falta" value={formatMoney(fromCents(status.remainingCents))} tone={status.remainingCents > 0 ? 'amber' : undefined} />
          <div className="mt-auto rounded-lg bg-white p-3 text-center shadow-sm">
            <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Troco</p>
            <p className={cn('text-3xl font-bold tabular-nums', preview.changeCents > 0 ? 'text-emerald-700' : 'text-slate-400')}>
              {formatMoney(fromCents(preview.changeCents))}
            </p>
            {preview !== status && preview.changeCents > 0 && <p className="text-xs text-slate-500">ao lançar o valor digitado</p>}
          </div>
          {status.changeFromNonCash && <p className="text-xs font-medium text-red-600">Troco só pode sair do dinheiro.</p>}
          <Button size="lg" loading={submitting} disabled={!status.complete} onClick={() => void confirm()}>
            Confirmar <kbd className="kbd border-white/30 bg-white/15 text-white">F5</kbd>
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function Summary({ label, value, tone }: { label: string; value: string; tone?: 'amber' }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-sm text-slate-500">{label}</span>
      <span className={cn('text-lg font-semibold tabular-nums', tone === 'amber' ? 'text-amber-800' : 'text-slate-900')}>{value}</span>
    </div>
  );
}
