import { db } from '../lib/firebase';
import { COLLECTIONS } from '@ada/shared/firestore';
import type { PublisherStatsBreakdown } from '@ada/shared/types';

export interface PublisherStatsResponse extends PublisherStatsBreakdown {
  history: {
    date: string;
    impressions: number;
    clicks: number;
    spendIsk: number;
  }[];
}

export async function getPublisherStats(
  publisherId: string,
  timeframeDays: 7 | 30 = 7
): Promise<PublisherStatsResponse> {
  const history: { date: string; impressions: number; clicks: number; spendIsk: number }[] = [];
  let totalImpressions = 0;
  let totalClicks = 0;
  let totalSpendIsk = 0;

  const now = new Date();

  for (let i = timeframeDays - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const dateStr = d.toISOString().split('T')[0]!; // YYYY-MM-DD

    let dayImpressions = 0;
    let dayClicks = 0;
    let daySpendIsk = 0;

    // Fetch all hourly documents for this date
    // Hourly documents are stored with ID: YYYY-MM-DD_HH
    const snapshot = await db
      .collection(COLLECTIONS.stats)
      .where('__name__', '>=', dateStr)
      .where('__name__', '<=', dateStr + '_\uf8ff')
      .get();

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const pubData = data.byPublisher?.[publisherId];
      if (pubData) {
        dayImpressions += pubData.impressions || 0;
        dayClicks += pubData.clicks || 0;
        daySpendIsk += pubData.spendIsk || 0;
      }
    }

    history.push({
      date: dateStr,
      impressions: dayImpressions,
      clicks: dayClicks,
      spendIsk: daySpendIsk,
    });

    totalImpressions += dayImpressions;
    totalClicks += dayClicks;
    totalSpendIsk += daySpendIsk;
  }

  return {
    impressions: totalImpressions,
    clicks: totalClicks,
    spendIsk: totalSpendIsk,
    history,
  };
}
