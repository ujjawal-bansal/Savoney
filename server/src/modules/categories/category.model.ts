import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { CATEGORY_ICONS, type Category as CategoryDto } from '@savoney/shared';

const categorySchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 40 },
    type: { type: String, enum: ['income', 'expense'], required: true },
    color: { type: String, required: true, default: '#6366f1' },
    icon: { type: String, enum: CATEGORY_ICONS, default: 'receipt' },
    /**
     * Categories are archived rather than deleted when transactions reference
     * them: destroying one would orphan historical rows and silently rewrite
     * past reports.
     */
    isArchived: { type: Boolean, default: false },
  },
  { timestamps: true },
);

/**
 * Names are unique per user, case-insensitively — "Food" and "food" are the
 * same category to a person, and allowing both makes the picker confusing and
 * splits reporting totals in two.
 */
categorySchema.index(
  { user: 1, name: 1 },
  { unique: true, collation: { locale: 'en', strength: 2 } },
);
categorySchema.index({ user: 1, type: 1, isArchived: 1 });

export type CategoryAttributes = InferSchemaType<typeof categorySchema>;
export type CategoryDocument = HydratedDocument<CategoryAttributes>;

export const toCategoryDto = (doc: CategoryDocument, transactionCount?: number): CategoryDto => ({
  id: doc._id.toString(),
  name: doc.name,
  type: doc.type as CategoryDto['type'],
  color: doc.color,
  icon: doc.icon as CategoryDto['icon'],
  isArchived: doc.isArchived,
  ...(transactionCount !== undefined ? { transactionCount } : {}),
  createdAt: (doc.get('createdAt') as Date).toISOString(),
  updatedAt: (doc.get('updatedAt') as Date).toISOString(),
});

export const Category = model('Category', categorySchema);
