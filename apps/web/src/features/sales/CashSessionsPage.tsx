import { FileDown, Printer } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge, Card, EmptyState, ErrorState, LoadingState, PageHeader, Pagination } from '@/components/ui/Display';
import { IconButton } from '@/components/ui/Button';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDateTime, formatMoney } from '@/lib/format';
import { fetchCashReport, useCashSessions } from '../pos/api';
import { usePrinter } from '../printing/usePrinter';

/** Histórico dos turnos de caixa: abertura, fechamento e diferença (falta/sobra), com reimpressão. */
export function CashSessionsPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, refetch } = useCashSessions({ page, pageSize: 20 });
  const { printCashReport, pdf } = usePrinter();

  const withReport = async (id: string, action: (report: Awaited<ReturnType<typeof fetchCashReport>>) => Promise<void> | void) => {
    try {
      await action(await fetchCashReport(id));
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <>
      <PageHeader title="Caixas" description="Aberturas e fechamentos de caixa, com a conferência do dinheiro de cada turno." />
      <Card>
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message="Não foi possível carregar os caixas" onRetry={refetch} />
        ) : !data?.items.length ? (
          <EmptyState title="Nenhum caixa aberto ainda" description="Os turnos aparecem aqui quando um operador abre o caixa na frente de loja." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Terminal</th>
                    <th>Abertura</th>
                    <th className="hidden md:table-cell">Fechamento</th>
                    <th className="text-right">Vendas</th>
                    <th className="hidden text-right sm:table-cell">Esperado</th>
                    <th className="hidden text-right sm:table-cell">Contado</th>
                    <th className="text-right">Diferença</th>
                    <th className="w-20" />
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <p className="font-medium text-slate-900">{s.terminal}</p>
                        {s.status === 'OPEN' ? <Badge tone="green" dot>Aberto</Badge> : <Badge dot>Fechado</Badge>}
                      </td>
                      <td className="text-slate-600">
                        {formatDateTime(s.openedAt)}
                        <span className="block text-xs text-slate-400">{s.openedBy.name}</span>
                      </td>
                      <td className="hidden text-slate-600 md:table-cell">
                        {s.closedAt ? formatDateTime(s.closedAt) : '—'}
                        {s.closedBy && <span className="block text-xs text-slate-400">{s.closedBy.name}</span>}
                      </td>
                      <td className="text-right tabular-nums">
                        {s.salesCount}
                        {s.salesTotal !== null && <span className="block text-xs text-slate-500">{formatMoney(s.salesTotal)}</span>}
                      </td>
                      <td className="hidden text-right tabular-nums sm:table-cell">{s.expectedCash !== null ? formatMoney(s.expectedCash) : '—'}</td>
                      <td className="hidden text-right tabular-nums sm:table-cell">{s.countedCash !== null ? formatMoney(s.countedCash) : '—'}</td>
                      <td
                        className={cn(
                          'text-right font-semibold tabular-nums',
                          s.difference === null ? 'text-slate-400' : s.difference < 0 ? 'text-red-700' : s.difference > 0 ? 'text-amber-800' : 'text-emerald-700',
                        )}
                      >
                        {s.difference === null ? '—' : `${s.difference > 0 ? '+' : ''}${formatMoney(s.difference)}`}
                      </td>
                      <td className="text-right whitespace-nowrap">
                        <IconButton label="Imprimir relatório do caixa" onClick={() => void withReport(s.id, printCashReport)}>
                          <Printer className="size-4" />
                        </IconButton>
                        <IconButton label="Baixar PDF" onClick={() => void withReport(s.id, pdf.cashReport)}>
                          <FileDown className="size-4" />
                        </IconButton>
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
