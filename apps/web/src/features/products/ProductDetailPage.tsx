import { ArrowLeft, ClipboardPlus, Pencil, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { StockStatusBadge } from '@/components/StockStatusBadge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, EmptyState, ErrorState, LoadingState, Pagination } from '@/components/ui/Display';
import { ConfirmDialog } from '@/components/ui/Modal';
import { errorMessage, isCanceled } from '@/lib/api';
import { formatDate, formatDateTime, formatMoney, formatNumber, formatQuantity } from '@/lib/format';
import { UNIT_LABELS } from '@/lib/labels';
import { P } from '@/lib/permissions';
import { useAuth } from '../auth/AuthProvider';
import { NewPurchaseRequestModal } from '../purchases/NewPurchaseRequestModal';
import { useProductSuppliers } from '../suppliers/api';
import { useMovements } from '../stock/api';
import { MovementsTable } from '../stock/MovementsTable';
import { useDeleteProduct, useProduct } from './api';
import { ProductFormModal } from './ProductFormModal';

function Indicator({ label, value, hint, highlight }: { label: string; value: ReactNode; hint: string; highlight?: boolean }) {
  return (
    <Card className={highlight ? 'border-brand-200 bg-brand-50/50 p-4' : 'p-4'}>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight text-slate-900">{value}</p>
      <p className="mt-0.5 text-xs text-slate-400">{hint}</p>
    </Card>
  );
}

export function ProductDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const [page, setPage] = useState(1);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);

  const { data: product, isLoading, isError, refetch } = useProduct(id);
  const canSeeMovements = can(P.MOVEMENT_READ);
  const movements = useMovements({ productId: id, page, pageSize: 10 }, canSeeMovements);
  const deleteProduct = useDeleteProduct();
  const canSeeSuppliers = can(P.PURCHASE_READ);
  const suppliers = useProductSuppliers(id, canSeeSuppliers);

  if (isLoading) return <LoadingState />;
  if (isError || !product) return <ErrorState message="Produto não encontrado" onRetry={refetch} />;

  const qty = (value: number) => formatQuantity(value, product.unit);
  const margin = product.salePrice > 0 && product.costPrice > 0 ? ((product.salePrice - product.costPrice) / product.salePrice) * 100 : null;

  const handleDelete = async () => {
    try {
      await deleteProduct.mutateAsync(product.id);
      toast.success('Produto enviado para a lixeira');
      navigate('/produtos', { replace: true });
    } catch (error) {
      if (!isCanceled(error)) toast.error(errorMessage(error));
    }
  };

  return (
    <>
      <Link to="/produtos" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="size-4" /> Produtos
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{product.name}</h1>
            <StockStatusBadge status={product.status} />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            SKU {product.sku}
            {product.barcode && ` · EAN ${product.barcode}`} · {product.category.path}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {can(P.PURCHASE_MANAGE) && (
            <Button variant="outline" icon={<ClipboardPlus className="size-4" />} onClick={() => setRequestOpen(true)}>
              Solicitar pedido
            </Button>
          )}
          {can(P.PRODUCT_WRITE) && (
            <Button variant="outline" icon={<Pencil className="size-4" />} onClick={() => setEditOpen(true)}>
              Editar
            </Button>
          )}
          {can(P.PRODUCT_DELETE) && (
            <Button variant="ghost" className="text-red-600 hover:bg-red-50 hover:text-red-700" icon={<Trash2 className="size-4" />} onClick={() => setDeleteOpen(true)}>
              Excluir
            </Button>
          )}
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Indicator label="Saldo atual" value={qty(product.currentStock)} hint="Quantidade em estoque" highlight />
        {product.replenishmentEnabled ? (
          <>
            <Indicator label="Ponto de pedido (PP)" value={qty(product.reorderPoint)} hint="Ao atingir, gera solicitação" />
            <Indicator label="Estoque de segurança (ES)" value={qty(product.safetyStock)} hint="Proteção contra picos" />
            <Indicator label="Estoque mínimo (EM)" value={qty(product.minimumStock)} hint="Consumo durante a entrega" />
          </>
        ) : (
          <div className="col-span-1 flex items-center rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-500 lg:col-span-3">
            Consumo e reposição desligados para este produto: sem ponto de pedido e sem solicitação automática.
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="h-fit">
          <CardHeader title="Dados do produto" />
          <dl className="divide-y divide-slate-100 text-sm">
            {[
              ['Unidade', UNIT_LABELS[product.unit]],
              ['Preço de venda', formatMoney(product.salePrice)],
              ['Custo médio', formatMoney(product.costPrice)],
              ['Último custo (nota)', product.lastCost ? formatMoney(product.lastCost) : '—'],
              ['Margem sobre a venda', margin === null ? '—' : `${formatNumber(Math.round(margin * 10) / 10)}%`],
              ...(product.replenishmentEnabled
                ? [
                    ['Consumo médio diário', qty(product.avgDailyConsumption)],
                    ['Consumo máximo diário', qty(product.maxDailyConsumption)],
                    ['Prazo de entrega', `${product.leadTimeDays} dia(s)`],
                  ]
                : [['Consumo e reposição', 'Desligado']]),
              ['Cadastrado em', formatDateTime(product.createdAt)],
              ['Última alteração', formatDateTime(product.updatedAt)],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 px-5 py-3">
                <dt className="text-slate-500">{label}</dt>
                <dd className="text-right font-medium text-slate-800">{value}</dd>
              </div>
            ))}
          </dl>
          {canSeeSuppliers && (
            <div className="border-t border-slate-100 px-5 py-4">
              <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Fornecedores</p>
              {suppliers.data?.length ? (
                <ul className="space-y-2 text-sm">
                  {suppliers.data.map((link) => (
                    <li key={link.supplierId}>
                      <p className="font-medium text-slate-800">
                        {link.supplier.tradeName || link.supplier.name}
                        {link.preferred && <span className="ml-1 text-xs text-amber-600">★ preferencial</span>}
                      </p>
                      <p className="text-xs text-slate-500">
                        {[
                          link.supplierCode && `cód. ${link.supplierCode}`,
                          link.factor !== 1 && `embalagem com ${formatNumber(link.factor)}`,
                          link.lastCost !== null && `último custo ${formatMoney(link.lastCost)}`,
                          link.lastPurchaseAt && `em ${formatDate(link.lastPurchaseAt)}`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-slate-500">Aparecem aqui depois da primeira nota de entrada.</p>
              )}
            </div>
          )}
        </Card>

        <Card className="overflow-hidden lg:col-span-2">
          <CardHeader title="Histórico de movimentações" description="Entradas e saídas deste produto" />
          {!canSeeMovements ? (
            <EmptyState title="Histórico restrito" description="Seu perfil não tem acesso ao histórico de movimentações." />
          ) : movements.isLoading ? (
            <LoadingState />
          ) : movements.data && movements.data.items.length > 0 ? (
            <>
              <MovementsTable movements={movements.data.items} showProduct={false} />
              <Pagination page={movements.data.page} pageSize={movements.data.pageSize} total={movements.data.total} onChange={setPage} />
            </>
          ) : (
            <EmptyState title="Nenhuma movimentação ainda" />
          )}
        </Card>
      </div>

      <ProductFormModal open={editOpen} product={product} onClose={() => setEditOpen(false)} />
      <NewPurchaseRequestModal open={requestOpen} product={product} onClose={() => setRequestOpen(false)} />
      <ConfirmDialog
        open={deleteOpen}
        title="Excluir produto?"
        confirmLabel="Mover para a lixeira"
        loading={deleteProduct.isPending}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        description="O produto irá para a lixeira e poderá ser recuperado dentro do prazo configurado. Depois disso, ele e todo o histórico serão apagados definitivamente."
      />
    </>
  );
}
