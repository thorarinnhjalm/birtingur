import { db } from '../lib/firebase';
import { COLLECTIONS } from '@ada/shared/firestore';
import { listCampaignsForAdvertiser } from './campaigns';

export interface AdvertiserStatsResponse {
  impressions: number;
  clicks: number;
  spendIsk: number;
  history: {
    date: string;
    impressions: number;
    clicks: number;
    spendIsk: number;
  }[];
}

export async function getAdvertiserStats(
  advertiserId: string,
  timeframeDays: number = 7
): Promise<AdvertiserStatsResponse> {
  const campaigns = await listCampaignsForAdvertiser(advertiserId);
  const now = new Date();
  
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

  for (const cmp of campaigns) {
    const snap = await db.collection(`${COLLECTIONS.stats}/campaigns/${cmp.id}`).get();
    for (const doc of snap.docs) {
      const docId = doc.id; // YYYYMMDDHH
      const dk = docId.substring(0, 8); // YYYYMMDD
      if (dailyMap.has(dk)) {
        hasRealData = true;
        const data = doc.data();
        const dayStats = dailyMap.get(dk)!;
        const imp = data.impressions || 0;
        const clk = data.clicks || 0;
        
        // Estimate campaign spend based on standard 280 CPM
        const spend = Math.round((imp / 1000) * 280);

        dayStats.impressions += imp;
        dayStats.clicks += clk;
        dayStats.spendIsk += spend;
      }
    }
  }

  // If no stats documents exist in database, check if emulator or dev environment, and seed mock data
  const isDevOrEmulator = process.env.FIRESTORE_EMULATOR_HOST != null || process.env.NODE_ENV === 'development';
  if (!hasRealData && isDevOrEmulator) {
    const history: AdvertiserStatsResponse['history'] = [];
    
    for (let i = timeframeDays - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const dateStr = d.toISOString().split('T')[0]!;
      
      const dayOfWeek = d.getDay();
      const baseImpressions = 8000 + Math.floor(Math.sin(i * 0.8) * 3000) + Math.floor(Math.random() * 1500);
      const multiplier = (dayOfWeek === 0 || dayOfWeek === 6) ? 0.75 : 1.0;
      const dayImpressions = Math.floor(baseImpressions * multiplier);
      
      const ctr = 0.022 + (Math.sin(i * 0.5) * 0.004) + (Math.random() * 0.005);
      const dayClicks = Math.floor(dayImpressions * ctr);
      const daySpendIsk = Math.floor((dayImpressions / 1000) * 280);

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
    history,
  };
}
