import { HandCoins, Printer, Search, TicketCheck, Undo2 } from 'lucide-react';
import { useDeferredValue, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Badge, EmptyState, LoadingState } from '@/components/ui/Display';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Form';
import { Modal } from '@/components/ui/Modal';
import { errorMessage, isCanceled } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDate, formatDateTime, formatDecimal, formatMoney, parseMoney, uuid } from '@/lib/format';
import { formatDocument, formatPhone } from '@/lib/document';
import type { CustomerReceipt, PaymentMethod, StoreCredit } from '@/lib/types';
import { useCustomers } from '../../customers/api';
import { createReceipt, lookupCredit, useCustomerCredit } from '../post-sale-api';
import { MoneyInput } from './MoneyInput';

const day = (iso: string) => formatDate(`${iso}T12:00:00`);

/** F11: operações que não são venda (troca, recebimento de fiado, consulta de vale). */
export function MoreActionsModal({
  open,
  online,
  onClose,
  onChoose,
}: {
  open: boolean;
  online: boolean;
  onClose: () => void;
  onChoose: (action: 'return' | 'receipt' | 'voucher') => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      const action = ({ '1': 'return', '2': 'receipt', '3': 'voucher' } as const)[event.key as '1' | '2' | '3'];
      if (action && online) {
        event.preventDefault();
        onChoose(action);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, online, onChoose]);

  const item = (key: string, action: 'return' | 'receipt' | 'voucher', icon: ReactNode, label: string, hint: string) => (
    <button
      type="button"
      disabled={!online}
      onClick={() => onChoose(action)}
      className="flex w-full items-center gap-4 rounded-xl border border-slate-200 px-4 py-3 text-left transition hover:border-brand-300 hover:bg-brand-50 disabled:opacity-50"
    >
      <kbd className="kbd">{key}</kbd>
      <span className="text-brand-700">{icon}</span>
      <span>
        <span className="block font-semibold text-slate-900">{label}</span>
        <span className="block text-xs text-slate-500">{hint}</span>
      </span>
    </button>
  );

  return (
    <Modal open={open} onClose={onClose} title="Outras operações" description={online ? undefined : 'Estas operações precisam de conexão com o servidor.'} size="sm">
      <div className="space-y-2">
        {item('1', 'return', <Undo2 className="size-6" />, 'Troca / devolução', 'Devolver itens de uma venda (dinheiro, vale ou estorno)')}
        {item('2', 'receipt', <HandCoins className="size-6" />, 'Receber fiado', 'Pagamento de parcela do crediário')}
        {item('3', 'voucher', <TicketCheck className="size-6" />, 'Consultar vale-troca', 'Saldo, validade e 2ª via')}
      </div>
    </Modal>
  );
}

