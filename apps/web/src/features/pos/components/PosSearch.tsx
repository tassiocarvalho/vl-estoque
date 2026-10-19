import { useQuery } from '@tanstack/react-query';
import { Loader2, ScanBarcode } from 'lucide-react';
import { forwardRef, useDeferredValue, useState, type KeyboardEvent } from 'react';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatMoney, formatQuantity, parseQuantity } from '@/lib/format';
import type { CatalogItem } from '../../offline/offline-store';
import { parseScaleLabel, quantityForPrice, type ScaleSettings } from '@/lib/scale';
import { findByCode, findByScaleCode, searchProducts } from '../../stock/ProductScanner';

/** "3*7891234567890" ou "0,5x PAO-FRANCES": quantidade antes do código. */
const MULTIPLIER = /^(\d+(?:[.,]\d{1,3})?)\s*[*xX]\s*(.+)$/;

interface PosSearchProps {
  onAdd: (product: CatalogItem, quantity: number) => void;
  onNotFound: (message: string) => void;
  /** Setas sem sugestões abertas movem a seleção dos itens do cupom. */
  onNavigate: (delta: number) => void;
  disabled?: boolean;
  /** Etiqueta de balança (peso ou preço embutido no código). */
  scale?: ScaleSettings | null;
}

/**
 * Campo principal do caixa: o leitor de código de barras "digita" o código e envia Enter.
 * Também busca por nome ou SKU, e aceita multiplicador ("3*" antes do código).
 */
export const PosSearch = forwardRef<HTMLInputElement, PosSearchProps>(({ onAdd, onNotFound, onNavigate, disabled, scale }, ref) => {
  const [term, setTerm] = useState('');
  const [resolving, setResolving] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const multiplier = MULTIPLIER.exec(term.trim());
  const quantity = multiplier ? parseQuantity(multiplier[1]) : 1;
  const query = (multiplier ? multiplier[2] : term).trim();
  const deferred = useDeferredValue(query);
  const looksLikeCode = /^\d{4,14}$/.test(deferred);

  const { data: suggestions = [], isFetching } = useQuery({
    queryKey: ['pos-search', deferred],
    queryFn: () => searchProducts(deferred),
    enabled: deferred.length >= 2 && !looksLikeCode,
    staleTime: 10_000,
    retry: false,
  });
  const visible = deferred.length >= 2 && !looksLikeCode && query === deferred ? suggestions : [];

  const choose = (product: CatalogItem) => {
    setTerm('');
    setHighlight(0);
    onAdd(product, quantity > 0 ? quantity : 1);
  };

  const resolve = async () => {
    if (!query) return;
    if (visible.length > 0) {
      const exact = visible.find((p) => p.sku === query.toUpperCase() || p.barcode === query);
      return choose(exact ?? visible[highlight] ?? visible[0]);
    }
    setResolving(true);
    try {
      // Etiqueta da balança: o código traz o produto (PLU) e o peso ou o preço total.
      const label = parseScaleLabel(query, scale);
      const weighed = label ? await findByScaleCode(label.scaleCode) : null;
      if (label && weighed) {
        const qty = label.weightKg ?? quantityForPrice(label.priceCents!, weighed.salePrice);
        setTerm('');
        setHighlight(0);
        if (qty > 0) onAdd(weighed, qty);
        else onNotFound(`"${weighed.name}" está sem preço de venda`);
        return;
      }
      const product = await findByCode(query);
      if (product) choose(product);
      else {
        onNotFound(`Nenhum produto com o código "${query}"`);
        setTerm('');
      }
    } catch (error) {
      onNotFound(errorMessage(error));
    } finally {
      setResolving(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void resolve();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      if (visible.length > 0) setHighlight((h) => Math.min(Math.max(h + delta, 0), visible.length - 1));
      else onNavigate(delta);
    } else if (event.key === 'Escape' && term) {
      // Primeiro Esc limpa a busca; com o campo vazio, o Esc vai para o caixa (cancelar venda).
      event.stopPropagation();
      setTerm('');
    }
  };

  return (
    <div className="relative">
      <ScanBarcode className="pointer-events-none absolute top-1/2 left-4 size-6 -translate-y-1/2 text-brand-600" />
      <input
        ref={ref}
        value={term}
        disabled={disabled}
        onChange={(e) => {
          setTerm(e.target.value);
          setHighlight(0);
        }}
        onKeyDown={onKeyDown}
        autoFocus
        autoComplete="off"
        spellCheck={false}
        placeholder="Bipe o código ou digite nome / SKU   (ex.: 3*código)"
        aria-label="Código ou nome do produto"
        className="h-14 w-full rounded-xl border-2 border-brand-200 bg-white pr-24 pl-13 text-lg text-slate-900 shadow-sm transition placeholder:text-base placeholder:text-slate-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 focus:outline-none disabled:opacity-60"
      />
      <span className="pointer-events-none absolute top-1/2 right-4 flex -translate-y-1/2 items-center gap-2">
        {multiplier && quantity > 0 && (
          <span className="rounded-md bg-brand-50 px-2 py-0.5 text-sm font-semibold text-brand-800">{quantity}×</span>
        )}
        {resolving || isFetching ? <Loader2 className="size-5 animate-spin text-slate-400" /> : <kbd className="kbd">F1</kbd>}
      </span>

      {visible.length > 0 && (
        <ul className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          {visible.map((product, index) => (
            <li key={product.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(product)}
                onMouseEnter={() => setHighlight(index)}
                className={cn('flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left', index === highlight && 'bg-brand-50')}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-slate-900">{product.name}</span>
                  <span className="block text-xs text-slate-500">
                    {product.sku}
                    {product.barcode && ` · ${product.barcode}`} · estoque {formatQuantity(product.currentStock, product.unit)}
                  </span>
                </span>
                <span className="shrink-0 text-base font-semibold text-slate-900 tabular-nums">
                  {product.salePrice ? formatMoney(product.salePrice) : <span className="text-sm text-red-600">sem preço</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});
PosSearch.displayName = 'PosSearch';
