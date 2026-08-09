import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '../src/lib/firebase';
import { COLLECTIONS } from '@ada/shared/firestore';
import { clearFirestoreEmulator } from './helpers/emulator';

// This suite intentionally runs against the real Firestore emulator instead of
// a mocked `db`. A previous version mocked `batch.set` and hand-rolled dotted
// -key splitting inside the fake `commit()`, which manufactured merge
// semantics the real firebase-admin SDK does not have: `batch.set(ref, data,
// { merge: true })` does NOT split a key like "byPublisher.pub_a.impressions"
// into a nested path — only `update()` does that — so the dotted-key writes
// aggregateEvents used to produce were silently dead in production while the
// mocked test happily "passed". Reading the real documents back after a real
// commit is the only way this class of bug gets caught again.
//
// Firestore is real (the emulator); Redis is not — there is no Redis emulator
// wired into `--only firestore`, so the `recorded:{hour}` counter is verified
// against a tiny in-memory fake standing in for `getRedis()`.

const mockRedisCounters = new Map<string, number>();

vi.mock('../src/lib/redis', () => ({
  getRedis: () => ({
    pipeline: () => {
      const ops: Array<() => void> = [];
      const p = {
        incr: (key: string) => {
          ops.push(() => mockRedisCounters.set(key, (mockRedisCounters.get(key) ?? 0) + 1));
          return p;
        },
        expire: () => p,
        exec: async () => {
          for (const op of ops) op();
        },
      };
      return p;
    },
  }),
}));

import { aggregateEvents } from '../src/services/stats-aggregator';
import type { QueuedEvent } from '../src/services/stats-aggregator';

async function getDoc(path: string) {
  const snap = await db.doc(path).get();
  return snap.exists ? snap.data() : undefined;
}

async function redisGet(key: string): Promise<number | undefined> {
  return mockRedisCounters.get(key);
}

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

