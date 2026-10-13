import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { errorMessage, http, isCanceled, isNetworkError } from '@/lib/api';
import type { Paginated, Product } from '@/lib/types';
import { useAuth } from '../auth/AuthProvider';
import { catalog, outbox, type PendingMovement } from './offline-store';

interface OfflineContextValue {
  online: boolean;
  pending: PendingMovement[];
  syncing: boolean;
  enqueue: (movement: PendingMovement) => Promise<void>;
  sync: () => Promise<void>;
  discard: (id: string) => Promise<void>;
}

const OfflineContext = createContext<OfflineContextValue | null>(null);
const SYNC_INTERVAL_MS = 30_000;

/** Baixa o catálogo completo de produtos para consulta offline. */
async function refreshCatalog() {
  const items = [];
  for (let page = 1; ; page++) {
    const result = await http.get<Paginated<Product>>('/products', { page, pageSize: 100 });
    items.push(...result.items.map(({ id, name, sku, barcode, unit, currentStock, status }) => ({
      id, name, sku, barcode, unit, currentStock, status,
    })));
    if (page * result.pageSize >= result.total) break;
  }
  await catalog.save(items);
}

/**
 * Mantém o estado de conexão, envia a fila de movimentações registradas offline
 * e atualiza o catálogo local de produtos.
 */
export function OfflineProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState<PendingMovement[]>([]);
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);

  const reload = useCallback(async () => setPending(await outbox.list()), []);

  const sync = useCallback(async () => {
    if (syncingRef.current || !user) return;
    syncingRef.current = true;
    setSyncing(true);
    let sent = 0;
    try {
      for (const item of await outbox.list()) {
        if (item.error) continue; // erros de negócio aguardam decisão do usuário
        try {
          await http.post(`/stock/${item.kind}`, item.payload);
          await outbox.remove(item.id);
          sent++;
        } catch (error) {
          if (isNetworkError(error) || isCanceled(error)) break;
          await outbox.markError(item.id, errorMessage(error));
        }
      }
    } finally {
      syncingRef.current = false;
      setSyncing(false);
      await reload();
    }
    if (sent > 0) {
      toast.success(`${sent} movimentação(ões) registrada(s) offline foram enviadas`);
      void queryClient.invalidateQueries();
    }
  }, [user, reload, queryClient]);

  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      void sync();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [sync]);

  useEffect(() => {
    if (!user) return;
    void reload().then(sync);
    if (user.permissions.includes('product:read')) void refreshCatalog().catch(() => undefined);

    const timer = setInterval(() => {
      if (navigator.onLine) void sync();
    }, SYNC_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [user, reload, sync]);

  const enqueue = useCallback(
    async (movement: PendingMovement) => {
      await outbox.add(movement);
      await reload();
    },
    [reload],
  );

  const discard = useCallback(
    async (id: string) => {
      await outbox.remove(id);
      await reload();
    },
    [reload],
  );

  const value = useMemo(
    () => ({ online, pending, syncing, enqueue, sync, discard }),
    [online, pending, syncing, enqueue, sync, discard],
  );
  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

export function useOffline() {
  const context = useContext(OfflineContext);
  if (!context) throw new Error('useOffline deve ser usado dentro de <OfflineProvider>');
  return context;
}
