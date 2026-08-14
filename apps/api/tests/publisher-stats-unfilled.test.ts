import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/lib/firebase';
import { COLLECTIONS } from '@ada/shared/firestore';
import { clearFirestoreEmulator } from './helpers/emulator';
import { getPublisherStats, getAggregatedPublisherStats } from '../src/services/publisher-stats';
import { publisherNetIsk, grossIskForImpressions } from '@ada/shared';

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

  /**
   * `unfilled` covers only the days that measured it, but `pageviews` covers the
   * whole window — so dividing one by the other compares two different periods.
   * With the counter having started on 2026-08-14, a 30-day window put 30 days
   * of requests under 1 day of unfilled and a site with a real 50% fill rate
   * read 98%, in green. The chain then blamed the publisher's slot placement
   * for inventory we had failed to sell.
   *
   * The denominator now travels with the numerator: `requestsWithFillData` is
   * the request count over exactly the days that measured `unfilled`, and is
   * absent whenever `unfilled` is.
   */
  it('reports the request count for the days that measured unfilled', async () => {
    await seedDay('pub_x', 3, { impressions: 80, clicks: 0, spendIsk: 0, pageviews: 100 });
    await seedDay('pub_x', 1, {
      impressions: 90,
      clicks: 0,
      spendIsk: 0,
      pageviews: 100,
      unfilled: 50,
    });

    const stats = await getPublisherStats('pub_x', 7);

    // The window still reports all 200 requests — that figure is not wrong.
    expect(stats.pageviews).toBe(200);
    // But fill is 50 unfilled out of the 100 requests on the day that measured
    // it, which is 50%. Against all 200 it would read 75%.
    expect(stats.requestsWithFillData).toBe(100);
    expect(stats.unfilled).toBe(50);
    // And the impressions from the same days, so the second gap in the chain
    // (filled minus impressions) subtracts two figures covering one period.
    expect(stats.impressionsWithFillData).toBe(90);
  });

  it('leaves the fill denominator absent when nothing measured it', async () => {
    await seedDay('pub_x', 1, { impressions: 80, clicks: 2, spendIsk: 44, pageviews: 100 });

    const stats = await getPublisherStats('pub_x', 7);

    expect(stats.unfilled).toBeUndefined();
    expect(stats.requestsWithFillData).toBeUndefined();
    expect(stats.impressionsWithFillData).toBeUndefined();
  });

  it('sums the per-site paired figures when aggregating, not the whole window', async () => {
    // getAggregatedPublisherStats re-sums per-site results. Re-deriving the
    // denominators from each site's whole-window `pageviews` there would undo
    // the pairing for every multi-site owner while the single-site path stayed
    // correct — the same endpoint returning a right answer and a wrong one
    // depending on how many sites you own.
    await seedDay('pub_a', 3, { impressions: 40, clicks: 0, spendIsk: 0, pageviews: 500 });
    await seedDay('pub_a', 1, {
      impressions: 30,
      clicks: 0,
      spendIsk: 0,
      pageviews: 100,
      unfilled: 40,
    });
    await seedDay('pub_b', 3, { impressions: 60, clicks: 0, spendIsk: 0, pageviews: 700 });
    await seedDay('pub_b', 1, {
      impressions: 50,
      clicks: 0,
      spendIsk: 0,
      pageviews: 200,
      unfilled: 60,
    });

    const stats = await getAggregatedPublisherStats(
      [
        { id: 'pub_a', displayName: 'A', domain: 'a.is' },
        { id: 'pub_b', displayName: 'B', domain: 'b.is' },
      ],
      7,
    );

    // 1.500 requests across the whole window, but only 300 on measured days.
    expect(stats.pageviews).toBe(1500);
    expect(stats.requestsWithFillData).toBe(300);
    expect(stats.impressionsWithFillData).toBe(80);
    expect(stats.unfilled).toBe(100);
    // Fill is (300-100)/300 = 67%. Against the window it would read 93%.
    expect(
      Math.round(
        ((stats.requestsWithFillData! - stats.unfilled!) / stats.requestsWithFillData!) * 100,
      ),
    ).toBe(67);
  });

  it('does the same for real page views, which started on a different day', async () => {
    // Same defect, different pair: requests-per-page-view divided a full window
    // of requests by six days of measured traffic and read about 5x too high.
    await seedDay('pub_x', 3, { impressions: 80, clicks: 0, spendIsk: 0, pageviews: 300 });
    await seedDay('pub_x', 1, {
      impressions: 90,
      clicks: 0,
      spendIsk: 0,
      pageviews: 300,
      pageViewsTrue: 100,
    });

    const stats = await getPublisherStats('pub_x', 7);

    expect(stats.pageviews).toBe(600);
    expect(stats.pageViewsTrue).toBe(100);
    // 300 requests against 100 page views is 3,0 per page view. Against all 600
    // it would read 6,0 and imply twice as many slots as the site has.
    expect(stats.requestsWithTrafficData).toBe(300);
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

  /**
   * The embeddable stats widget cannot import @ada/shared, so it cannot take
   * the platform fee off `spendIsk` itself — which is why it rendered the gross
   * figure under "Áætlaðar tekjur", 25% high, on a page the publisher put on
   * their own site.
   *
   * It falls back to `spendIsk` when this field is absent, so the field going
   * missing would silently restore that overstatement. This is the test that
   * notices.
   */
  it('returns the net figure the publisher is actually paid', async () => {
    await seedDay('pub_x', 1, {
      impressions: 10_000,
      clicks: 20,
      spendIsk: 5500,
      pageviews: 12_000,
    });

    const stats = await getPublisherStats('pub_x', 7);

    expect(stats.spendIsk).toBe(5500);
    // 20% off, and the same value creditPublisher writes to the ledger.
    expect(stats.netEarningsIsk).toBe(publisherNetIsk(5500));
    expect(stats.netEarningsIsk).toBe(4400);
  });

  /**
   * Displayed revenue describes what the traffic is worth, derived from the
   * impression count and rounded once. It is NOT the sum of the per-run
   * `spendIsk` the aggregator stores.
   *
   * One impression costs 0,55 kr, and the aggregator rounds that per hourly
   * run — so a blog with one impression an hour accumulated a whole króna 720
   * times a month and its dashboard read 576 kr net against traffic worth 317.
   * The error vanishes above about a hundred impressions an hour and is worst
   * on the smallest sites, which is the audience this product is for.
   *
   * The owner's decision (2026-08-14): the dashboard figure answers "what is my
   * traffic worth", and the payouts page keeps showing the ledger balance,
   * which answers "what will I be paid". Two numbers, two labels, neither
   * pretending to be the other.
   */
  it('derives revenue from impressions rather than summing what the aggregator stored', async () => {
    // A month of one impression an hour, as the aggregator would have written
    // it: 24 hourly runs a day, each rounding 0,55 up to 1.
    for (let daysAgo = 1; daysAgo <= 6; daysAgo++) {
      await seedDay('pub_x', daysAgo, {
        impressions: 24,
        clicks: 0,
        spendIsk: 24, // 24 hourly runs x round(0,55) = 24, not round(13,2) = 13
        pageviews: 30,
      });
    }

    const stats = await getPublisherStats('pub_x', 7);

    expect(stats.impressions).toBe(144);
    // 144 impressions are worth round(144/1000 * 550) = 79 kr, not the 144 the
    // stored per-run figures add up to.
    expect(stats.spendIsk).toBe(grossIskForImpressions(144));
    expect(stats.spendIsk).toBe(79);
    expect(stats.netEarningsIsk).toBe(publisherNetIsk(79));
  });

  it('rounds once over the window, not once per day', async () => {
    // Three days of 1 impression each. Per day that is round(0,55) = 1, so a
    // per-day sum gives 3; over the window it is round(1,65) = 2.
    for (const daysAgo of [1, 2, 3]) {
      await seedDay('pub_x', daysAgo, {
        impressions: 1,
        clicks: 0,
        spendIsk: 1,
        pageviews: 1,
      });
    }

    const stats = await getPublisherStats('pub_x', 7);

    expect(stats.impressions).toBe(3);
    expect(stats.spendIsk).toBe(2);
  });

  it('is exact at ordinary volumes, where the old sum happened to be right too', async () => {
    await seedDay('pub_x', 1, {
      impressions: 100_000,
      clicks: 200,
      spendIsk: 55_000,
      pageviews: 120_000,
    });

    const stats = await getPublisherStats('pub_x', 7);

    expect(stats.spendIsk).toBe(55_000);
  });
});
