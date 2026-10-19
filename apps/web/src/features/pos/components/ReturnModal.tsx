import { AlertTriangle, ArrowLeft, Search, Undo2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Badge, LoadingState } from '@/components/ui/Display';
import { Button } from '@/components/ui/Button';
import { Field, Input, Switch, Textarea } from '@/components/ui/Form';
import { Modal } from '@/components/ui/Modal';
import { errorMessage, isCanceled } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDateTime, formatInput, formatMoney, formatNumber, parseDecimal, uuid } from '@/lib/format';
import { REFUND_METHOD_LABELS, UNIT_SHORT } from '@/lib/labels';
import type { RefundMethod, ReturnPreview, SaleReturn } from '@/lib/types';
import { createReturn, fetchReturnPreview } from '../post-sale-api';

interface Line {
  quantity: string;
  damaged: boolean;
}

/**
 * Troca e devolução: localiza a venda pelo número do comprovante, escolhe os itens e as quantidades,
 * se voltam ao estoque e como o cliente é reembolsado. Na troca, o vale já entra como pagamento da nova venda.
 */
export function ReturnModal({
  open,
  sessionId,
  saleId,
  onClose,
  onDone,
}: {
  open: boolean;
  /** Caixa aberto (permite devolver em dinheiro). */
  sessionId?: string;
  /** Venda já escolhida (ex.: vinda do detalhe da venda). */
  saleId?: string;
  onClose: () => void;
  onDone: (saleReturn: SaleReturn, exchange: boolean) => void;
}) {
  const [number, setNumber] = useState('');
  const [preview, setPreview] = useState<ReturnPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [lines, setLines] = useState<Record<string, Line>>({});
  const [method, setMethod] = useState<RefundMethod>('STORE_CREDIT');
  const [exchange, setExchange] = useState(false);
  const [reason, setReason] = useState('');
  const [returnId, setReturnId] = useState(uuid);
  const [saving, setSaving] = useState(false);

  const load = async (filter: { saleId?: string; number?: number }) => {
    setLoading(true);
    try {
      const data = await fetchReturnPreview(filter);
      setPreview(data);
      setLines(Object.fromEntries(data.items.map((i) => [i.saleItemId, { quantity: '', damaged: false }])));
      setMethod(sessionId ? 'CASH' : data.refundOptions.original ? 'ORIGINAL' : 'STORE_CREDIT');
      setReturnId(uuid());
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setPreview(null);
    setNumber('');
    setReason('');
    setExchange(false);
    if (saleId) void load({ saleId });
  }, [open, saleId]);

  const selected = preview
    ? preview.items
        .map((item) => ({ item, quantity: parseDecimal(lines[item.saleItemId]?.quantity ?? '', 3), damaged: lines[item.saleItemId]?.damaged ?? false }))
        .filter((l) => l.quantity > 0)
    : [];
  const estimate = selected.reduce((sum, l) => {
    const full = l.quantity >= l.item.returnableQuantity - 0.0005;
    return sum + (full ? l.item.refundableRemaining : Math.round((l.item.refundableRemaining * l.quantity * 100) / l.item.returnableQuantity) / 100);
  }, 0);
  const invalid = selected.find((l) => l.quantity > l.item.returnableQuantity + 0.0005);

  const setLine = (id: string, patch: Partial<Line>) => setLines((current) => ({ ...current, [id]: { ...current[id], ...patch } }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!preview || !selected.length || invalid) return;
    if (reason.trim().length < 3) return toast.error('Informe o motivo da devolução');
    setSaving(true);
    try {
      const saleReturn = await createReturn({
        id: returnId,
        saleId: preview.sale.id,
        sessionId,
        items: selected.map((l) => ({ saleItemId: l.item.saleItemId, quantity: l.quantity, restock: !l.damaged })),
        refundMethod: method,
        reason: reason.trim(),
      });
      onDone(saleReturn, exchange && method === 'STORE_CREDIT');
    } catch (error) {
      if (!isCanceled(error)) toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const options: { value: RefundMethod; label: string; hint: string; show: boolean }[] = preview
    ? [
        { value: 'STORE_CREDIT', label: 'Vale-troca', hint: 'Crédito para usar numa compra (troca)', show: true },
        { value: 'CASH', label: 'Dinheiro', hint: 'Sai da gaveta deste caixa', show: Boolean(sessionId) },
        { value: 'ORIGINAL', label: 'Estorno na forma original', hint: preview.refundOptions.original ?? '', show: Boolean(preview.refundOptions.original) },
        { value: 'ACCOUNT', label: 'Abater do fiado', hint: preview.refundOptions.account ? `Em aberto nesta venda: ${formatMoney(preview.refundOptions.account)}` : '', show: preview.refundOptions.account !== null },
      ]
    : [];

  return (
    <Modal open={open} onClose={onClose} title="Troca / devolução" size="lg">
      {!preview ? (
        loading ? (
          <LoadingState label="Buscando a venda..." />
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const n = Number(number.replace(/\D/g, ''));
              if (n > 0) void load({ number: n });
            }}
            className="space-y-3"
          >
            <Field label="Número da venda" hint="Está no comprovante (Nº 000123). Também dá para abrir a venda pela lista de vendas (F7).">
              {(id) => (
                <div className="flex gap-2">
                  <Input id={id} value={number} onChange={(e) => setNumber(e.target.value)} inputMode="numeric" autoFocus placeholder="Ex.: 123" />
                  <Button type="submit" icon={<Search className="size-4" />}>
                    Buscar
                  </Button>
                </div>
              )}
            </Field>
          </form>
        )
      ) : (
        <form onSubmit={submit} className="space-y-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            {!saleId && (
              <Button variant="ghost" size="sm" icon={<ArrowLeft className="size-4" />} onClick={() => setPreview(null)}>
                Outra venda
              </Button>
            )}
            <span className="font-semibold text-slate-900">Venda nº {String(preview.sale.number).padStart(6, '0')}</span>
            <span className="text-slate-500">
              {formatDateTime(preview.sale.occurredAt)} · {formatMoney(preview.sale.total)}
            </span>
            {preview.sale.customer && <Badge tone="blue">{preview.sale.customer.name}</Badge>}
            {preview.sale.status === 'CANCELED' && <Badge tone="red">Cancelada</Badge>}
          </div>
          {!preview.withinDeadline && (
            <p className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-amber-900">
              <AlertTriangle className="size-4 shrink-0" />
              Venda de {preview.daysSinceSale} dias atrás: passou do prazo de troca ({preview.deadlineDays} dias). Só com a liberação do gerente.
            </p>
          )}
          {preview.previousReturns.length > 0 && (
            <p className="text-xs text-slate-500">
              Devoluções anteriores: {preview.previousReturns.map((r) => `nº ${r.number} (${formatMoney(r.total)})`).join(', ')}
            </p>
          )}

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="text-right">Pode devolver</th>
                  <th className="w-36 text-right">Devolver</th>
                  <th className="text-center">Avariado</th>
                </tr>
              </thead>
              <tbody>
                {preview.items.map((item) => {
                  const line = lines[item.saleItemId];
                  const qty = parseDecimal(line?.quantity ?? '', 3);
                  const over = qty > item.returnableQuantity + 0.0005;
                  return (
                    <tr key={item.saleItemId} className={cn(item.returnableQuantity === 0 && 'opacity-50')}>
                      <td>
                        <p className="font-medium text-slate-900">{item.productName}</p>
                        <p className="text-xs text-slate-500">
                          vendido {formatNumber(item.soldQuantity)} {UNIT_SHORT[item.unit]} · pago {formatMoney(item.paidTotal)}
                          {item.returnedQuantity > 0 && ` · já devolvido ${formatNumber(item.returnedQuantity)}`}
                        </p>
                      </td>
                      <td className="text-right tabular-nums">
                        {formatNumber(item.returnableQuantity)} {UNIT_SHORT[item.unit]}
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-1">
                          <Input
                            value={line?.quantity ?? ''}
                            disabled={item.returnableQuantity === 0}
                            inputMode="decimal"
                            onChange={(e) => setLine(item.saleItemId, { quantity: e.target.value })}
                            className="h-8 w-20 text-right"
                            aria-invalid={over}
                            aria-label={`Quantidade a devolver de ${item.productName}`}
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={item.returnableQuantity === 0}
                            onClick={() => setLine(item.saleItemId, { quantity: formatInput(item.returnableQuantity, 3) })}
                          >
                            Tudo
                          </Button>
                        </div>
                      </td>
                      <td className="text-center">
                        <input
                          type="checkbox"
                          checked={line?.damaged ?? false}
                          disabled={item.returnableQuantity === 0}
                          onChange={(e) => setLine(item.saleItemId, { damaged: e.target.checked })}
                          aria-label={`${item.productName} avariado (não volta ao estoque)`}
                          className="size-4 accent-red-600"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500">Avariado: o produto não volta ao estoque e fica registrado como perda.</p>

          <div className="grid gap-2 sm:grid-cols-2">
            {options
              .filter((o) => o.show)
              .map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setMethod(o.value)}
                  className={cn('rounded-lg border px-3 py-2 text-left', method === o.value ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600' : 'border-slate-200 hover:bg-slate-50')}
                >
                  <span className="block font-medium text-slate-900">{o.label}</span>
                  {o.hint && <span className="block text-xs text-slate-500">{o.hint}</span>}
                </button>
              ))}
          </div>
          {method === 'STORE_CREDIT' && sessionId && (
            <Switch checked={exchange} onChange={setExchange} label="Trocar agora por outros produtos" description="O vale entra sozinho como pagamento da próxima venda neste caixa." />
          )}
          <Field label="Motivo">
            {(id) => <Textarea id={id} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Ex.: tamanho errado, defeito, cliente desistiu" className="min-h-14" />}
          </Field>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <p>
              <span className="text-slate-500">Valor a devolver: </span>
              <span className="text-xl font-bold tabular-nums text-slate-900">{formatMoney(estimate)}</span>
              <span className="ml-2 text-xs text-slate-500">({REFUND_METHOD_LABELS[method].toLowerCase()})</span>
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" icon={<Undo2 className="size-4" />} loading={saving} disabled={!selected.length || Boolean(invalid) || preview.sale.status === 'CANCELED'}>
                {exchange && method === 'STORE_CREDIT' ? 'Devolver e trocar' : 'Confirmar devolução'}
              </Button>
            </div>
          </div>
          {invalid && <p className="text-xs font-medium text-red-600">“{invalid.item.productName}”: só dá para devolver {formatNumber(invalid.item.returnableQuantity)}.</p>}
        </form>
      )}
    </Modal>
  );
}
