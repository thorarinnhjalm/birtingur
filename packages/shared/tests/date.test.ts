import { describe, it, expect } from 'vitest';
import { formatDate, formatRelative } from '../src/formatting/date';

describe('formatDate', () => {
  it('formats date as dd.MM.yyyy', () => {
    expect(formatDate(new Date('2026-06-02T12:00:00Z'))).toBe('02.06.2026');
    expect(formatDate(new Date('2026-12-31T23:59:59Z'))).toBe('31.12.2026');
    expect(formatDate(new Date('2026-01-01T00:00:00Z'))).toBe('01.01.2026');
  });

  it('accepts ISO string input', () => {
    expect(formatDate('2026-06-02')).toBe('02.06.2026');
  });

  it('accepts unix timestamp (ms)', () => {
    expect(formatDate(1748880000000)).toBe('02.06.2025');
  });
});

describe('formatRelative', () => {
  const now = new Date('2026-06-02T12:00:00Z');

  it('returns "í dag" for same day', () => {
    expect(formatRelative(new Date('2026-06-02T08:00:00Z'), now)).toBe('í dag');
  });

  it('returns "í gær" for yesterday', () => {
    expect(formatRelative(new Date('2026-06-01T08:00:00Z'), now)).toBe('í gær');
  });

  it('returns "fyrir N dögum" for 2-7 days ago', () => {
    expect(formatRelative(new Date('2026-05-31T12:00:00Z'), now)).toBe('fyrir 2 dögum');
    expect(formatRelative(new Date('2026-05-26T12:00:00Z'), now)).toBe('fyrir 7 dögum');
  });

  it('falls back to formatDate for 8+ days ago', () => {
    expect(formatRelative(new Date('2026-05-20T12:00:00Z'), now)).toBe('20.05.2026');
  });

  it('handles future dates', () => {
    expect(formatRelative(new Date('2026-06-03T12:00:00Z'), now)).toBe('á morgun');
    expect(formatRelative(new Date('2026-06-05T12:00:00Z'), now)).toBe('eftir 3 daga');
    expect(formatRelative(new Date('2026-07-15T12:00:00Z'), now)).toBe('15.07.2026');
  });
});
