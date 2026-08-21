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
// Flips the recorded-counter pipeline into failure for the post-commit test below.
let mockCounterPipelineFails = false;

vi.mock('../src/lib/redis', () => ({
  // stats-aggregator imports ops-alerts (for the drain loop's alerts), which reads
  // this — the aggregateEvents paths below never reach it.
  isRedisConfigured: () => true,
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
          if (mockCounterPipelineFails) throw new Error('redis unavailable');
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
    mockCounterPipelineFails = false;
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
    // Mirrors serving's PAGEVIEW_CREATIVE_ID / the aggregator's TRUE_PAGEVIEW_CREATIVE_ID:
    // the marker that distinguishes a genuine page-level pageview event from a
    // 'pageview' event that actually means a slot load (apps/serving emits both
    // shapes with the SAME wire type — see TRUE_PAGEVIEW_CREATIVE_ID in
    // stats-aggregator.ts for why that's deliberate, not legacy).
    const TRUE_PAGEVIEW_CREATIVE_ID = 'pageview';

    describe('unfilled — the slot loads that got no advertiser', () => {
      /**
       * `pageviews` counts every ad request and `impressions` counts the ones
       * that became visible, so the gap between them mixes two unrelated
       * failures: nobody bid on the publisher's categories, versus the ad
       * loaded but the reader never scrolled to it. Impressions are
       * viewability-gated (packages/snippet/src/render.ts), so both land in the
       * same shortfall.
       *
       * They call for opposite responses — the first is ours to fix by finding
       * advertisers, the second is the publisher's by moving the slot up the
       * page — so a dashboard that shows one number cannot tell anyone what to
       * do. `unfilled` splits it: a slot load that served a house ad or a
       * transparent placeholder had no advertiser behind it.
       *
       * The counter is written ONLY when non-zero, exactly like pageViewsTrue,
       * so days that predate it keep the field absent and the dashboard can
       * show "not measured" instead of a false zero.
       */
      const HOUSE = 'cre_fallback_birtingur';
      const TRANSPARENT = 'cre_fallback_transparent';
      const NOCACHE = 'cre_nocache';

      it('counts a house-ad slot load as unfilled, and a real one as filled', async () => {
        await aggregateEvents([
          makeEvent({ type: 'pageview', creativeId: 'cre_real' }),
          makeEvent({ type: 'pageview', creativeId: HOUSE }),
          makeEvent({ type: 'pageview', creativeId: HOUSE }),
        ]);
        const doc = (await db.doc(`${COLLECTIONS.stats}/publishers/pub_a/${DAY}`).get()).data()!;
        expect(doc.pageviews).toBe(3); // every ad request
        expect(doc.unfilled).toBe(2); // of which two got no advertiser
      });

      it('counts the transparent placeholder and a cold cache as unfilled too', async () => {
        // Both mean the same thing to a publisher: the slot loaded and no
        // advertisement came back. cre_nocache is our own cache miss rather
        // than an absent advertiser, but it is still a request that earned
        // nothing, and lumping it in with "filled" would overstate fill.
        await aggregateEvents([
          makeEvent({ type: 'pageview', creativeId: TRANSPARENT }),
          makeEvent({ type: 'pageview', creativeId: NOCACHE }),
        ]);
        const doc = (await db.doc(`${COLLECTIONS.stats}/publishers/pub_a/${DAY}`).get()).data()!;
        expect(doc.unfilled).toBe(2);
      });

      it('tracks unfilled per slot as well, so a single bad placement is findable', async () => {
        await aggregateEvents([
          makeEvent({ type: 'pageview', creativeId: HOUSE, slotId: 'slot_bad' }),
          makeEvent({ type: 'pageview', creativeId: HOUSE, slotId: 'slot_bad' }),
          makeEvent({ type: 'pageview', creativeId: 'cre_real', slotId: 'slot_good' }),
        ]);
        const bad = (
          await db.doc(`${COLLECTIONS.stats}/publisher_slots/pub_a_slot_bad/${DAY}`).get()
        ).data()!;
        const good = (
          await db.doc(`${COLLECTIONS.stats}/publisher_slots/pub_a_slot_good/${DAY}`).get()
        ).data()!;
        expect(bad.unfilled).toBe(2);
        expect(good.unfilled).toBeUndefined();
      });

      it('leaves the field absent for a day where everything filled', async () => {
        // Absent, never 0 — same contract as pageViewsTrue. A day predating
        // this counter must be distinguishable from a day with perfect fill.
        await aggregateEvents([makeEvent({ type: 'pageview', creativeId: 'cre_real' })]);
        const doc = (await db.doc(`${COLLECTIONS.stats}/publishers/pub_a/${DAY}`).get()).data()!;
        expect(doc.pageviews).toBe(1);
        expect(Object.keys(doc)).not.toContain('unfilled');
      });

      it('does not count a true page view as an unfilled request', async () => {
        // A true page view is not an ad request at all, so it belongs to
        // neither side of the fill ratio.
        await aggregateEvents([
          makeEvent({ type: 'pageview', creativeId: TRUE_PAGEVIEW_CREATIVE_ID }),
        ]);
        const doc = (await db.doc(`${COLLECTIONS.stats}/publishers/pub_a/${DAY}`).get()).data()!;
        expect(doc.pageViewsTrue).toBe(1);
        // `pageviews` is written unconditionally, so it lands as 0 rather than
        // absent. `unfilled` is not: absent is what distinguishes a day before
        // this counter existed from a day where everything filled.
        expect(doc.pageviews).toBe(0);
        expect(Object.keys(doc)).not.toContain('unfilled');
      });

      it('increments across batches instead of overwriting', async () => {
        await aggregateEvents([makeEvent({ type: 'pageview', creativeId: HOUSE })]);
        await aggregateEvents([makeEvent({ type: 'pageview', creativeId: HOUSE })]);
        const doc = (await db.doc(`${COLLECTIONS.stats}/publishers/pub_a/${DAY}`).get()).data()!;
        expect(doc.unfilled).toBe(2);
      });

      it('writes unfilled as a real field, not a dotted key', async () => {
        await aggregateEvents([makeEvent({ type: 'pageview', creativeId: HOUSE })]);
        const doc = (await db.doc(`${COLLECTIONS.stats}/publishers/pub_a/${DAY}`).get()).data()!;
        expect(Object.keys(doc)).toContain('unfilled');
        expect(Object.keys(doc).some((k) => k.includes('.'))).toBe(false);
      });
    });

    it('counts slot_load into pageviews and pageview into pageViewsTrue', async () => {
      await aggregateEvents([
        makeEvent({ type: 'slot_load' }),
        makeEvent({ type: 'slot_load' }),
        makeEvent({ type: 'pageview', creativeId: TRUE_PAGEVIEW_CREATIVE_ID }),
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
        makeEvent({
          type: 'pageview',
          creativeId: TRUE_PAGEVIEW_CREATIVE_ID,
          ts: Date.UTC(2026, 7, 9, 13, 5),
        }),
        makeEvent({
          type: 'pageview',
          creativeId: TRUE_PAGEVIEW_CREATIVE_ID,
          ts: Date.UTC(2026, 7, 9, 13, 55),
        }),
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

    describe('pageview wire-type marker (creativeId discriminates slot load vs true page view)', () => {
      // This is the primary contract, not a compatibility shim: apps/serving
      // deliberately emits every slot load with wire type 'pageview' (see
      // AdEvent.type in apps/serving/src/lib/analytics.ts) rather than a
      // distinct type, so apps/serving and apps/api — separate Vercel projects
      // that redeploy simultaneously on one push — stay correct regardless of
      // which one goes live first.
      it('a true pageview (creativeId: TRUE_PAGEVIEW_CREATIVE_ID) increments pageViewsTrue and not pageviews', async () => {
        await aggregateEvents([
          makeEvent({ type: 'pageview', creativeId: TRUE_PAGEVIEW_CREATIVE_ID }),
        ]);
        const doc = (await db.doc(`${COLLECTIONS.stats}/publishers/pub_a/${DAY}`).get()).data()!;
        expect(doc.pageViewsTrue).toBe(1);
        expect(doc.pageviews ?? 0).toBe(0);
      });

      it('a slot-load-shaped pageview (real creativeId) increments pageviews and leaves pageViewsTrue absent', async () => {
        await aggregateEvents([makeEvent({ type: 'pageview', creativeId: 'cre_abc' })]);
        const doc = (await db.doc(`${COLLECTIONS.stats}/publishers/pub_a/${DAY}`).get()).data()!;
        expect(doc.pageviews).toBe(1);
        expect(doc.pageViewsTrue).toBeUndefined();

        // A slot-load-shaped 'pageview' event also carries creative-hour
        // bookkeeping, same as an explicit 'slot_load' event does.
        const creDoc = (
          await db.doc(`${COLLECTIONS.stats}/creatives/cre_abc/2026080812`).get()
        ).data()!;
        expect(creDoc.pageviews).toBe(1);
      });

      it('a mixed batch of true and slot-load-shaped pageviews lands in the right buckets', async () => {
        await aggregateEvents([
          makeEvent({ type: 'pageview', creativeId: TRUE_PAGEVIEW_CREATIVE_ID }),
          makeEvent({ type: 'pageview', creativeId: TRUE_PAGEVIEW_CREATIVE_ID }),
          makeEvent({ type: 'pageview', creativeId: 'cre_abc' }),
          makeEvent({ type: 'pageview', creativeId: 'cre_fallback_birtingur' }),
        ]);
        const doc = (await db.doc(`${COLLECTIONS.stats}/publishers/pub_a/${DAY}`).get()).data()!;
        expect(doc.pageViewsTrue).toBe(2); // the two true pageviews
        expect(doc.pageviews).toBe(2); // the two slot-load-shaped pageviews
      });
    });
  });

  describe('byCountry', () => {
    // makeEvent()'s default ts is Date.UTC(2026, 7, 8, 12, 30, 0) => day 20260808.
    const DAY = '20260808';
    const TRUE_PAGEVIEW_CREATIVE_ID = 'pageview';

    it('counts TRUE page views per country, never impressions or clicks', async () => {
      await aggregateEvents([
        makeEvent({ type: 'pageview', creativeId: TRUE_PAGEVIEW_CREATIVE_ID, country: 'IS' }),
        makeEvent({ type: 'pageview', creativeId: TRUE_PAGEVIEW_CREATIVE_ID, country: 'IS' }),
        makeEvent({ type: 'pageview', creativeId: TRUE_PAGEVIEW_CREATIVE_ID, country: 'DK' }),
        // Unknown country is its own bucket — dropping it would make the
        // listed countries falsely claim to sum to the total.
        makeEvent({ type: 'pageview', creativeId: TRUE_PAGEVIEW_CREATIVE_ID, country: 'XX' }),
        // An impression from Iceland must NOT count as a reader: an ad seen
        // three times is one person.
        makeEvent({ type: 'impression', country: 'IS' }),
        // A slot-load-shaped pageview (non-marker creativeId) is a request,
        // not a reader.
        makeEvent({ type: 'pageview', creativeId: 'cre_abc', country: 'IS' }),
      ]);
      const doc = (await db.doc(`${COLLECTIONS.stats}/publishers/pub_a/${DAY}`).get()).data()!;
      expect(doc.byCountry).toEqual({ IS: 2, DK: 1, XX: 1 });
    });

    it('leaves byCountry absent when no true page view arrived', async () => {
      await aggregateEvents([
        makeEvent({ type: 'impression', country: 'IS' }),
        makeEvent({ type: 'click', country: 'IS' }),
      ]);
      const doc = (await db.doc(`${COLLECTIONS.stats}/publishers/pub_a/${DAY}`).get()).data()!;
      expect(doc.byCountry).toBeUndefined();
    });
  });

  describe('byBotClass', () => {
    // makeEvent()'s default ts is Date.UTC(2026, 7, 8, 12, 30, 0) => day 20260808,
    // hour 2026080812.
    const DAY = '20260808';
    const HOUR = '2026080812';
    const TRUE_PAGEVIEW_CREATIVE_ID = 'pageview';

    it('counts impressions and true page views per bot class', async () => {
      await aggregateEvents([
        makeEvent({ type: 'impression', botClass: 'human' }),
        makeEvent({ type: 'impression', botClass: 'human' }),
        makeEvent({ type: 'impression', botClass: 'known_bot' }),
        makeEvent({
          type: 'pageview',
          creativeId: TRUE_PAGEVIEW_CREATIVE_ID,
          botClass: 'suspected_bot',
        }),
      ]);
      const doc = (await db.doc(`${COLLECTIONS.stats}/publishers/pub_a/${DAY}`).get()).data()!;
      expect(doc.byBotClass.human.impressions).toBe(2);
      expect(doc.byBotClass.known_bot.impressions).toBe(1);
      expect(doc.byBotClass.suspected_bot.pageViewsTrue).toBe(1);

      const cmpDoc = (await db.doc(`${COLLECTIONS.stats}/campaigns/cmp_1/${HOUR}`).get()).data()!;
      expect(cmpDoc.byBotClass.human.impressions).toBe(2);
      expect(cmpDoc.byBotClass.known_bot.impressions).toBe(1);
      // The true page view never touches the campaign-hour bucket at all — it
      // carries no campaign fill, so no botClass entry should appear here for it.
      expect(cmpDoc.byBotClass.suspected_bot).toBeUndefined();
    });

    it('leaves totals byte-for-byte unchanged by the addition', async () => {
      const withoutBotClass: QueuedEvent[] = [
        makeEvent({ publisherId: 'pub_x', type: 'impression' }),
        makeEvent({ publisherId: 'pub_x', type: 'impression' }),
        makeEvent({ publisherId: 'pub_x', type: 'click' }),
        makeEvent({
          publisherId: 'pub_x',
          type: 'pageview',
          creativeId: TRUE_PAGEVIEW_CREATIVE_ID,
        }),
      ];
      const withBotClass: QueuedEvent[] = withoutBotClass.map((ev) => ({
        ...ev,
        publisherId: 'pub_y',
        botClass: 'human',
      }));

      await aggregateEvents(withoutBotClass);
      await aggregateEvents(withBotClass);

      const docWithout = (
        await db.doc(`${COLLECTIONS.stats}/publishers/pub_x/${DAY}`).get()
      ).data()!;
      const docWith = (await db.doc(`${COLLECTIONS.stats}/publishers/pub_y/${DAY}`).get()).data()!;

      const { byBotClass: _omit, ...docWithTotalsOnly } = docWith;
      expect(docWithTotalsOnly).toEqual(docWithout);
      expect(docWith.byBotClass).toBeDefined();
    });

    it('counts an event with NO botClass in no class at all (unclassified, not human)', async () => {
      await aggregateEvents([makeEvent({ type: 'impression' })]); // legacy in-flight shape
      const doc = (await db.doc(`${COLLECTIONS.stats}/publishers/pub_a/${DAY}`).get()).data()!;
      expect(doc.impressions).toBe(1);
      expect(doc.byBotClass?.human).toBeUndefined();
      expect(doc.byBotClass).toBeUndefined();
    });

    it('writes byBotClass as a real nested map, not literal dotted keys', async () => {
      await aggregateEvents([makeEvent({ type: 'impression', botClass: 'human' })]);
      const doc = (await db.doc(`${COLLECTIONS.stats}/publishers/pub_a/${DAY}`).get()).data()!;
      expect(Object.keys(doc)).toContain('byBotClass');
      expect(Object.keys(doc).some((k) => k.includes('.'))).toBe(false);
      expect(Object.keys(doc.byBotClass)).toEqual(['human']);
      expect(Object.keys(doc.byBotClass.human).some((k) => k.includes('.'))).toBe(false);
      expect(doc.byBotClass.human.impressions).toBe(1);
    });
  });

  describe('unrecognized event types (CRITICAL-1 hardening)', () => {
    // Regression pin for the exact deploy-order hazard this fix wave closes:
    // main's old aggregator classified events as
    // `if (pageview) {...} else { if (impression) impressions++ else clicks++ }`,
    // so ANY event type it didn't special-case fell through and was counted as
    // a click. The current aggregator must instead skip an unrecognized type
    // outright rather than silently miscounting it.
    it('does not count an unrecognized event type as a click', async () => {
      await aggregateEvents([
        // @ts-expect-error deliberately outside the QueuedEvent union
        makeEvent({ type: 'something_new' }),
      ]);
      const doc = await getDoc(`${COLLECTIONS.stats}/publishers/pub_a/20260808`);
      // Nothing should have been written at all for a batch containing only an
      // unrecognized event.
      expect(doc).toBeUndefined();
    });

    it('still counts the recognized events in a batch that also contains an unrecognized type', async () => {
      await aggregateEvents([
        makeEvent({ type: 'click' }),
        // @ts-expect-error deliberately outside the QueuedEvent union
        makeEvent({ type: 'something_new' }),
      ]);
      const doc = await getDoc(`${COLLECTIONS.stats}/campaigns/cmp_1/2026080812`);
      expect(doc!.clicks).toBe(1);
      expect(doc!.impressions ?? 0).toBe(0);
    });
  });

  describe('post-commit steps must not throw', () => {
    // This is what makes the drain loop's re-queue safe (see drainStatsBatch):
    // "aggregateEvents threw" has to mean "nothing was committed". The
    // recorded:{hour} counters run AFTER the atomic batch commit, so if a Redis
    // blip there escaped the function, the caller would push those events back
    // onto the queue and every increment above would be applied a second time.
    it('swallows a recorded-counter failure after the stats batch has committed', async () => {
      mockCounterPipelineFails = true;

      await expect(aggregateEvents([makeEvent()])).resolves.toBeUndefined();

      // The Firestore write still landed — the failure was strictly post-commit.
      const doc = await getDoc(`${COLLECTIONS.stats}/campaigns/cmp_1/2026080812`);
      expect(doc!.impressions).toBe(1);
    });
  });
});
