import { Types } from 'mongoose';
import {
  percentDelta,
  type AnalyticsBreakdown,
  type AnalyticsQuery,
  type AnalyticsSummary,
  type CategoryBreakdownEntry,
  type TrendPoint,
  type TrendQuery,
} from '@savoney/shared';
import { daysInRange, previousRange, resolveRange } from '../../lib/date-range.js';
import { Transaction } from '../transactions/transaction.model.js';

const UNCATEGORISED: Pick<CategoryBreakdownEntry, 'name' | 'color' | 'icon'> = {
  name: 'Uncategorised',
  color: '#94a3b8',
  icon: 'receipt',
};

const matchStage = (
  userId: Types.ObjectId,
  from: Date,
  to: Date,
  categoryId?: string,
): Record<string, unknown> => ({
  user: userId,
  occurredAt: { $gte: from, $lte: to },
  ...(categoryId ? { category: new Types.ObjectId(categoryId) } : {}),
});

interface TotalsRow {
  _id: 'income' | 'expense';
  totalMinor: number;
  count: number;
}

/**
 * Totals for a window, computed by the database.
 *
 * The previous implementation loaded every transaction into Node and summed
 * them in JavaScript. That is O(n) documents over the wire and O(n) memory in
 * the API process for a number that Mongo can produce in a single grouped pass
 * — and it broke down entirely once an account had more rows than fit
 * comfortably in memory. `$group` does the arithmetic where the data already
 * lives, and returns two rows regardless of ledger size.
 */
const totalsFor = async (
  userId: Types.ObjectId,
  from: Date,
  to: Date,
  categoryId?: string,
): Promise<{ incomeMinor: number; expenseMinor: number; count: number }> => {
  const rows = await Transaction.aggregate<TotalsRow>([
    { $match: matchStage(userId, from, to, categoryId) },
    { $group: { _id: '$type', totalMinor: { $sum: '$amountMinor' }, count: { $sum: 1 } } },
  ]);

  const income = rows.find((row) => row._id === 'income');
  const expense = rows.find((row) => row._id === 'expense');

  return {
    incomeMinor: income?.totalMinor ?? 0,
    expenseMinor: expense?.totalMinor ?? 0,
    count: (income?.count ?? 0) + (expense?.count ?? 0),
  };
};

interface BreakdownRow {
  _id: Types.ObjectId | null;
  amountMinor: number;
  transactionCount: number;
  category: Array<{ _id: Types.ObjectId; name: string; color: string; icon: string }>;
}

const breakdownFor = async (
  userId: Types.ObjectId,
  from: Date,
  to: Date,
  type: 'income' | 'expense',
  limit?: number,
): Promise<CategoryBreakdownEntry[]> => {
  const rows = await Transaction.aggregate<BreakdownRow>([
    { $match: { ...matchStage(userId, from, to), type } },
    {
      $group: {
        _id: '$category',
        amountMinor: { $sum: '$amountMinor' },
        transactionCount: { $sum: 1 },
      },
    },
    { $sort: { amountMinor: -1 } },
    // Join category metadata after grouping, so the lookup runs once per
    // category rather than once per transaction.
    {
      $lookup: {
        from: 'categories',
        localField: '_id',
        foreignField: '_id',
        as: 'category',
        pipeline: [{ $project: { name: 1, color: 1, icon: 1 } }],
      },
    },
  ]);

  // Percentages are shares of the *whole* range, so the total must be summed
  // before any truncation. Applying `$limit` inside the pipeline would make the
  // top five always add up to 100%, hiding everything they leave out.
  const total = rows.reduce((sum, row) => sum + row.amountMinor, 0);
  const visible = limit ? rows.slice(0, limit) : rows;

  return visible.map((row) => {
    const meta = row.category[0];
    return {
      categoryId: row._id?.toString() ?? null,
      name: meta?.name ?? UNCATEGORISED.name,
      color: meta?.color ?? UNCATEGORISED.color,
      icon: meta?.icon ?? UNCATEGORISED.icon,
      amountMinor: row.amountMinor,
      transactionCount: row.transactionCount,
      percentage: total === 0 ? 0 : (row.amountMinor / total) * 100,
    };
  });
};

interface LargestRow {
  _id: Types.ObjectId;
  title: string;
  amountMinor: number;
  occurredAt: Date;
}

