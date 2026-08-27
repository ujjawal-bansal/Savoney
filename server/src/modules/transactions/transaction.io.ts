import { type Types } from 'mongoose';
import { formatMoney, toMinor, type Currency } from '@savoney/shared';
import { parseTransactionCsv, toCsv } from '../../lib/csv.js';
import { Category } from '../categories/category.model.js';
import { Transaction } from './transaction.model.js';

const EXPORT_COLUMNS = ['date', 'title', 'amount', 'type', 'category', 'notes', 'tags'];

/**
 * Export a user's ledger as CSV.
 *
 * Amounts are written in major units with a plain decimal point — the file is
 * meant to open cleanly in a spreadsheet and to round-trip back through the
 * importer, so no currency symbols or thousands separators.
 */
export const exportTransactionsCsv = async (
  userId: Types.ObjectId,
  currency: Currency,
): Promise<string> => {
  const transactions = await Transaction.find({ user: userId })
    .sort({ occurredAt: -1 })
    .populate('category', 'name')
    .lean();

  const rows = transactions.map((transaction) => {
    const category = transaction.category as unknown as { name?: string } | null;
    return {
      date: transaction.occurredAt.toISOString().slice(0, 10),
      title: transaction.title,
      amount: formatMoney(transaction.amountMinor, currency, { signDisplay: 'never' })
        .replace(/[^\d.,-]/g, '')
        .replace(/,/g, ''),
      type: transaction.type,
      category: category?.name ?? 'Uncategorised',
      notes: transaction.notes,
      tags: transaction.tags.join(' '),
    };
  });

  return toCsv(rows, EXPORT_COLUMNS);
};

export interface ImportSummary {
  imported: number;
  skipped: number;
  categoriesCreated: string[];
  errors: Array<{ line: number; message: string }>;
}

/**
 * Import transactions from CSV.
 *
 * Categories referenced by name are matched case-insensitively and created on
 * demand — requiring the user to pre-create every category before importing a
 * year of history would make the feature unusable. Rows that fail validation
 * are reported by line number and skipped, so a partial import still succeeds.
 */
export const importTransactionsCsv = async (
  userId: Types.ObjectId,
  csv: string,
  currency: Currency,
): Promise<ImportSummary> => {
  const { rows, errors } = parseTransactionCsv(csv, currency);

  if (rows.length === 0) {
    return { imported: 0, skipped: errors.length, categoriesCreated: [], errors };
  }

  const existing = await Category.find({ user: userId }).lean();
  const byName = new Map(existing.map((category) => [category.name.toLowerCase(), category]));

  const categoriesCreated: string[] = [];

  // Create any missing categories up front, so the insert below is a single
  // batch rather than interleaved reads and writes.
  const needed = new Map<string, 'income' | 'expense'>();
  for (const row of rows) {
    const key = row.category.toLowerCase();
    if (!byName.has(key) && !needed.has(key)) needed.set(key, row.type);
  }

  for (const [key, type] of needed) {
    const name = rows.find((row) => row.category.toLowerCase() === key)!.category.slice(0, 40);
    try {
      const created = await Category.create({
        user: userId,
        name,
        type,
        color: type === 'income' ? '#16a34a' : '#6366f1',
        icon: 'receipt',
      });
      byName.set(key, created.toObject());
      categoriesCreated.push(created.name);
    } catch {
      // A concurrent import may have created it; re-read rather than fail.
      const found = await Category.findOne({ user: userId, name })
        .collation({ locale: 'en', strength: 2 })
        .lean();
      if (found) byName.set(key, found);
    }
  }

  const documents: Record<string, unknown>[] = [];
  for (const row of rows) {
    const category = byName.get(row.category.toLowerCase());
    if (!category) {
      errors.push({ line: row.line, message: `Could not resolve category "${row.category}"` });
      continue;
    }
    if (category.type !== row.type) {
      errors.push({
        line: row.line,
        message: `Category "${category.name}" is an ${category.type} category but the row is ${row.type}`,
      });
      continue;
    }

    documents.push({
      user: userId,
      title: row.title,
      amountMinor: row.amountMinor,
      type: row.type,
      category: category._id,
      occurredAt: row.occurredAt,
      notes: row.notes,
      tags: [],
      recurrence: null,
    });
  }

  // `ordered: false` makes Mongoose skip failing documents instead of throwing,
  // so the count of what was actually written is the only trustworthy figure —
  // reporting `documents.length` would tell the user we imported rows we did not.
  let imported = 0;
  if (documents.length > 0) {
    const inserted = await Transaction.insertMany(documents, { ordered: false });
    imported = inserted.length;

    if (imported !== documents.length) {
      errors.push({
        line: 0,
        message: `${documents.length - imported} row${documents.length - imported === 1 ? '' : 's'} could not be saved`,
      });
    }
  }

  return {
    imported,
    skipped: errors.length,
    categoriesCreated,
    errors,
  };
};

/** Re-exported so the import route can validate an amount without reaching into shared. */
export { toMinor };
