import { Fragment, useEffect, useMemo, useState } from 'react';
import { Routes, Route, useNavigate, Navigate } from 'react-router-dom';
import {
  TRAFFIC_MEASUREMENT_START,
  FILL_MEASUREMENT_START,
  FLAT_CPM_ISK,
  DEFAULT_PLATFORM_FEE_PERCENT,
  MIN_PAYOUT_ISK,
  publisherNetIsk,
  formatNumberIs,
} from '@ada/shared';
import {
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  FolderPlus,
  PlusCircle,
  Download,
  ChevronRight,
  Globe,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Badge } from '@/components/ui/Badge';
import { usePublishers, usePublisherSlots } from '@/hooks/usePublisher';
import { useSiteFilter } from '@/hooks/useSiteFilter';
import { useIsMobile } from '@/hooks/useIsMobile';
import { formatIsk, formatDate } from '@/lib/format';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { ResponsiveContainer, AreaChart, Area, Tooltip as RechartsTooltip } from 'recharts';
import { Card } from '@/components/ui/Card';
import { TrafficChain } from '@/components/publisher/TrafficChain';
import { AnalyticsChart } from '@/components/charts/AnalyticsChart';
import { EditorialH1, NumberedSection } from '@/components/ui/editorial';

import SlotCreate from './SlotCreate';
import SlotList from './SlotList';
import SlotDetail from './SlotDetail';
import Earnings from './Earnings';
import Traffic from './Traffic';
import Settings from './Settings';
import PublisherOnboarding from './Onboarding';

// What the publisher keeps of the flat CPM: 550 kr gross, net of the 20% fee.
const NET_CPM_ISK = publisherNetIsk(FLAT_CPM_ISK);

interface StatsResponse {
  impressions: number;
  clicks: number;
  spendIsk: number;
  pageviews: number;
  // Real page views (Task 4/6). Absent — not zero — when no day in the
  // selected window has measured it yet (pre-switch or no data at all); the
  // UI must show that absence honestly rather than falling back to 0.
  pageViewsTrue?: number;
  // Ad requests that got no advertiser back. Absent — not zero — for windows
  // before the aggregator began counting it (2026-08-14).
  unfilled?: number;
  // Requests and impressions over EXACTLY the days that measured `unfilled`,
  // and requests over exactly the days that measured `pageViewsTrue`. `pageviews`
  // above covers the whole window, so it is the wrong denominator for either —
  // see the comment on TrafficChainProps.
  requestsWithFillData?: number;
  impressionsWithFillData?: number;
  requestsWithTrafficData?: number;
  // Derived spend over those same measured days — see publisher-stats.ts.
  spendIskWithTrafficData?: number;
  history: {
    date: string;
    impressions: number;
    clicks: number;
    spendIsk: number;
    pageviews: number;
    pageViewsTrue?: number;
    // Ad requests that got no advertiser. Absent for windows before the
    // aggregator began counting it (2026-08-14) — never defaulted to 0.
    unfilled?: number;
  }[];
  bySite?: {
    publisherId: string;
    displayName: string;
    domain: string;
    impressions: number;
    clicks: number;
    pageviews: number;
    pageViewsTrue?: number;
    // Ad requests that got no advertiser. Absent for windows before the
    // aggregator began counting it (2026-08-14) — never defaulted to 0.
    unfilled?: number;
    // Requests over exactly the days that measured `unfilled` for this site.
    requestsWithFillData?: number;
    spendIsk: number;
  }[];
}

