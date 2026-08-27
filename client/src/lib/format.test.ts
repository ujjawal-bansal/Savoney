import { describe, expect, it } from 'vitest';
import { formatDate, formatDelta, formatSigned, toDateInputValue } from './format';

describe('formatDate', () => {
  it('uses relative wording for today and yesterday', () => {
    expect(formatDate(new Date())).toBe('Today');
    expect(formatDate(new Date(Date.now() - 86_400_000))).toBe('Yesterday');
  });

  it('omits the year for dates in the current year', () => {
    const thisYear = new Date();
    thisYear.setMonth(0, 15);
    // Guard against running this on 15 January, when it would read "Today".
    if (formatDate(thisYear) !== 'Today') {
      expect(formatDate(thisYear)).toBe('15 Jan');
    }
  });

  it('includes the year for other years', () => {
    expect(formatDate('2019-03-07T12:00:00.000Z')).toBe('7 Mar 2019');
  });
});

describe('formatSigned', () => {
  it('renders expenses negative and income positive', () => {
    // The sign is always shown so the direction never depends on colour.
    expect(formatSigned(1234, 'expense', 'USD')).toBe('-$12.34');
    expect(formatSigned(1234, 'income', 'USD')).toBe('+$12.34');
  });
});

describe('formatDelta', () => {
  it('marks a rise explicitly and renders an em dash when undefined', () => {
    expect(formatDelta(12.34)).toBe('+12.3%');
    expect(formatDelta(-4)).toBe('-4.0%');
    expect(formatDelta(null)).toBe('N/A');
  });
});

describe('toDateInputValue', () => {
  it('produces the yyyy-MM-dd form a date input requires', () => {
    expect(toDateInputValue('2026-03-07T15:30:00.000Z')).toBe('2026-03-07');
  });
});
