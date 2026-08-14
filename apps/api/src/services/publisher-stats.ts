import { db } from '../lib/firebase.js';
import { COLLECTIONS } from '@ada/shared/firestore';
import type { PublisherStatsBreakdown } from '@ada/shared/types';
import { FLAT_CPM_ISK, publisherNetIsk } from '@ada/shared';

export interface SiteBreakdown {
  publisherId: string;
  displayName: string;
  domain: string;
  impressions: number;
  clicks: number;
  pageviews: number;
  // Real page views (Task 4). Absent — not zero — for a site whose window
  // has no post-switch day with measured true traffic yet.
  pageViewsTrue?: number;
  // Ad requests that came back with no advertiser (house ad, transparent
  // placeholder, or a cold cache). Absent — not zero — for a window with no day
  // the aggregator measured it, so the UI can say "not measured yet" instead of
  // claiming perfect fill. Written from 2026-08-14 forward; every earlier day
  // has the field missing by construction.
  unfilled?: number;
  spendIsk: number;
}

export interface PublisherStatsResponse extends PublisherStatsBreakdown {
  // Real page views summed across the window. Absent — not zero — when no
  // day in the window has a measured value (all pre-switch, or no data at
  // all): the UI must render "no accurate data yet", never a false zero.
  pageViewsTrue?: number;
  // Ad requests that came back with no advertiser (house ad, transparent
  // placeholder, or a cold cache). Absent — not zero — for a window with no day
  // the aggregator measured it, so the UI can say "not measured yet" instead of
  // claiming perfect fill. Written from 2026-08-14 forward; every earlier day
  // has the field missing by construction.
  unfilled?: number;
  // What the publisher actually earns from `spendIsk`, net of the platform fee.
  //
  // Returned rather than left to the caller because one caller cannot derive it:
  // the embeddable stats widget (packages/widgets) has no dependency on
  // @ada/shared, so it rendered the GROSS figure under "Áætlaðar tekjur" — 25%
  // high, on a page the publisher embeds on their own site.
  netEarningsIsk: number;
  history: {
    date: string;
    impressions: number;
    clicks: number;
    spendIsk: number;
    pageviews: number;
    // Absent for a specific day that has no measured true pageviews (either
    // pre-switch, or a post-switch day the aggregator left unset).
    pageViewsTrue?: number;
    unfilled?: number;
  }[];
  bySite?: SiteBreakdown[];
}

