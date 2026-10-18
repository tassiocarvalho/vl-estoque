import { FileCode2, Plus, Search } from 'lucide-react';
import { useDeferredValue, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Badge, Card, EmptyState, ErrorState, LoadingState, PageHeader, Pagination, Tabs } from '@/components/ui/Display';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Form';
import { ApiError, errorMessage } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/format';
import { INVOICE_STATUS_LABELS } from '@/lib/labels';
import { P } from '@/lib/permissions';
import type { PurchaseInvoiceStatus } from '@/lib/types';
import { useAuth } from '../auth/AuthProvider';
import { readTextFile, useInvoiceMutations, useInvoices } from './api';

type Tab = 'all' | PurchaseInvoiceStatus;
const STATUS_TONE = { DRAFT: 'amber', FINALIZED: 'green', CANCELED: 'neutral' } as const;

/** Entradas de mercadoria por nota (RF18): digitadas ou importadas do XML da NF-e. */
export function InvoicesPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const supplierId = params.get('fornecedor') ?? undefined;
  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const deferred = useDeferredValue(search.trim());
  const { data, isLoading, isError, refetch } = useInvoices({ status: tab === 'all' ? undefined : tab, supplierId, search: deferred || undefined, page, pageSize: 20 });
  const { create, importXml } = useInvoiceMutations();
  const fileRef = useRef<HTMLInputElement>(null);
  const canManage = can(P.PURCHASE_MANAGE) && can(P.STOCK_IN);

  const newInvoice = async () => {
    try {
      const draft = await create.mutateAsync({
        supplierId: null,
        documentNumber: null,
        series: null,
        issueDate: null,
        freight: 0,
        otherCosts: 0,
        discount: 0,
        declaredTotal: null,
        notes: null,
        items: [],
        installments: [],
      });
      navigate(`/notas-entrada/${draft.id}`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('Arquivo grande demais (máximo de 5 MB)');
      const draft = await importXml.mutateAsync(await readTextFile(file));
      const pending = draft.items.filter((i) => !i.productId).length;
      toast.success(`Nota ${draft.documentNumber ?? ''} importada`, {
        description: pending ? `${pending} item(ns) para associar a produtos do cadastro.` : 'Todos os itens foram reconhecidos.',
      });
      navigate(`/notas-entrada/${draft.id}`);
    } catch (error) {
      const existing = error instanceof ApiError && typeof error.details.invoiceId === 'string' ? error.details.invoiceId : undefined;
      toast.error(error instanceof Error && !(error instanceof ApiError) ? error.message : errorMessage(error));
      if (existing) navigate(`/notas-entrada/${existing}`);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <>
      <PageHeader
        title="Notas de entrada"
        description="Entrada de mercadoria com custo: atualiza o estoque, o custo médio e gera as contas a pagar."
        actions={
          canManage && (
            <>
              <input ref={fileRef} type="file" accept=".xml,text/xml,application/xml" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
              <Button variant="outline" icon={<FileCode2 className="size-4" />} loading={importXml.isPending} onClick={() => fileRef.current?.click()}>
                Importar XML da NF-e
              </Button>
              <Button icon={<Plus className="size-4" />} loading={create.isPending} onClick={() => void newInvoice()}>
                Digitar nota
              </Button>
            </>
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
            placeholder="Nº da nota, nº da entrada ou fornecedor"
            className="pl-9"
            aria-label="Buscar nota"
          />
        </div>
        <Tabs
          value={tab}
          onChange={(value) => {
            setTab(value);
            setPage(1);
          }}
          options={[
            { value: 'all', label: 'Todas' },
            { value: 'DRAFT', label: 'Rascunhos' },
            { value: 'FINALIZED', label: 'Lançadas' },
          ]}
        />
        {supplierId && (
          <Button variant="ghost" size="sm" onClick={() => navigate('/notas-entrada')}>
            Ver de todos os fornecedores
          </Button>
        )}
      </div>

      <Card>
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message="Não foi possível carregar as notas" onRetry={refetch} />
        ) : !data?.items.length ? (
          <EmptyState
            title="Nenhuma nota de entrada"
            description="Importe o XML que o fornecedor envia por e-mail (os itens já vêm preenchidos) ou digite a nota."
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Entrada</th>
                    <th>Fornecedor</th>
                    <th className="hidden sm:table-cell">Nota</th>
                    <th className="hidden md:table-cell">Emissão</th>
                    <th className="hidden md:table-cell text-right">Itens</th>
                    <th className="text-right">Total</th>
                    <th>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((invoice) => (
                    <tr key={invoice.id} className="cursor-pointer" onClick={() => navigate(`/notas-entrada/${invoice.id}`)}>
                      <td className="font-medium text-slate-900 tabular-nums">
                        nº {invoice.number}
                        {invoice.source === 'XML' && <span className="ml-2 text-xs font-normal text-slate-500">XML</span>}
                      </td>
                      <td>{invoice.supplier ? invoice.supplier.tradeName || invoice.supplier.name : <span className="text-slate-400">—</span>}</td>
                      <td className="hidden text-slate-600 tabular-nums sm:table-cell">
                        {invoice.documentNumber ? `${invoice.documentNumber}${invoice.series ? `/${invoice.series}` : ''}` : '—'}
                      </td>
                      <td className="hidden text-slate-600 md:table-cell">{invoice.issueDate ? formatDate(`${invoice.issueDate}T12:00:00`) : '—'}</td>
                      <td className="hidden text-right text-slate-600 tabular-nums md:table-cell">{invoice.itemsCount}</td>
                      <td className="text-right font-medium tabular-nums">{formatMoney(invoice.total)}</td>
                      <td>
                        <Badge tone={STATUS_TONE[invoice.status]} dot>
                          {INVOICE_STATUS_LABELS[invoice.status]}
                        </Badge>
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
    </>
  );
}
