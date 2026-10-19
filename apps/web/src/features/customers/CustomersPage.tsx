import { Download, Pencil, Plus, Power, Search, ShieldOff } from 'lucide-react';
import { useDeferredValue, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Badge, Card, EmptyState, ErrorState, LoadingState, PageHeader, Pagination, StatCard, Tabs } from '@/components/ui/Display';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Form';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { errorMessage } from '@/lib/api';
import { formatDocument, formatPhone } from '@/lib/document';
import { formatDate, formatDateTime, formatMoney } from '@/lib/format';
import { P } from '@/lib/permissions';
import type { Customer, Sale } from '@/lib/types';
import { useAuth } from '../auth/AuthProvider';
import { useSales } from '../pos/api';
import { SaleDetailModal, saleNumberLabel, SaleStatusBadge } from '../sales/SaleDetailModal';
import { exportCustomer, useAnonymizeCustomer, useCustomer, useCustomers, useSaveCustomer } from './api';
import { CustomerFormModal } from './CustomerFormModal';
import { CustomerCreditPanel } from './CustomerCreditPanel';

type Status = 'active' | 'inactive' | 'all';

/** Cadastro de clientes, histórico de compras e atendimento à LGPD. */
export function CustomersPage() {
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<Status>('active');
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();

  // Busca rápida (Ctrl+K) abre o cliente direto: /clientes?cliente=<id>.
  const linked = params.get('cliente');
  useEffect(() => {
    if (!linked) return;
    setDetailId(linked);
    setParams({}, { replace: true });
  }, [linked, setParams]);
  const deferred = useDeferredValue(search.trim());
  const { data, isLoading, isError, refetch } = useCustomers({ search: deferred || undefined, status, page, pageSize: 20 });

  const openForm = (customer: Customer | null) => {
    setEditing(customer);
    setFormOpen(true);
  };

  return (
    <>
      <PageHeader
        title="Clientes"
        description="Cadastro de clientes para identificar a venda, o CPF na nota e o histórico de compras."
        actions={
          can(P.CUSTOMER_WRITE) && (
            <Button icon={<Plus className="size-4" />} onClick={() => openForm(null)}>
              Novo cliente
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
            placeholder="Buscar por nome, CPF/CNPJ ou telefone"
            className="pl-9"
            aria-label="Buscar cliente"
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
          <ErrorState message="Não foi possível carregar os clientes" onRetry={refetch} />
        ) : !data?.items.length ? (
          <EmptyState
            title={deferred ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado'}
            description="Clientes também podem ser cadastrados no caixa, pela tecla Ins."
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th className="hidden sm:table-cell">CPF/CNPJ</th>
                    <th className="hidden md:table-cell">Telefone</th>
                    <th className="hidden lg:table-cell">Cadastro</th>
                    <th>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((c) => (
                    <tr key={c.id} className="cursor-pointer" onClick={() => setDetailId(c.id)}>
                      <td className="font-medium text-slate-900">{c.name}</td>
                      <td className="hidden text-slate-600 tabular-nums sm:table-cell">{formatDocument(c.document) || '—'}</td>
                      <td className="hidden text-slate-600 tabular-nums md:table-cell">{formatPhone(c.phone) || '—'}</td>
                      <td className="hidden text-slate-500 lg:table-cell">{formatDate(c.createdAt)}</td>
                      <td>
                        {c.anonymizedAt ? <Badge>Dados apagados</Badge> : c.active ? <Badge tone="green" dot>Ativo</Badge> : <Badge dot>Inativo</Badge>}
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

      <CustomerFormModal key={editing?.id ?? 'new'} open={formOpen} customer={editing} onClose={() => setFormOpen(false)} />
      <CustomerDetailModal
        id={detailId}
        onClose={() => setDetailId(null)}
        onEdit={(customer) => {
          setDetailId(null);
          openForm(customer);
        }}
      />
    </>
  );
}

function CustomerDetailModal({ id, onClose, onEdit }: { id: string | null; onClose: () => void; onEdit: (customer: Customer) => void }) {
  const { can } = useAuth();
  const { data: customer, isLoading } = useCustomer(id);
  const [page, setPage] = useState(1);
  const sales = useSales({ customerId: id ?? undefined, page, pageSize: 8 }, Boolean(id) && can(P.SALES_READ));
  const save = useSaveCustomer();
  const anonymize = useAnonymizeCustomer();
  const [confirmAnonymize, setConfirmAnonymize] = useState(false);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const canManage = can(P.CUSTOMER_MANAGE);

  const toggleActive = async () => {
    if (!customer) return;
    try {
      await save.mutateAsync({ id: customer.id, data: { active: !customer.active } });
      toast.success(customer.active ? 'Cliente inativado' : 'Cliente reativado');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const downloadData = async () => {
    if (!customer) return;
    try {
      const data = await exportCustomer(customer.id);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `dados-cliente-${customer.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`;
      link.click();
      URL.revokeObjectURL(link.href);
      toast.success('Dados exportados', { description: 'Entregue o arquivo ao cliente que pediu (LGPD).' });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const doAnonymize = async () => {
    if (!customer) return;
    try {
      await anonymize.mutateAsync(customer.id);
      toast.success('Dados pessoais apagados', { description: 'As compras continuam registradas, sem identificar o cliente.' });
      setConfirmAnonymize(false);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const anonymized = Boolean(customer?.anonymizedAt);

  return (
    <>
      <Modal
        open={Boolean(id) && !selectedSale && !confirmAnonymize}
        onClose={onClose}
        size="lg"
        title={customer?.name ?? 'Cliente'}
        description={customer && (anonymized ? `Dados pessoais apagados em ${formatDateTime(customer.anonymizedAt!)}` : `Cliente desde ${formatDate(customer.createdAt)}`)}
        footer={
          customer && !anonymized ? (
            <>
              {canManage && (
                <>
                  <Button variant="ghost" className="mr-auto text-red-600" icon={<ShieldOff className="size-4" />} onClick={() => setConfirmAnonymize(true)}>
                    Apagar dados (LGPD)
                  </Button>
                  <Button variant="outline" icon={<Download className="size-4" />} onClick={() => void downloadData()}>
                    Exportar dados
                  </Button>
                  <Button variant="outline" icon={<Power className="size-4" />} loading={save.isPending} onClick={() => void toggleActive()}>
                    {customer.active ? 'Inativar' : 'Reativar'}
                  </Button>
                </>
              )}
              {can(P.CUSTOMER_WRITE) && (
                <Button icon={<Pencil className="size-4" />} onClick={() => onEdit(customer)}>
                  Editar
                </Button>
              )}
            </>
          ) : undefined
        }
      >
        {isLoading || !customer ? (
          <LoadingState />
        ) : (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard label="Compras" value={customer.stats.purchases} icon={<span className="text-sm font-bold">#</span>} />
              <StatCard label="Total comprado" value={formatMoney(customer.stats.total)} icon={<span className="text-sm font-bold">R$</span>} tone="green" />
              <StatCard
                label="Ticket médio"
                value={formatMoney(customer.stats.averageTicket)}
                icon={<span className="text-sm font-bold">x̄</span>}
                tone="blue"
                hint={customer.stats.lastPurchaseAt ? `Última: ${formatDate(customer.stats.lastPurchaseAt)}` : undefined}
              />
            </div>

            {!anonymized && (
              <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                {[
                  ['CPF/CNPJ', formatDocument(customer.document)],
                  ['Telefone', formatPhone(customer.phone)],
                  ['E-mail', customer.email],
                  ['Nascimento', customer.birthDate && formatDate(`${customer.birthDate.slice(0, 10)}T12:00`)],
                  ['Endereço', customer.address],
                  ['Observações', customer.notes],
                  ['Autorização (LGPD)', customer.consentAt ? `${formatDateTime(customer.consentAt)} · ${customer.consentChannel ?? ''}` : 'Não registrada'],
                  ['Aceita ofertas', customer.marketingConsent ? 'Sim' : 'Não'],
                ].map(([label, value]) => (
                  <div key={label as string} className="flex justify-between gap-3 border-b border-slate-100 py-1.5">
                    <dt className="text-slate-500">{label}</dt>
                    <dd className="text-right font-medium text-slate-800">{value || '—'}</dd>
                  </div>
                ))}
              </dl>
            )}

            {!anonymized && <CustomerCreditPanel customerId={customer.id} limit={customer.creditLimit} />}

            {can(P.SALES_READ) && (
              <div>
                <p className="mb-2 text-sm font-semibold text-slate-800">Compras</p>
                {sales.isLoading ? (
                  <LoadingState />
                ) : !sales.data?.items.length ? (
                  <p className="text-sm text-slate-500">Nenhuma compra identificada.</p>
                ) : (
                  <div className="overflow-hidden rounded-lg border border-slate-200">
                    <table className="table-base">
                      <tbody>
                        {sales.data.items.map((sale) => (
                          <tr key={sale.id} className="cursor-pointer" onClick={() => setSelectedSale(sale)}>
                            <td className="font-medium text-brand-700">{saleNumberLabel(sale)}</td>
                            <td className="text-slate-600">{formatDateTime(sale.occurredAt)}</td>
                            <td>
                              <SaleStatusBadge sale={sale} />
                            </td>
                            <td className="text-right font-semibold tabular-nums">{formatMoney(sale.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <Pagination page={page} pageSize={8} total={sales.data.total} onChange={setPage} />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      <SaleDetailModal sale={selectedSale} onClose={() => setSelectedSale(null)} />
      <ConfirmDialog
        open={confirmAnonymize}
        title="Apagar os dados pessoais deste cliente?"
        description={
          <>
            Use quando o próprio cliente pedir a exclusão dos dados (LGPD). Nome, CPF, telefone, e-mail, endereço e
            observações serão apagados <strong>definitivamente</strong>. As compras continuam registradas, mas sem identificar o
            cliente. Se ele pediu uma cópia dos dados, exporte antes.
          </>
        }
        confirmLabel="Apagar dados"
        loading={anonymize.isPending}
        onConfirm={() => void doAnonymize()}
        onClose={() => setConfirmAnonymize(false)}
      />
    </>
  );
}
