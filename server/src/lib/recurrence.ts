import type { RecurrenceFrequency } from '@savoney/shared';

const DAY_MS = 86_400_000;

/**
 * Advance a date by one recurrence step.
 *
 * Month and year steps use calendar arithmetic, not fixed day counts, so a
 * monthly rent charge stays on the same day-of-month across February. Where the
 * target day does not exist (the 31st in a 30-day month) the date is clamped to
 * the month's last day rather than rolling into the next month — a bill due on
 * the 31st should land on the 30th of April, not the 1st of May.
 */
export const advance = (from: Date, frequency: RecurrenceFrequency, interval: number): Date => {
  const next = new Date(from.getTime());

  switch (frequency) {
    case 'daily':
      next.setTime(next.getTime() + interval * DAY_MS);
      return next;
    case 'weekly':
      next.setTime(next.getTime() + interval * 7 * DAY_MS);
      return next;
    case 'monthly':
      return addMonthsClamped(from, interval);
    case 'yearly':
      return addMonthsClamped(from, interval * 12);
    case 'none':
      return next;
  }
};

const addMonthsClamped = (from: Date, months: number): Date => {
  const dayOfMonth = from.getUTCDate();
  const target = new Date(
    Date.UTC(
      from.getUTCFullYear(),
      from.getUTCMonth() + months,
      1,
      from.getUTCHours(),
      from.getUTCMinutes(),
      from.getUTCSeconds(),
      from.getUTCMilliseconds(),
    ),
  );
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(dayOfMonth, lastDay));
  return target;
};

/** Hard ceiling on how many rows one template may produce in a single pass. */
export const MAX_OCCURRENCES_PER_RUN = 60;

/**
 * Every occurrence from `first` (inclusive) up to and including `until`.
 *
 * `first` is inclusive because callers pass the date that is already known to
 * be due. An exclusive start would silently drop that first occurrence and
 * shift the whole series by one interval.
 *
 * Bounded twice over — by `until` and by `MAX_OCCURRENCES_PER_RUN` — so a daily
 * rule left untouched for five years cannot generate 1,800 documents in one
 * request. The remainder is picked up on subsequent passes.
 */
export const occurrencesFrom = (
  first: Date,
  until: Date,
  frequency: RecurrenceFrequency,
  interval: number,
): Date[] => {
  if (frequency === 'none') return [];

  const dates: Date[] = [];
  let cursor = new Date(first.getTime());

  while (cursor <= until && dates.length < MAX_OCCURRENCES_PER_RUN) {
    dates.push(new Date(cursor.getTime()));
    const next = advance(cursor, frequency, interval);
    // Defensive: a zero-length step would spin forever.
    if (next.getTime() <= cursor.getTime()) break;
    cursor = next;
  }

  return dates;
};
