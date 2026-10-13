import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '@/lib/api';
import type { Paginated, PurchaseRequest, PurchaseRequestStatus } from '@/lib/types';

export const usePurchaseRequests = (status: PurchaseRequestStatus | '', page: number) =>
  useQuery({
    queryKey: ['purchase-requests', status, page],
    queryFn: () => http.get<Paginated<PurchaseRequest>>('/purchase-requests', { status, page, pageSize: 25 }),
    placeholderData: keepPreviousData,
  });

export function useUpdatePurchaseStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: PurchaseRequestStatus }) =>
      http.patch<PurchaseRequest>(`/purchase-requests/${id}/status`, { status }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['purchase-requests'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useCreatePurchaseRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { productId: string; quantity: number; note?: string }) =>
      http.post<PurchaseRequest>('/purchase-requests', data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['purchase-requests'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
