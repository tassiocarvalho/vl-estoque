import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { http } from '@/lib/api';
import type {
  CreditInfo,
  CustomerReceipt,
  CustomerStatement,
  Paginated,
  Receivable,
  ReceivablesSummary,
  RefundMethod,
  ReturnPreview,
  SaleReturn,
  StoreCredit,
} from '@/lib/types';

export const fetchReturnPreview = (filter: { saleId?: string; number?: number }) => http.get<ReturnPreview>('/returns/preview', filter);

export interface ReturnInput {
  id: string;
  saleId: string;
  sessionId?: string;
  items: { saleItemId: string; quantity: number; restock: boolean }[];
  refundMethod: RefundMethod;
  reason: string;
}

export const createReturn = (data: ReturnInput) => http.post<SaleReturn>('/returns', data);

export const lookupCredit = (code: string) => http.get<StoreCredit>('/store-credits/lookup', { code: code.trim().toUpperCase() });

export const useCustomerCredit = (customerId: string | null | undefined, enabled = true) =>
  useQuery({
    queryKey: ['customers', 'credit', customerId],
    queryFn: () => http.get<CreditInfo>(`/customers/${customerId}/credit`),
    enabled: Boolean(customerId) && enabled,
    staleTime: 5_000,
  });

export const useCustomerStatement = (customerId: string | null) =>
  useQuery({
    queryKey: ['customers', 'statement', customerId],
    queryFn: () => http.get<CustomerStatement>(`/customers/${customerId}/statement`),
    enabled: Boolean(customerId),
  });

export const useCustomerCredits = (customerId: string | null) =>
  useQuery({
    queryKey: ['customers', 'store-credits', customerId],
    queryFn: () => http.get<StoreCredit[]>('/store-credits', { customerId }),
    enabled: Boolean(customerId),
  });

export interface ReceiptInput {
  id: string;
  sessionId: string;
  customerId: string;
  methodId: string;
  amount: number;
  received?: number;
}

export const createReceipt = (data: ReceiptInput) => http.post<CustomerReceipt>('/receipts', data);

export const useReceivables = (filters: { status?: string; overdue?: boolean; customerId?: string; search?: string; page?: number; pageSize?: number }) =>
  useQuery({
    queryKey: ['receivables', 'list', filters],
    queryFn: () => http.get<Paginated<Receivable>>('/receivables', { ...filters }),
    placeholderData: keepPreviousData,
  });

export const useReceivablesSummary = () =>
  useQuery({ queryKey: ['receivables', 'summary'], queryFn: () => http.get<ReceivablesSummary>('/receivables/summary') });

export const cancelReceivable = (id: string, reason: string) => http.post<Receivable>(`/receivables/${id}/cancel`, { reason });