export const getSummary = async (
  userId: Types.ObjectId,
  query: AnalyticsQuery,
): Promise<AnalyticsSummary> => {
  const range = resolveRange(query.preset, query.from, query.to);
  const prior = previousRange(range);

  const [current, previous, topExpenseCategories, largestRows] = await Promise.all([
    totalsFor(userId, range.from, range.to, query.categoryId),
    totalsFor(userId, prior.from, prior.to, query.categoryId),
    breakdownFor(userId, range.from, range.to, 'expense', 5),
    Transaction.aggregate<LargestRow>([
      {
        $match: { ...matchStage(userId, range.from, range.to, query.categoryId), type: 'expense' },
      },
      { $sort: { amountMinor: -1 } },
      { $limit: 1 },
      { $project: { title: 1, amountMinor: 1, occurredAt: 1 } },
    ]),
  ]);

  const netMinor = current.incomeMinor - current.expenseMinor;
  const largest = largestRows[0];

  return {
    range: { from: range.from.toISOString(), to: range.to.toISOString(), preset: range.preset },
    incomeMinor: current.incomeMinor,
    expenseMinor: current.expenseMinor,
    netMinor,
    transactionCount: current.count,
    averageDailySpendMinor: Math.round(current.expenseMinor / daysInRange(range)),
    // Undefined rather than a misleading 0% when there was no income to save from.
    savingsRate: current.incomeMinor === 0 ? null : (netMinor / current.incomeMinor) * 100,
    previous: {
      incomeMinor: previous.incomeMinor,
      expenseMinor: previous.expenseMinor,
      netMinor: previous.incomeMinor - previous.expenseMinor,
    },
    deltas: {
      income: percentDelta(current.incomeMinor, previous.incomeMinor),
      expense: percentDelta(current.expenseMinor, previous.expenseMinor),
      net: percentDelta(netMinor, previous.incomeMinor - previous.expenseMinor),
    },
    topExpenseCategories,
    largestExpense: largest
      ? {
          id: largest._id.toString(),
          title: largest.title,
          amountMinor: largest.amountMinor,
          occurredAt: largest.occurredAt.toISOString(),
        }
      : null,
  };
};

export const getBreakdown = async (
  userId: Types.ObjectId,
  query: AnalyticsQuery,
): Promise<AnalyticsBreakdown> => {
  const range = resolveRange(query.preset, query.from, query.to);
  const [income, expense] = await Promise.all([
    breakdownFor(userId, range.from, range.to, 'income'),
    breakdownFor(userId, range.from, range.to, 'expense'),
  ]);
  return { income, expense };
};

interface TrendRow {
  _id: { bucket: Date; type: 'income' | 'expense' };
  totalMinor: number;
}

/**
 * Income/expense per time bucket, with empty buckets filled in.
 *
 * `$dateTrunc` does the bucketing inside Mongo, which keeps the pipeline
 * index-friendly and avoids shipping raw rows to Node. Gaps are then filled
 * client-side of the database: a chart that skips days with no spending draws a
 * misleading slope between the points that remain.
 */
export const getTrend = async (
  userId: Types.ObjectId,
  query: TrendQuery,
): Promise<TrendPoint[]> => {
  const range = resolveRange(query.preset, query.from, query.to);

  const rows = await Transaction.aggregate<TrendRow>([
    { $match: matchStage(userId, range.from, range.to, query.categoryId) },
    {
      $group: {
        _id: {
          bucket: {
            $dateTrunc: { date: '$occurredAt', unit: query.granularity, startOfWeek: 'monday' },
          },
          type: '$type',
        },
        totalMinor: { $sum: '$amountMinor' },
      },
    },
    { $sort: { '_id.bucket': 1 } },
  ]);

  const byBucket = new Map<string, { incomeMinor: number; expenseMinor: number }>();
  for (const row of rows) {
    const key = row._id.bucket.toISOString().slice(0, 10);
    const entry = byBucket.get(key) ?? { incomeMinor: 0, expenseMinor: 0 };
    if (row._id.type === 'income') entry.incomeMinor += row.totalMinor;
    else entry.expenseMinor += row.totalMinor;
    byBucket.set(key, entry);
  }

  return fillBuckets(range.from, range.to, query.granularity, byBucket);
};

const fillBuckets = (
  from: Date,
  to: Date,
  granularity: 'day' | 'week' | 'month',
  data: Map<string, { incomeMinor: number; expenseMinor: number }>,
): TrendPoint[] => {
  const points: TrendPoint[] = [];
  const cursor = truncate(from, granularity);
  // Bound the loop: an all-time range on a decade-old account should not
  // produce thousands of daily points for a chart a few hundred pixels wide.
  const MAX_POINTS = 400;

  while (cursor <= to && points.length < MAX_POINTS) {
    const key = cursor.toISOString().slice(0, 10);
    const entry = data.get(key) ?? { incomeMinor: 0, expenseMinor: 0 };
    points.push({
      date: key,
      incomeMinor: entry.incomeMinor,
      expenseMinor: entry.expenseMinor,
      netMinor: entry.incomeMinor - entry.expenseMinor,
    });

    if (granularity === 'day') cursor.setUTCDate(cursor.getUTCDate() + 1);
    else if (granularity === 'week') cursor.setUTCDate(cursor.getUTCDate() + 7);
    else cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return points;
};

/** Snap a date to its bucket start, matching `$dateTrunc`'s Monday week start. */
const truncate = (date: Date, granularity: 'day' | 'week' | 'month'): Date => {
  const copy = new Date(date.getTime());
  copy.setUTCHours(0, 0, 0, 0);

  if (granularity === 'month') {
    copy.setUTCDate(1);
  } else if (granularity === 'week') {
    // getUTCDay(): 0 = Sunday, so Sunday is 6 days after the preceding Monday.
    const offset = (copy.getUTCDay() + 6) % 7;
    copy.setUTCDate(copy.getUTCDate() - offset);
  }

  return copy;
};
