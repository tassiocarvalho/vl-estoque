import { keepPreviousData, useQuery, type QueryClient } from '@tanstack/react-query';
import { http } from '@/lib/api';
import type { CashSession, CashSessionListItem, Paginated, Sale, SalesReport } from '@/lib/types';

const TERMINAL_KEY = 'pdv:terminal';

/** Nome deste caixa (cada computador é um terminal; padrão "Caixa 01"). */
export function readTerminal(): string {
  try {
    return localStorage.getItem(TERMINAL_KEY) || 'Caixa 01';
  } catch {
    return 'Caixa 01';
  }
}

export function saveTerminal(name: string) {
  try {
    localStorage.setItem(TERMINAL_KEY, name);
  } catch {
    /* sem armazenamento: vale só nesta sessão */
  }
}

export const cashKey = (terminal: string) => ['cash', 'current', terminal];

export const useCurrentCash = (terminal: string) =>
  useQuery({
    queryKey: cashKey(terminal),
    queryFn: () => http.get<CashSession | null>('/cash/current', { terminal }),
    staleTime: 15_000,
  });

export interface SaleFilters {
  sessionId?: string;
  status?: string;
  from?: string;
  to?: string;
  number?: number | '';
  page?: number;
  pageSize?: number;
}

export const useSales = (filters: SaleFilters, enabled = true) =>
  useQuery({
    queryKey: ['sales', 'list', filters],
    queryFn: () => http.get<Paginated<Sale>>('/sales', { ...filters }),
    placeholderData: keepPreviousData,
    enabled,
  });

export const useSalesReport = (period: { from?: string; to?: string }) =>
  useQuery({
    queryKey: ['sales', 'report', period],
    queryFn: () => http.get<SalesReport>('/sales/report', period),
    placeholderData: keepPreviousData,
  });

export const useCashSessions = (filters: { from?: string; to?: string; page?: number; pageSize?: number }) =>
  useQuery({
    queryKey: ['cash', 'sessions', filters],
    queryFn: () => http.get<Paginated<CashSessionListItem>>('/cash/sessions', { ...filters }),
    placeholderData: keepPreviousData,
  });

export const fetchCashReport = (id: string) => http.get<CashSession>(`/cash/sessions/${id}`);

/** Vendas e caixa mexem em estoque, relatórios e painel. */
export function invalidateSalesData(queryClient: QueryClient) {
  for (const key of ['sales', 'cash', 'products', 'dashboard', 'movements', 'purchase-requests', 'reports']) {
    void queryClient.invalidateQueries({ queryKey: [key] });
  }
}
