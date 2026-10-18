import { AlertTriangle, CalendarClock, CalendarDays, CheckCircle2, FolderCog, Paperclip, Pencil, Plus, Search, Undo2, Wallet, XCircle } from 'lucide-react';
import { useDeferredValue, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Badge, Card, EmptyState, ErrorState, LoadingState, PageHeader, Pagination, StatCard, Tabs } from '@/components/ui/Display';
import { Button, IconButton } from '@/components/ui/Button';
import { Field, Input, Select, Switch, Textarea } from '@/components/ui/Form';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDate, formatInput, formatMoney, parseDecimal, toDateInput } from '@/lib/format';
import { PAYABLE_STATUS_LABELS } from '@/lib/labels';
import { P } from '@/lib/permissions';
import type { Payable } from '@/lib/types';
import { useAuth } from '../auth/AuthProvider';
import { SupplierSelect, type SupplierRef } from '../suppliers/SupplierSelect';
import { fileToBase64, openAttachment, useExpenseCategories, usePayableMutations, usePayables, type PayableFilters } from './api';

type StatusTab = NonNullable<PayableFilters['status']>;
type DueFilter = NonNullable<PayableFilters['due']> | '';

const STATUS_TONE = { OPEN: 'amber', PAID: 'green', CANCELED: 'neutral' } as const;
const PAYMENT_METHODS = ['PIX', 'Boleto', 'Transferência', 'Dinheiro', 'Cartão de crédito', 'Cartão de débito', 'Débito automático', 'Cheque'];
const day = (iso: string) => formatDate(`${iso}T12:00:00`);

