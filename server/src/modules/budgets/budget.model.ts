import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { BUDGET_PERIODS } from '@savoney/shared';

const budgetSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 60 },
    amountMinor: { type: Number, required: true, min: 1 },
    category: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    period: { type: String, enum: BUDGET_PERIODS, default: 'monthly' },
    alertThreshold: { type: Number, default: 0.8, min: 0.1, max: 1 },
  },
  { timestamps: true },
);

/**
 * One budget per category per period. Two budgets over the same category would
 * each report the same spend, so a user would see one category's expenses
 * counted twice across their dashboard.
 */
budgetSchema.index({ user: 1, category: 1, period: 1 }, { unique: true });

export type BudgetAttributes = InferSchemaType<typeof budgetSchema>;
export type BudgetDocument = HydratedDocument<BudgetAttributes>;

export const Budget = model('Budget', budgetSchema);
