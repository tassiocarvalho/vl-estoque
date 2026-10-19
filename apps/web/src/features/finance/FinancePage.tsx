import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, FileDown, Printer, Scale, TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, ErrorState, LoadingState, PageHeader, StatCard, Tabs } from '@/components/ui/Display';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Form';
import { http } from '@/lib/api';
import { cn } from '@/lib/cn';
import { downloadCsv, formatDate, formatMoney, formatNumber, toDateInput } from '@/lib/format';

interface FlowDay {
  date: string;
  inRealized: number;
  outRealized: number;
  inProjected: number;
  outProjected: number;
  net: number;
  cumulative: number;
}

interface CashFlow {
  period: { from: string; to: string };
  today: string;
  days: FlowDay[];
  totals: { inRealized: number; outRealized: number; inProjected: number; outProjected: number; balance: number };
  categories: { in: { category: string; realized: number; projected: number }[]; out: { category: string; realized: number; projected: number }[] };
  overdue: { receivables: number; payables: number };
  cardFees: number;
}

interface FinanceResult {
  period: { from: string; to: string };
  salesCount: number;
  lines: {
    grossSales: number;
    discounts: number;
    sales: number;
    returns: number;
    netRevenue: number;
    cmv: number;
    grossProfit: number;
    grossMargin: number;
    cardFees: number;
    losses: number;
    expenses: number;
    result: number;
    resultMargin: number;
  };
  expenses: { category: string; amount: number; percent: number }[];
  info: { merchandisePurchases: number; openReceivables: number };
}

type Preset = 'month' | 'next30' | 'lastMonth' | 'last30' | 'custom';
const day = (iso: string) => formatDate(`${iso}T12:00:00`);
const shift = (iso: string, days: number) => toDateInput(new Date(new Date(`${iso}T12:00:00`).getTime() + days * 86_400_000));

function presetRange(preset: Preset, today: string): { from: string; to: string } {
  const monthStart = `${today.slice(0, 7)}-01`;
  if (preset === 'next30') return { from: today, to: shift(today, 30) };
  if (preset === 'last30') return { from: shift(today, -29), to: today };
  if (preset === 'lastMonth') {
    const lastEnd = shift(monthStart, -1);
    return { from: `${lastEnd.slice(0, 7)}-01`, to: lastEnd };
  }
  return { from: monthStart, to: today };
}

/** Fluxo de caixa (realizado e previsto) e resultado do período (DRE gerencial) — RF25. */
export function FinancePage() {
  const today = toDateInput(new Date());
  const [tab, setTab] = useState<'flow' | 'result'>('flow');
  const [preset, setPreset] = useState<Preset>('next30');
  const [custom, setCustom] = useState(() => presetRange('month', today));
  const range = preset === 'custom' ? custom : presetRange(preset, today);
  const valid = range.from <= range.to;

  const flow = useQuery({
    queryKey: ['finance', 'cash-flow', range],
    queryFn: () => http.get<CashFlow>('/finance/cash-flow', range),
    enabled: tab === 'flow' && valid,
    placeholderData: keepPreviousData,
  });
  const result = useQuery({
    queryKey: ['finance', 'result', range],
    queryFn: () => http.get<FinanceResult>('/finance/result', range),
    enabled: tab === 'result' && valid,
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        title="Fluxo de caixa e resultado"
        description="Quanto entrou e vai entrar, quanto saiu e vai sair, e o lucro do período."
        actions={
          <Button variant="outline" icon={<Printer className="size-4" />} onClick={() => window.print()}>
            Imprimir
          </Button>
        }
      />

      <div className="no-print mb-5 flex flex-wrap items-center gap-3">
        <Tabs
          value={tab}
          onChange={(value) => {
            setTab(value);
            if (value === 'result' && (preset === 'next30')) setPreset('month');
            if (value === 'flow' && preset === 'month') setPreset('next30');
          }}
          options={[
            { value: 'flow', label: 'Fluxo de caixa' },
            { value: 'result', label: 'Resultado (DRE)' },
          ]}
        />
        <Tabs
          value={preset}
          onChange={setPreset}
          options={[
            ...(tab === 'flow' ? [{ value: 'next30' as Preset, label: 'Hoje + 30 dias' }] : []),
            { value: 'month', label: 'Este mês' },
            { value: 'lastMonth', label: 'Mês passado' },
            { value: 'last30', label: 'Últimos 30 dias' },
            { value: 'custom', label: 'Período' },
          ]}
        />
        {preset === 'custom' && (
          <div className="flex items-center gap-2">
            <Input type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} className="w-40" aria-label="De" />
            <span className="text-sm text-slate-500">até</span>
            <Input type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} className="w-40" aria-label="Até" />
          </div>
        )}
      </div>
      <p className="mb-4 hidden text-sm text-slate-600 print:block">
        Período: {day(range.from)} a {day(range.to)}
      </p>

      {!valid ? (
        <ErrorState message="A data inicial deve ser anterior à final" />
      ) : tab === 'flow' ? (
        flow.isLoading || !flow.data ? (
          flow.isError ? <ErrorState message="Não foi possível carregar o fluxo de caixa" onRetry={flow.refetch} /> : <LoadingState />
        ) : (
          <CashFlowView data={flow.data} />
        )
      ) : result.isLoading || !result.data ? (
        result.isError ? <ErrorState message="Não foi possível carregar o resultado" onRetry={result.refetch} /> : <LoadingState />
      ) : (
        <ResultView data={result.data} />
      )}
    </>
  );
}

