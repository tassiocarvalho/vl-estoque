import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { ApiError, errorMessage, http, isCanceled, isNetworkError } from '@/lib/api';
import type { Paginated, Product } from '@/lib/types';
import { useAuth } from '../auth/AuthProvider';
import { catalog, outbox, salesOutbox, type PendingMovement, type PendingSale } from './offline-store';

interface OfflineContextValue {
  online: boolean;
  pending: PendingMovement[];
  /** Vendas do caixa feitas sem internet, aguardando envio. */
  pendingSales: PendingSale[];
  syncing: boolean;
  enqueue: (movement: PendingMovement) => Promise<void>;
  enqueueSale: (sale: PendingSale) => Promise<void>;
  sync: () => Promise<void>;
  discard: (id: string) => Promise<void>;
  discardSale: (id: string) => Promise<void>;
  /** Atualiza a cópia local dos produtos (preços e saldos) usada sem internet. */
  refreshCatalog: () => Promise<void>;
}

const OfflineContext = createContext<OfflineContextValue | null>(null);

/**
 * Recusas que dependem do usuário (termo de uso pendente, senha provisória), não da venda:
 * a fila espera e tenta de novo depois, em vez de marcar a venda com erro.
 */
const isPendingAccountStep = (error: unknown) =>
  error instanceof ApiError && (error.code === 'TERMS_ACCEPTANCE_REQUIRED' || error.code === 'PASSWORD_CHANGE_REQUIRED');
const SYNC_INTERVAL_MS = 30_000;

/** Baixa o catálogo completo de produtos para consulta offline. */
async function refreshCatalogFromApi() {
  const items = [];
  for (let page = 1; ; page++) {
    const result = await http.get<Paginated<Product>>('/products', { page, pageSize: 100 });
    items.push(...result.items.map(({ id, name, sku, barcode, unit, currentStock, status, salePrice }) => ({
      id, name, sku, barcode, unit, currentStock, status, salePrice,
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
  const [pendingSales, setPendingSales] = useState<PendingSale[]>([]);
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);

  const reload = useCallback(async () => {
    const [movements, sales] = await Promise.all([outbox.list(), salesOutbox.list()]);
    setPending(movements);
    setPendingSales(sales);
  }, []);

  const sync = useCallback(async () => {
    // Só envia com a conta liberada (termo aceito e senha definitiva).
    if (syncingRef.current || !user || user.mustChangePassword || !user.termsAccepted) return;
    syncingRef.current = true;
    setSyncing(true);
    let sent = 0;
    let salesSent = 0;
    try {
      // Vendas primeiro: são as que mexem no dinheiro do caixa.
      for (const sale of await salesOutbox.list()) {
        if (sale.error) continue;
        try {
          await http.post('/sales', { ...sale.payload, offline: true }, {
            silent: true,
            headers: sale.authorizationToken ? { 'X-Supervisor-Token': sale.authorizationToken } : undefined,
          });
          await salesOutbox.remove(sale.id);
          salesSent++;
        } catch (error) {
          if (isNetworkError(error) || isPendingAccountStep(error)) throw error;
          await salesOutbox.markError(sale.id, errorMessage(error));
        }
      }
      for (const item of await outbox.list()) {
        if (item.error) continue; // erros de negócio aguardam decisão do usuário
        try {
          await http.post(`/stock/${item.kind}`, item.payload);
          await outbox.remove(item.id);
          sent++;
        } catch (error) {
          if (isNetworkError(error) || isCanceled(error) || isPendingAccountStep(error)) break;
          await outbox.markError(item.id, errorMessage(error));
        }
      }
    } catch (error) {
      if (!isNetworkError(error) && !isPendingAccountStep(error)) throw error; // tenta de novo no próximo ciclo
    } finally {
      syncingRef.current = false;
      setSyncing(false);
      await reload();
    }
    if (salesSent > 0) toast.success(`${salesSent} venda(s) feita(s) sem internet foram enviadas`);
    if (sent > 0) toast.success(`${sent} movimentação(ões) registrada(s) offline foram enviadas`);
    if (sent + salesSent > 0) void queryClient.invalidateQueries();
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
    if (user.permissions.includes('product:read')) void refreshCatalogFromApi().catch(() => undefined);

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

  const enqueueSale = useCallback(
    async (sale: PendingSale) => {
      await salesOutbox.add(sale);
      await reload();
    },
    [reload],
  );

  const discardSale = useCallback(
    async (id: string) => {
      await salesOutbox.remove(id);
      await reload();
    },
    [reload],
  );

  const refreshCatalog = useCallback(() => refreshCatalogFromApi(), []);

  const discard = useCallback(
    async (id: string) => {
      await outbox.remove(id);
      await reload();
    },
    [reload],
  );

  const value = useMemo(
    () => ({ online, pending, pendingSales, syncing, enqueue, enqueueSale, sync, discard, discardSale, refreshCatalog }),
    [online, pending, pendingSales, syncing, enqueue, enqueueSale, sync, discard, discardSale, refreshCatalog],
  );
  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

export function useOffline() {
  const context = useContext(OfflineContext);
  if (!context) throw new Error('useOffline deve ser usado dentro de <OfflineProvider>');
  return context;
}
