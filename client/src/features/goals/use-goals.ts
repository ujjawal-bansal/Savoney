import { useMutation, useQuery } from '@tanstack/react-query';
import type { CreateGoalInput, Goal, UpdateGoalInput } from '@savoney/shared';
import { api } from '@/lib/api';
import { queryClient, queryKeys } from '@/lib/query-client';

const invalidateGoals = () => queryClient.invalidateQueries({ queryKey: ['goals'] });

export const useGoals = () =>
  useQuery({
    queryKey: queryKeys.goals(),
    queryFn: () => api.get<{ goals: Goal[] }>('/goals').then((r) => r.goals),
  });

export const useCreateGoal = () =>
  useMutation({
    mutationFn: (input: CreateGoalInput) =>
      api.post<{ goal: Goal }>('/goals', input).then((r) => r.goal),
    onSuccess: invalidateGoals,
  });

export const useUpdateGoal = () =>
  useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateGoalInput }) =>
      api.patch<{ goal: Goal }>(`/goals/${id}`, input).then((r) => r.goal),
    onSuccess: invalidateGoals,
  });

export const useContributeToGoal = () =>
  useMutation({
    mutationFn: ({ id, amountMinor }: { id: string; amountMinor: number }) =>
      api.post<{ goal: Goal }>(`/goals/${id}/contribute`, { amountMinor }).then((r) => r.goal),
    onSuccess: invalidateGoals,
  });

export const useDeleteGoal = () =>
  useMutation({
    mutationFn: (id: string) => api.delete<void>(`/goals/${id}`),
    onSuccess: invalidateGoals,
  });
