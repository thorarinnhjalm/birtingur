import { db } from '../lib/firebase.js';
import { COLLECTIONS } from '@ada/shared/firestore';
import { getCreativeStats } from './creative-stats.js';

export interface TopCreativeEntry {
  creativeId: string;
  advertiserId: string;
  advertiserName?: string;
  width?: number;
  height?: number;
  imageUrl: string;
  impressions: number;
  clicks: number;
  ctr: number;
}

interface FallbackAdStatsEntry {
  creativeId: string;
  name: string;
  imageUrl: string;
  impressions: number;
  clicks: number;
  ctr: number;
}

export interface BotTrafficBreakdown {
  human: number;
  known_bot: number;
  suspected_bot: number;
  unclassified: number;
}

export interface BotTrafficSummary {
  windowDays: number;
  impressions: BotTrafficBreakdown;
  pageViews: BotTrafficBreakdown;
}

export interface AdminStatsResponse {
  totalImpressions: number;
  totalClicks: number;
  totalRevenueIsk: number;
  platformFeeIsk: number;
  p95LatencyMs: number;
  systemStatus: string;
  topCreatives: TopCreativeEntry[];
  fallbackStats: FallbackAdStatsEntry[];
  publishersCount: number;
  advertisersCount: number;
  slotsCount: number;
  campaignsCount: number;
  // Bot-classification measurement summary (see docs/superpowers/sdd/
  // 2026-08-09-bot-classification-phase1) — 7-day trailing window across
  // active publishers, or `null` when no publisher-day document in that
  // window carries the `byBotClass` field at all (e.g. before the
  // classifier deploy landed). Never zeros in that case — the UI must show
  // an explanation instead, not a misleading all-zero breakdown.
  botTraffic: BotTrafficSummary | null;
}

async function getSystemFallbackStats(): Promise<FallbackAdStatsEntry[]> {
  const fallbacks = [
    {
      creativeId: 'cre_fallback_birtingur',
      name: 'Húsaauglýsing (Birtingur kynning)',
      imageUrl: '',
    },
    {
      creativeId: 'cre_fallback_transparent',
      name: 'Gagnsætt fallback (Ekkert pláss/tóm)',
      imageUrl: '',
    },
  ];

  const entries: FallbackAdStatsEntry[] = [];
  for (const f of fallbacks) {
    try {
      const stats = await getCreativeStats(f.creativeId, 168); // 7 days
      entries.push({
        creativeId: f.creativeId,
        name: f.name,
        imageUrl: f.imageUrl,
        impressions: stats.impressions,
        clicks: stats.clicks,
        ctr: stats.ctr,
      });
    } catch (err) {
      console.error(`Failed to get stats for fallback creative ${f.creativeId}:`, err);
      entries.push({
        creativeId: f.creativeId,
        name: f.name,
        imageUrl: f.imageUrl,
        impressions: 0,
        clicks: 0,
        ctr: 0,
      });
    }
  }

  return entries;
}

async function getTopCreativesAcrossSystem(limit = 5): Promise<TopCreativeEntry[]> {
  const snap = await db.collection(COLLECTIONS.creatives).get();
  const entries: TopCreativeEntry[] = [];

  await Promise.all(
    snap.docs.map(async (doc) => {
      const data = doc.data();
      const stats = await getCreativeStats(doc.id, 168); // 7 days

      let advertiserName = 'Óþekktur auglýsandi';
      if (data.advertiserId) {
        try {
          const advDoc = await db.collection(COLLECTIONS.advertisers).doc(data.advertiserId).get();
          if (advDoc.exists) {
            advertiserName = advDoc.data()?.companyName || advertiserName;
          }
        } catch (err) {
          console.error(`Failed to fetch advertiser ${data.advertiserId}:`, err);
        }
      }

      entries.push({
        creativeId: doc.id,
        advertiserId: data.advertiserId ?? '',
        advertiserName,
        width: data.width,
        height: data.height,
        imageUrl: data.imageUrl ?? '',
        impressions: stats.impressions,
        clicks: stats.clicks,
        ctr: stats.ctr,
      });
    }),
  );

  entries.sort((a, b) => b.impressions - a.impressions);
  return entries.slice(0, limit);
}

