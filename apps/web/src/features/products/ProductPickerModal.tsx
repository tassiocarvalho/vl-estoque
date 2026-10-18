import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useDeferredValue, useEffect, useState, type KeyboardEvent } from 'react';
import { EmptyState, LoadingState } from '@/components/ui/Display';
import { Input } from '@/components/ui/Form';
import { Modal } from '@/components/ui/Modal';
import { http } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatMoney, formatQuantity } from '@/lib/format';
import type { Paginated, Product } from '@/lib/types';

/** Escolhe um produto do cadastro (nome, SKU ou código de barras; aceita o leitor). */
export function ProductPickerModal({
  open,
  title = 'Escolher produto',
  description,
  initialSearch = '',
  onClose,
  onSelect,
}: {
  open: boolean;
  title?: string;
  description?: string;
  initialSearch?: string;
  onClose: () => void;
  onSelect: (product: Product) => void;
}) {
  const [term, setTerm] = useState('');
  const [active, setActive] = useState(0);
  const deferred = useDeferredValue(term.trim());

  useEffect(() => {
    if (open) {
      setTerm(initialSearch);
      setActive(0);
    }
  }, [open, initialSearch]);

  const { data, isFetching } = useQuery({
    queryKey: ['products', 'picker', deferred],
    queryFn: () => http.get<Paginated<Product>>('/products', { search: deferred, pageSize: 10 }),
    enabled: open && deferred.length >= 2,
    staleTime: 10_000,
  });
  const items = deferred.length >= 2 ? (data?.items ?? []) : [];

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => Math.min(Math.max(i + (event.key === 'ArrowDown' ? 1 : -1), 0), Math.max(items.length - 1, 0)));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const exact = items.find((p) => p.barcode === deferred || p.sku === deferred.toUpperCase());
      const chosen = exact ?? items[active];
      if (chosen) onSelect(chosen);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={title} description={description} size="lg">
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={term}
            onChange={(e) => {
              setTerm(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Nome, SKU ou bipe o código de barras"
            className="pl-9"
            aria-label="Buscar produto"
            autoFocus
          />
        </div>
        {deferred.length < 2 ? (
          <p className="py-6 text-center text-sm text-slate-500">Digite ao menos 2 letras para buscar.</p>
        ) : isFetching && !data ? (
          <LoadingState />
        ) : items.length === 0 ? (
          <EmptyState title="Nenhum produto encontrado" description="Cadastre o produto em Produtos e volte para associar." />
        ) : (
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
            {items.map((product, index) => (
              <li key={product.id}>
                <button
                  type="button"
                  onClick={() => onSelect(product)}
                  onMouseMove={() => setActive(index)}
                  className={cn('flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left', index === active && 'bg-brand-50')}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-slate-900">{product.name}</span>
                    <span className="block text-xs text-slate-500">
                      {product.sku}
                      {product.barcode && ` · ${product.barcode}`} · estoque {formatQuantity(product.currentStock, product.unit)}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-xs text-slate-500">
                    custo {formatMoney(product.costPrice)}
                    <br />
                    venda {formatMoney(product.salePrice)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
