import { z } from 'zod';
import { MAX_MINOR } from '../money.js';

/** A MongoDB ObjectId in its 24-character hex form. */
export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid id');

/**
 * A signed integer amount in minor units.
 *
 * The API speaks minor units exclusively; clients convert at the form boundary
 * with `toMinor`. Accepting a decimal here would reintroduce float drift on the
 * wire, so non-integers are rejected rather than rounded.
 */
export const minorAmountSchema = z
  .number()
  .int('Amount must be a whole number of minor units (cents)')
  .max(MAX_MINOR, 'Amount is too large');

/** Minor units that must be strictly positive — the shape every ledger entry takes. */
export const positiveMinorSchema = minorAmountSchema.positive('Amount must be greater than zero');

/** Minor units that may be zero, for targets and budget ceilings. */
export const nonNegativeMinorSchema = minorAmountSchema.min(0, 'Amount cannot be negative');

export const hexColorSchema = z
  .string()
  .regex(/^#(?:[\da-f]{3}|[\da-f]{6})$/i, 'Must be a hex colour such as #4f46e5');

export const sortOrderSchema = z.enum(['asc', 'desc']).default('desc');

/**
 * Page/limit pagination. Coerced because query strings arrive as text, and
 * `limit` is capped so a client cannot ask the database for an unbounded scan.
 */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface Paginated<T> {
  items: T[];
  meta: PageMeta;
}

/**
 * An inclusive date window. Both bounds are optional so callers can express
 * "everything before X" or "everything since Y", but an inverted window is a
 * client bug and is rejected rather than silently returning nothing.
 */
export const dateRangeSchema = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    message: '`from` must be on or before `to`',
    path: ['from'],
  });

export type DateRange = z.infer<typeof dateRangeSchema>;

/** The envelope every error response uses, so the client has one shape to parse. */
export interface ApiErrorBody {
  error: {
    message: string;
    code: string;
    /** Field-level messages, keyed by dotted path, when validation failed. */
    details?: Record<string, string[]>;
    requestId?: string;
  };
}
