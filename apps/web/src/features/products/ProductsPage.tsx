import { FileDown, FileSpreadsheet, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { StockStatusBadge } from '@/components/StockStatusBadge';
import { Button, IconButton } from '@/components/ui/Button';
import { Card, EmptyState, ErrorState, LoadingState, PageHeader, Pagination, Tabs } from '@/components/ui/Display';
import { Input } from '@/components/ui/Form';
import { ConfirmDialog } from '@/components/ui/Modal';
import { errorMessage, isCanceled } from '@/lib/api';
import { formatMoney, formatNumber, formatQuantity } from '@/lib/format';
import { UNIT_SHORT } from '@/lib/labels';
import { P } from '@/lib/permissions';
import type { Product } from '@/lib/types';
import { useAuth } from '../auth/AuthProvider';
import { useDeleteProduct, useProducts } from './api';
import { CategorySelect } from './CategorySelect';
import { exportCatalog, ImportProductsModal } from './ImportProductsModal';
import { ProductFormModal } from './ProductFormModal';

const STATUS_TABS = [
  { value: '', label: 'Todos' },
  { value: 'ATTENTION', label: 'Precisam de atenção' },
  { value: 'OUT_OF_STOCK', label: 'Sem estoque' },
  { value: 'CRITICAL', label: 'Críticos' },
  { value: 'REORDER', label: 'Repor' },
  { value: 'OK', label: 'Normais' },
];

export function ProductsPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim());
  const [page, setPage] = useState(1);
  const status = params.get('status') ?? '';
  const categoryId = params.get('categoria') ?? '';

  const [editing, setEditing] = useState<Product | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [deleting, setDeleting] = useState<Product | null>(null);

  const { data, isLoading, isError, refetch, isFetching } = useProducts({
    search: deferredSearch || undefined,
    status: status || undefined,
    categoryId: categoryId || undefined,
    page,
    pageSize: 20,
  });
  const deleteProduct = useDeleteProduct();

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
    setPage(1);
  };

  const openForm = (product: Product | null) => {
    setEditing(product);
    setFormOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await deleteProduct.mutateAsync(deleting.id);
      toast.success(`"${deleting.name}" foi para a lixeira`);
      setDeleting(null);
    } catch (error) {
      if (!isCanceled(error)) toast.error(errorMessage(error));
    }
  };

  return (
    <>
      <PageHeader
        title="Produtos"
        description="Catálogo de mercadorias com saldo atual e indicadores de reposição."
        actions={
          <>
            <Button variant="ghost" icon={<FileDown className="size-4" />} onClick={() => void exportCatalog().catch((e) => toast.error(errorMessage(e)))}>
              Exportar planilha
            </Button>
            {can(P.PRODUCT_WRITE) && (
              <>
                <Button variant="outline" icon={<FileSpreadsheet className="size-4" />} onClick={() => setImporting(true)}>
                  Importar planilha
                </Button>
                <Button icon={<Plus className="size-4" />} onClick={() => openForm(null)}>
                  Novo produto
                </Button>
              </>
            )}
          </>
        }
      />
      <ImportProductsModal open={importing} onClose={() => setImporting(false)} />

      <div className="mb-4 flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
        <Tabs value={status} onChange={(value) => setFilter('status', value)} options={STATUS_TABS} />
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative sm:w-72">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Buscar por nome, SKU ou código"
              className="pl-9"
              aria-label="Buscar produtos"
            />
          </div>
          <CategorySelect
            value={categoryId}
            onChange={(e) => setFilter('categoria', e.target.value)}
            placeholder="Todas as categorias"
            className="sm:w-56"
            aria-label="Filtrar por categoria"
          />
        </div>
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message="Não foi possível carregar os produtos" onRetry={refetch} />
        ) : data && data.items.length === 0 ? (
          <EmptyState
            title={deferredSearch || status || categoryId ? 'Nenhum produto encontrado' : 'Nenhum produto cadastrado'}
            description={deferredSearch || status ? 'Tente mudar a busca ou os filtros.' : 'Cadastre o primeiro produto para começar.'}
            action={
              !deferredSearch && !status && can(P.PRODUCT_WRITE) ? (
                <Button icon={<Plus className="size-4" />} onClick={() => openForm(null)}>
                  Novo produto
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className={isFetching ? 'opacity-70 transition-opacity' : undefined}>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th className="hidden md:table-cell">Categoria</th>
                    <th className="hidden text-right lg:table-cell">Preço</th>
                    <th className="text-right">Saldo</th>
                    <th className="hidden text-right sm:table-cell">Ponto de pedido</th>
                    <th>Situação</th>
                    <th className="w-24" />
                  </tr>
                </thead>
                <tbody>
                  {data?.items.map((product) => (
                    <tr key={product.id} className="cursor-pointer" onClick={() => navigate(`/produtos/${product.id}`)}>
                      <td>
                        <p className="font-medium text-slate-900">{product.name}</p>
                        <p className="text-xs text-slate-500">
                          {product.sku}
                          {product.barcode && <span className="text-slate-400"> · {product.barcode}</span>}
                        </p>
                      </td>
                      <td className="hidden text-slate-600 md:table-cell">{product.category.path}</td>
                      <td className="hidden text-right tabular-nums lg:table-cell">
                        {product.salePrice > 0 ? formatMoney(product.salePrice) : <span className="text-xs text-slate-400">sem preço</span>}
                      </td>
                      <td className="text-right font-semibold tabular-nums text-slate-900">
                        {formatQuantity(product.currentStock, product.unit)}
                      </td>
                      <td className="hidden text-right tabular-nums text-slate-500 sm:table-cell">
                        {product.replenishmentEnabled ? `${formatNumber(product.reorderPoint)} ${UNIT_SHORT[product.unit]}` : '—'}
                      </td>
                      <td>
                        <StockStatusBadge status={product.status} />
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          {can(P.PRODUCT_WRITE) && (
                            <IconButton label="Editar" onClick={() => openForm(product)}>
                              <Pencil className="size-4" />
                            </IconButton>
                          )}
                          {can(P.PRODUCT_DELETE) && (
                            <IconButton label="Excluir" className="hover:bg-red-50 hover:text-red-600" onClick={() => setDeleting(product)}>
                              <Trash2 className="size-4" />
                            </IconButton>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
          </div>
        )}
      </Card>

      <ProductFormModal open={formOpen} product={editing} onClose={() => setFormOpen(false)} />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Excluir produto?"
        confirmLabel="Mover para a lixeira"
        loading={deleteProduct.isPending}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        description={
          <>
            <strong className="text-slate-800">{deleting?.name}</strong> sairá do catálogo e irá para a lixeira. Ele pode ser
            recuperado dentro do prazo configurado; depois disso, o produto e todo o histórico serão apagados definitivamente.
          </>
        }
      />
    </>
  );
}
