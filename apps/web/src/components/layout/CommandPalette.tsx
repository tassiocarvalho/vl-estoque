import { useQuery } from '@tanstack/react-query';
import { BookOpen, Contact, Package, Scale, Search, UserCircle, type LucideIcon } from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthProvider';
import { http } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDocument, formatPhone } from '@/lib/document';
import { formatMoney } from '@/lib/format';
import { MANUAL_URL } from '@/lib/manual';
import { P } from '@/lib/permissions';
import type { Customer, Paginated, Product } from '@/lib/types';
import { NAV_GROUPS, normalize } from './nav';

interface Entry {
  key: string;
  section: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  run: () => void;
}

const EXTRA_SCREENS = [
  { to: '/perfil', label: 'Meu perfil', icon: UserCircle, keywords: 'senha pin email meus dados' },
  { to: '/termos', label: 'Termos e privacidade', icon: Scale, keywords: 'lgpd termo de uso politica' },
];

/**
 * Busca rápida (Ctrl+K): vai direto para qualquer tela permitida ao usuário, a um produto
 * (nome, SKU ou código de barras) ou a um cliente (nome, CPF/CNPJ ou telefone).
 */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [term, setTerm] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const deferred = useDeferredValue(term.trim());
  const searchData = deferred.length >= 2;

  useEffect(() => {
    if (!open) return;
    setTerm('');
    setActive(0);
    const previous = document.activeElement as HTMLElement | null;
    requestAnimationFrame(() => inputRef.current?.focus());
    return () => previous?.focus();
  }, [open]);

  const products = useQuery({
    queryKey: ['products', 'quick-search', deferred],
    queryFn: () => http.get<Paginated<Product>>('/products', { search: deferred, pageSize: 5 }),
    enabled: open && searchData && can(P.PRODUCT_READ),
    staleTime: 30_000,
  });
  const customers = useQuery({
    queryKey: ['customers', 'quick-search', deferred],
    queryFn: () => http.get<Paginated<Customer>>('/customers', { search: deferred, pageSize: 5, status: 'active' }),
    enabled: open && searchData && can(P.CUSTOMER_READ),
    staleTime: 30_000,
  });

  const entries = useMemo<Entry[]>(() => {
    const go = (to: string) => () => {
      onClose();
      navigate(to);
    };
    const query = normalize(deferred);
    // Relevância: 0 = o nome começa com o termo, 1 = alguma palavra do nome começa, 2 = está nas palavras-chave.
    const score = (label: string, keywords = '') => {
      if (!query) return 0;
      const name = normalize(label);
      if (name.startsWith(query)) return 0;
      if (name.split(/[\s/]+/).some((word) => word.startsWith(query))) return 1;
      if (name.includes(query) || normalize(keywords).split(/\s+/).some((word) => word.startsWith(query))) return 2;
      return -1;
    };

    const candidates: (Entry & { keywords?: string })[] = [
      ...NAV_GROUPS.flatMap((group) =>
        group.items
          .filter((item) => can(item.permission))
          .map((item) => ({
            key: item.to,
            section: 'Telas',
            label: item.label,
            hint: group.title,
            icon: item.icon,
            keywords: item.keywords,
            run: go(item.to),
          })),
      ),
      ...EXTRA_SCREENS.map((s) => ({ key: s.to, section: 'Telas', label: s.label, icon: s.icon, keywords: s.keywords, run: go(s.to) })),
      {
        key: 'manual',
        section: 'Telas',
        label: 'Manual de uso',
        hint: 'PDF',
        icon: BookOpen,
        keywords: 'ajuda tutorial pdf',
        run: () => {
          onClose();
          window.open(MANUAL_URL, '_blank', 'noopener');
        },
      },
    ];
    const screens: Entry[] = candidates
      .map((entry) => ({ entry, rank: score(entry.label, entry.keywords) }))
      .filter(({ rank }) => rank >= 0)
      .sort((a, b) => a.rank - b.rank) // estável: empate mantém a ordem do menu
      .map(({ entry }) => entry);

    const found: Entry[] = [];
    if (searchData) {
      for (const product of products.data?.items ?? []) {
        found.push({
          key: `p:${product.id}`,
          section: 'Produtos',
          label: product.name,
          hint: `${product.sku} · ${formatMoney(product.salePrice ?? 0)} · estoque ${product.currentStock}`,
          icon: Package,
          run: go(`/produtos/${product.id}`),
        });
      }
      for (const customer of customers.data?.items ?? []) {
        found.push({
          key: `c:${customer.id}`,
          section: 'Clientes',
          label: customer.name,
          hint: [formatDocument(customer.document), formatPhone(customer.phone)].filter(Boolean).join(' · '),
          icon: Contact,
          run: go(`/clientes?cliente=${customer.id}`),
        });
      }
    }
    return [...screens, ...found];
  }, [deferred, searchData, products.data, customers.data, can, navigate, onClose]);

  useEffect(() => setActive(0), [deferred]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const loading = searchData && (products.isFetching || customers.isFetching);
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((i) => Math.min(i + 1, entries.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      entries[active]?.run();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center p-3 pt-[12vh]">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Busca rápida"
        className="relative flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-3 border-b border-slate-200 px-4">
          <Search className="size-5 shrink-0 text-slate-400" />
          <input
            ref={inputRef}
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Buscar tela, produto ou cliente…"
            aria-label="Buscar tela, produto ou cliente"
            className="h-14 flex-1 bg-transparent text-base text-slate-900 outline-none placeholder:text-slate-400"
          />
          <kbd className="rounded border border-slate-300 px-1.5 text-[11px] font-semibold text-slate-500">Esc</kbd>
        </div>
        <ul ref={listRef} className="flex-1 overflow-y-auto p-2" role="listbox">
          {entries.map((entry, index) => {
            const Icon = entry.icon;
            const newSection = index === 0 || entries[index - 1].section !== entry.section;
            return (
              <li key={entry.key} role="option" aria-selected={index === active}>
                {newSection && (
                  <p className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
                    {entry.section}
                  </p>
                )}
                <button
                  type="button"
                  data-index={index}
                  onMouseMove={() => setActive(index)}
                  onClick={entry.run}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm',
                    index === active ? 'bg-brand-50 text-brand-800' : 'text-slate-700',
                  )}
                >
                  <Icon className={cn('size-[18px] shrink-0', index === active ? 'text-brand-600' : 'text-slate-400')} />
                  <span className="min-w-0 flex-1 truncate font-medium">{entry.label}</span>
                  {entry.hint && <span className="shrink-0 truncate text-xs text-slate-400">{entry.hint}</span>}
                </button>
              </li>
            );
          })}
          {entries.length === 0 && !loading && (
            <li className="px-3 py-8 text-center text-sm text-slate-500">Nada encontrado para “{term.trim()}”.</li>
          )}
          {loading && <li className="px-3 py-2 text-xs text-slate-400">Buscando produtos e clientes…</li>}
        </ul>
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-200 bg-slate-50 px-4 py-2 text-[11px] text-slate-500">
          <span>
            <b>↑ ↓</b> navegar
          </span>
          <span>
            <b>Enter</b> abrir
          </span>
          <span>Digite 2 letras ou mais para buscar produtos e clientes</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
