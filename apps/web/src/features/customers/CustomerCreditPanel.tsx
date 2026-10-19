import { useQueryClient } from '@tanstack/react-query';
import { Ban, Printer } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge, LoadingState, Tabs } from '@/components/ui/Display';
import { IconButton } from '@/components/ui/Button';
import { errorMessage, http } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDate, formatDateTime, formatMoney } from '@/lib/format';
import { P } from '@/lib/permissions';
import type { StoreCredit } from '@/lib/types';
import { useAuth } from '../auth/AuthProvider';
import { useCustomerCredits, useCustomerStatement } from '../pos/post-sale-api';
import { usePrinter } from '../printing/usePrinter';

const day = (iso: string) => formatDate(`${iso}T12:00:00`);
const CREDIT_STATUS = { ACTIVE: ['green', 'Ativo'], USED: ['neutral', 'Usado'], EXPIRED: ['amber', 'Vencido'], CANCELED: ['red', 'Cancelado'] } as const;

/** Fiado (limite, parcelas, recebimentos) e vales-troca do cliente. */
export function CustomerCreditPanel({ customerId, limit }: { customerId: string; limit: number }) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const printer = usePrinter();
  const statement = useCustomerStatement(customerId);
  const credits = useCustomerCredits(customerId);
  const [tab, setTab] = useState<'fiado' | 'recebimentos' | 'vales'>('fiado');

  if (statement.isLoading) return <LoadingState />;
  const data = statement.data;
  if (!data) return null;
  const { credit } = data;
  const hasAnything = limit > 0 || data.receivables.length > 0 || (credits.data?.length ?? 0) > 0;
  if (!hasAnything) return <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">Sem fiado nem vale-troca. O limite do fiado é definido pelo gerente em “Editar”.</p>;

  const cancelCredit = async (voucher: StoreCredit) => {
    if (!window.confirm(`Cancelar o saldo de ${formatMoney(voucher.balance)} do vale ${voucher.code}?`)) return;
    try {
      await http.post(`/store-credits/${voucher.id}/cancel`);
      toast.success('Vale cancelado');
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ['Limite do fiado', formatMoney(credit.limit), ''],
          ['Em aberto', formatMoney(credit.open), ''],
          ['Vencido', formatMoney(credit.overdue), credit.overdue > 0 ? 'text-red-600' : ''],
          ['Disponível', formatMoney(credit.available), 'text-emerald-700'],
        ].map(([label, value, tone]) => (
          <div key={label} className="rounded-lg bg-slate-50 px-3 py-2">
            <p className="text-xs text-slate-500">{label}</p>
            <p className={cn('font-semibold tabular-nums', tone)}>{value}</p>
          </div>
        ))}
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { value: 'fiado', label: 'Parcelas', count: data.receivables.filter((r) => r.status === 'OPEN').length },
          { value: 'recebimentos', label: 'Recebimentos', count: data.receipts.length },
          { value: 'vales', label: 'Vales-troca', count: credits.data?.filter((c) => c.status === 'ACTIVE').length ?? 0 },
        ]}
      />
      {tab === 'fiado' &&
        (data.receivables.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhuma compra no fiado.</p>
        ) : (
          <ul className="max-h-60 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 text-sm">
            {data.receivables.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <span>
                  <span className="font-medium text-slate-800">{r.description}</span>
                  {r.installments > 1 && <span className="text-slate-500"> ({r.installment}/{r.installments})</span>}
                  <span className={cn('block text-xs', r.overdue ? 'font-medium text-red-600' : 'text-slate-500')}>
                    vence {day(r.dueDate)}
                    {r.overdue && ` · ${r.daysOverdue} dia(s) de atraso`}
                  </span>
                </span>
                <span className="text-right tabular-nums">
                  {formatMoney(r.status === 'OPEN' ? r.balance : r.amount)}
                  <span className="block">
                    {r.status === 'PAID' ? <Badge tone="green">Paga</Badge> : r.status === 'CANCELED' ? <Badge>Cancelada</Badge> : r.paidAmount > 0 ? <Badge tone="amber">Parcial</Badge> : null}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ))}
      {tab === 'recebimentos' &&
        (data.receipts.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum recebimento.</p>
        ) : (
          <ul className="max-h-60 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 text-sm">
            {data.receipts.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <span>
                  Recibo nº {r.number} · {r.methodName}
                  <span className="block text-xs text-slate-500">
                    {formatDateTime(r.occurredAt)} · {r.session.terminal} · {r.user.name}
                  </span>
                </span>
                <span className="flex items-center gap-1 tabular-nums">
                  {formatMoney(r.amount)}
                  <IconButton label="Imprimir recibo" onClick={() => void printer.printReceipt(r)}>
                    <Printer className="size-4" />
                  </IconButton>
                </span>
              </li>
            ))}
          </ul>
        ))}
      {tab === 'vales' &&
        (!credits.data?.length ? (
          <p className="text-sm text-slate-500">Nenhum vale-troca.</p>
        ) : (
          <ul className="max-h-60 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 text-sm">
            {credits.data.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <span>
                  <span className="font-mono font-medium">{c.code}</span> <Badge tone={CREDIT_STATUS[c.status][0]}>{CREDIT_STATUS[c.status][1]}</Badge>
                  <span className="block text-xs text-slate-500">
                    {formatMoney(c.amount)} em {formatDate(c.createdAt)}
                    {c.expiresAt && ` · válido até ${day(c.expiresAt)}`}
                  </span>
                </span>
                <span className="flex items-center gap-1 tabular-nums">
                  {formatMoney(c.balance)}
                  <IconButton label="Imprimir 2ª via" onClick={() => void printer.printVoucher(c)}>
                    <Printer className="size-4" />
                  </IconButton>
                  {can(P.CUSTOMER_MANAGE) && c.status === 'ACTIVE' && (
                    <IconButton label="Cancelar o saldo do vale" onClick={() => void cancelCredit(c)}>
                      <Ban className="size-4" />
                    </IconButton>
                  )}
                </span>
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}
