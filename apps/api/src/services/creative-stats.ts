import { COLLECTIONS } from '@ada/shared/firestore';
import { db } from '../lib/firebase.js';

export interface CreativeStatsResponse {
  impressions: number;
  clicks: number;
  ctr: number;
  hours: Array<{ hour: string; impressions: number; clicks: number }>;
}

export async function getCreativeStats(
  creativeId: string,
  hours = 24 * 30,
): Promise<CreativeStatsResponse> {
  const out: CreativeStatsResponse['hours'] = [];
  let impressions = 0;
  let clicks = 0;
  const now = new Date();

  for (let i = 0; i < hours; i++) {
    const d = new Date(now.getTime() - i * 3600_000);
    const hk =
      d.getUTCFullYear().toString() +
      String(d.getUTCMonth() + 1).padStart(2, '0') +
      String(d.getUTCDate()).padStart(2, '0') +
      String(d.getUTCHours()).padStart(2, '0');

    const snap = await db.doc(`${COLLECTIONS.stats}/creatives/${creativeId}/${hk}`).get();
    if (!snap.exists) continue;
    const data = snap.data();
    if (!data) continue;

    const imp = (data.impressions as number) ?? 0;
    const clk = (data.clicks as number) ?? 0;

    impressions += imp;
    clicks += clk;
    out.push({
      hour: hk,
      impressions: imp,
      clicks: clk,
    });
  }

  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;

  return { impressions, clicks, ctr, hours: out };
}
