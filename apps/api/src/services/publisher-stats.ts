import { db } from '../lib/firebase.js';
import { COLLECTIONS } from '@ada/shared/firestore';
import type { PublisherStatsBreakdown } from '@ada/shared/types';
import { publisherNetIsk, grossIskForImpressions } from '@ada/shared';

/**
 * True-page-view counts split by bot class, rolled up for the response.
 *
 * Stored shape trap: the aggregator writes `byBotClass` keyed by the RAW event
 * strings 'human' | 'known_bot' | 'suspected_bot' (apps/serving/src/lib/
 * bot-class.ts), and each class holds an OBJECT { impressions?, pageViewsTrue? }.
 * A naive `doc.byBotClass.knownBot` read is permanently undefined and, under
 * the absent-not-zero contract, renders as "unmeasured" forever with no error —
 * hence this mapping, pinned by tests. Events with no class are counted in NO
 * bucket, so `pageViewsTrue - Σ classes` is the honest unclassified remainder.
 * The known-bot list is deliberately incomplete (a floor, never a total) and
 * the split has NO billing effect — accrual never reads it.
 */
export interface BotClassPageViews {
  human?: number;
  knownBot?: number;
  suspectedBot?: number;
}

const BOT_CLASS_KEYS: ReadonlyArray<[stored: string, key: keyof BotClassPageViews]> = [
  ['human', 'human'],
  ['known_bot', 'knownBot'],
  ['suspected_bot', 'suspectedBot'],
];

function readBotClassPageViews(raw: unknown): BotClassPageViews | undefined {
  if (raw === null || typeof raw !== 'object') return undefined;
  let out: BotClassPageViews | undefined;
  for (const [stored, key] of BOT_CLASS_KEYS) {
    const entry = (raw as Record<string, unknown>)[stored];
    if (entry === null || typeof entry !== 'object') continue;
    const v = (entry as Record<string, unknown>).pageViewsTrue;
    if (typeof v === 'number') {
      out ??= {};
      out[key] = (out[key] ?? 0) + v;
    }
  }
  return out;
}

function readByCountry(raw: unknown): Record<string, number> | undefined {
  if (raw === null || typeof raw !== 'object') return undefined;
  let out: Record<string, number> | undefined;
  for (const [cc, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'number') {
      out ??= {};
      out[cc] = (out[cc] ?? 0) + v;
    }
  }
  return out;
}

function addByCountry(
  acc: Record<string, number> | undefined,
  add: Record<string, number> | undefined,
): Record<string, number> | undefined {
  if (!add) return acc;
  const out: Record<string, number> = { ...(acc ?? {}) };
  for (const [cc, v] of Object.entries(add)) out[cc] = (out[cc] ?? 0) + v;
  return out;
}

function addBotClassPageViews(
  acc: BotClassPageViews | undefined,
  add: BotClassPageViews | undefined,
): BotClassPageViews | undefined {
  if (!add) return acc;
  const out: BotClassPageViews = { ...(acc ?? {}) };
  for (const [, key] of BOT_CLASS_KEYS) {
    if (add[key] !== undefined) out[key] = (out[key] ?? 0) + add[key]!;
  }
  return out;
}

export interface SiteBreakdown {
  publisherId: string;
  displayName: string;
  domain: string;
  impressions: number;
  clicks: number;
  pageviews: number;
  // Real page views (Task 4). Absent — not zero — for a site whose window
  // has no post-switch day with measured true traffic yet.
  pageViewsTrue?: number;
  // Ad requests that came back with no advertiser (house ad, transparent
  // placeholder, or a cold cache). Absent — not zero — for a window with no day
  // the aggregator measured it, so the UI can say "not measured yet" instead of
  // claiming perfect fill. Written from 2026-08-14 forward; every earlier day
  // has the field missing by construction.
  unfilled?: number;
  // Requests over exactly the days that measured `unfilled` for this site — the
  // denominator the per-site fill column must use. See the same field on
  // PublisherStatsResponse for why `pageviews` is the wrong one.
  requestsWithFillData?: number;
  spendIsk: number;
  // Requests and derived spend over exactly the days that measured
  // `pageViewsTrue` for this site — the pair a per-site "tekjur á 1.000
  // síðuflettingar" figure must divide. `spendIsk` above spans the whole
  // window while `pageViewsTrue` spans only the measured part, so dividing
  // those two is the same window mismatch requestsWithFillData exists to
  // prevent. Absent whenever `pageViewsTrue` is.
  requestsWithTrafficData?: number;
  spendIskWithTrafficData?: number;
  // True page views split by bot class, this site's measured days only.
  botClass?: BotClassPageViews;
}

