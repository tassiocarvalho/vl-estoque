import { Plus, Search, Truck, X } from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import { Button, IconButton } from '@/components/ui/Button';
import { EmptyState, LoadingState } from '@/components/ui/Display';
import { Input } from '@/components/ui/Form';
import { Modal } from '@/components/ui/Modal';
import { formatDocument } from '@/lib/document';
import type { Supplier } from '@/lib/types';
import { useSuppliers } from './api';
import { SupplierFormModal } from './SupplierFormModal';

export interface SupplierRef {
  id: string;
  name: string;
  tradeName: string | null;
}

/** Campo de fornecedor: mostra o escolhido e abre a busca (com cadastro rápido). */
export function SupplierSelect({
  value,
  onChange,
  disabled,
  canCreate,
}: {
  value: SupplierRef | null;
  onChange: (supplier: SupplierRef | null) => void;
  disabled?: boolean;
  canCreate?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [term, setTerm] = useState('');
  const deferred = useDeferredValue(term.trim());
  const { data, isLoading } = useSuppliers({ search: deferred || undefined, status: 'active', pageSize: 10 }, open);

  const choose = (supplier: Supplier | SupplierRef) => {
    onChange({ id: supplier.id, name: supplier.name, tradeName: supplier.tradeName });
    setOpen(false);
  };

  return (
    <>
      <div className="flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm shadow-sm">
        <Truck className="size-4 shrink-0 text-slate-400" />
        <button type="button" disabled={disabled} onClick={() => setOpen(true)} className="min-w-0 flex-1 truncate text-left disabled:cursor-default">
          {value ? <span className="text-slate-900">{value.tradeName || value.name}</span> : <span className="text-slate-400">Escolher fornecedor</span>}
        </button>
        {value && !disabled && (
          <IconButton label="Tirar fornecedor" onClick={() => onChange(null)} className="size-6">
            <X className="size-3.5" />
          </IconButton>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Fornecedor" size="md">
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
              <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Nome, fantasia ou CNPJ" className="pl-9" autoFocus aria-label="Buscar fornecedor" />
            </div>
            {canCreate && (
              <Button variant="outline" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
                Novo
              </Button>
            )}
          </div>
          {isLoading ? (
            <LoadingState />
          ) : !data?.items.length ? (
            <EmptyState title="Nenhum fornecedor encontrado" />
          ) : (
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
              {data.items.map((s) => (
                <li key={s.id}>
                  <button type="button" onClick={() => choose(s)} className="w-full px-3 py-2.5 text-left hover:bg-brand-50">
                    <span className="block text-sm font-medium text-slate-900">{s.tradeName || s.name}</span>
                    <span className="block text-xs text-slate-500">{[s.tradeName && s.name, formatDocument(s.document)].filter(Boolean).join(' · ')}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>
      <SupplierFormModal open={creating} onClose={() => setCreating(false)} onSaved={choose} />
    </>
  );
}
