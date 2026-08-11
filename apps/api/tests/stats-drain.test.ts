import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '../src/lib/firebase';
import { COLLECTIONS } from '@ada/shared/firestore';
import { EVENT_QUEUE_STATS, EVENT_QUEUE_LEGACY } from '@ada/shared';
import { clearFirestoreEmulator } from './helpers/emulator';

// The drain half of cron-aggregate, which the aggregateEvents suite doesn't
// touch. It exists because the drain used to pop ONE event per Redis round
// trip: Upstash is a REST API, so a 1000-event batch was 1000 sequential HTTPS
// requests and the hourly cron 504'd on Vercel's 60s limit while events:stats
// grew unbounded. Firestore is the real emulator here (the write phase must be
// real — see stats-aggregator.test.ts on why); Redis is a fake list that
// records how it was called, because "how many round trips" IS the thing under
// test.

const queues = new Map<string, string[]>();
const rpopCalls: Array<{ key: string; count?: number }> = [];

/** Enqueue the way apps/serving does — lpush at the head, rpop from the tail. */
function enqueue(queue: string, ...items: unknown[]) {
  const list = queues.get(queue) ?? [];
  list.unshift(...items.map((i) => (typeof i === 'string' ? i : JSON.stringify(i))));
  queues.set(queue, list);
}

vi.mock('../src/lib/redis', () => ({
  getRedis: () => ({
    rpop: async (key: string, count?: number) => {
      rpopCalls.push({ key, count });
      const list = queues.get(key) ?? [];
      if (count === undefined) return list.pop() ?? null;
      const out: string[] = [];
      for (let i = 0; i < count && list.length > 0; i++) out.push(list.pop()!);
      // Upstash answers null, not [], for an empty list.
      return out.length > 0 ? out : null;
    },
    pipeline: () => {
      const p = { incr: () => p, expire: () => p, exec: async () => [] };
      return p;
    },
  }),
}));

import { drainAndAggregate, drainAndAggregateAll } from '../src/services/stats-aggregator';
import type { QueuedEvent } from '../src/services/stats-aggregator';

function makeEvent(overrides: Partial<QueuedEvent> = {}): QueuedEvent {
  return {
    type: 'impression',
    slotId: 'slot_1',
    publisherId: 'pub_a',
    creativeId: 'cre_1',
    campaignId: 'cmp_1',
    advertiserId: 'adv_1',
    country: 'IS',
    visitorToken: 'v1',
    ts: Date.UTC(2026, 7, 8, 12, 30, 0),
    ...overrides,
  };
}

function statsPops() {
  return rpopCalls.filter((c) => c.key === EVENT_QUEUE_STATS);
}

