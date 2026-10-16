import { useQuery } from '@tanstack/react-query';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  ClipboardList,
  PackageCheck,
  PackageX,
  ShoppingCart,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { StockStatusBadge } from '@/components/StockStatusBadge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, EmptyState, ErrorState, LoadingState, StatCard } from '@/components/ui/Display';
import { http } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDateTime, formatQuantity } from '@/lib/format';
import { MOVEMENT_LABELS } from '@/lib/labels';
import { P } from '@/lib/permissions';
import type { Dashboard, Movement } from '@/lib/types';
import { useAuth } from '../auth/AuthProvider';
import { useMovements } from '../stock/api';
import { MissingEmailCard, WelcomeCard } from './WelcomeCard';

/** Versão compacta do histórico, para a coluna estreita do painel. */
function RecentMovements({ movements }: { movements: Movement[] }) {
  return (
    <ul className="divide-y divide-slate-100">
      {movements.map((movement) => {
        const entry = movement.direction === 'IN';
        return (
          <li key={movement.id} className="flex items-center gap-3 px-5 py-3">
            <span
              className={cn(
                'flex size-8 shrink-0 items-center justify-center rounded-full',
                entry ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600',
              )}
            >
              {entry ? <ArrowDownToLine className="size-4" /> : <ArrowUpFromLine className="size-4" />}
            </span>
            <span className="min-w-0 flex-1">
              <Link to={`/produtos/${movement.product.id}`} className="block truncate text-sm font-medium text-slate-900 hover:text-brand-700">
                {movement.product.name}
              </Link>
              <span className="block truncate text-xs text-slate-500">
                {MOVEMENT_LABELS[movement.type]} · {formatDateTime(movement.occurredAt)}
              </span>
            </span>
            <span className={cn('text-sm font-semibold whitespace-nowrap tabular-nums', entry ? 'text-emerald-700' : 'text-rose-700')}>
              {entry ? '+' : '−'}
              {formatQuantity(movement.quantity, movement.product.unit)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
}

export function DashboardPage() {
  const { user, can } = useAuth();
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => http.get<Dashboard>('/reports/dashboard'),
    refetchInterval: 60_000,
  });
  const recent = useMovements({ page: 1, pageSize: 8 }, can(P.MOVEMENT_READ));

  if (isLoading) return <LoadingState />;
  if (isError || !data) return <ErrorState message="Não foi possível carregar o painel" onRetry={refetch} />;

  const { products } = data;

  return (
    <>
      <MissingEmailCard />
      <WelcomeCard />
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {greeting()}, {user?.name.split(' ')[0]}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })} · resumo do estoque
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {can(P.STOCK_IN) && (
            <Button variant="outline" icon={<ArrowDownToLine className="size-4" />} onClick={() => navigate('/entrada')}>
              Entrada
            </Button>
          )}
          {can(P.STOCK_OUT) && (
            <Button icon={<ArrowUpFromLine className="size-4" />} onClick={() => navigate('/saida')}>
              Saída
            </Button>
          )}
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Produtos ativos"
          value={products.total}
          hint={`${products.ok} com estoque normal`}
          icon={<PackageCheck className="size-5" />}
          tone="green"
          onClick={() => navigate('/produtos')}
        />
        <StatCard
          label="Precisam de reposição"
          value={products.reorder + products.critical}
          hint={`${products.critical} em nível crítico`}
          icon={<AlertTriangle className="size-5" />}
          tone="amber"
          onClick={() => navigate('/produtos?status=ATTENTION')}
        />
        <StatCard
          label="Sem estoque (ruptura)"
          value={products.outOfStock}
          icon={<PackageX className="size-5" />}
          tone="red"
          onClick={() => navigate('/produtos?status=OUT_OF_STOCK')}
        />
        <StatCard
          label="Pedidos em aberto"
          value={data.openPurchaseRequests}
          hint={`Hoje: ${data.today.entries} entradas · ${data.today.exits} saídas`}
          icon={<ClipboardList className="size-5" />}
          tone="blue"
          onClick={can(P.PURCHASE_READ) ? () => navigate('/pedidos') : undefined}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        <Card className="overflow-hidden xl:col-span-3">
          <CardHeader
            title="Alertas de reposição"
            description="Produtos no ponto de pedido ou abaixo, do mais urgente ao menos urgente"
            actions={
              <Link to="/produtos?status=ATTENTION" className="text-sm font-medium text-brand-700 hover:underline">
                Ver todos
              </Link>
            }
          />
          {data.alerts.length === 0 ? (
            <EmptyState title="Tudo em ordem!" description="Nenhum produto precisa de reposição agora." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.alerts.map((product) => {
                const fill = product.reorderPoint > 0 ? Math.min(product.currentStock / product.reorderPoint, 1) : 0;
                return (
                  <li key={product.id}>
                    <Link to={`/produtos/${product.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-slate-50">
                      <span
                        className={
                          product.status === 'OUT_OF_STOCK'
                            ? 'text-red-500'
                            : product.status === 'CRITICAL'
                              ? 'text-orange-500'
                              : 'text-amber-500'
                        }
                      >
                        {product.status === 'OUT_OF_STOCK' ? <AlertOctagon className="size-5" /> : <AlertTriangle className="size-5" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-900">{product.name}</span>
                        <span className="mt-1.5 block h-1.5 w-full max-w-48 overflow-hidden rounded-full bg-slate-100">
                          <span
                            className={
                              product.status === 'OUT_OF_STOCK' || product.status === 'CRITICAL'
                                ? 'block h-full rounded-full bg-orange-500'
                                : 'block h-full rounded-full bg-amber-400'
                            }
                            style={{ width: `${Math.max(fill * 100, 3)}%` }}
                          />
                        </span>
                      </span>
                      <span className="hidden text-right text-xs text-slate-500 sm:block">
                        <span className="block text-sm font-semibold text-slate-900">{formatQuantity(product.currentStock, product.unit)}</span>
                        PP {formatQuantity(product.reorderPoint, product.unit)}
                      </span>
                      <StockStatusBadge status={product.status} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card className="overflow-hidden xl:col-span-2">
          <CardHeader
            title="Últimas movimentações"
            actions={
              can(P.MOVEMENT_READ) && (
                <Link to="/movimentacoes" className="text-sm font-medium text-brand-700 hover:underline">
                  Ver histórico
                </Link>
              )
            }
          />
          {!can(P.MOVEMENT_READ) ? (
            <EmptyState
              title="Pronto para vender"
              description="Use a tela de saída para registrar as vendas pela bipagem."
              action={
                <Button icon={<ShoppingCart className="size-4" />} onClick={() => navigate('/saida')}>
                  Registrar saída
                </Button>
              }
            />
          ) : recent.data && recent.data.items.length > 0 ? (
            <RecentMovements movements={recent.data.items} />
          ) : recent.isLoading ? (
            <LoadingState />
          ) : (
            <EmptyState title="Nenhuma movimentação ainda" />
          )}
        </Card>
      </div>
    </>
  );
}
