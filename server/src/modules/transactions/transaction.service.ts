import { Types } from 'mongoose';
import type {
  CreateTransactionInput,
  Paginated,
  Transaction as TransactionDto,
  TransactionQuery,
  UpdateTransactionInput,
} from '@savoney/shared';
import { logger } from '../../config/logger.js';
import { ApiError } from '../../lib/api-error.js';
import { ops } from '../../lib/mongo.js';
import { escapeRegex, paginate, skipFor } from '../../lib/pagination.js';
import { advance, occurrencesFrom } from '../../lib/recurrence.js';
import { assertUsableCategory } from '../categories/category.service.js';
import { Transaction, toTransactionDto, type TransactionDocument } from './transaction.model.js';

const CATEGORY_FIELDS = 'name color icon type';

/** Translate a validated query into a Mongo filter document. */
const buildFilter = (userId: Types.ObjectId, query: TransactionQuery): Record<string, unknown> => {
  const filter: Record<string, unknown> = { user: userId };

  if (query.type) filter.type = query.type;
  if (query.categoryId) filter.category = new Types.ObjectId(query.categoryId);
  if (query.tag) filter.tags = query.tag;

  if (query.from || query.to) {
    const range: Record<string, Date> = {};
    if (query.from) range.$gte = query.from;
    // The `to` bound is inclusive of the whole day: a user filtering "to the
    // 5th" means through the end of the 5th, not midnight at its start.
    if (query.to) range.$lte = endOfDay(query.to);
    filter.occurredAt = ops(range);
  }

  if (query.minAmountMinor !== undefined || query.maxAmountMinor !== undefined) {
    const range: Record<string, number> = {};
    if (query.minAmountMinor !== undefined) range.$gte = query.minAmountMinor;
    if (query.maxAmountMinor !== undefined) range.$lte = query.maxAmountMinor;
    filter.amountMinor = ops(range);
  }

  if (query.search) {
    /**
     * A case-insensitive regex rather than a `$text` index, because search here
     * is a type-ahead: users expect "groc" to match "Groceries", and `$text`
     * matches whole tokens only, so it would return nothing until the word is
     * complete. The scan this implies is bounded — `user` is indexed, so it
     * only ever covers one account's documents — and the pattern is escaped
     * against ReDoS.
     */
    const pattern = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [{ title: pattern }, { notes: pattern }, { tags: pattern }];
  }

  return filter;
};

const endOfDay = (date: Date): Date => {
  const copy = new Date(date.getTime());
  copy.setUTCHours(23, 59, 59, 999);
  return copy;
};

export const listTransactions = async (
  userId: Types.ObjectId,
  query: TransactionQuery,
): Promise<Paginated<TransactionDto>> => {
  const filter = buildFilter(userId, query);
  const direction = query.order === 'asc' ? 1 : -1;

  // `_id` breaks ties so pagination is stable: without it, two rows with the
  // same date can swap places between page 1 and page 2 and a record is either
  // shown twice or skipped entirely.
  const sort: Record<string, 1 | -1> = { [query.sort]: direction, _id: direction };

  const [items, total] = await Promise.all([
    Transaction.find(filter)
      .sort(sort)
      .skip(skipFor(query.page, query.limit))
      .limit(query.limit)
      .populate('category', CATEGORY_FIELDS),
    Transaction.countDocuments(filter),
  ]);

  return paginate(items.map(toTransactionDto), query.page, query.limit, total);
};

const findOwned = async (userId: Types.ObjectId, id: string): Promise<TransactionDocument> => {
  const transaction = await Transaction.findOne({ _id: id, user: userId }).populate(
    'category',
    CATEGORY_FIELDS,
  );
  if (!transaction) throw ApiError.notFound('Transaction');
  return transaction;
};

export const getTransaction = async (userId: Types.ObjectId, id: string): Promise<TransactionDto> =>
  toTransactionDto(await findOwned(userId, id));

export const createTransaction = async (
  userId: Types.ObjectId,
  input: CreateTransactionInput,
): Promise<TransactionDto> => {
  await assertUsableCategory(userId, input.categoryId, input.type);

  const recurring = input.recurrence && input.recurrence.frequency !== 'none';

  const transaction = await Transaction.create({
    user: userId,
    title: input.title,
    amountMinor: input.amountMinor,
    type: input.type,
    category: new Types.ObjectId(input.categoryId),
    occurredAt: input.occurredAt,
    notes: input.notes,
    tags: normaliseTags(input.tags),
    recurrence: recurring
      ? {
          frequency: input.recurrence!.frequency,
          interval: input.recurrence!.interval,
          until: input.recurrence!.until ?? null,
          nextOccurrenceAt: advance(
            input.occurredAt,
            input.recurrence!.frequency,
            input.recurrence!.interval,
          ),
        }
      : null,
  });

  await transaction.populate('category', CATEGORY_FIELDS);
  return toTransactionDto(transaction);
};

