import { db } from '../lib/firebase.js';
import { COLLECTIONS } from '@ada/shared/firestore';
import { listCampaignsForAdvertiser } from './campaigns.js';
import { FLAT_CPM_ISK } from '@ada/shared';

export interface AdvertiserStatsResponse {
  impressions: number;
  clicks: number;
  spendIsk: number;
  systemImpressions7d: number;
  history: {
    date: string;
    impressions: number;
    clicks: number;
    spendIsk: number;
  }[];
}

async function getSystemImpressionsLast7Days(): Promise<number> {
  let total = 0;
  const now = new Date();
  const minDate = new Date(now.getTime() - 7 * 24 * 3600_000);
  const minDk = minDate.toISOString().split('T')[0]!.replace(/-/g, '') + '00'; // YYYYMMDDHH minimum hour key

  try {
    const campaignsSnap = await db.collection(COLLECTIONS.campaigns).get();
    const statsPromises = campaignsSnap.docs.map((doc) =>
      db.collection(`${COLLECTIONS.stats}/campaigns/${doc.id}`).get(),
    );
    const statsSnapshots = await Promise.all(statsPromises);
    for (const statsSnap of statsSnapshots) {
      for (const sDoc of statsSnap.docs) {
        if (sDoc.id >= minDk) {
          const data = sDoc.data();
          total += data.impressions || 0;
        }
      }
    }
  } catch (err) {
    console.error('Failed to get system impressions:', err);
  }

  // Fallback to mock data if empty and running in dev/emulator
  const isDevOrEmulator =
    process.env.FIRESTORE_EMULATOR_HOST != null || process.env.NODE_ENV === 'development';
  if (total === 0 && isDevOrEmulator) {
    const base = 1248900;
    // Animate the mock total upwards live based on current timestamp (12 impressions per second)
    const increment = Math.floor((Date.now() % (1000 * 3600)) / 1000) * 12;
    return base + increment;
  }

  return total;
}

export async function getAdvertiserStats(
  advertiserId: string,
  timeframeDays: number = 7,
): Promise<AdvertiserStatsResponse> {
  const campaigns = await listCampaignsForAdvertiser(advertiserId);
  const now = new Date();
  const systemImpressions7d = await getSystemImpressionsLast7Days();

  // Initialize days map for historical roll-up
  const dailyMap = new Map<string, { impressions: number; clicks: number; spendIsk: number }>();
  const historyDays: string[] = [];

  for (let i = timeframeDays - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const dateStr = d.toISOString().split('T')[0]!; // YYYY-MM-DD
    const dk = dateStr.replace(/-/g, ''); // YYYYMMDD
    dailyMap.set(dk, { impressions: 0, clicks: 0, spendIsk: 0 });
    historyDays.push(dateStr);
  }

  let totalImpressions = 0;
  let totalClicks = 0;
  let totalSpendIsk = 0;
  let hasRealData = false;

  const campaignPromises = campaigns.map(async (cmp) => {
    const snap = await db.collection(`${COLLECTIONS.stats}/campaigns/${cmp.id}`).get();
    return snap.docs;
  });

  const snapsDocs = await Promise.all(campaignPromises);

  for (const docs of snapsDocs) {
    for (const doc of docs) {
      const docId = doc.id; // YYYYMMDDHH
      const dk = docId.substring(0, 8); // YYYYMMDD
      if (dailyMap.has(dk)) {
        hasRealData = true;
        const data = doc.data();
        const dayStats = dailyMap.get(dk)!;
        const imp = data.impressions || 0;
        const clk = data.clicks || 0;

        // Estimate campaign spend based on FLAT_CPM_ISK
        const spend = Math.round((imp / 1000) * FLAT_CPM_ISK);

        dayStats.impressions += imp;
        dayStats.clicks += clk;
        dayStats.spendIsk += spend;
      }
    }
  }

  // If no stats documents exist in database, check if emulator or dev environment, and seed mock data
  const isDevOrEmulator =
    process.env.FIRESTORE_EMULATOR_HOST != null || process.env.NODE_ENV === 'development';
  if (!hasRealData && isDevOrEmulator) {
    const history: AdvertiserStatsResponse['history'] = [];

    for (let i = timeframeDays - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const dateStr = d.toISOString().split('T')[0]!;

      const dayOfWeek = d.getDay();
      const baseImpressions =
        8000 + Math.floor(Math.sin(i * 0.8) * 3000) + Math.floor(Math.random() * 1500);
      const multiplier = dayOfWeek === 0 || dayOfWeek === 6 ? 0.75 : 1.0;
      const dayImpressions = Math.floor(baseImpressions * multiplier);

      const ctr = 0.022 + Math.sin(i * 0.5) * 0.004 + Math.random() * 0.005;
      const dayClicks = Math.floor(dayImpressions * ctr);
      const daySpendIsk = Math.floor((dayImpressions / 1000) * FLAT_CPM_ISK);

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
      systemImpressions7d,
      history,
    };
  }

  // Otherwise, compile from dailyMap
  const history: AdvertiserStatsResponse['history'] = [];
  for (const dateStr of historyDays) {
    const dk = dateStr.replace(/-/g, '');
    const dayStats = dailyMap.get(dk)!;
    history.push({
      date: dateStr,
      impressions: dayStats.impressions,
      clicks: dayStats.clicks,
      spendIsk: dayStats.spendIsk,
    });
    totalImpressions += dayStats.impressions;
    totalClicks += dayStats.clicks;
    totalSpendIsk += dayStats.spendIsk;
  }

  return {
    impressions: totalImpressions,
    clicks: totalClicks,
    spendIsk: totalSpendIsk,
    systemImpressions7d,
    history,
  };
}
