import {
  format,
  formatDistanceToNowStrict,
  isThisYear,
  isToday,
  isYesterday,
  parseISO,
} from 'date-fns';
import { formatMoney, type Currency } from '@savoney/shared';

export { formatMoney };

/**
 * Dates in a ledger are read relative to now. "Yesterday" is instantly
 * meaningful in a way "2026-08-25" is not, and the year is redundant noise for
 * the current year.
 */
export const formatDate = (value: string | Date): string => {
  const date = typeof value === 'string' ? parseISO(value) : value;
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, isThisYear(date) ? 'd MMM' : 'd MMM yyyy');
};

export const formatFullDate = (value: string | Date): string =>
  format(typeof value === 'string' ? parseISO(value) : value, 'EEEE, d MMMM yyyy');

export const formatRelative = (value: string | Date): string =>
  formatDistanceToNowStrict(typeof value === 'string' ? parseISO(value) : value, {
    addSuffix: true,
  });

/** `yyyy-MM-dd`, the only format `<input type="date">` accepts. */
export const toDateInputValue = (value: string | Date): string =>
  format(typeof value === 'string' ? parseISO(value) : value, 'yyyy-MM-dd');

/**
 * A signed amount for a ledger row. The sign is always rendered, so the
 * income/expense distinction never depends on colour alone.
 */
export const formatSigned = (
  amountMinor: number,
  type: 'income' | 'expense',
  currency: Currency,
): string =>
  formatMoney(type === 'expense' ? -amountMinor : amountMinor, currency, { signDisplay: 'always' });

export const formatPercent = (value: number, fractionDigits = 1): string =>
  `${value.toFixed(fractionDigits)}%`;

/** A percentage change with its direction made explicit. */
export const formatDelta = (value: number | null): string =>
  value === null ? 'N/A' : `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;

export const formatCompact = (amountMinor: number, currency: Currency): string =>
  formatMoney(amountMinor, currency, { compact: true });
