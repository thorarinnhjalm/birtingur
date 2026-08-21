import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/lib/firebase';
import { COLLECTIONS } from '@ada/shared/firestore';
import { clearFirestoreEmulator } from './helpers/emulator';
import { getPublisherStats, getAggregatedPublisherStats } from '../src/services/publisher-stats';

/**
 * The Umferð screen's human/automated split, read out of the publisher-day
 * docs the aggregator already writes.
 *
 * The stored shape is a trap the response mapping exists to defuse: the field
 * is `byBotClass`, keyed by the RAW event strings 'human' | 'known_bot' |
 * 'suspected_bot' (apps/serving/src/lib/bot-class.ts), and each class holds an
 * OBJECT { impressions?, pageViewsTrue? }. A naive `byBotClass.knownBot` read
 * is permanently undefined — and because the whole contract is absent-not-zero,
 * that bug renders as "unmeasured" forever with no error anywhere. These tests
 * pin the snake_case→camelCase mapping and the pageViewsTrue sub-field read so
 * neither can regress silently.
 *
 * The split has NO billing effect (accrual never reads bot class), and the
 * known-bot list is deliberately a floor, never a total — copy built on these
 * numbers must say so, but that is the dashboard's contract, not this one.
 */

function dayKey(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split('T')[0]!.replace(/-/g, '');
}

async function seedDay(
  publisherId: string,
  daysAgo: number,
  data: Record<string, unknown>,
): Promise<void> {
  await db.doc(`${COLLECTIONS.stats}/publishers/${publisherId}/${dayKey(daysAgo)}`).set(data);
}

describe('getPublisherStats — bot-class page-view rollup', () => {
  beforeEach(async () => {
    await clearFirestoreEmulator();
  });

  it('maps the stored snake_case object shape onto the camelCase rollup', async () => {
    await seedDay('pub_x', 1, {
      impressions: 80,
      clicks: 2,
      pageviews: 100,
      pageViewsTrue: 90,
      byBotClass: {
        human: { pageViewsTrue: 70, impressions: 60 },
        known_bot: { pageViewsTrue: 12 },
        suspected_bot: { pageViewsTrue: 3 },
      },
    });
    await seedDay('pub_x', 2, {
      impressions: 40,
      clicks: 1,
      pageviews: 50,
      pageViewsTrue: 40,
      byBotClass: { human: { pageViewsTrue: 30 }, known_bot: { pageViewsTrue: 5 } },
    });

    const stats = await getPublisherStats('pub_x', 7);

    expect(stats.botClass).toEqual({ human: 100, knownBot: 17, suspectedBot: 3 });
    // The unclassified remainder stays implicit: pageViewsTrue − Σ classes.
    expect(stats.pageViewsTrue).toBe(130);
  });

  it('reads the pageViewsTrue sub-field, never the class object itself', async () => {
    // A class entry with ONLY impressions measured must not surface as a
    // page-view count — that would count billed ads as readers.
    await seedDay('pub_x', 1, {
      impressions: 80,
      clicks: 0,
      pageviews: 100,
      pageViewsTrue: 90,
      byBotClass: { human: { impressions: 60 } },
    });

    const stats = await getPublisherStats('pub_x', 7);

    expect(stats.botClass).toBeUndefined();
  });

  it('stays absent — never zeroed — when no day carries byBotClass', async () => {
    await seedDay('pub_x', 1, { impressions: 80, clicks: 2, pageviews: 100, pageViewsTrue: 90 });

    const stats = await getPublisherStats('pub_x', 7);

    expect(stats.botClass).toBeUndefined();
  });

  it('aggregates across sites and carries per-site rollups on bySite', async () => {
    await seedDay('pub_a', 1, {
      impressions: 80,
      clicks: 2,
      pageviews: 100,
      pageViewsTrue: 90,
      byBotClass: { human: { pageViewsTrue: 80 }, known_bot: { pageViewsTrue: 10 } },
    });
    await seedDay('pub_b', 1, {
      impressions: 40,
      clicks: 1,
      pageviews: 50,
      pageViewsTrue: 40,
      byBotClass: { human: { pageViewsTrue: 35 } },
    });

    const stats = await getAggregatedPublisherStats(
      [
        { id: 'pub_a', displayName: 'A', domain: 'a.is' },
        { id: 'pub_b', displayName: 'B', domain: 'b.is' },
      ],
      7,
    );

    expect(stats.botClass).toEqual({ human: 115, knownBot: 10 });
    const siteA = stats.bySite!.find((s) => s.publisherId === 'pub_a')!;
    const siteB = stats.bySite!.find((s) => s.publisherId === 'pub_b')!;
    expect(siteA.botClass).toEqual({ human: 80, knownBot: 10 });
    expect(siteB.botClass).toEqual({ human: 35 });
  });
});

