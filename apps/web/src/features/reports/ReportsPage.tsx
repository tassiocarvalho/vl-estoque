import { useQuery } from '@tanstack/react-query';
import { ArrowDownToLine, ArrowUpFromLine, Download, PackageX, Printer, Snowflake } from 'lucide-react';
import { useMemo, useState } from 'react';
import { StockStatusBadge } from '@/components/StockStatusBadge';
import { Button } from '@/components/ui/Button';
import { Badge, Card, EmptyState, ErrorState, LoadingState, PageHeader, StatCard, Tabs } from '@/components/ui/Display';
import { Input } from '@/components/ui/Form';
import { http } from '@/lib/api';
import { downloadCsv, formatDate, formatDateTime, formatNumber, formatQuantity, toDateInput } from '@/lib/format';
import { MOVEMENT_LABELS, PURCHASE_STATUS_LABELS, STATUS_LABELS, UNIT_SHORT } from '@/lib/labels';
import type { MovementsReport, MovementType, ReportRow } from '@/lib/types';

type Preset = 'today' | '7d' | '30d' | 'month' | 'custom';
type View = 'products' | 'stagnant' | 'ruptures' | 'requests';

function presetRange(preset: Preset): [string, string] {
  const today = new Date();
  const start = new Date(today);
  if (preset === '7d') start.setDate(today.getDate() - 6);
  if (preset === '30d') start.setDate(today.getDate() - 29);
  if (preset === 'month') start.setDate(1);
  return [toDateInput(start), toDateInput(today)];
}

