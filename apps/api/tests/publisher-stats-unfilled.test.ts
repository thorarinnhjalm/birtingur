import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/lib/firebase';
import { COLLECTIONS } from '@ada/shared/firestore';
import { clearFirestoreEmulator } from './helpers/emulator';
import { getPublisherStats } from '../src/services/publisher-stats';

/**
 * `unfilled` is the ad requests that came back with no advertiser.
 *
 * It exists so the publisher dashboard can split a shortfall that used to be a
 * single number. `pageviews` counts every ad request and `impressions` counts
 * the ones that became visible (viewability-gated, see
 * packages/snippet/src/render.ts), so the gap between them silently mixes "no
 * advertiser bought your categories", which is ours to fix, with "the ad loaded
 * but the reader never scrolled to it", which is the publisher's. Those call
 * for opposite responses, so one combined number tells nobody what to do.
 *
 * The field carries the same absent-not-zero contract as `pageViewsTrue`: the
 * aggregator started writing it on 2026-08-14, so every earlier day has it
 * missing, and the UI must render "not measured" rather than claiming that
 * every request found a buyer.
 */

function dayKey(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split('T')[0]!.replace(/-/g, '');
}

async function seedDay(
  publisherId: string,
  daysAgo: number,
  data: Record<string, number>,
): Promise<void> {
  await db.doc(`${COLLECTIONS.stats}/publishers/${publisherId}/${dayKey(daysAgo)}`).set(data);
}

describe('getPublisherStats — unfilled ad requests', () => {
  beforeEach(async () => {
    await clearFirestoreEmulator();
  });

  it('sums unfilled across the window', async () => {
    await seedDay('pub_x', 1, {
      impressions: 80,
      clicks: 2,
      spendIsk: 44,
      pageviews: 100,
      unfilled: 20,
    });
    await seedDay('pub_x', 2, {
      impressions: 40,
      clicks: 1,
      spendIsk: 22,
      pageviews: 50,
      unfilled: 10,
    });

    const stats = await getPublisherStats('pub_x', 7);

    expect(stats.pageviews).toBe(150);
    expect(stats.impressions).toBe(120);
    expect(stats.unfilled).toBe(30);
  });

  it('leaves unfilled absent when no day in the window measured it', async () => {
    // A window entirely before the counter shipped. Reporting 0 here would tell
    // the publisher every single request found an advertiser, which is the
    // opposite of what the data says — it says nothing at all.
    await seedDay('pub_x', 1, { impressions: 80, clicks: 2, spendIsk: 44, pageviews: 100 });

    const stats = await getPublisherStats('pub_x', 7);

    expect(stats.pageviews).toBe(100);
    expect(stats.unfilled).toBeUndefined();
  });

  it('reports the measured days only when the window straddles the switch', async () => {
    // One day before the counter, one after. The sum must come from the day
    // that has it, not be suppressed because its neighbour does not.
    await seedDay('pub_x', 3, { impressions: 80, clicks: 0, spendIsk: 0, pageviews: 100 });
    await seedDay('pub_x', 1, {
      impressions: 90,
      clicks: 0,
      spendIsk: 0,
      pageviews: 100,
      unfilled: 10,
    });

    const stats = await getPublisherStats('pub_x', 7);

    expect(stats.pageviews).toBe(200);
    expect(stats.unfilled).toBe(10);
  });

  it('keeps a measured zero as zero, distinct from unmeasured', async () => {
    // The aggregator omits the field rather than writing 0, so a doc carrying
    // an explicit 0 can only come from somewhere else — but if it ever does,
    // "every request filled" must not be mistaken for "we never looked".
    await seedDay('pub_x', 1, {
      impressions: 100,
      clicks: 0,
      spendIsk: 0,
      pageviews: 100,
      unfilled: 0,
    });

    const stats = await getPublisherStats('pub_x', 7);

    expect(stats.unfilled).toBe(0);
  });

  it('carries unfilled onto each history entry, not just the total', async () => {
    // The chart and any per-day drilldown read history, so a total-only field
    // would be invisible there.
    await seedDay('pub_x', 1, {
      impressions: 80,
      clicks: 0,
      spendIsk: 0,
      pageviews: 100,
      unfilled: 20,
    });

    const stats = await getPublisherStats('pub_x', 7);
    const measured = stats.history.filter((h) => h.unfilled !== undefined);

    expect(measured).toHaveLength(1);
    expect(measured[0]!.unfilled).toBe(20);
  });
});
