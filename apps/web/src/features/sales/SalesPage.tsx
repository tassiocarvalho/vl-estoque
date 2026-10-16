import { Banknote, Ban, Download, Percent, Receipt, ShoppingBag, TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, EmptyState, ErrorState, LoadingState, PageHeader, Pagination, StatCard, Tabs } from '@/components/ui/Display';
import { Input, Select } from '@/components/ui/Form';
import { downloadCsv, formatDateTime, formatMoney, formatNumber, toDateInput } from '@/lib/format';
import { PAYMENT_LABELS, PAYMENT_METHODS, UNIT_SHORT } from '@/lib/labels';
import type { Sale } from '@/lib/types';
import { useSales, useSalesReport } from '../pos/api';
import { SaleDetailModal, saleNumberLabel, SaleStatusBadge } from './SaleDetailModal';

type Preset = 'today' | '7d' | '30d' | 'custom';

const startOf = (date: Date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};
const endOf = (date: Date) => {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
};

function periodFor(preset: Preset, from: string, to: string) {
  const today = new Date();
  if (preset === 'custom' && from && to) {
    return { from: startOf(new Date(`${from}T00:00`)).toISOString(), to: endOf(new Date(`${to}T00:00`)).toISOString() };
  }
  const days = preset === '7d' ? 6 : preset === '30d' ? 29 : 0;
  return { from: startOf(new Date(today.getTime() - days * 86_400_000)).toISOString(), to: endOf(today).toISOString() };
}

