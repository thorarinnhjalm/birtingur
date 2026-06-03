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
  timeframeDays: 7 | 30 = 7,
): Promise<PublisherStatsResponse> {
  const history: { date: string; impressions: number; clicks: number; spendIsk: number }[] = [];
  let totalImpressions = 0;
  let totalClicks = 0;
  let totalSpendIsk = 0;

  const now = new Date();
  let hasRealData = false;

  for (let i = timeframeDays - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const dateStr = d.toISOString().split('T')[0]!; // YYYY-MM-DD
    const dk = dateStr.replace(/-/g, ''); // YYYYMMDD

    let dayImpressions = 0;
    let dayClicks = 0;
    let daySpendIsk = 0;

    // 1. Try subcollection path
    const subRef = db.doc(`${COLLECTIONS.stats}/publishers/${publisherId}/${dk}`);
    const subSnap = await subRef.get();

    if (subSnap.exists) {
      const data = subSnap.data();
      if (data) {
        hasRealData = true;
        dayImpressions = data.impressions || 0;
        dayClicks = data.clicks || 0;
        daySpendIsk = data.spendIsk || 0;
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
          hasRealData = true;
          dayImpressions += pubData.impressions || 0;
          dayClicks += pubData.clicks || 0;
          daySpendIsk += pubData.spendIsk || 0;
        }
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

  // 3. Fallback to mock data if empty and running in dev/emulator
  const isDevOrEmulator =
    process.env.FIRESTORE_EMULATOR_HOST != null || process.env.NODE_ENV === 'development';
  if (!hasRealData && isDevOrEmulator) {
    const mockHistory: typeof history = [];
    let mockTotalImpressions = 0;
    let mockTotalClicks = 0;
    let mockTotalSpendIsk = 0;

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
      const daySpendIsk = Math.floor((dayImpressions / 1000) * 280);

      mockHistory.push({
        date: dateStr,
        impressions: dayImpressions,
        clicks: dayClicks,
        spendIsk: daySpendIsk,
      });

      mockTotalImpressions += dayImpressions;
      mockTotalClicks += dayClicks;
      mockTotalSpendIsk += daySpendIsk;
    }

    return {
      impressions: mockTotalImpressions,
      clicks: mockTotalClicks,
      spendIsk: mockTotalSpendIsk,
      history: mockHistory,
    };
  }

  return {
    impressions: totalImpressions,
    clicks: totalClicks,
    spendIsk: totalSpendIsk,
    history,
  };
}
