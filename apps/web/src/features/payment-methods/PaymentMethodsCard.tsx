import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button, IconButton } from '@/components/ui/Button';
import { Badge, Card, CardHeader, ErrorState, LoadingState } from '@/components/ui/Display';
import { Field, Input, Select, Switch } from '@/components/ui/Form';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { errorMessage } from '@/lib/api';
import { formatNumber } from '@/lib/format';
import { PAYMENT_KIND_LABELS, PAYMENT_SHORTCUTS } from '@/lib/labels';
import type { PaymentKind, PaymentMethod } from '@/lib/types';
import { useAllPaymentMethods, useDeletePaymentMethod, useSavePaymentMethod, type PaymentMethodInput } from './api';

const KINDS = (Object.keys(PAYMENT_KIND_LABELS) as PaymentKind[]).filter((k) => k !== 'CASH');

/** Formas de pagamento aceitas na loja: aparecem no caixa na ordem definida aqui. */
export function PaymentMethodsCard() {
  const { data, isLoading, isError, refetch } = useAllPaymentMethods();
  const save = useSavePaymentMethod();
  const remove = useDeletePaymentMethod();
  const [editing, setEditing] = useState<PaymentMethod | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deleting, setDeleting] = useState<PaymentMethod | null>(null);

  const methods = data ?? [];
  const activeOrder = methods.filter((m) => m.active).map((m) => m.id);

  /** Troca a posição com o vizinho (as primeiras ganham os atalhos do caixa). */
  const move = async (index: number, delta: number) => {
    const a = methods[index];
    const b = methods[index + delta];
    if (!a || !b) return;
    try {
      await save.mutateAsync({ id: a.id, data: { position: b.position } });
      await save.mutateAsync({ id: b.id, data: { position: a.position === b.position ? a.position + delta : a.position } });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await remove.mutateAsync(deleting.id);
      toast.success('Forma de pagamento excluída');
      setDeleting(null);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <Card className="lg:col-span-2">
      <CardHeader
        title="Formas de pagamento"
        description="As ativas aparecem no caixa nesta ordem. As oito primeiras ganham atalhos (F1–F4, F6–F9)."
        actions={
          <Button
            size="sm"
            icon={<Plus className="size-4" />}
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            Nova forma
          </Button>
        }
      />
      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState message="Não foi possível carregar as formas de pagamento" onRetry={refetch} />
      ) : (
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th className="w-16">Ordem</th>
                <th>Forma</th>
                <th className="hidden md:table-cell">Regras</th>
                <th className="hidden sm:table-cell">Taxa / prazo</th>
                <th className="w-28" />
              </tr>
            </thead>
            <tbody>
              {methods.map((m, index) => {
                const shortcut = m.active ? PAYMENT_SHORTCUTS[activeOrder.indexOf(m.id)] : undefined;
                return (
                  <tr key={m.id} className={m.active ? undefined : 'opacity-55'}>
                    <td>
                      <div className="flex">
                        <IconButton label="Subir" disabled={index === 0} onClick={() => void move(index, -1)}>
                          <ArrowUp className="size-4" />
                        </IconButton>
                        <IconButton label="Descer" disabled={index === methods.length - 1} onClick={() => void move(index, 1)}>
                          <ArrowDown className="size-4" />
                        </IconButton>
                      </div>
                    </td>
                    <td>
                      <p className="flex items-center gap-2 font-medium text-slate-900">
                        {m.name} {shortcut && <kbd className="kbd">{shortcut}</kbd>}
                      </p>
                      <p className="text-xs text-slate-500">{PAYMENT_KIND_LABELS[m.kind]}</p>
                    </td>
                    <td className="hidden md:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {m.active ? <Badge tone="green" dot>Ativa</Badge> : <Badge dot>Desativada</Badge>}
                        {m.kind === 'CASH' && <Badge tone="amber">Entra na gaveta</Badge>}
                        {m.allowsChange && <Badge tone="blue">Dá troco</Badge>}
                        {m.requiresCustomer && <Badge tone="violet">Exige cliente</Badge>}
                      </div>
                    </td>
                    <td className="hidden text-slate-600 sm:table-cell">
                      {m.feePercent > 0 ? `${formatNumber(m.feePercent)}%` : '—'} · {m.settlementDays > 0 ? `D+${m.settlementDays}` : 'na hora'}
                    </td>
                    <td className="text-right whitespace-nowrap">
                      <IconButton
                        label="Editar"
                        onClick={() => {
                          setEditing(m);
                          setFormOpen(true);
                        }}
                      >
                        <Pencil className="size-4" />
                      </IconButton>
                      {!m.system && (
                        <IconButton label="Excluir" onClick={() => setDeleting(m)}>
                          <Trash2 className="size-4" />
                        </IconButton>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <PaymentMethodForm key={editing?.id ?? 'new'} open={formOpen} method={editing} onClose={() => setFormOpen(false)} />
      <ConfirmDialog
        open={Boolean(deleting)}
        title="Excluir forma de pagamento?"
        description={`"${deleting?.name}" será excluída. Se ela já foi usada em vendas, desative-a em vez de excluir.`}
        confirmLabel="Excluir"
        loading={remove.isPending}
        onConfirm={() => void confirmDelete()}
        onClose={() => setDeleting(null)}
      />
    </Card>
  );
}

function PaymentMethodForm({ open, method, onClose }: { open: boolean; method: PaymentMethod | null; onClose: () => void }) {
  const save = useSavePaymentMethod();
  const isCash = method?.kind === 'CASH';
  const [form, setForm] = useState<PaymentMethodInput>({
    name: '',
    kind: 'VOUCHER',
    active: true,
    allowsChange: false,
    requiresCustomer: false,
    feePercent: 0,
    settlementDays: 0,
  });
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!open) return;
    setError(undefined);
    setForm(
      method
        ? {
            name: method.name,
            kind: method.kind,
            active: method.active,
            allowsChange: method.allowsChange,
            requiresCustomer: method.requiresCustomer,
            feePercent: method.feePercent,
            settlementDays: method.settlementDays,
          }
        : { name: '', kind: 'VOUCHER', active: true, allowsChange: false, requiresCustomer: false, feePercent: 0, settlementDays: 0 },
    );
  }, [open, method]);

  const update = <K extends keyof PaymentMethodInput>(key: K, value: PaymentMethodInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (form.name.trim().length < 2) return setError('Informe o nome da forma de pagamento');
    try {
      const data = isCash ? { ...form, kind: undefined, active: undefined } : form;
      await save.mutateAsync({ id: method?.id, data: { ...data, name: form.name.trim() } });
      toast.success(method ? 'Forma de pagamento atualizada' : 'Forma de pagamento criada');
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={method ? `Editar: ${method.name}` : 'Nova forma de pagamento'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="payment-method-form" loading={save.isPending}>
            Salvar
          </Button>
        </>
      }
    >
      <form id="payment-method-form" onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome (aparece no caixa e no comprovante)">
            {(id) => <Input id={id} autoFocus maxLength={40} value={form.name} onChange={(e) => update('name', e.target.value)} />}
          </Field>
          <Field label="Tipo" hint={isCash ? 'O dinheiro é a forma que entra na gaveta.' : undefined}>
            {(id) => (
              <Select id={id} value={form.kind} disabled={isCash} onChange={(e) => update('kind', e.target.value as PaymentKind)}>
                {(isCash ? (['CASH'] as PaymentKind[]) : KINDS).map((k) => (
                  <option key={k} value={k}>
                    {PAYMENT_KIND_LABELS[k]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Taxa da operadora (%)" hint="Usada no fluxo de caixa (próxima etapa).">
            {(id) => (
              <Input id={id} type="number" min={0} max={100} step="0.01" value={form.feePercent} onChange={(e) => update('feePercent', Number(e.target.value))} />
            )}
          </Field>
          <Field label="Prazo de recebimento (dias)" hint="Ex.: crédito D+30. Zero = na hora.">
            {(id) => (
              <Input id={id} type="number" min={0} max={365} value={form.settlementDays} onChange={(e) => update('settlementDays', Number(e.target.value))} />
            )}
          </Field>
        </div>
        <div className="space-y-4 rounded-xl border border-slate-200 p-4">
          {!isCash && (
            <Switch label="Ativa" description="Desativada, não aparece no caixa (o histórico continua)." checked={form.active} onChange={(v) => update('active', v)} />
          )}
          <Switch
            label="Aceita valor maior e dá troco"
            description="Normalmente só o dinheiro. O troco sai sempre da gaveta."
            checked={form.allowsChange}
            onChange={(v) => update('allowsChange', v)}
          />
          <Switch
            label="Exige cliente identificado"
            description="Ex.: crediário. O caixa só aceita a forma com o cliente da venda informado (tecla Ins)."
            checked={form.requiresCustomer}
            onChange={(v) => update('requiresCustomer', v)}
          />
        </div>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      </form>
    </Modal>
  );
}
