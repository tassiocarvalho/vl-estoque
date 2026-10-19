import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Ban, HandCoins, Search, Users, Wallet } from 'lucide-react';
import { useDeferredValue, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Badge, Card, CardHeader, EmptyState, ErrorState, LoadingState, PageHeader, Pagination, StatCard, Tabs } from '@/components/ui/Display';
import { IconButton } from '@/components/ui/Button';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/Form';
import { Modal } from '@/components/ui/Modal';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatPhone } from '@/lib/document';
import { formatDate, formatMoney } from '@/lib/format';
import { P } from '@/lib/permissions';
import type { Receivable } from '@/lib/types';
import { useAuth } from '../auth/AuthProvider';
import { cancelReceivable, useReceivables, useReceivablesSummary } from '../pos/post-sale-api';

type Tab = 'open' | 'overdue' | 'paid' | 'canceled';
const day = (iso: string) => formatDate(`${iso}T12:00:00`);

/** Fiado (contas a receber, RF23): carteira, inadimplência por faixa de atraso e maiores devedores. */
export function ReceivablesPage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('open');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const deferred = useDeferredValue(search.trim());
  const summary = useReceivablesSummary();
  const { data, isLoading, isError, refetch } = useReceivables({
    status: tab === 'overdue' ? 'open' : tab,
    overdue: tab === 'overdue' || undefined,
    search: deferred || undefined,
    page,
    pageSize: 20,
  });
  const [canceling, setCanceling] = useState<Receivable | null>(null);
  const s = summary.data;
  const agingTotal = s ? Object.values(s.aging).reduce((a, b) => a + b, 0) : 0;

  return (
    <>
      <PageHeader
        title="Fiado (contas a receber)"
        description="Parcelas das vendas no fiado. O recebimento é feito no caixa (F11 → Receber fiado)."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total em aberto" value={formatMoney(s?.open ?? 0)} icon={<Wallet className="size-5" />} hint={`${s?.customers ?? 0} cliente(s)`} onClick={() => setTab('open')} />
        <StatCard label="Vencido" value={formatMoney(s?.overdue ?? 0)} icon={<AlertTriangle className="size-5" />} tone={s?.overdue ? 'red' : 'neutral'} hint={`${s?.overdueCustomers ?? 0} cliente(s) em atraso`} onClick={() => setTab('overdue')} />
        <StatCard label="A vencer" value={formatMoney(s?.aging.current ?? 0)} icon={<HandCoins className="size-5" />} tone="blue" />
        <StatCard label="Mais de 90 dias" value={formatMoney(s?.aging.d90 ?? 0)} icon={<Users className="size-5" />} tone={s?.aging.d90 ? 'amber' : 'neutral'} />
      </div>

      {s && agingTotal > 0 && (
        <div className="mb-5 grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Atraso por faixa" description="Quanto está vencido há quanto tempo" />
            <div className="space-y-2 p-5">
              {[
                ['A vencer', s.aging.current, 'bg-sky-500'],
                ['1 a 30 dias', s.aging.d1_30, 'bg-amber-400'],
                ['31 a 60 dias', s.aging.d31_60, 'bg-orange-500'],
                ['61 a 90 dias', s.aging.d61_90, 'bg-red-500'],
                ['Mais de 90 dias', s.aging.d90, 'bg-red-700'],
              ].map(([label, value, color]) => (
                <div key={label as string}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="text-slate-600">{label}</span>
                    <span className="font-medium tabular-nums">{formatMoney(value as number)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100">
                    <div className={cn('h-2 rounded-full', color as string)} style={{ width: `${((value as number) / agingTotal) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <CardHeader title="Maiores devedores" description="Ordenados pelo valor vencido" />
            <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto">
              {s.debtors.map((d) => (
                <li key={d.customer.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                  <span>
                    <Link to={`/clientes?cliente=${d.customer.id}`} className="font-medium text-slate-900 hover:underline">
                      {d.customer.name}
                    </Link>
                    <span className="block text-xs text-slate-500">
                      {formatPhone(d.customer.phone) || 'sem telefone'}
                      {d.oldestDays > 0 && ` · ${d.oldestDays} dia(s) de atraso`}
                    </span>
                  </span>
                  <span className="text-right tabular-nums">
                    <span className={cn('block font-semibold', d.overdue > 0 && 'text-red-600')}>{formatMoney(d.overdue > 0 ? d.overdue : d.open)}</span>
                    {d.overdue > 0 && <span className="block text-xs text-slate-500">de {formatMoney(d.open)}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      <div className="no-print mb-4 flex flex-wrap items-center gap-3">
        <Tabs
          value={tab}
          onChange={(value) => {
            setTab(value);
            setPage(1);
          }}
          options={[
            { value: 'open', label: 'Em aberto' },
            { value: 'overdue', label: 'Vencidas' },
            { value: 'paid', label: 'Pagas' },
            { value: 'canceled', label: 'Canceladas' },
          ]}
        />
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nome do cliente" className="pl-9" aria-label="Buscar cliente" />
        </div>
      </div>

      <Card>
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message="Não foi possível carregar o fiado" onRetry={refetch} />
        ) : !data?.items.length ? (
          <EmptyState title="Nenhuma parcela aqui" description="Vendas com a forma “Fiado / crediário” geram as parcelas a receber." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Vencimento</th>
                    <th>Cliente</th>
                    <th className="hidden sm:table-cell">Origem</th>
                    <th className="text-right">Saldo</th>
                    <th>Situação</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((r) => (
                    <tr key={r.id}>
                      <td className={cn('whitespace-nowrap tabular-nums', r.overdue && 'font-semibold text-red-700')}>
                        {day(r.dueDate)}
                        {r.overdue && <p className="text-xs font-normal">{r.daysOverdue} dia(s) de atraso</p>}
                      </td>
                      <td>
                        <Link to={`/clientes?cliente=${r.customer.id}`} className="font-medium text-slate-900 hover:underline">
                          {r.customer.name}
                        </Link>
                        <p className="text-xs text-slate-500">{formatPhone(r.customer.phone) || ''}</p>
                      </td>
                      <td className="hidden text-slate-600 sm:table-cell">
                        {r.description}
                        {r.installments > 1 && ` (${r.installment}/${r.installments})`}
                      </td>
                      <td className="text-right tabular-nums">
                        <p className="font-semibold">{formatMoney(r.status === 'OPEN' ? r.balance : r.amount)}</p>
                        {r.paidAmount > 0 && r.status === 'OPEN' && <p className="text-xs text-slate-500">pago {formatMoney(r.paidAmount)}</p>}
                      </td>
                      <td>
                        {r.status === 'PAID' ? (
                          <Badge tone="green" dot>Paga</Badge>
                        ) : r.status === 'CANCELED' ? (
                          <Badge dot>Cancelada</Badge>
                        ) : r.overdue ? (
                          <Badge tone="red" dot>Vencida</Badge>
                        ) : (
                          <Badge tone="amber" dot>Em aberto</Badge>
                        )}
                      </td>
                      <td className="text-right">
                        {can(P.FINANCE_MANAGE) && r.status === 'OPEN' && (
                          <IconButton label="Cancelar o saldo desta parcela (acordo ou perdão)" onClick={() => setCanceling(r)}>
                            <Ban className="size-4" />
                          </IconButton>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={20} total={data.total} onChange={setPage} />
          </>
        )}
      </Card>

      <CancelModal
        receivable={canceling}
        onClose={() => setCanceling(null)}
        onDone={() => {
          setCanceling(null);
          void queryClient.invalidateQueries({ queryKey: ['receivables'] });
          void queryClient.invalidateQueries({ queryKey: ['customers'] });
        }}
      />
    </>
  );
}

function CancelModal({ receivable, onClose, onDone }: { receivable: Receivable | null; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!receivable || reason.trim().length < 3) return;
    setSaving(true);
    try {
      await cancelReceivable(receivable.id, reason.trim());
      toast.success('Saldo da parcela cancelado');
      setReason('');
      onDone();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      open={Boolean(receivable)}
      onClose={onClose}
      title="Cancelar saldo da parcela"
      description={receivable ? `${receivable.customer.name} · ${receivable.description} · saldo ${formatMoney(receivable.balance)}` : undefined}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Voltar
          </Button>
          <Button type="submit" form="cancel-receivable" variant="danger" loading={saving} disabled={reason.trim().length < 3}>
            Cancelar saldo
          </Button>
        </>
      }
    >
      <form id="cancel-receivable" onSubmit={submit}>
        <Field label="Motivo" hint="Ex.: acordo de pagamento, dívida perdoada. Fica na auditoria.">
          {(id) => <Textarea id={id} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} autoFocus />}
        </Field>
      </form>
    </Modal>
  );
}
