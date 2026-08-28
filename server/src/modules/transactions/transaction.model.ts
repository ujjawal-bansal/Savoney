import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { RECURRENCE_FREQUENCIES, type Transaction as TransactionDto } from '@savoney/shared';
import type { CategoryDocument } from '../categories/category.model.js';

const recurrenceSchema = new Schema(
  {
    frequency: { type: String, enum: RECURRENCE_FREQUENCIES, default: 'none' },
    interval: { type: Number, default: 1, min: 1, max: 365 },
    until: { type: Date, default: null },
    /** When the next copy is due. Null once the series has finished. */
    nextOccurrenceAt: { type: Date, default: null },
  },
  { _id: false },
);

const transactionSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
    /**
     * Integer minor units — cents, not dollars. See `@savoney/shared/money`:
     * a float here would accumulate rounding error across sums and make the
     * ledger fail to reconcile.
     */
    amountMinor: { type: Number, required: true, min: 1 },
    type: { type: String, enum: ['income', 'expense'], required: true },
    category: { type: Schema.Types.ObjectId, ref: 'Category', required: true, index: true },
    /** When the money moved, as opposed to `createdAt` (when it was recorded). */
    occurredAt: { type: Date, required: true },
    notes: { type: String, trim: true, maxlength: 500, default: '' },
    tags: { type: [String], default: [] },
    recurrence: { type: recurrenceSchema, default: null },
    /** Set on rows produced by a recurring template, pointing back at it. */
    generatedFrom: { type: Schema.Types.ObjectId, ref: 'Transaction', default: null },
  },
  { timestamps: true },
);

/**
 * Index design follows the queries the app actually issues.
 *
 * Every query is scoped to one user, so `user` leads each compound index; the
 * second field is whatever the query then filters or sorts on. This lets Mongo
 * satisfy the default listing (user + date desc) entirely from the index,
 * without a separate in-memory sort stage.
 */
transactionSchema.index({ user: 1, occurredAt: -1 });
transactionSchema.index({ user: 1, type: 1, occurredAt: -1 });
transactionSchema.index({ user: 1, category: 1, occurredAt: -1 });
transactionSchema.index({ user: 1, tags: 1 });
/** Supports finding recurring templates that are due for materialisation. */
transactionSchema.index({ user: 1, 'recurrence.nextOccurrenceAt': 1 });

export type TransactionAttributes = InferSchemaType<typeof transactionSchema>;
export type TransactionDocument = HydratedDocument<TransactionAttributes>;

const isPopulatedCategory = (value: unknown): value is CategoryDocument =>
  typeof value === 'object' && value !== null && 'name' in value && 'color' in value;

export const toTransactionDto = (doc: TransactionDocument): TransactionDto => {
  const category = doc.category;

  return {
    id: doc._id.toString(),
    title: doc.title,
    amountMinor: doc.amountMinor,
    type: doc.type as TransactionDto['type'],
    category: isPopulatedCategory(category)
      ? {
          id: category._id.toString(),
          name: category.name,
          color: category.color,
          icon: category.icon,
        }
      : null,
    occurredAt: doc.occurredAt.toISOString(),
    notes: doc.notes,
    tags: doc.tags,
    ...(doc.recurrence && doc.recurrence.frequency !== 'none'
      ? {
          recurrence: {
            frequency: doc.recurrence.frequency as TransactionDto['type'] extends never
              ? never
              : NonNullable<TransactionDto['recurrence']>['frequency'],
            interval: doc.recurrence.interval,
            ...(doc.recurrence.until ? { until: doc.recurrence.until } : {}),
            ...(doc.recurrence.nextOccurrenceAt
              ? { nextOccurrenceAt: doc.recurrence.nextOccurrenceAt.toISOString() }
              : {}),
          },
        }
      : {}),
    ...(doc.generatedFrom ? { generatedFrom: doc.generatedFrom.toString() } : {}),
    createdAt: (doc.get('createdAt') as Date).toISOString(),
    updatedAt: (doc.get('updatedAt') as Date).toISOString(),
  };
};

export const Transaction = model('Transaction', transactionSchema);