const BOT_TRAFFIC_WINDOW_DAYS = 7;
const BOT_CLASSES = ['human', 'known_bot', 'suspected_bot'] as const;
type BotClass = (typeof BOT_CLASSES)[number];

// Trailing N complete days (yesterday back N days, excluding today's
// still-accumulating partial day) — same convention as
// `getCategoryInventory`'s `lastNDateKeys` in services/inventory.ts,
// duplicated locally rather than imported across that module boundary.
function lastNDateKeys(n: number): string[] {
  const keys: string[] = [];
  const now = new Date();
  for (let i = 1; i <= n; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    keys.push(d.toISOString().split('T')[0]!.replace(/-/g, ''));
  }
  return keys;
}

// Reuses the publisher-day document traversal `getCategoryInventory`
// already established (active publishers × trailing date keys →
// `stats/publishers/{id}/{YYYYMMDD}`) rather than adding a second
// independent walk. `byBotClass` is publisher-day-only (see
// stats-aggregator.ts), so no campaign-hour or publisher-slot-day reads are
// needed here.
async function getBotTrafficSummary(
  windowDays = BOT_TRAFFIC_WINDOW_DAYS,
): Promise<BotTrafficSummary | null> {
  const pubSnap = await db.collection(COLLECTIONS.publishers).where('status', '==', 'active').get();

  const dateKeys = lastNDateKeys(windowDays);
  const docPromises = [];
  for (const pubDoc of pubSnap.docs) {
    for (const dk of dateKeys) {
      docPromises.push(db.doc(`${COLLECTIONS.stats}/publishers/${pubDoc.id}/${dk}`).get());
    }
  }
  const snaps = await Promise.all(docPromises);

  let totalImpressions = 0;
  let totalPageViews = 0;
  const classImpressions: Record<BotClass, number> = { human: 0, known_bot: 0, suspected_bot: 0 };
  const classPageViews: Record<BotClass, number> = { human: 0, known_bot: 0, suspected_bot: 0 };
  // Tracks whether ANY document in the window carries `byBotClass` at all —
  // distinct from "every class is present" or "counts are nonzero". A
  // window with zero such documents (e.g. entirely pre-classifier data)
  // must produce `null`, never a breakdown that reads as "100% human".
  let sawByBotClass = false;

  for (const snap of snaps) {
    const data = snap.data();
    if (!data) continue;
    totalImpressions += data.impressions ?? 0;
    totalPageViews += data.pageViewsTrue ?? 0;

    const byBotClass = data.byBotClass as
      | Record<string, { impressions?: number; pageViewsTrue?: number }>
      | undefined;
    if (byBotClass) {
      sawByBotClass = true;
      for (const cls of BOT_CLASSES) {
        const counts = byBotClass[cls];
        if (!counts) continue;
        classImpressions[cls] += counts.impressions ?? 0;
        classPageViews[cls] += counts.pageViewsTrue ?? 0;
      }
    }
  }

  if (!sawByBotClass) return null;

  const classifiedImpressions = BOT_CLASSES.reduce((sum, cls) => sum + classImpressions[cls], 0);
  const classifiedPageViews = BOT_CLASSES.reduce((sum, cls) => sum + classPageViews[cls], 0);

  return {
    windowDays,
    impressions: {
      ...classImpressions,
      // Events queued before the serving deploy carry no botClass at all
      // (see QueuedEvent.botClass), so total minus the sum of the known
      // classes is the honest unclassified remainder — floored at 0 as a
      // defensive guard, never left negative or hidden.
      unclassified: Math.max(0, totalImpressions - classifiedImpressions),
    },
    pageViews: {
      ...classPageViews,
      unclassified: Math.max(0, totalPageViews - classifiedPageViews),
    },
  };
}

