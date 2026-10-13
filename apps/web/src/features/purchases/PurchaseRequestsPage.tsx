import { Bot, CheckCircle2, Printer, Send, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Badge, Card, EmptyState, ErrorState, LoadingState, PageHeader, Pagination, Tabs } from '@/components/ui/Display';
import { errorMessage } from '@/lib/api';
import { formatDateTime, formatQuantity } from '@/lib/format';
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

  return (
    <>
      <PageHeader
        title="Solicitações de pedido"
        description="Geradas automaticamente quando um produto atinge o ponto de pedido, ou criadas manualmente."
        actions={
          <Button variant="outline" icon={<Printer className="size-4" />} onClick={() => window.print()}>
            Imprimir lista
          </Button>
        }
      />

      <div className="mb-4">
        <Tabs
          value={status}
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
          options={TABS}
        />
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
                    <th className="hidden text-right md:table-cell">Saldo na solicitação</th>
                    <th className="hidden text-right md:table-cell">Saldo atual</th>
                    <th className="hidden lg:table-cell">Origem</th>
                    <th>Situação</th>
                    {canManage && <th className="no-print" />}
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((request) => (
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
                      </td>
                      <td className="hidden text-right tabular-nums text-slate-600 md:table-cell">
                        {formatQuantity(request.stockAtRequest, request.product.unit)}
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
