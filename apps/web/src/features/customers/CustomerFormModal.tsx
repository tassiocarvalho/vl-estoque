import { ShieldCheck } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Switch, Textarea } from '@/components/ui/Form';
import { Modal } from '@/components/ui/Modal';
import { errorMessage } from '@/lib/api';
import { formatDocument, formatPhone, isValidDocument } from '@/lib/document';
import type { Customer } from '@/lib/types';
import { useSaveCustomer, type CustomerInput } from './api';

const CHANNELS = [
  ['balcao', 'No balcão (presencial)'],
  ['telefone', 'Por telefone / WhatsApp'],
  ['online', 'Online'],
  ['outro', 'Outro'],
] as const;

interface FormState {
  name: string;
  document: string;
  phone: string;
  email: string;
  birthDate: string;
  address: string;
  notes: string;
  consent: boolean;
  consentChannel: string;
  marketingConsent: boolean;
}

const EMPTY: FormState = {
  name: '',
  document: '',
  phone: '',
  email: '',
  birthDate: '',
  address: '',
  notes: '',
  consent: false,
  consentChannel: 'balcao',
  marketingConsent: false,
};

const fromCustomer = (c: Customer): FormState => ({
  name: c.name,
  document: formatDocument(c.document),
  phone: formatPhone(c.phone),
  email: c.email ?? '',
  birthDate: c.birthDate ? c.birthDate.slice(0, 10) : '',
  address: c.address ?? '',
  notes: c.notes ?? '',
  consent: Boolean(c.consentAt),
  consentChannel: c.consentChannel ?? 'balcao',
  marketingConsent: c.marketingConsent,
});

/**
 * Cadastro de cliente. No caixa ("quick"), mostra só o essencial: nome, CPF/CNPJ, telefone e o consentimento.
 * LGPD: dados pessoais além do nome só com a autorização do cliente registrada.
 */
export function CustomerFormModal({
  open,
  customer,
  quick = false,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  customer?: Customer | null;
  quick?: boolean;
  /** Pré-preenche (ex.: o que foi digitado na busca do caixa). */
  initial?: Partial<FormState>;
  onClose: () => void;
  onSaved?: (customer: Customer) => void;
}) {
  const save = useSaveCustomer();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!open) return;
    setForm(customer ? fromCustomer(customer) : { ...EMPTY, ...initial });
    setError(undefined);
  }, [open, customer]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const documentDigits = form.document.replace(/\D/g, '');
  const documentInvalid = documentDigits !== '' && !isValidDocument(documentDigits);
  const hasPersonalData = Boolean(documentDigits || form.phone.trim() || form.email.trim() || form.birthDate || form.address.trim());
  const needsConsent = hasPersonalData && !form.consent;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (form.name.trim().length < 2) return setError('Informe o nome do cliente');
    if (documentInvalid) return setError('CPF/CNPJ inválido: confira os números');
    if (needsConsent) return setError('Marque a autorização do cliente para guardar os dados pessoais (LGPD)');
    const data: CustomerInput = {
      name: form.name.trim(),
      document: documentDigits || null,
      phone: form.phone.replace(/\D/g, '') || null,
      email: form.email.trim() || null,
      birthDate: form.birthDate || null,
      address: form.address.trim() || null,
      notes: form.notes.trim() || null,
      consent: form.consent,
      consentChannel: form.consentChannel,
      marketingConsent: form.marketingConsent,
    };
    try {
      const saved = await save.mutateAsync({ id: customer?.id, data });
      toast.success(customer ? 'Cliente atualizado' : 'Cliente cadastrado');
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
      size={quick ? 'md' : 'lg'}
      title={customer ? 'Editar cliente' : quick ? 'Cadastro rápido de cliente' : 'Novo cliente'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="customer-form" loading={save.isPending}>
            {customer ? 'Salvar' : 'Cadastrar'}
          </Button>
        </>
      }
    >
      <form id="customer-form" onSubmit={submit} noValidate className="space-y-4">
        <div className={quick ? 'space-y-4' : 'grid gap-4 sm:grid-cols-2'}>
          <Field label="Nome" className={quick ? undefined : 'sm:col-span-2'}>
            {(id) => <Input id={id} autoFocus maxLength={120} value={form.name} onChange={(e) => update('name', e.target.value)} />}
          </Field>
          <Field label="CPF ou CNPJ" error={documentInvalid ? 'CPF/CNPJ inválido' : undefined}>
            {(id) => (
              <Input
                id={id}
                inputMode="numeric"
                maxLength={18}
                value={form.document}
                onChange={(e) => update('document', e.target.value.replace(/[^\d./-]/g, ''))}
                onBlur={() => update('document', formatDocument(documentDigits) || form.document)}
                aria-invalid={documentInvalid}
              />
            )}
          </Field>
          <Field label="Telefone / WhatsApp">
            {(id) => (
              <Input
                id={id}
                inputMode="tel"
                maxLength={16}
                value={form.phone}
                onChange={(e) => update('phone', e.target.value.replace(/[^\d() -]/g, ''))}
                onBlur={() => update('phone', formatPhone(form.phone) || form.phone)}
              />
            )}
          </Field>
          {!quick && (
            <>
              <Field label="E-mail">
                {(id) => <Input id={id} type="email" maxLength={120} value={form.email} onChange={(e) => update('email', e.target.value)} />}
              </Field>
              <Field label="Data de nascimento">
                {(id) => <Input id={id} type="date" value={form.birthDate} onChange={(e) => update('birthDate', e.target.value)} />}
              </Field>
              <Field label="Endereço" className="sm:col-span-2">
                {(id) => <Input id={id} maxLength={200} value={form.address} onChange={(e) => update('address', e.target.value)} />}
              </Field>
              <Field label="Observações" className="sm:col-span-2">
                {(id) => <Textarea id={id} maxLength={500} value={form.notes} onChange={(e) => update('notes', e.target.value)} />}
              </Field>
            </>
          )}
        </div>

        <div className={`space-y-3 rounded-xl border p-4 ${needsConsent ? 'border-amber-300 bg-amber-50' : 'border-slate-200'}`}>
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <ShieldCheck className="size-4 text-brand-700" /> Privacidade (LGPD)
          </p>
          <Switch
            label="O cliente autorizou o cadastro dos dados pessoais"
            description="Obrigatório para guardar CPF, telefone, e-mail, endereço ou nascimento. Usados só para a identificação nas compras."
            checked={form.consent}
            onChange={(checked) => update('consent', checked)}
          />
          {form.consent && (
            <Field label="Como autorizou">
              {(id) => (
                <Select id={id} value={form.consentChannel} onChange={(e) => update('consentChannel', e.target.value)}>
                  {CHANNELS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
          {!quick && (
            <Switch
              label="Aceita receber ofertas e novidades"
              description="Consentimento separado, para comunicação de marketing."
              checked={form.marketingConsent}
              onChange={(checked) => update('marketingConsent', checked)}
            />
          )}
        </div>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      </form>
    </Modal>
  );
}
