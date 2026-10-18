import { Bot, CheckCircle2, Printer, Send, XCircle } from 'lucide-react';
import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Badge, Card, EmptyState, ErrorState, LoadingState, PageHeader, Pagination, Tabs } from '@/components/ui/Display';
import { Switch } from '@/components/ui/Form';
import { errorMessage } from '@/lib/api';
import { formatDateTime, formatMoney, formatQuantity } from '@/lib/format';
import { formatPhone } from '@/lib/document';
import { PURCHASE_STATUS_LABELS } from '@/lib/labels';
import { P } from '@/lib/permissions';
import type { PurchaseRequest, PurchaseRequestStatus } from '@/lib/types';
import { useAuth } from '../auth/AuthProvider';
import { usePurchaseRequests, useUpdatePurchaseStatus } from './api';

const STATUS_TONE = { PENDING: 'amber', ORDERED: 'blue', RECEIVED: 'green', CANCELED: 'neutral' } as const;

const TABS: { value: PurchaseRequestStatus | ''; label: string }[] = [
  { value: 'PENDING', label: 'Pendentes' },
  { value: 'ORDERED', label: 'Pedidos feitos' },
  { value: 'RECEIVED', label: 'Recebidos' },
  { value: 'CANCELED', label: 'Cancelados' },
  { value: '', label: 'Todos' },
];

