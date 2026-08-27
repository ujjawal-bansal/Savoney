import type { AnalyticsPreset } from '@savoney/shared';

export interface ResolvedRange {
  from: Date;
  to: Date;
  preset: AnalyticsPreset;
}

const startOfDay = (date: Date): Date => {
  const copy = new Date(date.getTime());
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
};

const endOfDay = (date: Date): Date => {
  const copy = new Date(date.getTime());
  copy.setUTCHours(23, 59, 59, 999);
  return copy;
};

const daysAgo = (days: number, from: Date): Date => {
  const copy = new Date(from.getTime());
  copy.setUTCDate(copy.getUTCDate() - days);
  return startOfDay(copy);
};

/**
 * Turn a preset into concrete bounds.
 *
 * Everything is computed in UTC and snapped to day boundaries so a range is
 * reproducible regardless of where the server runs — a report should not change
 * because a container moved between regions.
 */
export const resolveRange = (
  preset: AnalyticsPreset,
  from?: Date,
  to?: Date,
  now: Date = new Date(),
): ResolvedRange => {
  const today = endOfDay(now);

  switch (preset) {
    case 'last_7_days':
      // Inclusive of today, so "last 7 days" spans 7 calendar days, not 8.
      return { from: daysAgo(6, now), to: today, preset };
    case 'last_30_days':
      return { from: daysAgo(29, now), to: today, preset };
    case 'last_90_days':
      return { from: daysAgo(89, now), to: today, preset };
    case 'this_month':
      return {
        from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
        to: today,
        preset,
      };
    case 'last_month': {
      const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
      // Day 0 of the current month is the last day of the previous one.
      const last = endOfDay(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)));
      return { from: first, to: last, preset };
    }
    case 'this_year':
      return { from: new Date(Date.UTC(now.getUTCFullYear(), 0, 1)), to: today, preset };
    case 'all_time':
      return { from: new Date(0), to: today, preset };
    case 'custom':
      // The schema guarantees both bounds are present under `custom`.
      return { from: startOfDay(from!), to: endOfDay(to!), preset };
  }
};

/**
 * The window of equal length immediately preceding `range`, used for
 * period-over-period deltas. A 30-day range compares against the 30 days before
 * it, so "spending is up 12%" always means against a like-for-like window.
 */
export const previousRange = (range: ResolvedRange): { from: Date; to: Date } => {
  const span = range.to.getTime() - range.from.getTime();
  return {
    from: new Date(range.from.getTime() - span - 1),
    to: new Date(range.from.getTime() - 1),
  };
};

/** Whole days covered by the range, minimum 1, so it is always safe as a divisor. */
export const daysInRange = (range: { from: Date; to: Date }): number =>
  Math.max(1, Math.ceil((range.to.getTime() - range.from.getTime()) / 86_400_000));