describe('drainAndAggregate', () => {
  beforeEach(async () => {
    await clearFirestoreEmulator();
    queues.clear();
    rpopCalls.length = 0;
  });

  it('pops in bulk instead of one event per round trip', async () => {
    enqueue(EVENT_QUEUE_STATS, ...Array.from({ length: 450 }, () => makeEvent()));

    const n = await drainAndAggregate(1000);

    expect(n).toBe(450);
    // Three chunks asked for 200 each; the third comes back with 50 and ends
    // the loop. Not 450 round trips.
    expect(statsPops().map((c) => c.count)).toEqual([200, 200, 200]);
    expect(statsPops().length).toBeLessThan(10);
  });

  it('stops asking once a chunk comes back short', async () => {
    enqueue(EVENT_QUEUE_STATS, makeEvent(), makeEvent());

    await drainAndAggregate(1000);

    // One short read is proof the queue is dry; a second call would only buy
    // the same answer at the cost of a round trip.
    expect(statsPops().length).toBe(1);
  });

  it('never asks for more than the batch size', async () => {
    enqueue(EVENT_QUEUE_STATS, ...Array.from({ length: 400 }, () => makeEvent()));

    const n = await drainAndAggregate(250);

    expect(n).toBe(250);
    expect(statsPops().map((c) => c.count)).toEqual([200, 50]);
    // The batch cap was reached, so the legacy queue is left for the next batch.
    expect(rpopCalls.some((c) => c.key === EVENT_QUEUE_LEGACY)).toBe(false);
    expect(queues.get(EVENT_QUEUE_STATS)?.length).toBe(150);
  });

  it('drains the legacy queue too, after the stats queue', async () => {
    enqueue(EVENT_QUEUE_STATS, makeEvent({ publisherId: 'pub_stats' }));
    enqueue(EVENT_QUEUE_LEGACY, makeEvent({ publisherId: 'pub_legacy' }));

    const n = await drainAndAggregate(1000);

    expect(n).toBe(2);
    expect(rpopCalls[0]!.key).toBe(EVENT_QUEUE_STATS);
    expect(rpopCalls.some((c) => c.key === EVENT_QUEUE_LEGACY)).toBe(true);

    const day = '20260808';
    for (const pub of ['pub_stats', 'pub_legacy']) {
      const snap = await db.doc(`${COLLECTIONS.stats}/publishers/${pub}/${day}`).get();
      expect(snap.data()?.impressions).toBe(1);
    }
  });

  it('skips a malformed entry without losing the rest of the chunk', async () => {
    enqueue(EVENT_QUEUE_STATS, makeEvent(), '{not json', makeEvent());

    const n = await drainAndAggregate(1000);

    expect(n).toBe(2);
    const snap = await db.doc(`${COLLECTIONS.stats}/publishers/pub_a/20260808`).get();
    expect(snap.data()?.impressions).toBe(2);
  });

  // The short-read exit has to test the RAW chunk size, not the parsed one.
  // Testing the parsed size made one bad entry among 400 look identical to an
  // exhausted queue: the drain stopped after a single chunk and stranded 201
  // events, every hour, forever.
  it('keeps draining past a chunk that contained a malformed entry', async () => {
    enqueue(
      EVENT_QUEUE_STATS,
      ...Array.from({ length: 200 }, () => makeEvent()),
      '{not json',
      ...Array.from({ length: 199 }, () => makeEvent()),
    );

    const n = await drainAndAggregate(1000);

    expect(n).toBe(399);
    expect(queues.get(EVENT_QUEUE_STATS)?.length ?? 0).toBe(0);
  });

  // Worse still: a chunk of nothing but garbage parsed to zero events, which
  // read as "the queue is empty" and ended the entire run — leaving the good
  // events behind it untouched.
  it('does not mistake a chunk of pure garbage for an empty queue', async () => {
    // Enqueued head-first, popped tail-first — so the garbage listed last is
    // what the very first chunk hits.
    enqueue(
      EVENT_QUEUE_STATS,
      ...Array.from({ length: 300 }, () => makeEvent()),
      ...Array.from({ length: 200 }, () => '{not json'),
    );

    const run = await drainAndAggregateAll();

    expect(run.aggregated).toBe(300);
    expect(queues.get(EVENT_QUEUE_STATS)?.length ?? 0).toBe(0);
  });

  it('accepts entries the Upstash SDK already deserialized into objects', async () => {
    // rpop is typed as returning strings, but the SDK auto-parses JSON, so in
    // production the chunk can come back as objects.
    queues.set(EVENT_QUEUE_STATS, [makeEvent(), makeEvent()] as unknown as string[]);

    const n = await drainAndAggregate(1000);

    expect(n).toBe(2);
  });

  it('splits the write phase across several batched writes past the 500-op cap', async () => {
    // 200 distinct publishers × (campaign-hour + creative-hour + publisher-day
    // + publisher-slot-day) = 800 writes. Production Firestore rejects a
    // batched write over 500 ops with INVALID_ARGUMENT and loses the whole
    // run; the old drain was simply too slow to ever accumulate that much in
    // one pass, so speeding it up is what made the cap reachable. The emulator
    // does NOT enforce the cap, so counting the commits is the only way to
    // assert this here — and reading the docs back proves no bucket is dropped
    // where a commit boundary falls.
    const batchSpy = vi.spyOn(db, 'batch');
    const events = Array.from({ length: 200 }, (_, i) =>
      makeEvent({
        publisherId: `pub_${i}`,
        slotId: `slot_${i}`,
        campaignId: `cmp_${i}`,
        creativeId: `cre_${i}`,
      }),
    );
    enqueue(EVENT_QUEUE_STATS, ...events);

    const n = await drainAndAggregate(1000);

    expect(n).toBe(200);
    // Exactly two: 800 ops at a 450-op commit boundary. Asserting the number
    // rather than ">1" also rules out an implementation that commits per op.
    expect(batchSpy.mock.calls.length).toBe(2);
    batchSpy.mockRestore();

    const first = await db.doc(`${COLLECTIONS.stats}/publishers/pub_0/20260808`).get();
    const last = await db.doc(`${COLLECTIONS.stats}/publishers/pub_199/20260808`).get();
    expect(first.data()?.impressions).toBe(1);
    expect(last.data()?.impressions).toBe(1);
  });

  it('uses a single batched write when the run is small', async () => {
    const batchSpy = vi.spyOn(db, 'batch');
    enqueue(EVENT_QUEUE_STATS, makeEvent(), makeEvent());

    await drainAndAggregate(1000);

    expect(batchSpy.mock.calls.length).toBe(1);
    batchSpy.mockRestore();
  });
});

