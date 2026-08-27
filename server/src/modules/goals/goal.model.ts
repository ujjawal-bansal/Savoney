import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import type { Goal as GoalDto } from '@savoney/shared';

const goalSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 60 },
    targetMinor: { type: Number, required: true, min: 1 },
    savedMinor: { type: Number, default: 0, min: 0 },
    targetDate: { type: Date, default: null },
    color: { type: String, default: '#0ea5e9' },
    notes: { type: String, trim: true, maxlength: 300, default: '' },
  },
  { timestamps: true },
);

export type GoalAttributes = InferSchemaType<typeof goalSchema>;
export type GoalDocument = HydratedDocument<GoalAttributes>;

const MONTH_MS = 30 * 86_400_000;

export const toGoalDto = (doc: GoalDocument, now = new Date()): GoalDto => {
  const remainingMinor = Math.max(0, doc.targetMinor - doc.savedMinor);
  const isComplete = doc.savedMinor >= doc.targetMinor;

  // Only meaningful for a dated, unmet goal — otherwise there is no deadline to
  // pace against, and reporting a number would imply one exists.
  let requiredMonthlyMinor: number | null = null;
  if (doc.targetDate && !isComplete) {
    const monthsLeft = Math.max(
      1,
      Math.ceil((doc.targetDate.getTime() - now.getTime()) / MONTH_MS),
    );
    requiredMonthlyMinor = Math.ceil(remainingMinor / monthsLeft);
  }

  return {
    id: doc._id.toString(),
    name: doc.name,
    targetMinor: doc.targetMinor,
    savedMinor: doc.savedMinor,
    remainingMinor,
    percentComplete:
      doc.targetMinor === 0 ? 0 : Math.min(100, (doc.savedMinor / doc.targetMinor) * 100),
    targetDate: doc.targetDate ? doc.targetDate.toISOString() : null,
    requiredMonthlyMinor,
    isComplete,
    color: doc.color,
    notes: doc.notes,
    createdAt: (doc.get('createdAt') as Date).toISOString(),
    updatedAt: (doc.get('updatedAt') as Date).toISOString(),
  };
};

export const Goal = model('Goal', goalSchema);
