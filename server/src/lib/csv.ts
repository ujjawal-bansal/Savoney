import { toMinor, type Currency } from '@savoney/shared';

/**
 * Quote a CSV field.
 *
 * The leading apostrophe on `=`, `+`, `-` and `@` defuses CSV injection: a cell
 * beginning with one of those is executed as a formula when the file is opened
 * in Excel or Sheets, so an attacker-chosen transaction title could otherwise
 * run code on whoever exports their data.
 */
const escapeField = (value: unknown): string => {
  const raw = value === null || value === undefined ? '' : String(value);
  const guarded = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${guarded.replace(/"/g, '""')}"`;
};

export const toCsv = (rows: Array<Record<string, unknown>>, columns: string[]): string => {
  const header = columns.map(escapeField).join(',');
  const body = rows.map((row) => columns.map((column) => escapeField(row[column])).join(','));
  // CRLF per RFC 4180 — Excel on Windows mis-renders bare LF.
  return [header, ...body].join('\r\n');
};

/**
 * A minimal RFC 4180 parser.
 *
 * Written by hand rather than pulled from a dependency because the format is
 * small and the failure modes matter: a naive `split(',')` corrupts every row
 * containing a quoted comma, which for transaction titles is common.
 */
export const parseCsv = (input: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  // Strip a UTF-8 BOM, which Excel prepends and which would otherwise become
  // part of the first header name. Written as an escape rather than a literal
  // so the character stays visible in source and survives re-encoding.
  const text = input.replace(/^\uFEFF/, '');

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\r') {
      // Swallow; the \n that follows ends the record.
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  // Flush a trailing record with no terminating newline.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
};

export interface ParsedCsvRow {
  line: number;
  title: string;
  amountMinor: number;
  type: 'income' | 'expense';
  category: string;
  occurredAt: Date;
  notes: string;
}

export interface CsvParseResult {
  rows: ParsedCsvRow[];
  errors: Array<{ line: number; message: string }>;
}

const REQUIRED_COLUMNS = ['date', 'title', 'amount', 'type', 'category'] as const;

/**
 * Parse an uploaded ledger into candidate transactions.
 *
 * Bad rows are collected rather than thrown: importing 500 transactions should
 * not fail wholesale because row 314 has a malformed date. The caller decides
 * whether to commit the good rows and report the rest.
 */
export const parseTransactionCsv = (input: string, currency: Currency): CsvParseResult => {
  const records = parseCsv(input);
  const errors: CsvParseResult['errors'] = [];
  const rows: ParsedCsvRow[] = [];

  if (records.length === 0) {
    return { rows, errors: [{ line: 0, message: 'The file is empty' }] };
  }

  const header = records[0]!.map((cell) => cell.trim().toLowerCase());
  const missing = REQUIRED_COLUMNS.filter((column) => !header.includes(column));
  if (missing.length > 0) {
    return {
      rows,
      errors: [
        {
          line: 1,
          message: `Missing required column${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}. Expected header: ${REQUIRED_COLUMNS.join(', ')}`,
        },
      ],
    };
  }

  const indexOf = (column: string) => header.indexOf(column);
  const columns = {
    date: indexOf('date'),
    title: indexOf('title'),
    amount: indexOf('amount'),
    type: indexOf('type'),
    category: indexOf('category'),
    notes: indexOf('notes'),
  };

  for (let i = 1; i < records.length; i += 1) {
    const record = records[i]!;
    const line = i + 1;
    const cell = (index: number) => (index >= 0 ? (record[index] ?? '').trim() : '');

    const title = cell(columns.title);
    const rawAmount = cell(columns.amount).replace(/[^0-9.-]/g, '');
    const rawType = cell(columns.type).toLowerCase();
    const category = cell(columns.category);
    const rawDate = cell(columns.date);

    if (!title || title.length < 2) {
      errors.push({ line, message: 'Title is required and must be at least 2 characters' });
      continue;
    }
    if (rawType !== 'income' && rawType !== 'expense') {
      errors.push({
        line,
        message: `Type must be "income" or "expense", got "${cell(columns.type)}"`,
      });
      continue;
    }
    if (!category) {
      errors.push({ line, message: 'Category is required' });
      continue;
    }

    const occurredAt = new Date(rawDate);
    if (Number.isNaN(occurredAt.getTime())) {
      errors.push({ line, message: `Could not read "${rawDate}" as a date` });
      continue;
    }

    let amountMinor: number;
    try {
      amountMinor = Math.abs(toMinor(rawAmount, currency));
    } catch {
      errors.push({ line, message: `Could not read "${cell(columns.amount)}" as an amount` });
      continue;
    }
    if (amountMinor <= 0) {
      errors.push({ line, message: 'Amount must be greater than zero' });
      continue;
    }

    rows.push({
      line,
      title: title.slice(0, 120),
      amountMinor,
      type: rawType,
      category,
      occurredAt,
      notes: cell(columns.notes).slice(0, 500),
    });
  }

  return { rows, errors };
};
