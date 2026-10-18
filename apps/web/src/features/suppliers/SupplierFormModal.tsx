import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Field, Input, Switch, Textarea } from '@/components/ui/Form';
import { Modal } from '@/components/ui/Modal';
import { errorMessage } from '@/lib/api';
import { formatDocument, formatPhone, isValidDocument } from '@/lib/document';
import type { Supplier } from '@/lib/types';
import { useSaveSupplier, type SupplierInput } from './api';

interface FormState {
  name: string;
  tradeName: string;
  document: string;
  phone: string;
  email: string;
  contactName: string;
  leadTimeDays: string;
  paymentTerms: string;
  notes: string;
  active: boolean;
}

const EMPTY: FormState = {
  name: '',
  tradeName: '',
  document: '',
  phone: '',
  email: '',
  contactName: '',
  leadTimeDays: '',
  paymentTerms: '',
  notes: '',
  active: true,
};

const fromSupplier = (s: Supplier): FormState => ({
  name: s.name,
  tradeName: s.tradeName ?? '',
  document: formatDocument(s.document),
  phone: formatPhone(s.phone),
  email: s.email ?? '',
  contactName: s.contactName ?? '',
  leadTimeDays: s.leadTimeDays === null ? '' : String(s.leadTimeDays),
  paymentTerms: s.paymentTerms ?? '',
  notes: s.notes ?? '',
  active: s.active,
});

export function SupplierFormModal({
  open,
  supplier,
  onClose,
  onSaved,
}: {
  open: boolean;
  supplier?: Supplier | null;
  onClose: () => void;
  onSaved?: (supplier: Supplier) => void;
}) {
  const save = useSaveSupplier();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!open) return;
    setForm(supplier ? fromSupplier(supplier) : EMPTY);
    setError(undefined);
  }, [open, supplier]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const digits = form.document.replace(/\D/g, '');
  const documentInvalid = digits !== '' && !isValidDocument(digits);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (form.name.trim().length < 2) return setError('Informe a razão social ou o nome');
    if (documentInvalid) return setError('CNPJ/CPF inválido: confira os números');
    const lead = form.leadTimeDays.trim() ? Number(form.leadTimeDays) : null;
    if (lead !== null && (!Number.isInteger(lead) || lead < 0 || lead > 365)) return setError('Prazo de entrega: dias inteiros de 0 a 365');
    const data: SupplierInput = {
      name: form.name.trim(),
      tradeName: form.tradeName.trim() || null,
      document: digits || null,
      phone: form.phone.replace(/\D/g, '') || null,
      email: form.email.trim() || null,
      contactName: form.contactName.trim() || null,
      leadTimeDays: lead,
      paymentTerms: form.paymentTerms.trim() || null,
      notes: form.notes.trim() || null,
      ...(supplier && { active: form.active }),
    };
    try {
      const saved = await save.mutateAsync({ id: supplier?.id, data });
      toast.success(supplier ? 'Fornecedor atualizado' : 'Fornecedor cadastrado');
      onSaved?.(saved);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={supplier ? 'Editar fornecedor' : 'Novo fornecedor'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="supplier-form" loading={save.isPending}>
            Salvar
          </Button>
        </>
      }
    >
      <form id="supplier-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Razão social / nome" className="sm:col-span-2">
          {(id) => <Input id={id} value={form.name} onChange={(e) => update('name', e.target.value)} autoFocus maxLength={120} />}
        </Field>
        <Field label="Nome fantasia">
          {(id) => <Input id={id} value={form.tradeName} onChange={(e) => update('tradeName', e.target.value)} maxLength={120} />}
        </Field>
        <Field label="CNPJ (ou CPF)" error={documentInvalid ? 'CNPJ/CPF inválido' : undefined}>
          {(id) => (
            <Input
              id={id}
              value={form.document}
              inputMode="numeric"
              onChange={(e) => update('document', e.target.value)}
              onBlur={() => digits && update('document', formatDocument(digits))}
              aria-invalid={documentInvalid}
            />
          )}
        </Field>
        <Field label="Telefone / WhatsApp">
          {(id) => <Input id={id} value={form.phone} inputMode="tel" onChange={(e) => update('phone', e.target.value)} onBlur={() => update('phone', formatPhone(form.phone.replace(/\D/g, '')) || form.phone)} />}
        </Field>
        <Field label="E-mail">
          {(id) => <Input id={id} type="email" value={form.email} onChange={(e) => update('email', e.target.value)} maxLength={120} />}
        </Field>
        <Field label="Contato (vendedor)">
          {(id) => <Input id={id} value={form.contactName} onChange={(e) => update('contactName', e.target.value)} maxLength={80} />}
        </Field>
        <Field label="Prazo de entrega (dias)">
          {(id) => <Input id={id} value={form.leadTimeDays} inputMode="numeric" onChange={(e) => update('leadTimeDays', e.target.value.replace(/\D/g, ''))} />}
        </Field>
        <Field label="Condições de pagamento" hint="Ex.: 28 dias, 30/60/90, à vista" className="sm:col-span-2">
          {(id) => <Input id={id} value={form.paymentTerms} onChange={(e) => update('paymentTerms', e.target.value)} maxLength={80} />}
        </Field>
        <Field label="Observações" className="sm:col-span-2">
          {(id) => <Textarea id={id} value={form.notes} onChange={(e) => update('notes', e.target.value)} maxLength={500} />}
        </Field>
        {supplier && (
          <div className="sm:col-span-2">
            <Switch checked={form.active} onChange={(v) => update('active', v)} label="Fornecedor ativo" description="Inativo não aparece para novas notas." />
          </div>
        )}
        {error && <p className="text-sm font-medium text-red-600 sm:col-span-2">{error}</p>}
      </form>
    </Modal>
  );
}