export async function getPublisherStats(
  publisherId: string,
  timeframeDays: 7 | 30 = 7,
): Promise<PublisherStatsResponse> {
  const history: {
    date: string;
    impressions: number;
    clicks: number;
    spendIsk: number;
    pageviews: number;
    pageViewsTrue?: number;
    unfilled?: number;
  }[] = [];
  let totalImpressions = 0;
  let totalClicks = 0;
  let totalSpendIsk = 0;
  let totalPageviews = 0;
  let totalPageViewsTrue = 0;
  // True per-day pageviews are only ever present from the switch date
  // onward (Task 4 leaves the field absent, not zero, before it). Track
  // whether ANY day in the window measured it so the total can stay
  // undefined rather than silently reporting a false zero.
  let anyPageViewsTrue = false;
  let totalUnfilled = 0;
  let anyUnfilled = false;

  const now = new Date();
  let hasRealData = false;

  const promises = Array.from({ length: timeframeDays }, (_, index) => {
    const i = timeframeDays - 1 - index;
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const dateStr = d.toISOString().split('T')[0]!; // YYYY-MM-DD
    const dk = dateStr.replace(/-/g, ''); // YYYYMMDD

    // Fetch the daily stats documents
    const subRef = db.doc(`${COLLECTIONS.stats}/publishers/${publisherId}/${dk}`);
    return subRef.get().then(async (subSnap) => {
      let dayImpressions = 0;
      let dayClicks = 0;
      let daySpendIsk = 0;
      let dayPageviews = 0;
      // Undefined unless a doc for this day actually carries the field \u2014
      // never defaulted to 0, so a pre-switch (or otherwise unmeasured) day
      // stays distinguishable from a genuine zero-traffic day.
      let dayPageViewsTrue: number | undefined;
      let dayUnfilled: number | undefined;
      let dayHasRealData = false;

      if (subSnap.exists) {
        const data = subSnap.data();
        if (data) {
          dayHasRealData = true;
          dayImpressions = data.impressions || 0;
          dayClicks = data.clicks || 0;
          daySpendIsk = data.spendIsk || 0;
          dayPageviews = data.pageviews || 0;
          if (typeof data.pageViewsTrue === 'number') {
            dayPageViewsTrue = data.pageViewsTrue;
          }
          if (typeof data.unfilled === 'number') {
            dayUnfilled = data.unfilled;
          }
        }
      } else {
        // 2. Fallback to top-level stats collection
        const snapshot = await db
          .collection(COLLECTIONS.stats)
          .where('__name__', '>=', dateStr)
          .where('__name__', '<=', dateStr + '_\uf8ff')
          .get();

        for (const doc of snapshot.docs) {
          const data = doc.data();
          const pubData = data.byPublisher?.[publisherId];
          if (pubData) {
            dayHasRealData = true;
            dayImpressions += pubData.impressions || 0;
            dayClicks += pubData.clicks || 0;
            daySpendIsk += pubData.spendIsk || 0;
            dayPageviews += pubData.pageviews || 0;
            if (typeof pubData.pageViewsTrue === 'number') {
              dayPageViewsTrue = (dayPageViewsTrue ?? 0) + pubData.pageViewsTrue;
            }
            if (typeof pubData.unfilled === 'number') {
              dayUnfilled = (dayUnfilled ?? 0) + pubData.unfilled;
            }
          }
        }
      }

      return {
        date: dateStr,
        impressions: dayImpressions,
        clicks: dayClicks,
        spendIsk: daySpendIsk,
        pageviews: dayPageviews,
        pageViewsTrue: dayPageViewsTrue,
        unfilled: dayUnfilled,
        hasRealData: dayHasRealData,
      };
    });
  });

  const results = await Promise.all(promises);

  for (const res of results) {
    if (res.hasRealData) {
      hasRealData = true;
    }
    history.push({
      date: res.date,
      impressions: res.impressions,
      clicks: res.clicks,
      spendIsk: res.spendIsk,
      pageviews: res.pageviews,
      pageViewsTrue: res.pageViewsTrue,
      unfilled: res.unfilled,
    });

    totalImpressions += res.impressions;
    totalClicks += res.clicks;
    totalSpendIsk += res.spendIsk;
    totalPageviews += res.pageviews;
    if (res.pageViewsTrue !== undefined) {
      anyPageViewsTrue = true;
      totalPageViewsTrue += res.pageViewsTrue;
    }
    if (res.unfilled !== undefined) {
      anyUnfilled = true;
      totalUnfilled += res.unfilled;
    }
  }

  // 3. Fallback to mock data if empty and running in dev/emulator
  const isDevOrEmulator =
    process.env.FIRESTORE_EMULATOR_HOST != null || process.env.NODE_ENV === 'development';
  if (!hasRealData && isDevOrEmulator) {
    const mockHistory: typeof history = [];
    let mockTotalImpressions = 0;
    let mockTotalClicks = 0;
    let mockTotalSpendIsk = 0;
    let mockTotalPageviews = 0;

    for (let i = timeframeDays - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const dateStr = d.toISOString().split('T')[0]!;

      const dayOfWeek = d.getDay();
      const baseImpressions =
        15000 + Math.floor(Math.sin(i * 0.8) * 5000) + Math.floor(Math.random() * 3000);
      const multiplier = dayOfWeek === 0 || dayOfWeek === 6 ? 0.7 : 1.0;
      const dayImpressions = Math.floor(baseImpressions * multiplier);

      const ctr = 0.02 + Math.sin(i * 0.5) * 0.005 + Math.random() * 0.008;
      const dayClicks = Math.floor(dayImpressions * ctr);
      const daySpendIsk = Math.floor((dayImpressions / 1000) * FLAT_CPM_ISK);
      // Mock pageviews should be around 1.8x to 3x of impressions, plus some extra fallback hits
      const dayPageviews = Math.floor(dayImpressions * (1.8 + Math.random() * 1.2)) + 150;

      mockHistory.push({
        date: dateStr,
        impressions: dayImpressions,
        clicks: dayClicks,
        spendIsk: daySpendIsk,
        pageviews: dayPageviews,
      });

      mockTotalImpressions += dayImpressions;
      mockTotalClicks += dayClicks;
      mockTotalSpendIsk += daySpendIsk;
      mockTotalPageviews += dayPageviews;
    }

    return {
      impressions: mockTotalImpressions,
      clicks: mockTotalClicks,
      spendIsk: mockTotalSpendIsk,
      pageviews: mockTotalPageviews,
      netEarningsIsk: publisherNetIsk(mockTotalSpendIsk),
      history: mockHistory,
    };
  }

  return {
    impressions: totalImpressions,
    clicks: totalClicks,
    spendIsk: totalSpendIsk,
    pageviews: totalPageviews,
    pageViewsTrue: anyPageViewsTrue ? totalPageViewsTrue : undefined,
    unfilled: anyUnfilled ? totalUnfilled : undefined,
    netEarningsIsk: publisherNetIsk(totalSpendIsk),
    history,
  };
}

