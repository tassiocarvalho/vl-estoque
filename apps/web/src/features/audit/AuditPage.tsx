import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Badge, Card, EmptyState, ErrorState, LoadingState, PageHeader, Pagination } from '@/components/ui/Display';
import { http } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { AUDIT_ACTION_LABELS } from '@/lib/labels';
import type { AuditLog, Paginated } from '@/lib/types';

const isSecurityEvent = (action: string) => action === 'auth.login-failed' || action === 'auth.account-locked';

function describe(log: AuditLog) {
  const details = log.details ?? {};
  const parts = ['name', 'sku', 'username', 'role'].map((key) => details[key]).filter(Boolean);
  if (details.from && details.to) parts.push(`${details.from} → ${details.to}`);
  return parts.join(' · ');
}

export function AuditPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['audit', page],
    queryFn: () => http.get<Paginated<AuditLog>>('/audit', { page, pageSize: 30 }),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader title="Auditoria" description="Registro de acessos e ações importantes: quem fez, o quê e quando." />
      <Card className="overflow-hidden">
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message="Não foi possível carregar a auditoria" onRetry={refetch} />
        ) : !data || data.items.length === 0 ? (
          <EmptyState title="Nenhum registro" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Usuário</th>
                    <th>Ação</th>
                    <th className="hidden lg:table-cell">Detalhes</th>
                    <th className="hidden md:table-cell">IP</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((log) => (
                    <tr key={log.id}>
                      <td className="whitespace-nowrap text-slate-600">{formatDateTime(log.createdAt)}</td>
                      <td className="text-slate-800">{log.user?.name ?? <span className="text-slate-400">Sistema</span>}</td>
                      <td>
                        {isSecurityEvent(log.action) ? (
                          <Badge tone="red">{AUDIT_ACTION_LABELS[log.action]}</Badge>
                        ) : (
                          <span className="text-slate-700">{AUDIT_ACTION_LABELS[log.action] ?? log.action}</span>
                        )}
                      </td>
                      <td className="hidden max-w-xs truncate text-slate-500 lg:table-cell">{describe(log)}</td>
                      <td className="hidden font-mono text-xs text-slate-500 md:table-cell">{log.ip ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
