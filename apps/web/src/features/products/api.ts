import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { http } from '@/lib/api';
import type { Category, Paginated, Product, Unit } from '@/lib/types';

export interface ProductFilters {
  search?: string;
  status?: string;
  categoryId?: string;
  page?: number;
  pageSize?: number;
}

export interface ProductInput {
  name: string;
  sku: string;
  barcode: string;
  categoryId: string;
  unit: Unit;
  replenishmentEnabled: boolean;
  avgDailyConsumption?: number;
  maxDailyConsumption?: number;
  leadTimeDays?: number;
  initialStock?: number;
  costPrice?: number;
  salePrice?: number;
}

/** Tudo que depende do saldo de estoque precisa ser recarregado após uma alteração. */
export function invalidateStockData(queryClient: QueryClient) {
  for (const key of ['products', 'dashboard', 'movements', 'purchase-requests', 'reports', 'trash']) {
    void queryClient.invalidateQueries({ queryKey: [key] });
  }
}

export const useProducts = (filters: ProductFilters) =>
  useQuery({
    queryKey: ['products', 'list', filters],
    queryFn: () => http.get<Paginated<Product>>('/products', { ...filters }),
    placeholderData: keepPreviousData,
  });

export const useProduct = (id: string) =>
  useQuery({ queryKey: ['products', 'detail', id], queryFn: () => http.get<Product>(`/products/${id}`) });

export const useCategories = () =>
  useQuery({ queryKey: ['categories'], queryFn: () => http.get<Category[]>('/categories'), staleTime: 5 * 60_000 });

export function useSaveProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id?: string; data: ProductInput }) =>
      id ? http.patch<Product>(`/products/${id}`, data) : http.post<Product>('/products', data),
    onSuccess: () => invalidateStockData(queryClient),
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => http.delete(`/products/${id}`),
    onSuccess: () => invalidateStockData(queryClient),
  });
}

/** Mesmas fórmulas do domínio da API — usadas só para pré-visualizar no formulário. */
export function previewIndicators(avg: number, max: number, lead: number) {
  const round = (value: number) => Math.round(value * 1000) / 1000;
  const minimumStock = avg * lead;
  const safetyStock = Math.max(max - avg, 0) * lead;
  return { minimumStock: round(minimumStock), safetyStock: round(safetyStock), reorderPoint: round(minimumStock + safetyStock) };
}
