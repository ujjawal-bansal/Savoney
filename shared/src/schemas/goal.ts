import { z } from 'zod';
import { hexColorSchema, positiveMinorSchema } from './common.js';

export const createGoalSchema = z
  .object({
    name: z.string().trim().min(2, 'Goal name must be at least 2 characters').max(60),
    targetMinor: positiveMinorSchema,
    savedMinor: z.number().int().min(0).default(0),
    targetDate: z.coerce.date().optional(),
    color: hexColorSchema.default('#0ea5e9'),
    notes: z.string().trim().max(300).default(''),
  })
  .refine((v) => v.savedMinor <= v.targetMinor, {
    message: 'Saved amount cannot exceed the target',
    path: ['savedMinor'],
  });

export const updateGoalSchema = z
  .object({
    name: z.string().trim().min(2).max(60).optional(),
    targetMinor: positiveMinorSchema.optional(),
    savedMinor: z.number().int().min(0).optional(),
    targetDate: z.coerce.date().nullable().optional(),
    color: hexColorSchema.optional(),
    notes: z.string().trim().max(300).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No changes supplied' });

/** Move money into or out of a goal. Negative withdraws; the service floors at zero. */
export const contributeGoalSchema = z.object({
  amountMinor: z
    .number()
    .int()
    .refine((v) => v !== 0, 'Contribution cannot be zero'),
});

export type CreateGoalInput = z.infer<typeof createGoalSchema>;
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;
export type ContributeGoalInput = z.infer<typeof contributeGoalSchema>;

export interface Goal {
  id: string;
  name: string;
  targetMinor: number;
  savedMinor: number;
  remainingMinor: number;
  percentComplete: number;
  targetDate: string | null;
  /** Monthly saving needed to hit the target by `targetDate`; null when undated or met. */
  requiredMonthlyMinor: number | null;
  isComplete: boolean;
  color: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}
