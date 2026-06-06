import { db } from '../lib/firebase.js';
import { COLLECTIONS } from '@ada/shared/firestore';

export interface SlotStatsResponse {
  impressions: number;
  clicks: number;
  spendIsk: number;
  pageviews: number;
  history: {
    date: string;
    impressions: number;
    clicks: number;
    spendIsk: number;
    pageviews: number;
  }[];
}

export async function getSlotStats(
  publisherId: string,
  slotId: string,
  timeframeDays: 7 | 30 = 7,
): Promise<SlotStatsResponse> {
  const history: SlotStatsResponse['history'] = [];
  let impressions = 0;
  let clicks = 0;
  let spendIsk = 0;
  let pageviews = 0;
  const now = new Date();
  let hasRealData = false;

  for (let i = timeframeDays - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const dateStr = d.toISOString().split('T')[0]!; // YYYY-MM-DD
    const dk = dateStr.replace(/-/g, ''); // YYYYMMDD

    const snap = await db
      .doc(`${COLLECTIONS.stats}/publisher_slots/${publisherId}_${slotId}/${dk}`)
      .get();

    if (snap.exists) {
      hasRealData = true;
      const data = snap.data();
      const day = {
        date: dateStr,
        impressions: (data?.impressions as number) || 0,
        clicks: (data?.clicks as number) || 0,
        spendIsk: (data?.spendIsk as number) || 0,
        pageviews: (data?.pageviews as number) || 0,
      };
      history.push(day);
      impressions += day.impressions;
      clicks += day.clicks;
      spendIsk += day.spendIsk;
      pageviews += day.pageviews;
    } else {
      history.push({
        date: dateStr,
        impressions: 0,
        clicks: 0,
        spendIsk: 0,
        pageviews: 0,
      });
    }
  }

  // Fallback to mock data if empty and running in dev/emulator
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
      // Use smaller base impressions per-slot compared to publisher-level (e.g. 2000-5000)
      const baseImpressions =
        3000 + Math.floor(Math.sin(i * 0.8) * 1000) + Math.floor(Math.random() * 800);
      const multiplier = dayOfWeek === 0 || dayOfWeek === 6 ? 0.7 : 1.0;
      const dayImpressions = Math.floor(baseImpressions * multiplier);

      const ctr = 0.02 + Math.sin(i * 0.5) * 0.005 + Math.random() * 0.008;
      const dayClicks = Math.floor(dayImpressions * ctr);
      const daySpendIsk = Math.floor((dayImpressions / 1000) * 280);
      const dayPageviews = Math.floor(dayImpressions * (1.8 + Math.random() * 1.2)) + 50;

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

  return { impressions, clicks, spendIsk, pageviews, history };
}