export interface PublisherStatsResponse extends PublisherStatsBreakdown {
  // Real page views summed across the window. Absent — not zero — when no
  // day in the window has a measured value (all pre-switch, or no data at
  // all): the UI must render "no accurate data yet", never a false zero.
  pageViewsTrue?: number;
  // Ad requests that came back with no advertiser (house ad, transparent
  // placeholder, or a cold cache). Absent — not zero — for a window with no day
  // the aggregator measured it, so the UI can say "not measured yet" instead of
  // claiming perfect fill. Written from 2026-08-14 forward; every earlier day
  // has the field missing by construction.
  unfilled?: number;
  // What the publisher actually earns from `spendIsk`, net of the platform fee.
  //
  // Returned rather than left to the caller because one caller cannot derive it:
  // the embeddable stats widget (packages/widgets) has no dependency on
  // @ada/shared, so it rendered the GROSS figure under "Áætlaðar tekjur" — 25%
  // high, on a page the publisher embeds on their own site.
  netEarningsIsk: number;
  // The request count over EXACTLY the days that carry an `unfilled` value, so
  // a caller can compute fill without mixing two windows.
  //
  // Caveat worth knowing: the aggregator writes the field only when the count is
  // non-zero (`if (b.unfilled)` in stats-aggregator.ts), so a day on which every
  // single request found an advertiser is indistinguishable from a day before
  // the counter existed, and is excluded here. That biases the reported fill
  // rate DOWN, never up, and `impressionsWithFillData` is excluded with it so
  // the chain stays internally consistent. Fixing it means writing an explicit
  // zero for measured days, which the absent-not-zero contract currently
  // forbids — a separate change with its own test. `pageviews` above spans
  // the whole window while `unfilled` spans only the measured part of it, and
  // dividing one by the other is how a site with a real 50% fill rate came to
  // report 98%. Absent whenever `unfilled` is.
  requestsWithFillData?: number;
  // Impressions over the same measured days. The chain's second gap is
  // `filled - impressions`, and filled already covers only the measured days —
  // subtracting a whole-window impression count from it produces a negative
  // gap and a view rate above 100%.
  impressionsWithFillData?: number;
  // Same pairing for real page views: requests over exactly the days that
  // measured `pageViewsTrue`, so "requests per page view" divides two figures
  // covering the same period.
  requestsWithTrafficData?: number;
  // Derived spend over those same measured days — the numerator for a
  // "tekjur á 1.000 síðuflettingar" figure whose denominator is pageViewsTrue.
  spendIskWithTrafficData?: number;
  // True page views split by bot class (see BotClassPageViews). Absent — never
  // zeroed — when no day in the window carries the stored byBotClass field.
  botClass?: BotClassPageViews;
  // True page views split by reader country (ISO code, 'XX' = unknown),
  // measured from COUNTRY_MEASUREMENT_START. Absent when no day carries it.
  byCountry?: Record<string, number>;
  history: {
    date: string;
    impressions: number;
    clicks: number;
    spendIsk: number;
    pageviews: number;
    // Absent for a specific day that has no measured true pageviews (either
    // pre-switch, or a post-switch day the aggregator left unset).
    pageViewsTrue?: number;
    unfilled?: number;
  }[];
  bySite?: SiteBreakdown[];
}

