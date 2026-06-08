import { db } from '../lib/firebase.js';
import { COLLECTIONS } from '@ada/shared/firestore';
import type { PublisherStatsBreakdown } from '@ada/shared/types';
import { FLAT_CPM_ISK } from '@ada/shared';

export interface PublisherStatsResponse extends PublisherStatsBreakdown {
  history: {
    date: string;
    impressions: number;
    clicks: number;
    spendIsk: number;
    pageviews: number;
  }[];
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
  }[] = [];
  let totalImpressions = 0;
  let totalClicks = 0;
  let totalSpendIsk = 0;
  let totalPageviews = 0;

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
      let dayHasRealData = false;

      if (subSnap.exists) {
        const data = subSnap.data();
        if (data) {
          dayHasRealData = true;
          dayImpressions = data.impressions || 0;
          dayClicks = data.clicks || 0;
          daySpendIsk = data.spendIsk || 0;
          dayPageviews = data.pageviews || 0;
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
          }
        }
      }

      return {
        date: dateStr,
        impressions: dayImpressions,
        clicks: dayClicks,
        spendIsk: daySpendIsk,
        pageviews: dayPageviews,
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
    });

    totalImpressions += res.impressions;
    totalClicks += res.clicks;
    totalSpendIsk += res.spendIsk;
    totalPageviews += res.pageviews;
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
      history: mockHistory,
    };
  }

  return {
    impressions: totalImpressions,
    clicks: totalClicks,
    spendIsk: totalSpendIsk,
    pageviews: totalPageviews,
    history,
  };
}

export async function getAggregatedPublisherStats(
  publisherIds: string[],
  timeframeDays: 7 | 30 = 7,
): Promise<PublisherStatsResponse> {
  if (publisherIds.length === 0) {
    return {
      impressions: 0,
      clicks: 0,
      spendIsk: 0,
      pageviews: 0,
      history: [],
    };
  }

  // Fetch stats for all publishers in parallel
  const allStats = await Promise.all(
    publisherIds.map((id) => getPublisherStats(id, timeframeDays)),
  );

  let totalImpressions = 0;
  let totalClicks = 0;
  let totalSpendIsk = 0;
  let totalPageviews = 0;

  // Use a map to aggregate history by date
  const historyMap: Record<
    string,
    { impressions: number; clicks: number; spendIsk: number; pageviews: number }
  > = {};

  for (const stats of allStats) {
    totalImpressions += stats.impressions;
    totalClicks += stats.clicks;
    totalSpendIsk += stats.spendIsk;
    totalPageviews += stats.pageviews || 0;

    for (const h of stats.history) {
      if (!historyMap[h.date]) {
        historyMap[h.date] = { impressions: 0, clicks: 0, spendIsk: 0, pageviews: 0 };
      }
      historyMap[h.date]!.impressions += h.impressions;
      historyMap[h.date]!.clicks += h.clicks;
      historyMap[h.date]!.spendIsk += h.spendIsk;
      historyMap[h.date]!.pageviews += h.pageviews || 0;
    }
  }

  // Convert map back to array sorted by date
  const history = Object.entries(historyMap)
    .map(([date, data]) => ({
      date,
      ...data,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    impressions: totalImpressions,
    clicks: totalClicks,
    spendIsk: totalSpendIsk,
    pageviews: totalPageviews,
    history,
  };
}
