import { useMutation, useQuery } from '@tanstack/react-query';
import type { BudgetWithProgress, CreateBudgetInput, UpdateBudgetInput } from '@savoney/shared';
import { api } from '@/lib/api';
import { invalidateLedger, queryClient, queryKeys } from '@/lib/query-client';

export const useBudgets = () =>
  useQuery({
    queryKey: queryKeys.budgets(),
    queryFn: () => api.get<{ budgets: BudgetWithProgress[] }>('/budgets').then((r) => r.budgets),
  });

export const useCreateBudget = () =>
  useMutation({
    mutationFn: (input: CreateBudgetInput) =>
      api.post<{ budget: BudgetWithProgress }>('/budgets', input).then((r) => r.budget),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['budgets'] }),
  });

export const useUpdateBudget = () =>
  useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateBudgetInput }) =>
      api.patch<{ budget: BudgetWithProgress }>(`/budgets/${id}`, input).then((r) => r.budget),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['budgets'] }),
  });

export const useDeleteBudget = () =>
  useMutation({
    mutationFn: (id: string) => api.delete<void>(`/budgets/${id}`),
    onSuccess: invalidateLedger,
  });