function PublisherHome() {
  const [timeframe, setTimeframe] = useState<7 | 30>(30);
  const { data: publishers, isLoading: isPubsLoading } = usePublishers();
  const { data: slots, isLoading: isSlotsLoading } = usePublisherSlots(
    !!publishers && publishers.length > 0,
    timeframe,
  );
  const { siteId, setSiteId } = useSiteFilter();
  const isMobile = useIsMobile();
  // The unpaid ledger basis, same endpoint the Earnings page reads — the hero
  // payout card must show the number that will actually be paid, not revenue.
  const { data: balance } = useQuery<{ unpaidBasisIsk: number; minPayoutIsk: number }>({
    queryKey: ['publisher', 'balance'],
    queryFn: () =>
      apiFetch<{ unpaidBasisIsk: number; minPayoutIsk: number }>('/v1/publishers/me/balance'),
    enabled: !!publishers && publishers.length > 0,
  });

  const { data: stats, isLoadingError: isStatsError } = useQuery<StatsResponse>({
    queryKey: ['publisher', 'stats', timeframe, siteId],
    queryFn: () =>
      apiFetch<StatsResponse>(
        `/v1/publishers/stats?timeframe=${timeframe}${siteId ? `&publisherId=${siteId}` : ''}`,
      ),
    enabled: !!publishers && publishers.length > 0,
  });
  const navigate = useNavigate();

  // Recent-half vs older-half trend deltas — EQUAL halves (floor(length/2)
  // days each, adjacent, oldest day of an odd window dropped): slice(half) put
  // 3 days against 4 on the 7-day preset, so flat traffic read "+33,3%".
  // Revenue trends over the whole window; the traffic trend runs over ONLY the
  // days that measured pageViewsTrue, so the pre-measurement zeros of an old
  // window can never fake a rocketing trend.
  const pctChanges = useMemo(() => {
    const empty = { revenue: null as number | null, pageViews: null as number | null };
    if (!stats?.history || stats.history.length < 2) return empty;
    const half = Math.floor(stats.history.length / 2);
    const sumRev = (rows: typeof stats.history) => rows.reduce((s, h) => s + h.spendIsk, 0);
    const olderRev = sumRev(stats.history.slice(-2 * half, -half));
    const recentRev = sumRev(stats.history.slice(-half));
    const measured = stats.history.filter((h) => h.pageViewsTrue !== undefined);
    const halfPv = Math.floor(measured.length / 2);
    const sumPv = (rows: typeof measured) => rows.reduce((s, h) => s + (h.pageViewsTrue ?? 0), 0);
    const olderPv = halfPv >= 1 ? sumPv(measured.slice(-2 * halfPv, -halfPv)) : 0;
    const recentPv = halfPv >= 1 ? sumPv(measured.slice(-halfPv)) : 0;
    return {
      revenue: olderRev > 0 ? ((recentRev - olderRev) / olderRev) * 100 : null,
      pageViews: olderPv > 0 ? ((recentPv - olderPv) / olderPv) * 100 : null,
    };
  }, [stats]);

  // "Virði hverra 1.000 lesenda" and its ceiling, paired over EXACTLY the days
  // that measured pageViewsTrue — from the SERVER's paired fields
  // (spendIskWithTrafficData / requestsWithTrafficData), never whole-window
  // figures, and never re-summed from history rows: aggregated history sums
  // every site's spend per day while pageViewsTrue covers only the sites that
  // measured it, so a client-side re-pairing can mix one site's revenue with
  // another site's readers. Null until a measured day with traffic exists.
  const pairedTraffic = useMemo(() => {
    if (
      !stats ||
      stats.pageViewsTrue === undefined ||
      stats.pageViewsTrue === 0 ||
      stats.spendIskWithTrafficData === undefined ||
      stats.requestsWithTrafficData === undefined
    ) {
      return null;
    }
    const pv = stats.pageViewsTrue;
    const valuePer1000 = Math.round((publisherNetIsk(stats.spendIskWithTrafficData) / pv) * 1000);
    // If every one of those requests had sold AND been seen: requests-per-page-
    // view times the net CPM. What the same traffic would earn fully monetised.
    const ceilingPer1000 = Math.round((stats.requestsWithTrafficData / pv) * NET_CPM_ISK);
    return {
      pv,
      valuePer1000,
      ceilingPer1000,
      pctOfCeiling:
        ceilingPer1000 > 0 ? Math.min(100, Math.round((valuePer1000 / ceilingPer1000) * 100)) : 0,
    };
  }, [stats]);

  // Human period label for the "Tímabil …" line, e.g. "1.–30. júní 2026" —
  // mirrors the already-redesigned advertiser Dashboard.tsx's periodLabel
  // pattern, computed from the real, user-selectable timeframe toggle below
  // instead of a fixed mock date. This endpoint only supports a rolling
  // timeframe (no custom start/end), so there's no custom-range branch.
  const periodLabel = useMemo(() => {
    const end = new Date();
    const start = new Date(end);
    start.setDate(end.getDate() - timeframe + 1);
    const fmt = (d: Date) => `${d.getDate()}. ${d.toLocaleDateString('is-IS', { month: 'long' })}`;
    const sameMonth =
      start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
    const year = end.getFullYear();
    if (sameMonth) {
      return `${start.getDate()}.–${end.getDate()}. ${end.toLocaleDateString('is-IS', { month: 'long' })} ${year}`;
    }
    return `${fmt(start)} – ${fmt(end)} ${year}`;
  }, [timeframe]);

  // Next payout date for the template's "Næsta útgreiðsla" stat card
  // (dashboard.dc.html mocks "1. júlí 2026") — real date math (1st of next
  // calendar month), not a fetch. Payouts run monthly per cron-payouts; this
  // is the same "1st of next month" the pre-redesign card described in prose
  // ("Áætlað 1. næsta mánaðar") but spelled out as an actual date, which is
  // more honest, not less.
  const nextPayoutDateLabel = useMemo(() => {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return `${next.getDate()}. ${next.toLocaleDateString('is-IS', { month: 'long' })} ${next.getFullYear()}`;
  }, []);

  const downloadSlotsCsv = () => {
    if (!slots || slots.length === 0 || !publishers) return;
    let csvContent = '﻿'; // Add BOM for Excel UTF-8 compatibility
    csvContent +=
      'Pláss,Lén,Stærðir,Staða,Birtingar,Auglýsingabeiðnir,Fylltar,Smellir,CTR,Áætlaðar Tekjur\n';

    for (const pub of publishers) {
      const pubSlots = (slots as any[]).filter((s: any) => s.publisherId === pub.id) || [];
      for (const s of pubSlots) {
        const name = `"${s.name.replace(/"/g, '""')}"`;
        const domain = pub.domain;
        const sizes = `"${s.sizes.map((sz: any) => `${sz.width}x${sz.height}`).join(', ')}"`;
        const status = s.status === 'active' ? 'Virk' : 'Óvirk';
        const impressions = s.stats ? s.stats.impressions : 0;
        const pageviews = s.stats ? s.stats.pageviews : 0;
        // Same definition as the on-screen table: filled over requests, both
        // taken from the days that measured `unfilled`. A CSV that disagrees
        // with the dashboard under the same column heading is the confusion
        // this change exists to remove — and `pageviews` here covers the whole
        // window, so using it would put 30 days of requests under a few days of
        // unfilled and report ~98% for a site filling half of them.
        const unfilled = s.stats && typeof s.stats.unfilled === 'number' ? s.stats.unfilled : null;
        const fillDenominator =
          s.stats && typeof s.stats.requestsWithFillData === 'number'
            ? s.stats.requestsWithFillData
            : null;
        const fillRate =
          unfilled !== null && fillDenominator !== null && fillDenominator > 0
            ? `${Math.round(((fillDenominator - unfilled) / fillDenominator) * 100)}%`
            : 'ekki mælt';
        const clicks = s.stats ? s.stats.clicks : 0;
        // Clamped, like every other surface that shows CTR — see the on-screen
        // table below for why clicks can outrun impressions.
        //
        // QUOTED because the Icelandic decimal separator is a comma and this is
        // a comma-separated file: an unquoted `1,00%` is two fields, so every
        // row carried one more field than the header and the revenue column
        // landed under the CTR heading in any parser that read it.
        const ctr =
          s.stats && s.stats.impressions > 0
            ? `"${Math.min(100, (s.stats.clicks / s.stats.impressions) * 100)
                .toFixed(2)
                .replace('.', ',')}%"`
            : '"0,00%"';
        const earnings = s.stats ? publisherNetIsk(s.stats.spendIsk) : 0;

        csvContent += `${name},${domain},${sizes},${status},${impressions},${pageviews},${fillRate},${clicks},${ctr},${earnings} kr.\n`;
      }
    }

    const blob = new window.Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      // The window is in the name: the same export is 7 or 30 days depending
      // on the toggle now, and two otherwise-identical files should not be
      // indistinguishable on disk.
      `birtingur_ad_slots_${timeframe}d_${new Date().toISOString().split('T')[0]}.csv`,
    );
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (isPubsLoading || isSlotsLoading) return <LoadingState />;

  if (!publishers || publishers.length === 0) {
    return <Navigate to="/publisher/onboarding" replace />;
  }

  const firstPublisher = publishers[0];
  const hasMissingPayoutDetails =
    !firstPublisher ||
    !firstPublisher.payoutMethod ||
    !firstPublisher.payoutMethod.iban ||
    !firstPublisher.payoutMethod.kennitala ||
    !firstPublisher.payoutMethod.accountName;

  const hasEarnings = stats && stats.spendIsk > 0;
  const showNudgeBanner = hasMissingPayoutDetails && hasEarnings;

  // Net (80%) revenue figure reused across the hero card, the nudge banner
  // and the "Tekjur í mánuðinum" stat card — same
  // spendIsk * (1 - DEFAULT_PLATFORM_FEE_PERCENT / 100) formula the
  // pre-redesign page repeated inline in four places.
  const netRevenueIsk = stats ? publisherNetIsk(stats.spendIsk) : 0;

  const measurementStartLabel = formatDate(TRAFFIC_MEASUREMENT_START);
  const fillMeasurementStartLabel = formatDate(FILL_MEASUREMENT_START);
  // True when the measured-traffic window is shorter than the selected one —
  // the normal state until every day of the window postdates 2026-08-09.
  const trafficWindowIsShorter =
    stats !== undefined &&
    stats.requestsWithTrafficData !== undefined &&
    stats.requestsWithTrafficData < stats.pageviews;
  const gapLede =
    stats && stats.pageviews > 0
      ? `Af ${formatNumberIs(stats.pageviews)} beiðnum urðu ${formatNumberIs(stats.impressions)} að sýnilegri auglýsingu. Hér er hitt — og hjá hverjum það liggur.`
      : 'Hér sést hvað verður um beiðnir sem enda ekki sem sýnileg auglýsing — og hjá hverjum það liggur.';

  return (
    <div className="flex flex-col" style={{ gap: 'clamp(36px,4.5vw,60px)' }}>
      {/* ===== PAGE HEADER =====
          Title/period line copied verbatim from publisher-dashboard.dc.html.
          The template's own action button is a static "[Month Year]" mock
          with no wired behaviour; the real 7/30-day toggle below it (which
          drives the stats/chart queries) and the "Nýr vefur"/"Nýtt pláss"
          actions are not in the template but are kept and restyled, same
          convention as the advertiser Dashboard.tsx sibling's date-range
          control. */}
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <EditorialH1>Mælaborð</EditorialH1>
          <p className="mt-3 text-[15px] text-slate-500 tracking-[0.01em]">
            Tímabil&nbsp;&nbsp;
            <span className="text-slate-900 font-semibold">{periodLabel}</span>
          </p>
          <p className="mt-1.5 text-sm font-medium text-slate-500">
            Góðan dag, {firstPublisher?.displayName?.split(' ')[0] || 'útgefandi'} — hér er yfirlit
            yfir árangur og tekjur í dag.
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
        </div>
        <div className="flex gap-3">
          <Button
            variant="secondary"
            onClick={() => navigate('/publisher/onboarding')}
            className="flex items-center gap-2 text-xs"
          >
            <FolderPlus size={16} />
            <span>Nýr vefur</span>
          </Button>
          <Button
            onClick={() => navigate('/publisher/slots/new')}
            className="flex items-center gap-2 text-xs"
          >
            <PlusCircle size={16} />
            <span>Nýtt pláss</span>
          </Button>
        </div>
      </header>

      {/* ===== PAYOUT DETAILS NUDGE =====
          Not in the template. Kept because it gates real money the publisher
          has already earned; restyled to the flat rounded-card banner
          convention used elsewhere (e.g. TopUp.tsx's success/cancelled
          banners) instead of the old icon-chip treatment. Copy verbatim. */}
      {showNudgeBanner && (
        <div className="flex flex-col items-start justify-between gap-4 rounded-card border border-amber-200 bg-amber-50 p-6 shadow-sm md:flex-row md:items-center">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 shrink-0 text-amber-500" size={20} />
            <div>
              <h4 className="text-base font-bold text-slate-900">Bankaupplýsingar vantar</h4>
              <p className="mt-1 text-sm font-medium text-slate-600">
                Þú átt áætlaðar uppsafnaðar tekjur upp á{' '}
                <strong className="font-bold text-slate-900">{formatIsk(netRevenueIsk)}</strong> en
                vantar enn reikningsupplýsingar til að geta fengið greitt. Vinsamlegast skráðu
                bankareikninginn þinn í stillingum.
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate('/publisher/settings')}
            className="shrink-0 cursor-pointer rounded-lg border-none bg-amber-600 px-6 py-3 text-sm font-bold text-white shadow-sm transition-all hover:bg-amber-700 hover:shadow active:scale-95"
          >
            Skrá bankaupplýsingar
          </button>
        </div>
      )}

      {/* ===== ACTIVE SITE FILTER BANNER ===== */}
      {siteId &&
        (() => {
          const activeSite = publishers?.find((p) => p.id === siteId);
          return activeSite ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200/80 bg-blue-50/70 px-4 py-2.5 text-xs font-medium text-slate-700 shadow-xs">
              <div className="flex items-center gap-2">
                <Globe size={15} className="text-primary shrink-0" />
                <span>
                  Sýnir tölur fyrir:{' '}
                  <strong className="font-bold text-slate-900">{activeSite.displayName}</strong>{' '}
                  <span className="font-mono text-[11px] text-slate-500">
                    ({activeSite.domain})
                  </span>
                </span>
              </div>
              <button
                onClick={() => setSiteId(null)}
                className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-1 text-[11px] font-bold text-slate-700 shadow-xs transition-colors hover:bg-slate-50 hover:text-slate-900"
              >
                Sýna alla vefi ✕
              </button>
            </div>
          ) : null;
        })()}

      {/* ===== NUMBERED SECTIONS (2026-08-20 redesign) =====
          Five sections per docs/superpowers/specs/2026-08-20-utgefendagogn-
          templates/publisher-dashboard.dc.html, built with NumberedSection.
          Traffic leads by the owner's explicit call: the dashboard is meant to
          build a habit, not just report a payout. The old four-StatCard row is
          gone — revenue appeared three times on this page, next-payout twice
          and impressions twice — and "Meðal eCPM" is replaced by the
          arithmetic itself in section 03. One wrapper div so the page's flex
          gap applies once; the sections space themselves. */}
      <div>
        <NumberedSection
          n="01"
          title="Lesendurnir þínir"
          lede="Umferðin er eignin þín. Hér er hvað hún var á tímabilinu og hvað hver þúsund lesendur eru virði í krónum."
        >
          <div className="rounded-card border border-slate-200 bg-white p-6 md:p-8">
            {stats?.pageViewsTrue !== undefined ? (
              <>
                <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
                  <div>
                    <p className="m-0 text-xs font-semibold tracking-wider text-slate-500 uppercase">
                      Síðuflettingar
                    </p>
                    <div className="mt-3 text-4xl leading-none font-extrabold tracking-[-0.035em] tabular-nums sm:text-5xl">
                      {formatNumberIs(stats.pageViewsTrue)}
                    </div>
                    {pctChanges.pageViews !== null && (
                      <div
                        className={`mt-3 text-[13px] font-semibold ${
                          pctChanges.pageViews >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}
                      >
                        {pctChanges.pageViews >= 0 ? '↑ +' : '↓ '}
                        {pctChanges.pageViews.toFixed(1).replace('.', ',')}% frá fyrra tímabili
                      </div>
                    )}
                    {trafficWindowIsShorter && (
                      <p className="mt-2 mb-0 text-[13px] text-slate-400">
                        Nákvæm mæling frá {measurementStartLabel}
                      </p>
                    )}
                  </div>
                  <div className="md:border-l md:border-slate-100 md:pl-8">
                    <p className="m-0 text-xs font-semibold tracking-wider text-slate-500 uppercase">
                      Virði hverra 1.000 lesenda
                    </p>
                    <div className="mt-3 text-4xl leading-none font-extrabold tracking-[-0.035em] text-primary tabular-nums">
                      {pairedTraffic ? formatIsk(pairedTraffic.valuePer1000) : '—'}
                    </div>
                    {pairedTraffic && (
                      <p className="mt-3 mb-0 text-[13px] leading-relaxed text-slate-500">
                        Þúsund lesendur til viðbótar bæta um{' '}
                        <strong className="font-semibold text-slate-700">
                          {formatIsk(pairedTraffic.valuePer1000)}
                        </strong>{' '}
                        við tekjurnar eins og staðan er í dag.
                      </p>
                    )}
                  </div>
                  <div className="md:border-l md:border-slate-100 md:pl-8">
                    <p className="m-0 text-xs font-semibold tracking-wider text-slate-500 uppercase">
                      Þak eins og staðan er
                    </p>
                    <div className="mt-3 text-4xl leading-none font-extrabold tracking-[-0.035em] text-slate-400 tabular-nums">
                      {pairedTraffic ? formatIsk(pairedTraffic.ceilingPer1000) : '—'}
                    </div>
                    {pairedTraffic && (
                      <>
                        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-2 rounded-full bg-primary"
                            style={{ width: `${pairedTraffic.pctOfCeiling}%` }}
                          />
                        </div>
                        <p className="mt-3 mb-0 text-[13px] leading-relaxed text-slate-500">
                          Ef hver einasta beiðni seldist og sæist. Þú ert í{' '}
                          <strong className="font-semibold text-slate-700">
                            {pairedTraffic.pctOfCeiling}%
                          </strong>{' '}
                          af því — bilið er kafli 04.
                        </p>
                      </>
                    )}
                  </div>
                </div>
                {stats.history.length > 0 && (
                  <div className="mt-6 border-t border-slate-100 pt-5">
                    <div className="h-20">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                          data={stats.history}
                          margin={{ top: 4, right: 0, left: 0, bottom: 0 }}
                        >
                          <defs>
                            <linearGradient id="trafficGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#1e3a8a" stopOpacity={0.12} />
                              <stop offset="100%" stopColor="#1e3a8a" stopOpacity={0.0} />
                            </linearGradient>
                          </defs>
                          {/* connectNulls={false}: days before measurement began
                              carry NO pageViewsTrue — the gap is the honest
                              rendering, a zero would be a lie. */}
                          <Area
                            type="monotone"
                            dataKey="pageViewsTrue"
                            connectNulls={false}
                            stroke="#1e3a8a"
                            strokeWidth={2}
                            fillOpacity={1}
                            fill="url(#trafficGradient)"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                      <p className="m-0 text-[13px] text-slate-500">
                        Daglegar síðuflettingar yfir tímabilið
                      </p>
                      <button
                        type="button"
                        onClick={() => navigate('/publisher/traffic')}
                        className="cursor-pointer border-none bg-transparent p-0 text-[13px] font-bold text-primary hover:underline"
                      >
                        Sjá alla umferð →
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div>
                <p className="m-0 text-xs font-semibold tracking-wider text-slate-500 uppercase">
                  Síðuflettingar
                </p>
                <div className="mt-3 text-4xl leading-none font-extrabold text-slate-300">—</div>
                {/* "Measurement hasn't started" is a positive factual claim, so
                    it renders ONLY off a resolved response with the field
                    absent. A loading or failed fetch shows a dash and, on
                    failure, says the truth — same reasoning as the
                    /v1/publishers/all shell guard below. */}
                {stats ? (
                  <p className="mt-3 mb-0 text-sm text-slate-500">
                    Nákvæm mæling hófst {measurementStartLabel}. Virði lesenda birtist þegar fyrstu
                    dagarnir hafa mælst.
                  </p>
                ) : isStatsError ? (
                  <p className="mt-3 mb-0 text-sm text-slate-500">
                    Ekki tókst að sækja umferðartölurnar. Reyndu að endurhlaða síðuna.
                  </p>
                ) : null}
              </div>
            )}
          </div>
        </NumberedSection>

        <NumberedSection
          n="02"
          title="Tekjurnar þínar"
          lede="Ein tala fyrir það sem þú þénaðir á tímabilinu og ein fyrir það sem bíður útgreiðslu. Þær eru ekki sami hluturinn."
        >
          {/* Hero pair kept verbatim from the pre-restructure page (queries,
            sparkline and tooltip untouched) — only its position moved, into
            section 02. */}
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3 md:items-stretch">
            <div className="relative flex min-h-65 flex-col justify-between overflow-hidden rounded-card border border-slate-200 bg-white p-6 md:col-span-2 md:p-8">
              <div className="relative z-10">
                <p className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
                  {/* Named by the real window. "í þessum mánuði" sat over whatever
                    the 7/30 toggle selected — a week labelled as the month. */}
                  Áætlaðar tekjur síðustu {timeframe} daga
                </p>
                <div className="my-4 text-3xl font-extrabold tracking-[-0.03em] text-primary tabular-nums sm:text-4xl md:text-5xl">
                  {stats ? formatIsk(netRevenueIsk) : formatIsk(0)}
                </div>
                {pctChanges.revenue !== null && (
                  <div
                    className={`flex w-fit items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                      pctChanges.revenue >= 0
                        ? 'bg-green-55 text-green-600'
                        : 'bg-red-55 text-red-600'
                    }`}
                  >
                    {pctChanges.revenue >= 0 ? (
                      <TrendingUp size={14} />
                    ) : (
                      <TrendingDown size={14} />
                    )}
                    {pctChanges.revenue >= 0 ? '+' : ''}
                    {pctChanges.revenue.toFixed(1).replace('.', ',')}% frá fyrra tímabili
                  </div>
                )}
              </div>
              {/* Interactive Recharts sparkline — untouched from pre-redesign. */}
              <div className="absolute inset-x-0 bottom-0 z-0 h-24 opacity-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={stats?.history || []}
                    margin={{ top: 10, right: 0, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="earningsGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2563eb" stopOpacity={0.15} />
                        <stop offset="100%" stopColor="#2563eb" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <Area
                      type="monotone"
                      dataKey={(h: any) => publisherNetIsk(h.spendIsk)}
                      stroke="#2563eb"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#earningsGradient)"
                    />
                    <RechartsTooltip
                      cursor={{ stroke: 'rgba(37, 99, 235, 0.1)', strokeWidth: 1 }}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const val = payload[0]!.value as number;
                          const label = payload[0]!.payload.date;
                          let formattedDate = label;
                          try {
                            const parsed = new Date(label);
                            if (!isNaN(parsed.getTime())) {
                              formattedDate = parsed.toLocaleDateString('is-IS', {
                                day: '2-digit',
                                month: 'short',
                              });
                            }
                          } catch {
                            /* keep the raw date string when parsing fails */
                          }
                          return (
                            <div className="bg-slate-950/95 backdrop-blur text-white px-3 py-1.5 rounded-lg text-xs font-semibold shadow-xl border border-slate-800">
                              <p className="text-slate-400 font-medium mb-0.5">{formattedDate}</p>
                              <p className="text-xs font-bold text-sky-400">{formatIsk(val)}</p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="flex min-h-65 flex-col justify-between rounded-card bg-tertiary p-6 text-on-tertiary md:col-span-1 md:p-8">
              <div>
                <p className="mb-1 text-xs font-semibold tracking-wider text-white/70 uppercase">
                  {/* The real unpaid ledger basis — the same number the Earnings
                    page reports — NOT the rolling-window revenue this card used
                    to show under the same heading. A new publisher with 4.000 kr
                    saw "Næsta útgreiðsla: 4.000 kr" here and "Beðið eftir
                    útgreiðslu: 0 kr" one click away; the figure that promised
                    money was the wrong one. */}
                  Uppsafnað til útgreiðslu
                </p>
                <div className="text-2xl font-extrabold tracking-[-0.03em] text-white tabular-nums sm:text-3xl">
                  {balance ? formatIsk(balance.unpaidBasisIsk) : '—'}
                </div>
                <p className="mt-1 text-[10px] font-medium text-white/50">
                  {/* The server's own minimum, same as Earnings — the shared
                    constant would silently disagree if the API's ever moved. */}
                  {balance &&
                  balance.unpaidBasisIsk > 0 &&
                  balance.unpaidBasisIsk < balance.minPayoutIsk
                    ? `Greitt út þegar ${formatIsk(balance.minPayoutIsk)} lágmarki er náð`
                    : `Næsta útgreiðsla áætluð ${nextPayoutDateLabel}`}
                </p>
              </div>
              <Button
                onClick={() => navigate('/publisher/earnings')}
                className="mt-4 w-full justify-center border-none bg-white/10 py-2 text-xs font-bold text-white shrink-0 hover:bg-white/20"
              >
                Skoða færslur
              </Button>
            </div>
          </div>
          <p className="mt-4 mb-0 max-w-[80ch] text-[13px] text-slate-500">
            Tekjur tímabilsins bætast jafnóðum við uppsöfnuðu stöðuna. Greitt er út 1. hvers
            mánaðar, að því gefnu að staðan nái {formatIsk(balance?.minPayoutIsk ?? MIN_PAYOUT_ISK)}{' '}
            — annars flyst hún yfir á næsta mánuð.
          </p>
        </NumberedSection>

        <NumberedSection
          n="03"
          title="Hvaðan tekjurnar koma"
          lede="Leiðin frá lesanda á síðunni þinni að krónu í vasann. Hvert skref leiðir af því á undan, svo hlutföllin má sannreyna á tölunum sjálfum."
        >
          <TrafficChain
            pageViewsTrue={stats?.pageViewsTrue}
            requests={stats?.pageviews ?? 0}
            unfilled={stats?.unfilled}
            requestsWithFillData={stats?.requestsWithFillData}
            impressionsWithFillData={stats?.impressionsWithFillData}
            requestsWithTrafficData={stats?.requestsWithTrafficData}
            impressions={stats?.impressions ?? 0}
            measurementStartLabel={measurementStartLabel}
            fillMeasurementStartLabel={fillMeasurementStartLabel}
            footer={
              stats && (
                <div className="flex flex-col gap-3 border-t border-slate-100 pt-4">
                  {/* The business arithmetic, in place of the old "Meðal eCPM"
                    jargon card: the chain's final figure times the net CPM is
                    the revenue figure of section 02. ≈ because per-publisher
                    gross rounding (services/accrual.ts) can drift a few krónur
                    from the flat multiplication. Both constants come from
                    @ada/shared — never hardcoded. */}
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[15px] text-slate-600">
                    <span className="font-semibold text-slate-900 tabular-nums">
                      {formatNumberIs(stats.impressions)} birtingar
                    </span>
                    <span className="text-slate-400">×</span>
                    <span className="tabular-nums">
                      <strong className="font-semibold text-slate-900">
                        {formatIsk(NET_CPM_ISK)}
                      </strong>{' '}
                      á hverjar 1.000
                    </span>
                    <span className="text-slate-400">≈</span>
                    <span className="font-bold text-primary tabular-nums">
                      {formatIsk(netRevenueIsk)}
                    </span>
                  </div>
                  <p className="m-0 text-[13px] text-slate-500">
                    Auglýsandinn greiðir fast verð, {formatIsk(FLAT_CPM_ISK)} fyrir hverjar 1.000
                    birtingar. Þú færð {100 - DEFAULT_PLATFORM_FEE_PERCENT}% af því.
                  </p>
                  {/* Clicks demoted from their own stat cards to one sentence: they
                    describe how the ADVERTS performed, not how much traffic was
                    monetised — and nothing on the old page said the part that
                    matters to a publisher: clicks do not change their revenue.
                    CTR clamped at 100 like every other surface (a click can
                    outrun its viewability-gated impression). */}
                  <p className="m-0 border-t border-slate-100 pt-3 text-[13px] text-slate-500">
                    Smellt var á{' '}
                    <strong className="font-semibold text-slate-700 tabular-nums">
                      {formatNumberIs(stats.clicks)}
                    </strong>{' '}
                    af þessum birtingum (
                    {stats.impressions > 0
                      ? Math.min(100, (stats.clicks / stats.impressions) * 100)
                          .toFixed(2)
                          .replace('.', ',')
                      : '0,00'}
                    %). Smellir hafa ekki áhrif á tekjur þínar — greitt er fyrir birtingar, ekki
                    smelli.
                  </p>
                </div>
              )
            }
          />
        </NumberedSection>

        <NumberedSection n="04" title="Það sem vantar upp á" lede={gapLede}>
          {stats &&
          stats.unfilled !== undefined &&
          stats.requestsWithFillData !== undefined &&
          stats.impressionsWithFillData !== undefined ? (
            (() => {
              const filled = Math.max(0, stats.requestsWithFillData - stats.unfilled);
              const unseen = Math.max(0, filled - stats.impressionsWithFillData);
              const unseenValueIsk = publisherNetIsk(Math.round((unseen / 1000) * FLAT_CPM_ISK));
              // The per-1.000-síðuflettingar cost lines mix the fill window with
              // the traffic window, so they render ONLY when the whole selected
              // window is measured on both counters — otherwise omitted rather
              // than computed across mismatched periods.
              const fullyMeasured =
                pairedTraffic !== null &&
                stats.requestsWithFillData === stats.pageviews &&
                stats.requestsWithTrafficData === stats.pageviews;
              const per1000 = (count: number) =>
                Math.round(
                  (publisherNetIsk(Math.round((count / 1000) * FLAT_CPM_ISK)) / pairedTraffic!.pv) *
                    1000,
                );
              // The slot losing the most to never-being-seen, from the slot
              // list's own measured-days pairing (impressionsWithFillData
              // shipped with this change): filled − seen per slot, largest
              // gap wins. Only named when a slot has a positive measured gap —
              // otherwise the card stays generic.
              const worstUnseenSlot = ((slots as any[]) ?? [])
                .map((sl: any) => {
                  const st = sl.stats;
                  if (
                    !st ||
                    typeof st.unfilled !== 'number' ||
                    typeof st.requestsWithFillData !== 'number' ||
                    typeof st.impressionsWithFillData !== 'number'
                  ) {
                    return null;
                  }
                  const slotFilled = Math.max(0, st.requestsWithFillData - st.unfilled);
                  return {
                    name: sl.name as string,
                    gap: Math.max(0, slotFilled - st.impressionsWithFillData),
                  };
                })
                .filter((x): x is { name: string; gap: number } => x !== null && x.gap > 0)
                .sort((a, b) => b.gap - a.gap)[0];
              return (
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                  <div className="flex flex-col gap-3 rounded-card border border-slate-200 bg-white p-6">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-3xl font-bold tracking-tight tabular-nums">
                        {formatNumberIs(stats.unfilled ?? 0)}
                      </div>
                      <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-primary">
                        Okkar mál
                      </span>
                    </div>
                    <div className="text-[15px] font-semibold text-slate-900">
                      beiðnir seldust ekki
                    </div>
                    <p className="m-0 text-[13px] leading-relaxed text-slate-500">
                      Enginn auglýsandi var með virka herferð í þínum efnisflokkum þá stundina. Þú
                      getur ekkert gert við þessu — það er okkar að laga, ekki þitt.
                    </p>
                    {fullyMeasured && (
                      <div className="border-t border-slate-100 pt-3 text-[13px] text-slate-500">
                        Kostar þig{' '}
                        <strong className="font-semibold text-slate-700 tabular-nums">
                          {formatIsk(per1000(stats.unfilled ?? 0))}
                        </strong>{' '}
                        á hverjar 1.000 síðuflettingar
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-3 rounded-card border border-slate-200 bg-white p-6">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-3xl font-bold tracking-tight tabular-nums">
                        {formatNumberIs(unseen)}
                      </div>
                      <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700">
                        Þitt mál
                      </span>
                    </div>
                    <div className="text-[15px] font-semibold text-slate-900">
                      auglýsingar sáust aldrei
                    </div>
                    <p className="m-0 text-[13px] leading-relaxed text-slate-500">
                      Auglýsingin hlóðst en lesandinn skrollaði aldrei niður að henni. Að færa
                      plássið ofar á síðuna er beinasta leiðin til að hækka tekjurnar — það eru{' '}
                      <strong className="font-semibold text-slate-700 tabular-nums">
                        {formatIsk(unseenValueIsk)}
                      </strong>{' '}
                      á tímabilinu.
                    </p>
                    {worstUnseenSlot && (
                      <p className="m-0 border-t border-slate-100 pt-3 text-[13px] leading-relaxed text-slate-500">
                        Stærsti hlutinn er{' '}
                        <strong className="font-semibold text-slate-700">
                          „{worstUnseenSlot.name}"
                        </strong>{' '}
                        —{' '}
                        <span className="tabular-nums">{formatNumberIs(worstUnseenSlot.gap)}</span>{' '}
                        auglýsingar sáust aldrei þar.
                      </p>
                    )}
                    {fullyMeasured && (
                      <div className="border-t border-slate-100 pt-3 text-[13px] text-slate-500">
                        Kostar þig{' '}
                        <strong className="font-semibold text-slate-700 tabular-nums">
                          {formatIsk(per1000(unseen))}
                        </strong>{' '}
                        á hverjar 1.000 síðuflettingar
                      </div>
                    )}
                  </div>
                </div>
              );
            })()
          ) : (
            <p className="m-0 text-sm text-slate-500">
              Skiptingin í fylltar og ófylltar beiðnir mælist frá {fillMeasurementStartLabel}. Þegar
              fyrstu dagarnir hafa mælst sést hér hvort það sem upp á vantar stafi af því að engin
              herferð passaði eða af því að plássið sást ekki.
            </p>
          )}
        </NumberedSection>

        <NumberedSection
          n="05"
          title="Sundurliðun"
          lede="Sömu tölur, brotnar niður eftir vef, degi og plássi."
        >
          <div className="flex flex-col gap-5">
            {!siteId && stats?.bySite && stats.bySite.length > 1 && (
              <Card>
                <div className="mb-4 flex items-baseline justify-between">
                  <h2 className="m-0 text-[19px] font-bold tracking-[-0.015em]">
                    Yfirlit eftir vefjum
                  </h2>
                  <span className="text-xs text-slate-400 font-medium">
                    Smelltu á línu til að sía mælaborðið
                  </span>
                </div>
                {/* Same rows as the table, as stacked cards on phones — a
                  seven-column table at phone width is unreadable, and
                  publishers check earnings on phones. Same computations, same
                  click-to-filter affordance. useIsMobile rather than hidden/
                  md:block so the rows exist once in the DOM. */}
                {isMobile ? (
                  <div className="flex flex-col gap-3">
                    {stats.bySite.map((site) => {
                      const netSiteEarnings = publisherNetIsk(site.spendIsk);
                      const siteFilled =
                        site.unfilled !== undefined && site.requestsWithFillData !== undefined
                          ? Math.max(0, site.requestsWithFillData - site.unfilled)
                          : null;
                      return (
                        <button
                          key={site.publisherId}
                          type="button"
                          onClick={() => setSiteId(site.publisherId)}
                          className="cursor-pointer rounded-card border border-slate-200 bg-white p-4 text-left"
                        >
                          <div className="flex items-baseline justify-between gap-3">
                            <div>
                              <div className="text-[15px] font-bold text-slate-900">
                                {site.displayName}
                              </div>
                              <div className="font-mono text-[11px] text-slate-400">
                                {site.domain}
                              </div>
                            </div>
                            <div className="text-[17px] font-bold text-slate-900 tabular-nums">
                              {formatIsk(netSiteEarnings)}
                            </div>
                          </div>
                          <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3">
                            <div>
                              <div className="text-[10px] font-bold tracking-wide text-slate-400 uppercase">
                                Beiðnir
                              </div>
                              <div className="text-sm font-semibold tabular-nums">
                                {formatNumberIs(site.pageviews)}
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] font-bold tracking-wide text-slate-400 uppercase">
                                Fylltar
                              </div>
                              <div className="text-sm font-semibold tabular-nums">
                                {siteFilled === null ? '—' : formatNumberIs(siteFilled)}
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] font-bold tracking-wide text-slate-400 uppercase">
                                Birtingar
                              </div>
                              <div className="text-sm font-semibold tabular-nums">
                                {formatNumberIs(site.impressions)}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs font-medium border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-400 font-semibold uppercase tracking-wider">
                          <th className="py-2.5">Vefur</th>
                          <th className="py-2.5 text-right">Síðuflettingar</th>
                          <th className="py-2.5 text-right">Auglýsingabeiðnir</th>
                          <th className="py-2.5 text-right">Fylltar</th>
                          <th className="py-2.5 text-right">Birtingar</th>
                          <th className="py-2.5 text-right">Smellir (CTR)</th>
                          <th className="py-2.5 text-right">Tekjur</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {stats.bySite.map((site) => {
                          const netSiteEarnings = publisherNetIsk(site.spendIsk);
                          // Fill is filled/requests, NOT impressions/requests: impressions
                          // are viewability-gated, so the old ratio quietly blended "no
                          // advertiser" with "never scrolled into view". Null when the
                          // split has not been measured for this window — a dash says
                          // "not measured", where 0% would claim we looked and found none.
                          // Denominator from the days that measured `unfilled`, never
                          // the site's whole-window request count — see the comment on
                          // TrafficChainProps for what that mismatch produced.
                          const fillDenominator = site.requestsWithFillData;
                          const siteFilled =
                            site.unfilled !== undefined && fillDenominator !== undefined
                              ? Math.max(0, fillDenominator - site.unfilled)
                              : null;
                          const fillRate =
                            siteFilled !== null && fillDenominator! > 0
                              ? Math.round((siteFilled / fillDenominator!) * 100)
                              : null;

                          return (
                            <tr
                              key={site.publisherId}
                              onClick={() => setSiteId(site.publisherId)}
                              className="hover:bg-slate-50 cursor-pointer transition-colors"
                            >
                              <td className="py-3">
                                <div className="font-semibold text-slate-900">
                                  {site.displayName}
                                </div>
                                <div className="text-[10px] text-slate-400 font-mono">
                                  {site.domain}
                                </div>
                              </td>
                              <td className="py-3 text-right tabular-nums">
                                {site.pageViewsTrue !== undefined
                                  ? formatNumberIs(site.pageViewsTrue)
                                  : '—'}
                              </td>
                              <td className="py-3 text-right tabular-nums">
                                {formatNumberIs(site.pageviews)}
                              </td>
                              <td className="py-3 text-right tabular-nums">
                                {fillRate === null ? (
                                  <span className="text-slate-400">—</span>
                                ) : (
                                  <span className="font-semibold text-slate-900">
                                    {formatNumberIs(siteFilled!)}{' '}
                                    <span className="text-[11px] font-medium text-slate-400">
                                      ({fillRate}%)
                                    </span>
                                  </span>
                                )}
                              </td>
                              <td className="py-3 text-right tabular-nums">
                                {formatNumberIs(site.impressions)}
                              </td>
                              <td className="py-3 text-right tabular-nums">
                                {formatNumberIs(site.clicks)}
                              </td>
                              <td className="py-3 text-right tabular-nums">
                                <div className="font-bold text-slate-900">
                                  {formatIsk(netSiteEarnings)}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            )}
            {stats && stats.history && stats.history.length > 0 && (
              <Card>
                <div className="mb-6 flex items-end justify-between gap-4">
                  <div>
                    <h2 className="m-0 text-[19px] font-bold tracking-[-0.015em]">Frammistaða</h2>
                    <p className="m-0 mt-1.5 text-sm text-slate-500">
                      {siteId
                        ? 'Birtingar og tekjur yfir tímabilið'
                        : 'Birtingar og tekjur af öllum vefjum yfir tímabilið'}
                    </p>
                  </div>
                </div>
                <div style={{ height: 320, width: '100%' }}>
                  <AnalyticsChart data={stats.history} mode="publisher" />
                </div>
              </Card>
            )}
            <div>
              <div className="mb-2 flex flex-wrap items-end justify-between gap-4">
                <h2 className="m-0 text-[19px] font-bold tracking-[-0.015em]">
                  Virkar auglýsingastöður
                </h2>
                <div className="flex gap-2">
                  <button
                    onClick={downloadSlotsCsv}
                    className="cursor-pointer rounded-lg border border-slate-200 bg-white p-2 transition-colors hover:bg-slate-50"
                    title="Sækja CSV skýrslu"
                  >
                    <Download size={18} />
                  </button>
                </div>
              </div>

              {!slots || slots.length === 0 ? (
                <div className="rounded-card border border-slate-200 bg-white p-8">
                  <EmptyState
                    icon={<Globe size={40} />}
                    title="Engin auglýsingapláss"
                    description="Búðu til þitt fyrsta pláss, fáðu HTML kóðann og settu hann á vefinn þinn til að byrja að græða."
                    action={
                      <Button onClick={() => navigate('/publisher/slots/new')}>
                        Stofna auglýsingapláss
                      </Button>
                    }
                  />
                </div>
              ) : (
                <div className="overflow-x-auto rounded-card border border-slate-200 bg-white">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr>
                        <th className="border-b border-outline-variant px-5 py-3.5 text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
                          Heiti pláss
                        </th>
                        <th className="border-b border-outline-variant px-5 py-3.5 text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
                          Stærð
                        </th>
                        <th className="border-b border-outline-variant px-5 py-3.5 text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
                          Staða
                        </th>
                        <th className="border-b border-outline-variant px-5 py-3.5 text-right text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
                          Birtingar
                        </th>
                        <th className="border-b border-outline-variant px-5 py-3.5 text-right text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
                          Smellir
                        </th>
                        <th className="border-b border-outline-variant px-5 py-3.5 text-right text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
                          CTR
                        </th>
                        <th className="border-b border-outline-variant px-5 py-3.5 text-right text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
                          Tekjur
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {publishers
                        .filter((p) => !siteId || p.id === siteId)
                        .map((pub) => {
                          const pubSlots =
                            (slots as any[])?.filter((s: any) => s.publisherId === pub.id) || [];
                          if (pubSlots.length === 0) {
                            return (
                              <tr
                                key={pub.id}
                                className="border-b border-surface-container bg-slate-50/50"
                              >
                                <td
                                  colSpan={7}
                                  className="px-5 py-4 text-xs font-semibold text-slate-400"
                                >
                                  <span className="inline-flex items-center gap-1.5">
                                    <Globe size={14} />
                                    {pub.domain} — Engin auglýsingapláss skráð.
                                  </span>
                                </td>
                              </tr>
                            );
                          }

                          return (
                            <Fragment key={pub.id}>
                              <tr className="select-none border-y border-outline-variant bg-slate-50/80">
                                <td
                                  colSpan={7}
                                  className="px-5 py-3 text-xs font-extrabold tracking-wide text-slate-800"
                                >
                                  <span className="flex items-center gap-1.5 uppercase">
                                    <Globe size={14} className="text-slate-500" />
                                    {pub.displayName} ({pub.domain})
                                  </span>
                                </td>
                              </tr>
                              {pubSlots.map((s: any) => (
                                <tr
                                  key={s.id}
                                  className="cursor-pointer border-b border-surface-container transition-colors hover:bg-slate-50"
                                  onClick={() => navigate(`/publisher/slots/${s.id}`)}
                                >
                                  <td className="px-5 py-5.5 align-middle">
                                    <div className="flex min-w-0 flex-col">
                                      <span className="max-w-50 truncate text-[15px] font-semibold text-slate-900">
                                        {s.name}
                                      </span>
                                      <span className="max-w-50 truncate text-[13px] text-slate-500">
                                        {pub.domain}
                                        {s.placement?.pageMatcher &&
                                        s.placement.pageMatcher !== '/*'
                                          ? s.placement.pageMatcher
                                          : ''}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-5 py-5.5 align-middle">
                                    <span className="whitespace-nowrap rounded-md bg-surface-container px-3 py-1 text-xs font-semibold text-slate-600">
                                      {s.sizes
                                        .map((sz: any) => `${sz.width}x${sz.height}`)
                                        .join(', ')}
                                    </span>
                                  </td>
                                  <td className="px-5 py-5.5 align-middle">
                                    <div className="flex flex-col gap-1">
                                      <Badge
                                        variant={s.status === 'active' ? 'success' : 'neutral'}
                                      >
                                        {s.status === 'active' ? 'Virk' : 'Óvirk'}
                                      </Badge>
                                      {s.status === 'active' &&
                                        (!s.stats || s.stats.pageviews === 0) && (
                                          <span className="inline-flex w-fit items-center gap-1 rounded border border-amber-100 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-600">
                                            <AlertTriangle size={12} />
                                            Engin virkni greind
                                          </span>
                                        )}
                                    </div>
                                  </td>
                                  <td className="px-5 py-5.5 text-right align-middle text-[15px] font-semibold text-slate-900 tabular-nums">
                                    {s.stats ? formatNumberIs(s.stats.impressions) : '0'}
                                  </td>
                                  <td className="px-5 py-5.5 text-right align-middle text-[15px] text-slate-700 tabular-nums">
                                    {s.stats ? formatNumberIs(s.stats.clicks) : '0'}
                                  </td>
                                  <td className="px-5 py-5.5 text-right align-middle text-[15px] text-slate-700 tabular-nums">
                                    {s.stats && s.stats.impressions > 0
                                      ? `${Math.min(
                                          100,
                                          (s.stats.clicks / s.stats.impressions) * 100,
                                        )
                                          .toFixed(2)
                                          .replace('.', ',')}%`
                                      : '0,00%'}
                                  </td>
                                  <td className="px-5 py-5.5 text-right align-middle text-[15px] font-semibold text-primary tabular-nums">
                                    {s.stats
                                      ? formatIsk(publisherNetIsk(s.stats.spendIsk))
                                      : formatIsk(0)}
                                    <span className="block text-[10px] font-medium text-slate-500">
                                      {s.pricing.mode === 'cpm'
                                        ? `${formatIsk(s.pricing.cpmIsk)} CPM`
                                        : `${formatIsk(s.pricing.slotPriceIsk)} / ${s.pricing.slotPeriodDays}d`}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </Fragment>
                          );
                        })}
                    </tbody>
                  </table>
                  <div className="flex justify-center border-t border-outline-variant bg-surface-container-low px-5 py-4">
                    <button
                      onClick={() => navigate('/publisher/slots')}
                      className="inline-flex cursor-pointer items-center gap-1 border-none bg-transparent text-sm font-bold text-primary hover:underline"
                    >
                      Sjá öll auglýsingapláss
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </NumberedSection>
      </div>
    </div>
  );
}

// Labels aligned with the redesigned pages' own H1s (Mælaborð / Vefir /
// Greiðslur) and the templates' shared navItems — the pre-redesign labels
// (Yfirlit / Auglýsingapláss / Tekjur) no longer matched the page titles.
const sidebarItems = [
  { to: '/publisher', label: 'Mælaborð', icon: 'dashboard' },
  { to: '/publisher/traffic', label: 'Umferð', icon: 'monitoring' },
  { to: '/publisher/slots', label: 'Vefir', icon: 'grid_view' },
  { to: '/publisher/earnings', label: 'Greiðslur', icon: 'payments' },
];

export default function PublisherDashboard() {
  const { data: publishers, isLoading, isLoadingError, isFetching, refetch } = usePublishers();

  useEffect(() => {
    if (publishers && publishers.length > 0) {
      localStorage.setItem('ada_last_role', 'publisher');
    }
  }, [publishers]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-8">
        <div className="max-w-md w-full">
          <LoadingState />
        </div>
      </div>
    );
  }

  // A failed /v1/publishers/all must not be read as "this user has no sites".
  // usePublishers() runs with `retry: false`, so one cold Vercel function or
  // one expired token used to drop an established publisher straight into the
  // onboarding wizard — the app telling them, with no error anywhere on
  // screen, that the sites they own do not exist. Same class of lie as a
  // failed balance request rendering as "0 kr." on Greiðslur, and it also
  // made that page's own error state unreachable, since nobody gets past this
  // shell to see it.
  if (isLoadingError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-8">
        <div className="max-w-md w-full">
          <ErrorState
            message="Ekki tókst að sækja vefina þína. Þetta er tæknileg villa í sambandi við þjóninn — vefirnir þínir eru óbreyttir. Reyndu aftur eftir smástund."
            onRetry={refetch}
            retrying={isFetching}
          />
        </div>
      </div>
    );
  }

  if (!publishers || publishers.length === 0) {
    return (
      <Routes>
        <Route path="onboarding" element={<PublisherOnboarding />} />
        <Route path="*" element={<Navigate to="/publisher/onboarding" replace />} />
      </Routes>
    );
  }

  return (
    <AppShell items={sidebarItems} title="Birtingur Útgefandi">
      <Routes>
        <Route path="/" element={<PublisherHome />} />
        <Route path="onboarding" element={<PublisherOnboarding />} />
        <Route path="slots" element={<SlotList />} />
        <Route path="slots/new" element={<SlotCreate />} />
        <Route path="slots/:id" element={<SlotDetail />} />
        <Route path="traffic" element={<Traffic />} />
        <Route path="earnings" element={<Earnings />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/publisher" replace />} />
      </Routes>
    </AppShell>
  );
}
