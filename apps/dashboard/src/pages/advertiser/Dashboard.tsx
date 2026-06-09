import { useEffect, useMemo, useState } from 'react';
import { Routes, Route, useNavigate, Navigate } from 'react-router-dom';
import { Megaphone } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { useAdvertiser } from '@/hooks/useAdvertiser';
import { useWallet } from '@/hooks/useWallet';
import { useCampaigns, useBulkCreativeStats } from '@/hooks/useCampaigns';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { formatIsk } from '@/lib/format';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  CartesianGrid,
} from 'recharts';

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

function AdvertiserHome() {
  const { data: advertiser, isLoading: isAdvLoading } = useAdvertiser();
  const { data: wallet, isLoading: isWalletLoading } = useWallet(!!advertiser);
  const { data: campaigns, isLoading: isCampaignsLoading } = useCampaigns(!!advertiser);
  const { data: stats } = useQuery<StatsResponse>({
    queryKey: ['advertiser', 'stats'],
    queryFn: () => apiFetch<StatsResponse>('/v1/advertisers/me/stats?timeframe=30'),
    enabled: !!advertiser,
  });

  const [liveSystemImpressions, setLiveSystemImpressions] = useState<number>(0);

  useEffect(() => {
    if (stats?.systemImpressions7d !== undefined) {
      setLiveSystemImpressions(stats.systemImpressions7d);
    }
  }, [stats?.systemImpressions7d]);
  const { data: bulkCreativeStats } = useBulkCreativeStats(!!advertiser);
  const navigate = useNavigate();

  // Compute percentage changes from stats.history (compare last 7 days vs previous 7 days)
  const pctChanges = useMemo(() => {
    if (!stats?.history || stats.history.length < 2)
      return { impressions: null, clicks: null, ctr: null };
    const half = Math.floor(stats.history.length / 2);
    const recent = stats.history.slice(half);
    const older = stats.history.slice(0, half);
    const sumRecent = { imp: 0, clk: 0 };
    const sumOlder = { imp: 0, clk: 0 };
    for (const h of recent) {
      sumRecent.imp += h.impressions;
      sumRecent.clk += h.clicks;
    }
    for (const h of older) {
      sumOlder.imp += h.impressions;
      sumOlder.clk += h.clicks;
    }
    const pctImp = sumOlder.imp > 0 ? ((sumRecent.imp - sumOlder.imp) / sumOlder.imp) * 100 : null;
    const pctClk = sumOlder.clk > 0 ? ((sumRecent.clk - sumOlder.clk) / sumOlder.clk) * 100 : null;
    const ctrRecent = sumRecent.imp > 0 ? (sumRecent.clk / sumRecent.imp) * 100 : 0;
    const ctrOlder = sumOlder.imp > 0 ? (sumOlder.clk / sumOlder.imp) * 100 : 0;
    const pctCtr = ctrOlder > 0 ? ((ctrRecent - ctrOlder) / ctrOlder) * 100 : null;
    return { impressions: pctImp, clicks: pctClk, ctr: pctCtr };
  }, [stats]);

  // Fetch AI tips from Gemini-powered API
  const { data: aiTipsData } = useQuery({
    queryKey: ['ai-tips'],
    queryFn: () => apiFetch<{ tips: string[] }>('/v1/advertisers/me/ai-tips'),
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: 1,
    enabled: !!advertiser,
  });

  if (isAdvLoading || isWalletLoading || isCampaignsLoading) {
    return <LoadingState />;
  }

  if (!advertiser) {
    return <Navigate to="/advertiser/onboarding" replace />;
  }

  // Calculate sum metrics from campaigns for display

  // Dynamic stats mapping
  const impressions = stats ? stats.impressions.toLocaleString('is-IS') : '0';
  const clicks = stats ? stats.clicks.toLocaleString('is-IS') : '0';
  const ctr =
    stats && stats.impressions > 0
      ? `${((stats.clicks / stats.impressions) * 100).toFixed(2).replace('.', ',')}%`
      : '0,00%';

  const aiTips = aiTipsData?.tips ?? ['Snjallráð hlaðast...'];

  return (
    <div className="space-y-gutter">
      {/* Welcome & Balance Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-gutter">
        {/* Wallet Card */}
        <div className="lg:col-span-2 relative overflow-hidden bg-primary text-on-primary rounded-xl p-8 shadow-xl flex flex-col justify-between min-h-[240px]">
          <div className="absolute -right-12 -top-12 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
          <div className="relative z-10">
            <p className="text-label-md opacity-85 uppercase tracking-widest mb-2 font-semibold">
              Heildarinnistæða
            </p>
            <h2 className="text-display-lg font-bold">{formatIsk(wallet?.balanceIsk ?? 0)}</h2>
          </div>
          <div className="relative z-10 flex items-center justify-between gap-4 mt-6">
            <p className="text-body-md max-w-sm opacity-90">
              {(() => {
                if (!stats || !stats.history || stats.history.length === 0 || stats.spendIsk === 0)
                  return 'Fylltu á veskið til að hefja birtingar.';
                const dailyAvg = stats.spendIsk / stats.history.length;
                const daysLeft =
                  dailyAvg > 0 ? Math.round((wallet?.balanceIsk ?? 0) / dailyAvg) : 0;
                if (daysLeft <= 0) return 'Innistæða er uppurin. Fylltu á til að halda áfram.';
                return `Innistæða þín dugar í um það bil ${daysLeft} daga miðað við núverandi eyðslu.`;
              })()}
            </p>
            <button
              onClick={() => navigate('/advertiser/topup')}
              className="bg-surface-container-lowest text-primary px-8 py-3 rounded-lg font-bold text-label-md hover:opacity-90 transition-all active:scale-95 whitespace-nowrap cursor-pointer"
            >
              Fylla á
            </button>
          </div>
        </div>

        {/* AI Smart Tips Card */}
        <div className="bg-tertiary-container text-on-tertiary-container rounded-xl p-8 flex flex-col justify-between relative overflow-hidden border border-outline-variant shadow-sm">
          <div className="relative z-10">
            <span className="material-symbols-outlined text-tertiary-fixed-dim text-4xl mb-3">
              auto_awesome
            </span>
            <h3 className="text-headline-md mb-3 font-bold">Snjallráð</h3>
            <ul className="space-y-2">
              {aiTips.map((tip, i) => (
                <li key={i} className="text-body-sm opacity-85 flex items-start gap-2">
                  <span className="material-symbols-outlined text-sm mt-0.5 shrink-0">
                    lightbulb
                  </span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Performance Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-gutter">
        {/* Stat 1 */}
        <div className="glass-card rounded-xl p-6 hover:border-primary transition-all group animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-secondary-fixed rounded-lg text-primary group-hover:bg-primary group-hover:text-on-primary transition-colors">
              <span className="material-symbols-outlined">visibility</span>
            </div>
            {pctChanges.impressions !== null && (
              <span
                className={`${pctChanges.impressions >= 0 ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'} px-2 py-1 rounded-md text-xs font-bold flex items-center gap-1`}
              >
                {pctChanges.impressions >= 0 ? '+' : ''}
                {pctChanges.impressions.toFixed(1).replace('.', ',')}%{' '}
                <span className="material-symbols-outlined text-[12px]">
                  {pctChanges.impressions >= 0 ? 'trending_up' : 'trending_down'}
                </span>
              </span>
            )}
          </div>
          <p className="text-on-secondary-fixed-variant text-label-md mb-1 font-medium">
            Birtingar
          </p>
          <p className="text-on-surface text-headline-md font-bold">{impressions}</p>
        </div>

        {/* Stat 2 */}
        <div
          className="glass-card rounded-xl p-6 hover:border-primary transition-all group animate-fade-in"
          style={{ animationDelay: '0.1s' }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-secondary-fixed rounded-lg text-primary group-hover:bg-primary group-hover:text-on-primary transition-colors">
              <span className="material-symbols-outlined">ads_click</span>
            </div>
            {pctChanges.clicks !== null && (
              <span
                className={`${pctChanges.clicks >= 0 ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'} px-2 py-1 rounded-md text-xs font-bold flex items-center gap-1`}
              >
                {pctChanges.clicks >= 0 ? '+' : ''}
                {pctChanges.clicks.toFixed(1).replace('.', ',')}%{' '}
                <span className="material-symbols-outlined text-[12px]">
                  {pctChanges.clicks >= 0 ? 'trending_up' : 'trending_down'}
                </span>
              </span>
            )}
          </div>
          <p className="text-on-secondary-fixed-variant text-label-md mb-1 font-medium">Smellir</p>
          <p className="text-on-surface text-headline-md font-bold">{clicks}</p>
        </div>

        {/* Stat 3 */}
        <div
          className="glass-card rounded-xl p-6 hover:border-primary transition-all group animate-fade-in"
          style={{ animationDelay: '0.2s' }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-secondary-fixed rounded-lg text-primary group-hover:bg-primary group-hover:text-on-primary transition-colors">
              <span className="material-symbols-outlined">leaderboard</span>
            </div>
            {pctChanges.ctr !== null && (
              <span
                className={`${pctChanges.ctr >= 0 ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'} px-2 py-1 rounded-md text-xs font-bold flex items-center gap-1`}
              >
                {pctChanges.ctr >= 0 ? '+' : ''}
                {pctChanges.ctr.toFixed(1).replace('.', ',')}%{' '}
                <span className="material-symbols-outlined text-[12px]">
                  {pctChanges.ctr >= 0 ? 'trending_up' : 'trending_down'}
                </span>
              </span>
            )}
          </div>
          <p className="text-on-secondary-fixed-variant text-label-md mb-1 font-medium">
            Smellihlutfall (CTR)
          </p>
          <p className="text-on-surface text-headline-md font-bold">{ctr}</p>
        </div>

        {/* Stat 4: Live System Impressions */}
        <div
          className="glass-card rounded-xl p-6 hover:border-primary transition-all group animate-fade-in bg-primary-container/10 border-primary/20"
          style={{ animationDelay: '0.3s' }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-primary-fixed rounded-lg text-primary group-hover:bg-primary group-hover:text-on-primary transition-colors">
              <span className="material-symbols-outlined animate-pulse">language</span>
            </div>
            <span className="text-green-600 bg-green-50 px-2 py-1 rounded-md text-xs font-bold flex items-center gap-1">
              Í gangi
              <span className="w-1.5 h-1.5 rounded-full bg-green-600 animate-ping"></span>
            </span>
          </div>
          <p className="text-on-secondary-fixed-variant text-label-md mb-1 font-medium">
            Heildarbirtingar kerfis (7d)
          </p>
          <p className="text-on-surface text-headline-md font-bold font-mono">
            {liveSystemImpressions ? liveSystemImpressions.toLocaleString('is-IS') : '—'}
          </p>
        </div>
      </div>

      {/* Performance Graph Card */}
      {stats && stats.history && stats.history.length > 0 && (
        <Card className="bg-surface-container-lowest border border-outline-variant p-8 rounded-xl shadow-[0px_4px_12px_rgba(0,0,0,0.03)] animate-fade-in">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
            <div>
              <h3 className="text-headline-md text-on-surface font-bold">Árangur herferða</h3>
              <p className="text-label-md text-secondary">
                Birtingar og smellir yfir síðustu 30 daga
              </p>
            </div>
            <div className="flex gap-4 text-xs font-semibold text-secondary">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 bg-blue-600 rounded-full"></span>
                <span>Birtingar</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 bg-emerald-500 rounded-full"></span>
                <span>Smellir</span>
              </div>
            </div>
          </div>

          <div className="h-72 w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="impressionsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563eb" stopOpacity={0.15} />
                    <stop offset="100%" stopColor="#2563eb" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="clicksGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.15} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke="#94a3b8"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => {
                    try {
                      const d = new Date(val);
                      return d.toLocaleDateString('is-IS', { day: '2-digit', month: 'short' });
                    } catch {
                      return val;
                    }
                  }}
                />
                <YAxis
                  yAxisId="left"
                  stroke="#94a3b8"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => (val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val)}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  stroke="#94a3b8"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => val}
                />
                <RechartsTooltip
                  cursor={{ stroke: 'rgba(148, 163, 184, 0.1)', strokeWidth: 1 }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const imp = payload.find((p) => p.dataKey === 'impressions')?.value as number;
                      const clk = payload.find((p) => p.dataKey === 'clicks')?.value as number;
                      const label = payload[0]!.payload.date;
                      let formattedDate = label;
                      try {
                        const parsed = new Date(label);
                        if (!isNaN(parsed.getTime())) {
                          formattedDate = parsed.toLocaleDateString('is-IS', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                          });
                        }
                      } catch {}
                      return (
                        <div className="bg-slate-950/95 backdrop-blur text-white p-4 rounded-xl text-xs font-semibold shadow-xl border border-slate-800 space-y-2">
                          <p className="text-slate-400 font-bold border-b border-slate-800 pb-1.5">
                            {formattedDate}
                          </p>
                          <div className="space-y-1">
                            <div className="flex justify-between items-center gap-6">
                              <span className="text-slate-400">Birtingar:</span>
                              <span className="font-bold text-blue-400 text-right">
                                {imp?.toLocaleString('is-IS')}
                              </span>
                            </div>
                            <div className="flex justify-between items-center gap-6">
                              <span className="text-slate-400">Smellir:</span>
                              <span className="font-bold text-emerald-400 text-right">
                                {clk?.toLocaleString('is-IS')}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="impressions"
                  stroke="#2563eb"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#impressionsGrad)"
                />
                <Area
                  yAxisId="right"
                  type="monotone"
                  dataKey="clicks"
                  stroke="#10b981"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#clicksGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Active Campaigns Table Section */}
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant overflow-hidden shadow-sm">
        <div className="px-8 py-6 flex items-center justify-between border-b border-outline-variant">
          <div>
            <h3 className="text-headline-md text-on-surface font-bold">Virkar herferðir</h3>
            <p className="text-label-md text-on-secondary-container">
              Yfirlit yfir herferðir í keyrslu
            </p>
          </div>
          <button
            onClick={() => navigate('/advertiser/campaigns')}
            className="text-primary font-bold text-label-md hover:underline flex items-center gap-1 cursor-pointer border-none bg-transparent"
          >
            Sjá allar herferðir{' '}
            <span className="material-symbols-outlined text-sm">open_in_new</span>
          </button>
        </div>

        {!campaigns || campaigns.length === 0 ? (
          <div className="p-8">
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
            <table className="w-full text-left border-collapse">
              <thead className="bg-surface-container-low">
                <tr>
                  <th className="px-8 py-4 text-label-sm text-outline uppercase tracking-wider font-semibold">
                    Herferð
                  </th>
                  <th className="px-8 py-4 text-label-sm text-outline uppercase tracking-wider text-center font-semibold">
                    Staða
                  </th>
                  <th className="px-8 py-4 text-label-sm text-outline uppercase tracking-wider font-semibold">
                    Notkun
                  </th>
                  <th className="px-8 py-4 text-label-sm text-outline uppercase tracking-wider text-right font-semibold">
                    Birtingar
                  </th>
                  <th className="px-8 py-4 text-label-sm text-outline uppercase tracking-wider text-right font-semibold">
                    Smellir
                  </th>
                  <th className="px-8 py-4 text-label-sm text-outline uppercase tracking-wider text-right font-semibold">
                    CTR
                  </th>
                  <th className="px-8 py-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {campaigns.slice(0, 4).map((c) => {
                  const spent = c.budget.totalIsk - c.budget.remainingIsk;
                  const pct = Math.min(100, Math.round((spent / c.budget.totalIsk) * 100)) || 0;

                  // Get status details in Icelandic
                  let statusLabel: string = c.status;
                  let statusClass = 'bg-slate-100 text-slate-800';
                  let statusDot = 'bg-slate-600';
                  if (c.status === 'active') {
                    statusLabel = 'Í gangi';
                    statusClass = 'bg-green-100 text-green-800';
                    statusDot = 'bg-green-600 animate-pulse';
                  } else if (c.status === 'pending_approval') {
                    statusLabel = 'Í yfirferð';
                    statusClass = 'bg-amber-100 text-amber-800';
                    statusDot = 'bg-amber-600';
                  } else if (c.status === 'paused') {
                    statusLabel = 'Stöðvuð';
                    statusClass = 'bg-slate-100 text-slate-800';
                    statusDot = 'bg-slate-600';
                  }

                  return (
                    <tr
                      key={c.id}
                      className="hover:bg-surface-container transition-colors group cursor-pointer"
                      onClick={() => navigate(`/advertiser/campaigns/${c.id}`)}
                    >
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-lg bg-secondary-fixed flex items-center justify-center shrink-0 overflow-hidden">
                            <span className="material-symbols-outlined text-primary text-xl">
                              campaign
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-label-md text-on-surface font-bold truncate max-w-[220px]">
                              {c.name || `Herferð ${c.id.substring(0, 8)}`}
                            </p>
                            <p className="text-[11px] text-outline font-medium truncate max-w-[220px]">
                              {c.targeting.categories.join(', ') || 'Almennt'}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-5 text-center">
                        <span
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${statusClass}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${statusDot}`}></span>
                          {statusLabel}
                        </span>
                      </td>
                      <td className="px-8 py-5 w-64">
                        <div className="flex flex-col gap-1.5">
                          <div className="flex justify-between text-[11px] font-bold text-on-surface-variant">
                            <span>{pct}% nýtt</span>
                            <span>{formatIsk(spent)}</span>
                          </div>
                          <div className="w-full h-2 bg-surface-container-high rounded-full overflow-hidden">
                            <div
                              className="bg-primary h-full rounded-full transition-all"
                              style={{ width: `${pct}%` }}
                            ></div>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-5 text-right text-body-md text-on-surface font-semibold">
                        {(c as any).stats
                          ? (c as any).stats.impressions.toLocaleString('is-IS')
                          : '0'}
                      </td>
                      <td className="px-8 py-5 text-right text-body-md text-on-surface font-semibold">
                        {(c as any).stats ? (c as any).stats.clicks.toLocaleString('is-IS') : '0'}
                      </td>
                      <td className="px-8 py-5 text-right text-body-md text-on-surface font-semibold">
                        {(c as any).stats
                          ? `${(c as any).stats.ctr.toFixed(1).replace('.', ',')}%`
                          : '0,0%'}
                      </td>
                      <td className="px-8 py-5 text-right">
                        <button className="p-2 text-outline hover:text-primary hover:bg-secondary-container rounded-full transition-all cursor-pointer">
                          <span className="material-symbols-outlined">more_vert</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
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
