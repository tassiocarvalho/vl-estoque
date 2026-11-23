import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { http, type PinSession } from '@/lib/api';
import type { Paginated, Product } from '@/lib/types';
import { useAuth } from '../auth/AuthProvider';
import { applyDeltas, belongsTo, catalog, outbox, pendingDeltas, type CatalogItem, type PendingMovement } from './offline-store';
import { runSync } from './sync';

type NewPendingMovement = Omit<PendingMovement, 'userId' | 'userName' | 'error'>;

interface OfflineContextValue {
  online: boolean;
  pending: PendingMovement[];
  syncing: boolean;
  /** Por que o envio parou (sessão expirada, PIN não confirmado...). */
  blocked?: string;
  enqueue: (movement: NewPendingMovement) => Promise<void>;
  /** Envio pedido pela pessoa ("Enviar agora"): pode abrir o diálogo de PIN. */
  sync: () => Promise<void>;
  /** Tenta enviar de novo um registro que deu erro (ex.: depois de registrar a entrada que faltava). */
  retry: (id: string) => Promise<void>;
  discard: (id: string) => Promise<void>;
}

const OfflineContext = createContext<OfflineContextValue | null>(null);
const SYNC_INTERVAL_MS = 30_000;
const PIN_REASON = 'Confirme com seu PIN para enviar os registros feitos sem internet.';

/**
 * Baixa o catálogo completo de produtos para consulta offline. Os registros que ainda
 * estão na fila são aplicados por cima, para o saldo local não "voltar" ao do servidor.
 */
async function refreshCatalog() {
  const items: CatalogItem[] = [];
  for (let page = 1; ; page++) {
    const result = await http.get<Paginated<Product>>('/products', { page, pageSize: 100 });
    items.push(...result.items.map(({ id, name, sku, barcode, unit, currentStock, status }) => ({
      id, name, sku, barcode, unit, currentStock, status,
    })));
    if (result.items.length === 0 || page * result.pageSize >= result.total) break;
  }
  await catalog.save(applyDeltas(items, pendingDeltas(await outbox.list())));
}

/**
 * Mantém o estado de conexão, envia a fila de movimentações registradas offline
 * e atualiza o catálogo local de produtos.
 */
export function OfflineProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;
  const canReadProducts = user?.permissions.includes('product:read') ?? false;
  const queryClient = useQueryClient();
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState<PendingMovement[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [blocked, setBlocked] = useState<string>();
  const syncingRef = useRef(false);
  /** A pessoa cancelou o PIN: o envio automático não abre o diálogo de novo até ela pedir. */
  const pinDeclinedRef = useRef(false);

  const reload = useCallback(async () => setPending(await outbox.list()), []);

  const runQueue = useCallback(
    async (manual: boolean) => {
      if (syncingRef.current || !userId) return;
      if (manual) pinDeclinedRef.current = false;
      syncingRef.current = true;
      setSyncing(true);

      // Um único PIN vale para todos os registros deste envio.
      const pinSession: PinSession = { prompt: !pinDeclinedRef.current, reason: PIN_REASON };
      let sent = 0;
      let failed = 0;
      try {
        const result = await runSync(userId, {
          list: outbox.list,
          send: (item) => http.post(`/stock/${item.kind}`, item.payload, { pinSession }),
          remove: outbox.remove,
          markError: outbox.markError,
        });
        ({ sent, failed } = result);
        if (result.stop?.code === 'CANCELED' || result.stop?.code === 'PIN_REQUIRED') pinDeclinedRef.current = true;
        // Falta de rede já aparece na barra de conexão; os demais motivos são mostrados para a pessoa agir.
        setBlocked(result.stop && result.stop.code !== 'NETWORK' ? result.stop.reason : undefined);
      } catch {
        setBlocked('Falha ao ler os registros salvos neste dispositivo. Nova tentativa em instantes.');
      } finally {
        syncingRef.current = false;
        setSyncing(false);
        await reload();
      }

      if (sent > 0) {
        toast.success(`${sent} movimentação(ões) registrada(s) offline foram enviadas`);
        void queryClient.invalidateQueries();
        if (canReadProducts) void refreshCatalog().catch(() => undefined);
      }
      if (failed > 0) {
        toast.error(`${failed} registro(s) offline não puderam ser enviados`, {
          description: 'Veja o motivo em "Aguardando envio" e tente de novo ou descarte.',
          duration: 10_000,
        });
      }
    },
    [userId, canReadProducts, reload, queryClient],
  );

  const autoSync = useCallback(() => runQueue(false), [runQueue]);
  const sync = useCallback(() => runQueue(true), [runQueue]);

  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      pinDeclinedRef.current = false; // conexão voltou: pede o PIN uma vez para enviar a fila
      void autoSync();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [autoSync]);

  useEffect(() => {
    if (!userId) {
      setBlocked(undefined);
      return;
    }
    void reload().then(autoSync);
    if (canReadProducts) void refreshCatalog().catch(() => undefined);

    const timer = setInterval(() => {
      if (navigator.onLine) void autoSync();
    }, SYNC_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [userId, canReadProducts, reload, autoSync]);

  const enqueue = useCallback(
    async (movement: NewPendingMovement) => {
      const item: PendingMovement = { ...movement, userId: user?.id, userName: user?.name };
      await outbox.add(item);
      await catalog.adjust(item).catch(() => undefined);
      await reload();
    },
    [user, reload],
  );

  const retry = useCallback(
    async (id: string) => {
      await outbox.clearError(id);
      await reload();
      await runQueue(true);
    },
    [reload, runQueue],
  );

  const discard = useCallback(
    async (id: string) => {
      const item = (await outbox.list()).find((p) => p.id === id);
      await outbox.remove(id);
      // Devolve ao saldo local o que este registro tinha descontado.
      if (item) {
        const reverted = { ...item, kind: item.kind === 'entries' ? 'exits' : 'entries' } as PendingMovement;
        await catalog.adjust(reverted).catch(() => undefined);
      }
      await reload();
    },
    [reload],
  );

  const value = useMemo(
    () => ({ online, pending, syncing, blocked, enqueue, sync, retry, discard }),
    [online, pending, syncing, blocked, enqueue, sync, retry, discard],
  );
  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

export function useOffline() {
  const context = useContext(OfflineContext);
  if (!context) throw new Error('useOffline deve ser usado dentro de <OfflineProvider>');
  return context;
}

/** Registros da fila que a pessoa conectada pode enviar. */
export const ownPending = (pending: PendingMovement[], userId: string | undefined) =>
  userId ? pending.filter((p) => belongsTo(p, userId)) : pending;
