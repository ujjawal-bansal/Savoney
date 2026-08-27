import { z } from 'zod';
import { objectIdSchema } from './common.js';

export const ANALYTICS_PRESETS = [
  'last_7_days',
  'last_30_days',
  'last_90_days',
  'this_month',
  'last_month',
  'this_year',
  'all_time',
  'custom',
] as const;

export const analyticsPresetSchema = z.enum(ANALYTICS_PRESETS).default('last_30_days');

/**
 * `preset` covers the dashboard's one-click ranges; `custom` unlocks explicit
 * bounds. Requiring both bounds under `custom` keeps the resolver total — it
 * never has to invent a missing edge.
 */
export const analyticsQuerySchema = z
  .object({
    preset: analyticsPresetSchema,
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    categoryId: objectIdSchema.optional(),
  })
  .refine((v) => v.preset !== 'custom' || (v.from && v.to), {
    message: 'A custom range requires both `from` and `to`',
    path: ['from'],
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    message: '`from` must be on or before `to`',
    path: ['from'],
  });

export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;
export type AnalyticsPreset = z.infer<typeof analyticsPresetSchema>;

export const trendGranularitySchema = z.enum(['day', 'week', 'month']).default('day');

export const trendQuerySchema = analyticsQuerySchema.safeExtend({
  granularity: trendGranularitySchema,
});

export type TrendQuery = z.infer<typeof trendQuerySchema>;

export interface CategoryBreakdownEntry {
  categoryId: string | null;
  name: string;
  color: string;
  icon: string;
  amountMinor: number;
  transactionCount: number;
  /** Share of the type's total for the range, 0–100. */
  percentage: number;
}

export interface TrendPoint {
  /** Bucket start as an ISO date (`YYYY-MM-DD`). */
  date: string;
  incomeMinor: number;
  expenseMinor: number;
  netMinor: number;
}

export interface AnalyticsSummary {
  range: { from: string; to: string; preset: AnalyticsPreset };
  incomeMinor: number;
  expenseMinor: number;
  netMinor: number;
  transactionCount: number;
  /** Mean expense per day across the range — the burn rate. */
  averageDailySpendMinor: number;
  /** Expenses as a share of income, 0–100+. Null when there is no income. */
  savingsRate: number | null;
  /** Same metrics for the immediately preceding window of equal length. */
  previous: {
    incomeMinor: number;
    expenseMinor: number;
    netMinor: number;
  };
  /** Percentage change vs. `previous`. Null when the prior window was zero. */
  deltas: {
    income: number | null;
    expense: number | null;
    net: number | null;
  };
  topExpenseCategories: CategoryBreakdownEntry[];
  largestExpense: { id: string; title: string; amountMinor: number; occurredAt: string } | null;
}

export interface AnalyticsBreakdown {
  income: CategoryBreakdownEntry[];
  expense: CategoryBreakdownEntry[];
}

/** Percentage change from `previous` to `current`; null when there is no base to compare against. */
export const percentDelta = (current: number, previous: number): number | null => {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
};
