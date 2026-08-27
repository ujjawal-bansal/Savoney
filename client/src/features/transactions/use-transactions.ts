import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import type {
  CreateTransactionInput,
  Paginated,
  Transaction,
  UpdateTransactionInput,
} from '@savoney/shared';
import { api, apiRequest, toQueryString } from '@/lib/api';
import { invalidateLedger, queryKeys } from '@/lib/query-client';

export interface TransactionFilters {
  page?: number;
  limit?: number;
  type?: 'income' | 'expense' | '';
  categoryId?: string;
  from?: string;
  to?: string;
  search?: string;
  tag?: string;
  sort?: 'occurredAt' | 'amountMinor' | 'title' | 'createdAt';
  order?: 'asc' | 'desc';
}

export const useTransactions = (filters: TransactionFilters) =>
  useQuery({
    queryKey: queryKeys.transactions(filters),
    queryFn: () => api.get<Paginated<Transaction>>(`/transactions${toQueryString(filters)}`),
    /**
     * Keep the previous page visible while the next one loads. Without this the
     * table collapses to a skeleton on every keystroke of the search box, which
     * makes the whole page feel like it is flickering.
     */
    placeholderData: keepPreviousData,
  });

export const useCreateTransaction = () =>
  useMutation({
    mutationFn: (input: CreateTransactionInput) =>
      api.post<{ transaction: Transaction }>('/transactions', input).then((r) => r.transaction),
    onSuccess: invalidateLedger,
  });

export const useUpdateTransaction = () =>
  useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTransactionInput }) =>
      api
        .patch<{ transaction: Transaction }>(`/transactions/${id}`, input)
        .then((r) => r.transaction),
    onSuccess: invalidateLedger,
  });

export const useDeleteTransaction = () =>
  useMutation({
    mutationFn: (id: string) => api.delete<void>(`/transactions/${id}`),
    onSuccess: invalidateLedger,
  });

export const useBulkDeleteTransactions = () =>
  useMutation({
    mutationFn: (ids: string[]) =>
      api.post<{ deleted: number }>('/transactions/bulk-delete', { ids }),
    onSuccess: invalidateLedger,
  });

export const useImportTransactions = () =>
  useMutation({
    mutationFn: (csv: string) =>
      api.postRaw<{
        imported: number;
        skipped: number;
        categoriesCreated: string[];
        errors: Array<{ line: number; message: string }>;
      }>('/transactions/import', csv, 'text/csv'),
    onSuccess: invalidateLedger,
  });

/**
 * Download the ledger as a CSV file.
 *
 * Fetched through the API layer rather than by pointing the browser at the URL,
 * because the endpoint needs an Authorization header that a plain navigation
 * cannot send.
 */
export const downloadTransactionsCsv = async (): Promise<void> => {
  const csv = await apiRequest<string>('/transactions/export');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));

  const link = document.createElement('a');
  link.href = url;
  link.download = `savoney-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(link);
  link.click();
  link.remove();

  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
