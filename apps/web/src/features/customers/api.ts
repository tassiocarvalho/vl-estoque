import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '@/lib/api';
import type { Customer, CustomerDetail, Paginated } from '@/lib/types';

export interface CustomerFilters {
  search?: string;
  status?: 'active' | 'inactive' | 'all';
  page?: number;
  pageSize?: number;
}

export interface CustomerInput {
  name: string;
  document?: string | null;
  phone?: string | null;
  email?: string | null;
  birthDate?: string | null;
  address?: string | null;
  notes?: string | null;
  consent?: boolean;
  consentChannel?: string;
  marketingConsent?: boolean;
  active?: boolean;
}

export const useCustomers = (filters: CustomerFilters, enabled = true) =>
  useQuery({
    queryKey: ['customers', 'list', filters],
    queryFn: () => http.get<Paginated<Customer>>('/customers', { ...filters }),
    placeholderData: keepPreviousData,
    enabled,
  });

export const useCustomer = (id: string | null) =>
  useQuery({
    queryKey: ['customers', 'detail', id],
    queryFn: () => http.get<CustomerDetail>(`/customers/${id}`),
    enabled: Boolean(id),
  });

export function useSaveCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id?: string; data: Partial<CustomerInput> }) =>
      id ? http.patch<Customer>(`/customers/${id}`, data) : http.post<Customer>('/customers', data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customers'] }),
  });
}

export const exportCustomer = (id: string) => http.get<unknown>(`/customers/${id}/export`);

export function useAnonymizeCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => http.post<Customer>(`/customers/${id}/anonymize`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customers'] }),
  });
}
