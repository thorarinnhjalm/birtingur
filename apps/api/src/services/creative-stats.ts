import { COLLECTIONS } from '@ada/shared/firestore';
import { db } from '../lib/firebase.js';
import { listCreativesForAdvertiser } from './creatives.js';

export interface CreativeStatsResponse {
  impressions: number;
  clicks: number;
  ctr: number;
  hours: Array<{ hour: string; impressions: number; clicks: number }>;
}

export interface BulkCreativeStats {
  [creativeId: string]: { impressions: number; clicks: number; ctr: number };
}

export async function getCreativeStats(
  creativeId: string,
  hours = 24 * 30,
): Promise<CreativeStatsResponse> {
  const out: CreativeStatsResponse['hours'] = [];
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
  const snap = await db.collection(`${COLLECTIONS.stats}/creatives/${creativeId}`).get();

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

  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;

  return { impressions, clicks, ctr, hours: out };
}

/**
 * Fetch stats for ALL creatives belonging to an advertiser in one batch.
 * Returns a map of creativeId → { impressions, clicks, ctr }.
 */
export async function getAllCreativeStatsForAdvertiser(
  advertiserId: string,
  hours = 168,
): Promise<BulkCreativeStats> {
  const creatives = await listCreativesForAdvertiser(advertiserId);
  const results: BulkCreativeStats = {};

  await Promise.all(
    creatives.map(async (cre) => {
      const s = await getCreativeStats(cre.id, hours);
      results[cre.id] = {
        impressions: s.impressions,
        clicks: s.clicks,
        ctr: s.ctr,
      };
    }),
  );

  return results;
}