export async function getAggregatedPublisherStats(
  publishers: Array<{ id: string; displayName: string; domain: string }>,
  timeframeDays: 7 | 30 = 7,
): Promise<PublisherStatsResponse> {
  if (publishers.length === 0) {
    return {
      impressions: 0,
      clicks: 0,
      spendIsk: 0,
      pageviews: 0,
      netEarningsIsk: 0,
      history: [],
    };
  }

  // Fetch stats for all publishers in parallel
  const allStats = await Promise.all(publishers.map((p) => getPublisherStats(p.id, timeframeDays)));

  let totalImpressions = 0;
  let totalClicks = 0;
  let totalSpendIsk = 0;
  let totalPageviews = 0;
  let totalPageViewsTrue = 0;
  let anyPageViewsTrue = false;
  let totalUnfilled = 0;
  let anyUnfilled = false;

  // Use a map to aggregate history by date
  const historyMap: Record<
    string,
    {
      impressions: number;
      clicks: number;
      spendIsk: number;
      pageviews: number;
      pageViewsTrue?: number;
      unfilled?: number;
    }
  > = {};

  for (const stats of allStats) {
    totalImpressions += stats.impressions;
    totalClicks += stats.clicks;
    totalSpendIsk += stats.spendIsk;
    totalPageviews += stats.pageviews || 0;
    if (stats.pageViewsTrue !== undefined) {
      anyPageViewsTrue = true;
      totalPageViewsTrue += stats.pageViewsTrue;
    }
    if (stats.unfilled !== undefined) {
      anyUnfilled = true;
      totalUnfilled += stats.unfilled;
    }

    for (const h of stats.history) {
      if (!historyMap[h.date]) {
        historyMap[h.date] = { impressions: 0, clicks: 0, spendIsk: 0, pageviews: 0 };
      }
      historyMap[h.date]!.impressions += h.impressions;
      historyMap[h.date]!.clicks += h.clicks;
      historyMap[h.date]!.spendIsk += h.spendIsk;
      historyMap[h.date]!.pageviews += h.pageviews || 0;
      if (h.pageViewsTrue !== undefined) {
        historyMap[h.date]!.pageViewsTrue =
          (historyMap[h.date]!.pageViewsTrue ?? 0) + h.pageViewsTrue;
      }
      // Accumulated here for the same reason as pageViewsTrue above: without
      // it, a multi-site owner's history came back with the field missing while
      // a single-site owner's carried it — the same endpoint returning two
      // shapes, which the next per-day drilldown would get wrong for agencies
      // only.
      if (h.unfilled !== undefined) {
        historyMap[h.date]!.unfilled = (historyMap[h.date]!.unfilled ?? 0) + h.unfilled;
      }
    }
  }

  // Convert map back to array sorted by date
  const history = Object.entries(historyMap)
    .map(([date, data]) => ({
      date,
      ...data,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const bySite: SiteBreakdown[] =
    publishers.length > 1
      ? publishers
          .map((p, i) => ({
            publisherId: p.id,
            displayName: p.displayName,
            domain: p.domain,
            impressions: allStats[i]!.impressions,
            clicks: allStats[i]!.clicks,
            pageviews: allStats[i]!.pageviews || 0,
            pageViewsTrue: allStats[i]!.pageViewsTrue,
            unfilled: allStats[i]!.unfilled,
            spendIsk: allStats[i]!.spendIsk,
          }))
          .sort((a, b) => b.impressions - a.impressions)
      : [];

  return {
    impressions: totalImpressions,
    clicks: totalClicks,
    spendIsk: totalSpendIsk,
    pageviews: totalPageviews,
    pageViewsTrue: anyPageViewsTrue ? totalPageViewsTrue : undefined,
    unfilled: anyUnfilled ? totalUnfilled : undefined,
    netEarningsIsk: publisherNetIsk(totalSpendIsk),
    history,
    ...(bySite.length > 0 ? { bySite } : {}),
  };
}
