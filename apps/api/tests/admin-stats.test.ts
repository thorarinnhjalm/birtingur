import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/lib/firebase';
import { COLLECTIONS } from '@ada/shared/firestore';
import { clearFirestoreEmulator } from './helpers/emulator';
import { getAdminStats } from '../src/services/admin-stats';

// Runs against the real Firestore emulator (not a mocked `db`) — same
// reasoning as tests/stats-aggregator.test.ts: `getAdminStats` reads real
// publisher-day documents at `stats/publishers/{id}/{YYYYMMDD}`, and this
// suite exists specifically to prove the aggregation reads those documents
// correctly, not to prove a hand-rolled mock's assumptions about them.

function dateKeyDaysAgo(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split('T')[0]!.replace(/-/g, '');
}

async function seedPublisher(id: string, status: 'active' | 'suspended' = 'active') {
  await db
    .collection(COLLECTIONS.publishers)
    .doc(id)
    .set({ id, status, categories: ['matur'] });
}

async function seedPublisherDayDoc(
  publisherId: string,
  daysAgo: number,
  data: Record<string, unknown>,
) {
  const dk = dateKeyDaysAgo(daysAgo);
  await db.doc(`${COLLECTIONS.stats}/publishers/${publisherId}/${dk}`).set(data);
}

describe('getAdminStats — botTraffic summary', () => {
  beforeEach(async () => {
    await clearFirestoreEmulator();
  });

  it('sums byBotClass across publishers and days, and computes the unclassified remainder', async () => {
    await seedPublisher('pub_a');
    await seedPublisher('pub_b');

    // pub_a, 1 day ago: 100 billed impressions, 40 real page views. 60 of the
    // impressions and 30 of the page views are classified; the rest is the
    // honest unclassified remainder (pre-classifier events on the same day).
    await seedPublisherDayDoc('pub_a', 1, {
      impressions: 100,
      pageViewsTrue: 40,
      byBotClass: {
        human: { impressions: 50, pageViewsTrue: 25 },
        known_bot: { impressions: 10, pageViewsTrue: 5 },
      },
    });

    // pub_b, 2 days ago: 50 billed impressions, 10 real page views, all
    // classified as suspected_bot.
    await seedPublisherDayDoc('pub_b', 2, {
      impressions: 50,
      pageViewsTrue: 10,
      byBotClass: {
        suspected_bot: { impressions: 50, pageViewsTrue: 10 },
      },
    });

    // Outside the 7-day window (10 days ago) — must NOT be counted.
    await seedPublisherDayDoc('pub_a', 10, {
      impressions: 9999,
      pageViewsTrue: 9999,
      byBotClass: { human: { impressions: 9999, pageViewsTrue: 9999 } },
    });

    const stats = await getAdminStats();

    expect(stats.botTraffic).toBeDefined();
    expect(stats.botTraffic).not.toBeNull();
    const bt = stats.botTraffic!;
    expect(bt.windowDays).toBe(7);

    // impressions: human 50, known_bot 10, suspected_bot 50 → classified 110;
    // total 150 → unclassified 40.
    expect(bt.impressions.human).toBe(50);
    expect(bt.impressions.known_bot).toBe(10);
    expect(bt.impressions.suspected_bot).toBe(50);
    expect(bt.impressions.unclassified).toBe(40);

    // pageViews: human 25, known_bot 5, suspected_bot 10 → classified 40;
    // total 50 → unclassified 10.
    expect(bt.pageViews.human).toBe(25);
    expect(bt.pageViews.known_bot).toBe(5);
    expect(bt.pageViews.suspected_bot).toBe(10);
    expect(bt.pageViews.unclassified).toBe(10);
  });

  it('returns null when no document in the window carries byBotClass at all', async () => {
    await seedPublisher('pub_a');

    // Pre-classifier-deploy data: totals exist, but no byBotClass field at
    // all on any document in the window.
    await seedPublisherDayDoc('pub_a', 1, { impressions: 500, pageViewsTrue: 120 });
    await seedPublisherDayDoc('pub_a', 3, { impressions: 300 });

    const stats = await getAdminStats();

    expect(stats.botTraffic).toBeNull();
  });

  it('ignores publisher-day documents belonging to non-active publishers', async () => {
    await seedPublisher('pub_suspended', 'suspended');
    await seedPublisherDayDoc('pub_suspended', 1, {
      impressions: 1000,
      pageViewsTrue: 1000,
      byBotClass: { human: { impressions: 1000, pageViewsTrue: 1000 } },
    });

    const stats = await getAdminStats();

    expect(stats.botTraffic).toBeNull();
  });
});
