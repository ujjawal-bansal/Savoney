import { z } from 'zod';
import { objectIdSchema, positiveMinorSchema } from './common.js';

export const BUDGET_PERIODS = ['weekly', 'monthly', 'quarterly', 'yearly'] as const;
export const budgetPeriodSchema = z.enum(BUDGET_PERIODS);
export type BudgetPeriod = z.infer<typeof budgetPeriodSchema>;

export const createBudgetSchema = z.object({
  name: z.string().trim().min(2, 'Budget name must be at least 2 characters').max(60),
  amountMinor: positiveMinorSchema,
  categoryId: objectIdSchema,
  period: budgetPeriodSchema.default('monthly'),
  /** Alert threshold as a fraction of the limit — 0.8 warns at 80% spent. */
  alertThreshold: z.number().min(0.1).max(1).default(0.8),
});

export const updateBudgetSchema = createBudgetSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'No changes supplied' });

export type CreateBudgetInput = z.infer<typeof createBudgetSchema>;
export type UpdateBudgetInput = z.infer<typeof updateBudgetSchema>;

export type BudgetStatus = 'on_track' | 'at_risk' | 'over_budget';

/**
 * A budget joined with its live spend for the current period. `spentMinor` is
 * computed by aggregation at read time rather than denormalised onto the
 * document, so editing or deleting a transaction can never leave a stale total.
 */
export interface BudgetWithProgress {
  id: string;
  name: string;
  amountMinor: number;
  category: { id: string; name: string; color: string; icon: string } | null;
  period: BudgetPeriod;
  alertThreshold: number;
  spentMinor: number;
  remainingMinor: number;
  /** Spend as a percentage of the limit. Exceeds 100 when over budget. */
  percentUsed: number;
  status: BudgetStatus;
  periodStart: string;
  periodEnd: string;
  /** Whole days left in the current period, floor 0. */
  daysRemaining: number;
  /** What the user can spend per remaining day and still land on budget. */
  safeDailySpendMinor: number;
  /** Period-end spend if the current burn rate holds. */
  projectedSpendMinor: number;
  createdAt: string;
  updatedAt: string;
}

export const budgetStatusOf = (
  spentMinor: number,
  amountMinor: number,
  alertThreshold: number,
): BudgetStatus => {
  if (amountMinor <= 0) return 'on_track';
  if (spentMinor > amountMinor) return 'over_budget';
  if (spentMinor >= amountMinor * alertThreshold) return 'at_risk';
  return 'on_track';
};