describe('getPublisherStats — traffic-paired spend', () => {
  beforeEach(async () => {
    await clearFirestoreEmulator();
  });

  it('pairs spend with page views over the measured days only', async () => {
    // One measured day (80 imp), one unmeasured (1000 imp). A "tekjur á 1.000
    // síðuflettingar" figure dividing whole-window spend by measured-days page
    // views would be ~13× too high — the numerator must cover the measured
    // days only. Derived spend for 80 impressions: round(80/1000 × 550) = 44.
    await seedDay('pub_x', 1, { impressions: 80, clicks: 2, pageviews: 100, pageViewsTrue: 90 });
    await seedDay('pub_x', 2, { impressions: 1000, clicks: 5, pageviews: 1200 });

    const stats = await getPublisherStats('pub_x', 7);

    expect(stats.spendIskWithTrafficData).toBe(44);
    expect(stats.requestsWithTrafficData).toBe(100);
    expect(stats.pageViewsTrue).toBe(90);
  });

  it('stays absent when no day measured true traffic', async () => {
    await seedDay('pub_x', 1, { impressions: 1000, clicks: 5, pageviews: 1200 });

    const stats = await getPublisherStats('pub_x', 7);

    expect(stats.spendIskWithTrafficData).toBeUndefined();
  });
});

describe('getPublisherStats — country rollup', () => {
  beforeEach(async () => {
    await clearFirestoreEmulator();
  });

  it('sums byCountry across days and stays absent when unmeasured', async () => {
    await seedDay('pub_x', 1, {
      impressions: 80,
      clicks: 2,
      pageviews: 100,
      pageViewsTrue: 90,
      byCountry: { IS: 70, DK: 15, XX: 5 },
    });
    await seedDay('pub_x', 2, {
      impressions: 40,
      clicks: 1,
      pageviews: 50,
      pageViewsTrue: 40,
      byCountry: { IS: 35, US: 5 },
    });
    // A pre-measurement day carries no field and must not zero the rollup.
    await seedDay('pub_x', 3, { impressions: 10, clicks: 0, pageviews: 20 });

    const stats = await getPublisherStats('pub_x', 7);
    expect(stats.byCountry).toEqual({ IS: 105, DK: 15, XX: 5, US: 5 });

    const empty = await getPublisherStats('pub_never', 7);
    expect(empty.byCountry).toBeUndefined();
  });

  it('aggregates byCountry across sites', async () => {
    await seedDay('pub_a', 1, {
      impressions: 80,
      clicks: 2,
      pageviews: 100,
      pageViewsTrue: 90,
      byCountry: { IS: 80 },
    });
    await seedDay('pub_b', 1, {
      impressions: 40,
      clicks: 1,
      pageviews: 50,
      pageViewsTrue: 40,
      byCountry: { IS: 30, NO: 10 },
    });

    const stats = await getAggregatedPublisherStats(
      [
        { id: 'pub_a', displayName: 'A', domain: 'a.is' },
        { id: 'pub_b', displayName: 'B', domain: 'b.is' },
      ],
      7,
    );
    expect(stats.byCountry).toEqual({ IS: 110, NO: 10 });
  });
});
