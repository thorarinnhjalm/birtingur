import { db } from '../lib/firebase.js';
import { COLLECTIONS } from '@ada/shared/firestore';
import { listCampaignsForAdvertiser } from './campaigns.js';
import { FLAT_CPM_ISK, grossIskForImpressions } from '@ada/shared';

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

  try {
    const publishersSnap = await db.collection(COLLECTIONS.publishers).get();

    // Generate YYYYMMDD keys for the last 7 days
    const dates: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(now.getTime() - i * 24 * 3600_000);
      dates.push(d.toISOString().split('T')[0]!.replace(/-/g, ''));
    }

    const statsPromises: Promise<any>[] = [];
    for (const doc of publishersSnap.docs) {
      if (doc.id.includes('demo')) continue;
      for (const dk of dates) {
        statsPromises.push(db.doc(`${COLLECTIONS.stats}/publishers/${doc.id}/${dk}`).get());
      }
    }

    const snaps = await Promise.all(statsPromises);
    for (const snap of snaps) {
      if (snap.exists) {
        const data = snap.data();
        total += data.pageviews || data.impressions || 0;
      }
    }
  } catch (err) {
    console.error('Failed to get system impressions:', err);
  }

  return total;
}

export async function getAdvertiserStats(
  advertiserId: string,
  options?: number | { timeframeDays?: number; startDate?: string; endDate?: string },
): Promise<AdvertiserStatsResponse> {
  const campaigns = await listCampaignsForAdvertiser(advertiserId);
  const now = new Date();
  const systemImpressions7d = await getSystemImpressionsLast7Days();

  let timeframeDays = 7;
  let startDateStr: string | undefined;
  let endDateStr: string | undefined;

  if (typeof options === 'number') {
    timeframeDays = options;
  } else if (options) {
    timeframeDays = options.timeframeDays ?? 7;
    startDateStr = options.startDate;
    endDateStr = options.endDate;
  }

  // Initialize days map for historical roll-up
  const dailyMap = new Map<string, { impressions: number; clicks: number; spendIsk: number }>();
  const historyDays: string[] = [];

  if (startDateStr && endDateStr) {
    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    const current = new Date(start);
    while (current <= end) {
      const dateStr = current.toISOString().split('T')[0]!;
      const dk = dateStr.replace(/-/g, '');
      dailyMap.set(dk, { impressions: 0, clicks: 0, spendIsk: 0 });
      historyDays.push(dateStr);
      current.setDate(current.getDate() + 1);
    }
  } else {
    for (let i = timeframeDays - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const dateStr = d.toISOString().split('T')[0]!; // YYYY-MM-DD
      const dk = dateStr.replace(/-/g, ''); // YYYYMMDD
      dailyMap.set(dk, { impressions: 0, clicks: 0, spendIsk: 0 });
      historyDays.push(dateStr);
    }
  }

  let totalImpressions = 0;
  let totalClicks = 0;
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

        dayStats.impressions += imp;
        dayStats.clicks += clk;
      }
    }
  }

  // If no stats documents exist in database, check if emulator or dev environment, and seed mock data
  const isDevOrEmulator =
    process.env.FIRESTORE_EMULATOR_HOST != null || process.env.NODE_ENV === 'development';
  if (!hasRealData && isDevOrEmulator) {
    const history: AdvertiserStatsResponse['history'] = [];

    for (const dateStr of historyDays) {
      const d = new Date(dateStr);
      const dayOfWeek = d.getDay();
      const baseImpressions =
        8000 + Math.floor(Math.sin(d.getDate() * 0.8) * 3000) + Math.floor(Math.random() * 1500);
      const multiplier = dayOfWeek === 0 || dayOfWeek === 6 ? 0.75 : 1.0;
      const dayImpressions = Math.floor(baseImpressions * multiplier);

      const ctr = 0.022 + Math.sin(d.getDate() * 0.5) * 0.004 + Math.random() * 0.005;
      const dayClicks = Math.floor(dayImpressions * ctr);
      history.push({
        date: dateStr,
        impressions: dayImpressions,
        clicks: dayClicks,
        spendIsk: grossIskForImpressions(dayImpressions),
      });

      totalImpressions += dayImpressions;
      totalClicks += dayClicks;
    }

    return {
      impressions: totalImpressions,
      clicks: totalClicks,
      spendIsk: grossIskForImpressions(totalImpressions),
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
      // Derived from the day's impressions rather than accumulated per
      // campaign-hour document — see grossIskForImpressions in @ada/shared.
      spendIsk: grossIskForImpressions(dayStats.impressions),
    });
    totalImpressions += dayStats.impressions;
    totalClicks += dayStats.clicks;
  }

  return {
    impressions: totalImpressions,
    clicks: totalClicks,
    // Rounded once over the window, not once per campaign-hour document. Three
    // surfaces reported this advertiser's spend three different ways before
    // that: this one, the campaign eCPM card, and the per-publisher table.
    spendIsk: grossIskForImpressions(totalImpressions),
    systemImpressions7d,
    history,
  };
}
