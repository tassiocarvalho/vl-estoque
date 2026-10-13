import { ArrowDownLeft, ArrowUpRight, MonitorSmartphone } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/Display';
import { cn } from '@/lib/cn';
import { formatDateTime, formatQuantity } from '@/lib/format';
import { MOVEMENT_LABELS } from '@/lib/labels';
import type { Movement } from '@/lib/types';

export function MovementsTable({ movements, showProduct = true }: { movements: Movement[]; showProduct?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="table-base">
        <thead>
          <tr>
            <th>Data</th>
            {showProduct && <th>Produto</th>}
            <th>Tipo</th>
            <th className="text-right">Quantidade</th>
            <th className="hidden text-right sm:table-cell">Saldo após</th>
            <th className="hidden lg:table-cell">Responsável</th>
          </tr>
        </thead>
        <tbody>
          {movements.map((movement) => {
            const entry = movement.direction === 'IN';
            return (
              <tr key={movement.id}>
                <td className="whitespace-nowrap text-slate-600">{formatDateTime(movement.occurredAt)}</td>
                {showProduct && (
                  <td>
                    <Link to={`/produtos/${movement.product.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                      {movement.product.name}
                    </Link>
                    <p className="text-xs text-slate-500">{movement.product.sku}</p>
                  </td>
                )}
                <td>
                  <span className="inline-flex items-center gap-2">
                    <span
                      className={cn(
                        'flex size-6 items-center justify-center rounded-full',
                        entry ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600',
                      )}
                    >
                      {entry ? <ArrowDownLeft className="size-3.5" /> : <ArrowUpRight className="size-3.5" />}
                    </span>
                    <span className="text-slate-700">{MOVEMENT_LABELS[movement.type]}</span>
                  </span>
                  {movement.note && <p className="mt-0.5 max-w-xs truncate pl-8 text-xs text-slate-400">{movement.note}</p>}
                </td>
                <td
                  className={cn(
                    'text-right font-semibold whitespace-nowrap tabular-nums',
                    entry ? 'text-emerald-700' : 'text-rose-700',
                  )}
                >
                  {entry ? '+' : '−'}
                  {formatQuantity(movement.quantity, movement.product.unit)}
                </td>
                <td className="hidden text-right whitespace-nowrap tabular-nums text-slate-600 sm:table-cell">
                  {formatQuantity(movement.balanceAfter, movement.product.unit)}
                </td>
                <td className="hidden text-slate-600 lg:table-cell">
                  {movement.source === 'PDV' ? (
                    <Badge tone="violet">
                      <MonitorSmartphone className="size-3" /> Caixa (PDV)
                    </Badge>
                  ) : (
                    (movement.user?.name ?? '—')
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
