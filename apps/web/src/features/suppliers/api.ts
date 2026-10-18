import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '@/lib/api';
import type { Paginated, ProductSupplierLink, Supplier, SupplierDetail } from '@/lib/types';

export interface SupplierInput {
  name: string;
  tradeName?: string | null;
  document?: string | null;
  phone?: string | null;
  email?: string | null;
  contactName?: string | null;
  leadTimeDays?: number | null;
  paymentTerms?: string | null;
  notes?: string | null;
  active?: boolean;
}

export interface SupplierFilters {
  search?: string;
  status?: 'active' | 'inactive' | 'all';
  page?: number;
  pageSize?: number;
}

export const useSuppliers = (filters: SupplierFilters, enabled = true) =>
  useQuery({
    queryKey: ['suppliers', 'list', filters],
    queryFn: () => http.get<Paginated<Supplier>>('/suppliers', { ...filters }),
    placeholderData: keepPreviousData,
    enabled,
  });

export const useSupplier = (id: string | null) =>
  useQuery({
    queryKey: ['suppliers', 'detail', id],
    queryFn: () => http.get<SupplierDetail>(`/suppliers/${id}`),
    enabled: Boolean(id),
  });

export const useProductSuppliers = (productId: string, enabled = true) =>
  useQuery({
    queryKey: ['suppliers', 'product', productId],
    queryFn: () => http.get<ProductSupplierLink[]>(`/products/${productId}/suppliers`),
    enabled,
  });

export function useSaveSupplier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id?: string; data: Partial<SupplierInput> }) =>
      id ? http.patch<Supplier>(`/suppliers/${id}`, data) : http.post<Supplier>('/suppliers', data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['suppliers'] }),
  });
}

export function useLinkProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ supplierId, productId, data }: { supplierId: string; productId: string; data: { supplierCode?: string | null; factor?: number; preferred?: boolean } }) =>
      http.put<ProductSupplierLink>(`/suppliers/${supplierId}/products/${productId}`, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      void queryClient.invalidateQueries({ queryKey: ['purchase-requests'] });
    },
  });
}

export function useUnlinkProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ supplierId, productId }: { supplierId: string; productId: string }) =>
      http.delete(`/suppliers/${supplierId}/products/${productId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['suppliers'] }),
  });
}
