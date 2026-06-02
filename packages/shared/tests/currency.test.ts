import { describe, it, expect } from 'vitest';
import { formatIsk, parseIsk } from '../src/formatting/currency';

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