function RowsTable({ rows }: { rows: ReportRow[] }) {
  if (rows.length === 0) return <EmptyState title="Nenhum produto nesta lista" />;
  return (
    <div className="overflow-x-auto">
      <table className="table-base">
        <thead>
          <tr>
            <th>Produto</th>
            <th className="text-right">Entradas</th>
            <th className="text-right">Saídas</th>
            <th className="hidden text-right md:table-cell">Saldo do período</th>
            <th className="hidden text-right sm:table-cell">Saldo atual</th>
            <th>Situação</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.product.id}>
              <td>
                <p className="font-medium text-slate-900">{row.product.name}</p>
                <p className="text-xs text-slate-500">
                  {row.product.sku} · {row.product.category}
                </p>
              </td>
              <td className="text-right tabular-nums text-emerald-700">{formatNumber(row.entries)}</td>
              <td className="text-right tabular-nums text-rose-700">{formatNumber(row.exits)}</td>
              <td className="hidden text-right tabular-nums md:table-cell">
                {row.net > 0 ? '+' : ''}
                {formatNumber(row.net)}
              </td>
              <td className="hidden text-right font-medium tabular-nums sm:table-cell">
                {formatQuantity(row.currentStock, row.product.unit)}
              </td>
              <td>
                <StockStatusBadge status={row.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ReportsPage() {
  const [preset, setPreset] = useState<Preset>('30d');
  const [[from, to], setRange] = useState(presetRange('30d'));
  const [view, setView] = useState<View>('products');
  const [filter, setFilter] = useState('');

  const query = {
    from: new Date(`${from}T00:00:00`).toISOString(),
    to: new Date(`${to}T23:59:59.999`).toISOString(),
  };
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['reports', 'movements', query],
    queryFn: () => http.get<MovementsReport>('/reports/movements', query),
    enabled: Boolean(from && to),
  });

  const choosePreset = (value: Preset) => {
    setPreset(value);
    if (value !== 'custom') setRange(presetRange(value));
  };

  const filteredRows = useMemo(() => {
    if (!data) return [];
    const term = filter.trim().toLowerCase();
    const source = view === 'stagnant' ? data.stagnant : view === 'ruptures' ? data.ruptures : data.rows;
    const rows = term ? source.filter((r) => `${r.product.name} ${r.product.sku}`.toLowerCase().includes(term)) : source;
    // Mais movimentados primeiro.
    return [...rows].sort((a, b) => b.exits + b.entries - (a.exits + a.entries));
  }, [data, view, filter]);

  const exportCsv = () => {
    if (!data) return;
    const header = ['Produto', 'SKU', 'Categoria', 'Unidade', 'Entradas', 'Saídas', 'Saldo do período', 'Saldo atual', 'Ponto de pedido', 'Situação'];
    const rows = filteredRows.map((r) => [
      r.product.name,
      r.product.sku,
      r.product.category,
      UNIT_SHORT[r.product.unit],
      r.entries,
      r.exits,
      r.net,
      r.currentStock,
      r.reorderPoint,
      STATUS_LABELS[r.status],
    ]);
    downloadCsv(`relatorio-estoque_${from}_a_${to}.csv`, [header, ...rows]);
  };

  return (
    <>
      <PageHeader
        title="Relatórios"
        description="Movimentação por período: identifique estoque parado, rupturas e o que mais sai."
        actions={
          <>
            <Button variant="outline" icon={<Download className="size-4" />} onClick={exportCsv} disabled={!data}>
              Exportar Excel (CSV)
            </Button>
            <Button variant="outline" icon={<Printer className="size-4" />} onClick={() => window.print()} disabled={!data}>
              Imprimir
            </Button>
          </>
        }
      />

      <Card className="no-print mb-6 flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
        <Tabs
          value={preset}
          onChange={choosePreset}
          options={[
            { value: 'today', label: 'Hoje' },
            { value: '7d', label: '7 dias' },
            { value: '30d', label: '30 dias' },
            { value: 'month', label: 'Este mês' },
            { value: 'custom', label: 'Personalizado' },
          ]}
        />
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={from}
            max={to}
            onChange={(e) => {
              setPreset('custom');
              setRange([e.target.value, to]);
            }}
            aria-label="Data inicial"
            className="w-40"
          />
          <span className="text-sm text-slate-400">até</span>
          <Input
            type="date"
            value={to}
            min={from}
            onChange={(e) => {
              setPreset('custom');
              setRange([from, e.target.value]);
            }}
            aria-label="Data final"
            className="w-40"
          />
        </div>
      </Card>

      <p className="mb-4 hidden text-sm text-slate-600 print:block">
        Período: {formatDate(query.from)} a {formatDate(query.to)}
      </p>

      {isLoading ? (
        <LoadingState label="Gerando relatório..." />
      ) : isError || !data ? (
        <ErrorState message="Não foi possível gerar o relatório" onRetry={refetch} />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
            <StatCard label="Entradas registradas" value={data.totals.entryCount} hint="Lançamentos no período" icon={<ArrowDownToLine className="size-5" />} tone="green" />
            <StatCard label="Saídas registradas" value={data.totals.exitCount} hint={`${data.totals.productsMoved} produto(s) movimentado(s)`} icon={<ArrowUpFromLine className="size-5" />} tone="blue" />
            <StatCard label="Estoque parado" value={data.stagnant.length} hint="Sem saída no período" icon={<Snowflake className="size-5" />} tone="amber" />
            <StatCard label="Rupturas" value={data.ruptures.length} hint="Produtos sem estoque" icon={<PackageX className="size-5" />} tone="red" />
          </div>

          <Card className="mb-6 p-5">
            <p className="mb-3 text-sm font-semibold text-slate-900">Lançamentos por tipo de movimentação</p>
            <div className="flex flex-wrap gap-2">
              {(Object.entries(data.byType) as [MovementType, number][]).map(([type, value]) => (
                <Badge key={type} tone={type.startsWith('IN') ? 'green' : 'neutral'}>
                  {MOVEMENT_LABELS[type]}: <strong>{value}</strong>
                </Badge>
              ))}
            </div>
          </Card>

          <div className="no-print mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Tabs
              value={view}
              onChange={setView}
              options={[
                { value: 'products', label: 'Por produto', count: data.rows.length },
                { value: 'stagnant', label: 'Estoque parado', count: data.stagnant.length },
                { value: 'ruptures', label: 'Rupturas', count: data.ruptures.length },
                { value: 'requests', label: 'Solicitações de pedido', count: data.purchaseRequests.length },
              ]}
            />
            {view !== 'requests' && (
              <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtrar produto..." className="sm:w-64" />
            )}
          </div>

          <Card className="print-full overflow-hidden">
            {view === 'requests' ? (
              data.purchaseRequests.length === 0 ? (
                <EmptyState title="Nenhuma solicitação de pedido no período" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="table-base">
                    <thead>
                      <tr>
                        <th>Data</th>
                        <th>Produto</th>
                        <th className="text-right">Quantidade</th>
                        <th>Origem</th>
                        <th>Situação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.purchaseRequests.map((request) => (
                        <tr key={request.id}>
                          <td className="whitespace-nowrap text-slate-600">{formatDateTime(request.createdAt)}</td>
                          <td>
                            <p className="font-medium text-slate-900">{request.product.name}</p>
                            <p className="text-xs text-slate-500">{request.product.sku}</p>
                          </td>
                          <td className="text-right tabular-nums">{formatQuantity(request.suggestedQuantity, request.product.unit)}</td>
                          <td className="text-slate-600">{request.createdBy?.name ?? 'Automática'}</td>
                          <td>{PURCHASE_STATUS_LABELS[request.status]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : (
              <RowsTable rows={filteredRows} />
            )}
          </Card>
        </>
      )}
    </>
  );
}
