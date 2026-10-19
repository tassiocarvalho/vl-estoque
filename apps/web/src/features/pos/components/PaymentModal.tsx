import { Banknote, CreditCard, FileCheck, HandCoins, QrCode, Search, Ticket, TicketCheck, Trash2, Wallet, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button, IconButton } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Form';
import { Modal } from '@/components/ui/Modal';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDate, formatDecimal, formatMoney, parseMoney } from '@/lib/format';
import { PAYMENT_SHORTCUTS } from '@/lib/labels';
import type { PaymentKind, PaymentMethod, StoreCredit } from '@/lib/types';
import { lookupCredit, useCustomerCredit } from '../post-sale-api';
import { fromCents, paymentStatus, toCents, type PaymentLine } from '../sale-math';
import { MoneyInput } from './MoneyInput';

const ICONS: Record<PaymentKind, LucideIcon> = {
  CASH: Banknote,
  PIX: QrCode,
  CREDIT_CARD: CreditCard,
  DEBIT_CARD: Wallet,
  VOUCHER: Ticket,
  CHECK: FileCheck,
  OTHER: Wallet,
  STORE_CREDIT: TicketCheck,
  ON_ACCOUNT: HandCoins,
};

/** Notas comuns para o troco rápido em dinheiro. */
const QUICK_CASH = [10, 20, 50, 100, 200];
/** Vale-troca e fiado precisam conferir saldo/limite no servidor. */
const ONLINE_ONLY: PaymentKind[] = ['STORE_CREDIT', 'ON_ACCOUNT'];

interface PaymentModalProps {
  open: boolean;
  totalCents: number;
  methods: PaymentMethod[];
  /** Cliente da venda (o fiado exige). */
  customer: { id: string; name: string } | null;
  online: boolean;
  /** Vale gerado numa troca: já entra como pagamento ao abrir. */
  presetCredit?: StoreCredit | null;
  onClose: () => void;
  onConfirm: (payments: PaymentLine[]) => Promise<void>;
}

/**
 * Pagamento: uma ou várias formas na mesma venda (ex.: R$ 20 em dinheiro + R$ 30 no PIX),
 * com cálculo automático do troco. As formas são as cadastradas em Configurações.
 * Atalhos: F1–F4 e F6–F9 escolhem a forma, Enter lança o valor, F5 confirma.
 * Vale-troca pede o código; fiado mostra o limite do cliente e as parcelas.
 */
