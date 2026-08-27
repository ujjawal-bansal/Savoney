import { describe, expect, it } from 'vitest';
import { daysInRange, previousRange, resolveRange } from '../../src/lib/date-range.js';

const now = new Date(Date.UTC(2026, 5, 15, 10, 30));
const iso = (date: Date) => date.toISOString().slice(0, 10);

describe('resolveRange', () => {
  it('makes relative presets inclusive of today', () => {
    const range = resolveRange('last_7_days', undefined, undefined, now);
    // 9th through 15th inclusive is 7 calendar days.
    expect(iso(range.from)).toBe('2026-06-09');
    expect(iso(range.to)).toBe('2026-06-15');
    expect(daysInRange(range)).toBe(7);
  });

  it('resolves this_month from the first of the month', () => {
    const range = resolveRange('this_month', undefined, undefined, now);
    expect(iso(range.from)).toBe('2026-06-01');
    expect(iso(range.to)).toBe('2026-06-15');
  });

  it('resolves last_month to its full span', () => {
    const range = resolveRange('last_month', undefined, undefined, now);
    expect(iso(range.from)).toBe('2026-05-01');
    expect(iso(range.to)).toBe('2026-05-31');
  });

  it('resolves this_year from January 1st', () => {
    const range = resolveRange('this_year', undefined, undefined, now);
    expect(iso(range.from)).toBe('2026-01-01');
  });

  it('snaps a custom range to whole-day boundaries', () => {
    const range = resolveRange(
      'custom',
      new Date(Date.UTC(2026, 2, 5, 14)),
      new Date(Date.UTC(2026, 2, 9, 3)),
      now,
    );
    // The end bound covers the whole of the 9th, not just its first 3 hours.
    expect(range.from.toISOString()).toBe('2026-03-05T00:00:00.000Z');
    expect(range.to.toISOString()).toBe('2026-03-09T23:59:59.999Z');
  });
});

describe('previousRange', () => {
  it('returns the equal-length window immediately before', () => {
    const range = resolveRange('last_7_days', undefined, undefined, now);
    const previous = previousRange(range);

    expect(iso(previous.to)).toBe('2026-06-08');
    expect(iso(previous.from)).toBe('2026-06-02');
    // Equal length is what makes a period-over-period delta meaningful.
    expect(daysInRange(previous)).toBe(daysInRange(range));
  });
});

describe('daysInRange', () => {
  it('never returns zero, so it is always safe as a divisor', () => {
    const instant = { from: now, to: now };
    expect(daysInRange(instant)).toBe(1);
  });
});
