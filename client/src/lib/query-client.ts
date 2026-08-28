import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      /**
       * Financial data does not change behind the user's back within a minute,
       * so serving it from cache while revalidating keeps navigation instant
       * without showing stale numbers for long.
       */
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // Retrying a 4xx just repeats the same rejection; only transient
        // failures are worth a second attempt.
        if (error instanceof ApiError && error.status < 500) return false;
        return failureCount < 2;
      },
    },
    mutations: { retry: false },
  },
});

/** Query keys in one place, so an invalidation can never miss a cache entry. */
export const queryKeys = {
  me: ['me'] as const,
  categories: (params?: unknown) => ['categories', params ?? {}] as const,
  transactions: (params?: unknown) => ['transactions', params ?? {}] as const,
  transaction: (id: string) => ['transactions', 'detail', id] as const,
  budgets: () => ['budgets'] as const,
  goals: () => ['goals'] as const,
  analyticsSummary: (params?: unknown) => ['analytics', 'summary', params ?? {}] as const,
  analyticsBreakdown: (params?: unknown) => ['analytics', 'breakdown', params ?? {}] as const,
  analyticsTrend: (params?: unknown) => ['analytics', 'trend', params ?? {}] as const,
};

/**
 * Invalidate everything a write to the ledger can affect.
 *
 * Adding a transaction changes budget progress, every analytics view, and
 * category usage counts — not just the transaction list. Centralising this
 * prevents the classic bug where the list updates but the dashboard totals
 * silently do not.
 */
export const invalidateLedger = async (): Promise<void> => {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['transactions'] }),
    queryClient.invalidateQueries({ queryKey: ['budgets'] }),
    queryClient.invalidateQueries({ queryKey: ['analytics'] }),
    queryClient.invalidateQueries({ queryKey: ['categories'] }),
  ]);
};
