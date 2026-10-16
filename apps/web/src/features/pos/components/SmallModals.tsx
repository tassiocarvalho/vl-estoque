import { KeyRound, Percent } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Form';
import { Modal } from '@/components/ui/Modal';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDecimal, formatMoney, formatNumber, parseMoney, parseQuantity } from '@/lib/format';
import { UNIT_SHORT } from '@/lib/labels';
import type { Discount, DiscountType, Unit } from '@/lib/types';
import { discountCents, fromCents, SaleRuleError } from '../sale-math';
import { MoneyInput } from './MoneyInput';

/** Quantidade do item selecionado (F2). */
export function QuantityModal({
  open,
  item,
  onClose,
  onConfirm,
}: {
  open: boolean;
  item: { name: string; quantity: number; unit: Unit } | null;
  onClose: () => void;
  onConfirm: (quantity: number) => void;
}) {
  const [value, setValue] = useState('');
  useEffect(() => {
    if (open && item) setValue(formatNumber(item.quantity));
  }, [open, item]);

  const quantity = parseQuantity(value);
  const valid = quantity > 0 && quantity <= 100_000;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (valid) onConfirm(quantity);
  };

  return (
    <Modal open={open} onClose={onClose} title="Alterar quantidade" description={item?.name} size="sm">
      <form onSubmit={submit} className="space-y-4">
        <Field label={`Quantidade (${item ? UNIT_SHORT[item.unit] : ''})`}>
          {(id) => (
            <Input
              id={id}
              autoFocus
              inputMode="decimal"
              value={value}
              onFocus={(e) => e.target.select()}
              onChange={(e) => setValue(e.target.value.replace(/[^\d.,]/g, ''))}
              className="h-12 text-center text-2xl font-semibold"
              aria-invalid={!valid}
            />
          )}
        </Field>
        <Button type="submit" size="lg" className="w-full" disabled={!valid}>
          Confirmar <kbd className="kbd border-white/30 bg-white/15 text-white">Enter</kbd>
        </Button>
      </form>
    </Modal>
  );
}

/** Desconto em R$ ou % — no item (F3) ou no total da venda (F4). */
export function DiscountModal({
  open,
  title,
  baseCents,
  current,
  limitPercent,
  canExceedLimit,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  baseCents: number;
  current: Discount | null;
  limitPercent: number;
  canExceedLimit: boolean;
  onClose: () => void;
  onConfirm: (discount: Discount | null, percent: number) => void;
}) {
  const [type, setType] = useState<DiscountType>('PERCENT');
  const [value, setValue] = useState('');

  useEffect(() => {
    if (!open) return;
    setType(current?.type ?? 'PERCENT');
    setValue(current ? formatDecimal(current.value) : '');
  }, [open, current]);

  const numeric = value.trim() === '' ? 0 : parseMoney(value);
  let cents = 0;
  let error: string | undefined;
  try {
    cents = Number.isNaN(numeric) ? 0 : discountCents(baseCents, { type, value: numeric });
  } catch (e) {
    error = e instanceof SaleRuleError ? e.message : 'Desconto inválido';
  }
  const percent = baseCents > 0 ? Math.round((cents / baseCents) * 10_000) / 100 : 0;
  const needsAuthorization = !canExceedLimit && percent > limitPercent;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (error || Number.isNaN(numeric)) return;
    onConfirm(numeric > 0 ? { type, value: numeric } : null, percent);
  };

  return (
    <Modal open={open} onClose={onClose} title={title} description={`Valor: ${formatMoney(fromCents(baseCents))}`} size="sm">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo de desconto">
          {(['PERCENT', 'AMOUNT'] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={type === option}
              onClick={() => setType(option)}
              className={cn(
                'rounded-lg border px-3 py-2 text-sm font-semibold transition',
                type === option ? 'border-brand-600 bg-brand-50 text-brand-800 ring-1 ring-brand-600' : 'border-slate-200 text-slate-600 hover:bg-slate-50',
              )}
            >
              {option === 'PERCENT' ? 'Percentual (%)' : 'Valor (R$)'}
            </button>
          ))}
        </div>
        {type === 'PERCENT' ? (
          <div className="relative">
            <Input
              autoFocus
              inputMode="decimal"
              value={value}
              onFocus={(e) => e.target.select()}
              onChange={(e) => setValue(e.target.value.replace(/[^\d.,]/g, ''))}
              className="h-12 pr-10 text-right text-xl font-semibold"
              aria-label="Desconto em percentual"
              aria-invalid={Boolean(error)}
            />
            <Percent className="absolute top-1/2 right-3 size-4 -translate-y-1/2 text-slate-400" />
          </div>
        ) : (
          <MoneyInput autoFocus value={value} onChange={(e) => setValue(e.target.value)} aria-label="Desconto em reais" aria-invalid={Boolean(error)} />
        )}
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
          {error ? (
            <span className="font-medium text-red-600">{error}</span>
          ) : (
            <span className="flex justify-between">
              <span className="text-slate-500">Desconto ({formatNumber(percent)}%)</span>
              <span className="font-semibold text-slate-900">−{formatMoney(fromCents(cents))}</span>
            </span>
          )}
        </div>
        {needsAuthorization && !error && (
          <p className="text-xs text-amber-800">
            Acima de {formatNumber(limitPercent)}%: ao confirmar, um supervisor precisará autorizar.
          </p>
        )}
        <div className="flex gap-2">
          {current && (
            <Button variant="outline" className="flex-1" onClick={() => onConfirm(null, 0)}>
              Remover desconto
            </Button>
          )}
          <Button type="submit" className="flex-1" disabled={Boolean(error)}>
            Aplicar
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Troca rápida de operador (F9): usuário + PIN, sem sair do caixa. */
export function SwitchOperatorModal({
  open,
  onClose,
  onSwitch,
}: {
  open: boolean;
  onClose: () => void;
  onSwitch: (username: string, pin: string) => Promise<void>;
}) {
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setUsername('');
    setPin('');
    setError(undefined);
  }, [open]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!username.trim() || pin.length < 4) return;
    setLoading(true);
    setError(undefined);
    try {
      await onSwitch(username.trim(), pin);
    } catch (e) {
      setError(errorMessage(e));
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Trocar operador" size="sm">
      <form onSubmit={submit} className="space-y-4">
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <KeyRound className="size-4 shrink-0" /> O novo operador entra com o próprio usuário e PIN. O caixa continua aberto.
        </p>
        <Field label="Usuário">
          {(id) => (
            <Input id={id} autoFocus autoComplete="off" autoCapitalize="none" spellCheck={false} value={username} onChange={(e) => setUsername(e.target.value)} />
          )}
        </Field>
        <Field label="PIN" error={error}>
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
        <Button type="submit" size="lg" className="w-full" loading={loading} disabled={!username.trim() || pin.length < 4}>
          Entrar
        </Button>
      </form>
    </Modal>
  );
}
