import type { Types } from 'mongoose';
import type {
  Category as CategoryDto,
  CategoryQuery,
  CreateCategoryInput,
  UpdateCategoryInput,
} from '@savoney/shared';
import { logger } from '../../config/logger.js';
import { ApiError } from '../../lib/api-error.js';
import { Transaction } from '../transactions/transaction.model.js';
import { Category, toCategoryDto, type CategoryDocument } from './category.model.js';

/** The starter set every new account receives, so the app is usable immediately. */
const DEFAULT_CATEGORIES: ReadonlyArray<
  Omit<CreateCategoryInput, 'color' | 'icon'> & Pick<CreateCategoryInput, 'color' | 'icon'>
> = [
  { name: 'Salary', type: 'income', color: '#16a34a', icon: 'briefcase' },
  { name: 'Freelance', type: 'income', color: '#0d9488', icon: 'trending-up' },
  { name: 'Investments', type: 'income', color: '#0ea5e9', icon: 'piggy-bank' },
  { name: 'Groceries', type: 'expense', color: '#f97316', icon: 'shopping-cart' },
  { name: 'Rent', type: 'expense', color: '#8b5cf6', icon: 'home' },
  { name: 'Utilities', type: 'expense', color: '#eab308', icon: 'plug' },
  { name: 'Transport', type: 'expense', color: '#3b82f6', icon: 'car' },
  { name: 'Dining Out', type: 'expense', color: '#ef4444', icon: 'utensils' },
  { name: 'Healthcare', type: 'expense', color: '#ec4899', icon: 'heart-pulse' },
  { name: 'Entertainment', type: 'expense', color: '#a855f7', icon: 'film' },
  { name: 'Subscriptions', type: 'expense', color: '#6366f1', icon: 'smartphone' },
];

export const seedDefaultCategories = async (userId: Types.ObjectId): Promise<void> => {
  const wanted = DEFAULT_CATEGORIES.map((category) => ({ ...category, user: userId }));

  // Unordered so one bad document cannot abort the batch. Note that Mongoose
  // *silently drops* failures in this mode rather than throwing, so the result
  // has to be checked explicitly — otherwise a new account could quietly end up
  // with no categories and no way to record a transaction.
  const inserted = await Category.insertMany(wanted, { ordered: false });

  if (inserted.length !== wanted.length) {
    const created = new Set(inserted.map((category) => category.name));
    const missing = wanted.map((c) => c.name).filter((name) => !created.has(name));
    logger.error(
      { userId: userId.toString(), missing },
      'default categories partially seeded, the account is usable but incomplete',
    );
  }
};

/**
 * List categories, optionally annotated with how many transactions use each.
 *
 * The counts come from one grouped aggregation rather than a count query per
 * category — with 20 categories that is the difference between 1 round trip
 * and 21.
 */
export const listCategories = async (
  userId: Types.ObjectId,
  query: CategoryQuery,
): Promise<CategoryDto[]> => {
  const filter: Record<string, unknown> = { user: userId };
  if (query.type) filter.type = query.type;
  if (!query.includeArchived) filter.isArchived = false;

  const categories = await Category.find(filter).sort({ type: 1, name: 1 });

  const counts = await Transaction.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: { user: userId } },
    { $group: { _id: '$category', count: { $sum: 1 } } },
  ]);
  const countByCategory = new Map(counts.map((row) => [row._id?.toString(), row.count]));

  return categories.map((category) =>
    toCategoryDto(category, countByCategory.get(category._id.toString()) ?? 0),
  );
};

const findOwned = async (userId: Types.ObjectId, id: string): Promise<CategoryDocument> => {
  const category = await Category.findOne({ _id: id, user: userId });
  // Scoping by user in the query itself — rather than fetching then comparing —
  // makes it impossible to leak another account's data through a forgotten
  // check. A category belonging to someone else is simply "not found".
  if (!category) throw ApiError.notFound('Category');
  return category;
};

export const createCategory = async (
  userId: Types.ObjectId,
  input: CreateCategoryInput,
): Promise<CategoryDto> => {
  const existing = await Category.findOne({ user: userId, name: input.name }).collation({
    locale: 'en',
    strength: 2,
  });
  if (existing) {
    throw ApiError.conflict(
      `You already have a category named "${existing.name}"`,
      'DUPLICATE_KEY',
    );
  }

  const category = await Category.create({ ...input, user: userId });
  return toCategoryDto(category, 0);
};

export const updateCategory = async (
  userId: Types.ObjectId,
  id: string,
  input: UpdateCategoryInput,
): Promise<CategoryDto> => {
  const category = await findOwned(userId, id);

  if (input.name && input.name.toLowerCase() !== category.name.toLowerCase()) {
    const clash = await Category.findOne({ user: userId, name: input.name })
      .collation({ locale: 'en', strength: 2 })
      .lean();
    if (clash) throw ApiError.conflict(`You already have a category named "${input.name}"`);
  }

  Object.assign(category, input);
  await category.save();
  const transactionCount = await Transaction.countDocuments({
    user: userId,
    category: category._id,
  });
  return toCategoryDto(category, transactionCount);
};

export const setArchived = async (
  userId: Types.ObjectId,
  id: string,
  isArchived: boolean,
): Promise<CategoryDto> => {
  const category = await findOwned(userId, id);
  category.isArchived = isArchived;
  await category.save();
  return toCategoryDto(category);
};

/**
 * Delete a category, deciding what happens to the transactions filed under it.
 *
 * An unused category is removed outright. One that is in use needs an explicit
 * choice from the caller: reassign its transactions to another category, or
 * archive it. Deleting silently would destroy history; refusing outright would
 * leave the user stuck. Requiring the decision is the honest option.
 */
export const deleteCategory = async (
  userId: Types.ObjectId,
  id: string,
  reassignTo?: string,
): Promise<{ deleted: boolean; reassigned: number }> => {
  const category = await findOwned(userId, id);
  const inUse = await Transaction.countDocuments({ user: userId, category: category._id });

  if (inUse === 0) {
    await category.deleteOne();
    return { deleted: true, reassigned: 0 };
  }

  if (!reassignTo) {
    throw new ApiError(
      409,
      `"${category.name}" is used by ${inUse} transaction${inUse === 1 ? '' : 's'}. ` +
        'Choose a category to move them to, or archive this one instead.',
      'CATEGORY_IN_USE',
      { transactionCount: [String(inUse)] },
    );
  }

  const target = await findOwned(userId, reassignTo);
  if (target._id.equals(category._id)) {
    throw ApiError.badRequest('Cannot reassign a category to itself');
  }
  if (target.type !== category.type) {
    // Moving expenses under an income category would invert their sign in every
    // report that groups by category type.
    throw ApiError.badRequest(
      `Cannot move ${category.type} transactions into the ${target.type} category "${target.name}"`,
    );
  }

  const result = await Transaction.updateMany(
    { user: userId, category: category._id },
    { $set: { category: target._id } },
  );
  await category.deleteOne();

  return { deleted: true, reassigned: result.modifiedCount };
};

/** Assert a category exists, belongs to the user, and matches the flow type. */
export const assertUsableCategory = async (
  userId: Types.ObjectId,
  categoryId: string,
  type: 'income' | 'expense',
): Promise<CategoryDocument> => {
  const category = await findOwned(userId, categoryId);
  if (category.type !== type) {
    throw ApiError.badRequest(
      `"${category.name}" is an ${category.type} category and cannot be used for ${type}`,
    );
  }
  return category;
};
