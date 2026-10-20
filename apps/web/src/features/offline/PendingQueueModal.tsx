import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button, IconButton } from '@/components/ui/Button';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { formatDateTime, formatMoney, formatQuantity } from '@/lib/format';
import { MOVEMENT_LABELS } from '@/lib/labels';
import { useOffline } from './OfflineProvider';

type Discarding = { kind: 'sale' | 'movement'; id: string; label: string };

/**
 * O que está guardado neste aparelho esperando envio: mostra o motivo de cada erro e deixa
 * tentar de novo ou descartar (a venda descartada some de vez: confira antes).
 */
export function PendingQueueModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { online, pending, pendingSales, syncing, sync, discard, discardSale } = useOffline();
  const [discarding, setDiscarding] = useState<Discarding | null>(null);

  const confirmDiscard = async () => {
    if (!discarding) return;
    await (discarding.kind === 'sale' ? discardSale(discarding.id) : discard(discarding.id));
    setDiscarding(null);
  };

  const errorLine = (error?: string) =>
    error ? (
      <p className="mt-1 flex items-start gap-1.5 text-xs font-medium text-red-600">
        <AlertTriangle className="mt-px size-3.5 shrink-0" /> {error}
      </p>
    ) : (
      <p className="mt-1 text-xs text-slate-500">Aguardando envio</p>
    );

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Aguardando envio"
        description="Registros feitos neste aparelho que ainda não chegaram ao servidor."
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={onClose}>
              Fechar
            </Button>
            <Button icon={<RefreshCw className="size-4" />} loading={syncing} disabled={!online} onClick={() => void sync({ retryFailed: true })}>
              Tentar enviar de novo
            </Button>
          </>
        }
      >
        {pendingSales.length + pending.length === 0 ? (
          <p className="text-sm text-slate-600">Tudo enviado.</p>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200">
            {pendingSales.map((sale) => (
              <li key={sale.id} className="flex items-start gap-3 px-3 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900">
                    Venda de {formatMoney(sale.total)} · {sale.payload.items.length} item(ns)
                  </p>
                  <p className="text-xs text-slate-500">Feita em {formatDateTime(sale.payload.occurredAt)}</p>
                  {errorLine(sale.error)}
                </div>
                <IconButton
                  label="Descartar venda"
                  onClick={() => setDiscarding({ kind: 'sale', id: sale.id, label: `a venda de ${formatMoney(sale.total)}` })}
                >
                  <Trash2 className="size-4" />
                </IconButton>
              </li>
            ))}
            {pending.map((item) => (
              <li key={item.id} className="flex items-start gap-3 px-3 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900">
                    {MOVEMENT_LABELS[item.payload.type]}: {item.productName} · {formatQuantity(item.payload.quantity, item.unit)}
                  </p>
                  <p className="text-xs text-slate-500">Registrada em {formatDateTime(item.payload.occurredAt)}</p>
                  {errorLine(item.error)}
                </div>
                <IconButton
                  label="Descartar movimentação"
                  onClick={() => setDiscarding({ kind: 'movement', id: item.id, label: `a movimentação de ${item.productName}` })}
                >
                  <Trash2 className="size-4" />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
      </Modal>
      <ConfirmDialog
        open={Boolean(discarding)}
        title="Descartar?"
        description={<>Descartar {discarding?.label}? Ela é apagada deste aparelho e não será enviada. Isso não pode ser desfeito.</>}
        confirmLabel="Descartar"
        onConfirm={() => void confirmDiscard()}
        onClose={() => setDiscarding(null)}
      />
    </>
  );
}
