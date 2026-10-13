import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Badge, Card, EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/ui/Display';
import { ConfirmDialog } from '@/components/ui/Modal';
import { errorMessage, http, isCanceled } from '@/lib/api';
import { formatDate, formatDateTime, formatQuantity } from '@/lib/format';
import type { TrashedProduct } from '@/lib/types';
import { invalidateStockData } from '../products/api';

export function TrashPage() {
  const queryClient = useQueryClient();
  const [purging, setPurging] = useState<TrashedProduct | null>(null);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['trash'],
    queryFn: () => http.get<TrashedProduct[]>('/trash'),
  });

  const restore = useMutation({
    mutationFn: (id: string) => http.post(`/trash/${id}/restore`),
    onSuccess: () => {
      invalidateStockData(queryClient);
      toast.success('Produto restaurado');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const purge = useMutation({
    mutationFn: (id: string) => http.delete(`/trash/${id}`),
    onSuccess: () => {
      invalidateStockData(queryClient);
      setPurging(null);
      toast.success('Produto excluído definitivamente');
    },
    onError: (error) => !isCanceled(error) && toast.error(errorMessage(error)),
  });

  return (
    <>
      <PageHeader
        title="Lixeira"
        description="Produtos excluídos podem ser recuperados até o prazo indicado. Depois disso, são apagados automaticamente com todo o histórico."
      />

      <Card className="overflow-hidden">
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message="Não foi possível carregar a lixeira" onRetry={refetch} />
        ) : !data || data.length === 0 ? (
          <EmptyState title="A lixeira está vazia" />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th className="hidden md:table-cell">Excluído em</th>
                  <th className="hidden text-right sm:table-cell">Saldo</th>
                  <th>Exclusão definitiva</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.map((product) => (
                  <tr key={product.id}>
                    <td>
                      <p className="font-medium text-slate-900">{product.name}</p>
                      <p className="text-xs text-slate-500">{product.sku}</p>
                    </td>
                    <td className="hidden text-slate-600 md:table-cell">{formatDateTime(product.deletedAt!)}</td>
                    <td className="hidden text-right tabular-nums sm:table-cell">{formatQuantity(product.currentStock, product.unit)}</td>
                    <td>
                      <Badge tone={product.daysLeft <= 3 ? 'red' : 'amber'}>
                        {product.daysLeft === 0 ? 'Hoje' : `em ${product.daysLeft} dia(s)`}
                      </Badge>
                      <p className="mt-0.5 text-xs text-slate-400">{formatDate(product.purgeAt)}</p>
                    </td>
                    <td>
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="secondary"
                          icon={<RotateCcw className="size-3.5" />}
                          loading={restore.isPending && restore.variables === product.id}
                          onClick={() => restore.mutate(product.id)}
                        >
                          Restaurar
                        </Button>
                        <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" icon={<Trash2 className="size-3.5" />} onClick={() => setPurging(product)}>
                          Excluir agora
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={Boolean(purging)}
        title="Excluir definitivamente?"
        confirmLabel="Excluir para sempre"
        loading={purge.isPending}
        onClose={() => setPurging(null)}
        onConfirm={() => purging && purge.mutate(purging.id)}
        description={
          <>
            <strong className="text-slate-800">{purging?.name}</strong> e todo o seu histórico de movimentações e pedidos serão
            apagados. <strong className="text-red-600">Esta ação não pode ser desfeita.</strong>
          </>
        }
      />
    </>
  );
}
