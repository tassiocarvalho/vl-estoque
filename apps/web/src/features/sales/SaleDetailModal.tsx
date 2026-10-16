import { useQueryClient } from '@tanstack/react-query';
import { Ban, FileDown, Printer } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/Display';
import { Button } from '@/components/ui/Button';
import { Field, Textarea } from '@/components/ui/Form';
import { Modal } from '@/components/ui/Modal';
import { errorMessage, http, isCanceled } from '@/lib/api';
import { formatDateTime, formatMoney, formatNumber } from '@/lib/format';
import { PAYMENT_LABELS, UNIT_SHORT } from '@/lib/labels';
import type { Sale } from '@/lib/types';
import { invalidateSalesData } from '../pos/api';
import { usePrinter } from '../printing/usePrinter';

export const saleNumberLabel = (sale: Sale) => `Nº ${String(sale.number).padStart(6, '0')}`;

export function SaleStatusBadge({ sale }: { sale: Sale }) {
  return sale.status === 'CANCELED' ? (
    <Badge tone="red" dot>
      Cancelada
    </Badge>
  ) : (
    <Badge tone="green" dot>
      Concluída
    </Badge>
  );
}

/** Detalhe de uma venda: itens, pagamentos, reimpressão (2ª via), PDF e cancelamento com estorno. */
export function SaleDetailModal({ sale, onClose }: { sale: Sale | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { printSale, pdf } = usePrinter();
  const [current, setCurrent] = useState<Sale | null>(sale);
  const [canceling, setCanceling] = useState(false);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setCurrent(sale);
    setCanceling(false);
    setReason('');
  }, [sale]);

  if (!current) return null;
  const cancelable = current.status === 'COMPLETED' && current.session.status === 'OPEN';

  const cancel = async (event: FormEvent) => {
    event.preventDefault();
    if (reason.trim().length < 3) return;
    setLoading(true);
    try {
      const updated = await http.post<Sale>(`/sales/${current.id}/cancel`, { reason: reason.trim() });
      setCurrent(updated);
      setCanceling(false);
      invalidateSalesData(queryClient);
      toast.success(`Venda ${saleNumberLabel(updated)} cancelada`, { description: 'Os itens voltaram para o estoque.' });
    } catch (e) {
      if (!isCanceled(e)) toast.error(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={Boolean(sale)}
      onClose={onClose}
      size="lg"
      title={`Venda ${saleNumberLabel(current)}`}
      description={`${formatDateTime(current.occurredAt)} · ${current.session.terminal} · ${current.operator.name}`}
      footer={
        canceling ? undefined : (
          <>
            {cancelable && (
              <Button variant="outline" className="mr-auto text-red-600" icon={<Ban className="size-4" />} onClick={() => setCanceling(true)}>
                Cancelar venda
              </Button>
            )}
            <Button variant="outline" icon={<FileDown className="size-4" />} onClick={() => void pdf.sale(current)}>
              PDF
            </Button>
            <Button icon={<Printer className="size-4" />} onClick={() => void printSale(current, { copy: true })}>
              Reimprimir
            </Button>
          </>
        )
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <SaleStatusBadge sale={current} />
          {current.offline && <Badge tone="amber">Feita sem internet</Badge>}
          {current.discountAuthorizedBy && <Badge tone="violet">Desconto autorizado por {current.discountAuthorizedBy.name}</Badge>}
        </div>
        {current.status === 'CANCELED' && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            Cancelada em {current.canceledAt && formatDateTime(current.canceledAt)} por {current.canceledBy?.name}: {current.cancelReason}
          </p>
        )}
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="table-base">
            <thead>
              <tr>
                <th>Item</th>
                <th className="text-right">Qtd</th>
                <th className="text-right">Preço</th>
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {current.items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <p className="font-medium text-slate-900">{item.productName}</p>
                    <p className="text-xs text-slate-500">
                      {item.sku}
                      {item.discount > 0 && ` · desconto −${formatMoney(item.discount)}`}
                    </p>
                  </td>
                  <td className="text-right tabular-nums">
                    {formatNumber(item.quantity)} {UNIT_SHORT[item.unit]}
                  </td>
                  <td className="text-right tabular-nums">{formatMoney(item.unitPrice)}</td>
                  <td className="text-right font-medium tabular-nums">{formatMoney(item.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <dl className="space-y-1 text-sm">
            {current.payments.map((p, index) => (
              <div key={index} className="flex justify-between">
                <dt className="text-slate-500">{PAYMENT_LABELS[p.method]}</dt>
                <dd className="tabular-nums">{formatMoney(p.amount)}</dd>
              </div>
            ))}
            {current.change > 0 && (
              <div className="flex justify-between">
                <dt className="text-slate-500">Troco</dt>
                <dd className="tabular-nums">{formatMoney(current.change)}</dd>
              </div>
            )}
          </dl>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Subtotal</dt>
              <dd className="tabular-nums">{formatMoney(current.grossTotal)}</dd>
            </div>
            {current.itemsDiscount + current.orderDiscount > 0 && (
              <div className="flex justify-between">
                <dt className="text-slate-500">Descontos</dt>
                <dd className="tabular-nums">−{formatMoney(current.itemsDiscount + current.orderDiscount)}</dd>
              </div>
            )}
            <div className="flex justify-between text-base font-semibold text-slate-900">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatMoney(current.total)}</dd>
            </div>
          </dl>
        </div>

        {canceling && (
          <form onSubmit={cancel} className="space-y-3 rounded-xl border border-red-200 bg-red-50/50 p-4">
            <Field label="Motivo do cancelamento" hint="Obrigatório. Os itens voltam para o estoque.">
              {(id) => <Textarea id={id} autoFocus maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />}
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCanceling(false)}>
                Voltar
              </Button>
              <Button type="submit" variant="danger" loading={loading} disabled={reason.trim().length < 3}>
                Confirmar cancelamento
              </Button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}
