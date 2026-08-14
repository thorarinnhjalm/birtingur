import { useEffect, useMemo, useState } from 'react';
import { Routes, Route, useNavigate, Navigate } from 'react-router-dom';
import {
  Megaphone,
  Images,
  PlusCircle,
  ArrowUpRight,
  Sparkles,
  Lightbulb,
  Bot,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { useAdvertiser } from '@/hooks/useAdvertiser';
import { useWallet } from '@/hooks/useWallet';
import { useCampaigns, useApproveCampaign, useRejectCampaign } from '@/hooks/useCampaigns';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatCard } from '@/components/ui/StatCard';
import { Badge } from '@/components/ui/Badge';
import { formatIsk } from '@/lib/format';
import { AnalyticsChart } from '@/components/charts/AnalyticsChart';
import { EditorialH1 } from '@/components/ui/editorial';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

import TopUp from './TopUp';
import CampaignCreate from './CampaignCreate';
import CampaignList from './CampaignList';
import CampaignDetail from './CampaignDetail';
import CreativeLibrary from './CreativeLibrary';
import Settings from './Settings';
import AdvertiserOnboarding from './Onboarding';

interface StatsResponse {
  impressions: number;
  clicks: number;
  spendIsk: number;
  systemImpressions7d: number;
  history: {
    date: string;
    impressions: number;
    clicks: number;
    spendIsk: number;
  }[];
}

// Real campaign statuses per CampaignStatusSchema (@ada/shared): draft,
// pending_approval, active, paused, completed. The dashboard.dc.html template
// mocks two statuses ("Í bið" / pending, "Hafnað" / rejected) that don't exist
// on the real Campaign type — they're intentionally not mapped here so we
// never fabricate a status the API can't return. Labels/variants for the
// statuses that do overlap ("Virk", "Í yfirferð", "Í hléi") are copied
// verbatim from the template.
const STATUS_MAP: Record<
  string,
  { label: string; variant: 'success' | 'pending' | 'danger' | 'info' | 'neutral' }
> = {
  active: { label: 'Virk', variant: 'success' },
  pending_approval: { label: 'Í yfirferð', variant: 'info' },
  paused: { label: 'Í hléi', variant: 'neutral' },
  draft: { label: 'Drög', variant: 'neutral' },
  completed: { label: 'Lokið', variant: 'neutral' },
};

/**
 * Campaigns an agent (over MCP/API) bought above its API key's auto-approve
 * limit — tagged `pendingReason: 'agent_purchase'` (see
 * services/campaigns.ts). Funds are already committed from the wallet; the
 * owner just needs to let it go live or reject it (which releases the
 * committed hold, no refund entry needed since nothing was ever charged).
 */
