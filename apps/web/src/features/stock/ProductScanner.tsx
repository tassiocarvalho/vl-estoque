import { useQuery } from '@tanstack/react-query';
import { Loader2, ScanBarcode } from 'lucide-react';
import { forwardRef, useDeferredValue, useState, type KeyboardEvent } from 'react';
import { toast } from 'sonner';
import { StockStatusBadge } from '@/components/StockStatusBadge';
import { ApiError, errorMessage, http, isNetworkError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatQuantity } from '@/lib/format';
import type { Paginated, Product } from '@/lib/types';
import { catalog, type CatalogItem } from '../offline/offline-store';

/** Busca na API; sem internet, usa o catálogo salvo no dispositivo. */
export async function searchProducts(term: string): Promise<CatalogItem[]> {
  try {
    return (await http.get<Paginated<Product>>('/products', { search: term, pageSize: 8 })).items;
  } catch (error) {
    if (isNetworkError(error)) return catalog.search(term);
    throw error;
  }
}

export async function findByCode(code: string): Promise<CatalogItem | null> {
  try {
    return await http.get<Product>('/products/lookup', { code });
  } catch (error) {
    if (isNetworkError(error)) return (await catalog.findByCode(code)) ?? null;
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

/** Produto pelo código da balança (lido da etiqueta). */
export async function findByScaleCode(scaleCode: string): Promise<CatalogItem | null> {
  try {
    return await http.get<Product>('/products/lookup', { code: scaleCode, scale: true });
  } catch (error) {
    if (isNetworkError(error)) return (await catalog.findByScaleCode(scaleCode)) ?? null;
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

interface ProductScannerProps {
  onSelect: (product: CatalogItem) => void;
}

/**
 * Campo de bipagem: o leitor de código de barras "digita" o código e envia Enter.
 * Também permite buscar digitando parte do nome ou do SKU.
 */
export const ProductScanner = forwardRef<HTMLInputElement, ProductScannerProps>(({ onSelect }, ref) => {
  const [term, setTerm] = useState('');
  const [resolving, setResolving] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const deferred = useDeferredValue(term.trim());
  const looksLikeBarcode = /^\d{8,14}$/.test(deferred);

  const { data: suggestions = [], isFetching } = useQuery({
    queryKey: ['scanner-search', deferred],
    queryFn: () => searchProducts(deferred),
    enabled: deferred.length >= 2 && !looksLikeBarcode,
    staleTime: 10_000,
    retry: false,
  });
  const visible = deferred.length >= 2 && !looksLikeBarcode ? suggestions : [];

  const choose = (product: CatalogItem) => {
    setTerm('');
    setHighlight(0);
    onSelect(product);
  };

  const resolveCode = async () => {
    const code = term.trim();
    if (!code) return;
    if (visible[highlight] && !looksLikeBarcode && visible.length > 0) {
      const exact = visible.find((p) => p.sku === code.toUpperCase() || p.barcode === code);
      return choose(exact ?? visible[highlight]);
    }
    setResolving(true);
    try {
      const product = await findByCode(code);
      if (product) choose(product);
      else {
        toast.error(`Nenhum produto com o código "${code}"`);
        setTerm('');
      }
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setResolving(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void resolveCode();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlight((h) => Math.min(h + 1, visible.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (event.key === 'Escape') {
      setTerm('');
    }
  };

  return (
    <div className="relative">
      <ScanBarcode className="pointer-events-none absolute top-1/2 left-4 size-6 -translate-y-1/2 text-brand-600" />
      <input
        ref={ref}
        value={term}
        onChange={(e) => {
          setTerm(e.target.value);
          setHighlight(0);
        }}
        onKeyDown={onKeyDown}
        autoFocus
        autoComplete="off"
        spellCheck={false}
        placeholder="Bipe o código de barras ou digite nome / SKU"
        aria-label="Código do produto"
        className="h-14 w-full rounded-xl border-2 border-brand-200 bg-white pr-12 pl-13 text-lg text-slate-900 shadow-sm transition placeholder:text-base placeholder:text-slate-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 focus:outline-none"
      />
      {(resolving || isFetching) && (
        <Loader2 className="absolute top-1/2 right-4 size-5 -translate-y-1/2 animate-spin text-slate-400" />
      )}

      {visible.length > 0 && (
        <ul className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          {visible.map((product, index) => (
            <li key={product.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(product)}
                onMouseEnter={() => setHighlight(index)}
                className={cn(
                  'flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left',
                  index === highlight && 'bg-brand-50',
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-slate-900">{product.name}</span>
                  <span className="block text-xs text-slate-500">
                    {product.sku}
                    {product.barcode && ` · ${product.barcode}`}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-sm tabular-nums text-slate-600">{formatQuantity(product.currentStock, product.unit)}</span>
                  <StockStatusBadge status={product.status} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});
ProductScanner.displayName = 'ProductScanner';