/** Relatório de vendas do período + lista de vendas (reimpressão e cancelamento). */
export function SalesPage() {
  const [preset, setPreset] = useState<Preset>('today');
  const [customFrom, setCustomFrom] = useState(toDateInput(new Date()));
  const [customTo, setCustomTo] = useState(toDateInput(new Date()));
  const [status, setStatus] = useState('');
  const [number, setNumber] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Sale | null>(null);

  const period = useMemo(() => periodFor(preset, customFrom, customTo), [preset, customFrom, customTo]);
  const report = useSalesReport(period);
  const numberFilter = /^\d+$/.test(number) ? Number(number) : '';
  const sales = useSales({ ...(numberFilter ? {} : period), status, number: numberFilter, page, pageSize: 15 });

  const exportCsv = () => {
    if (!report.data) return;
    const r = report.data;
    downloadCsv(`vendas-${period.from.slice(0, 10)}-a-${period.to.slice(0, 10)}.csv`, [
      ['Resumo do período'],
      ['Vendas', r.totals.salesCount],
      ['Canceladas', r.totals.canceledCount],
      ['Total bruto', r.totals.gross],
      ['Descontos', r.totals.discounts],
      ['Total líquido', r.totals.net],
      ['Ticket médio', r.totals.averageTicket],
      ['Custo', r.totals.cost],
      ['Margem bruta', r.totals.margin],
      [],
      ['Forma de pagamento', 'Valor'],
      ...PAYMENT_METHODS.map((m) => [PAYMENT_LABELS[m], r.byMethod[m]]),
      [],
      ['Dia', 'Vendas', 'Total'],
      ...r.byDay.map((d) => [d.date, d.count, d.total]),
      [],
      ['Produto', 'SKU', 'Quantidade', 'Receita', 'Custo', 'Margem'],
      ...r.topProducts.map((p) => [p.name, p.sku, p.quantity, p.revenue, p.cost, p.margin]),
    ]);
  };

  const totals = report.data?.totals;
  const marginPercent = totals && totals.net > 0 ? (totals.margin / totals.net) * 100 : 0;

  return (
    <>
      <PageHeader
        title="Vendas"
        description="Relatório de vendas do período, formas de pagamento e produtos mais vendidos."
        actions={
          <Button variant="outline" icon={<Download className="size-4" />} onClick={exportCsv} disabled={!report.data}>
            Exportar CSV
          </Button>
        }
      />

      <div className="no-print mb-6 flex flex-wrap items-center gap-3">
        <Tabs
          value={preset}
          onChange={(value) => {
            setPreset(value);
            setPage(1);
          }}
          options={[
            { value: 'today', label: 'Hoje' },
            { value: '7d', label: '7 dias' },
            { value: '30d', label: '30 dias' },
            { value: 'custom', label: 'Período' },
          ]}
        />
        {preset === 'custom' && (
          <div className="flex items-center gap-2">
            <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="w-40" aria-label="Data inicial" />
            <span className="text-sm text-slate-500">até</span>
            <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="w-40" aria-label="Data final" />
          </div>
        )}
      </div>

      {report.isLoading ? (
        <LoadingState />
      ) : report.isError || !report.data || !totals ? (
        <ErrorState message="Não foi possível carregar o relatório" onRetry={report.refetch} />
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Total vendido" value={formatMoney(totals.net)} icon={<TrendingUp className="size-5" />} tone="green" hint={`Bruto ${formatMoney(totals.gross)}`} />
            <StatCard label="Vendas" value={formatNumber(totals.salesCount)} icon={<ShoppingBag className="size-5" />} tone="blue" hint={`Ticket médio ${formatMoney(totals.averageTicket)}`} />
            <StatCard label="Descontos concedidos" value={formatMoney(totals.discounts)} icon={<Percent className="size-5" />} tone="amber" />
            <StatCard
              label="Margem bruta"
              value={formatMoney(totals.margin)}
              icon={<Banknote className="size-5" />}
              tone="neutral"
              hint={`${formatNumber(Math.round(marginPercent * 10) / 10)}% · ${totals.canceledCount} cancelada(s)`}
            />
          </div>

          <div className="mb-6 grid gap-6 lg:grid-cols-3">
            <Card>
              <CardHeader title="Por forma de pagamento" description="Dinheiro já sem o troco" />
              <ul className="divide-y divide-slate-100">
                {PAYMENT_METHODS.map((m) => {
                  const value = report.data.byMethod[m];
                  const share = totals.net > 0 ? (value / totals.net) * 100 : 0;
                  return (
                    <li key={m} className="px-5 py-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600">{PAYMENT_LABELS[m]}</span>
                        <span className="font-semibold tabular-nums">{formatMoney(value)}</span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(share, 100)}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader title="Produtos mais vendidos" description="Receita antes do desconto no total da venda" />
              {report.data.topProducts.length === 0 ? (
                <EmptyState title="Nenhuma venda no período" />
              ) : (
                <div className="max-h-80 overflow-y-auto">
                  <table className="table-base">
                    <thead>
                      <tr>
                        <th>Produto</th>
                        <th className="text-right">Qtd</th>
                        <th className="text-right">Receita</th>
                        <th className="hidden text-right sm:table-cell">Margem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.data.topProducts.map((p) => (
                        <tr key={p.productId}>
                          <td>
                            <p className="font-medium text-slate-900">{p.name}</p>
                            <p className="text-xs text-slate-500">{p.sku}</p>
                          </td>
                          <td className="text-right tabular-nums">
                            {formatNumber(p.quantity)} {UNIT_SHORT[p.unit]}
                          </td>
                          <td className="text-right font-medium tabular-nums">{formatMoney(p.revenue)}</td>
                          <td className="hidden text-right text-slate-600 tabular-nums sm:table-cell">{formatMoney(p.margin)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>

          {report.data.byOperator.length > 0 && (
            <Card className="mb-6">
              <CardHeader title="Por operador" />
              <div className="flex flex-wrap">
                {report.data.byOperator.map((o) => (
                  <div key={o.operator.id} className="min-w-48 flex-1 border-r border-b border-slate-100 px-5 py-3 last:border-r-0 sm:max-w-1/4">
                    <p className="text-sm font-medium text-slate-800">{o.operator.name}</p>
                    <p className="text-lg font-semibold tabular-nums">{formatMoney(o.total)}</p>
                    <p className="text-xs text-slate-500">{o.count} venda(s)</p>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}

      <Card>
        <CardHeader
          title="Vendas"
          description="Clique numa venda para ver os itens, reimprimir ou cancelar"
          actions={
            <div className="flex flex-wrap gap-2">
              <Input
                value={number}
                onChange={(e) => {
                  setNumber(e.target.value.replace(/\D/g, ''));
                  setPage(1);
                }}
                placeholder="Nº da venda"
                className="h-9 w-32"
                aria-label="Número da venda"
              />
              <Select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
                className="h-9 w-40"
                aria-label="Situação"
              >
                <option value="">Todas</option>
                <option value="COMPLETED">Concluídas</option>
                <option value="CANCELED">Canceladas</option>
              </Select>
            </div>
          }
        />
        {sales.isLoading ? (
          <LoadingState />
        ) : sales.isError ? (
          <ErrorState message="Não foi possível carregar as vendas" onRetry={sales.refetch} />
        ) : !sales.data?.items.length ? (
          <EmptyState title="Nenhuma venda encontrada" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Venda</th>
                    <th>Data</th>
                    <th className="hidden md:table-cell">Caixa / operador</th>
                    <th className="hidden lg:table-cell">Pagamento</th>
                    <th>Situação</th>
                    <th className="text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.data.items.map((sale) => (
                    <tr key={sale.id} className="cursor-pointer" onClick={() => setSelected(sale)}>
                      <td>
                        <button type="button" className="inline-flex items-center gap-1.5 font-medium text-brand-700 hover:underline">
                          <Receipt className="size-4" />
                          {saleNumberLabel(sale)}
                        </button>
                      </td>
                      <td className="text-slate-600">{formatDateTime(sale.occurredAt)}</td>
                      <td className="hidden text-slate-600 md:table-cell">
                        {sale.session.terminal} · {sale.operator.name}
                      </td>
                      <td className="hidden text-slate-600 lg:table-cell">{[...new Set(sale.payments.map((p) => PAYMENT_LABELS[p.method]))].join(' + ')}</td>
                      <td>
                        <SaleStatusBadge sale={sale} />
                      </td>
                      <td className="text-right font-semibold tabular-nums">
                        {sale.status === 'CANCELED' ? (
                          <span className="inline-flex items-center gap-1 text-slate-400 line-through">
                            <Ban className="size-3.5" />
                            {formatMoney(sale.total)}
                          </span>
                        ) : (
                          formatMoney(sale.total)
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={15} total={sales.data.total} onChange={setPage} />
          </>
        )}
      </Card>

      <SaleDetailModal
        sale={selected}
        onClose={() => {
          setSelected(null);
          void sales.refetch();
        }}
      />
    </>
  );
}
