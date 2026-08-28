import { Types } from 'mongoose';
import {
  budgetStatusOf,
  type BudgetPeriod,
  type BudgetWithProgress,
  type CreateBudgetInput,
  type UpdateBudgetInput,
} from '@savoney/shared';
import { ApiError } from '../../lib/api-error.js';
import { assertUsableCategory } from '../categories/category.service.js';
import { Transaction } from '../transactions/transaction.model.js';
import { Budget, type BudgetDocument } from './budget.model.js';

/**
 * The current window for a budget period, in UTC.
 *
 * Budgets reset on calendar boundaries rather than rolling from their creation
 * date: a "monthly grocery budget" means this calendar month, which is how
 * people actually reason about their spending.
 */
export const currentPeriod = (
  period: BudgetPeriod,
  now = new Date(),
): { start: Date; end: Date } => {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();

  switch (period) {
    case 'weekly': {
      // ISO weeks start Monday; getUTCDay() is Sunday-based.
      const offset = (now.getUTCDay() + 6) % 7;
      const start = new Date(Date.UTC(year, month, now.getUTCDate() - offset));
      const end = new Date(start.getTime());
      end.setUTCDate(end.getUTCDate() + 7);
      end.setUTCMilliseconds(-1);
      return { start, end };
    }
    case 'monthly':
      return {
        start: new Date(Date.UTC(year, month, 1)),
        end: new Date(Date.UTC(year, month + 1, 1) - 1),
      };
    case 'quarterly': {
      const quarterStart = Math.floor(month / 3) * 3;
      return {
        start: new Date(Date.UTC(year, quarterStart, 1)),
        end: new Date(Date.UTC(year, quarterStart + 3, 1) - 1),
      };
    }
    case 'yearly':
      return { start: new Date(Date.UTC(year, 0, 1)), end: new Date(Date.UTC(year + 1, 0, 1) - 1) };
  }
};

interface SpendRow {
  _id: { category: Types.ObjectId; period: string };
  spentMinor: number;
}

/**
 * Attach live spend to each budget.
 *
 * Spend is computed at read time instead of being denormalised onto the budget
 * document. A stored counter has to be updated on every transaction create,
 * edit, delete, category move, and date change — miss one path and the number
 * silently drifts wrong forever, which for a budget is worse than useless.
 * Recomputing is one indexed aggregation and is always correct.
 */