function PendingAgentCampaigns() {
  const { data: campaigns } = useCampaigns();
  const approve = useApproveCampaign();
  const reject = useRejectCampaign();

  const pending = (campaigns ?? []).filter(
    (c) => c.pendingReason === 'agent_purchase' && c.status === 'pending_approval',
  );
  if (pending.length === 0) return null;

  return (
    <div className="rounded-card border border-amber-200 bg-amber-50 p-6">
      <div className="flex items-center gap-2">
        <div className="rounded-lg bg-amber-100 p-2 text-amber-700">
          <Bot size={18} />
        </div>
        <h3 className="text-sm font-bold tracking-tight text-slate-900">
          Herferðir sem bíða samþykkis
        </h3>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-slate-600">
        Agent tengdur auglýsingaaðgangnum þínum stofnaði þessar herferðir. Fjármunir eru þegar
        frátéknir úr veskinu — samþykktu til að hefja birtingar eða hafnaðu til að losa upphæðina
        aftur.
      </p>
      <ul className="mt-4 flex flex-col gap-3">
        {pending.map((c) => (
          <li
            key={c.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-white p-4"
          >
            <div>
              <div className="text-sm font-semibold text-slate-900">
                {c.name || `Herferð ${c.id.substring(0, 8)}`}
              </div>
              <div className="mt-0.5 text-xs text-slate-500">
                {c.targeting.categories.join(', ')} · {formatIsk(c.budget.totalIsk)}
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                className="!px-3 !py-2 text-xs"
                disabled={reject.isPending || approve.isPending}
                onClick={() => reject.mutate(c.id)}
              >
                Hafna
              </Button>
              <Button
                className="!px-3 !py-2 text-xs"
                disabled={reject.isPending || approve.isPending}
                onClick={() => approve.mutate(c.id)}
              >
                Samþykkja
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AdvertiserHome() {
  const [datePreset, setDatePreset] = useState<'7' | '30' | '90' | 'custom'>('30');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [activeRange, setActiveRange] = useState<{
    timeframe?: number;
    startDate?: string;
    endDate?: string;
  }>({ timeframe: 30 });

  const { data: advertiser, isLoading: isAdvLoading } = useAdvertiser();
  const { data: wallet, isLoading: isWalletLoading } = useWallet(!!advertiser);
  const { data: campaigns, isLoading: isCampaignsLoading } = useCampaigns(!!advertiser);
  const { data: stats } = useQuery<StatsResponse>({
    queryKey: ['advertiser', 'stats', activeRange],
    queryFn: () => {
      let url = '/v1/advertisers/me/stats';
      const params = new URLSearchParams();
      if (activeRange.startDate && activeRange.endDate) {
        params.set('startDate', activeRange.startDate);
        params.set('endDate', activeRange.endDate);
      } else if (activeRange.timeframe) {
        params.set('timeframe', activeRange.timeframe.toString());
      }
      const qStr = params.toString();
      if (qStr) url += `?${qStr}`;
      return apiFetch<StatsResponse>(url);
    },
    enabled: !!advertiser,
  });

  const [liveSystemImpressions, setLiveSystemImpressions] = useState<number>(0);

  useEffect(() => {
    if (stats?.systemImpressions7d !== undefined) {
      setLiveSystemImpressions(stats.systemImpressions7d);
    }
  }, [stats?.systemImpressions7d]);
  const navigate = useNavigate();

  // Compute percentage changes from stats.history (compare last 7 days vs previous 7 days)
  const pctChanges = useMemo(() => {
    if (!stats?.history || stats.history.length < 2)
      return { impressions: null, clicks: null, ctr: null, ecpc: null, ecpm: null, spend: null };
    // Equal halves — see the publisher dashboard's pctChanges for why. The
    // uneven split also skewed the eCPC/eCPM badges these sums feed.
    const half = Math.floor(stats.history.length / 2);
    const recent = stats.history.slice(-half);
    const older = stats.history.slice(-2 * half, -half);
    const sumRecent = { imp: 0, clk: 0, spend: 0 };
    const sumOlder = { imp: 0, clk: 0, spend: 0 };
    for (const h of recent) {
      sumRecent.imp += h.impressions;
      sumRecent.clk += h.clicks;
      sumRecent.spend += h.spendIsk;
    }
    for (const h of older) {
      sumOlder.imp += h.impressions;
      sumOlder.clk += h.clicks;
      sumOlder.spend += h.spendIsk;
    }
    const pctImp = sumOlder.imp > 0 ? ((sumRecent.imp - sumOlder.imp) / sumOlder.imp) * 100 : null;
    const pctClk = sumOlder.clk > 0 ? ((sumRecent.clk - sumOlder.clk) / sumOlder.clk) * 100 : null;
    const ctrRecent = sumRecent.imp > 0 ? (sumRecent.clk / sumRecent.imp) * 100 : 0;
    const ctrOlder = sumOlder.imp > 0 ? (sumOlder.clk / sumOlder.imp) * 100 : 0;
    const pctCtr = ctrOlder > 0 ? ((ctrRecent - ctrOlder) / ctrOlder) * 100 : null;

    const ecpcRecent = sumRecent.clk > 0 ? sumRecent.spend / sumRecent.clk : 0;
    const ecpcOlder = sumOlder.clk > 0 ? sumOlder.spend / sumOlder.clk : 0;
    const pctEcpc = ecpcOlder > 0 ? ((ecpcRecent - ecpcOlder) / ecpcOlder) * 100 : null;

    const ecpmRecent = sumRecent.imp > 0 ? (sumRecent.spend / sumRecent.imp) * 1000 : 0;
    const ecpmOlder = sumOlder.imp > 0 ? (sumOlder.spend / sumOlder.imp) * 1000 : 0;
    const pctEcpm = ecpmOlder > 0 ? ((ecpmRecent - ecpmOlder) / ecpmOlder) * 100 : null;

    // Spend % change — not in the original memo (which only fed the eCPC/eCPM
    // cost badges), added so the "Eytt í mánuðinum" stat card can show a
    // period-over-period delta like the template's other three cards. Derived
    // from the same already-fetched stats.history, no new request.
    const pctSpend =
      sumOlder.spend > 0 ? ((sumRecent.spend - sumOlder.spend) / sumOlder.spend) * 100 : null;

    return {
      impressions: pctImp,
      clicks: pctClk,
      ctr: pctCtr,
      ecpc: pctEcpc,
      ecpm: pctEcpm,
      spend: pctSpend,
    };
  }, [stats]);

  // Fetch AI tips from Gemini-powered API
  const { data: aiTipsData } = useQuery({
    queryKey: ['ai-tips'],
    queryFn: () => apiFetch<{ tips: string[] }>('/v1/advertisers/me/ai-tips'),
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: 1,
    enabled: !!advertiser,
  });

  // Human period label for the "Tímabil …" line, e.g. "1.–30. júní 2026" or
  // "3. jan – 12. feb 2026" — mirrors the template's copy pattern but is
  // computed from the real, user-selectable activeRange instead of a fixed
  // mock date.
  const periodLabel = useMemo(() => {
    const fmt = (d: Date) => `${d.getDate()}. ${d.toLocaleDateString('is-IS', { month: 'long' })}`;
    let start: Date;
    let end: Date;
    if (activeRange.startDate && activeRange.endDate) {
      start = new Date(activeRange.startDate);
      end = new Date(activeRange.endDate);
    } else {
      end = new Date();
      start = new Date(end);
      start.setDate(end.getDate() - (activeRange.timeframe ?? 30) + 1);
    }
    const sameMonth =
      start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
    const year = end.getFullYear();
    if (sameMonth) {
      return `${start.getDate()}.–${end.getDate()}. ${end.toLocaleDateString('is-IS', { month: 'long' })} ${year}`;
    }
    return `${fmt(start)} – ${fmt(end)} ${year}`;
  }, [activeRange]);

  if (isAdvLoading || isWalletLoading || isCampaignsLoading) {
    return <LoadingState />;
  }

  if (!advertiser) {
    return <Navigate to="/advertiser/onboarding" replace />;
  }

  // Dynamic stats mapping
  const impressions = stats ? stats.impressions.toLocaleString('is-IS') : '0';
  const clicks = stats ? stats.clicks.toLocaleString('is-IS') : '0';
  const ctr =
    stats && stats.impressions > 0
      ? `${Math.min(100, (stats.clicks / stats.impressions) * 100)
          .toFixed(2)
          .replace('.', ',')}%`
      : '0,00%';

  const eCPC =
    stats && stats.clicks > 0 ? formatIsk(Math.round(stats.spendIsk / stats.clicks)) : '0 kr';
  const eCPM =
    stats && stats.impressions > 0
      ? formatIsk(Math.round((stats.spendIsk / stats.impressions) * 1000))
      : '0 kr';

  // Trend badge for the four template-specified StatCards (Birtingar/Smellir/
  // CTR/Eytt) — copy pattern "±X,X% frá fyrra tímabili" is lifted verbatim
  // from the template's mock delta strings, populated with real pctChanges.
  const trendDelta = (pct: number | null): { value: string; positive: boolean } | undefined =>
    pct === null
      ? undefined
      : {
          value: `${pct >= 0 ? '+' : ''}${pct.toFixed(1).replace('.', ',')}% frá fyrra tímabili`,
          positive: pct >= 0,
        };

  // eCPC/eCPM are cost metrics: a decrease is the good outcome, so the badge
  // colors invert relative to trendDelta. Preserved verbatim from the
  // pre-redesign renderCostBadge, only the container markup changed.
  const renderCostBadge = (pct: number | null) => {
    if (pct === null) return null;
    const isDecrease = pct < 0;
    const label = `${isDecrease ? '' : '+'}${pct.toFixed(0)}%`;
    return (
      <span
        className={`${isDecrease ? 'text-green-600 bg-green-55 font-black' : 'text-red-650 bg-red-55 font-bold'} px-1.5 py-0.5 rounded text-[10px] flex items-center gap-0.5`}
      >
        {label}
      </span>
    );
  };

  const aiTips = aiTipsData?.tips ?? ['Snjallráð hlaðast...'];

  return (
    <div className="flex flex-col" style={{ gap: 'clamp(36px,4.5vw,60px)' }}>
      {/* ===== PAGE HEADER =====
          Title/period line copied verbatim from dashboard.dc.html. The
          template's own action button is a static "[Month Year]" mock with no
          wired behaviour; the real 7/30/90/custom date-range control below it
          is not in the template but is kept and restyled since it drives the
          stats/chart queries above. */}
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <EditorialH1>Mælaborð</EditorialH1>
          <p className="mt-3 text-[15px] text-slate-500 tracking-[0.01em]">
            Tímabil&nbsp;&nbsp;
            <span className="text-slate-900 font-semibold">{periodLabel}</span>
          </p>
          <p className="mt-1.5 text-sm font-medium text-slate-500">
            Góðan dag, {advertiser?.companyName || 'auglýsandi'} — hér er yfirlit yfir árangur og
            stöðu herferða þinna í dag.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5">
              {(['7', '30', '90', 'custom'] as const).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    setDatePreset(preset);
                    if (preset !== 'custom') {
                      setActiveRange({ timeframe: parseInt(preset, 10) });
                    }
                  }}
                  className={`cursor-pointer rounded-md px-2.5 py-1 text-[10px] font-bold transition-all ${
                    datePreset === preset
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  {preset === 'custom' ? 'Sérsniðið' : `${preset} dagar`}
                </button>
              ))}
            </div>

            {datePreset === 'custom' && (
              <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 p-1">
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="border-none bg-transparent p-0.5 text-[10px] font-bold text-slate-700 focus:outline-none"
                />
                <span className="text-[10px] font-bold text-slate-400">til</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="border-none bg-transparent p-0.5 text-[10px] font-bold text-slate-700 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (customStart && customEnd) {
                      setActiveRange({ startDate: customStart, endDate: customEnd });
                    }
                  }}
                  disabled={!customStart || !customEnd}
                  className="cursor-pointer rounded-md bg-primary px-2.5 py-1 text-[9px] font-extrabold text-white transition hover:bg-primary-800 disabled:opacity-50"
                >
                  Sækja
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-3">
          <Button
            variant="secondary"
            onClick={() => navigate('/advertiser/creatives')}
            className="flex items-center gap-2 text-xs"
          >
            <Images size={16} />
            <span>Auglýsingar</span>
          </Button>
          <Button
            onClick={() => navigate('/advertiser/campaigns/new')}
            className="flex items-center gap-2 text-xs"
          >
            <PlusCircle size={16} />
            <span>Ný herferð</span>
          </Button>
        </div>
      </header>

      {/* ===== WALLET =====
          Not in the template. Kept because useWallet() and the "Fylla á"
          top-up handler need to stay reachable; restyled to the editorial
          numeral scale (tabular-nums, tight tracking) instead of removed. */}
      <div className="relative flex min-h-[168px] flex-col justify-between overflow-hidden rounded-card bg-primary p-8 text-on-primary shadow-xl">
        <div className="absolute -top-12 -right-12 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
        <div className="relative z-10">
          <p className="mb-1 text-[11px] font-bold tracking-wider text-white/75 uppercase">
            Heildarinnistæða
          </p>
          <div className="text-4xl font-extrabold tracking-[-0.03em] tabular-nums md:text-5xl">
            {formatIsk(wallet?.balanceIsk ?? 0)}
          </div>
          {(wallet?.committedIsk ?? 0) > 0 && (
            <p className="mt-2 text-xs font-medium text-white/75 tabular-nums">
              Þar af frátekið í virkar herferðir: {formatIsk(wallet?.committedIsk ?? 0)} · Laust
              fyrir nýjar herferðir: {formatIsk(Math.max(0, wallet?.availableIsk ?? 0))}
            </p>
          )}
        </div>
        <div className="relative z-10 mt-6 flex flex-col items-start justify-between gap-4 border-t border-white/10 pt-4 sm:flex-row sm:items-center">
          <p className="max-w-sm text-xs leading-relaxed font-medium text-white/90 sm:text-sm">
            {(() => {
              if (!stats || !stats.history || stats.history.length === 0 || stats.spendIsk === 0)
                return 'Fylltu á veskið til að hefja birtingar.';
              const dailyAvg = stats.spendIsk / stats.history.length;
              const daysLeft = dailyAvg > 0 ? Math.round((wallet?.balanceIsk ?? 0) / dailyAvg) : 0;
              if (daysLeft <= 0) return 'Innistæða er uppurin. Fylltu á til að halda áfram.';
              if (daysLeft > 365) return 'Innistæða þín dugar vel miðað við núverandi eyðslu.';
              return `Innistæða þín dugar í um það bil ${daysLeft} daga miðað við núverandi eyðslu.`;
            })()}
          </p>
          <Button
            variant="secondary"
            onClick={() => navigate('/advertiser/topup')}
            className="shrink-0 self-end bg-white text-primary hover:bg-white/95 sm:self-center"
          >
            Fylla á
          </Button>
        </div>
      </div>

      {/* ===== PENDING AGENT CAMPAIGNS =====
          Not in the template. Owner approve/reject surface for campaigns an
          MCP/API agent bought above its key's auto-approve limit — see
          services/campaigns.ts pendingReason: 'agent_purchase'. */}
      <PendingAgentCampaigns />

      {/* ===== STAT CARDS =====
          Birtingar / Smellir / CTR / Eytt í mánuðinum — labels, order and
          card shape copied verbatim from dashboard.dc.html's StatCard row. */}
      <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
        <StatCard
          label="Birtingar"
          value={impressions}
          delta={trendDelta(pctChanges.impressions)}
        />
        <StatCard label="Smellir" value={clicks} delta={trendDelta(pctChanges.clicks)} />
        <StatCard label="CTR" value={ctr} delta={trendDelta(pctChanges.ctr)} />
        {/* Named by the real window: "í mánuðinum" sat over whatever range was
            selected, including 90 days and custom dates. */}
        <StatCard
          label={
            activeRange.timeframe
              ? `Eytt síðustu ${activeRange.timeframe} daga`
              : 'Eytt á völdu tímabili'
          }
          value={formatIsk(stats?.spendIsk ?? 0)}
          delta={trendDelta(pctChanges.spend)}
        />
      </div>

      {/* eCPC / eCPM / Kerfisbirtingar — not in the template's four-card row.
          Kept because the page already fetches this data; restyled icon-free
          and flat to match the spec's StatCard idiom instead of the old
          icon-chip cards. */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <div className="rounded-card border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
              eCPC
            </span>
            {renderCostBadge(pctChanges.ecpc)}
          </div>
          <div className="mt-2 text-3xl font-bold tracking-tight text-slate-900 tabular-nums">
            {eCPC}
          </div>
        </div>
        <div className="rounded-card border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
              eCPM
            </span>
            {renderCostBadge(pctChanges.ecpm)}
          </div>
          <div className="mt-2 text-3xl font-bold tracking-tight text-slate-900 tabular-nums">
            {eCPM}
          </div>
        </div>
        <div className="rounded-card border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
              Kerfisbirtingar
            </span>
            <span className="flex items-center gap-1 text-[10px] font-bold text-green-600">
              Í gangi
              <span className="h-1 w-1 rounded-full bg-green-600 animate-ping" />
            </span>
          </div>
          <div className="mt-2 font-mono text-3xl font-bold tracking-tight text-slate-900 tabular-nums">
            {liveSystemImpressions
              ? liveSystemImpressions >= 1000
                ? `${(liveSystemImpressions / 1000).toFixed(0)}k`
                : liveSystemImpressions
              : '—'}
          </div>
        </div>
      </div>

      {/* ===== CHART =====
          Card title/subtitle copied verbatim from the template; AnalyticsChart
          stays wired with mode="advertiser" on the real stats.history. Kept
          the pre-redesign guard that hides the whole card when there's no
          history yet rather than always rendering an empty-state chart. */}
      {stats && stats.history && stats.history.length > 0 && (
        <Card>
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <h2 className="m-0 text-[19px] font-bold tracking-[-0.015em]">Frammistaða</h2>
              <p className="m-0 mt-1.5 text-sm text-slate-500">
                Birtingar, smellir og kostnaður yfir tímabilið
              </p>
            </div>
          </div>
          <div style={{ height: 320, width: '100%' }}>
            <AnalyticsChart data={stats.history} mode="advertiser" />
          </div>
        </Card>
      )}

      {/* ===== CAMPAIGN TABLE =====
          Column set (Herferð / Staða / Birtingar / Smellir / CTR / Eytt) and
          row treatment (22px vertical padding, hairline dividers, tabular
          numerals, em-dash for missing per-row stats) copied from the
          template. Dropped vs. the pre-redesign table: the "Notkun" budget
          progress-bar column (its number, spend, now surfaces via the new
          "Eytt" column, so no data is lost — only the bar visualization) and
          the trailing "⋮" action button (it had no onClick handler, so it was
          already inert). Row click-through to the campaign detail page and
          the "Sjá allar herferðir" link are preserved handlers, kept even
          though the template's table header has no such link. */}
      <section>
        <div className="mb-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="m-0 text-[22px] font-extrabold tracking-[-0.02em]">Herferðir</h2>
            <p className="m-0 mt-1 text-sm text-slate-500">
              Yfirlit yfir herferðir þínar í keyrslu
            </p>
          </div>
          <div className="flex items-center gap-4">
            {campaigns && campaigns.length > 0 && (
              <span className="text-sm text-slate-500">
                {campaigns.length} {campaigns.length === 1 ? 'herferð' : 'herferðir'}
              </span>
            )}
            <button
              onClick={() => navigate('/advertiser/campaigns')}
              className="inline-flex cursor-pointer items-center gap-1 border-none bg-transparent text-xs font-bold text-primary hover:underline"
            >
              Sjá allar herferðir <ArrowUpRight size={14} />
            </button>
          </div>
        </div>

        {!campaigns || campaigns.length === 0 ? (
          <div className="rounded-card border border-slate-200 bg-white p-8">
            <EmptyState
              icon={<Megaphone size={40} />}
              title="Engar herferðir fundust"
              description="Búðu til þína fyrstu herferð, settu inn fjárhagsáætlun og veldu auglýsingapláss."
              action={
                <Button onClick={() => navigate('/advertiser/campaigns/new')}>
                  Stofna herferð
                </Button>
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="border-b border-outline-variant py-3.5 pr-4 text-left text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
                    Herferð
                  </th>
                  <th className="border-b border-outline-variant px-4 py-3.5 text-left text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
                    Staða
                  </th>
                  <th className="border-b border-outline-variant px-4 py-3.5 text-right text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
                    Birtingar
                  </th>
                  <th className="border-b border-outline-variant px-4 py-3.5 text-right text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
                    Smellir
                  </th>
                  <th className="border-b border-outline-variant px-4 py-3.5 text-right text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
                    CTR
                  </th>
                  <th className="border-b border-outline-variant py-3.5 pl-4 text-right text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
                    Eytt
                  </th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c, i) => {
                  const spent = c.budget.totalIsk - c.budget.remainingIsk;
                  const rowStats = (c as any).stats;
                  const status = STATUS_MAP[c.status] ?? {
                    label: c.status,
                    variant: 'neutral' as const,
                  };
                  const isLast = i === campaigns.length - 1;

                  return (
                    <tr
                      key={c.id}
                      onClick={() => navigate(`/advertiser/campaigns/${c.id}`)}
                      className={`group cursor-pointer transition-colors hover:bg-slate-50 ${
                        isLast ? '' : 'border-b border-surface-container'
                      }`}
                    >
                      <td className="py-[22px] pr-4 align-middle">
                        <div className="text-[15px] font-semibold text-slate-900">
                          {c.name || `Herferð ${c.id.substring(0, 8)}`}
                        </div>
                        <div className="mt-0.5 text-[13px] text-slate-500">
                          {c.targeting.categories.join(', ') || 'Almennt'}
                        </div>
                      </td>
                      <td className="px-4 py-[22px] align-middle">
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </td>
                      <td
                        className={`px-4 py-[22px] text-right text-[15px] tabular-nums ${
                          rowStats ? 'text-slate-700' : 'text-slate-400'
                        }`}
                      >
                        {rowStats ? rowStats.impressions.toLocaleString('is-IS') : '—'}
                      </td>
                      <td
                        className={`px-4 py-[22px] text-right text-[15px] tabular-nums ${
                          rowStats ? 'text-slate-700' : 'text-slate-400'
                        }`}
                      >
                        {rowStats ? rowStats.clicks.toLocaleString('is-IS') : '—'}
                      </td>
                      <td
                        className={`px-4 py-[22px] text-right text-[15px] tabular-nums ${
                          rowStats ? 'text-slate-700' : 'text-slate-400'
                        }`}
                      >
                        {rowStats ? `${rowStats.ctr.toFixed(1).replace('.', ',')}%` : '—'}
                      </td>
                      <td className="py-[22px] pl-4 text-right text-[15px] font-semibold tabular-nums text-slate-900">
                        {formatIsk(spent)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ===== AI SMART TIPS =====
          Not in the template. Kept because the ai-tips query drives it;
          moved from the old sticky right-hand sidebar into a stacked block
          since the template's layout is single-column. */}
      <div className="relative overflow-hidden rounded-card border border-slate-800 bg-slate-900 p-6 text-white">
        <div className="absolute -bottom-8 -right-8 h-32 w-32 rounded-full bg-primary/20 blur-2xl" />
        <div className="relative z-10">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-primary/20 p-2 text-sky-400">
              <Sparkles size={18} />
            </div>
            <h3 className="text-sm font-bold tracking-tight text-white">Snjallráðgjafi</h3>
          </div>
          <p className="mt-4 text-[11px] font-semibold leading-relaxed text-slate-400">
            Ábendingar frá gervigreindinni byggðar á árangri og stöðu þinni:
          </p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {aiTips.map((tip, i) => (
              <li
                key={i}
                className="flex items-start gap-2 rounded-lg border border-slate-800/50 bg-slate-800/40 p-2.5 text-xs leading-relaxed text-slate-200"
              >
                <Lightbulb size={16} className="mt-0.5 shrink-0 text-yellow-400" />
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

const sidebarItems = [
  { to: '/advertiser', label: 'Mælaborð', icon: 'dashboard' },
  { to: '/advertiser/campaigns', label: 'Herferðir', icon: 'campaign' },
  { to: '/advertiser/creatives', label: 'Auglýsingasafn', icon: 'collections' },
  { to: '/advertiser/topup', label: 'Greiðslur', icon: 'payments' },
];

export default function AdvertiserDashboard() {
  const { data: advertiser, isLoading } = useAdvertiser();

  useEffect(() => {
    if (advertiser) {
      localStorage.setItem('ada_last_role', 'advertiser');
    }
  }, [advertiser]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-8">
        <div className="max-w-md w-full">
          <LoadingState />
        </div>
      </div>
    );
  }

  if (!advertiser) {
    return (
      <Routes>
        <Route path="onboarding" element={<AdvertiserOnboarding />} />
        <Route path="*" element={<Navigate to="/advertiser/onboarding" replace />} />
      </Routes>
    );
  }

  return (
    <AppShell items={sidebarItems} title="Birtingur Auglýsandi">
      <Routes>
        <Route path="/" element={<AdvertiserHome />} />
        <Route path="topup" element={<TopUp />} />
        <Route path="campaigns" element={<CampaignList />} />
        <Route path="campaigns/new" element={<CampaignCreate />} />
        <Route path="campaigns/:id" element={<CampaignDetail />} />
        <Route path="creatives" element={<CreativeLibrary />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/advertiser" replace />} />
      </Routes>
    </AppShell>
  );
}
