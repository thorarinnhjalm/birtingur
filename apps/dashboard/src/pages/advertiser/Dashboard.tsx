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
      {/* Header & Title */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Góðan dag, {advertiser?.companyName || 'auglýsandi'}
          </h2>
          <p className="text-slate-500 text-sm font-medium mt-1">
            Hér er yfirlit yfir árangur og stöðu herferða þinna í dag.
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="secondary"
            onClick={() => navigate('/advertiser/creatives')}
            className="flex items-center gap-2 font-bold py-2 px-3 text-xs border border-slate-200"
          >
            <span className="material-symbols-outlined text-[18px]">collections</span>
            <span>Auglýsingar</span>
          </Button>
          <Button
            onClick={() => navigate('/advertiser/campaigns/new')}
            className="flex items-center gap-2 font-bold py-2 px-4 text-xs shadow-md shadow-primary/10"
          >
            <span className="material-symbols-outlined text-[18px]">add_circle</span>
            <span>Ný herferð</span>
          </Button>
        </div>
      </div>

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-gutter items-start">
        {/* Left Column - Main Dashboard Content */}
        <div className="lg:col-span-2 space-y-gutter">
          {/* Wallet Card */}
          <div className="relative overflow-hidden bg-primary text-on-primary rounded-xl p-6 md:p-8 shadow-xl flex flex-col justify-between min-h-[180px]">
            <div className="absolute -right-12 -top-12 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
            <div className="relative z-10">
              <p className="text-[11px] font-bold uppercase tracking-wider opacity-75 mb-1">
                Heildarinnistæða
              </p>
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight">
                {formatIsk(wallet?.balanceIsk ?? 0)}
              </h2>
            </div>
            <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mt-6 pt-4 border-t border-white/10">
              <p className="text-xs sm:text-sm max-w-sm opacity-90 leading-relaxed font-medium">
                {(() => {
                  if (
                    !stats ||
                    !stats.history ||
                    stats.history.length === 0 ||
                    stats.spendIsk === 0
                  )
                    return 'Fylltu á veskið til að hefja birtingar.';
                  const dailyAvg = stats.spendIsk / stats.history.length;
                  const daysLeft =
                    dailyAvg > 0 ? Math.round((wallet?.balanceIsk ?? 0) / dailyAvg) : 0;
                  if (daysLeft <= 0) return 'Innistæða er uppurin. Fylltu á til að halda áfram.';
                  if (daysLeft > 365) return 'Innistæða þín dugar vel miðað við núverandi eyðslu.';
                  return `Innistæða þín dugar í um það bil ${daysLeft} daga miðað við núverandi eyðslu.`;
                })()}
              </p>
              <Button
                variant="secondary"
                onClick={() => navigate('/advertiser/topup')}
                className="bg-white text-primary px-6 py-2 rounded-lg font-bold text-xs hover:bg-white/95 transition-all shadow-sm active:scale-95 shrink-0 self-end sm:self-center"
              >
                Fylla á
              </Button>
            </div>
          </div>

          {/* Performance Stats Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {/* Stat 1 */}
            <div className="glass-card rounded-xl p-4 hover:border-primary transition-all group animate-fade-in bg-white border border-slate-200">
              <div className="flex items-center justify-between mb-2">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-lg group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <span className="material-symbols-outlined text-[20px]">visibility</span>
                </div>
                {pctChanges.impressions !== null && (
                  <span
                    className={`${pctChanges.impressions >= 0 ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'} px-1.5 py-0.5 rounded text-[10px] font-extrabold flex items-center gap-0.5`}
                  >
                    {pctChanges.impressions >= 0 ? '+' : ''}
                    {pctChanges.impressions.toFixed(0)}%
                  </span>
                )}
              </div>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                Birtingar
              </p>
              <p className="text-slate-900 text-lg font-bold mt-0.5">{impressions}</p>
            </div>

            {/* Stat 2 */}
            <div
              className="glass-card rounded-xl p-4 hover:border-primary transition-all group animate-fade-in bg-white border border-slate-200"
              style={{ animationDelay: '0.05s' }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                  <span className="material-symbols-outlined text-[20px]">ads_click</span>
                </div>
                {pctChanges.clicks !== null && (
                  <span
                    className={`${pctChanges.clicks >= 0 ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'} px-1.5 py-0.5 rounded text-[10px] font-extrabold flex items-center gap-0.5`}
                  >
                    {pctChanges.clicks >= 0 ? '+' : ''}
                    {pctChanges.clicks.toFixed(0)}%
                  </span>
                )}
              </div>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                Smellir
              </p>
              <p className="text-slate-900 text-lg font-bold mt-0.5">{clicks}</p>
            </div>

            {/* Stat 3 */}
            <div
              className="glass-card rounded-xl p-4 hover:border-primary transition-all group animate-fade-in bg-white border border-slate-200"
              style={{ animationDelay: '0.1s' }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="p-2 bg-purple-50 text-purple-600 rounded-lg group-hover:bg-purple-600 group-hover:text-white transition-colors">
                  <span className="material-symbols-outlined text-[20px]">leaderboard</span>
                </div>
                {pctChanges.ctr !== null && (
                  <span
                    className={`${pctChanges.ctr >= 0 ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'} px-1.5 py-0.5 rounded text-[10px] font-extrabold flex items-center gap-0.5`}
                  >
                    {pctChanges.ctr >= 0 ? '+' : ''}
                    {pctChanges.ctr.toFixed(0)}%
                  </span>
                )}
              </div>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">CTR</p>
              <p className="text-slate-900 text-lg font-bold mt-0.5">{ctr}</p>
            </div>

            {/* Stat 4 */}
            <div
              className="glass-card rounded-xl p-4 hover:border-primary transition-all group animate-fade-in bg-white border border-slate-200"
              style={{ animationDelay: '0.15s' }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                  <span className="material-symbols-outlined text-[20px] animate-pulse-slow">
                    language
                  </span>
                </div>
                <span className="text-[10px] font-bold text-green-600 bg-green-50 px-1.5 py-0.5 rounded flex items-center gap-1">
                  Í gangi
                  <span className="w-1 h-1 rounded-full bg-green-600 animate-ping"></span>
                </span>
              </div>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                Kerfisbirtingar
              </p>
              <p className="text-slate-900 text-lg font-bold mt-0.5 font-mono">
                {liveSystemImpressions
                  ? liveSystemImpressions >= 1000
                    ? `${(liveSystemImpressions / 1000).toFixed(0)}k`
                    : liveSystemImpressions
                  : '—'}
              </p>
            </div>
          </div>

          {/* Performance Graph Card */}
          {stats && stats.history && stats.history.length > 0 && (
            <Card className="bg-white border border-outline-variant p-6 rounded-xl shadow-[0px_4px_12px_rgba(0,0,0,0.03)] animate-fade-in">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                <div>
                  <h3 className="text-base font-bold text-slate-800">Árangur herferða</h3>
                  <p className="text-xs text-slate-400 font-semibold mt-0.5">
                    Birtingar og smellir yfir síðustu 30 daga
                  </p>
                </div>
                <div className="flex gap-4 text-xs font-semibold text-slate-500">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 bg-blue-600 rounded-full"></span>
                    <span>Birtingar</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full"></span>
                    <span>Smellir</span>
                  </div>
                </div>
              </div>

              <div className="h-72 w-full mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={stats.history}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  >
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
                          const imp = payload.find((p) => p.dataKey === 'impressions')
                            ?.value as number;
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
          <div className="bg-white rounded-xl border border-outline-variant overflow-hidden shadow-sm">
            <div className="px-6 py-5 flex items-center justify-between border-b border-outline-variant">
              <div>
                <h3 className="text-base font-bold text-slate-800">Virkar herferðir</h3>
                <p className="text-xs text-slate-400 font-semibold mt-0.5">
                  Yfirlit yfir herferðir þínar í keyrslu
                </p>
              </div>
              <button
                onClick={() => navigate('/advertiser/campaigns')}
                className="text-primary font-bold text-xs hover:underline flex items-center gap-1 cursor-pointer border-none bg-transparent"
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
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th className="px-6 py-3 text-slate-400 font-semibold uppercase tracking-wider">
                        Herferð
                      </th>
                      <th className="px-6 py-3 text-slate-400 font-semibold uppercase tracking-wider text-center">
                        Staða
                      </th>
                      <th className="px-6 py-3 text-slate-400 font-semibold uppercase tracking-wider">
                        Notkun
                      </th>
                      <th className="px-6 py-3 text-slate-400 font-semibold uppercase tracking-wider text-right">
                        Birtingar
                      </th>
                      <th className="px-6 py-3 text-slate-400 font-semibold uppercase tracking-wider text-right">
                        Smellir
                      </th>
                      <th className="px-6 py-3 text-slate-400 font-semibold uppercase tracking-wider text-right">
                        CTR
                      </th>
                      <th className="px-6 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
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
                          className="hover:bg-slate-50 transition-colors group cursor-pointer"
                          onClick={() => navigate(`/advertiser/campaigns/${c.id}`)}
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                                <span className="material-symbols-outlined text-primary text-lg">
                                  campaign
                                </span>
                              </div>
                              <div className="min-w-0">
                                <p className="font-bold text-slate-900 truncate max-w-[180px]">
                                  {c.name || `Herferð ${c.id.substring(0, 8)}`}
                                </p>
                                <p className="text-[10px] text-slate-400 font-medium truncate max-w-[180px]">
                                  {c.targeting.categories.join(', ') || 'Almennt'}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${statusClass}`}
                            >
                              <span className={`w-1 h-1 rounded-full ${statusDot}`}></span>
                              {statusLabel}
                            </span>
                          </td>
                          <td className="px-6 py-4 w-48">
                            <div className="flex flex-col gap-1">
                              <div className="flex justify-between text-[10px] font-bold text-slate-500">
                                <span>{pct}% nýtt</span>
                                <span>{formatIsk(spent)}</span>
                              </div>
                              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className="bg-primary h-full rounded-full transition-all"
                                  style={{ width: `${pct}%` }}
                                ></div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right font-semibold text-slate-900">
                            {(c as any).stats
                              ? (c as any).stats.impressions.toLocaleString('is-IS')
                              : '0'}
                          </td>
                          <td className="px-6 py-4 text-right font-semibold text-slate-900">
                            {(c as any).stats
                              ? (c as any).stats.clicks.toLocaleString('is-IS')
                              : '0'}
                          </td>
                          <td className="px-6 py-4 text-right font-semibold text-slate-900">
                            {(c as any).stats
                              ? `${(c as any).stats.ctr.toFixed(1).replace('.', ',')}%`
                              : '0,0%'}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button className="p-1 text-slate-400 hover:text-primary rounded-full transition-all cursor-pointer bg-transparent border-none">
                              <span className="material-symbols-outlined text-[18px]">
                                more_vert
                              </span>
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

        {/* Right Column - Sidebar Widgets */}
        <div className="lg:col-span-1 space-y-gutter lg:sticky lg:top-6">
          {/* AI Smart Tips Card */}
          <div className="bg-slate-900 text-white rounded-xl p-6 relative overflow-hidden border border-slate-800 shadow-xl">
            <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-primary/20 rounded-full blur-2xl"></div>
            <div className="relative z-10 space-y-4">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-primary/20 text-sky-400 rounded-lg">
                  <span className="material-symbols-outlined text-lg animate-pulse">
                    auto_awesome
                  </span>
                </div>
                <h3 className="text-sm font-bold tracking-tight text-white">Snjallráðgjafi</h3>
              </div>
              <p className="text-[11px] text-slate-400 font-semibold leading-relaxed">
                Ábendingar frá gervigreindinni byggðar á árangri og stöðu þinni:
              </p>
              <ul className="space-y-3">
                {aiTips.map((tip, i) => (
                  <li
                    key={i}
                    className="text-xs text-slate-200 leading-relaxed flex items-start gap-2 bg-slate-800/40 p-2.5 rounded-lg border border-slate-800/50"
                  >
                    <span className="material-symbols-outlined text-[16px] text-yellow-400 shrink-0 mt-0.5">
                      lightbulb
                    </span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
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