export async function getPublisherStats(
  publisherId: string,
  timeframeDays: 7 | 30 = 7,
): Promise<PublisherStatsResponse> {
  const history: {
    date: string;
    impressions: number;
    clicks: number;
    spendIsk: number;
    pageviews: number;
    pageViewsTrue?: number;
    unfilled?: number;
  }[] = [];
  let totalImpressions = 0;
  let totalClicks = 0;
  let totalPageviews = 0;
  let totalPageViewsTrue = 0;
  // True per-day pageviews are only ever present from the switch date
  // onward (Task 4 leaves the field absent, not zero, before it). Track
  // whether ANY day in the window measured it so the total can stay
  // undefined rather than silently reporting a false zero.
  let anyPageViewsTrue = false;
  let totalUnfilled = 0;
  let anyUnfilled = false;
  // Requests counted only on the days whose partner figure was measured — see
  // requestsWithFillData / requestsWithTrafficData on the response type.
  let requestsWithFillData = 0;
  let impressionsWithFillData = 0;
  let requestsWithTrafficData = 0;
  let impressionsWithTrafficData = 0;
  let botClass: BotClassPageViews | undefined;
  let byCountry: Record<string, number> | undefined;

  const now = new Date();
  let hasRealData = false;

  const promises = Array.from({ length: timeframeDays }, (_, index) => {
    const i = timeframeDays - 1 - index;
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const dateStr = d.toISOString().split('T')[0]!; // YYYY-MM-DD
    const dk = dateStr.replace(/-/g, ''); // YYYYMMDD

    // Fetch the daily stats documents
    const subRef = db.doc(`${COLLECTIONS.stats}/publishers/${publisherId}/${dk}`);
    return subRef.get().then(async (subSnap) => {
      let dayImpressions = 0;
      let dayClicks = 0;
      let dayPageviews = 0;
      // Undefined unless a doc for this day actually carries the field \u2014
      // never defaulted to 0, so a pre-switch (or otherwise unmeasured) day
      // stays distinguishable from a genuine zero-traffic day.
      let dayPageViewsTrue: number | undefined;
      let dayUnfilled: number | undefined;
      let dayBotClass: BotClassPageViews | undefined;
      let dayByCountry: Record<string, number> | undefined;
      let dayHasRealData = false;

      if (subSnap.exists) {
        const data = subSnap.data();
        if (data) {
          dayHasRealData = true;
          dayImpressions = data.impressions || 0;
          dayClicks = data.clicks || 0;
          dayPageviews = data.pageviews || 0;
          if (typeof data.pageViewsTrue === 'number') {
            dayPageViewsTrue = data.pageViewsTrue;
          }
          if (typeof data.unfilled === 'number') {
            dayUnfilled = data.unfilled;
          }
          dayBotClass = readBotClassPageViews(data.byBotClass);
          dayByCountry = readByCountry(data.byCountry);
        }
      } else {
        // 2. Fallback to top-level stats collection
        const snapshot = await db
          .collection(COLLECTIONS.stats)
          .where('__name__', '>=', dateStr)
          .where('__name__', '<=', dateStr + '_\uf8ff')
          .get();

        for (const doc of snapshot.docs) {
          const data = doc.data();
          const pubData = data.byPublisher?.[publisherId];
          if (pubData) {
            dayHasRealData = true;
            dayImpressions += pubData.impressions || 0;
            dayClicks += pubData.clicks || 0;
            dayPageviews += pubData.pageviews || 0;
            if (typeof pubData.pageViewsTrue === 'number') {
              dayPageViewsTrue = (dayPageViewsTrue ?? 0) + pubData.pageViewsTrue;
            }
            if (typeof pubData.unfilled === 'number') {
              dayUnfilled = (dayUnfilled ?? 0) + pubData.unfilled;
            }
            dayBotClass = addBotClassPageViews(
              dayBotClass,
              readBotClassPageViews(pubData.byBotClass),
            );
            dayByCountry = addByCountry(dayByCountry, readByCountry(pubData.byCountry));
          }
        }
      }

      return {
        date: dateStr,
        impressions: dayImpressions,
        clicks: dayClicks,
        // Derived, not the stored per-run sum — see grossIskForImpressions.
        // A day is still a rounding boundary, but the window total below is
        // derived from the window's impressions rather than from these.
        spendIsk: grossIskForImpressions(dayImpressions),
        pageviews: dayPageviews,
        pageViewsTrue: dayPageViewsTrue,
        unfilled: dayUnfilled,
        botClass: dayBotClass,
        byCountry: dayByCountry,
        hasRealData: dayHasRealData,
      };
    });
  });

  const results = await Promise.all(promises);

  for (const res of results) {
    if (res.hasRealData) {
      hasRealData = true;
    }
    history.push({
      date: res.date,
      impressions: res.impressions,
      clicks: res.clicks,
      spendIsk: res.spendIsk,
      pageviews: res.pageviews,
      pageViewsTrue: res.pageViewsTrue,
      unfilled: res.unfilled,
    });

    totalImpressions += res.impressions;
    totalClicks += res.clicks;
    // Deliberately NOT summed: the window's revenue is derived once from the
    // window's impressions below, so the figure does not inherit a rounding
    // error per day on top of the one per aggregation run.
    totalPageviews += res.pageviews;
    if (res.pageViewsTrue !== undefined) {
      anyPageViewsTrue = true;
      totalPageViewsTrue += res.pageViewsTrue;
      requestsWithTrafficData += res.pageviews;
      impressionsWithTrafficData += res.impressions;
    }
    botClass = addBotClassPageViews(botClass, res.botClass);
    byCountry = addByCountry(byCountry, res.byCountry);
    if (res.unfilled !== undefined) {
      anyUnfilled = true;
      totalUnfilled += res.unfilled;
      requestsWithFillData += res.pageviews;
      impressionsWithFillData += res.impressions;
    }
  }

  // 3. Fallback to mock data if empty and running in dev/emulator
  const isDevOrEmulator =
    process.env.FIRESTORE_EMULATOR_HOST != null || process.env.NODE_ENV === 'development';
  if (!hasRealData && isDevOrEmulator) {
    const mockHistory: typeof history = [];
    let mockTotalImpressions = 0;
    let mockTotalClicks = 0;
    let mockTotalPageviews = 0;

    for (let i = timeframeDays - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const dateStr = d.toISOString().split('T')[0]!;

      const dayOfWeek = d.getDay();
      const baseImpressions =
        15000 + Math.floor(Math.sin(i * 0.8) * 5000) + Math.floor(Math.random() * 3000);
      const multiplier = dayOfWeek === 0 || dayOfWeek === 6 ? 0.7 : 1.0;
      const dayImpressions = Math.floor(baseImpressions * multiplier);

      const ctr = 0.02 + Math.sin(i * 0.5) * 0.005 + Math.random() * 0.008;
      const dayClicks = Math.floor(dayImpressions * ctr);
      const daySpendIsk = grossIskForImpressions(dayImpressions);
      // Mock pageviews should be around 1.8x to 3x of impressions, plus some extra fallback hits
      const dayPageviews = Math.floor(dayImpressions * (1.8 + Math.random() * 1.2)) + 150;

      mockHistory.push({
        date: dateStr,
        impressions: dayImpressions,
        clicks: dayClicks,
        spendIsk: daySpendIsk,
        pageviews: dayPageviews,
      });

      mockTotalImpressions += dayImpressions;
      mockTotalClicks += dayClicks;
      mockTotalPageviews += dayPageviews;
    }

    return {
      impressions: mockTotalImpressions,
      clicks: mockTotalClicks,
      spendIsk: grossIskForImpressions(mockTotalImpressions),
      pageviews: mockTotalPageviews,
      netEarningsIsk: publisherNetIsk(grossIskForImpressions(mockTotalImpressions)),
      history: mockHistory,
    };
  }

  return {
    impressions: totalImpressions,
    clicks: totalClicks,
    spendIsk: grossIskForImpressions(totalImpressions),
    pageviews: totalPageviews,
    pageViewsTrue: anyPageViewsTrue ? totalPageViewsTrue : undefined,
    unfilled: anyUnfilled ? totalUnfilled : undefined,
    netEarningsIsk: publisherNetIsk(grossIskForImpressions(totalImpressions)),
    requestsWithFillData: anyUnfilled ? requestsWithFillData : undefined,
    impressionsWithFillData: anyUnfilled ? impressionsWithFillData : undefined,
    requestsWithTrafficData: anyPageViewsTrue ? requestsWithTrafficData : undefined,
    // Derived, like every other spend figure here, so the pair stays consistent
    // with how spendIsk itself is computed from impressions.
    spendIskWithTrafficData: anyPageViewsTrue
      ? grossIskForImpressions(impressionsWithTrafficData)
      : undefined,
    botClass,
    byCountry,
    history,
  };
}

