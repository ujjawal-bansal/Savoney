import { describe, expect, it } from 'vitest';
import {
  addMinor,
  formatMoney,
  needsRescale,
  percentOf,
  rescaleMinor,
  toInputValue,
  toMajor,
  toMinor,
} from '@savoney/shared';

describe('toMinor', () => {
  it.each([
    ['12.34', 1234],
    ['0.01', 1],
    ['0.1', 10],
    ['1', 100],
    ['1000000.99', 100_000_099],
    ['-5.50', -550],
    ['0', 0],
  ])('parses %s to %i minor units', (input, expected) => {
    expect(toMinor(input)).toBe(expected);
  });

  it('rounds half away from zero at the currency exponent', () => {
    expect(toMinor('0.994')).toBe(99);
    expect(toMinor('0.995')).toBe(100);
    expect(toMinor('0.996')).toBe(100);
  });

  it('respects a currency with no minor unit', () => {
    // JPY has exponent 0: ¥1234 is 1234 minor units, not 123400.
    expect(toMinor('1234', 'JPY')).toBe(1234);
  });

  it('accepts a number as well as a string', () => {
    expect(toMinor(12.34)).toBe(1234);
  });

  it('rejects input that is not a monetary amount', () => {
    expect(() => toMinor('abc')).toThrow(TypeError);
    expect(() => toMinor('')).toThrow(TypeError);
    expect(() => toMinor('1.2.3')).toThrow(TypeError);
  });

  it('rejects an amount beyond the safe integer range', () => {
    expect(() => toMinor('999999999999999999')).toThrow(RangeError);
  });
});

describe('integer money arithmetic', () => {
  it('sums exactly where floating point drifts', () => {
    // The motivating case: 0.1 + 0.2 + 0.3 !== 0.6 in IEEE-754 doubles.
    const floatSum = 0.1 + 0.2 + 0.3;
    expect(floatSum).not.toBe(0.6);

    const minorSum = addMinor(toMinor('0.1'), toMinor('0.2'), toMinor('0.3'));
    expect(minorSum).toBe(60);
    expect(toMajor(minorSum)).toBe(0.6);
  });

  it('stays exact across a large number of additions', () => {
    // Ten thousand $0.07 charges. Accumulating 0.07 as a float drifts;
    // accumulating 7 cents cannot.
    const values = Array.from({ length: 10_000 }, () => toMinor('0.07'));
    expect(addMinor(...values)).toBe(70_000);
    expect(toMajor(addMinor(...values))).toBe(700);
  });
});

describe('percentOf', () => {
  it('computes a share', () => {
    expect(percentOf(50, 200)).toBe(25);
  });

  it('returns 0 rather than dividing by zero', () => {
    expect(percentOf(5, 0)).toBe(0);
  });
});

describe('formatMoney', () => {
  it('formats with the currency symbol and fixed precision', () => {
    expect(formatMoney(123_456, 'USD', { locale: 'en-US' })).toBe('$1,234.56');
  });

  it('omits minor units for a zero-exponent currency', () => {
    expect(formatMoney(1234, 'JPY', { locale: 'en-US' })).toBe('¥1,234');
  });

  it('renders compactly for dense tiles', () => {
    expect(formatMoney(1_250_000, 'USD', { compact: true, locale: 'en-US' })).toBe('$12.5K');
  });

  it('can force a sign so a ledger reads at a glance', () => {
    expect(formatMoney(4200, 'USD', { signDisplay: 'always', locale: 'en-US' })).toBe('+$42.00');
  });
});

describe('toInputValue', () => {
  it('produces a bare decimal suitable for a number input', () => {
    expect(toInputValue(1234)).toBe('12.34');
    expect(toInputValue(1234, 'JPY')).toBe('1234');
  });

  it('round-trips through toMinor', () => {
    for (const value of [1, 99, 100, 12_345, 1_000_000]) {
      expect(toMinor(toInputValue(value))).toBe(value);
    }
  });
});

describe('rescaleMinor', () => {
  it('is a no-op between currencies with the same exponent', () => {
    // Six of the seven supported currencies use two decimals, so this is the
    // common case and no stored amount is touched.
    expect(rescaleMinor(1234, 'USD', 'EUR')).toBe(1234);
    expect(needsRescale('USD', 'EUR')).toBe(false);
  });

  it('preserves the major-unit value into a zero-decimal currency', () => {
    // $12.34 becomes ¥12 — the number the user typed, relabelled. Leaving the
    // raw 1234 would have rendered as ¥1,234, inflating it a hundredfold.
    expect(rescaleMinor(toMinor('12.34'), 'USD', 'JPY')).toBe(12);
    expect(rescaleMinor(toMinor('1250.00'), 'USD', 'JPY')).toBe(1250);
    expect(needsRescale('USD', 'JPY')).toBe(true);
  });

  it('preserves the major-unit value out of a zero-decimal currency', () => {
    expect(rescaleMinor(1234, 'JPY', 'USD')).toBe(123_400);
  });

  it('rounds half away from zero, matching the server rewrite', () => {
    expect(rescaleMinor(toMinor('12.50'), 'USD', 'JPY')).toBe(13);
    expect(rescaleMinor(toMinor('12.49'), 'USD', 'JPY')).toBe(12);
  });

  it('can round a sub-unit amount to zero — callers must clamp', () => {
    // $0.40 has no representation in yen. The service floors this at 1 rather
    // than writing a zero amount the schema forbids.
    expect(rescaleMinor(toMinor('0.40'), 'USD', 'JPY')).toBe(0);
  });

  it('loses sub-units on a round trip, which is inherent not a bug', () => {
    const original = toMinor('45.99');
    const roundTripped = rescaleMinor(rescaleMinor(original, 'USD', 'JPY'), 'JPY', 'USD');
    expect(roundTripped).toBe(4_600);
  });
});
