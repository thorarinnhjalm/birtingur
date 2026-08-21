import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ResponsiveContainer, AreaChart, Area, XAxis, CartesianGrid, Tooltip } from 'recharts';
import { TRAFFIC_MEASUREMENT_START, publisherNetIsk, formatNumberIs } from '@ada/shared';
import { apiFetch } from '@/lib/api';
import { usePublishers } from '@/hooks/usePublisher';
import { useSiteFilter } from '@/hooks/useSiteFilter';
import { formatIsk, formatDate } from '@/lib/format';
import { EditorialH1, NumberedSection } from '@/components/ui/editorial';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Card } from '@/components/ui/Card';

/**
 * Umferð — the publisher's traffic as a first-class screen, not a stat card.
 *
 * The point (owner's call, 2026-08-20 plan): a niche creator should open
 * Birtingur to see their traffic, not Analytics. Everything here reads the
 * SAME /v1/publishers/stats response the dashboard already fetches (same
 * query key — no new request), and every figure keeps the codebase's
 * absent-not-zero contract: unmeasured renders as unmeasured, never as 0.
 *
 * Copy constraints that are load-bearing, not stylistic:
 * - The bot split is a FLOOR. bot-class.ts mandates that nothing in the
 *   product may call this "bot filtering" — the known-bot list is deliberately
 *   incomplete.
 * - The split has NO billing effect (accrual never reads it). Copy must never
 *   imply humans are "what you get paid for"; payment is per viewable
 *   impression.
 * - We only count pages carrying a Birtingur slot, so the total is a floor on
 *   the site's real traffic. Saying so (section 04) is what keeps the number
 *   trustworthy the first time someone compares it with whole-site analytics.
 */

// Mirrors BotClassPageViews on the API's publisher-stats service — declared
// locally like the rest of StatsResponse (the dashboard duplicates the
// response shape rather than importing across apps).
interface BotClassPageViews {
  human?: number;
  knownBot?: number;
  suspectedBot?: number;
}

interface StatsResponse {
  impressions: number;
  clicks: number;
  spendIsk: number;
  pageviews: number;
  pageViewsTrue?: number;
  requestsWithTrafficData?: number;
  spendIskWithTrafficData?: number;
  botClass?: BotClassPageViews;
  history: {
    date: string;
    impressions: number;
    clicks: number;
    spendIsk: number;
    pageviews: number;
    pageViewsTrue?: number;
  }[];
  bySite?: {
    publisherId: string;
    displayName: string;
    domain: string;
    impressions: number;
    pageviews: number;
    pageViewsTrue?: number;
    spendIskWithTrafficData?: number;
    botClass?: BotClassPageViews;
    spendIsk: number;
  }[];
}

const pct1 = (part: number, whole: number) =>
  `${Math.min(100, (part / whole) * 100)
    .toFixed(1)
    .replace('.', ',')}%`;

