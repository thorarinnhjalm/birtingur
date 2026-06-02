import { describe, it, expect } from 'vitest';
import { HourlyStatsSchema, PublisherStatsBreakdownSchema } from '../src/schemas/stats';

describe('PublisherStatsBreakdownSchema', () => {
  it('accepts a breakdown row', () => {
    expect(() =>
      PublisherStatsBreakdownSchema.parse({
        impressions: 5200,
        clicks: 42,
        spendIsk: 2100,
      }),
    ).not.toThrow();
  });

  it('rejects negative values', () => {
    expect(() =>
      PublisherStatsBreakdownSchema.parse({
        impressions: -1,
        clicks: 0,
        spendIsk: 0,
      }),
    ).toThrow();
  });
});

describe('HourlyStatsSchema', () => {
  it('accepts hourly stats with publisher breakdown', () => {
    expect(() =>
      HourlyStatsSchema.parse({
        impressions: 100,
        clicks: 3,
        spendIsk: 150,
        byPublisher: {
          pub_a: { impressions: 60, clicks: 2, spendIsk: 90 },
          pub_b: { impressions: 40, clicks: 1, spendIsk: 60 },
        },
      }),
    ).not.toThrow();
  });

  it('accepts empty publisher breakdown', () => {
    expect(() =>
      HourlyStatsSchema.parse({
        impressions: 0,
        clicks: 0,
        spendIsk: 0,
        byPublisher: {},
      }),
    ).not.toThrow();
  });
});
