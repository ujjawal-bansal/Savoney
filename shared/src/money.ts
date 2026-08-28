/**
 * Money handling for Savoney.
 *
 * Every monetary value that crosses a boundary — HTTP, MongoDB, or the React
 * tree — is an integer number of *minor units* (cents for USD, paise for INR).
 * Floating point is never used to hold or accumulate money.
 *
 * Why: `0.1 + 0.2 === 0.30000000000000004`. Summing a few thousand float
 * expenses drifts by real fractions of a cent, and a ledger that cannot
 * reconcile is a broken ledger. Integers make every sum exact.
 */

/** An integer count of minor units. Branded so a raw float cannot be passed. */
export type Minor = number & { readonly __brand: 'Minor' };

/** Order matters: this drives the order of every currency picker in the UI. */
export const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD'] as const;
export type Currency = (typeof CURRENCIES)[number];

/** Exponent per ISO-4217. JPY has no minor unit; the rest use 2 digits. */
const EXPONENT: Record<Currency, number> = {
  INR: 2,
  USD: 2,
  EUR: 2,
  GBP: 2,
  JPY: 0,
  CAD: 2,
  AUD: 2,
};

export const DEFAULT_CURRENCY: Currency = 'INR';

export const exponentOf = (currency: Currency): number => EXPONENT[currency];

/** Largest value we accept, in minor units — ~90 trillion major units. */
export const MAX_MINOR = 9_000_000_000_000_000;

export const isMinor = (value: unknown): value is Minor =>
  typeof value === 'number' && Number.isInteger(value) && Math.abs(value) <= MAX_MINOR;

/** Assert-and-brand. Use at trust boundaries where the integer invariant is already known. */
export const asMinor = (value: number): Minor => {
  if (!Number.isInteger(value)) {
    throw new TypeError(`Money must be an integer number of minor units, received ${value}`);
  }
  return value as Minor;
};

export const zeroMinor = (): Minor => 0 as Minor;

/**
 * Convert a human-entered major-unit amount ("12.34") to minor units (1234).
 *
 * Rounds half away from zero at the currency's exponent. The string path is
 * preferred — `Math.round(12.345 * 100)` is subject to the very float error
 * this module exists to avoid, so decimal strings are parsed digit-wise.
 */
export const toMinor = (amount: string | number, currency: Currency = DEFAULT_CURRENCY): Minor => {
  const exp = EXPONENT[currency];
  const raw = typeof amount === 'number' ? amount.toString() : amount.trim();

  if (raw === '' || !/^-?\d*(\.\d*)?$/.test(raw)) {
    throw new TypeError(`Cannot parse "${amount}" as a monetary amount`);
  }

  const negative = raw.startsWith('-');
  const unsigned = negative ? raw.slice(1) : raw;
  const [whole = '0', fraction = ''] = unsigned.split('.');

  // Pad or round the fractional part to exactly `exp` digits.
  const kept = fraction.slice(0, exp).padEnd(exp, '0');
  const nextDigit = fraction.charAt(exp);
  const roundUp = nextDigit !== '' && Number(nextDigit) >= 5;

  const digits = `${whole}${kept}`.replace(/^0+(?=\d)/, '');
  let value = Number(digits) + (roundUp ? 1 : 0);

  if (!Number.isSafeInteger(value) || value > MAX_MINOR) {
    throw new RangeError(`Monetary amount ${amount} exceeds the supported range`);
  }
  if (negative) value = -value;

  return value as Minor;
};

/** Convert minor units back to a major-unit number. Presentation only — never accumulate this. */
export const toMajor = (minor: Minor | number, currency: Currency = DEFAULT_CURRENCY): number =>
  minor / 10 ** EXPONENT[currency];

export const addMinor = (...values: Array<Minor | number>): Minor =>
  values.reduce<number>((sum, v) => sum + v, 0) as Minor;

export const subMinor = (a: Minor | number, b: Minor | number): Minor => (a - b) as Minor;

/** Multiply money by a plain ratio (e.g. a 0.25 budget slice), rounding to a whole minor unit. */
export const scaleMinor = (value: Minor | number, factor: number): Minor =>
  Math.round(value * factor) as Minor;

/** Percentage of `part` within `whole`, guarding division by zero. Returns 0–Infinity, unclamped. */
export const percentOf = (part: Minor | number, whole: Minor | number): number =>
  whole === 0 ? 0 : (part / whole) * 100;

/**
 * Format minor units for display using the platform Intl tables.
 *
 * `compact` renders 1_250_000 as "$12.5K" for dense dashboard tiles;
 * `signDisplay` surfaces the +/- that makes a ledger readable at a glance.
 */
export const formatMoney = (
  minor: Minor | number,
  currency: Currency = DEFAULT_CURRENCY,
  options: { compact?: boolean; signDisplay?: 'auto' | 'always' | 'never'; locale?: string } = {},
): string => {
  const { compact = false, signDisplay = 'auto', locale } = options;
  const exp = EXPONENT[currency];

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    signDisplay,
    ...(compact
      ? { notation: 'compact', maximumFractionDigits: 1 }
      : { minimumFractionDigits: exp, maximumFractionDigits: exp }),
  }).format(toMajor(minor, currency));
};

/**
 * Re-express an amount when the user switches currency.
 *
 * This is a *relabel*, not a foreign-exchange conversion: the major-unit number
 * the user typed is preserved, so 12.34 stays 12.34. Between two 2-decimal
 * currencies nothing changes at all. Only a differing exponent forces work —
 * USD(2) to JPY(0) turns 1234 minor units ($12.34) into 12 (¥12).
 *
 * We deliberately do not apply exchange rates: a real conversion needs a dated
 * rate per transaction from a source of truth, and inventing one would silently
 * falsify the user's financial history.
 */
export const rescaleMinor = (value: number, from: Currency, to: Currency): number => {
  const shift = EXPONENT[to] - EXPONENT[from];
  if (shift === 0) return value;
  return Math.round(value * 10 ** shift);
};

/** True when switching between these currencies changes stored amounts. */
export const needsRescale = (from: Currency, to: Currency): boolean =>
  EXPONENT[from] !== EXPONENT[to];

/** The bare decimal string an `<input type="number">` should hold — no symbol, no grouping. */
export const toInputValue = (
  minor: Minor | number,
  currency: Currency = DEFAULT_CURRENCY,
): string => toMajor(minor, currency).toFixed(EXPONENT[currency]);
