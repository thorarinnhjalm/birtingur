import { describe, it, expect } from 'vitest';
import { formatIsk, formatNumberIs, parseIsk } from '../src/formatting/currency';

describe('formatIsk', () => {
  it('formats whole numbers with period thousand-separator and "kr" suffix', () => {
    expect(formatIsk(1000)).toBe('1.000 kr');
    expect(formatIsk(20000)).toBe('20.000 kr');
    expect(formatIsk(1500000)).toBe('1.500.000 kr');
  });

  it('formats zero', () => {
    expect(formatIsk(0)).toBe('0 kr');
  });

  it('formats small numbers without separator', () => {
    expect(formatIsk(5)).toBe('5 kr');
    expect(formatIsk(999)).toBe('999 kr');
  });

  it('rounds non-integer input', () => {
    expect(formatIsk(1000.4)).toBe('1.000 kr');
    expect(formatIsk(1000.6)).toBe('1.001 kr');
  });

  it('handles negative numbers', () => {
    expect(formatIsk(-1000)).toBe('-1.000 kr');
  });
});

describe('parseIsk', () => {
  it('parses period-separated values', () => {
    expect(parseIsk('1.000 kr')).toBe(1000);
    expect(parseIsk('20.000')).toBe(20000);
    expect(parseIsk('1.500.000 kr')).toBe(1500000);
  });

  it('parses values without separators', () => {
    expect(parseIsk('5000')).toBe(5000);
    expect(parseIsk('999')).toBe(999);
  });

  it('returns null for invalid input', () => {
    expect(parseIsk('abc')).toBe(null);
    expect(parseIsk('')).toBe(null);
    expect(parseIsk('1,000')).toBe(null);
  });

  it('trims whitespace', () => {
    expect(parseIsk('  1.000 kr  ')).toBe(1000);
  });
});

/**
 * Pure-string Icelandic number formatting, no Intl. Every number surface used
 * toLocaleString('is-IS') / Intl.NumberFormat('is-IS'), which silently falls
 * back to the browser's default locale when its ICU lacks Icelandic — a real
 * production Chrome rendered "21,860", which in Icelandic convention reads as
 * twenty-one point eight six. Display must not depend on the viewer's ICU.
 */
describe('formatNumberIs', () => {
  it('groups thousands with a dot', () => {
    expect(formatNumberIs(21_860)).toBe('21.860');
    expect(formatNumberIs(1_234_567)).toBe('1.234.567');
    expect(formatNumberIs(328)).toBe('328');
    expect(formatNumberIs(0)).toBe('0');
  });

  it('marks decimals with a comma', () => {
    expect(formatNumberIs(25.0)).toBe('25');
    expect(formatNumberIs(3.5)).toBe('3,5');
    expect(formatNumberIs(1234.56)).toBe('1.234,56');
  });

  it('handles negatives', () => {
    expect(formatNumberIs(-21_860)).toBe('-21.860');
  });

  it('matches toLocaleString(is-IS) wherever real ICU exists', () => {
    // Node ships full ICU, so this pins that swapping the implementation in is
    // invisible in every environment that was already correct — including the
    // prerender pipeline, whose committed snapshots must not churn.
    for (const n of [0, 7, 75, 328, 2150, 21_860, 3_480, 1_234_567, 3.5, 1234.56, -9999]) {
      expect(formatNumberIs(n)).toBe(n.toLocaleString('is-IS'));
    }
  });
});
