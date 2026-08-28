import { useMutation } from '@tanstack/react-query';
import type {
  ChangeCurrencyResult,
  ResetDataInput,
  ResetDataResult,
  Currency,
  PublicUser,
  UpdateProfileInput,
} from '@savoney/shared';
import { api, apiRequest } from '@/lib/api';
import { invalidateLedger } from '@/lib/query-client';

export const useUpdateProfile = () =>
  useMutation({
    mutationFn: (input: UpdateProfileInput) =>
      api.patch<{ user: PublicUser }>('/auth/me', input).then((r) => r.user),
  });

/**
 * Change the account currency.
 *
 * Every cached amount is an integer in the *old* currency, so once the server
 * has rewritten the ledger the client's cache is wrong in two ways at once —
 * stale numbers and a stale symbol. Invalidating the whole ledger is the only
 * safe response; a partial refresh would leave some views rendering old
 * amounts under the new symbol.
 */
export const useChangeCurrency = () =>
  useMutation({
    mutationFn: (currency: Currency) =>
      api.post<ChangeCurrencyResult>('/auth/currency', { currency, confirmRelabel: true }),
    onSuccess: invalidateLedger,
  });

export const useChangePassword = () =>
  useMutation({
    mutationFn: (input: { currentPassword: string; newPassword: string }) =>
      api.post<void>('/auth/change-password', input),
  });

export const useForgotPassword = () =>
  useMutation({
    mutationFn: (email: string) =>
      api.post<{ message: string; devLink?: string }>('/auth/forgot-password', { email }),
  });

export const useResetPassword = () =>
  useMutation({
    mutationFn: (input: { token: string; newPassword: string }) =>
      api.post<void>('/auth/reset-password', input),
  });

/** Wipes the ledger but keeps the account, so every cached list must be dropped. */
export const useResetData = () =>
  useMutation({
    mutationFn: (input: ResetDataInput) => api.post<ResetDataResult>('/auth/reset-data', input),
    onSuccess: invalidateLedger,
  });

export const useDeleteAccount = () =>
  useMutation({
    mutationFn: (password: string) =>
      apiRequest<void>('/auth/me', {
        method: 'DELETE',
        body: { password, confirmation: 'DELETE' },
      }),
  });
