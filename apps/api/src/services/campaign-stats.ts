import { COLLECTIONS } from '@ada/shared/firestore';
import { FLAT_CPM_ISK } from '@ada/shared';
import { db } from '../lib/firebase.js';
import { getPublisherById } from './publishers.js';
import { getCreative } from './creatives.js';

export const UNATTRIBUTED_CREATIVE_ID = '__unattributed';

export interface CreativeSiteBreakdown {
  impressions: number;
  clicks: number;
  label: string; // "300×250", or the creative id if deleted, or the Icelandic legacy label
  imageUrl: string | null;
}

export interface PublisherStatsBreakdown {
  impressions: number;
  clicks: number;
  spendIsk: number;
  displayName: string;
  domain: string;
  byCreative?: Record<string, CreativeSiteBreakdown>; // present only when non-empty
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
  options?: number | { hours?: number; startDate?: string; endDate?: string },
): Promise<CampaignStatsResponse> {
  const out: CampaignStatsResponse['hours'] = [];
  let impressions = 0;
  let clicks = 0;
  const now = new Date();

  let hours = 24 * 30;
  let startDateStr: string | undefined;
  let endDateStr: string | undefined;

  if (typeof options === 'number') {
    hours = options;
  } else if (options) {
    hours = options.hours ?? 24 * 30;
    startDateStr = options.startDate;
    endDateStr = options.endDate;
  }

  let minDate = new Date(now.getTime() - hours * 3600_000);
  let maxDate = now;
  let hoursCount = hours;

  if (startDateStr && endDateStr) {
    minDate = new Date(startDateStr);
    minDate.setUTCHours(0, 0, 0, 0);

    maxDate = new Date(endDateStr);
    maxDate.setUTCHours(23, 59, 59, 999);

    hoursCount = Math.ceil((maxDate.getTime() - minDate.getTime()) / 3600_000);
  }

  const minHk =
    minDate.getUTCFullYear().toString() +
    String(minDate.getUTCMonth() + 1).padStart(2, '0') +
    String(minDate.getUTCDate()).padStart(2, '0') +
    String(minDate.getUTCHours()).padStart(2, '0');

  const maxHk =
    maxDate.getUTCFullYear().toString() +
    String(maxDate.getUTCMonth() + 1).padStart(2, '0') +
    String(maxDate.getUTCDate()).padStart(2, '0') +
    String(maxDate.getUTCHours()).padStart(2, '0');

  // Fetch all documents from the subcollection in a single request
  const snap = await db.collection(`${COLLECTIONS.stats}/campaigns/${campaignId}`).get();

  const statsMap = new Map<
    string,
    {
      impressions: number;
      clicks: number;
      byPublisher?: Record<string, any>;
      byPublisherCreative?: Record<string, any>;
    }
  >();
  for (const doc of snap.docs) {
    const hk = doc.id;
    if (hk >= minHk && hk <= maxHk) {
      const data = doc.data();
      statsMap.set(hk, {
        impressions: (data.impressions as number) ?? 0,
        clicks: (data.clicks as number) ?? 0,
        byPublisher: data.byPublisher,
        byPublisherCreative: data.byPublisherCreative,
      });
    }
  }

  const byPublisherAggregate: Record<
    string,
    { impressions: number; clicks: number; spendIsk: number }
  > = {};

  const byPublisherCreativeAggregate: Record<
    string,
    Record<string, { impressions: number; clicks: number }>
  > = {};
  let anyCreativeData = false;

  for (let i = 0; i < hoursCount; i++) {
    const d = new Date(maxDate.getTime() - i * 3600_000);
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

    if (data.byPublisherCreative) {
      anyCreativeData = true;
      for (const [pubId, creatives] of Object.entries(data.byPublisherCreative)) {
        const forPub = (byPublisherCreativeAggregate[pubId] ??= {});
        for (const [creativeId, cs] of Object.entries(
          creatives as Record<string, { impressions?: number; clicks?: number }>,
        )) {
          const t = (forPub[creativeId] ??= { impressions: 0, clicks: 0 });
          t.impressions += cs.impressions || 0;
          t.clicks += cs.clicks || 0;
        }
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

  if (anyCreativeData) {
    const creativeIds = [
      ...new Set(Object.values(byPublisherCreativeAggregate).flatMap((m) => Object.keys(m))),
    ];
    const creatives = await Promise.all(creativeIds.map((id) => getCreative(id)));
    const creativeMeta = new Map(
      creativeIds.map((id, i) => {
        const cre = creatives[i];
        return [
          id,
          {
            label: cre ? `${cre.width}×${cre.height}` : id,
            imageUrl: cre?.imageUrl ?? null,
          },
        ] as const;
      }),
    );

    for (const [pubId, entry] of Object.entries(enrichedByPublisher)) {
      const agg = byPublisherCreativeAggregate[pubId] ?? {};
      const byCreative: Record<string, CreativeSiteBreakdown> = {};
      let attributedImp = 0;
      let attributedClk = 0;
      for (const [creativeId, cs] of Object.entries(agg)) {
        if (cs.impressions === 0 && cs.clicks === 0) continue;
        const meta = creativeMeta.get(creativeId)!;
        byCreative[creativeId] = { ...cs, ...meta };
        attributedImp += cs.impressions;
        attributedClk += cs.clicks;
      }
      const restImp = entry.impressions - attributedImp;
      const restClk = entry.clicks - attributedClk;
      if (restImp > 0 || restClk > 0) {
        byCreative[UNATTRIBUTED_CREATIVE_ID] = {
          impressions: Math.max(0, restImp),
          clicks: Math.max(0, restClk),
          label: 'Eldri gögn (fyrir sundurliðun)',
          imageUrl: null,
        };
      }
      if (Object.keys(byCreative).length > 0) entry.byCreative = byCreative;
    }
  }

  const spendIsk = Math.round((impressions / 1000) * FLAT_CPM_ISK);

  return { impressions, clicks, spendIsk, hours: out, byPublisher: enrichedByPublisher };
}
