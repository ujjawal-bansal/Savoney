import { describe, expect, it } from 'vitest';
import { MAX_OCCURRENCES_PER_RUN, advance, occurrencesFrom } from '../../src/lib/recurrence.js';

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const iso = (date: Date) => date.toISOString().slice(0, 10);

describe('advance', () => {
  it('steps daily and weekly by fixed spans', () => {
    expect(iso(advance(utc(2026, 3, 1), 'daily', 1))).toBe('2026-03-02');
    expect(iso(advance(utc(2026, 3, 1), 'daily', 10))).toBe('2026-03-11');
    expect(iso(advance(utc(2026, 3, 1), 'weekly', 2))).toBe('2026-03-15');
  });

  it('steps monthly by calendar month, not 30 days', () => {
    expect(iso(advance(utc(2026, 1, 15), 'monthly', 1))).toBe('2026-02-15');
    expect(iso(advance(utc(2026, 1, 15), 'monthly', 3))).toBe('2026-04-15');
  });

  it('clamps to the last day of a shorter month', () => {
    // A bill due on the 31st should land on the 28th in February, not roll
    // forward into March.
    expect(iso(advance(utc(2026, 1, 31), 'monthly', 1))).toBe('2026-02-28');
    expect(iso(advance(utc(2026, 3, 31), 'monthly', 1))).toBe('2026-04-30');
  });

  it('handles a leap year', () => {
    // 2028 is a leap year, so the 29th exists.
    expect(iso(advance(utc(2028, 1, 31), 'monthly', 1))).toBe('2028-02-29');
    expect(iso(advance(utc(2028, 2, 29), 'yearly', 1))).toBe('2029-02-28');
  });

  it('steps yearly', () => {
    expect(iso(advance(utc(2026, 6, 10), 'yearly', 1))).toBe('2027-06-10');
  });

  it('does not move a non-recurring date', () => {
    expect(iso(advance(utc(2026, 3, 1), 'none', 1))).toBe('2026-03-01');
  });
});

describe('occurrencesFrom', () => {
  it('includes the start date, which is the occurrence already known to be due', () => {
    // An exclusive start would drop this first occurrence and shift the whole
    // series forward by one interval.
    const dates = occurrencesFrom(utc(2026, 3, 1), utc(2026, 3, 4), 'daily', 1);
    expect(dates.map(iso)).toEqual(['2026-03-01', '2026-03-02', '2026-03-03', '2026-03-04']);
  });

  it('honours the interval', () => {
    const dates = occurrencesFrom(utc(2026, 3, 1), utc(2026, 3, 10), 'daily', 3);
    expect(dates.map(iso)).toEqual(['2026-03-01', '2026-03-04', '2026-03-07', '2026-03-10']);
  });

  it('returns nothing when the bound precedes the first occurrence', () => {
    expect(occurrencesFrom(utc(2026, 3, 5), utc(2026, 3, 1), 'monthly', 1)).toEqual([]);
  });

  it('returns a single date when the window covers only the first occurrence', () => {
    expect(occurrencesFrom(utc(2026, 3, 1), utc(2026, 3, 1), 'monthly', 1).map(iso)).toEqual([
      '2026-03-01',
    ]);
  });

  it('returns nothing for a non-recurring rule', () => {
    expect(occurrencesFrom(utc(2020, 1, 1), utc(2026, 1, 1), 'none', 1)).toEqual([]);
  });

  it('caps output so a long-dormant rule cannot flood the database', () => {
    // Five years of daily occurrences would be ~1,800 documents in one request.
    const dates = occurrencesFrom(utc(2020, 1, 1), utc(2026, 1, 1), 'daily', 1);
    expect(dates).toHaveLength(MAX_OCCURRENCES_PER_RUN);
  });
});
