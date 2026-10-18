import { zodResolver } from '@hookform/resolvers/zod';
import { Calculator } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Switch } from '@/components/ui/Form';
import { Modal } from '@/components/ui/Modal';
import { errorMessage, isCanceled } from '@/lib/api';
import { formatDecimal, formatMoney, formatNumber, parseMoney } from '@/lib/format';
import { UNIT_LABELS, UNIT_SHORT } from '@/lib/labels';
import type { Product, Unit } from '@/lib/types';
import { previewIndicators, useSaveProduct } from './api';
import { CategorySelect } from './CategorySelect';

/** Campo numérico: vazio é tratado como "não informado" (e não como zero). */
const emptyToUndefined = (value: unknown) => (value === '' || value === null ? undefined : value);
const quantity = (message: string) =>
  z.preprocess(
    emptyToUndefined,
    z.coerce.number({ invalid_type_error: message }).min(0, 'Não pode ser negativo').max(1_000_000, 'Valor muito alto').optional(),
  );

/** Preço em reais: aceita "12,90", "1.234,56" ou "12.90". Vazio = não informado. */
const money = z.preprocess(
  (value) => (typeof value === 'string' ? (value.trim() === '' ? undefined : parseMoney(value)) : value),
  z.number({ invalid_type_error: 'Valor inválido' }).min(0, 'Não pode ser negativo').max(1_000_000, 'Valor muito alto').optional(),
);

const schema = z
  .object({
    name: z.string().trim().min(2, 'Informe o nome do produto').max(120),
    sku: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9._-]{1,40}$/, 'Use letras, números, ponto, hífen ou _ (sem espaços)'),
    barcode: z
      .string()
      .trim()
      .regex(/^(\d{8,14})?$/, 'O código de barras deve ter de 8 a 14 números'),
    categoryId: z.string().min(1, 'Selecione a categoria'),
    unit: z.enum(Object.keys(UNIT_LABELS) as [Unit, ...Unit[]]),
    replenishmentEnabled: z.boolean(),
    avgDailyConsumption: quantity('Informe o consumo médio'),
    maxDailyConsumption: quantity('Informe o consumo máximo'),
    leadTimeDays: z.preprocess(
      emptyToUndefined,
      z.coerce.number({ invalid_type_error: 'Informe o prazo' }).int('Use dias inteiros').min(0).max(365).optional(),
    ),
    initialStock: z.preprocess(emptyToUndefined, z.coerce.number().min(0, 'Não pode ser negativo').optional()),
    costPrice: money,
    salePrice: money,
  })
  // Consumo e prazo só são obrigatórios com "Controlar consumo e reposição" ligado.
  .superRefine((data, ctx) => {
    if (!data.replenishmentEnabled) return;
    const required = [
      ['avgDailyConsumption', 'Informe o consumo médio'],
      ['maxDailyConsumption', 'Informe o consumo máximo'],
      ['leadTimeDays', 'Informe o prazo'],
    ] as const;
    for (const [path, message] of required) {
      if (data[path] === undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
    }
    if ((data.maxDailyConsumption ?? 0) < (data.avgDailyConsumption ?? 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['maxDailyConsumption'], message: 'Deve ser maior ou igual ao consumo médio' });
    }
  });

type FormInput = z.input<typeof schema>;
type FormOutput = z.output<typeof schema>;

const EMPTY: FormInput = {
  name: '',
  sku: '',
  barcode: '',
  categoryId: '',
  unit: 'UN',
  replenishmentEnabled: true,
  avgDailyConsumption: '' as unknown as number,
  maxDailyConsumption: '' as unknown as number,
  leadTimeDays: '' as unknown as number,
  initialStock: '' as unknown as number,
  costPrice: '' as unknown as number,
  salePrice: '' as unknown as number,
};

interface ProductFormModalProps {
  open: boolean;
  product?: Product | null;
  onClose: () => void;
  onSaved?: (product: Product) => void;
}

