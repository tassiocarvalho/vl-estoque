import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '@/lib/api';
import type { ExpenseCategory, Paginated, Payable, PayablesSummary } from '@/lib/types';

export interface PayableFilters {
  status?: 'open' | 'paid' | 'canceled' | 'all';
  due?: 'overdue' | 'today' | 'week' | 'month';
  from?: string;
  to?: string;
  supplierId?: string;
  categoryId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface PayableInput {
  description: string;
  categoryId: string;
  supplierId?: string | null;
  documentNumber?: string | null;
  amount: number;
  dueDate: string;
  installments?: number;
  intervalDays?: number;
  notes?: string | null;
}

export const usePayables = (filters: PayableFilters) =>
  useQuery({
    queryKey: ['payables', 'list', filters],
    queryFn: () => http.get<Paginated<Payable> & { summary: PayablesSummary }>('/payables', { ...filters }),
    placeholderData: keepPreviousData,
  });

export const useExpenseCategories = (all = false) =>
  useQuery({
    queryKey: ['payables', 'categories', all],
    queryFn: () => http.get<ExpenseCategory[]>('/expense-categories', { all }),
    staleTime: 60_000,
  });

export function usePayableMutations() {
  const queryClient = useQueryClient();
  const onSuccess = () => {
    void queryClient.invalidateQueries({ queryKey: ['payables'] });
    void queryClient.invalidateQueries({ queryKey: ['finance'] });
    void queryClient.invalidateQueries({ queryKey: ['suppliers'] });
  };
  return {
    create: useMutation({ mutationFn: (data: PayableInput) => http.post<Payable[]>('/payables', data), onSuccess }),
    update: useMutation({
      mutationFn: ({ id, data }: { id: string; data: Partial<PayableInput> }) => http.patch<Payable>(`/payables/${id}`, data),
      onSuccess,
    }),
    pay: useMutation({
      mutationFn: ({ id, data }: { id: string; data: { paidAt: string; paidAmount: number; paymentMethodName: string } }) =>
        http.post<Payable>(`/payables/${id}/pay`, data),
      onSuccess,
    }),
    reopen: useMutation({ mutationFn: (id: string) => http.post<Payable>(`/payables/${id}/reopen`), onSuccess }),
    cancel: useMutation({ mutationFn: (id: string) => http.post<Payable>(`/payables/${id}/cancel`), onSuccess }),
    attach: useMutation({
      mutationFn: ({ id, file }: { id: string; file: { name: string; type: string; data: string } }) => http.put<Payable>(`/payables/${id}/attachment`, file),
      onSuccess,
    }),
    detach: useMutation({ mutationFn: (id: string) => http.delete<Payable>(`/payables/${id}/attachment`), onSuccess }),
    createCategory: useMutation({ mutationFn: (name: string) => http.post<ExpenseCategory>('/expense-categories', { name }), onSuccess }),
    updateCategory: useMutation({
      mutationFn: ({ id, data }: { id: string; data: { name?: string; active?: boolean } }) => http.patch<ExpenseCategory>(`/expense-categories/${id}`, data),
      onSuccess,
    }),
  };
}

/** Arquivo → base64 (sem o prefixo "data:"). */
export const fileToBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo'));
    reader.readAsDataURL(file);
  });

/** Abre o comprovante numa nova aba (com o cookie de sessão). */
export async function openAttachment(id: string) {
  const response = await fetch(`/api/payables/${id}/attachment`, { credentials: 'include' });
  if (!response.ok) throw new Error('Comprovante não encontrado');
  const url = URL.createObjectURL(await response.blob());
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
