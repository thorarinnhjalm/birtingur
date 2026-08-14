import { db } from '../lib/firebase.js';
import { COLLECTIONS } from '@ada/shared/firestore';
import { FLAT_CPM_ISK, publisherNetIsk, grossIskForImpressions } from '@ada/shared';
import { getCampaign } from './campaigns.js';
import { getAdvertiserById } from './advertisers.js';

export interface SlotStatsResponse {
  impressions: number;
  clicks: number;
  spendIsk: number;
  pageviews: number;
  // Ad requests that got no advertiser. Absent — not zero — for windows before
  // the aggregator began counting it, so the UI can say "not measured" instead
  // of claiming perfect fill. Written per slot by stats-aggregator.ts.
  unfilled?: number;
  // Requests over EXACTLY the days that measured `unfilled`. `pageviews` covers
  // the whole window, so it is the wrong denominator for a fill rate — see the
  // same field on PublisherStatsResponse.
  requestsWithFillData?: number;
  history: {
    date: string;
    impressions: number;
    clicks: number;
    spendIsk: number;
    pageviews: number;
  }[];
  byCampaign?: Record<
    string,
    {
      campaignName: string;
      advertiserName: string;
      impressions: number;
      clicks: number;
      earningsIsk: number;
    }
  >;
}

export async function getSlotStats(
  publisherId: string,
  slotId: string,
  timeframeDays: 7 | 30 = 7,
): Promise<SlotStatsResponse> {
  const history: SlotStatsResponse['history'] = [];
  let impressions = 0;
  let clicks = 0;
  let pageviews = 0;
  let unfilled = 0;
  let anyUnfilled = false;
  let requestsWithFillData = 0;
  const now = new Date();
  let hasRealData = false;

  const promises = Array.from({ length: timeframeDays }, (_, index) => {
    const i = timeframeDays - 1 - index;
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const dateStr = d.toISOString().split('T')[0]!; // YYYY-MM-DD
    const dk = dateStr.replace(/-/g, ''); // YYYYMMDD

    const ref = db.doc(`${COLLECTIONS.stats}/publisher_slots/${publisherId}_${slotId}/${dk}`);
    return ref.get().then((snap) => {
      if (snap.exists) {
        const data = snap.data();
        return {
          date: dateStr,
          impressions: (data?.impressions as number) || 0,
          clicks: (data?.clicks as number) || 0,
          spendIsk: (data?.spendIsk as number) || 0,
          pageviews: (data?.pageviews as number) || 0,
          unfilled: typeof data?.unfilled === 'number' ? (data.unfilled as number) : undefined,
          byCampaign:
            (data?.byCampaign as Record<string, { impressions: number; clicks: number }>) || {},
          exists: true,
        };
      }
      return {
        date: dateStr,
        impressions: 0,
        clicks: 0,
        spendIsk: 0,
        pageviews: 0,
        unfilled: undefined,
        byCampaign: {},
        exists: false,
      };
    });
  });

  const results = await Promise.all(promises);

  const campaignAgg: Record<string, { impressions: number; clicks: number }> = {};

  for (const res of results) {
    if (res.exists) {
      hasRealData = true;
    }
    history.push({
      date: res.date,
      impressions: res.impressions,
      clicks: res.clicks,
      spendIsk: res.spendIsk,
      pageviews: res.pageviews,
    });
    impressions += res.impressions;
    clicks += res.clicks;
    // Not summed: the window figure is derived once from the window's
    // impressions, so it does not inherit a rounding error per day.
    pageviews += res.pageviews;
    if (res.unfilled !== undefined) {
      anyUnfilled = true;
      unfilled += res.unfilled;
      requestsWithFillData += res.pageviews;
    }

    for (const [campId, stats] of Object.entries(res.byCampaign)) {
      if (!campaignAgg[campId]) {
        campaignAgg[campId] = { impressions: 0, clicks: 0 };
      }
      campaignAgg[campId]!.impressions += stats.impressions || 0;
      campaignAgg[campId]!.clicks += stats.clicks || 0;
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
      const baseImpressions =
        3000 + Math.floor(Math.sin(i * 0.8) * 1000) + Math.floor(Math.random() * 800);
      const multiplier = dayOfWeek === 0 || dayOfWeek === 6 ? 0.7 : 1.0;
      const dayImpressions = Math.floor(baseImpressions * multiplier);

      const ctr = 0.02 + Math.sin(i * 0.5) * 0.005 + Math.random() * 0.008;
      const dayClicks = Math.floor(dayImpressions * ctr);
      const daySpendIsk = Math.floor((dayImpressions / 1000) * FLAT_CPM_ISK);
      const dayPageviews = Math.floor(dayImpressions * (1.8 + Math.random() * 1.2)) + 50;

      mockHistory.push({
        date: dateStr,
        impressions: dayImpressions,
        clicks: dayClicks,
        // Derived from the day's impressions, never the stored per-run sum —
        // see grossIskForImpressions in @ada/shared.
        spendIsk: grossIskForImpressions(dayImpressions),
        pageviews: dayPageviews,
      });

      mockTotalImpressions += dayImpressions;
      mockTotalClicks += dayClicks;
      mockTotalSpendIsk += daySpendIsk;
      mockTotalPageviews += dayPageviews;
    }

    const mockByCampaign: NonNullable<SlotStatsResponse['byCampaign']> = {
      cmp_matarhorn: {
        campaignName: 'Sumargrill og veislufang',
        advertiserName: 'Matarhorn ehf.',
        impressions: Math.round(mockTotalImpressions * 0.6),
        clicks: Math.round(mockTotalClicks * 0.65),
        earningsIsk: publisherNetIsk(
          Math.round(((mockTotalImpressions * 0.6) / 1000) * FLAT_CPM_ISK),
        ),
      },
      cmp_origo_tech: {
        campaignName: 'Nýjar fartölvur í skólann',
        advertiserName: 'Origo ehf.',
        impressions: Math.round(mockTotalImpressions * 0.4),
        clicks: Math.round(mockTotalClicks * 0.35),
        earningsIsk: publisherNetIsk(
          Math.round(((mockTotalImpressions * 0.4) / 1000) * FLAT_CPM_ISK),
        ),
      },
    };

    return {
      impressions: mockTotalImpressions,
      clicks: mockTotalClicks,
      spendIsk: mockTotalSpendIsk,
      pageviews: mockTotalPageviews,
      history: mockHistory,
      byCampaign: mockByCampaign,
    };
  }

  // Resolve metadata for real data
  const byCampaign: NonNullable<SlotStatsResponse['byCampaign']> = {};
  const campIds = Object.keys(campaignAgg);

  await Promise.all(
    campIds.map(async (campId) => {
      if (campId === 'cmp_fallback') {
        byCampaign[campId] = {
          campaignName: 'Kynningarefni Birtings (Húsauglýsing)',
          advertiserName: 'Birtingur',
          impressions: campaignAgg[campId]!.impressions,
          clicks: campaignAgg[campId]!.clicks,
          earningsIsk: 0,
        };
        return;
      }

      try {
        const camp = await getCampaign(campId);
        let campaignName = 'Óþekkt herferð';
        let advertiserName = 'Óþekktur auglýsandi';

        if (camp) {
          campaignName = camp.name || `Herferð ${camp.id.substring(4, 10)}`;
          const adv = await getAdvertiserById(camp.advertiserId);
          if (adv) {
            advertiserName = adv.companyName;
          }
        }

        const impressionsVal = campaignAgg[campId]!.impressions;
        const clicksVal = campaignAgg[campId]!.clicks;
        const earningsIsk = publisherNetIsk(grossIskForImpressions(impressionsVal));

        byCampaign[campId] = {
          campaignName,
          advertiserName,
          impressions: impressionsVal,
          clicks: clicksVal,
          earningsIsk,
        };
      } catch (err) {
        console.error(`Failed to resolve campaign metadata for ${campId}:`, err);
        const impressionsVal = campaignAgg[campId]!.impressions;
        const clicksVal = campaignAgg[campId]!.clicks;
        byCampaign[campId] = {
          campaignName: 'Óþekkt herferð',
          advertiserName: 'Óþekktur auglýsandi',
          impressions: impressionsVal,
          clicks: clicksVal,
          earningsIsk: publisherNetIsk(grossIskForImpressions(impressionsVal)),
        };
      }
    }),
  );

  return {
    impressions,
    clicks,
    spendIsk: grossIskForImpressions(impressions),
    pageviews,
    // Absent, never 0, for a window with no measured day — see the field's doc.
    unfilled: anyUnfilled ? unfilled : undefined,
    requestsWithFillData: anyUnfilled ? requestsWithFillData : undefined,
    history,
    byCampaign,
  };
}
