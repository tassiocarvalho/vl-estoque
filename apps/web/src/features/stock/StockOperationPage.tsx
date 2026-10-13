import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, CloudOff, Minus, Plus, Trash2, X, Zap } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { StockStatusBadge } from '@/components/StockStatusBadge';
import { Button, IconButton } from '@/components/ui/Button';
import { Card, CardHeader, EmptyState, PageHeader } from '@/components/ui/Display';
import { Input, Switch } from '@/components/ui/Form';
import { errorMessage, http, isCanceled, isNetworkError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatQuantity, uuid } from '@/lib/format';
import { ENTRY_TYPES, EXIT_TYPES, MOVEMENT_LABELS, UNIT_SHORT } from '@/lib/labels';
import type { MovementType, RegisterMovementResult } from '@/lib/types';
import { useOffline } from '../offline/OfflineProvider';
import type { CatalogItem } from '../offline/offline-store';
import { invalidateStockData } from '../products/api';
import { ProductScanner } from './ProductScanner';

type Mode = 'entry' | 'exit';

interface SessionRecord {
  id: string;
  productName: string;
  unit: CatalogItem['unit'];
  type: MovementType;
  quantity: number;
  balanceAfter?: number;
  offline: boolean;
  at: Date;
}

const CONFIG = {
  entry: {
    title: 'Registrar entrada',
    description: 'Mercadoria que chegou do fornecedor ou que voltou para o estoque.',
    types: ENTRY_TYPES,
    endpoint: 'entries',
    action: 'Registrar entrada',
    icon: ArrowDownToLine,
  },
  exit: {
    title: 'Registrar saída',
    description: 'Retirada de mercadoria para venda, perdas ou ajustes.',
    types: EXIT_TYPES,
    endpoint: 'exits',
    action: 'Registrar saída',
    icon: ArrowUpFromLine,
  },
} as const;

const QUICK_MODE_KEY = 'vl:quick-mode';

function readQuickMode() {
  try {
    return localStorage.getItem(QUICK_MODE_KEY) === '1';
  } catch {
    return false;
  }
}

