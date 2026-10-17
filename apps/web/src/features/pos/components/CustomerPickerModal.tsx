import { useQuery } from '@tanstack/react-query';
import { FileText, Loader2, Search, UserPlus, UserX } from 'lucide-react';
import { useEffect, useState, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { http, isNetworkError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDocument, formatPhone, isValidDocument } from '@/lib/document';
import type { Paginated } from '@/lib/types';
import { CustomerFormModal } from '../../customers/CustomerFormModal';
import { customersCache, type CachedCustomer } from '../../offline/offline-store';

export interface SaleCustomer {
  customer: { id: string; name: string; document: string | null } | null;
  /** CPF/CNPJ na nota (só números). */
  document: string | null;
}

/** Busca na API; sem internet, nos clientes salvos no aparelho. */
async function searchCustomers(term: string): Promise<CachedCustomer[]> {
  try {
    return (await http.get<Paginated<CachedCustomer>>('/customers', { search: term, pageSize: 8 })).items;
  } catch (error) {
    if (isNetworkError(error)) return customersCache.search(term);
    throw error;
  }
}

/**
 * Identificar o cliente da venda (tecla Ins): buscar por nome, CPF ou telefone,
 * usar só o CPF/CNPJ "na nota" ou fazer um cadastro rápido.
 */
export function CustomerPickerModal({
  open,
  current,
  canCreate,
  onClose,
  onSelect,
}: {
  open: boolean;
  current: SaleCustomer;
  canCreate: boolean;
  onClose: () => void;
  onSelect: (value: SaleCustomer) => void;
}) {
  const [term, setTerm] = useState('');
  const [highlight, setHighlight] = useState(0);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (open) {
      setTerm('');
      setHighlight(0);
    }
  }, [open]);

  const query = term.trim();
  const digits = query.replace(/\D/g, '');
  const looksLikeDocument = digits.length === 11 || digits.length === 14;
  const validDocument = looksLikeDocument && isValidDocument(digits);

  const { data: results = [], isFetching } = useQuery({
    queryKey: ['pos-customers', query],
    queryFn: () => searchCustomers(query),
    enabled: open && query.length >= 2,
    staleTime: 10_000,
    retry: false,
  });
  const visible = query.length >= 2 ? results : [];

  const choose = (c: CachedCustomer) => onSelect({ customer: { id: c.id, name: c.name, document: c.document }, document: c.document });

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlight((h) => Math.min(h + 1, visible.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const exact = visible.find((c) => c.document === digits);
      if (exact) choose(exact);
      else if (visible[highlight]) choose(visible[highlight]);
      else if (validDocument) onSelect({ customer: null, document: digits });
    }
  };

  return (
    <>
      <Modal open={open && !creating} onClose={onClose} title="Cliente da venda" description="Busque por nome, CPF ou telefone — ou informe só o CPF na nota." size="md">
        <div className="space-y-4">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-slate-400" />
            <input
              autoFocus
              value={term}
              onChange={(e) => {
                setTerm(e.target.value);
                setHighlight(0);
              }}
              onKeyDown={onKeyDown}
              placeholder="Nome, CPF/CNPJ ou telefone"
              aria-label="Buscar cliente"
              className="h-12 w-full rounded-xl border-2 border-brand-200 bg-white pr-10 pl-10 text-base text-slate-900 focus:border-brand-500 focus:outline-none"
            />
            {isFetching && <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-slate-400" />}
          </div>

          {visible.length > 0 && (
            <ul className="max-h-64 overflow-y-auto rounded-xl border border-slate-200">
              {visible.map((c, index) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => choose(c)}
                    onMouseEnter={() => setHighlight(index)}
                    className={cn('flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left', index === highlight && 'bg-brand-50')}
                  >
                    <span className="truncate text-sm font-medium text-slate-900">{c.name}</span>
                    <span className="shrink-0 text-xs text-slate-500">{formatDocument(c.document) || formatPhone(c.phone)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {query.length >= 2 && !isFetching && visible.length === 0 && (
            <p className="text-sm text-slate-500">Nenhum cliente encontrado.</p>
          )}

          {looksLikeDocument && (
            <div className={cn('flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm', validDocument ? 'bg-slate-50' : 'bg-red-50 text-red-700')}>
              <span className="flex items-center gap-2">
                <FileText className="size-4" />
                {validDocument ? `CPF/CNPJ na nota: ${formatDocument(digits)}` : 'CPF/CNPJ inválido: confira os números'}
              </span>
              {validDocument && (
                <Button size="sm" variant="outline" onClick={() => onSelect({ customer: null, document: digits })}>
                  Usar só o documento
                </Button>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            {canCreate && (
              <Button variant="secondary" icon={<UserPlus className="size-4" />} onClick={() => setCreating(true)}>
                Cadastrar cliente
              </Button>
            )}
            {(current.customer || current.document) && (
              <Button variant="ghost" className="text-red-600" icon={<UserX className="size-4" />} onClick={() => onSelect({ customer: null, document: null })}>
                Tirar cliente da venda
              </Button>
            )}
          </div>
        </div>
      </Modal>
      <CustomerFormModal
        open={open && creating}
        quick
        initial={looksLikeDocument ? { document: formatDocument(digits) } : digits.length >= 10 ? { phone: formatPhone(digits) } : { name: query }}
        onClose={() => setCreating(false)}
        onSaved={(c) => {
          setCreating(false);
          onSelect({ customer: { id: c.id, name: c.name, document: c.document }, document: c.document });
        }}
      />
    </>
  );
}
