import { z } from 'zod';
import {
  objectIdSchema,
  paginationQuerySchema,
  positiveMinorSchema,
  sortOrderSchema,
} from './common.js';
import { flowTypeSchema } from './category.js';

export const RECURRENCE_FREQUENCIES = ['none', 'daily', 'weekly', 'monthly', 'yearly'] as const;
export const recurrenceFrequencySchema = z.enum(RECURRENCE_FREQUENCIES);
export type RecurrenceFrequency = z.infer<typeof recurrenceFrequencySchema>;

/**
 * A recurrence rule attached to a template transaction. `interval` is the step
 * between occurrences (every 2 weeks, every 3 months); `until` bounds an
 * otherwise open-ended series so materialisation always terminates.
 */
export const recurrenceSchema = z
  .object({
    frequency: recurrenceFrequencySchema.default('none'),
    interval: z.coerce.number().int().min(1).max(365).default(1),
    until: z.coerce.date().optional(),
  })
  .refine((v) => v.frequency !== 'none' || v.interval === 1, {
    message: 'A non-recurring transaction cannot have an interval',
    path: ['interval'],
  });

export type Recurrence = z.infer<typeof recurrenceSchema>;

export const createTransactionSchema = z.object({
  title: z.string().trim().min(2, 'Title must be at least 2 characters').max(120),
  amountMinor: positiveMinorSchema,
  type: flowTypeSchema,
  categoryId: objectIdSchema,
  /** When the money actually moved — distinct from when the row was created. */
  occurredAt: z.coerce
    .date()
    .max(
      new Date(Date.now() + 366 * 24 * 60 * 60 * 1000),
      'Date cannot be more than a year in the future',
    ),
  notes: z.string().trim().max(500).default(''),
  tags: z.array(z.string().trim().min(1).max(24)).max(10).default([]),
  recurrence: recurrenceSchema.optional(),
});

export const updateTransactionSchema = createTransactionSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'No changes supplied' });

export const TRANSACTION_SORT_FIELDS = ['occurredAt', 'amountMinor', 'title', 'createdAt'] as const;

/**
 * The full transaction query surface: pagination, faceted filters, an amount
 * window, and full-text search. Every field is optional so the bare endpoint
 * still returns a sensible first page.
 */
export const transactionQuerySchema = paginationQuerySchema
  .extend({
    type: flowTypeSchema.optional(),
    categoryId: objectIdSchema.optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    search: z.string().trim().min(1).max(120).optional(),
    tag: z.string().trim().min(1).max(24).optional(),
    minAmountMinor: z.coerce.number().int().min(0).optional(),
    maxAmountMinor: z.coerce.number().int().min(0).optional(),
    sort: z.enum(TRANSACTION_SORT_FIELDS).default('occurredAt'),
    order: sortOrderSchema,
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    message: '`from` must be on or before `to`',
    path: ['from'],
  })
  .refine(
    (v) =>
      v.minAmountMinor === undefined ||
      v.maxAmountMinor === undefined ||
      v.minAmountMinor <= v.maxAmountMinor,
    { message: '`minAmountMinor` must not exceed `maxAmountMinor`', path: ['minAmountMinor'] },
  );

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;
export type TransactionQuery = z.infer<typeof transactionQuerySchema>;

export interface TransactionCategoryRef {
  id: string;
  name: string;
  color: string;
  icon: string;
}

export interface Transaction {
  id: string;
  title: string;
  amountMinor: number;
  type: 'income' | 'expense';
  category: TransactionCategoryRef | null;
  occurredAt: string;
  notes: string;
  tags: string[];
  recurrence?: Recurrence & { nextOccurrenceAt?: string };
  /** Set when this row was generated from a recurring template. */
  generatedFrom?: string;
  createdAt: string;
  updatedAt: string;
}

/** Bulk delete keeps the client from firing N requests to clear a filtered view. */
export const bulkDeleteSchema = z.object({
  ids: z.array(objectIdSchema).min(1, 'Select at least one transaction').max(100),
});

export type BulkDeleteInput = z.infer<typeof bulkDeleteSchema>;