/** Recebimento do fiado no caixa: escolhe o cliente, o valor e a forma (dinheiro pode ter troco). */
export function ReceiptModal({
  open,
  sessionId,
  methods,
  customer: initialCustomer,
  onClose,
  onDone,
}: {
  open: boolean;
  sessionId: string;
  methods: PaymentMethod[];
  customer: { id: string; name: string } | null;
  onClose: () => void;
  onDone: (receipt: CustomerReceipt) => void;
}) {
  const [customer, setCustomer] = useState<{ id: string; name: string } | null>(null);
  const [term, setTerm] = useState('');
  const deferred = useDeferredValue(term.trim());
  const customers = useCustomers({ search: deferred || undefined, status: 'active', pageSize: 8 }, open && !customer && deferred.length >= 2);
  const credit = useCustomerCredit(customer?.id, open);
  const receivable = methods.filter((m) => m.kind !== 'STORE_CREDIT' && m.kind !== 'ON_ACCOUNT');
  const [methodId, setMethodId] = useState('');
  const [amount, setAmount] = useState('');
  const [received, setReceived] = useState('');
  const [receiptId, setReceiptId] = useState(uuid);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCustomer(initialCustomer);
    setTerm('');
    setMethodId(receivable.find((m) => m.kind === 'CASH')?.id ?? receivable[0]?.id ?? '');
    setReceiptId(uuid());
  }, [open]);

  useEffect(() => {
    if (credit.data) {
      setAmount(formatDecimal(credit.data.overdue > 0 ? credit.data.overdue : credit.data.installments[0]?.balance ?? 0));
      setReceived('');
    }
  }, [credit.data]);

  const method = receivable.find((m) => m.id === methodId);
  const value = parseMoney(amount);
  const given = received.trim() ? parseMoney(received) : value;
  const change = method?.allowsChange && given > value ? Math.round((given - value) * 100) / 100 : 0;
  const info = credit.data;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!customer || !method || !(value > 0)) return;
    if (given < value) return toast.error('O valor entregue é menor que o valor a receber');
    setSaving(true);
    try {
      const receipt = await createReceipt({ id: receiptId, sessionId, customerId: customer.id, methodId: method.id, amount: value, received: given });
      onDone(receipt);
    } catch (error) {
      if (!isCanceled(error)) toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Receber fiado" size="lg">
      {!customer ? (
        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Nome, CPF ou telefone do cliente" className="pl-9" autoFocus aria-label="Buscar cliente" />
          </div>
          {deferred.length < 2 ? (
            <p className="py-4 text-center text-sm text-slate-500">Digite ao menos 2 letras.</p>
          ) : customers.isLoading ? (
            <LoadingState />
          ) : !customers.data?.items.length ? (
            <EmptyState title="Nenhum cliente encontrado" />
          ) : (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {customers.data.items.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => setCustomer({ id: c.id, name: c.name })} className="w-full px-3 py-2.5 text-left hover:bg-brand-50">
                    <span className="block text-sm font-medium text-slate-900">{c.name}</span>
                    <span className="block text-xs text-slate-500">{[formatDocument(c.document), formatPhone(c.phone)].filter(Boolean).join(' · ')}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : !info ? (
        <LoadingState />
      ) : (
        <form onSubmit={submit} className="grid gap-5 text-sm sm:grid-cols-[1fr_15rem]">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-base font-semibold text-slate-900">{customer.name}</span>
              {!initialCustomer && (
                <Button variant="ghost" size="sm" onClick={() => setCustomer(null)}>
                  Trocar cliente
                </Button>
              )}
            </div>
            {info.installments.length === 0 ? (
              <EmptyState title="Este cliente não tem fiado em aberto" />
            ) : (
              <ul className="max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
                {info.installments.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <span>
                      <span className="font-medium text-slate-800">{r.description}</span>
                      {r.installments > 1 && <span className="text-slate-500"> ({r.installment}/{r.installments})</span>}
                      <span className={cn('block text-xs', r.overdue ? 'font-medium text-red-600' : 'text-slate-500')}>
                        vence {day(r.dueDate)}
                        {r.overdue && ` · ${r.daysOverdue} dia(s) de atraso`}
                      </span>
                    </span>
                    <span className="tabular-nums">
                      {formatMoney(r.balance)}
                      {r.paidAmount > 0 && <span className="block text-xs text-slate-500">de {formatMoney(r.amount)}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-slate-500">O valor abate primeiro das parcelas mais antigas.</p>
            <div className="grid grid-cols-2 gap-2">
              {receivable.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMethodId(m.id)}
                  className={cn('rounded-lg border px-3 py-2 text-left font-medium', m.id === methodId ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600' : 'border-slate-200 hover:bg-slate-50')}
                >
                  {m.name}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-3 rounded-xl bg-slate-50 p-4">
            <div className="flex justify-between">
              <span className="text-slate-500">Em aberto</span>
              <span className="font-semibold tabular-nums">{formatMoney(info.open)}</span>
            </div>
            {info.overdue > 0 && (
              <div className="flex justify-between text-red-700">
                <span>Vencido</span>
                <span className="font-semibold tabular-nums">{formatMoney(info.overdue)}</span>
              </div>
            )}
            <Field label="Valor a pagar">{(id) => <MoneyInput id={id} value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />}</Field>
            {method?.allowsChange && (
              <Field label="Valor entregue (troco)">{(id) => <MoneyInput id={id} value={received} placeholder={amount} onChange={(e) => setReceived(e.target.value)} />}</Field>
            )}
            {change > 0 && (
              <p className="rounded-lg bg-white p-2 text-center">
                <span className="block text-xs text-slate-500 uppercase">Troco</span>
                <span className="text-2xl font-bold text-emerald-700 tabular-nums">{formatMoney(change)}</span>
              </p>
            )}
            <Button type="submit" size="lg" loading={saving} disabled={!(value > 0) || value > info.open || info.installments.length === 0}>
              Receber
            </Button>
            {value > info.open && <p className="text-xs font-medium text-red-600">Maior que o saldo devedor.</p>}
          </div>
        </form>
      )}
    </Modal>
  );
}

/** Consulta de vale-troca: saldo, validade, extrato e 2ª via. */
export function VoucherModal({ open, onClose, onPrint }: { open: boolean; onClose: () => void; onPrint: (credit: StoreCredit) => void }) {
  const [code, setCode] = useState('');
  const [credit, setCredit] = useState<StoreCredit | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setCode('');
      setCredit(null);
    }
  }, [open]);

  const search = async (event: FormEvent) => {
    event.preventDefault();
    if (!code.trim()) return;
    setLoading(true);
    try {
      setCredit(await lookupCredit(code));
    } catch (error) {
      setCredit(null);
      toast.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const STATUS = { ACTIVE: ['green', 'Ativo'], USED: ['neutral', 'Sem saldo'], EXPIRED: ['amber', 'Vencido'], CANCELED: ['red', 'Cancelado'] } as const;
  const ENTRY = { ISSUE: 'Emissão', REDEEM: 'Usado em venda', REVERSAL: 'Estorno (venda cancelada)', CANCEL: 'Cancelamento' } as const;

  return (
    <Modal open={open} onClose={onClose} title="Consultar vale-troca" size="md">
      <form onSubmit={search} className="mb-4 flex gap-2">
        <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="VT-XXXXXXXX" className="font-mono" autoFocus aria-label="Código do vale" />
        <Button type="submit" loading={loading} icon={<Search className="size-4" />}>
          Consultar
        </Button>
      </form>
      {credit && (
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-mono text-lg font-bold">{credit.code}</span>
            <Badge tone={STATUS[credit.status][0]} dot>
              {STATUS[credit.status][1]}
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3">
            <span className="text-slate-500">Saldo</span>
            <span className="text-right text-lg font-semibold tabular-nums">{formatMoney(credit.balance)}</span>
            <span className="text-slate-500">Valor original</span>
            <span className="text-right tabular-nums">{formatMoney(credit.amount)}</span>
            <span className="text-slate-500">Validade</span>
            <span className="text-right">{credit.expiresAt ? day(credit.expiresAt) : 'Não vence'}</span>
            {credit.customer && (
              <>
                <span className="text-slate-500">Cliente</span>
                <span className="text-right">{credit.customer.name}</span>
              </>
            )}
            {credit.origin && (
              <>
                <span className="text-slate-500">Origem</span>
                <span className="text-right">
                  devolução nº {credit.origin.returnNumber} (venda nº {credit.origin.saleNumber})
                </span>
              </>
            )}
          </div>
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {credit.entries.map((e) => (
              <li key={e.id} className="flex justify-between px-3 py-1.5">
                <span>
                  {ENTRY[e.type]} <span className="text-xs text-slate-500">· {formatDateTime(e.createdAt)}</span>
                </span>
                <span className={cn('tabular-nums', e.amount < 0 ? 'text-red-600' : 'text-emerald-700')}>{formatMoney(e.amount)}</span>
              </li>
            ))}
          </ul>
          <Button variant="outline" className="w-full" icon={<Printer className="size-4" />} onClick={() => onPrint(credit)}>
            Imprimir 2ª via
          </Button>
        </div>
      )}
    </Modal>
  );
}