export async function getAdminStats(): Promise<AdminStatsResponse> {
  let totalImpressions = 0;
  let totalClicks = 0;
  let totalRevenueIsk = 0;
  let platformFeeIsk = 0;
  let hasRealData = false;

  let publishersCount = 0;
  let advertisersCount = 0;
  let slotsCount = 0;
  let campaignsCount = 0;

  try {
    const [publishersSnap, advertisersSnap, slotsSnap, campaignsSnap] = await Promise.all([
      db.collection(COLLECTIONS.publishers).get(),
      db.collection(COLLECTIONS.advertisers).get(),
      db.collection(COLLECTIONS.slots).get(),
      db.collection(COLLECTIONS.campaigns).get(),
    ]);
    publishersCount = publishersSnap.size;
    advertisersCount = advertisersSnap.size;
    slotsCount = slotsSnap.size;
    campaignsCount = campaignsSnap.size;
  } catch (err) {
    console.error('Failed to fetch admin stats entity counts:', err);
  }

  try {
    // 1. Sum up impressions and clicks from campaign stats in parallel
    const campaignsSnap = await db.collection(COLLECTIONS.campaigns).get();
    const statsPromises = campaignsSnap.docs.map((doc) =>
      db.collection(`${COLLECTIONS.stats}/campaigns/${doc.id}`).get(),
    );
    const statsSnapshots = await Promise.all(statsPromises);
    for (const statsSnap of statsSnapshots) {
      for (const sDoc of statsSnap.docs) {
        hasRealData = true;
        const data = sDoc.data();
        totalImpressions += data.impressions || 0;
        totalClicks += data.clicks || 0;
      }
    }

    // 2. Sum up revenues from ledger entries
    const ledgerSnap = await db
      .collection(COLLECTIONS.ledger)
      .where('type', 'in', ['campaign_charge', 'platform_fee'])
      .get();

    for (const doc of ledgerSnap.docs) {
      const data = doc.data();
      hasRealData = true;
      if (data.type === 'campaign_charge') {
        totalRevenueIsk += Math.abs(data.amountIsk || 0);
      } else if (data.type === 'platform_fee') {
        platformFeeIsk += Math.abs(data.amountIsk || 0);
      }
    }
  } catch (err) {
    console.error('Failed to fetch real admin stats:', err);
  }

  // 3. Get top creatives
  let topCreatives: TopCreativeEntry[] = [];
  try {
    topCreatives = await getTopCreativesAcrossSystem();
  } catch (err) {
    console.error('Failed to fetch top creatives:', err);
  }

  // 4. Get system fallback/filler stats
  let fallbackStats: FallbackAdStatsEntry[] = [];
  try {
    fallbackStats = await getSystemFallbackStats();
  } catch (err) {
    console.error('Failed to fetch fallback stats:', err);
  }

  // 5. Bot-classification measurement summary (7-day trailing window) — a
  // genuinely real Firestore aggregate on its own, independent of
  // hasRealData, so it's computed once and included in both return branches
  // below, never faked alongside the dev/emulator mock numbers.
  let botTraffic: BotTrafficSummary | null = null;
  try {
    botTraffic = await getBotTrafficSummary();
  } catch (err) {
    console.error('Failed to compute bot traffic summary:', err);
  }

  // 6. Fallback to mock data if empty and running in dev/emulator
  const isDevOrEmulator =
    process.env.FIRESTORE_EMULATOR_HOST != null || process.env.NODE_ENV === 'development';
  if (!hasRealData && isDevOrEmulator) {
    const populatedFallbackStats = fallbackStats.map((f) => {
      if (f.impressions === 0) {
        if (f.creativeId === 'cre_fallback_birtingur') {
          return { ...f, impressions: 34200, clicks: 820, ctr: (820 / 34200) * 100 };
        } else {
          return { ...f, impressions: 12400, clicks: 0, ctr: 0 };
        }
      }
      return f;
    });

    return {
      totalImpressions: 4820900,
      totalClicks: 168700,
      totalRevenueIsk: 1350000,
      platformFeeIsk: 270000, // 20% platform fee
      p95LatencyMs: 24,
      systemStatus: 'OK',
      topCreatives,
      fallbackStats: populatedFallbackStats,
      publishersCount: publishersCount || 3,
      advertisersCount: advertisersCount || 5,
      slotsCount: slotsCount || 8,
      campaignsCount: campaignsCount || 6,
      botTraffic,
    };
  }

  return {
    totalImpressions,
    totalClicks,
    totalRevenueIsk,
    platformFeeIsk,
    p95LatencyMs: 24,
    systemStatus: 'OK',
    topCreatives,
    fallbackStats,
    publishersCount,
    advertisersCount,
    slotsCount,
    campaignsCount,
    botTraffic,
  };
}
