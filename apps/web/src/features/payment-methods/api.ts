import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '@/lib/api';
import type { PaymentKind, PaymentMethod } from '@/lib/types';

const CACHE_KEY = 'pdv:payment-methods';

/** Última lista conhecida: o caixa continua com as formas de pagamento mesmo sem internet. */
function cached(): PaymentMethod[] | undefined {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as PaymentMethod[]) : undefined;
  } catch {
    return undefined;
  }
}

/** Formas de pagamento ativas, na ordem do caixa. */
export const usePaymentMethods = () =>
  useQuery({
    queryKey: ['payment-methods', 'active'],
    queryFn: async () => {
      const methods = await http.get<PaymentMethod[]>('/payment-methods');
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(methods));
      } catch {
        /* sem armazenamento: só não fica disponível offline */
      }
      return methods;
    },
    initialData: cached,
    initialDataUpdatedAt: 0,
    staleTime: 60_000,
  });

/** Todas, inclusive desativadas (tela de configurações). */
export const useAllPaymentMethods = () =>
  useQuery({ queryKey: ['payment-methods', 'all'], queryFn: () => http.get<PaymentMethod[]>('/payment-methods', { all: true }) });

export interface PaymentMethodInput {
  name: string;
  kind: PaymentKind;
  active: boolean;
  allowsChange: boolean;
  requiresCustomer: boolean;
  feePercent: number;
  settlementDays: number;
  position?: number;
}

export function useSavePaymentMethod() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id?: string; data: Partial<PaymentMethodInput> }) =>
      id ? http.patch<PaymentMethod>(`/payment-methods/${id}`, data) : http.post<PaymentMethod>('/payment-methods', data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['payment-methods'] }),
  });
}

export function useDeletePaymentMethod() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => http.delete(`/payment-methods/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['payment-methods'] }),
  });
}
