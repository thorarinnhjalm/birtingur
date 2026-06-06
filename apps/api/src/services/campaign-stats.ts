import { COLLECTIONS } from '@ada/shared/firestore';
import { db } from '../lib/firebase.js';

export interface CampaignStatsResponse {
  impressions: number;
  clicks: number;
  hours: Array<{ hour: string; impressions: number; clicks: number }>;
}

export async function getCampaignStats(
  campaignId: string,
  hours = 24 * 30,
): Promise<CampaignStatsResponse> {
  const out: CampaignStatsResponse['hours'] = [];
  let impressions = 0;
  let clicks = 0;
  const now = new Date();

  // Compute minimum hour key to filter in memory
  const minDate = new Date(now.getTime() - hours * 3600_000);
  const minHk =
    minDate.getUTCFullYear().toString() +
    String(minDate.getUTCMonth() + 1).padStart(2, '0') +
    String(minDate.getUTCDate()).padStart(2, '0') +
    String(minDate.getUTCHours()).padStart(2, '0');

  // Fetch all documents from the subcollection in a single request
  const snap = await db.collection(`${COLLECTIONS.stats}/campaigns/${campaignId}`).get();

  const statsMap = new Map<string, { impressions: number; clicks: number }>();
  for (const doc of snap.docs) {
    const hk = doc.id;
    if (hk >= minHk) {
      const data = doc.data();
      statsMap.set(hk, {
        impressions: (data.impressions as number) ?? 0,
        clicks: (data.clicks as number) ?? 0,
      });
    }
  }

  for (let i = 0; i < hours; i++) {
    const d = new Date(now.getTime() - i * 3600_000);
    const hk =
      d.getUTCFullYear().toString() +
      String(d.getUTCMonth() + 1).padStart(2, '0') +
      String(d.getUTCDate()).padStart(2, '0') +
      String(d.getUTCHours()).padStart(2, '0');

    const data = statsMap.get(hk);
    if (!data) continue;

    impressions += data.impressions;
    clicks += data.clicks;
    out.push({
      hour: hk,
      impressions: data.impressions,
      clicks: data.clicks,
    });
  }

  return { impressions, clicks, hours: out };
}
