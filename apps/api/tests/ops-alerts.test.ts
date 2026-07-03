import { describe, it, expect } from 'vitest';
import { staleCrons, CRON_STALENESS_MINUTES } from '../src/services/ops-alerts';

const MIN = 60_000;

describe('staleCrons', () => {
  const now = 1_800_000_000_000;

  it('flags a cron whose heartbeat is older than its threshold', () => {
    const result = staleCrons(now, {
      'cron-accrue': now - 46 * MIN, // threshold 45
      'cron-refresh-cache': now - 5 * MIN,
      'cron-payouts': now - 24 * 60 * MIN,
    });
    expect(result.map((s) => s.name)).toEqual(['cron-accrue']);
    expect(result[0]?.ageMinutes).toBe(46);
  });

  it('returns nothing when every heartbeat is fresh', () => {
    const result = staleCrons(now, {
      'cron-accrue': now - 10 * MIN,
      'cron-refresh-cache': now - 9 * MIN,
      'cron-payouts': now - 2 * 24 * 60 * MIN,
    });
    expect(result).toEqual([]);
  });

  it('treats a missing heartbeat as bootstrap, not stale', () => {
    // First deploy: no keys exist yet — must not alert-storm.
    const result = staleCrons(now, {
      'cron-accrue': null,
      'cron-refresh-cache': null,
      'cron-payouts': null,
    });
    expect(result).toEqual([]);
  });

  it('flags a payouts heartbeat older than a month + grace', () => {
    const threshold = CRON_STALENESS_MINUTES['cron-payouts']!;
    const result = staleCrons(now, {
      'cron-payouts': now - (threshold + 1) * MIN,
    });
    expect(result.map((s) => s.name)).toEqual(['cron-payouts']);
  });
});