export default function Traffic() {
  const navigate = useNavigate();
  const [timeframe, setTimeframe] = useState<7 | 30>(30);
  const {
    data: publishers,
    isLoading: isPubsLoading,
    isLoadingError: isPubsError,
    isFetching: isPubsFetching,
    refetch: refetchPubs,
  } = usePublishers();
  const { siteId, setSiteId } = useSiteFilter();

  // Same key and endpoint as the dashboard — TanStack Query serves both pages
  // from one cache entry, so switching tabs costs nothing.
  const {
    data: stats,
    isLoading: isStatsLoading,
    isLoadingError: isStatsError,
    isFetching: isStatsFetching,
    refetch: refetchStats,
  } = useQuery<StatsResponse>({
    queryKey: ['publisher', 'stats', timeframe, siteId],
    queryFn: () =>
      apiFetch<StatsResponse>(
        `/v1/publishers/stats?timeframe=${timeframe}${siteId ? `&publisherId=${siteId}` : ''}`,
      ),
    enabled: !!publishers && publishers.length > 0,
  });

  const measured = stats?.pageViewsTrue !== undefined;

  // Daily average and best day over the MEASURED days only — dividing by the
  // window length would undercount any window that straddles 2026-08-09.
  const daily = useMemo(() => {
    const rows = (stats?.history ?? []).filter((h) => h.pageViewsTrue !== undefined);
    if (rows.length === 0) return null;
    const total = rows.reduce((s, h) => s + (h.pageViewsTrue ?? 0), 0);
    const best = rows.reduce((a, b) => ((a.pageViewsTrue ?? 0) >= (b.pageViewsTrue ?? 0) ? a : b));
    return {
      measuredDays: rows.length,
      average: Math.round(total / rows.length),
      bestCount: best.pageViewsTrue ?? 0,
      bestDate: best.date,
    };
  }, [stats]);

  // Same paired derivation as the dashboard's section 01 — the SERVER's
  // traffic-paired spend over its measured page views, never whole-window
  // spend and never re-summed history rows (aggregated history sums every
  // site's spend per day while pageViewsTrue covers only the measuring sites).
  const valuePer1000 = useMemo(() => {
    if (
      !stats ||
      stats.pageViewsTrue === undefined ||
      stats.pageViewsTrue === 0 ||
      stats.spendIskWithTrafficData === undefined
    ) {
      return null;
    }
    return Math.round(
      (publisherNetIsk(stats.spendIskWithTrafficData) / stats.pageViewsTrue) * 1000,
    );
  }, [stats]);

  const split = useMemo(() => {
    if (!stats?.botClass || stats.pageViewsTrue === undefined || stats.pageViewsTrue === 0) {
      return null;
    }
    const human = stats.botClass.human ?? 0;
    const knownBot = stats.botClass.knownBot ?? 0;
    const suspectedBot = stats.botClass.suspectedBot ?? 0;
    return { human, knownBot, suspectedBot, automated: knownBot + suspectedBot };
  }, [stats]);

  const chartData = useMemo(
    () =>
      (stats?.history ?? []).map((h) => ({
        ...h,
        label: (() => {
          const parsed = new Date(h.date);
          return isNaN(parsed.getTime())
            ? h.date
            : parsed.toLocaleDateString('is-IS', { day: '2-digit', month: 'short' });
        })(),
      })),
    [stats],
  );

  const measurementStartLabel = formatDate(TRAFFIC_MEASUREMENT_START);

  // Per-site rows: the multi-site breakdown when it exists, else the caller's
  // single site from the top-level figures — same numbers, one row.
  const siteRows = useMemo(() => {
    if (stats?.bySite && stats.bySite.length > 0) return stats.bySite;
    if (!stats || !publishers || publishers.length !== 1) return [];
    const p = publishers[0]!;
    return [
      {
        publisherId: p.id,
        displayName: p.displayName,
        domain: p.domain,
        impressions: stats.impressions,
        pageviews: stats.pageviews,
        pageViewsTrue: stats.pageViewsTrue,
        spendIskWithTrafficData: stats.spendIskWithTrafficData,
        botClass: stats.botClass,
        spendIsk: stats.spendIsk,
      },
    ];
  }, [stats, publishers]);

  if (isPubsLoading || isStatsLoading) return <LoadingState />;

  // Every figure below reads out of the query result; without this branch a
  // failed fetch renders the "measurement hasn't started" fallback — a
  // confident false claim about measurement history. Same reasoning as the
  // Greiðslur page's guard.
  if (isPubsError || isStatsError) {
    return (
      <ErrorState
        message="Ekki tókst að sækja umferðartölurnar þínar. Þetta er tæknileg villa í sambandi við þjóninn — umferðin þín er óbreytt. Reyndu aftur eftir smástund."
        onRetry={() => {
          if (isPubsError) void refetchPubs();
          if (isStatsError) void refetchStats();
        }}
        retrying={isPubsFetching || isStatsFetching}
      />
    );
  }

  const activeSite = siteId ? publishers?.find((p) => p.id === siteId) : undefined;

  return (
    <div className="flex flex-col" style={{ gap: 'clamp(24px,3vw,40px)' }}>
      <header>
        <EditorialH1>Umferð</EditorialH1>
        <p className="mt-3 text-[15px] text-slate-500">
          Síðuflettingar á vefjunum þínum, taldar kökulaust.
        </p>
        <div className="mt-4 inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5">
          {([7, 30] as const).map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => setTimeframe(tf)}
              className={`cursor-pointer rounded-md px-2.5 py-1 text-[10px] font-bold transition-all ${
                timeframe === tf
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              {tf} dagar
            </button>
          ))}
        </div>
      </header>

      {activeSite && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200/80 bg-blue-50/70 px-4 py-2.5 text-xs font-medium text-slate-700 shadow-xs">
          <span>
            Sýnir tölur fyrir:{' '}
            <strong className="font-bold text-slate-900">{activeSite.displayName}</strong>{' '}
            <span className="font-mono text-[11px] text-slate-500">({activeSite.domain})</span>
          </span>
          <button
            onClick={() => setSiteId(null)}
            className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-1 text-[11px] font-bold text-slate-700 shadow-xs transition-colors hover:bg-slate-50 hover:text-slate-900"
          >
            Sýna alla vefi ✕
          </button>
        </div>
      )}

      <div>
        <NumberedSection
          n="01"
          title="Lesendur"
          lede="Ein talning á hverja síðuhleðslu, óháð því hversu mörg auglýsingapláss eru á síðunni."
        >
          <Card className="p-6 md:p-8">
            {measured && stats ? (
              <>
                <div className="flex flex-wrap items-end justify-between gap-6">
                  <div>
                    <p className="m-0 text-xs font-semibold tracking-wider text-slate-500 uppercase">
                      Síðuflettingar
                    </p>
                    <div className="mt-3 text-4xl leading-none font-extrabold tracking-[-0.035em] tabular-nums sm:text-5xl">
                      {formatNumberIs(stats.pageViewsTrue!)}
                    </div>
                  </div>
                  {daily && (
                    <div className="flex gap-8">
                      <div>
                        <div className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                          Meðaltal á dag
                        </div>
                        <div className="mt-1.5 text-2xl font-bold tracking-tight tabular-nums">
                          {formatNumberIs(daily.average)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                          Besti dagurinn
                        </div>
                        <div className="mt-1.5 text-2xl font-bold tracking-tight tabular-nums">
                          {formatNumberIs(daily.bestCount)}
                        </div>
                        <div className="mt-0.5 text-xs text-slate-400">
                          {formatDate(daily.bestDate)}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {chartData.length > 0 && (
                  <div className="mt-6 h-56 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                        <defs>
                          <linearGradient id="trafficPageGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#1e3a8a" stopOpacity={0.14} />
                            <stop offset="100%" stopColor="#1e3a8a" stopOpacity={0.0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        <XAxis
                          dataKey="label"
                          stroke="#94a3b8"
                          fontSize={11}
                          tickLine={false}
                          axisLine={false}
                        />
                        {/* connectNulls={false}: pre-measurement days carry no
                            value — the gap is the honest rendering. */}
                        <Area
                          type="monotone"
                          dataKey="pageViewsTrue"
                          connectNulls={false}
                          stroke="#1e3a8a"
                          strokeWidth={2}
                          fillOpacity={1}
                          fill="url(#trafficPageGradient)"
                        />
                        <Tooltip
                          cursor={{ stroke: 'rgba(30, 58, 138, 0.15)', strokeWidth: 1 }}
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const row = payload[0]!.payload as (typeof chartData)[number];
                              return (
                                <div className="rounded-lg border border-slate-800 bg-slate-950/95 px-3 py-1.5 text-xs font-semibold text-white shadow-xl backdrop-blur">
                                  <p className="mb-0.5 font-medium text-slate-400">{row.label}</p>
                                  <p className="text-xs font-bold text-sky-400">
                                    {row.pageViewsTrue !== undefined
                                      ? `${formatNumberIs(row.pageViewsTrue)} síðuflettingar`
                                      : 'Ekki mælt'}
                                  </p>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}

                <div className="mt-6 grid grid-cols-1 gap-5 border-t border-slate-100 pt-6 md:grid-cols-2">
                  {split ? (
                    <>
                      <div>
                        <p className="m-0 text-xs font-semibold tracking-wider text-slate-500 uppercase">
                          Mannleg umferð
                        </p>
                        <div className="mt-2 flex items-baseline gap-3">
                          <span className="text-3xl font-extrabold tracking-[-0.03em] tabular-nums">
                            {formatNumberIs(split.human)}
                          </span>
                          <span className="text-[15px] font-semibold text-slate-500">
                            {pct1(split.human, stats.pageViewsTrue!)}
                          </span>
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-2 rounded-full bg-primary"
                            style={{
                              width: `${Math.min(100, (split.human / stats.pageViewsTrue!) * 100)}%`,
                            }}
                          />
                        </div>
                        <p className="mt-3 mb-0 text-[13px] leading-relaxed text-slate-500">
                          Flettingar sem báru engin merki um sjálfvirkni. Flokkunin breytir ekki
                          uppgjöri — greitt er fyrir sýnilegar birtingar, ekki flettingar.
                        </p>
                      </div>
                      <div className="md:border-l md:border-slate-100 md:pl-6">
                        <p className="m-0 text-xs font-semibold tracking-wider text-slate-500 uppercase">
                          Sjálfvirk umferð
                        </p>
                        <div className="mt-2 flex items-baseline gap-3">
                          <span className="text-3xl font-extrabold tracking-[-0.03em] text-slate-500 tabular-nums">
                            {formatNumberIs(split.automated)}
                          </span>
                          <span className="text-[15px] font-semibold text-slate-400">
                            {pct1(split.automated, stats.pageViewsTrue!)}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600 tabular-nums">
                            Þekktir vefskriðlar {formatNumberIs(split.knownBot)}
                          </span>
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600 tabular-nums">
                            Grunsamlegt {formatNumberIs(split.suspectedBot)}
                          </span>
                        </div>
                        <p className="mt-3 mb-0 text-[13px] leading-relaxed text-slate-500">
                          Gestir sem sögðu til sín sem vélmenni eða keyrðu í sjálfvirknivafra.
                          Listinn yfir þekkta skriðla er ekki tæmandi — þetta er gólf, ekki
                          heildartala.
                        </p>
                      </div>
                    </>
                  ) : (
                    <p className="m-0 text-sm text-slate-500 md:col-span-2">
                      Skipting í mannlega og sjálfvirka umferð hefur ekki mælst fyrir þetta tímabil
                      enn.
                    </p>
                  )}
                </div>
              </>
            ) : (
              <div>
                <p className="m-0 text-xs font-semibold tracking-wider text-slate-500 uppercase">
                  Síðuflettingar
                </p>
                <div className="mt-3 text-4xl leading-none font-extrabold text-slate-300">—</div>
                <p className="mt-3 mb-0 text-sm text-slate-500">
                  Nákvæm mæling hófst {measurementStartLabel}. Fyrstu tölurnar birtast hér þegar
                  fyrsti dagurinn hefur mælst.
                </p>
              </div>
            )}
          </Card>
        </NumberedSection>

        {siteRows.length > 0 && measured && (
          <NumberedSection
            n="02"
            title="Eftir vefjum"
            lede="Sömu tölur, brotnar niður eftir vefjunum þínum."
          >
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs font-medium">
                  <thead>
                    <tr className="border-b border-slate-200 font-semibold tracking-wider text-slate-400 uppercase">
                      <th className="py-2.5">Vefur</th>
                      <th className="py-2.5 text-right">Síðuflettingar</th>
                      <th className="py-2.5 text-right">Mannleg</th>
                      <th className="py-2.5 text-right">Tekjur á 1.000</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {siteRows.map((site) => {
                      // Paired per site: derived spend over that site's
                      // measured days against that site's measured page views —
                      // never whole-window spend (the server returns the pair
                      // for exactly this division).
                      const siteValuePer1000 =
                        site.pageViewsTrue !== undefined &&
                        site.pageViewsTrue > 0 &&
                        site.spendIskWithTrafficData !== undefined
                          ? Math.round(
                              (publisherNetIsk(site.spendIskWithTrafficData) / site.pageViewsTrue) *
                                1000,
                            )
                          : null;
                      const siteHumanPct =
                        site.botClass !== undefined &&
                        site.pageViewsTrue !== undefined &&
                        site.pageViewsTrue > 0
                          ? pct1(site.botClass.human ?? 0, site.pageViewsTrue)
                          : null;
                      return (
                        <tr key={site.publisherId}>
                          <td className="py-3">
                            <div className="font-semibold text-slate-900">{site.displayName}</div>
                            <div className="font-mono text-[10px] text-slate-400">
                              {site.domain}
                            </div>
                          </td>
                          <td className="py-3 text-right text-[15px] font-semibold tabular-nums">
                            {site.pageViewsTrue !== undefined
                              ? formatNumberIs(site.pageViewsTrue)
                              : '—'}
                          </td>
                          <td className="py-3 text-right tabular-nums">
                            {siteHumanPct ?? <span className="text-slate-400">—</span>}
                          </td>
                          <td className="py-3 text-right font-bold text-primary tabular-nums">
                            {siteValuePer1000 !== null ? (
                              formatIsk(siteValuePer1000)
                            ) : (
                              <span className="font-medium text-slate-400">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </NumberedSection>
        )}

        <NumberedSection
          n="03"
          title="Hvað umferðin skilar"
          lede="Tengingin sem enginn annar umferðarmælir sýnir þér: hvað lesandi er virði í krónum."
        >
          <Card className="flex flex-wrap items-center justify-between gap-6 p-6 md:p-8">
            {valuePer1000 !== null ? (
              <div>
                <div className="flex items-baseline gap-3">
                  <span className="text-4xl leading-none font-extrabold tracking-[-0.035em] text-primary tabular-nums">
                    {formatIsk(valuePer1000)}
                  </span>
                  <span className="text-[15px] font-semibold text-slate-500">
                    á hverjar 1.000 síðuflettingar
                  </span>
                </div>
                <p className="mt-3 mb-0 max-w-[60ch] text-sm leading-relaxed text-slate-500">
                  Þúsund lesendur til viðbótar bæta um{' '}
                  <strong className="font-semibold text-slate-700">
                    {formatIsk(valuePer1000)}
                  </strong>{' '}
                  við tekjurnar eins og staðan er í dag. Sundurliðunin — hvað seldist, hvað sást —
                  er á mælaborðinu.
                </p>
              </div>
            ) : (
              <p className="m-0 text-sm text-slate-500">
                Reiknast þegar fyrsti mældi dagurinn með umferð liggur fyrir.
              </p>
            )}
            <button
              type="button"
              onClick={() => navigate('/publisher')}
              className="cursor-pointer rounded-lg border border-slate-200 bg-white px-5 py-3 text-[13px] font-bold text-primary transition-colors hover:bg-slate-50"
            >
              Sjá sundurliðun á mælaborði →
            </button>
          </Card>
        </NumberedSection>

        <NumberedSection
          n="04"
          title="Hvað þessi tala nær ekki yfir"
          lede="Svo þú vitir hvenær þú átt að treysta okkur og hvenær ekki."
        >
          <div className="rounded-card border border-blue-200 bg-blue-50 p-6">
            <p className="m-0 text-[15px] leading-relaxed text-slate-700">
              Við teljum eingöngu síður sem bera auglýsingapláss frá Birtingi. Síður án pláss — um
              okkur, hafðu samband, eldri færslur án auglýsinga — sjást ekki hér. Talan er því{' '}
              <strong className="font-semibold text-slate-900">
                gólf á umferðinni þinni, ekki heildartala
              </strong>
              , og verður alltaf lægri en tölfræði sem mælir allan vefinn.
            </p>
          </div>
        </NumberedSection>
      </div>
    </div>
  );
}
