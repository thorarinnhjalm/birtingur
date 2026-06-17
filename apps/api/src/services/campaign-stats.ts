import { COLLECTIONS } from '@ada/shared/firestore';
import { FLAT_CPM_ISK } from '@ada/shared';
import { db } from '../lib/firebase.js';
import { getPublisherById } from './publishers.js';

export interface PublisherStatsBreakdown {
  impressions: number;
  clicks: number;
  spendIsk: number;
  displayName: string;
  domain: string;
}

export interface CampaignStatsResponse {
  impressions: number;
  clicks: number;
  spendIsk: number;
  hours: Array<{ hour: string; impressions: number; clicks: number }>;
  byPublisher: Record<string, PublisherStatsBreakdown>;
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

  const statsMap = new Map<
    string,
    { impressions: number; clicks: number; byPublisher?: Record<string, any> }
  >();
  for (const doc of snap.docs) {
    const hk = doc.id;
    if (hk >= minHk) {
      const data = doc.data();
      statsMap.set(hk, {
        impressions: (data.impressions as number) ?? 0,
        clicks: (data.clicks as number) ?? 0,
        byPublisher: data.byPublisher,
      });
    }
  }

  const byPublisherAggregate: Record<
    string,
    { impressions: number; clicks: number; spendIsk: number }
  > = {};

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

    if (data.byPublisher) {
      for (const [pubId, pubStats] of Object.entries(data.byPublisher)) {
        if (!byPublisherAggregate[pubId]) {
          byPublisherAggregate[pubId] = { impressions: 0, clicks: 0, spendIsk: 0 };
        }
        const pImp = (pubStats as any).impressions || 0;
        const pClk = (pubStats as any).clicks || 0;
        const pSpend = (pubStats as any).spendIsk || Math.round((pImp / 1000) * FLAT_CPM_ISK);
        byPublisherAggregate[pubId]!.impressions += pImp;
        byPublisherAggregate[pubId]!.clicks += pClk;
        byPublisherAggregate[pubId]!.spendIsk += pSpend;
      }
    }
  }

  const publisherIds = Object.keys(byPublisherAggregate);
  const enrichedByPublisher: Record<string, PublisherStatsBreakdown> = {};

  if (publisherIds.length > 0) {
    const pubSnaps = await Promise.all(publisherIds.map((pubId) => getPublisherById(pubId)));

    for (let i = 0; i < publisherIds.length; i++) {
      const pubId = publisherIds[i]!;
      const pubInfo = pubSnaps[i];
      const agg = byPublisherAggregate[pubId]!;
      enrichedByPublisher[pubId] = {
        impressions: agg.impressions,
        clicks: agg.clicks,
        spendIsk: agg.spendIsk,
        displayName: pubInfo?.displayName || 'Óþekktur vefur',
        domain: pubInfo?.domain || 'óþekkt lén',
      };
    }
  }

  const spendIsk = Math.round((impressions / 1000) * FLAT_CPM_ISK);

  return { impressions, clicks, spendIsk, hours: out, byPublisher: enrichedByPublisher };
}
