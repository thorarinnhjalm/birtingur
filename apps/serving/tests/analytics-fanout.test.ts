import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EVENT_QUEUE_STATS, EVENT_QUEUE_ACCRUAL } from '@ada/shared';

const lpush = vi.fn(async (key: string, payload?: string) => {
  if (key || payload) return 1;
  return 1;
});
vi.mock('../src/lib/redis', () => ({
  getRedis: () => ({ lpush }),
}));

import { logEvent } from '../src/lib/analytics';
import type { AdEvent } from '../src/lib/analytics';

function ev(type: AdEvent['type']): AdEvent {
  return {
    type,
    slotId: 'slot_a',
    publisherId: 'pub_a',
    creativeId: 'cre_a',
    campaignId: type === 'pageview' ? 'cmp_fallback' : 'cmp_a',
    advertiserId: '',
    country: 'XX',
    visitorToken: 'tok',
    ts: 1,
  };
}

beforeEach(() => {
  lpush.mockClear();
});

describe('logEvent queue fan-out', () => {
  it('pushes a pageview to the stats queue but NOT the accrual queue', async () => {
    await logEvent(ev('pageview'));
    const queues = lpush.mock.calls.map((c) => c[0]);
    expect(queues).toContain(EVENT_QUEUE_STATS);
    expect(queues).not.toContain(EVENT_QUEUE_ACCRUAL);
  });

  it('pushes an impression to BOTH the stats and accrual queues', async () => {
    await logEvent(ev('impression'));
    const queues = lpush.mock.calls.map((c) => c[0]);
    expect(queues).toContain(EVENT_QUEUE_STATS);
    expect(queues).toContain(EVENT_QUEUE_ACCRUAL);
  });

  it('pushes a click only to the stats queue (accrual bills impressions only)', async () => {
    await logEvent(ev('click'));
    const queues = lpush.mock.calls.map((c) => c[0]);
    expect(queues).toContain(EVENT_QUEUE_STATS);
    expect(queues).not.toContain(EVENT_QUEUE_ACCRUAL);
  });
});