function CashFlowView({ data }: { data: CashFlow }) {
  const { totals } = data;
  const exportCsv = () =>
    downloadCsv(`fluxo-de-caixa-${data.period.from}-a-${data.period.to}.csv`, [
      ['Dia', 'Entradas', 'Saídas', 'Entradas previstas', 'Saídas previstas', 'Saldo do dia', 'Saldo acumulado'],
      ...data.days.map((d) => [day(d.date), d.inRealized, d.outRealized, d.inProjected, d.outProjected, d.net, d.cumulative]),
    ]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-5">
        <StatCard label="Entrou" value={formatMoney(totals.inRealized)} icon={<ArrowDownCircle className="size-5" />} tone="green" />
        <StatCard label="Saiu" value={formatMoney(totals.outRealized)} icon={<ArrowUpCircle className="size-5" />} tone="red" />
        <StatCard label="Vai entrar" value={formatMoney(totals.inProjected)} icon={<ArrowDownCircle className="size-5" />} tone="blue" hint="Cartões, fiado a vencer" />
        <StatCard label="Vai sair" value={formatMoney(totals.outProjected)} icon={<ArrowUpCircle className="size-5" />} tone="amber" hint="Contas a vencer" />
        <StatCard label="Saldo do período" value={formatMoney(totals.balance)} icon={<Scale className="size-5" />} tone={totals.balance >= 0 ? 'green' : 'red'} />
      </div>

      {(data.overdue.receivables > 0 || data.overdue.payables > 0) && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="size-4" />
          {data.overdue.receivables > 0 && (
            <Link to="/fiado" className="hover:underline">
              Fiado vencido a receber: <b>{formatMoney(data.overdue.receivables)}</b>
            </Link>
          )}
          {data.overdue.payables > 0 && (
            <Link to="/contas-a-pagar" className="hover:underline">
              Contas vencidas a pagar: <b>{formatMoney(data.overdue.payables)}</b>
            </Link>
          )}
          <span className="text-xs text-amber-800">Não entram no gráfico: estão atrasadas.</span>
        </div>
      )}

      <Card>
        <CardHeader
          title="Dia a dia"
          description="Barras: entradas (acima) e saídas (abaixo); mais claras = previstas. Linha: saldo acumulado."
          actions={
            <Button size="sm" variant="ghost" icon={<FileDown className="size-4" />} onClick={exportCsv}>
              Exportar Excel (CSV)
            </Button>
          }
        />
        <FlowChart days={data.days} today={data.today} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {(['in', 'out'] as const).map((direction) => (
          <Card key={direction}>
            <CardHeader title={direction === 'in' ? 'De onde vem o dinheiro' : 'Para onde vai o dinheiro'} />
            {data.categories[direction].length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500">Nada no período.</p>
            ) : (
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Categoria</th>
                    <th className="text-right">Realizado</th>
                    <th className="text-right">Previsto</th>
                  </tr>
                </thead>
                <tbody>
                  {data.categories[direction].map((c) => (
                    <tr key={c.category}>
                      <td>{c.category}</td>
                      <td className="text-right tabular-nums">{formatMoney(c.realized)}</td>
                      <td className="text-right text-slate-500 tabular-nums">{c.projected ? formatMoney(c.projected) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        ))}
      </div>
      {data.cardFees > 0 && <p className="text-xs text-slate-500">As vendas no cartão já entram sem a taxa da operadora ({formatMoney(data.cardFees)} no período), no dia do recebimento.</p>}
    </div>
  );
}

/** Gráfico de barras (entradas/saídas) com a linha do saldo acumulado — SVG simples, sem biblioteca. */
function FlowChart({ days, today }: { days: FlowDay[]; today: string }) {
  const width = 900;
  const height = 260;
  const pad = { top: 16, bottom: 28, left: 8, right: 8 };
  const chart = useMemo(() => {
    const maxBar = Math.max(1, ...days.map((d) => Math.max(d.inRealized + d.inProjected, d.outRealized + d.outProjected)));
    const cumulative = days.map((d) => d.cumulative);
    const maxAbs = Math.max(maxBar, ...cumulative.map(Math.abs));
    const mid = pad.top + (height - pad.top - pad.bottom) / 2;
    const scale = (height - pad.top - pad.bottom) / 2 / maxAbs;
    const slot = (width - pad.left - pad.right) / Math.max(days.length, 1);
    return { mid, scale, slot };
  }, [days]);
  const { mid, scale, slot } = chart;
  const barWidth = Math.max(slot * 0.6, 1);
  const x = (index: number) => pad.left + index * slot + slot / 2;
  const line = days.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${(mid - d.cumulative * scale).toFixed(1)}`).join(' ');
  const labelEvery = Math.ceil(days.length / 10);

  return (
    <div className="overflow-x-auto px-3 pb-3">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-64 w-full min-w-[640px]" role="img" aria-label="Fluxo de caixa por dia">
        <line x1={pad.left} x2={width - pad.right} y1={mid} y2={mid} className="stroke-slate-300" strokeWidth={1} />
        {days.map((d, i) => {
          const cx = x(i) - barWidth / 2;
          const inR = d.inRealized * scale;
          const inP = d.inProjected * scale;
          const outR = d.outRealized * scale;
          const outP = d.outProjected * scale;
          return (
            <g key={d.date}>
              <title>
                {`${day(d.date)} · entrou ${formatMoney(d.inRealized + d.inProjected)} · saiu ${formatMoney(d.outRealized + d.outProjected)} · acumulado ${formatMoney(d.cumulative)}`}
              </title>
              {inR > 0 && <rect x={cx} y={mid - inR} width={barWidth} height={inR} className="fill-emerald-500" />}
              {inP > 0 && <rect x={cx} y={mid - inR - inP} width={barWidth} height={inP} className="fill-emerald-300" />}
              {outR > 0 && <rect x={cx} y={mid} width={barWidth} height={outR} className="fill-red-500" />}
              {outP > 0 && <rect x={cx} y={mid + outR} width={barWidth} height={outP} className="fill-red-300" />}
              {d.date === today && <line x1={x(i)} x2={x(i)} y1={pad.top} y2={height - pad.bottom} className="stroke-brand-600" strokeDasharray="3 3" />}
              {i % labelEvery === 0 && (
                <text x={x(i)} y={height - 8} textAnchor="middle" className="fill-slate-400 text-[10px]">
                  {d.date.slice(8, 10)}/{d.date.slice(5, 7)}
                </text>
              )}
            </g>
          );
        })}
        <path d={line} fill="none" className="stroke-brand-700" strokeWidth={2} />
      </svg>
      <div className="flex flex-wrap gap-4 px-2 text-xs text-slate-500">
        <Legend color="bg-emerald-500" label="Entrou" />
        <Legend color="bg-emerald-300" label="Vai entrar" />
        <Legend color="bg-red-500" label="Saiu" />
        <Legend color="bg-red-300" label="Vai sair" />
        <Legend color="bg-brand-700" label="Saldo acumulado" />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('size-2.5 rounded-sm', color)} />
      {label}
    </span>
  );
}

function ResultView({ data }: { data: FinanceResult }) {
  const L = data.lines;
  const pct = (value: number) => (L.netRevenue > 0 ? `${formatNumber(Math.round((value / L.netRevenue) * 1000) / 10)}%` : '—');
  const rows: { label: string; value: number; kind?: 'minus' | 'total' | 'result'; hint?: string; indent?: boolean }[] = [
    { label: 'Vendas', value: L.sales, hint: `${data.salesCount} venda(s); bruto ${formatMoney(L.grossSales)} − descontos ${formatMoney(L.discounts)}` },
    { label: 'Devoluções', value: L.returns, kind: 'minus' },
    { label: 'Receita líquida', value: L.netRevenue, kind: 'total' },
    { label: 'Custo das mercadorias vendidas (CMV)', value: L.cmv, kind: 'minus', hint: 'Pelo custo médio de cada produto na venda' },
    { label: 'Lucro bruto', value: L.grossProfit, kind: 'total', hint: `Margem bruta ${formatNumber(L.grossMargin)}%` },
    { label: 'Taxas de cartão', value: L.cardFees, kind: 'minus' },
    { label: 'Perdas de estoque (avaria, vencimento)', value: L.losses, kind: 'minus' },
    { label: 'Despesas', value: L.expenses, kind: 'minus', hint: 'Contas a pagar do período, menos compra de mercadoria' },
    ...data.expenses.map((e) => ({ label: e.category, value: e.amount, indent: true })),
    { label: L.result >= 0 ? 'Lucro do período' : 'Prejuízo do período', value: L.result, kind: 'result' as const, hint: `${formatNumber(L.resultMargin)}% da receita líquida` },
  ];

  const exportCsv = () =>
    downloadCsv(`resultado-${data.period.from}-a-${data.period.to}.csv`, [
      ['Linha', 'Valor', '% da receita líquida'],
      ...rows.map((r) => [r.indent ? `  ${r.label}` : r.label, r.kind === 'minus' ? -r.value : r.value, pct(r.value)]),
    ]);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <Card>
        <CardHeader
          title={`Resultado de ${day(data.period.from)} a ${day(data.period.to)}`}
          description="DRE gerencial (não substitui a contabilidade)"
          actions={
            <Button size="sm" variant="ghost" icon={<FileDown className="size-4" />} onClick={exportCsv}>
              Exportar Excel (CSV)
            </Button>
          }
        />
        <table className="table-base">
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.label}-${r.indent ? 'i' : ''}`} className={cn(r.kind === 'total' && 'bg-slate-50', r.kind === 'result' && (r.value >= 0 ? 'bg-emerald-50' : 'bg-red-50'))}>
                <td className={cn(r.indent && 'pl-10 text-slate-500', (r.kind === 'total' || r.kind === 'result') && 'font-semibold text-slate-900')}>
                  {r.kind === 'minus' && '(−) '}
                  {r.label}
                  {r.hint && <p className="text-xs font-normal text-slate-500">{r.hint}</p>}
                </td>
                <td
                  className={cn(
                    'text-right tabular-nums',
                    r.indent && 'text-slate-500',
                    r.kind === 'minus' && 'text-red-700',
                    (r.kind === 'total' || r.kind === 'result') && 'font-semibold',
                    r.kind === 'result' && (r.value >= 0 ? 'text-lg text-emerald-700' : 'text-lg text-red-700'),
                  )}
                >
                  {r.kind === 'minus' && r.value > 0 ? `−${formatMoney(r.value)}` : formatMoney(r.value)}
                </td>
                <td className="w-20 text-right text-xs text-slate-500 tabular-nums">{pct(r.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <div className="space-y-3">
        <StatCard label="Margem bruta" value={`${formatNumber(L.grossMargin)}%`} icon={<TrendingUp className="size-5" />} tone="blue" />
        <StatCard label="Comprado em mercadoria" value={formatMoney(data.info.merchandisePurchases)} icon={<ArrowUpCircle className="size-5" />} hint="Vira custo quando é vendido" />
        <StatCard label="Fiado em aberto (total)" value={formatMoney(data.info.openReceivables)} icon={<ArrowDownCircle className="size-5" />} tone="amber" hint="Vendido e ainda não recebido" />
        <p className="px-1 text-xs text-slate-500">
          O resultado é por competência: vendas pela data da venda e despesas pelo vencimento. Para saber quando o dinheiro entra e sai, use o fluxo de caixa.
        </p>
      </div>
    </div>
  );
}
