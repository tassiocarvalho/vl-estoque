import { ArrowLeft, CalendarPlus, CheckCircle2, Link2, PackagePlus, Save, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Badge, Card, CardHeader, ErrorState, LoadingState, PageHeader } from '@/components/ui/Display';
import { Button, IconButton } from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/Form';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDate, formatDateTime, formatInput, formatMoney, formatNumber, parseDecimal, toDateInput, uuid } from '@/lib/format';
import { INVOICE_STATUS_LABELS, PAYABLE_STATUS_LABELS, UNIT_SHORT } from '@/lib/labels';
import { P } from '@/lib/permissions';
import type { Product, PurchaseInvoice, Unit } from '@/lib/types';
import { useAuth } from '../auth/AuthProvider';
import { ProductPickerModal } from '../products/ProductPickerModal';
import { SupplierSelect, type SupplierRef } from '../suppliers/SupplierSelect';
import { useInvoice, useInvoiceMutations, type InvoiceInput } from './api';

interface Row {
  key: string;
  productId: string | null;
  product: { id: string; name: string; sku: string; unit: Unit; salePrice: number } | null;
  supplierCode: string | null;
  description: string;
  barcode: string | null;
  purchaseUnit: string;
  quantity: string;
  factor: string;
  unitCost: string;
  total: string;
}

interface InstallmentRow {
  key: string;
  dueDate: string;
  amount: string;
}

interface FormState {
  supplier: SupplierRef | null;
  documentNumber: string;
  series: string;
  issueDate: string;
  freight: string;
  otherCosts: string;
  discount: string;
  declaredTotal: string;
  notes: string;
  rows: Row[];
  installments: InstallmentRow[];
}

const money = (text: string) => {
  const value = parseDecimal(text, 2);
  return Number.isNaN(value) ? 0 : value;
};
const cents = (value: number) => Math.round(value * 100);

function fromInvoice(invoice: PurchaseInvoice): FormState {
  return {
    supplier: invoice.supplier,
    documentNumber: invoice.documentNumber ?? '',
    series: invoice.series ?? '',
    issueDate: invoice.issueDate ?? '',
    freight: invoice.freight ? formatInput(invoice.freight, 2) : '',
    otherCosts: invoice.otherCosts ? formatInput(invoice.otherCosts, 2) : '',
    discount: invoice.discount ? formatInput(invoice.discount, 2) : '',
    declaredTotal: invoice.declaredTotal !== null ? formatInput(invoice.declaredTotal, 2) : '',
    notes: invoice.notes ?? '',
    rows: invoice.items.map((item) => ({
      key: item.id,
      productId: item.productId,
      product: item.product,
      supplierCode: item.supplierCode,
      description: item.description,
      barcode: item.barcode,
      purchaseUnit: item.purchaseUnit ?? '',
      quantity: formatInput(item.quantity, 3),
      factor: formatInput(item.factor, 3),
      unitCost: formatInput(item.unitCost, 4),
      total: formatInput(item.total, 2),
    })),
    installments: invoice.installments.map((i) => ({ key: uuid(), dueDate: i.dueDate, amount: formatInput(i.amount, 2) })),
  };
}

/** Rateio proporcional com o maior resto (mesma regra da API). */
function allocate(itemCents: number[], amountCents: number): number[] {
  if (!itemCents.length || !amountCents) return itemCents.map(() => 0);
  const base = itemCents.reduce((a, b) => a + b, 0);
  const weights = base > 0 ? itemCents : itemCents.map(() => 1);
  const total = base > 0 ? base : itemCents.length;
  const sign = Math.sign(amountCents);
  const abs = Math.abs(amountCents);
  const exact = weights.map((w) => (abs * w) / total);
  const parts = exact.map(Math.floor);
  let rest = abs - parts.reduce((a, b) => a + b, 0);
  for (const { index } of exact.map((v, index) => ({ index, f: v - Math.floor(v) })).sort((a, b) => b.f - a.f)) {
    if (rest-- <= 0) break;
    parts[index]++;
  }
  return parts.map((p) => p * sign);
}

