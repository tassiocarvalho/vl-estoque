import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { http } from '@/lib/api';
import type { Installment, Paginated, PurchaseInvoice, PurchaseInvoiceListItem, PurchaseInvoiceStatus } from '@/lib/types';

export interface InvoiceItemInput {
  productId: string | null;
  supplierCode?: string | null;
  description: string;
  barcode?: string | null;
  purchaseUnit?: string | null;
  quantity: number;
  unitCost: number;
  total: number;
  factor: number;
}

export interface InvoiceInput {
  supplierId: string | null;
  documentNumber: string | null;
  series: string | null;
  issueDate: string | null;
  freight: number;
  otherCosts: number;
  discount: number;
  declaredTotal: number | null;
  notes: string | null;
  items: InvoiceItemInput[];
  installments: Installment[];
}

export const useInvoices = (filters: { status?: PurchaseInvoiceStatus; supplierId?: string; search?: string; page?: number; pageSize?: number }) =>
  useQuery({
    queryKey: ['invoices', 'list', filters],
    queryFn: () => http.get<Paginated<PurchaseInvoiceListItem>>('/purchase-invoices', { ...filters }),
    placeholderData: keepPreviousData,
  });

export const useInvoice = (id: string | undefined) =>
  useQuery({
    queryKey: ['invoices', 'detail', id],
    queryFn: () => http.get<PurchaseInvoice>(`/purchase-invoices/${id}`),
    enabled: Boolean(id),
  });

/** Lançar uma nota mexe em estoque, custos, pedidos, fornecedores e contas a pagar. */
export function invalidatePurchaseData(queryClient: QueryClient) {
  for (const key of ['invoices', 'products', 'suppliers', 'purchase-requests', 'movements', 'dashboard', 'payables', 'reports']) {
    void queryClient.invalidateQueries({ queryKey: [key] });
  }
}

export function useInvoiceMutations() {
  const queryClient = useQueryClient();
  const onSuccess = () => invalidatePurchaseData(queryClient);
  return {
    create: useMutation({ mutationFn: (data: InvoiceInput) => http.post<PurchaseInvoice>('/purchase-invoices', data), onSuccess }),
    update: useMutation({
      mutationFn: ({ id, data }: { id: string; data: InvoiceInput }) => http.put<PurchaseInvoice>(`/purchase-invoices/${id}`, data),
      onSuccess,
    }),
    importXml: useMutation({ mutationFn: (xml: string) => http.post<PurchaseInvoice>('/purchase-invoices/import-xml', { xml }), onSuccess }),
    finalize: useMutation({ mutationFn: (id: string) => http.post<PurchaseInvoice>(`/purchase-invoices/${id}/finalize`), onSuccess }),
    remove: useMutation({ mutationFn: (id: string) => http.delete(`/purchase-invoices/${id}`), onSuccess }),
  };
}

/** Lê o arquivo XML escolhido (as NF-e são UTF-8). */
export const readTextFile = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo'));
    reader.readAsText(file, 'utf-8');
  });
