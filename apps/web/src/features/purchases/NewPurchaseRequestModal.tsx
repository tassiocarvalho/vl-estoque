import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Form';
import { Modal } from '@/components/ui/Modal';
import { errorMessage } from '@/lib/api';
import { formatQuantity } from '@/lib/format';
import { UNIT_SHORT } from '@/lib/labels';
import type { Product } from '@/lib/types';
import { useCreatePurchaseRequest } from './api';

/** Solicitação manual de pedido (as automáticas são geradas ao atingir o ponto de pedido). */
export function NewPurchaseRequestModal({ open, product, onClose }: { open: boolean; product: Product; onClose: () => void }) {
  const create = useCreatePurchaseRequest();
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (open) {
      setQuantity('');
      setNote('');
    }
  }, [open]);

  const amount = Number(quantity.replace(',', '.'));
  const valid = Number.isFinite(amount) && amount > 0;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    try {
      await create.mutateAsync({ productId: product.id, quantity: amount, note: note.trim() || undefined });
      toast.success('Solicitação de pedido enviada para a gestão');
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Solicitar pedido"
      description={`${product.name} · saldo atual ${formatQuantity(product.currentStock, product.unit)}`}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="purchase-form" loading={create.isPending} disabled={!valid}>
            Enviar solicitação
          </Button>
        </>
      }
    >
      <form id="purchase-form" onSubmit={submit} className="space-y-4">
        <Field label={`Quantidade a pedir (${UNIT_SHORT[product.unit]})`}>
          {(id) => (
            <Input id={id} inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/[^\d.,]/g, ''))} />
          )}
        </Field>
        <Field label="Observação (opcional)">
          {(id) => <Input id={id} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>
      </form>
    </Modal>
  );
}