/** Nota de entrada: conferência dos itens, associação aos produtos, custos e parcelas; depois o lançamento. */
export function InvoiceEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { can } = useAuth();
  const { data: invoice, isLoading, isError, refetch } = useInvoice(id);
  const { update, finalize, remove } = useInvoiceMutations();
  const [form, setForm] = useState<FormState | null>(null);
  const [snapshot, setSnapshot] = useState('');
  const [picker, setPicker] = useState<{ rowKey: string | null; search: string } | null>(null);
  const [confirm, setConfirm] = useState<'finalize' | 'delete' | null>(null);
  const [generator, setGenerator] = useState(false);

  useEffect(() => {
    if (!invoice) return;
    const state = fromInvoice(invoice);
    setForm(state);
    setSnapshot(JSON.stringify(state));
  }, [invoice]);

  const editable = invoice?.status === 'DRAFT' && can(P.PURCHASE_MANAGE) && can(P.STOCK_IN);
  const dirty = form !== null && JSON.stringify(form) !== snapshot;

  const totals = useMemo(() => {
    if (!form) return null;
    const lines = form.rows.map((row) => {
      const quantity = parseDecimal(row.quantity, 3);
      const factor = parseDecimal(row.factor, 3);
      const total = money(row.total);
      return { quantity, factor, total, stockQuantity: Math.round(quantity * factor * 1000) / 1000 };
    });
    const productsCents = lines.reduce((sum, l) => sum + cents(l.total), 0);
    const extraCents = cents(money(form.freight)) + cents(money(form.otherCosts)) - cents(money(form.discount));
    const allocated = allocate(lines.map((l) => cents(l.total)), extraCents);
    const totalCents = productsCents + extraCents;
    const installmentsCents = form.installments.reduce((sum, i) => sum + cents(money(i.amount)), 0);
    const declared = form.declaredTotal.trim() ? money(form.declaredTotal) : null;
    return {
      lines: lines.map((l, index) => ({
        ...l,
        unitCost: l.stockQuantity > 0 ? (cents(l.total) + allocated[index]) / 100 / l.stockQuantity : 0,
      })),
      products: productsCents / 100,
      total: totalCents / 100,
      installments: installmentsCents / 100,
      declared,
      declaredOk: declared === null || Math.abs(cents(declared) - totalCents) <= 1,
      installmentsOk: form.installments.length === 0 || installmentsCents === totalCents,
    };
  }, [form]);

  if (isLoading || (invoice && !form)) return <LoadingState />;
  if (isError || !invoice || !form || !totals) return <ErrorState message="Nota não encontrada" onRetry={refetch} />;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => (f ? { ...f, [key]: value } : f));
  const setRow = (key: string, patch: Partial<Row>) =>
    setForm((f) => (f ? { ...f, rows: f.rows.map((r) => (r.key === key ? { ...r, ...patch } : r)) } : f));

  /** Quantidade ou custo mudou: recalcula o total do item. Total mudou: recalcula o custo unitário. */
  const changeRow = (row: Row, field: 'quantity' | 'unitCost' | 'total' | 'factor', text: string) => {
    const next = { ...row, [field]: text };
    const quantity = parseDecimal(next.quantity, 3);
    if (field === 'quantity' || field === 'unitCost') {
      const unitCost = parseDecimal(next.unitCost, 4);
      if (quantity > 0 && unitCost >= 0) next.total = formatInput(Math.round(quantity * unitCost * 100) / 100, 2);
    } else if (field === 'total') {
      const total = parseDecimal(text, 2);
      if (quantity > 0 && total >= 0) next.unitCost = formatInput(Math.round((total / quantity) * 10000) / 10000, 4);
    }
    setRow(row.key, next);
  };

  const onPick = (product: Product) => {
    if (!picker) return;
    const linked = { id: product.id, name: product.name, sku: product.sku, unit: product.unit, salePrice: product.salePrice };
    if (picker.rowKey) {
      setRow(picker.rowKey, { productId: product.id, product: linked });
    } else {
      const cost = product.lastCost || product.costPrice;
      set('rows', [
        ...form.rows,
        {
          key: uuid(),
          productId: product.id,
          product: linked,
          supplierCode: null,
          description: product.name,
          barcode: product.barcode,
          purchaseUnit: UNIT_SHORT[product.unit].toUpperCase(),
          quantity: '1',
          factor: '1',
          unitCost: formatInput(cost, 4),
          total: formatInput(cost, 2),
        },
      ]);
    }
    setPicker(null);
  };

  const toInput = (): InvoiceInput | string => {
    const items = [];
    for (const [index, row] of form.rows.entries()) {
      const quantity = parseDecimal(row.quantity, 3);
      const factor = parseDecimal(row.factor, 3);
      const unitCost = parseDecimal(row.unitCost, 4);
      const total = parseDecimal(row.total, 2);
      if (!(quantity > 0)) return `Item ${index + 1}: quantidade inválida`;
      if (!(factor > 0)) return `Item ${index + 1}: conversão inválida`;
      if (!(unitCost >= 0) || !(total >= 0)) return `Item ${index + 1}: valor inválido`;
      items.push({
        productId: row.productId,
        supplierCode: row.supplierCode,
        description: row.description.trim().slice(0, 200) || row.product?.name || `Item ${index + 1}`,
        barcode: row.barcode,
        purchaseUnit: row.purchaseUnit.trim().slice(0, 10) || null,
        quantity,
        unitCost,
        total,
        factor,
      });
    }
    const installments = [];
    for (const [index, i] of form.installments.entries()) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(i.dueDate)) return `Parcela ${index + 1}: informe o vencimento`;
      if (!(money(i.amount) > 0)) return `Parcela ${index + 1}: valor inválido`;
      installments.push({ dueDate: i.dueDate, amount: money(i.amount) });
    }
    return {
      supplierId: form.supplier?.id ?? null,
      documentNumber: form.documentNumber.trim() || null,
      series: form.series.trim() || null,
      issueDate: form.issueDate || null,
      freight: money(form.freight),
      otherCosts: money(form.otherCosts),
      discount: money(form.discount),
      declaredTotal: totals.declared,
      notes: form.notes.trim() || null,
      items,
      installments,
    };
  };

  const save = async (quiet = false) => {
    const data = toInput();
    if (typeof data === 'string') {
      toast.error(data);
      return false;
    }
    try {
      await update.mutateAsync({ id: invoice.id, data });
      if (!quiet) toast.success('Rascunho salvo');
      return true;
    } catch (error) {
      toast.error(errorMessage(error));
      return false;
    }
  };

  const doFinalize = async () => {
    if (dirty && !(await save(true))) return setConfirm(null);
    try {
      await finalize.mutateAsync(invoice.id);
      toast.success(`Entrada nº ${invoice.number} lançada`, { description: 'Estoque, custos e contas a pagar atualizados.' });
    } catch (error) {
      toast.error(errorMessage(error));
    }
    setConfirm(null);
  };

  const doDelete = async () => {
    try {
      await remove.mutateAsync(invoice.id);
      toast.success('Rascunho excluído');
      navigate('/notas-entrada');
    } catch (error) {
      toast.error(errorMessage(error));
      setConfirm(null);
    }
  };

  const pendingRows = form.rows.filter((r) => !r.productId).length;
  const supplierLabel = invoice.supplier ? invoice.supplier.tradeName || invoice.supplier.name : null;

  return (
    <>
      <Link to="/notas-entrada" className="no-print mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="size-4" /> Notas de entrada
      </Link>
      <PageHeader
        title={`Entrada nº ${invoice.number}`}
        description={
          invoice.status === 'FINALIZED'
            ? `Lançada em ${formatDateTime(invoice.finalizedAt!)}${invoice.finalizedBy ? ` por ${invoice.finalizedBy.name}` : ''}`
            : invoice.source === 'XML'
              ? 'Importada do XML: confira os itens, associe os que faltam e lance a nota.'
              : 'Digite os itens da nota. Ela só mexe no estoque quando for lançada.'
        }
        actions={
          editable && (
            <>
              <Button variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => setConfirm('delete')}>
                Excluir
              </Button>
              <Button variant="outline" icon={<Save className="size-4" />} loading={update.isPending} disabled={!dirty} onClick={() => void save()}>
                Salvar rascunho
              </Button>
              <Button icon={<CheckCircle2 className="size-4" />} disabled={form.rows.length === 0} onClick={() => setConfirm('finalize')}>
                Lançar nota
              </Button>
            </>
          )
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge tone={invoice.status === 'DRAFT' ? 'amber' : 'green'} dot>
          {INVOICE_STATUS_LABELS[invoice.status]}
        </Badge>
        {invoice.source === 'XML' && <Badge tone="blue">Importada do XML</Badge>}
        {dirty && <Badge tone="orange">Alterações não salvas</Badge>}
        {editable && pendingRows > 0 && <Badge tone="red">{pendingRows} item(ns) sem produto associado</Badge>}
      </div>

      <div className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <Card>
            <CardHeader title="Dados da nota" />
            <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Fornecedor" className="sm:col-span-2">
                {() => <SupplierSelect value={form.supplier} onChange={(s) => set('supplier', s)} disabled={!editable} canCreate={editable} />}
              </Field>
              <Field label="Nº da nota">
                {(fid) => <Input id={fid} value={form.documentNumber} disabled={!editable} onChange={(e) => set('documentNumber', e.target.value)} maxLength={20} />}
              </Field>
              <Field label="Série">
                {(fid) => <Input id={fid} value={form.series} disabled={!editable} onChange={(e) => set('series', e.target.value)} maxLength={5} />}
              </Field>
              <Field label="Emissão">
                {(fid) => <Input id={fid} type="date" value={form.issueDate} disabled={!editable} onChange={(e) => set('issueDate', e.target.value)} />}
              </Field>
              {invoice.accessKey && (
                <Field label="Chave de acesso" className="sm:col-span-2 lg:col-span-3">
                  {(fid) => <Input id={fid} value={invoice.accessKey!.replace(/(\d{4})(?=\d)/g, '$1 ')} disabled className="font-mono text-xs" />}
                </Field>
              )}
              <Field label="Observações" className="sm:col-span-2 lg:col-span-4">
                {(fid) => <Textarea id={fid} value={form.notes} disabled={!editable} onChange={(e) => set('notes', e.target.value)} maxLength={500} className="min-h-12" />}
              </Field>
            </div>
          </Card>
          <Card>
            <CardHeader
              title="Parcelas a pagar"
              actions={
                editable && (
                  <Button size="sm" variant="ghost" icon={<CalendarPlus className="size-4" />} onClick={() => setGenerator(true)}>
                    Gerar
                  </Button>
                )
              }
            />
            <div className="space-y-2 p-5">
              {invoice.status === 'FINALIZED' ? (
                invoice.payables.length ? (
                  <ul className="space-y-1 text-sm">
                    {invoice.payables.map((p) => (
                      <li key={p.id} className="flex justify-between gap-2">
                        <span>
                          {p.installment}/{p.installments} · {formatDate(`${p.dueDate}T12:00:00`)}
                        </span>
                        <span className="tabular-nums">
                          {formatMoney(p.amount)} <span className="text-xs text-slate-500">({PAYABLE_STATUS_LABELS[p.status].toLowerCase()})</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-500">Nota sem parcelas: não gerou contas a pagar.</p>
                )
              ) : form.installments.length === 0 ? (
                <p className="text-sm text-slate-500">Sem parcelas, a nota não gera contas a pagar (ex.: paga à vista).</p>
              ) : (
                form.installments.map((i, index) => (
                  <div key={i.key} className="flex items-center gap-2">
                    <span className="w-5 text-xs text-slate-400">{index + 1}</span>
                    <Input type="date" value={i.dueDate} disabled={!editable} onChange={(e) => set('installments', form.installments.map((x) => (x.key === i.key ? { ...x, dueDate: e.target.value } : x)))} className="h-8" aria-label={`Vencimento da parcela ${index + 1}`} />
                    <Input value={i.amount} disabled={!editable} inputMode="decimal" onChange={(e) => set('installments', form.installments.map((x) => (x.key === i.key ? { ...x, amount: e.target.value } : x)))} className="h-8 w-28 text-right" aria-label={`Valor da parcela ${index + 1}`} />
                    {editable && (
                      <IconButton label="Remover parcela" onClick={() => set('installments', form.installments.filter((x) => x.key !== i.key))}>
                        <Trash2 className="size-4" />
                      </IconButton>
                    )}
                  </div>
                ))
              )}
              {invoice.status === 'DRAFT' && form.installments.length > 0 && (
                <p className={cn('pt-1 text-xs font-medium', totals.installmentsOk ? 'text-emerald-700' : 'text-red-600')}>
                  Soma das parcelas: {formatMoney(totals.installments)}
                  {!totals.installmentsOk && ` (diferente do total ${formatMoney(totals.total)})`}
                </p>
              )}
              {invoice.status === 'FINALIZED' && invoice.payables.length > 0 && (
                <Link to="/contas-a-pagar" className="text-xs font-medium text-brand-700 hover:underline">
                  Ver em Contas a pagar
                </Link>
              )}
            </div>
          </Card>
        </div>
          <Card>
            <CardHeader
              title={`Itens (${form.rows.length})`}
              description="Conversão: quantas unidades do produto vêm em cada unidade da nota (ex.: caixa com 12)."
              actions={
                editable && (
                  <Button size="sm" variant="outline" icon={<PackagePlus className="size-4" />} onClick={() => setPicker({ rowKey: null, search: '' })}>
                    Adicionar produto
                  </Button>
                )
              }
            />
            {form.rows.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-slate-500">Nenhum item. Use “Adicionar produto” ou importe o XML da nota.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="table-base text-sm">
                  <thead>
                    <tr>
                      <th className="w-8">#</th>
                      <th className="min-w-64">Produto do cadastro</th>
                      <th className="min-w-28 text-right">Qtd</th>
                      <th className="min-w-24 text-right">Conversão</th>
                      <th className="min-w-28 text-right">Custo unit.</th>
                      <th className="min-w-28 text-right">Total</th>
                      <th className="min-w-32 text-right">Custo por un.</th>
                      {editable && <th className="w-8" />}
                    </tr>
                  </thead>
                  <tbody>
                    {form.rows.map((row, index) => {
                      const line = totals.lines[index];
                      const margin = row.product && row.product.salePrice > 0 && line.unitCost > 0 ? ((row.product.salePrice - line.unitCost) / row.product.salePrice) * 100 : null;
                      return (
                        <tr key={row.key} className={cn(!row.productId && 'bg-red-50/60')}>
                          <td className="text-slate-400 tabular-nums">{index + 1}</td>
                          <td>
                            {row.product ? (
                              <div className="flex items-start gap-1">
                                <div className="min-w-0">
                                  <p className="font-medium text-slate-900">{row.product.name}</p>
                                  <p className="text-xs text-slate-500">
                                    {row.product.sku}
                                    {row.description !== row.product.name && <> · na nota: {row.description}</>}
                                  </p>
                                </div>
                                {editable && (
                                  <IconButton label="Trocar o produto" className="shrink-0" onClick={() => setPicker({ rowKey: row.key, search: row.barcode ?? '' })}>
                                    <Link2 className="size-4" />
                                  </IconButton>
                                )}
                              </div>
                            ) : (
                              <div>
                                <p className="text-xs text-slate-600">
                                  Na nota: <b>{row.description}</b>
                                  {row.supplierCode && ` · cód. ${row.supplierCode}`}
                                  {row.barcode && ` · EAN ${row.barcode}`}
                                </p>
                                {editable && (
                                  <Button size="sm" variant="danger" className="mt-1" icon={<Link2 className="size-3.5" />} onClick={() => setPicker({ rowKey: row.key, search: row.barcode ?? row.description.split(' ').slice(0, 2).join(' ') })}>
                                    Associar produto
                                  </Button>
                                )}
                              </div>
                            )}
                          </td>
                          <td>
                            <div className="flex items-center gap-1">
                              <Input value={row.quantity} disabled={!editable} inputMode="decimal" onChange={(e) => changeRow(row, 'quantity', e.target.value)} className="h-8 text-right" aria-label={`Quantidade do item ${index + 1}`} />
                              <span className="w-8 text-xs text-slate-500">{row.purchaseUnit}</span>
                            </div>
                          </td>
                          <td>
                            <Input value={row.factor} disabled={!editable} inputMode="decimal" onChange={(e) => changeRow(row, 'factor', e.target.value)} className="h-8 text-right" aria-label={`Conversão do item ${index + 1}`} />
                            {row.product && line.factor !== 1 && line.stockQuantity > 0 && (
                              <p className="mt-0.5 text-right text-[11px] text-slate-500">= {formatNumber(line.stockQuantity)} {UNIT_SHORT[row.product.unit]}</p>
                            )}
                          </td>
                          <td>
                            <Input value={row.unitCost} disabled={!editable} inputMode="decimal" onChange={(e) => changeRow(row, 'unitCost', e.target.value)} className="h-8 text-right" aria-label={`Custo unitário do item ${index + 1}`} />
                          </td>
                          <td>
                            <Input value={row.total} disabled={!editable} inputMode="decimal" onChange={(e) => changeRow(row, 'total', e.target.value)} className="h-8 text-right" aria-label={`Total do item ${index + 1}`} />
                          </td>
                          <td className="text-right tabular-nums">
                            <p className="font-medium text-slate-900">{formatMoney(line.unitCost)}</p>
                            {row.product && (
                              <p className={cn('text-[11px]', margin !== null && margin < 15 ? 'text-red-600' : 'text-slate-500')}>
                                venda {formatMoney(row.product.salePrice)}
                                {margin !== null && ` · ${formatNumber(Math.round(margin * 10) / 10)}%`}
                              </p>
                            )}
                          </td>
                          {editable && (
                            <td>
                              <IconButton label="Remover item" onClick={() => set('rows', form.rows.filter((r) => r.key !== row.key))}>
                                <Trash2 className="size-4" />
                              </IconButton>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="border-t border-slate-100 px-5 py-2 text-xs text-slate-500">
              “Custo por un.” já inclui o frete, as despesas e o desconto rateados; a porcentagem é a margem sobre o preço de venda atual.
            </p>
          </Card>
          <Card>
            <div className="grid items-start gap-4 p-5 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_1.2fr_1.2fr]">
              <div>
                <p className="mb-1.5 text-sm font-medium text-slate-700">Produtos</p>
                <p className="flex h-10 items-center text-lg font-semibold tabular-nums">{formatMoney(totals.products)}</p>
              </div>
              {(['freight', 'otherCosts', 'discount'] as const).map((key) => (
                <Field key={key} label={{ freight: 'Frete (+)', otherCosts: 'Despesas, IPI, ST (+)', discount: 'Desconto (−)' }[key]}>
                  {(fid) => <Input id={fid} value={form[key]} disabled={!editable} inputMode="decimal" placeholder="0,00" onChange={(e) => set(key, e.target.value)} className="text-right" />}
                </Field>
              ))}
              <div>
                <p className="mb-1.5 text-sm font-medium text-slate-700">Total calculado</p>
                <p className="flex h-10 items-center text-2xl font-bold tabular-nums">{formatMoney(totals.total)}</p>
              </div>
              <Field
                label="Total impresso na nota"
                hint={totals.declared === null ? 'Opcional: confere a digitação.' : totals.declaredOk ? '✓ Total da nota confere' : undefined}
                error={totals.declaredOk ? undefined : `Não confere: diferença de ${formatMoney(Math.abs((totals.declared ?? 0) - totals.total))}`}
              >
                {(fid) => <Input id={fid} value={form.declaredTotal} disabled={!editable} inputMode="decimal" onChange={(e) => set('declaredTotal', e.target.value)} className="text-right" aria-invalid={!totals.declaredOk} />}
              </Field>
            </div>
          </Card>
          {invoice.createdBy && (
            <p className="px-1 text-xs text-slate-500">
              Criada por {invoice.createdBy.name} em {formatDateTime(invoice.createdAt)}
              {supplierLabel && ` · ${supplierLabel}`}
            </p>
          )}
      </div>


      <ProductPickerModal
        open={Boolean(picker)}
        title={picker?.rowKey ? 'Associar ao produto do cadastro' : 'Adicionar produto'}
        description={picker?.rowKey ? 'Nas próximas notas deste fornecedor, o item será reconhecido sozinho.' : undefined}
        initialSearch={picker?.search}
        onClose={() => setPicker(null)}
        onSelect={onPick}
      />
      <InstallmentsGenerator
        open={generator}
        total={totals.total}
        onClose={() => setGenerator(false)}
        onGenerate={(list) => {
          set('installments', list);
          setGenerator(false);
        }}
      />
      <ConfirmDialog
        open={confirm === 'finalize'}
        title={`Lançar a entrada nº ${invoice.number}?`}
        tone="primary"
        confirmLabel="Lançar nota"
        loading={finalize.isPending || update.isPending}
        description={
          <ul className="list-disc space-y-1 pl-5">
            <li>
              {form.rows.length} item(ns) entram no estoque e o <b>custo médio</b> de cada produto é recalculado.
            </li>
            <li>{form.installments.length ? `${form.installments.length} parcela(s) vão para Contas a pagar.` : 'Sem parcelas: não gera contas a pagar.'}</li>
            <li>As solicitações de pedido em aberto desses produtos são marcadas como recebidas.</li>
            <li>Depois de lançada, a nota não pode ser alterada.</li>
          </ul>
        }
        onConfirm={() => void doFinalize()}
        onClose={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        title="Excluir este rascunho?"
        description="A nota ainda não mexeu no estoque. O rascunho será apagado."
        confirmLabel="Excluir"
        loading={remove.isPending}
        onConfirm={() => void doDelete()}
        onClose={() => setConfirm(null)}
      />
    </>
  );
}

/** Divide o total em parcelas iguais (diferença de centavos na primeira). */
function InstallmentsGenerator({
  open,
  total,
  onClose,
  onGenerate,
}: {
  open: boolean;
  total: number;
  onClose: () => void;
  onGenerate: (list: InstallmentRow[]) => void;
}) {
  const [count, setCount] = useState('1');
  const [first, setFirst] = useState('');
  const [intervalDays, setIntervalDays] = useState('30');

  useEffect(() => {
    if (open) setFirst(toDateInput(new Date(Date.now() + 28 * 86_400_000)));
  }, [open]);

  const generate = () => {
    const n = Number(count);
    const days = Number(intervalDays);
    if (!Number.isInteger(n) || n < 1 || n > 60) return toast.error('Número de parcelas: de 1 a 60');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(first)) return toast.error('Informe o primeiro vencimento');
    if (!Number.isInteger(days) || days < 1) return toast.error('Intervalo inválido');
    const totalCents = Math.round(total * 100);
    const base = Math.floor(totalCents / n);
    const start = new Date(`${first}T12:00:00Z`).getTime();
    onGenerate(
      Array.from({ length: n }, (_, index) => ({
        key: uuid(),
        dueDate: new Date(start + index * days * 86_400_000).toISOString().slice(0, 10),
        amount: formatInput((index === 0 ? totalCents - base * (n - 1) : base) / 100, 2),
      })),
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Gerar parcelas"
      description={`Total da nota: ${formatMoney(total)}`}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={generate}>Gerar</Button>
        </>
      }
    >
      <div className="grid gap-3">
        <Field label="Número de parcelas">{(id) => <Input id={id} value={count} inputMode="numeric" onChange={(e) => setCount(e.target.value.replace(/\D/g, ''))} autoFocus />}</Field>
        <Field label="Primeiro vencimento">{(id) => <Input id={id} type="date" value={first} onChange={(e) => setFirst(e.target.value)} />}</Field>
        <Field label="Dias entre as parcelas">{(id) => <Input id={id} value={intervalDays} inputMode="numeric" onChange={(e) => setIntervalDays(e.target.value.replace(/\D/g, ''))} />}</Field>
      </div>
    </Modal>
  );
}