describe('aggregateEvents', () => {
  beforeEach(async () => {
    await clearFirestoreEmulator();
    mockRedisCounters.clear();
  });

  it('groups impressions and clicks into hourly/daily buckets per campaign, publisher, slot and creative', async () => {
    const ts = Date.UTC(2026, 5, 2, 14, 30, 0); // 2026-06-02 14:30:00 UTC
    const events: QueuedEvent[] = [
      {
        type: 'impression',
        campaignId: 'cmp_a',
        publisherId: 'pub_a',
        creativeId: 'cre_a',
        slotId: 's1',
        advertiserId: 'adv_a',
        country: 'IS',
        visitorToken: 'v1',
        ts,
      },
      {
        type: 'impression',
        campaignId: 'cmp_a',
        publisherId: 'pub_a',
        creativeId: 'cre_a',
        slotId: 's1',
        advertiserId: 'adv_a',
        country: 'IS',
        visitorToken: 'v2',
        ts: ts + 1000,
      },
      {
        type: 'click',
        campaignId: 'cmp_a',
        publisherId: 'pub_a',
        creativeId: 'cre_a',
        slotId: 's1',
        advertiserId: 'adv_a',
        country: 'IS',
        visitorToken: 'v1',
        ts: ts + 2000,
      },
    ];
    await aggregateEvents(events);

    // Campaign hourly stats
    const cmpDoc = await getDoc(`${COLLECTIONS.stats}/campaigns/cmp_a/2026060214`);
    expect(cmpDoc).toBeDefined();
    expect(cmpDoc!.impressions).toBe(2);
    expect(cmpDoc!.clicks).toBe(1);
    expect(cmpDoc!.spendIsk).toBe(1); // Math.round((2 / 1000) * 550) = 1 ISK
    expect(cmpDoc!.byPublisher).toBeDefined();
    expect(cmpDoc!.byPublisher.pub_a).toBeDefined();
    expect(cmpDoc!.byPublisher.pub_a.impressions).toBe(2);
    expect(cmpDoc!.byPublisher.pub_a.clicks).toBe(1);
    expect(cmpDoc!.byPublisher.pub_a.spendIsk).toBe(1);

    // Publisher daily stats
    const pubDoc = await getDoc(`${COLLECTIONS.stats}/publishers/pub_a/20260602`);
    expect(pubDoc).toBeDefined();
    expect(pubDoc!.impressions).toBe(2);
    expect(pubDoc!.clicks).toBe(1);
    expect(pubDoc!.byCampaign).toBeDefined();
    expect(pubDoc!.byCampaign.cmp_a).toBeDefined();
    expect(pubDoc!.byCampaign.cmp_a.impressions).toBe(2);
    expect(pubDoc!.byCampaign.cmp_a.clicks).toBe(1);

    // Publisher slot daily stats
    const slotDoc = await getDoc(`${COLLECTIONS.stats}/publisher_slots/pub_a_s1/20260602`);
    expect(slotDoc).toBeDefined();
    expect(slotDoc!.impressions).toBe(2);
    expect(slotDoc!.clicks).toBe(1);
    expect(slotDoc!.byCampaign).toBeDefined();
    expect(slotDoc!.byCampaign.cmp_a).toBeDefined();
    expect(slotDoc!.byCampaign.cmp_a.impressions).toBe(2);
    expect(slotDoc!.byCampaign.cmp_a.clicks).toBe(1);

    // Creative hourly stats
    const creDoc = await getDoc(`${COLLECTIONS.stats}/creatives/cre_a/2026060214`);
    expect(creDoc).toBeDefined();
    expect(creDoc!.impressions).toBe(2);
    expect(creDoc!.clicks).toBe(1);
  });

  it('groups slot loads into hourly pageviews buckets for fallback creatives', async () => {
    const ts = Date.UTC(2026, 5, 2, 14, 30, 0); // 2026-06-02 14:30:00 UTC
    const events: QueuedEvent[] = [
      {
        type: 'slot_load',
        campaignId: 'cmp_fallback',
        publisherId: 'pub_a',
        creativeId: 'cre_fallback_birtingur',
        slotId: 's1',
        advertiserId: '',
        country: 'IS',
        visitorToken: 'v1',
        ts,
      },
    ];
    await aggregateEvents(events);

    const creDoc = await getDoc(`${COLLECTIONS.stats}/creatives/cre_fallback_birtingur/2026060214`);
    expect(creDoc).toBeDefined();
    expect(creDoc!.pageviews).toBe(1);
  });

  it("cmp_fallback click events do not create byCampaign entries on publisher-day docs and never pollute a real campaign's stats", async () => {
    const ts = Date.UTC(2026, 5, 2, 14, 30, 0);
    const events: QueuedEvent[] = [
      // A real campaign's impression, sharing the same publisher/slot/hour as
      // the fallback click below — proves the two don't bleed into each other.
      {
        type: 'impression',
        campaignId: 'cmp_real',
        publisherId: 'pub_a',
        creativeId: 'cre_real',
        slotId: 's1',
        advertiserId: 'adv_a',
        country: 'IS',
        visitorToken: 'v1',
        ts,
      },
      {
        type: 'click',
        campaignId: 'cmp_fallback',
        publisherId: 'pub_a',
        creativeId: 'cre_fallback_birtingur',
        slotId: 's1',
        advertiserId: '',
        country: 'IS',
        visitorToken: 'v1',
        ts,
      },
    ];
    await aggregateEvents(events);

    const pubDoc = await getDoc(`${COLLECTIONS.stats}/publishers/pub_a/20260602`);
    expect(pubDoc).toBeDefined();
    // Fallback clicks must not inflate publisher click totals or create a
    // byCampaign entry (they'd otherwise produce CTR > 100% on pageview-only
    // impressions).
    expect(pubDoc!.clicks ?? 0).toBe(0);
    expect(pubDoc!.byCampaign?.cmp_fallback).toBeUndefined();
    expect(pubDoc!.byCampaign?.cmp_real).toEqual({ impressions: 1, clicks: 0 });

    const slotDoc = await getDoc(`${COLLECTIONS.stats}/publisher_slots/pub_a_s1/20260602`);
    expect(slotDoc!.clicks ?? 0).toBe(0);
    expect(slotDoc!.byCampaign?.cmp_fallback).toBeUndefined();
    expect(slotDoc!.byCampaign?.cmp_real).toEqual({ impressions: 1, clicks: 0 });

    // The real campaign's own hour doc must not pick up the fallback click.
    const realCampaignDoc = await getDoc(`${COLLECTIONS.stats}/campaigns/cmp_real/2026060214`);
    expect(realCampaignDoc!.impressions).toBe(1);
    expect(realCampaignDoc!.clicks ?? 0).toBe(0);
  });

  describe('byPublisherCreative', () => {
    it('nests impressions and clicks per publisher per creative on the campaign hour doc', async () => {
      await aggregateEvents([
        makeEvent(),
        makeEvent(),
        makeEvent({ creativeId: 'cre_2' }),
        makeEvent({ publisherId: 'pub_b' }),
        makeEvent({ type: 'click', creativeId: 'cre_2' }),
      ]);

      const doc = await getDoc(`${COLLECTIONS.stats}/campaigns/cmp_1/2026080812`);
      expect(doc!.byPublisherCreative).toEqual({
        pub_a: {
          cre_1: { impressions: 2, clicks: 0 },
          cre_2: { impressions: 1, clicks: 1 },
        },
        pub_b: {
          cre_1: { impressions: 1, clicks: 0 },
        },
      });
      // existing per-publisher totals unchanged
      expect(doc!.byPublisher.pub_a.impressions).toBe(3);
    });

    it('increments across separate batches instead of overwriting', async () => {
      await aggregateEvents([makeEvent()]);
      await aggregateEvents([makeEvent()]);
      const doc = await getDoc(`${COLLECTIONS.stats}/campaigns/cmp_1/2026080812`);
      expect(doc!.byPublisherCreative.pub_a.cre_1.impressions).toBe(2);
    });

    it('skips events with an empty creativeId', async () => {
      await aggregateEvents([makeEvent({ creativeId: '' })]);
      const doc = await getDoc(`${COLLECTIONS.stats}/campaigns/cmp_1/2026080812`);
      expect(doc!.byPublisherCreative).toBeUndefined();
      expect(doc!.byPublisher.pub_a.impressions).toBe(1);
    });
  });

  describe('slot_load vs pageview', () => {
    // makeEvent()'s default ts is Date.UTC(2026, 7, 8, 12, 30, 0) => day 20260808.
    const DAY = '20260808';

    it('counts slot_load into pageviews and pageview into pageViewsTrue', async () => {
      await aggregateEvents([
        makeEvent({ type: 'slot_load' }),
        makeEvent({ type: 'slot_load' }),
        makeEvent({ type: 'pageview' }),
      ]);
      const doc = (await db.doc(`${COLLECTIONS.stats}/publishers/pub_a/${DAY}`).get()).data()!;
      expect(doc.pageviews).toBe(2); // slot loads — fill-rate denominator
      expect(doc.pageViewsTrue).toBe(1); // real page views
      // Guard against the 2026-08-08 dot-path bug: `pageViewsTrue` must be its own real
      // field key on the document, not a literal string "byPublisher.pub_a.pageViewsTrue"
      // (or similar) that `batch.set(..., { merge: true })` would have failed to split.
      expect(Object.keys(doc)).toContain('pageViewsTrue');
      expect(Object.keys(doc).some((k) => k.includes('.'))).toBe(false);

      const slotDoc = (
        await db.doc(`${COLLECTIONS.stats}/publisher_slots/pub_a_slot_1/${DAY}`).get()
      ).data()!;
      expect(slotDoc.pageviews).toBe(2);
      expect(slotDoc.pageViewsTrue).toBe(1);
    });

    it('increments the recorded counter per event, bucketed by event hour', async () => {
      await aggregateEvents([
        makeEvent({ type: 'pageview', ts: Date.UTC(2026, 7, 9, 13, 5) }),
        makeEvent({ type: 'pageview', ts: Date.UTC(2026, 7, 9, 13, 55) }),
      ]);
      expect(await redisGet('recorded:2026080913')).toBe(2);
    });

    it('increments the recorded counter for every event type, not just pageview', async () => {
      await aggregateEvents([
        makeEvent({ type: 'impression', ts: Date.UTC(2026, 7, 9, 13, 5) }),
        makeEvent({ type: 'slot_load', ts: Date.UTC(2026, 7, 9, 13, 6) }),
      ]);
      expect(await redisGet('recorded:2026080913')).toBe(2);
    });

    it('leaves pageViewsTrue absent for a day that saw only slot loads', async () => {
      await aggregateEvents([makeEvent({ type: 'slot_load' })]);
      const doc = (await db.doc(`${COLLECTIONS.stats}/publishers/pub_a/${DAY}`).get()).data()!;
      expect(doc.pageviews).toBe(1);
      expect(doc.pageViewsTrue).toBeUndefined();

      const slotDoc = (
        await db.doc(`${COLLECTIONS.stats}/publisher_slots/pub_a_slot_1/${DAY}`).get()
      ).data()!;
      expect(slotDoc.pageViewsTrue).toBeUndefined();
    });

    it('treats slot_load exactly like the old pageview branch for creative-hour bookkeeping', async () => {
      await aggregateEvents([makeEvent({ type: 'slot_load' })]);
      const creDoc = (
        await db.doc(`${COLLECTIONS.stats}/creatives/cre_1/2026080812`).get()
      ).data()!;
      expect(creDoc.pageviews).toBe(1);
    });
  });
});