export const updateTransaction = async (
  userId: Types.ObjectId,
  id: string,
  input: UpdateTransactionInput,
): Promise<TransactionDto> => {
  const transaction = await findOwned(userId, id);

  // The category must be checked against the *resulting* type, which may itself
  // be changing in this same request.
  const nextType = input.type ?? (transaction.type as 'income' | 'expense');
  if (input.categoryId) {
    await assertUsableCategory(userId, input.categoryId, nextType);
    transaction.category = new Types.ObjectId(input.categoryId);
  } else if (input.type && input.type !== transaction.type) {
    await assertUsableCategory(userId, transaction.category.toString(), nextType);
  }

  if (input.title !== undefined) transaction.title = input.title;
  if (input.amountMinor !== undefined) transaction.amountMinor = input.amountMinor;
  if (input.type !== undefined) transaction.type = input.type;
  if (input.occurredAt !== undefined) transaction.occurredAt = input.occurredAt;
  if (input.notes !== undefined) transaction.notes = input.notes;
  if (input.tags !== undefined) transaction.tags = normaliseTags(input.tags);

  if (input.recurrence !== undefined) {
    transaction.recurrence =
      input.recurrence.frequency === 'none'
        ? null
        : {
            frequency: input.recurrence.frequency,
            interval: input.recurrence.interval,
            until: input.recurrence.until ?? null,
            nextOccurrenceAt: advance(
              transaction.occurredAt,
              input.recurrence.frequency,
              input.recurrence.interval,
            ),
          };
  }

  await transaction.save();
  await transaction.populate('category', CATEGORY_FIELDS);
  return toTransactionDto(transaction);
};

export const deleteTransaction = async (userId: Types.ObjectId, id: string): Promise<void> => {
  const result = await Transaction.deleteOne({ _id: id, user: userId });
  if (result.deletedCount === 0) throw ApiError.notFound('Transaction');
};

export const bulkDeleteTransactions = async (
  userId: Types.ObjectId,
  ids: string[],
): Promise<number> => {
  const result = await Transaction.deleteMany({ _id: ops({ $in: ids }), user: userId });
  return result.deletedCount;
};

/** Trim, drop blanks, lowercase, and de-duplicate so `#Food` and `food` are one tag. */
const normaliseTags = (tags: string[]): string[] => [
  ...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean)),
];

/**
 * Materialise any recurring transactions that have come due.
 *
 * Run lazily whenever a user reads their transactions, rather than from a cron
 * job. For a single-tenant read this is one indexed query that usually matches
 * nothing, and it means the deployment has no background scheduler to operate,
 * monitor, or keep in sync across replicas. The trade-off is that occurrences
 * appear on next visit rather than at midnight — acceptable for a ledger the
 * user is reading anyway.
 */
export const materialiseDueRecurrences = async (userId: Types.ObjectId): Promise<number> => {
  const now = new Date();

  const templates = await Transaction.find({
    user: userId,
    'recurrence.nextOccurrenceAt': ops({ $ne: null, $lte: now }),
  }).limit(50);

  if (templates.length === 0) return 0;

  const created: Record<string, unknown>[] = [];
  const updates: Array<{ id: Types.ObjectId; next: Date | null }> = [];

  for (const template of templates) {
    const rule = template.recurrence;
    if (!rule || rule.frequency === 'none' || !rule.nextOccurrenceAt) continue;

    // Never generate past a user-specified end date.
    const horizon = rule.until && rule.until < now ? rule.until : now;
    // `nextOccurrenceAt` is itself due, so generation starts there.
    const dates = occurrencesFrom(rule.nextOccurrenceAt, horizon, rule.frequency, rule.interval);

    for (const date of dates) {
      created.push({
        user: userId,
        title: template.title,
        amountMinor: template.amountMinor,
        type: template.type,
        category: template.category,
        occurredAt: date,
        notes: template.notes,
        tags: template.tags,
        recurrence: null,
        generatedFrom: template._id,
      });
    }

    const lastGenerated = dates.at(-1) ?? rule.nextOccurrenceAt;
    const next = advance(lastGenerated, rule.frequency, rule.interval);
    updates.push({
      id: template._id,
      next: rule.until && next > rule.until ? null : next,
    });
  }

  let insertedCount = 0;
  if (created.length > 0) {
    // Unordered inserts drop failures silently, so count what landed rather
    // than what was attempted.
    const inserted = await Transaction.insertMany(created, { ordered: false });
    insertedCount = inserted.length;
    if (insertedCount !== created.length) {
      logger.warn(
        { userId: userId.toString(), attempted: created.length, inserted: insertedCount },
        'some recurring occurrences could not be materialised',
      );
    }
  }

  await Promise.all(
    updates.map(({ id, next }) =>
      Transaction.updateOne({ _id: id }, { $set: { 'recurrence.nextOccurrenceAt': next } }),
    ),
  );

  return insertedCount;
};