export function StockOperationPage({ mode }: { mode: Mode }) {
  const config = CONFIG[mode];
  const queryClient = useQueryClient();
  const { enqueue, pending, discard } = useOffline();
  const scannerRef = useRef<HTMLInputElement>(null);

  const [product, setProduct] = useState<CatalogItem | null>(null);
  const [type, setType] = useState<MovementType>(config.types[0]);
  const [quantity, setQuantity] = useState('1');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [session, setSession] = useState<SessionRecord[]>([]);
  const [quickMode, setQuickMode] = useState(readQuickMode);

  useEffect(() => {
    try {
      localStorage.setItem(QUICK_MODE_KEY, quickMode ? '1' : '0');
    } catch {
      /* armazenamento indisponível: preferência só vale nesta sessão */
    }
  }, [quickMode]);

  const resetForm = () => {
    setProduct(null);
    setQuantity('1');
    setNote('');
    requestAnimationFrame(() => scannerRef.current?.focus());
  };

  const register = async (target: CatalogItem, amount: number) => {
    const payload = {
      id: uuid(),
      productId: target.id,
      type,
      quantity: amount,
      note: note.trim() || undefined,
      occurredAt: new Date().toISOString(),
    };
    const record: SessionRecord = {
      id: payload.id,
      productName: target.name,
      unit: target.unit,
      type,
      quantity: amount,
      offline: false,
      at: new Date(),
    };

    setSubmitting(true);
    try {
      const result = await http.post<RegisterMovementResult>(`/stock/${config.endpoint}`, payload);
      setSession((list) => [{ ...record, balanceAfter: result.movement.balanceAfter }, ...list].slice(0, 15));
      toast.success(`${MOVEMENT_LABELS[type]}: ${formatQuantity(amount, target.unit)} de ${target.name}`);
      if (result.purchaseRequestCreated) {
        toast.warning('Estoque atingiu o ponto de pedido', {
          description: `Uma solicitação de pedido de "${target.name}" foi enviada para a gestão.`,
          duration: 8000,
        });
      } else if (result.product?.status === 'CRITICAL' || result.product?.status === 'OUT_OF_STOCK') {
        toast.warning(`Atenção: "${target.name}" está com estoque ${result.product.status === 'CRITICAL' ? 'crítico' : 'zerado'}`);
      }
      invalidateStockData(queryClient);
      resetForm();
    } catch (error) {
      if (isNetworkError(error)) {
        await enqueue({ id: payload.id, kind: config.endpoint, payload, productName: target.name, unit: target.unit });
        setSession((list) => [{ ...record, offline: true }, ...list].slice(0, 15));
        toast.info('Sem conexão: registro salvo no dispositivo', {
          description: 'Ele será enviado automaticamente quando a internet voltar.',
        });
        resetForm();
      } else if (!isCanceled(error)) {
        toast.error(errorMessage(error));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const onSelect = (selected: CatalogItem) => {
    if (quickMode) {
      void register(selected, 1);
      return;
    }
    setProduct(selected);
    requestAnimationFrame(() => document.getElementById('movement-quantity')?.focus());
  };

  const amount = Number(quantity.replace(',', '.'));
  const validAmount = Number.isFinite(amount) && amount > 0;
  const exceeds = mode === 'exit' && product !== null && validAmount && amount > product.currentStock;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (product && validAmount) void register(product, amount);
  };

  const step = (delta: number) => {
    const next = Math.max((validAmount ? amount : 0) + delta, 1);
    setQuantity(String(next));
  };

  const myPending = pending.filter((p) => p.kind === config.endpoint);

  return (
    <>
      <PageHeader title={config.title} description={config.description} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card className="p-5">
            <div className="mb-4 flex flex-wrap gap-2" role="radiogroup" aria-label="Tipo de movimentação">
              {config.types.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={type === option}
                  onClick={() => setType(option)}
                  className={cn(
                    'rounded-lg border px-3.5 py-2 text-sm font-medium transition',
                    type === option
                      ? 'border-brand-600 bg-brand-50 text-brand-800 ring-1 ring-brand-600'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50',
                  )}
                >
                  {MOVEMENT_LABELS[option]}
                </button>
              ))}
            </div>

            <ProductScanner ref={scannerRef} onSelect={onSelect} />

            <div className="mt-4 flex items-center justify-between gap-4 rounded-lg bg-slate-50 px-4 py-3">
              <Switch
                checked={quickMode}
                onChange={setQuickMode}
                label="Registro rápido"
                description="Cada bipagem registra 1 unidade na hora, sem confirmar."
              />
              <Zap className={cn('size-5 shrink-0', quickMode ? 'text-amber-500' : 'text-slate-300')} />
            </div>
          </Card>

          {product && (
            <Card className="p-5">
              <form onSubmit={onSubmit} className="space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-lg font-semibold text-slate-900">{product.name}</p>
                    <p className="text-sm text-slate-500">
                      {product.sku}
                      {product.barcode && ` · ${product.barcode}`}
                    </p>
                    <div className="mt-2 flex items-center gap-3 text-sm">
                      <span className="text-slate-600">
                        Saldo atual: <strong className="text-slate-900">{formatQuantity(product.currentStock, product.unit)}</strong>
                      </span>
                      <StockStatusBadge status={product.status} />
                    </div>
                  </div>
                  <IconButton label="Trocar produto" onClick={resetForm}>
                    <X className="size-5" />
                  </IconButton>
                </div>

                <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
                  <div>
                    <label htmlFor="movement-quantity" className="mb-1.5 block text-sm font-medium text-slate-700">
                      Quantidade ({UNIT_SHORT[product.unit]})
                    </label>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="icon" onClick={() => step(-1)} aria-label="Diminuir">
                        <Minus className="size-4" />
                      </Button>
                      <Input
                        id="movement-quantity"
                        inputMode="decimal"
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value.replace(/[^\d.,]/g, ''))}
                        onFocus={(e) => e.target.select()}
                        className="h-12 w-28 text-center text-xl font-semibold"
                        aria-invalid={!validAmount}
                      />
                      <Button variant="outline" size="icon" onClick={() => step(1)} aria-label="Aumentar">
                        <Plus className="size-4" />
                      </Button>
                    </div>
                  </div>
                  <div>
                    <label htmlFor="movement-note" className="mb-1.5 block text-sm font-medium text-slate-700">
                      Observação <span className="font-normal text-slate-400">(opcional)</span>
                    </label>
                    <Input
                      id="movement-note"
                      value={note}
                      maxLength={200}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder={mode === 'entry' ? 'Ex.: NF 12345 — Fornecedor X' : 'Ex.: embalagem danificada'}
                      className="h-12"
                    />
                  </div>
                </div>

                {exceeds && (
                  <p className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    <AlertTriangle className="size-4 shrink-0" />
                    A quantidade é maior que o saldo atual registrado.
                  </p>
                )}

                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  loading={submitting}
                  disabled={!validAmount}
                  icon={<config.icon className="size-5" />}
                >
                  {config.action}
                </Button>
              </form>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          {myPending.length > 0 && (
            <Card className="overflow-hidden border-amber-200">
              <CardHeader title="Aguardando envio" description="Registrados sem internet" />
              <ul className="divide-y divide-slate-100">
                {myPending.map((item) => (
                  <li key={item.id} className="flex items-start justify-between gap-3 px-5 py-3 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-slate-800">{item.productName}</span>
                      <span className="text-xs text-slate-500">
                        {MOVEMENT_LABELS[item.payload.type]} · {formatQuantity(item.payload.quantity, item.unit)}
                      </span>
                      {item.error && <span className="block text-xs font-medium text-red-600">{item.error}</span>}
                    </span>
                    {item.error ? (
                      <IconButton label="Descartar" onClick={() => void discard(item.id)}>
                        <Trash2 className="size-4" />
                      </IconButton>
                    ) : (
                      <CloudOff className="size-4 shrink-0 text-amber-500" />
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card className="overflow-hidden">
            <CardHeader title="Registros desta sessão" />
            {session.length === 0 ? (
              <EmptyState title="Nada registrado ainda" description="Os registros feitos nesta tela aparecem aqui." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {session.map((record) => (
                  <li key={record.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-slate-800">{record.productName}</span>
                      <span className="text-xs text-slate-500">
                        {record.at.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · {MOVEMENT_LABELS[record.type]}
                        {record.offline && ' · offline'}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className={cn('block font-semibold tabular-nums', mode === 'entry' ? 'text-emerald-700' : 'text-rose-700')}>
                        {mode === 'entry' ? '+' : '−'}
                        {formatQuantity(record.quantity, record.unit)}
                      </span>
                      {record.balanceAfter !== undefined && (
                        <span className="text-xs text-slate-400">saldo {formatQuantity(record.balanceAfter, record.unit)}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
