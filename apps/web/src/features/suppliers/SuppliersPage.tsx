import { FileInput, Pencil, Plus, Search, Star, Trash2 } from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Badge, Card, EmptyState, ErrorState, LoadingState, PageHeader, Pagination, StatCard, Tabs } from '@/components/ui/Display';
import { Button, IconButton } from '@/components/ui/Button';
import { Input } from '@/components/ui/Form';
import { Modal } from '@/components/ui/Modal';
import { errorMessage } from '@/lib/api';
import { formatDocument, formatPhone } from '@/lib/document';
import { formatDate, formatMoney } from '@/lib/format';
import { UNIT_SHORT } from '@/lib/labels';
import { P } from '@/lib/permissions';
import type { Supplier } from '@/lib/types';
import { useAuth } from '../auth/AuthProvider';
import { useLinkProduct, useSupplier, useSuppliers, useUnlinkProduct } from './api';
import { SupplierFormModal } from './SupplierFormModal';

type Status = 'active' | 'inactive' | 'all';

/** Cadastro de fornecedores (RF17): contatos, prazos e os produtos que cada um fornece. */
export function SuppliersPage() {
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<Status>('active');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const deferred = useDeferredValue(search.trim());
  const { data, isLoading, isError, refetch } = useSuppliers({ search: deferred || undefined, status, page, pageSize: 20 });
  const canManage = can(P.PURCHASE_MANAGE);

  const openForm = (supplier: Supplier | null) => {
    setEditing(supplier);
    setFormOpen(true);
  };

  return (
    <>
      <PageHeader
        title="Fornecedores"
        description="Contatos, prazos de entrega e condições de pagamento de quem abastece a loja."
        actions={
          canManage && (
            <Button icon={<Plus className="size-4" />} onClick={() => openForm(null)}>
              Novo fornecedor
            </Button>
          )
        }
      />

      <div className="no-print mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Buscar por nome, fantasia ou CNPJ"
            className="pl-9"
            aria-label="Buscar fornecedor"
          />
        </div>
        <Tabs
          value={status}
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
          options={[
            { value: 'active', label: 'Ativos' },
            { value: 'inactive', label: 'Inativos' },
            { value: 'all', label: 'Todos' },
          ]}
        />
      </div>

      <Card>
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message="Não foi possível carregar os fornecedores" onRetry={refetch} />
        ) : !data?.items.length ? (
          <EmptyState
            title={deferred ? 'Nenhum fornecedor encontrado' : 'Nenhum fornecedor cadastrado'}
            description="Ao importar o XML de uma nota, o fornecedor é cadastrado sozinho."
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Fornecedor</th>
                    <th className="hidden sm:table-cell">CNPJ/CPF</th>
                    <th className="hidden md:table-cell">Telefone</th>
                    <th className="hidden lg:table-cell">Prazo</th>
                    <th>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((s) => (
                    <tr key={s.id} className="cursor-pointer" onClick={() => setDetailId(s.id)}>
                      <td>
                        <p className="font-medium text-slate-900">{s.tradeName || s.name}</p>
                        {s.tradeName && <p className="text-xs text-slate-500">{s.name}</p>}
                      </td>
                      <td className="hidden text-slate-600 tabular-nums sm:table-cell">{formatDocument(s.document) || '—'}</td>
                      <td className="hidden text-slate-600 tabular-nums md:table-cell">{formatPhone(s.phone) || '—'}</td>
                      <td className="hidden text-slate-600 lg:table-cell">{s.leadTimeDays !== null ? `${s.leadTimeDays} dia(s)` : '—'}</td>
                      <td>{s.active ? <Badge tone="green" dot>Ativo</Badge> : <Badge dot>Inativo</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={20} total={data.total} onChange={setPage} />
          </>
        )}
      </Card>

      <SupplierFormModal open={formOpen} supplier={editing} onClose={() => setFormOpen(false)} />
      <SupplierDetailModal
        id={detailId}
        canManage={canManage}
        onClose={() => setDetailId(null)}
        onEdit={(supplier) => {
          setDetailId(null);
          openForm(supplier);
        }}
      />
    </>
  );
}

function SupplierDetailModal({
  id,
  canManage,
  onClose,
  onEdit,
}: {
  id: string | null;
  canManage: boolean;
  onClose: () => void;
  onEdit: (supplier: Supplier) => void;
}) {
  const { data: supplier, isLoading } = useSupplier(id);
  const link = useLinkProduct();
  const unlink = useUnlinkProduct();

  return (
    <Modal open={Boolean(id)} onClose={onClose} title={supplier ? supplier.tradeName || supplier.name : 'Fornecedor'} size="lg">
      {isLoading || !supplier ? (
        <LoadingState />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <dt className="text-slate-500">Razão social</dt>
              <dd className="text-slate-900">{supplier.name}</dd>
              <dt className="text-slate-500">CNPJ/CPF</dt>
              <dd className="tabular-nums">{formatDocument(supplier.document) || '—'}</dd>
              <dt className="text-slate-500">Contato</dt>
              <dd>{[supplier.contactName, formatPhone(supplier.phone), supplier.email].filter(Boolean).join(' · ') || '—'}</dd>
              <dt className="text-slate-500">Prazo / pagamento</dt>
              <dd>{[supplier.leadTimeDays !== null && `${supplier.leadTimeDays} dia(s)`, supplier.paymentTerms].filter(Boolean).join(' · ') || '—'}</dd>
            </dl>
            <div className="flex gap-2">
              <Link to={`/notas-entrada?fornecedor=${supplier.id}`} onClick={onClose}>
                <Button variant="outline" size="sm" icon={<FileInput className="size-4" />}>
                  Notas
                </Button>
              </Link>
              {canManage && (
                <Button variant="outline" size="sm" icon={<Pencil className="size-4" />} onClick={() => onEdit(supplier)}>
                  Editar
                </Button>
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Notas lançadas" value={supplier.stats.invoices} icon={<FileInput className="size-5" />} hint={supplier.stats.lastPurchaseAt ? `Última em ${formatDate(supplier.stats.lastPurchaseAt)}` : undefined} />
            <StatCard label="Contas em aberto" value={supplier.stats.openPayables} icon={<FileInput className="size-5" />} tone={supplier.stats.openPayables ? 'amber' : 'neutral'} />
            <StatCard label="Valor em aberto" value={formatMoney(supplier.stats.openAmount)} icon={<FileInput className="size-5" />} />
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-900">Produtos fornecidos</h3>
            {supplier.products.length === 0 ? (
              <p className="text-sm text-slate-500">Os produtos aparecem aqui depois da primeira nota lançada deste fornecedor.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>Produto</th>
                      <th>Código no fornecedor</th>
                      <th className="text-right">Conversão</th>
                      <th className="text-right">Último custo</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {supplier.products.map((p) => (
                      <tr key={p.productId}>
                        <td>
                          <Link to={`/produtos/${p.productId}`} onClick={onClose} className="font-medium text-slate-900 hover:underline">
                            {p.product.name}
                          </Link>
                          <p className="text-xs text-slate-500">{p.product.sku}</p>
                        </td>
                        <td className="text-slate-600">{p.supplierCode ?? '—'}</td>
                        <td className="text-right text-slate-600 tabular-nums">{p.factor !== 1 ? `× ${p.factor} ${UNIT_SHORT[p.product.unit]}` : '—'}</td>
                        <td className="text-right tabular-nums">{p.lastCost !== null ? formatMoney(p.lastCost) : '—'}</td>
                        <td className="text-right whitespace-nowrap">
                          {canManage && (
                            <>
                              <IconButton
                                label={p.preferred ? 'Fornecedor preferencial deste produto' : 'Tornar o fornecedor preferencial'}
                                onClick={() =>
                                  link.mutate(
                                    { supplierId: supplier.id, productId: p.productId, data: { preferred: !p.preferred } },
                                    { onError: (e) => toast.error(errorMessage(e)) },
                                  )
                                }
                              >
                                <Star className={p.preferred ? 'size-4 fill-amber-400 text-amber-500' : 'size-4'} />
                              </IconButton>
                              <IconButton
                                label="Desligar produto deste fornecedor"
                                onClick={() => unlink.mutate({ supplierId: supplier.id, productId: p.productId }, { onError: (e) => toast.error(errorMessage(e)) })}
                              >
                                <Trash2 className="size-4" />
                              </IconButton>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-2 text-xs text-slate-500">A estrela marca o fornecedor sugerido nas solicitações de pedido.</p>
          </div>
          {supplier.notes && <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{supplier.notes}</p>}
        </div>
      )}
    </Modal>
  );
}