export function ProductFormModal({ open, product, onClose, onSaved }: ProductFormModalProps) {
  const editing = Boolean(product);
  const save = useSaveProduct();
  const { register, handleSubmit, reset, watch, setValue, formState } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY,
  });
  const { errors } = formState;

  useEffect(() => {
    if (!open) return;
    reset(
      product
        ? {
            name: product.name,
            sku: product.sku,
            barcode: product.barcode ?? '',
            categoryId: product.category.id,
            unit: product.unit,
            replenishmentEnabled: product.replenishmentEnabled,
            avgDailyConsumption: product.avgDailyConsumption,
            maxDailyConsumption: product.maxDailyConsumption,
            leadTimeDays: product.leadTimeDays,
            costPrice: product.costPrice ? (formatDecimal(product.costPrice) as unknown as number) : ('' as unknown as number),
            salePrice: product.salePrice ? (formatDecimal(product.salePrice) as unknown as number) : ('' as unknown as number),
          }
        : EMPTY,
    );
  }, [open, product, reset]);

  const [avg, max, lead, unit, cost, price, replenishment] = watch([
    'avgDailyConsumption',
    'maxDailyConsumption',
    'leadTimeDays',
    'unit',
    'costPrice',
    'salePrice',
    'replenishmentEnabled',
  ]);
  const costValue = parseMoney(String(cost ?? ''));
  const priceValue = parseMoney(String(price ?? ''));
  const margin = costValue > 0 && priceValue > 0 ? ((priceValue - costValue) / priceValue) * 100 : null;
  const preview = previewIndicators(Number(avg) || 0, Number(max) || 0, Number(lead) || 0);

  const onSubmit = handleSubmit(async (values) => {
    const consumption = values.replenishmentEnabled
      ? {}
      : { avgDailyConsumption: undefined, maxDailyConsumption: undefined, leadTimeDays: undefined };
    // O custo médio guarda 4 casas: só é enviado se foi alterado à mão (senão a edição o arredondaria).
    const keepCost = editing && !formState.dirtyFields.costPrice ? { costPrice: undefined } : {};
    const data = { ...values, ...consumption, ...keepCost, ...(editing && { initialStock: undefined }) };
    try {
      const saved = await save.mutateAsync({ id: product?.id, data });
      toast.success(editing ? 'Produto atualizado' : 'Produto cadastrado');
      onSaved?.(saved);
      onClose();
    } catch (error) {
      if (!isCanceled(error)) toast.error(errorMessage(error));
    }
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={editing ? 'Editar produto' : 'Novo produto'}
      description="Identificação, preços e estoque. O controle de consumo e reposição é opcional."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="product-form" loading={formState.isSubmitting}>
            {editing ? 'Salvar alterações' : 'Cadastrar produto'}
          </Button>
        </>
      }
    >
      <form id="product-form" onSubmit={onSubmit} noValidate className="space-y-6">
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-3 text-xs font-semibold tracking-wide text-slate-500 uppercase">Identificação</legend>
          <Field label="Nome do produto" error={errors.name?.message} hint="Ex.: Arroz Tio João Tipo 1 5kg" className="sm:col-span-2">
            {(id) => <Input id={id} autoFocus aria-invalid={!!errors.name} {...register('name')} />}
          </Field>
          <Field label="SKU (código interno)" error={errors.sku?.message}>
            {(id) => <Input id={id} className="uppercase" placeholder="ARROZ-TJ-5KG" aria-invalid={!!errors.sku} {...register('sku')} />}
          </Field>
          <Field label="Código de barras (EAN)" error={errors.barcode?.message} hint="Clique aqui e bipe o produto">
            {(id) => <Input id={id} inputMode="numeric" placeholder="7891234567890" aria-invalid={!!errors.barcode} {...register('barcode')} />}
          </Field>
          <Field label="Categoria / Subcategoria" error={errors.categoryId?.message}>
            {(id) => <CategorySelect id={id} aria-invalid={!!errors.categoryId} {...register('categoryId')} />}
          </Field>
          <Field label="Unidade de medida" error={errors.unit?.message}>
            {(id) => (
              <Select id={id} {...register('unit')}>
                {Object.entries(UNIT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </fieldset>

        <fieldset className="grid gap-4 sm:grid-cols-3">
          <legend className="mb-3 text-xs font-semibold tracking-wide text-slate-500 uppercase">Preços</legend>
          <Field label="Preço de venda (R$)" error={errors.salePrice?.message} hint="Cobrado no caixa. Em branco = não vendido no caixa.">
            {(id) => <Input id={id} inputMode="decimal" placeholder="0,00" aria-invalid={!!errors.salePrice} {...register('salePrice')} />}
          </Field>
          <Field label="Custo médio (R$)" error={errors.costPrice?.message} hint="Atualizado sozinho pelas notas de entrada; base da margem">
            {(id) => <Input id={id} inputMode="decimal" placeholder="0,00" aria-invalid={!!errors.costPrice} {...register('costPrice')} />}
          </Field>
          <div className="flex flex-col justify-center rounded-lg bg-slate-50 px-3 py-2 text-sm">
            <span className="text-xs text-slate-500">Margem sobre a venda</span>
            <span className="font-semibold text-slate-900">
              {margin === null ? '—' : `${formatNumber(Math.round(margin * 10) / 10)}%`}
              {margin !== null && priceValue > 0 && (
                <span className="ml-1 text-xs font-normal text-slate-500">({formatMoney(priceValue - costValue)} por {UNIT_SHORT[unit as Unit]})</span>
              )}
            </span>
          </div>
        </fieldset>

        {!editing && (
          <fieldset className="grid gap-4 sm:grid-cols-3">
            <legend className="mb-3 text-xs font-semibold tracking-wide text-slate-500 uppercase">Estoque</legend>
            <Field label="Estoque inicial" error={errors.initialStock?.message} hint="Quantidade que já existe hoje">
              {(id) => <Input id={id} type="number" step="0.001" min="0" {...register('initialStock')} />}
            </Field>
          </fieldset>
        )}

        <div className="rounded-xl border border-slate-200 p-4">
          <Switch
            label="Controlar consumo e reposição"
            description={
              replenishment
                ? 'Calcula o ponto de pedido e gera solicitação de compra automática quando o saldo baixar.'
                : 'Desligado: sem consumo e prazo, sem ponto de pedido e sem solicitação automática.'
            }
            checked={Boolean(replenishment)}
            onChange={(checked) => setValue('replenishmentEnabled', checked, { shouldDirty: true, shouldValidate: formState.isSubmitted })}
          />

          {replenishment && (
            <div className="mt-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Consumo médio/dia" error={errors.avgDailyConsumption?.message}>
                  {(id) => <Input id={id} type="number" step="0.001" min="0" aria-invalid={!!errors.avgDailyConsumption} {...register('avgDailyConsumption')} />}
                </Field>
                <Field label="Consumo máximo/dia" error={errors.maxDailyConsumption?.message}>
                  {(id) => <Input id={id} type="number" step="0.001" min="0" aria-invalid={!!errors.maxDailyConsumption} {...register('maxDailyConsumption')} />}
                </Field>
                <Field label="Prazo de entrega (dias)" error={errors.leadTimeDays?.message}>
                  {(id) => <Input id={id} type="number" step="1" min="0" aria-invalid={!!errors.leadTimeDays} {...register('leadTimeDays')} />}
                </Field>
              </div>

              <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-4">
                <p className="mb-3 flex items-center gap-2 text-sm font-medium text-brand-800">
                  <Calculator className="size-4" /> Indicadores calculados
                </p>
                <dl className="grid grid-cols-3 gap-3 text-center">
                  {[
                    ['Estoque mínimo', preview.minimumStock, 'Consumo médio × prazo'],
                    ['Estoque de segurança', preview.safetyStock, '(Máximo − médio) × prazo'],
                    ['Ponto de pedido', preview.reorderPoint, 'Mínimo + segurança'],
                  ].map(([label, value, formula]) => (
                    <div key={label as string} className="rounded-lg bg-white px-2 py-3 shadow-sm">
                      <dt className="text-xs text-slate-500">{label}</dt>
                      <dd className="mt-1 text-lg font-semibold text-slate-900">
                        {formatNumber(value as number)} <span className="text-xs font-normal text-slate-500">{UNIT_SHORT[unit as Unit]}</span>
                      </dd>
                      <dd className="mt-0.5 hidden text-[11px] text-slate-400 sm:block">{formula}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-3 text-xs text-brand-800/70">
                  Quando o saldo chegar ao ponto de pedido, o sistema gera automaticamente uma solicitação de pedido para a gestão.
                </p>
              </div>
            </div>
          )}
        </div>
      </form>
    </Modal>
  );
}
