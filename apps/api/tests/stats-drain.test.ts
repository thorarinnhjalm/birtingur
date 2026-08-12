import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EVENT_QUEUE_STATS } from '@ada/shared';

// The drain loop's contract is about Redis and reporting, not Firestore: how much it
// pops, what it puts back when the write fails, what it refuses to put back, and
// whether it tells anyone it stopped early. So Redis is an in-memory list here and the
// aggregation step is injected via the `aggregate` seam — the real aggregateEvents is
// covered against the Firestore emulator in stats-aggregator.test.ts.
//
// Named with the "mock" prefix so Vitest allows referencing them inside the hoisted
// vi.mock factory below (same convention as accrual.test.ts / ops-alerts.test.ts).
let mockQueues: Map<string, string[]>;
let mockStore: Map<string, string | number>;

vi.mock('../src/lib/redis', () => ({
  isRedisConfigured: () => true,
  getRedis: () => ({
    // index 0 is the HEAD of the list: lpush unshifts, rpop pops from the tail.
    // `rpop(key, count)` returns an array, matching what the Upstash SDK does.
    rpop: vi.fn(async (key: string, count?: number) => {
      const list = mockQueues.get(key) ?? [];
      const want = count ?? 1;
      const out: string[] = [];
      for (let i = 0; i < want; i++) {
        const item = list.pop();
        if (item === undefined) break;
        out.push(item);
      }
      if (out.length === 0) return null;
      return count == null ? out[0] : out;
    }),
    lpush: vi.fn(async (key: string, value: string) => {
      const list = mockQueues.get(key) ?? [];
      list.unshift(value);
      mockQueues.set(key, list);
      return list.length;
    }),
    set: vi.fn(async (key: string, value: unknown, opts?: { nx?: boolean; ex?: number }) => {
      if (opts?.nx && mockStore.has(key)) return null; // simulate NX no-op
      mockStore.set(key, value as string | number);
      return 'OK';
    }),
    get: vi.fn(async (key: string) => mockStore.get(key) ?? null),
  }),
}));

const sentEmails: Array<{ subject: string; message: string }> = [];
vi.mock('../src/services/mail', () => ({
  sendOpsAlertEmail: vi.fn(async (_to: string[], subject: string, message: string) => {
    sentEmails.push({ subject, message });
  }),
}));

vi.mock('../src/services/notifications', () => ({
  createNotification: vi.fn(async () => {}),
}));

import { drainAndAggregateAll, AggregationError } from '../src/services/stats-aggregator';
import type { QueuedEvent } from '../src/services/stats-aggregator';

function makeEvent(i: number): QueuedEvent {
  return {
    type: 'impression',
    slotId: `slot_${i}`,
    publisherId: 'pub_a',
    creativeId: 'cre_1',
    campaignId: 'cmp_1',
    advertiserId: 'adv_1',
    country: 'IS',
    visitorToken: `v_${i}`,
    ts: 1_700_000_000_000,
  };
}

/** Seed `count` events on the stats queue. */
function seedQueue(count: number) {
  mockQueues.set(
    EVENT_QUEUE_STATS,
    Array.from({ length: count }, (_, i) => JSON.stringify(makeEvent(i))),
  );
}

function queueDepth(): number {
  return mockQueues.get(EVENT_QUEUE_STATS)?.length ?? 0;
}

/** First alert that went out, failing loudly rather than reading `undefined.subject`. */
function firstAlert(): { subject: string; message: string } {
  const first = sentEmails[0];
  if (!first) throw new Error('expected an ops alert to have been sent, but none was');
  return first;
}

beforeEach(() => {
  mockQueues = new Map();
  mockStore = new Map();
  sentEmails.length = 0;
  // alertOps only emails when recipients are configured; give it one so the
  // alert assertions below see real subjects instead of a console-only path.
  process.env.OPS_ALERT_EMAILS = 'ops@example.com';
});