/** Contas a pagar (RF24): agenda de vencimentos, baixa com forma de pagamento e comprovante anexado. */
export function PayablesPage() {
  const { can } = useAuth();
  const canManage = can(P.FINANCE_MANAGE);
  const [status, setStatus] = useState<StatusTab>('open');
  const [due, setDue] = useState<DueFilter>('');
  const [categoryId, setCategoryId] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const deferred = useDeferredValue(search.trim());
  const { data, isLoading, isError, refetch } = usePayables({
    status,
    due: status === 'open' && due ? due : undefined,
    categoryId: categoryId || undefined,
    search: deferred || undefined,
    page,
    pageSize: 20,
  });
  const { data: categories = [] } = useExpenseCategories(true);
  const mutations = usePayableMutations();
  const [form, setForm] = useState<{ open: boolean; payable: Payable | null }>({ open: false, payable: null });
  const [paying, setPaying] = useState<Payable | null>(null);
  const [canceling, setCanceling] = useState<Payable | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const attachTarget = useRef<Payable | null>(null);

  const filterDue = (value: DueFilter) => {
    setStatus('open');
    setDue(value);
    setPage(1);
  };

  const onAttach = async (file: File | undefined) => {
    const target = attachTarget.current;
    if (!file || !target) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('O comprovante deve ter até 2 MB');
      await mutations.attach.mutateAsync({ id: target.id, file: { name: file.name, type: file.type, data: await fileToBase64(file) } });
      toast.success('Comprovante anexado');
    } catch (error) {
      toast.error(error instanceof Error && !('status' in error) ? error.message : errorMessage(error));
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const summary = data?.summary;

  return (
    <>
      <PageHeader
        title="Contas a pagar"
        description="Fornecedores, aluguel, energia, salários: tudo o que a loja tem a pagar, com vencimento e comprovante."
        actions={
          canManage && (
            <>
              <Button variant="ghost" icon={<FolderCog className="size-4" />} onClick={() => setCategoriesOpen(true)}>
                Categorias
              </Button>
              <Button icon={<Plus className="size-4" />} onClick={() => setForm({ open: true, payable: null })}>
                Nova conta
              </Button>
            </>
          )
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Vencidas" value={formatMoney(summary?.overdue.amount ?? 0)} hint={`${summary?.overdue.count ?? 0} conta(s)`} icon={<AlertTriangle className="size-5" />} tone={summary?.overdue.count ? 'red' : 'neutral'} onClick={() => filterDue('overdue')} />
        <StatCard label="Vencem hoje" value={formatMoney(summary?.today.amount ?? 0)} hint={`${summary?.today.count ?? 0} conta(s)`} icon={<CalendarClock className="size-5" />} tone={summary?.today.count ? 'amber' : 'neutral'} onClick={() => filterDue('today')} />
        <StatCard label="Próximos 7 dias" value={formatMoney(summary?.next7.amount ?? 0)} hint={`${summary?.next7.count ?? 0} conta(s)`} icon={<CalendarDays className="size-5" />} tone="blue" onClick={() => filterDue('week')} />
        <StatCard label="Total em aberto" value={formatMoney(summary?.open.amount ?? 0)} hint={`${summary?.open.count ?? 0} conta(s)`} icon={<Wallet className="size-5" />} onClick={() => filterDue('')} />
      </div>

      <div className="no-print mb-4 flex flex-wrap items-center gap-3">
        <Tabs
          value={status}
          onChange={(value) => {
            setStatus(value);
            setDue('');
            setPage(1);
          }}
          options={[
            { value: 'open', label: 'Em aberto' },
            { value: 'paid', label: 'Pagas' },
            { value: 'canceled', label: 'Canceladas' },
            { value: 'all', label: 'Todas' },
          ]}
        />
        {status === 'open' && (
          <Tabs
            value={due}
            onChange={(value) => {
              setDue(value);
              setPage(1);
            }}
            options={[
              { value: '', label: 'Qualquer vencimento' },
              { value: 'overdue', label: 'Vencidas' },
              { value: 'today', label: 'Hoje' },
              { value: 'week', label: '7 dias' },
              { value: 'month', label: '30 dias' },
            ]}
          />
        )}
        <div className="w-56">
        <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Filtrar por categoria">
          <option value="">Todas as categorias</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        </div>
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Descrição, documento ou fornecedor"
            className="pl-9"
            aria-label="Buscar conta"
          />
        </div>
      </div>

      <input ref={fileRef} type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => void onAttach(e.target.files?.[0])} />

      <Card>
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message="Não foi possível carregar as contas" onRetry={refetch} />
        ) : !data?.items.length ? (
          <EmptyState title="Nenhuma conta aqui" description="As parcelas das notas de entrada aparecem sozinhas. Use “Nova conta” para aluguel, energia e outras despesas." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>{status === 'paid' ? 'Pagamento' : 'Vencimento'}</th>
                    <th>Conta</th>
                    <th className="text-right">Valor</th>
                    <th>Situação</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((p) => (
                    <tr key={p.id}>
                      <td className="whitespace-nowrap tabular-nums">
                        <span className={cn(p.overdue && 'font-semibold text-red-700')}>{day(status === 'paid' && p.paidAt ? p.paidAt : p.dueDate)}</span>
                        {status === 'paid' && <p className="text-xs text-slate-500">venc. {day(p.dueDate)}</p>}
                      </td>
                      <td>
                        <p className="font-medium text-slate-900">
                          {p.description}
                          {p.installments > 1 && <span className="ml-1 text-xs font-normal text-slate-500">({p.installment}/{p.installments})</span>}
                        </p>
                        <p className="text-xs text-slate-500">
                          {[
                            p.category.name,
                            p.supplier && (p.supplier.tradeName || p.supplier.name),
                            p.documentNumber && `doc. ${p.documentNumber}`,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                          {p.invoice && (
                            <>
                              {' · '}
                              <Link to={`/notas-entrada/${p.invoice.id}`} className="text-brand-700 hover:underline">
                                entrada nº {p.invoice.number}
                              </Link>
                            </>
                          )}
                        </p>
                      </td>
                      <td className="text-right tabular-nums">
                        <p className="font-semibold text-slate-900">{formatMoney(p.amount)}</p>
                        {p.paidAmount !== null && p.paidAmount !== p.amount && <p className="text-xs text-slate-500">pago {formatMoney(p.paidAmount)}</p>}
                      </td>
                      <td>
                        <Badge tone={p.overdue ? 'red' : STATUS_TONE[p.status]} dot>
                          {p.overdue ? 'Vencida' : PAYABLE_STATUS_LABELS[p.status]}
                        </Badge>
                        {p.paymentMethodName && <p className="mt-0.5 text-xs text-slate-500">{p.paymentMethodName}</p>}
                      </td>
                      <td className="text-right whitespace-nowrap">
                        {canManage && p.status === 'OPEN' && (
                          <>
                            <Button size="sm" variant="secondary" icon={<CheckCircle2 className="size-3.5" />} onClick={() => setPaying(p)}>
                              Pagar
                            </Button>
                            <IconButton label="Editar" onClick={() => setForm({ open: true, payable: p })}>
                              <Pencil className="size-4" />
                            </IconButton>
                            <IconButton label="Cancelar conta" onClick={() => setCanceling(p)}>
                              <XCircle className="size-4" />
                            </IconButton>
                          </>
                        )}
                        {canManage && p.status !== 'CANCELED' && !p.hasAttachment && (
                          <IconButton
                            label="Anexar comprovante (PDF ou imagem)"
                            onClick={() => {
                              attachTarget.current = p;
                              fileRef.current?.click();
                            }}
                          >
                            <Paperclip className="size-4" />
                          </IconButton>
                        )}
                        {p.hasAttachment && (
                          <IconButton label={`Ver comprovante (${p.attachmentName})`} onClick={() => void openAttachment(p.id).catch((e: Error) => toast.error(e.message))}>
                            <Paperclip className="size-4 text-brand-700" />
                          </IconButton>
                        )}
                        {canManage && p.status === 'PAID' && (
                          <IconButton
                            label="Desfazer pagamento"
                            onClick={() =>
                              mutations.reopen.mutate(p.id, {
                                onSuccess: () => toast.success('Pagamento desfeito'),
                                onError: (e) => toast.error(errorMessage(e)),
                              })
                            }
                          >
                            <Undo2 className="size-4" />
                          </IconButton>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={20} total={data.total} onChange={setPage} />
          </>
        )}
      </Card>

      <PayableFormModal open={form.open} payable={form.payable} onClose={() => setForm({ open: false, payable: null })} />
      <PayModal payable={paying} onClose={() => setPaying(null)} />
      <CategoriesModal open={categoriesOpen} onClose={() => setCategoriesOpen(false)} />
      <ConfirmDialog
        open={Boolean(canceling)}
        title="Cancelar esta conta?"
        description={canceling && `${canceling.description} · ${formatMoney(canceling.amount)} · vence em ${day(canceling.dueDate)}. Ela sai da agenda e do fluxo de caixa.`}
        confirmLabel="Cancelar conta"
        loading={mutations.cancel.isPending}
        onClose={() => setCanceling(null)}
        onConfirm={() =>
          canceling &&
          mutations.cancel.mutate(canceling.id, {
            onSuccess: () => {
              toast.success('Conta cancelada');
              setCanceling(null);
            },
            onError: (e) => toast.error(errorMessage(e)),
          })
        }
      />
    </>
  );
}

function PayableFormModal({ open, payable, onClose }: { open: boolean; payable: Payable | null; onClose: () => void }) {
  const { data: categories = [] } = useExpenseCategories();
  const { create, update } = usePayableMutations();
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [supplier, setSupplier] = useState<SupplierRef | null>(null);
  const [documentNumber, setDocumentNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [installments, setInstallments] = useState('1');
  const [recurring, setRecurring] = useState(false);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!open) return;
    setDescription(payable?.description ?? '');
    setCategoryId(payable?.category.id ?? '');
    setSupplier(payable?.supplier ?? null);
    setDocumentNumber(payable?.documentNumber ?? '');
    setAmount(payable ? formatInput(payable.amount, 2) : '');
    setDueDate(payable?.dueDate ?? toDateInput(new Date()));
    setInstallments('1');
    setRecurring(false);
    setNotes(payable?.notes ?? '');
    setError(undefined);
  }, [open, payable]);

  const value = parseDecimal(amount, 2);
  const count = Number(installments) || 1;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (description.trim().length < 2) return setError('Descreva a conta');
    if (!categoryId) return setError('Escolha a categoria');
    if (!(value > 0)) return setError('Informe o valor');
    if (!dueDate) return setError('Informe o vencimento');
    if (!Number.isInteger(count) || count < 1 || count > 60) return setError('Parcelas: de 1 a 60');
    const data = {
      description: description.trim(),
      categoryId,
      supplierId: supplier?.id ?? null,
      documentNumber: documentNumber.trim() || null,
      notes: notes.trim() || null,
      dueDate,
    };
    try {
      if (payable) {
        await update.mutateAsync({ id: payable.id, data: { ...data, amount: value } });
        toast.success('Conta atualizada');
      } else {
        // Conta fixa (aluguel, internet): o mesmo valor todo mês. Parcelado: o valor total é dividido.
        const total = recurring ? Math.round(value * count * 100) / 100 : value;
        await create.mutateAsync({ ...data, amount: total, installments: count, intervalDays: 30 });
        toast.success(count > 1 ? `${count} parcelas lançadas` : 'Conta lançada');
      }
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={payable ? 'Editar conta' : 'Nova conta a pagar'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="payable-form" loading={create.isPending || update.isPending}>
            Salvar
          </Button>
        </>
      }
    >
      <form id="payable-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Descrição" className="sm:col-span-2">
          {(id) => <Input id={id} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Aluguel da loja, conta de luz" autoFocus maxLength={200} />}
        </Field>
        <Field label="Categoria">
          {(id) => (
            <Select id={id} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Escolha…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Fornecedor (opcional)">{() => <SupplierSelect value={supplier} onChange={setSupplier} />}</Field>
        <Field label={payable || count === 1 ? 'Valor' : recurring ? 'Valor de cada mês' : 'Valor total (dividido nas parcelas)'}>
          {(id) => <Input id={id} value={amount} inputMode="decimal" placeholder="0,00" onChange={(e) => setAmount(e.target.value)} />}
        </Field>
        <Field label={payable || count === 1 ? 'Vencimento' : '1º vencimento'}>{(id) => <Input id={id} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />}</Field>
        {!payable && (
          <>
            <Field label="Repetir / parcelar em" hint="Vencimentos a cada 30 dias">
              {(id) => (
                <Select id={id} value={installments} onChange={(e) => setInstallments(e.target.value)}>
                  {[1, 2, 3, 4, 5, 6, 10, 12, 18, 24].map((n) => (
                    <option key={n} value={n}>
                      {n === 1 ? 'Só esta vez' : `${n} vezes`}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            {count > 1 && (
              <div className="flex items-end">
                <Switch checked={recurring} onChange={setRecurring} label="Conta fixa mensal" description="Mesmo valor todo mês (ex.: aluguel)" />
              </div>
            )}
          </>
        )}
        <Field label="Nº do documento (boleto, fatura)">{(id) => <Input id={id} value={documentNumber} onChange={(e) => setDocumentNumber(e.target.value)} maxLength={40} />}</Field>
        <Field label="Observações" className="sm:col-span-2">{(id) => <Textarea id={id} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} className="min-h-14" />}</Field>
        {!payable && count > 1 && value > 0 && (
          <p className="text-sm text-slate-600 sm:col-span-2">
            {count} parcelas de {formatMoney(recurring ? value : Math.floor((value * 100) / count) / 100)} · total {formatMoney(recurring ? value * count : value)}
          </p>
        )}
        {error && <p className="text-sm font-medium text-red-600 sm:col-span-2">{error}</p>}
      </form>
    </Modal>
  );
}

function PayModal({ payable, onClose }: { payable: Payable | null; onClose: () => void }) {
  const { pay } = usePayableMutations();
  const [paidAt, setPaidAt] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('PIX');

  useEffect(() => {
    if (!payable) return;
    setPaidAt(toDateInput(new Date()));
    setAmount(formatInput(payable.amount, 2));
    setMethod('PIX');
  }, [payable]);

  const value = parseDecimal(amount, 2);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!payable || !(value > 0) || !paidAt) return;
    try {
      await pay.mutateAsync({ id: payable.id, data: { paidAt, paidAmount: value, paymentMethodName: method.trim() || 'Outro' } });
      toast.success('Pagamento registrado');
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const difference = payable ? Math.round((value - payable.amount) * 100) / 100 : 0;

  return (
    <Modal
      open={Boolean(payable)}
      onClose={onClose}
      title="Registrar pagamento"
      description={payable ? `${payable.description} · vence em ${day(payable.dueDate)}` : undefined}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="pay-form" loading={pay.isPending}>
            Confirmar pagamento
          </Button>
        </>
      }
    >
      <form id="pay-form" onSubmit={submit} className="grid gap-3">
        <Field label="Data do pagamento">{(id) => <Input id={id} type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />}</Field>
        <Field
          label="Valor pago"
          hint={difference > 0 ? `Inclui ${formatMoney(difference)} de juros/multa` : difference < 0 ? `Desconto de ${formatMoney(-difference)}` : undefined}
        >
          {(id) => <Input id={id} value={amount} inputMode="decimal" onChange={(e) => setAmount(e.target.value)} autoFocus />}
        </Field>
        <Field label="Forma de pagamento">
          {(id) => (
            <>
              <Input id={id} list="payment-methods" value={method} onChange={(e) => setMethod(e.target.value)} maxLength={40} />
              <datalist id="payment-methods">
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </>
          )}
        </Field>
      </form>
    </Modal>
  );
}

function CategoriesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: categories = [] } = useExpenseCategories(true);
  const { createCategory, updateCategory } = usePayableMutations();
  const [name, setName] = useState('');

  const add = async (event: FormEvent) => {
    event.preventDefault();
    if (name.trim().length < 2) return;
    try {
      await createCategory.mutateAsync(name.trim());
      setName('');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Categorias de despesa" description="Agrupam as contas no resultado do mês." size="sm">
      <form onSubmit={add} className="mb-4 flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nova categoria" maxLength={60} aria-label="Nova categoria" />
        <Button type="submit" loading={createCategory.isPending}>
          Criar
        </Button>
      </form>
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {categories.map((c) => (
          <li key={c.id} className="px-3 py-2">
            <Switch
              checked={c.active}
              disabled={Boolean(c.code)}
              onChange={(active) => updateCategory.mutate({ id: c.id, data: { active } }, { onError: (e) => toast.error(errorMessage(e)) })}
              label={c.name}
              description={c.code ? 'Usada pelas notas de entrada (vira custo, não despesa)' : undefined}
            />
          </li>
        ))}
      </ul>
    </Modal>
  );
}