function Actions({ request }: { request: PurchaseRequest }) {
  const update = useUpdatePurchaseStatus();
  const change = async (status: PurchaseRequestStatus, message: string) => {
    try {
      await update.mutateAsync({ id: request.id, status });
      toast.success(message);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  if (request.status === 'PENDING') {
    return (
      <div className="flex justify-end gap-1">
        <Button size="sm" variant="secondary" icon={<Send className="size-3.5" />} onClick={() => change('ORDERED', 'Marcado como pedido feito')}>
          Pedido feito
        </Button>
        <Button size="sm" variant="ghost" icon={<XCircle className="size-3.5" />} onClick={() => change('CANCELED', 'Solicitação cancelada')}>
          Cancelar
        </Button>
      </div>
    );
  }
  if (request.status === 'ORDERED') {
    return (
      <div className="flex justify-end gap-1">
        <Button size="sm" variant="secondary" icon={<CheckCircle2 className="size-3.5" />} onClick={() => change('RECEIVED', 'Marcado como recebido. Lembre-se de registrar a entrada.')}>
          Recebido
        </Button>
        <Button size="sm" variant="ghost" icon={<XCircle className="size-3.5" />} onClick={() => change('CANCELED', 'Solicitação cancelada')}>
          Cancelar
        </Button>
      </div>
    );
  }
  return null;
}

export function PurchaseRequestsPage() {
  const { can } = useAuth();
  const [status, setStatus] = useState<PurchaseRequestStatus | ''>('PENDING');
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, refetch } = usePurchaseRequests(status, page);
  const canManage = can(P.PURCHASE_MANAGE);
  const [grouped, setGrouped] = useState(true);

  // Agrupado: um bloco por fornecedor (o pedido sai pronto para mandar a cada um).
  const groups = (() => {
    const items = data?.items ?? [];
    if (!grouped) return [{ key: 'all', label: null as string | null, phone: null as string | null, items }];
    const map = new Map<string, { key: string; label: string | null; phone: string | null; items: PurchaseRequest[] }>();
    for (const item of items) {
      const key = item.supplier?.id ?? 'none';
      const group = map.get(key) ?? { key, label: item.supplier ? item.supplier.tradeName || item.supplier.name : null, phone: item.supplier?.phone ?? null, items: [] };
      group.items.push(item);
      map.set(key, group);
    }
    return [...map.values()].sort((a, b) => (a.label === null ? 1 : b.label === null ? -1 : a.label.localeCompare(b.label)));
  })();
  const estimate = (items: PurchaseRequest[]) =>
    items.reduce((sum, r) => sum + r.suggestedQuantity * (r.supplier?.lastCost ?? r.product.lastCost ?? 0), 0);
  const columns = 6 + (canManage ? 1 : 0);

  return (
    <>
      <PageHeader
        title="Solicitações de pedido"
        description="Geradas automaticamente quando um produto atinge o ponto de pedido, ou criadas manualmente."
        actions={
          <Button variant="outline" icon={<Printer className="size-4" />} onClick={() => window.print()}>
            Imprimir pedido
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={status}
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
          options={TABS}
        />
        <div className="no-print w-64">
          <Switch checked={grouped} onChange={setGrouped} label="Agrupar por fornecedor" />
        </div>
      </div>

      <Card className="print-full overflow-hidden">
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message="Não foi possível carregar as solicitações" onRetry={refetch} />
        ) : data && data.items.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th className="text-right">Qtd. a pedir</th>
                    <th className="hidden text-right sm:table-cell">Último custo</th>
                    <th className="hidden text-right md:table-cell">Saldo atual</th>
                    <th className="hidden lg:table-cell">Origem</th>
                    <th>Situação</th>
                    {canManage && <th className="no-print" />}
                  </tr>
                </thead>
                <tbody>
                  {groups.map((group) => (
                    <Fragment key={group.key}>
                      {grouped && (
                        <tr className="bg-slate-50">
                          <td colSpan={columns} className="py-2">
                            <span className="font-semibold text-slate-900">{group.label ?? 'Sem fornecedor definido'}</span>
                            {group.phone && <span className="ml-2 text-xs text-slate-500">{formatPhone(group.phone)}</span>}
                            <span className="ml-2 text-xs text-slate-500">
                              · {group.items.length} item(ns) · estimativa {formatMoney(estimate(group.items))}
                            </span>
                          </td>
                        </tr>
                      )}
                      {group.items.map((request) => (
                    <tr key={request.id}>
                      <td>
                        <Link to={`/produtos/${request.product.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                          {request.product.name}
                        </Link>
                        <p className="text-xs text-slate-500">
                          {request.product.sku} · {formatDateTime(request.createdAt)}
                        </p>
                        {request.note && !request.automatic && <p className="text-xs text-slate-400">{request.note}</p>}
                      </td>
                      <td className="text-right font-semibold tabular-nums text-slate-900">
                        {formatQuantity(request.suggestedQuantity, request.product.unit)}
                        {!grouped && request.supplier && <p className="text-xs font-normal text-slate-500">{request.supplier.tradeName || request.supplier.name}</p>}
                      </td>
                      <td className="hidden text-right tabular-nums text-slate-600 sm:table-cell">
                        {request.supplier?.lastCost ?? request.product.lastCost ? formatMoney(request.supplier?.lastCost ?? request.product.lastCost) : '—'}
                        {request.supplier?.supplierCode && <p className="text-xs text-slate-400">cód. {request.supplier.supplierCode}</p>}
                      </td>
                      <td className="hidden text-right tabular-nums text-slate-600 md:table-cell">
                        {formatQuantity(request.product.currentStock, request.product.unit)}
                      </td>
                      <td className="hidden text-slate-600 lg:table-cell">
                        {request.automatic ? (
                          <span className="inline-flex items-center gap-1.5">
                            <Bot className="size-4 text-slate-400" /> Automática
                          </span>
                        ) : (
                          request.createdBy?.name
                        )}
                      </td>
                      <td>
                        <Badge tone={STATUS_TONE[request.status]}>{PURCHASE_STATUS_LABELS[request.status]}</Badge>
                      </td>
                      {canManage && (
                        <td className="no-print">
                          <Actions request={request} />
                        </td>
                      )}
                    </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />
          </>
        ) : (
          <EmptyState
            title={status === 'PENDING' ? 'Nenhuma solicitação pendente' : 'Nenhuma solicitação encontrada'}
            description="Quando um produto atingir o ponto de pedido, a solicitação aparecerá aqui."
          />
        )}
      </Card>
    </>
  );
}
