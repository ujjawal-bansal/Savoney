import { useMutation, useQuery } from '@tanstack/react-query';
import type { Category, CreateCategoryInput, UpdateCategoryInput } from '@savoney/shared';
import { api, toQueryString } from '@/lib/api';
import { invalidateLedger, queryClient, queryKeys } from '@/lib/query-client';

interface CategoryFilters {
  type?: 'income' | 'expense';
  includeArchived?: boolean;
}

export const useCategories = (filters: CategoryFilters = {}) =>
  useQuery({
    queryKey: queryKeys.categories(filters),
    queryFn: () =>
      api
        .get<{ categories: Category[] }>(`/categories${toQueryString(filters)}`)
        .then((response) => response.categories),
    // Categories change far less often than the ledger they classify.
    staleTime: 5 * 60_000,
  });

export const useCreateCategory = () =>
  useMutation({
    mutationFn: (input: CreateCategoryInput) =>
      api.post<{ category: Category }>('/categories', input).then((r) => r.category),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories'] }),
  });

export const useUpdateCategory = () =>
  useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCategoryInput }) =>
      api.patch<{ category: Category }>(`/categories/${id}`, input).then((r) => r.category),
    // A rename or recolour shows up on transactions and charts too.
    onSuccess: invalidateLedger,
  });

export const useArchiveCategory = () =>
  useMutation({
    mutationFn: ({ id, isArchived }: { id: string; isArchived: boolean }) =>
      api
        .post<{ category: Category }>(`/categories/${id}/archive`, { isArchived })
        .then((r) => r.category),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories'] }),
  });

export const useDeleteCategory = () =>
  useMutation({
    mutationFn: ({ id, reassignTo }: { id: string; reassignTo?: string }) =>
      api.delete<{ deleted: boolean; reassigned: number }>(
        `/categories/${id}${toQueryString({ reassignTo })}`,
      ),
    onSuccess: invalidateLedger,
  });