describe('drainAndAggregateAll', () => {
  beforeEach(async () => {
    await clearFirestoreEmulator();
    queues.clear();
    rpopCalls.length = 0;
  });

  it('keeps draining until the queues run dry', async () => {
    enqueue(EVENT_QUEUE_STATS, ...Array.from({ length: 3 }, () => makeEvent()));

    const run = await drainAndAggregateAll({ batchSize: 1 });

    expect(run.aggregated).toBe(3);
    expect(run.timedOut).toBe(false);
    expect(run.capped).toBe(false);
    // 3 batches of 1, plus the batch that found nothing left.
    expect(run.batches).toBe(4);
  });

  it('stops at maxBatches and says so, leaving the rest queued', async () => {
    enqueue(EVENT_QUEUE_STATS, ...Array.from({ length: 5 }, () => makeEvent()));

    const run = await drainAndAggregateAll({ batchSize: 1, maxBatches: 2 });

    // `capped` is what makes "ran out of batches with work left" different
    // from "the queue was empty" — both otherwise look like a clean run.
    expect(run).toEqual({ aggregated: 2, batches: 2, timedOut: false, capped: true });
    expect(queues.get(EVENT_QUEUE_STATS)?.length).toBe(3);
  });

  it('gives up on the clock rather than being killed mid-run', async () => {
    enqueue(EVENT_QUEUE_STATS, ...Array.from({ length: 5 }, () => makeEvent()));
    // now() is read once to set the deadline, then once per loop iteration.
    const readings = [0, 0, 5_000];
    let i = 0;
    const now = () => readings[Math.min(i++, readings.length - 1)]!;

    const run = await drainAndAggregateAll({ batchSize: 1, deadlineMs: 100, now });

    expect(run.timedOut).toBe(true);
    expect(run.capped).toBe(false);
    expect(run.aggregated).toBe(1);
    // The point of the deadline: the remainder waits for the next hour instead
    // of the run being terminated by the platform with no heartbeat recorded.
    expect(queues.get(EVENT_QUEUE_STATS)?.length).toBe(4);
  });

  it('reports an empty run without touching Firestore', async () => {
    const batchSpy = vi.spyOn(db, 'batch');

    const run = await drainAndAggregateAll();

    expect(run).toEqual({ aggregated: 0, batches: 1, timedOut: false, capped: false });
    expect(batchSpy).not.toHaveBeenCalled();
    batchSpy.mockRestore();
  });
});
