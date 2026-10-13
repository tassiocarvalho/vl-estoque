import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { http } from '@/lib/api';
import type { Movement, MovementType, Paginated } from '@/lib/types';

export interface MovementFilters {
  productId?: string;
  type?: MovementType | '';
  direction?: 'IN' | 'OUT' | '';
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export const useMovements = (filters: MovementFilters, enabled = true) =>
  useQuery({
    queryKey: ['movements', filters],
    queryFn: () => http.get<Paginated<Movement>>('/stock/movements', { ...filters }),
    placeholderData: keepPreviousData,
    enabled,
  });