export function PaymentModal({ open, totalCents, methods, customer, online, presetCredit, onClose, onConfirm }: PaymentModalProps) {
  const [payments, setPayments] = useState<PaymentLine[]>([]);
  const [methodId, setMethodId] = useState<string>('');
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [voucherCode, setVoucherCode] = useState('');
  const [voucher, setVoucher] = useState<StoreCredit | null>(null);
  const [voucherError, setVoucherError] = useState<string>();
  const [installments, setInstallments] = useState('1');
  const inputRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  const method = methods.find((m) => m.id === methodId) ?? methods[0];
  const isVoucher = method?.kind === 'STORE_CREDIT';
  const isAccount = method?.kind === 'ON_ACCOUNT';
  const credit = useCustomerCredit(customer?.id, open && online && Boolean(methods.some((m) => m.kind === 'ON_ACCOUNT')));
  const status = paymentStatus(totalCents, payments);
  const typed = parseMoney(amount);
  // Troco previsto enquanto o valor ainda está sendo digitado (antes de lançar).
  const preview =
    typed > 0 && method ? paymentStatus(totalCents, [...payments, { methodId: method.id, amount: typed, allowsChange: method.allowsChange }]) : status;

  const usedOf = (creditId: string) => payments.filter((p) => p.storeCreditId === creditId).reduce((sum, p) => sum + toCents(p.amount), 0);
  const voucherAvailableCents = voucher ? Math.max(toCents(voucher.balance) - usedOf(voucher.id), 0) : 0;
  const accountOnSale = payments.filter((p) => p.installments).reduce((sum, p) => sum + toCents(p.amount), 0);

  const blockedReason = (() => {
    if (!method) return null;
    if (!online && ONLINE_ONLY.includes(method.kind)) return `"${method.name}" precisa de conexão com o servidor.`;
    if (method.requiresCustomer && !customer) return `"${method.name}" exige identificar o cliente da venda (tecla Ins).`;
    if (isVoucher && !voucher) return 'Digite o código do vale e confira o saldo.';
    if (isVoucher && voucher && voucher.status !== 'ACTIVE') return 'Este vale não pode ser usado.';
    if (isVoucher && typed > 0 && toCents(typed) > voucherAvailableCents) return `O saldo disponível do vale é ${formatMoney(fromCents(voucherAvailableCents))}.`;
    return null;
  })();

  useEffect(() => {
    if (!open) return;
    setPayments([]);
    setVoucherCode('');
    setVoucher(null);
    setVoucherError(undefined);
    setInstallments('1');
    if (presetCredit && presetCredit.status === 'ACTIVE') {
      const storeMethod = methods.find((m) => m.kind === 'STORE_CREDIT');
      const cents = Math.min(toCents(presetCredit.balance), totalCents);
      if (storeMethod && cents > 0) {
        const line = { methodId: storeMethod.id, amount: fromCents(cents), allowsChange: false, storeCreditId: presetCredit.id, storeCreditCode: presetCredit.code };
        setPayments([line]);
        const rest = totalCents - cents;
        setMethodId(methods.find((m) => m.kind === 'CASH')?.id ?? methods[0]?.id ?? '');
        setAmount(rest > 0 ? formatDecimal(fromCents(rest)) : '');
        setTimeout(() => inputRef.current?.focus(), 50);
        return;
      }
    }
    setMethodId(methods.find((m) => m.kind === 'CASH')?.id ?? methods[0]?.id ?? '');
    setAmount(formatDecimal(fromCents(totalCents)));
    // Só ao abrir: a lista de formas não deve reiniciar um pagamento em andamento.
  }, [open, totalCents]);

  const focusAmount = () => requestAnimationFrame(() => inputRef.current?.select());
  const nameOf = (line: PaymentLine) => {
    const name = methods.find((m) => m.id === line.methodId)?.name ?? 'Forma removida';
    if (line.storeCreditCode) return `${name} · ${line.storeCreditCode}`;
    if (line.installments && line.installments > 1) return `${name} · ${line.installments}x`;
    return name;
  };

  const chooseMethod = (next: PaymentMethod) => {
    setMethodId(next.id);
    // Formas sem troco: sugere exatamente o que falta.
    if (!next.allowsChange || !amount) setAmount(status.remainingCents > 0 ? formatDecimal(fromCents(status.remainingCents)) : '');
    if (next.kind === 'STORE_CREDIT') requestAnimationFrame(() => codeRef.current?.focus());
    else focusAmount();
  };

  const checkVoucher = async () => {
    if (!voucherCode.trim()) return;
    setVoucherError(undefined);
    try {
      const found = await lookupCredit(voucherCode);
      setVoucher(found);
      if (found.status !== 'ACTIVE') {
        setVoucherError(found.status === 'EXPIRED' ? 'Vale vencido' : found.status === 'USED' ? 'Vale sem saldo' : 'Vale cancelado');
        return;
      }
      const available = Math.max(toCents(found.balance) - usedOf(found.id), 0);
      setAmount(formatDecimal(fromCents(Math.min(available, status.remainingCents))));
      focusAmount();
    } catch (error) {
      setVoucher(null);
      setVoucherError(errorMessage(error));
    }
  };

  const addPayment = (value = typed) => {
    if (!(value > 0) || !method || blockedReason) return false;
    const line: PaymentLine = {
      methodId: method.id,
      amount: value,
      allowsChange: method.allowsChange,
      ...(isVoucher && voucher && { storeCreditId: voucher.id, storeCreditCode: voucher.code }),
      ...(isAccount && { installments: Number(installments) || 1 }),
    };
    const next = [...payments, line];
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
      } else if (event.key === 'Enter' && status.complete && !amount.trim() && !(event.target instanceof HTMLButtonElement) && !(event.target instanceof HTMLInputElement)) {
        // Conta já fechada (ex.: o vale da troca pagou tudo): Enter confirma de qualquer ponto do diálogo.
        event.preventDefault();
        void confirm();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const invalidChange = typed > 0 && method && !method.allowsChange && Math.round(typed * 100) > status.remainingCents;
  const info = credit.data;
  const accountAfterCents = info ? toCents(info.open) + accountOnSale + (isAccount && typed > 0 ? toCents(typed) : 0) : 0;
  const overLimit = Boolean(info) && isAccount && (accountAfterCents > toCents(info!.limit) || (info!.overdueCount > 0));

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
                const disabled = (option.requiresCustomer && !customer) || (!online && ONLINE_ONLY.includes(option.kind));
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => chooseMethod(option)}
                    aria-pressed={method?.id === option.id}
                    title={disabled ? (online ? 'Identifique o cliente da venda para usar esta forma' : 'Precisa de conexão com o servidor') : undefined}
                    className={cn(
                      'flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition',
                      method?.id === option.id ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50',
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

          {isVoucher && online && (
            <div className="space-y-2 rounded-xl bg-slate-50 p-3">
              <label htmlFor="voucher-code" className="block text-sm font-medium text-slate-700">
                Código do vale-troca
              </label>
              <div className="flex gap-2">
                <Input
                  id="voucher-code"
                  ref={codeRef}
                  value={voucherCode}
                  onChange={(e) => {
                    setVoucherCode(e.target.value.toUpperCase());
                    setVoucher(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void checkVoucher();
                    }
                  }}
                  placeholder="VT-XXXXXXXX (digite ou bipe)"
                  className="font-mono uppercase"
                  autoComplete="off"
                />
                <Button variant="outline" icon={<Search className="size-4" />} onClick={() => void checkVoucher()}>
                  Conferir
                </Button>
              </div>
              {voucher && voucher.status === 'ACTIVE' && (
                <p className="text-sm text-emerald-700">
                  Saldo {formatMoney(fromCents(voucherAvailableCents))}
                  {voucher.expiresAt && ` · válido até ${formatDate(`${voucher.expiresAt}T12:00:00`)}`}
                  {voucher.customer && ` · ${voucher.customer.name}`}
                </p>
              )}
              {voucherError && <p className="text-sm font-medium text-red-600">{voucherError}</p>}
            </div>
          )}

          {isAccount && customer && online && (
            <div className="space-y-2 rounded-xl bg-slate-50 p-3 text-sm">
              {info ? (
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-xs text-slate-500">Limite</p>
                    <p className="font-semibold tabular-nums">{formatMoney(info.limit)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Em aberto</p>
                    <p className="font-semibold tabular-nums">{formatMoney(info.open)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Disponível</p>
                    <p className={cn('font-semibold tabular-nums', info.available > 0 ? 'text-emerald-700' : 'text-red-600')}>{formatMoney(info.available)}</p>
                  </div>
                </div>
              ) : (
                <p className="text-slate-500">Consultando o fiado de {customer.name}…</p>
              )}
              <div className="flex items-center gap-2">
                <span className="text-slate-600">Parcelas</span>
                <div className="w-28">
                  <Select value={installments} onChange={(e) => setInstallments(e.target.value)} aria-label="Parcelas do fiado">
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {n === 1 ? 'À vista' : `${n}x`}
                      </option>
                    ))}
                  </Select>
                </div>
                {Number(installments) > 1 && typed > 0 && <span className="text-xs text-slate-500">{Number(installments)} × {formatMoney(Math.floor((typed * 100) / Number(installments)) / 100)}</span>}
              </div>
              {info && info.overdueCount > 0 && <p className="text-xs font-medium text-red-600">Cliente com {info.overdueCount} parcela(s) vencida(s): o gerente precisa liberar.</p>}
              {info && overLimit && info.overdueCount === 0 && <p className="text-xs font-medium text-amber-700">Passa do limite: o gerente vai precisar liberar com o PIN.</p>}
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
              aria-invalid={Boolean(invalidChange || blockedReason)}
            />
            {invalidChange && <p className="mt-1 text-xs font-medium text-red-600">Esta forma não pode passar do valor que falta: troco só em dinheiro.</p>}
            {blockedReason && <p className="mt-1 text-xs font-medium text-red-600">{blockedReason}</p>}
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

          <Button
            type="submit"
            variant="secondary"
            className="w-full"
            // Conta já fechada e campo vazio: o Enter (envio do formulário) confirma a venda.
            disabled={typed > 0 ? Boolean(invalidChange) || Boolean(blockedReason) : !status.complete}
          >
            Lançar pagamento <kbd className="kbd">Enter</kbd>
          </Button>

          {payments.length > 0 && (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {payments.map((p, index) => (
                <li key={index} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="font-medium text-slate-700">{nameOf(p)}</span>
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
