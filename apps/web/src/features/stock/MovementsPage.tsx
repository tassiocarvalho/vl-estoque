import { useState } from 'react';
import { Card, EmptyState, ErrorState, LoadingState, PageHeader, Pagination, Tabs } from '@/components/ui/Display';
import { Input, Select } from '@/components/ui/Form';
import { ENTRY_TYPES, EXIT_TYPES, MOVEMENT_LABELS } from '@/lib/labels';
import type { MovementType } from '@/lib/types';
import { useMovements } from './api';
import { MovementsTable } from './MovementsTable';

type Direction = '' | 'IN' | 'OUT';

/** Converte a data do campo (dia local) em início/fim do dia. */
const dayStart = (value: string) => (value ? new Date(`${value}T00:00:00`).toISOString() : undefined);
const dayEnd = (value: string) => (value ? new Date(`${value}T23:59:59.999`).toISOString() : undefined);

export function MovementsPage() {
  const [direction, setDirection] = useState<Direction>('');
  const [type, setType] = useState<MovementType | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, refetch } = useMovements({
    direction: type ? '' : direction,
    type,
    from: dayStart(from),
    to: dayEnd(to),
    page,
    pageSize: 25,
  });

  const typeOptions = direction === 'IN' ? ENTRY_TYPES : direction === 'OUT' ? EXIT_TYPES : [...ENTRY_TYPES, ...EXIT_TYPES];
  const resetPage = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    setPage(1);
  };

  return (
    <>
      <PageHeader title="Movimentações" description="Histórico completo de entradas e saídas do estoque." />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs
          value={direction}
          onChange={(value) => {
            setDirection(value);
            setType('');
            setPage(1);
          }}
          options={[
            { value: '', label: 'Todas' },
            { value: 'IN', label: 'Entradas' },
            { value: 'OUT', label: 'Saídas' },
          ]}
        />
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Select
            value={type}
            onChange={(e) => resetPage(setType)(e.target.value as MovementType | '')}
            className="col-span-2 sm:w-56"
            aria-label="Tipo"
          >
            <option value="">Todos os tipos</option>
            {typeOptions.map((option) => (
              <option key={option} value={option}>
                {MOVEMENT_LABELS[option]}
              </option>
            ))}
          </Select>
          <Input type="date" value={from} onChange={(e) => resetPage(setFrom)(e.target.value)} aria-label="De" className="sm:w-40" />
          <Input type="date" value={to} onChange={(e) => resetPage(setTo)(e.target.value)} aria-label="Até" className="sm:w-40" />
        </div>
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message="Não foi possível carregar as movimentações" onRetry={refetch} />
        ) : data && data.items.length > 0 ? (
          <>
            <MovementsTable movements={data.items} />
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />
          </>
        ) : (
          <EmptyState title="Nenhuma movimentação encontrada" description="Ajuste os filtros ou registre entradas e saídas." />
        )}
      </Card>
    </>
  );
}