export async function getAggregatedPublisherStats(
  publishers: Array<{ id: string; displayName: string; domain: string }>,
  timeframeDays: 7 | 30 = 7,
): Promise<PublisherStatsResponse> {
  if (publishers.length === 0) {
    return {
      impressions: 0,
      clicks: 0,
      spendIsk: 0,
      pageviews: 0,
      netEarningsIsk: 0,
      history: [],
    };
  }

  // Fetch stats for all publishers in parallel
  const allStats = await Promise.all(publishers.map((p) => getPublisherStats(p.id, timeframeDays)));

  let totalImpressions = 0;
  let totalClicks = 0;
  let totalPageviews = 0;
  let totalPageViewsTrue = 0;
  let anyPageViewsTrue = false;
  let totalUnfilled = 0;
  let anyUnfilled = false;
  let requestsWithFillData = 0;
  let impressionsWithFillData = 0;
  let requestsWithTrafficData = 0;
  let spendIskWithTrafficData = 0;
  let botClass: BotClassPageViews | undefined;
  let byCountry: Record<string, number> | undefined;

  // Use a map to aggregate history by date
  const historyMap: Record<
    string,
    {
      impressions: number;
      clicks: number;
      spendIsk: number;
      pageviews: number;
      pageViewsTrue?: number;
      unfilled?: number;
    }
  > = {};

  for (const stats of allStats) {
    totalImpressions += stats.impressions;
    totalClicks += stats.clicks;
    totalPageviews += stats.pageviews || 0;
    if (stats.pageViewsTrue !== undefined) {
      anyPageViewsTrue = true;
      totalPageViewsTrue += stats.pageViewsTrue;
      // The per-site figure, already narrowed to that site's measured days —
      // summing `stats.pageviews` here would re-import the whole-window count
      // this pairing exists to keep out.
      requestsWithTrafficData += stats.requestsWithTrafficData ?? 0;
      // Summed per site (each already derived from that site's measured-day
      // impressions) — same convention as bySite.spendIsk below.
      spendIskWithTrafficData += stats.spendIskWithTrafficData ?? 0;
    }
    botClass = addBotClassPageViews(botClass, stats.botClass);
    byCountry = addByCountry(byCountry, stats.byCountry);
    if (stats.unfilled !== undefined) {
      anyUnfilled = true;
      totalUnfilled += stats.unfilled;
      requestsWithFillData += stats.requestsWithFillData ?? 0;
      impressionsWithFillData += stats.impressionsWithFillData ?? 0;
    }

    for (const h of stats.history) {
      if (!historyMap[h.date]) {
        historyMap[h.date] = { impressions: 0, clicks: 0, spendIsk: 0, pageviews: 0 };
      }
      historyMap[h.date]!.impressions += h.impressions;
      historyMap[h.date]!.clicks += h.clicks;
      historyMap[h.date]!.spendIsk += h.spendIsk;
      historyMap[h.date]!.pageviews += h.pageviews || 0;
      if (h.pageViewsTrue !== undefined) {
        historyMap[h.date]!.pageViewsTrue =
          (historyMap[h.date]!.pageViewsTrue ?? 0) + h.pageViewsTrue;
      }
      // Accumulated here for the same reason as pageViewsTrue above: without
      // it, a multi-site owner's history came back with the field missing while
      // a single-site owner's carried it — the same endpoint returning two
      // shapes, which the next per-day drilldown would get wrong for agencies
      // only.
      if (h.unfilled !== undefined) {
        historyMap[h.date]!.unfilled = (historyMap[h.date]!.unfilled ?? 0) + h.unfilled;
      }
    }
  }

  // Convert map back to array sorted by date
  const history = Object.entries(historyMap)
    .map(([date, data]) => ({
      date,
      ...data,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const bySite: SiteBreakdown[] =
    publishers.length > 1
      ? publishers
          .map((p, i) => ({
            publisherId: p.id,
            displayName: p.displayName,
            domain: p.domain,
            impressions: allStats[i]!.impressions,
            clicks: allStats[i]!.clicks,
            pageviews: allStats[i]!.pageviews || 0,
            pageViewsTrue: allStats[i]!.pageViewsTrue,
            unfilled: allStats[i]!.unfilled,
            requestsWithFillData: allStats[i]!.requestsWithFillData,
            requestsWithTrafficData: allStats[i]!.requestsWithTrafficData,
            spendIskWithTrafficData: allStats[i]!.spendIskWithTrafficData,
            botClass: allStats[i]!.botClass,
            // Derived from that site's impressions for the same reason as the
            // window total — the per-site table shows revenue and an eCPM
            // computed from it.
            spendIsk: grossIskForImpressions(allStats[i]!.impressions),
          }))
          .sort((a, b) => b.impressions - a.impressions)
      : [];

  return {
    impressions: totalImpressions,
    clicks: totalClicks,
    spendIsk: grossIskForImpressions(totalImpressions),
    pageviews: totalPageviews,
    pageViewsTrue: anyPageViewsTrue ? totalPageViewsTrue : undefined,
    unfilled: anyUnfilled ? totalUnfilled : undefined,
    netEarningsIsk: publisherNetIsk(grossIskForImpressions(totalImpressions)),
    requestsWithFillData: anyUnfilled ? requestsWithFillData : undefined,
    impressionsWithFillData: anyUnfilled ? impressionsWithFillData : undefined,
    requestsWithTrafficData: anyPageViewsTrue ? requestsWithTrafficData : undefined,
    spendIskWithTrafficData: anyPageViewsTrue ? spendIskWithTrafficData : undefined,
    botClass,
    byCountry,
    history,
    ...(bySite.length > 0 ? { bySite } : {}),
  };
}
