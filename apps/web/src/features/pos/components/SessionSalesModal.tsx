import { useState } from 'react';
import { EmptyState, ErrorState, LoadingState, Pagination } from '@/components/ui/Display';
import { Modal } from '@/components/ui/Modal';
import { formatMoney } from '@/lib/format';
import type { Sale } from '@/lib/types';
import { SaleDetailModal, saleNumberLabel, SaleStatusBadge } from '../../sales/SaleDetailModal';
import { useSales } from '../api';

/** Vendas do turno atual (F7): reimprimir comprovante ou cancelar uma venda. */
export function SessionSalesModal({ open, sessionId, onClose }: { open: boolean; sessionId: string; onClose: () => void }) {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Sale | null>(null);
  const { data, isLoading, isError, refetch } = useSales({ sessionId, page, pageSize: 10 }, open);

  return (
    <>
      <Modal open={open && !selected} onClose={onClose} title="Vendas deste caixa" description="Selecione para reimprimir ou cancelar" size="lg">
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message="Não foi possível carregar as vendas (é preciso estar online)" onRetry={refetch} />
        ) : !data?.items.length ? (
          <EmptyState title="Nenhuma venda neste caixa ainda" />
        ) : (
          <div className="-mx-6 -my-5">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Venda</th>
                  <th>Hora</th>
                  <th>Situação</th>
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((sale) => (
                  <tr key={sale.id} className="cursor-pointer" onClick={() => setSelected(sale)}>
                    <td>
                      <button type="button" className="font-medium text-brand-700 hover:underline" onClick={() => setSelected(sale)}>
                        {saleNumberLabel(sale)}
                      </button>
                    </td>
                    <td className="text-slate-600">{new Date(sale.occurredAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</td>
                    <td>
                      <SaleStatusBadge sale={sale} />
                    </td>
                    <td className="text-right font-medium tabular-nums">{formatMoney(sale.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={page} pageSize={10} total={data.total} onChange={setPage} />
          </div>
        )}
      </Modal>
      <SaleDetailModal
        sale={selected}
        onClose={() => {
          setSelected(null);
          void refetch();
        }}
      />
    </>
  );
}