describe('drainAndAggregateAll — how far a run gets', () => {
  it('keeps going until the queues run dry', async () => {
    seedQueue(5);
    const seen: number[] = [];

    const res = await drainAndAggregateAll({
      batchSize: 2,
      aggregate: async (events) => {
        seen.push(events.length);
      },
    });

    // 2 + 2 + 1, then a fourth batch that pops nothing and proves the queue is dry.
    expect(seen).toEqual([2, 2, 1]);
    expect(res.aggregated).toBe(5);
    expect(res.requeued).toBe(0);
    expect(res.lost).toBe(0);
    expect(res.capped).toBe(false);
    expect(res.timedOut).toBe(false);
    expect(queueDepth()).toBe(0);
    expect(sentEmails).toHaveLength(0); // a clean drain pages nobody
  });

  it('reports capped and alerts when the batch cap cuts the run short', async () => {
    seedQueue(6);

    const res = await drainAndAggregateAll({
      batchSize: 2,
      maxBatches: 2,
      aggregate: async () => {},
    });

    expect(res.batches).toBe(2);
    expect(res.aggregated).toBe(4);
    expect(res.capped).toBe(true);
    expect(res.timedOut).toBe(false);
    expect(queueDepth()).toBe(2); // the untouched remainder, not lost
    expect(sentEmails).toHaveLength(1);
    expect(firstAlert().subject).toContain('hafði ekki undan');
    expect(firstAlert().message).toContain('hámarksfjölda lotna (2)');
  });

  it('stops on the wall-clock deadline between batches, never mid-batch', async () => {
    seedQueue(6);
    let clock = 0;
    const aggregated: number[] = [];

    const res = await drainAndAggregateAll({
      batchSize: 2,
      deadlineMs: 25,
      // Two batches fit inside the 25ms budget; the third start is over it.
      now: () => (clock += 10),
      aggregate: async (events) => {
        aggregated.push(events.length);
      },
    });

    expect(res.timedOut).toBe(true);
    expect(res.capped).toBe(false);
    expect(res.batches).toBe(2);
    // Both in-flight batches finished and are counted — the whole point of
    // checking the deadline before starting a batch rather than during one.
    expect(aggregated).toEqual([2, 2]);
    expect(res.aggregated).toBe(4);
    expect(queueDepth()).toBe(2);
    expect(firstAlert().subject).toContain('hafði ekki undan');
  });

  it('is a no-op on an empty queue', async () => {
    const res = await drainAndAggregateAll({ aggregate: async () => {} });

    expect(res).toMatchObject({ aggregated: 0, requeued: 0, lost: 0, batches: 1, capped: false });
    expect(sentEmails).toHaveLength(0);
  });
});

describe('drainAndAggregateAll — what happens to events when the write fails', () => {
  it('re-queues the batch when nothing was committed', async () => {
    seedQueue(3);

    const res = await drainAndAggregateAll({
      batchSize: 3,
      aggregate: async () => {
        throw new AggregationError('all chunks failed', { anyCommitted: false });
      },
    });

    expect(res.aggregated).toBe(0);
    expect(res.requeued).toBe(3);
    expect(res.lost).toBe(0);
    expect(queueDepth()).toBe(3); // every event is back for the next run
  });

  it('treats a plain (non-AggregationError) failure as nothing-committed', async () => {
    seedQueue(2);

    const res = await drainAndAggregateAll({
      batchSize: 2,
      aggregate: async () => {
        throw new Error('redis blew up before the write phase');
      },
    });

    expect(res.requeued).toBe(2);
    expect(res.lost).toBe(0);
    expect(queueDepth()).toBe(2);
  });

  it('refuses to re-queue a partially committed batch, and alerts that it was lost', async () => {
    seedQueue(3);

    const res = await drainAndAggregateAll({
      batchSize: 3,
      aggregate: async () => {
        throw new AggregationError('chunk 2 of 3 failed', { anyCommitted: true });
      },
    });

    // Re-queueing would apply the committed chunks' increments a second time.
    expect(res.requeued).toBe(0);
    expect(res.lost).toBe(3);
    expect(queueDepth()).toBe(0);
    expect(sentEmails.some((a) => a.subject.includes('töpuðust'))).toBe(true);
  });

  it('stops rather than spinning on re-queued events, and alerts on zero progress', async () => {
    seedQueue(4);
    let calls = 0;

    const res = await drainAndAggregateAll({
      batchSize: 2,
      aggregate: async () => {
        calls++;
        throw new AggregationError('firestore down', { anyCommitted: false });
      },
    });

    // Re-queued events go to the head while draining reads the tail, so without
    // the zero-progress break this would keep re-popping the same events for
    // the whole wall-clock budget.
    expect(calls).toBe(1);
    expect(res.batches).toBe(1);
    expect(res.aggregated).toBe(0);
    expect(queueDepth()).toBe(4);
    expect(sentEmails).toHaveLength(1);
    expect(firstAlert().subject).toContain('skilaði engu');
  });

  it('does not alert twice for the same condition inside the dedupe window', async () => {
    seedQueue(2);
    const failing = {
      aggregate: async () => {
        throw new AggregationError('down', { anyCommitted: false });
      },
    };

    await drainAndAggregateAll({ batchSize: 2, ...failing });
    await drainAndAggregateAll({ batchSize: 2, ...failing });

    expect(sentEmails).toHaveLength(1);
  });
});
