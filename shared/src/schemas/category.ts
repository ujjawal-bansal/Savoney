import { z } from 'zod';
import { hexColorSchema, objectIdSchema } from './common.js';

export const flowTypeSchema = z.enum(['income', 'expense']);
export type FlowType = z.infer<typeof flowTypeSchema>;

/** Lucide icon keys the client is guaranteed to be able to render. */
export const CATEGORY_ICONS = [
  'wallet',
  'shopping-cart',
  'utensils',
  'car',
  'home',
  'plug',
  'heart-pulse',
  'graduation-cap',
  'plane',
  'film',
  'dumbbell',
  'gift',
  'briefcase',
  'trending-up',
  'piggy-bank',
  'smartphone',
  'shirt',
  'paw-print',
  'coffee',
  'receipt',
] as const;

export const categoryIconSchema = z.enum(CATEGORY_ICONS).default('receipt');

export const createCategorySchema = z.object({
  name: z.string().trim().min(2, 'Category name must be at least 2 characters').max(40),
  type: flowTypeSchema,
  color: hexColorSchema.default('#6366f1'),
  icon: categoryIconSchema,
});

/** `type` is immutable after creation: flipping it would silently invert every
 *  historical transaction filed under the category and corrupt past reports. */
export const updateCategorySchema = createCategorySchema
  .omit({ type: true })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'No changes supplied' });

export const categoryQuerySchema = z.object({
  type: flowTypeSchema.optional(),
  includeArchived: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((v) => v === true || v === 'true')
    .default(false),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CategoryQuery = z.infer<typeof categoryQuerySchema>;

export interface Category {
  id: string;
  name: string;
  type: FlowType;
  color: string;
  icon: (typeof CATEGORY_ICONS)[number];
  isArchived: boolean;
  /** Number of transactions filed under this category, when the caller asks for it. */
  transactionCount?: number;
  createdAt: string;
  updatedAt: string;
}

export const reassignTargetSchema = z.object({
  /** Where to move existing transactions when deleting a category still in use. */
  reassignTo: objectIdSchema.optional(),
});