const withProgress = async (
  userId: Types.ObjectId,
  budgets: BudgetDocument[],
  now = new Date(),
): Promise<BudgetWithProgress[]> => {
  if (budgets.length === 0) return [];

  // Capture the category ids *before* populating: populate replaces the
  // ObjectId on each document with the full category, which would then never
  // match the `$in` below.
  const categoryIdByBudget = new Map(
    budgets.map((budget) => [budget._id.toString(), budget.category as Types.ObjectId]),
  );

  await Budget.populate(budgets, { path: 'category', select: 'name color icon type' });

  // Distinct periods in play, so we issue one aggregation per period rather
  // than one per budget.
  const periods = [...new Set(budgets.map((b) => b.period as BudgetPeriod))];

  const spendByKey = new Map<string, number>();
  await Promise.all(
    periods.map(async (period) => {
      const { start, end } = currentPeriod(period, now);
      const categoryIds = budgets
        .filter((budget) => budget.period === period)
        .map((budget) => categoryIdByBudget.get(budget._id.toString()))
        .filter((id): id is Types.ObjectId => Boolean(id));

      const rows = await Transaction.aggregate<SpendRow>([
        {
          $match: {
            user: userId,
            type: 'expense',
            occurredAt: { $gte: start, $lte: end },
            category: { $in: categoryIds },
          },
        },
        { $group: { _id: '$category', spentMinor: { $sum: '$amountMinor' } } },
      ]);
      for (const row of rows) {
        spendByKey.set(`${period}:${String(row._id)}`, row.spentMinor);
      }
    }),
  );

  return budgets.map((budget) => {
    const period = budget.period as BudgetPeriod;
    const { start, end } = currentPeriod(period, now);
    const categoryId = categoryIdByBudget.get(budget._id.toString());
    const spentMinor = spendByKey.get(`${period}:${categoryId?.toString() ?? ''}`) ?? 0;
    const remainingMinor = budget.amountMinor - spentMinor;

    const totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86_400_000));
    const elapsedDays = Math.max(
      1,
      Math.min(totalDays, Math.ceil((now.getTime() - start.getTime()) / 86_400_000)),
    );
    const daysRemaining = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 86_400_000));

    const category = budget.category as unknown as {
      _id: Types.ObjectId;
      name: string;
      color: string;
      icon: string;
    } | null;

    return {
      id: budget._id.toString(),
      name: budget.name,
      amountMinor: budget.amountMinor,
      category: category
        ? {
            id: category._id.toString(),
            name: category.name,
            color: category.color,
            icon: category.icon,
          }
        : null,
      period,
      alertThreshold: budget.alertThreshold,
      spentMinor,
      remainingMinor,
      percentUsed: budget.amountMinor === 0 ? 0 : (spentMinor / budget.amountMinor) * 100,
      status: budgetStatusOf(spentMinor, budget.amountMinor, budget.alertThreshold),
      periodStart: start.toISOString(),
      periodEnd: end.toISOString(),
      daysRemaining,
      // What is left, spread evenly over the days that remain. Zero once
      // overspent — there is no safe daily amount at that point.
      safeDailySpendMinor:
        remainingMinor <= 0 ? 0 : Math.floor(remainingMinor / Math.max(1, daysRemaining)),
      // Straight-line extrapolation of the burn rate so far.
      projectedSpendMinor: Math.round((spentMinor / elapsedDays) * totalDays),
      createdAt: (budget.get('createdAt') as Date).toISOString(),
      updatedAt: (budget.get('updatedAt') as Date).toISOString(),
    };
  });
};

export const listBudgets = async (userId: Types.ObjectId): Promise<BudgetWithProgress[]> => {
  const budgets = await Budget.find({ user: userId }).sort({ createdAt: -1 });
  return withProgress(userId, budgets);
};

export const createBudget = async (
  userId: Types.ObjectId,
  input: CreateBudgetInput,
): Promise<BudgetWithProgress> => {
  // Budgets cap spending, so they only make sense over expense categories.
  await assertUsableCategory(userId, input.categoryId, 'expense');

  const existing = await Budget.findOne({
    user: userId,
    category: new Types.ObjectId(input.categoryId),
    period: input.period,
  });
  if (existing) {
    throw ApiError.conflict(
      `A ${input.period} budget already exists for that category`,
      'BUDGET_EXISTS',
    );
  }

  const budget = await Budget.create({
    user: userId,
    name: input.name,
    amountMinor: input.amountMinor,
    category: new Types.ObjectId(input.categoryId),
    period: input.period,
    alertThreshold: input.alertThreshold,
  });

  const [result] = await withProgress(userId, [budget]);
  return result!;
};

export const updateBudget = async (
  userId: Types.ObjectId,
  id: string,
  input: UpdateBudgetInput,
): Promise<BudgetWithProgress> => {
  const budget = await Budget.findOne({ _id: id, user: userId });
  if (!budget) throw ApiError.notFound('Budget');

  if (input.categoryId) {
    await assertUsableCategory(userId, input.categoryId, 'expense');
    budget.category = new Types.ObjectId(input.categoryId);
  }
  if (input.name !== undefined) budget.name = input.name;
  if (input.amountMinor !== undefined) budget.amountMinor = input.amountMinor;
  if (input.period !== undefined) budget.period = input.period;
  if (input.alertThreshold !== undefined) budget.alertThreshold = input.alertThreshold;

  await budget.save();
  const [result] = await withProgress(userId, [budget]);
  return result!;
};

export const deleteBudget = async (userId: Types.ObjectId, id: string): Promise<void> => {
  const result = await Budget.deleteOne({ _id: id, user: userId });
  if (result.deletedCount === 0) throw ApiError.notFound('Budget');
};
