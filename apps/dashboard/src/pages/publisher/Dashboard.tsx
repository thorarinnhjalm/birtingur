import React, { useEffect } from 'react';
import { Routes, Route, useNavigate, Navigate } from 'react-router-dom';
import { DEFAULT_PLATFORM_FEE_PERCENT } from '@ada/shared';
import { AlertTriangle } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { usePublishers, usePublisherSlots } from '@/hooks/usePublisher';
import { formatIsk } from '@/lib/format';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { ResponsiveContainer, AreaChart, Area, Tooltip as RechartsTooltip } from 'recharts';
import { Card } from '@/components/ui/Card';
import { AnalyticsChart } from '@/components/charts/AnalyticsChart';

import SlotCreate from './SlotCreate';
import SlotList from './SlotList';
import SlotDetail from './SlotDetail';
import Earnings from './Earnings';
import Settings from './Settings';
import PublisherOnboarding from './Onboarding';

interface StatsResponse {
  impressions: number;
  clicks: number;
  spendIsk: number;
  pageviews: number;
  history: {
    date: string;
    impressions: number;
    clicks: number;
    spendIsk: number;
    pageviews: number;
  }[];
}

function PublisherHome() {
  const [timeframe, setTimeframe] = React.useState<7 | 30>(30);
  const { data: publishers, isLoading: isPubsLoading } = usePublishers();
  const { data: slots, isLoading: isSlotsLoading } = usePublisherSlots(
    !!publishers && publishers.length > 0,
  );
  const { data: stats } = useQuery<StatsResponse>({
    queryKey: ['publisher', 'stats', timeframe],
    queryFn: () => apiFetch<StatsResponse>(`/v1/publishers/stats?timeframe=${timeframe}`),
    enabled: !!publishers && publishers.length > 0,
  });
  const navigate = useNavigate();

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

  return (
    <div className="space-y-gutter">
      {/* Header & Top CTA */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Góðan dag, {firstPublisher?.displayName?.split(' ')[0] || 'útgefandi'}
          </h2>
          <div className="flex items-center gap-4 mt-1">
            <p className="text-slate-500 text-sm font-medium">
              Hér er yfirlit yfir árangur og tekjur í dag.
            </p>
            <div className="inline-flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
              <button
                type="button"
                onClick={() => setTimeframe(7)}
                className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-all cursor-pointer ${
                  timeframe === 7
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                7 dagar
              </button>
              <button
                type="button"
                onClick={() => setTimeframe(30)}
                className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-all cursor-pointer ${
                  timeframe === 30
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                30 dagar
              </button>
            </div>
          </div>
        </div>
        <div className="flex gap-3">
          <Button
            variant="secondary"
            onClick={() => navigate('/publisher/onboarding')}
            className="flex items-center gap-2 font-bold py-2 px-3 text-xs border border-slate-200"
          >
            <span className="material-symbols-outlined text-[18px]">add_to_photos</span>
            <span>Nýr vefur</span>
          </Button>
          <Button
            onClick={() => navigate('/publisher/slots/new')}
            className="flex items-center gap-2 font-bold py-2 px-4 text-xs shadow-md shadow-primary/10"
          >
            <span className="material-symbols-outlined text-[18px]">add_circle</span>
            <span>Nýtt pláss</span>
          </Button>
        </div>
      </div>

      {showNudgeBanner && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-amber-100 text-amber-800 rounded-xl shrink-0">
              <AlertTriangle size={24} />
            </div>
            <div>
              <h4 className="font-bold text-slate-900 text-base">Bankaupplýsingar vantar</h4>
              <p className="text-slate-600 text-sm mt-1 font-medium">
                Þú átt áætlaðar uppsafnaðar tekjur upp á{' '}
                <strong className="text-slate-900 font-bold">
                  {formatIsk(Math.round(stats.spendIsk * (1 - DEFAULT_PLATFORM_FEE_PERCENT / 100)))}
                </strong>{' '}
                en vantar enn reikningsupplýsingar til að geta fengið greitt. Vinsamlegast skráðu
                bankareikninginn þinn í stillingum.
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate('/publisher/settings')}
            className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm px-6 py-3 rounded-lg transition-all shrink-0 active:scale-95 shadow-sm hover:shadow border-none cursor-pointer"
          >
            Skrá bankaupplýsingar
          </button>
        </div>
      )}

      {/* Hero Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter mb-gutter items-stretch">
        {/* Main Earnings Card */}
        <div className="md:col-span-2 bg-white border border-outline-variant p-6 md:p-8 rounded-xl relative overflow-hidden flex flex-col justify-between min-h-[260px] shadow-[0px_4px_12px_rgba(0,0,0,0.03)] animate-fade-in">
          <div className="z-10">
            <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">account_balance_wallet</span>
              Áætlaðar tekjur í þessum mánuði
            </p>
            <h3 className="font-black text-3xl sm:text-4xl md:text-5xl text-primary tracking-tight my-4">
              {stats
                ? formatIsk(Math.round(stats.spendIsk * (1 - DEFAULT_PLATFORM_FEE_PERCENT / 100)))
                : '0 kr.'}
            </h3>
            {(() => {
              if (!stats?.history || stats.history.length < 2) return null;
              const half = Math.floor(stats.history.length / 2);
              const recent = stats.history.slice(half).reduce((s, h) => s + h.spendIsk, 0);
              const older = stats.history.slice(0, half).reduce((s, h) => s + h.spendIsk, 0);
              if (older === 0) return null;
              const pct = ((recent - older) / older) * 100;
              return (
                <div
                  className={`mt-2 flex items-center gap-1.5 ${pct >= 0 ? 'text-green-600 bg-green-55' : 'text-red-600 bg-red-55'} w-fit px-2.5 py-0.5 rounded-full text-xs font-bold`}
                >
                  <span className="material-symbols-outlined text-[14px]">
                    {pct >= 0 ? 'trending_up' : 'trending_down'}
                  </span>
                  {pct >= 0 ? '+' : ''}
                  {pct.toFixed(0)}%
                </div>
              );
            })()}
          </div>
          {/* Interactive Recharts Graph */}
          <div className="absolute bottom-0 left-0 right-0 h-24 opacity-80 z-0">
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
                  dataKey={(h: any) =>
                    Math.round(h.spendIsk * (1 - DEFAULT_PLATFORM_FEE_PERCENT / 100))
                  }
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
                      } catch {}
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

        {/* Payout Card */}
        <div className="md:col-span-1 bg-tertiary text-on-tertiary p-6 md:p-8 rounded-xl flex flex-col justify-between shadow-xl min-h-[260px]">
          <div>
            <div className="w-10 h-10 bg-on-tertiary/10 rounded-lg flex items-center justify-center mb-4 text-white">
              <span className="material-symbols-outlined text-white text-xl">schedule_send</span>
            </div>
            <p className="text-white/70 font-semibold text-xs mb-1 uppercase tracking-wider">
              Næsta útgreiðsla
            </p>
            <h4 className="font-black text-2xl sm:text-3xl text-white tracking-tight">
              {stats
                ? formatIsk(Math.round(stats.spendIsk * (1 - DEFAULT_PLATFORM_FEE_PERCENT / 100)))
                : '0 kr.'}
            </h4>
            <p className="text-white/50 text-[10px] font-medium mt-1">Áætlað 1. næsta mánaðar</p>
          </div>
          <Button
            onClick={() => navigate('/publisher/earnings')}
            className="w-full py-2 bg-white/10 text-white font-bold text-xs hover:bg-white/20 transition-colors mt-4 shrink-0 rounded-lg"
          >
            Skoða færslur
          </Button>
        </div>
      </div>

      {/* Quick Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-gutter">
        <div className="bg-white border border-outline-variant p-4 hover:border-primary transition-all group rounded-xl shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 bg-sky-50 text-sky-600 rounded-lg group-hover:bg-primary group-hover:text-white transition-colors">
              <span className="material-symbols-outlined text-[20px]">public</span>
            </div>
          </div>
          <p className="text-slate-400 font-bold text-[10px] uppercase tracking-wider">Vefumferð</p>
          <p className="font-bold text-lg text-slate-900 mt-0.5">
            {stats
              ? stats.pageviews >= 1000000
                ? `${(stats.pageviews / 1000000).toFixed(1)}M`
                : stats.pageviews.toLocaleString('is-IS')
              : '0'}
          </p>
        </div>
        <div className="bg-white border border-outline-variant p-4 hover:border-primary transition-all group rounded-xl shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg group-hover:bg-primary group-hover:text-white transition-colors">
              <span className="material-symbols-outlined text-[20px]">visibility</span>
            </div>
          </div>
          <p className="text-slate-400 font-bold text-[10px] uppercase tracking-wider">Birtingar</p>
          <p className="font-bold text-lg text-slate-900 mt-0.5">
            {stats
              ? stats.impressions >= 1000000
                ? `${(stats.impressions / 1000000).toFixed(1)}M`
                : stats.impressions.toLocaleString('is-IS')
              : '0'}
          </p>
        </div>
        <div className="bg-white border border-outline-variant p-4 hover:border-primary transition-all group rounded-xl shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 bg-amber-50 text-amber-600 rounded-lg group-hover:bg-primary group-hover:text-white transition-colors">
              <span className="material-symbols-outlined text-[20px]">ads_click</span>
            </div>
          </div>
          <p className="text-slate-400 font-bold text-[10px] uppercase tracking-wider">Smellir</p>
          <p className="font-bold text-lg text-slate-900 mt-0.5">
            {stats
              ? stats.clicks >= 1000000
                ? `${(stats.clicks / 1000000).toFixed(1)}M`
                : stats.clicks.toLocaleString('is-IS')
              : '0'}
          </p>
        </div>
        <div className="bg-white border border-outline-variant p-4 hover:border-primary transition-all group rounded-xl shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 bg-rose-50 text-rose-600 rounded-lg group-hover:bg-primary group-hover:text-white transition-colors">
              <span className="material-symbols-outlined text-[20px]">touch_app</span>
            </div>
          </div>
          <p className="text-slate-400 font-bold text-[10px] uppercase tracking-wider">
            Smellihlutfall (CTR)
          </p>
          <p className="font-bold text-lg text-slate-900 mt-0.5">
            {stats && stats.impressions > 0
              ? `${Math.min(100, (stats.clicks / stats.impressions) * 100)
                  .toFixed(2)
                  .replace('.', ',')}%`
              : '0,00%'}
          </p>
        </div>
        <div className="bg-white border border-outline-variant p-4 hover:border-primary transition-all group rounded-xl shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg group-hover:bg-primary group-hover:text-white transition-colors">
              <span className="material-symbols-outlined text-[20px]">check_circle</span>
            </div>
          </div>
          <p className="text-slate-400 font-bold text-[10px] uppercase tracking-wider">
            Fyllihlutfall
          </p>
          <p className="font-bold text-lg text-slate-900 mt-0.5">
            {stats && stats.pageviews > 0
              ? `${Math.round((stats.impressions / stats.pageviews) * 100)}%`
              : '0%'}
          </p>
        </div>
        <div className="bg-white border border-outline-variant p-4 hover:border-primary transition-all group rounded-xl shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 bg-purple-50 text-purple-600 rounded-lg group-hover:bg-primary group-hover:text-white transition-colors">
              <span className="material-symbols-outlined text-[20px]">monetization_on</span>
            </div>
          </div>
          <p className="text-slate-400 font-bold text-[10px] uppercase tracking-wider">eCPM</p>
          <p className="font-bold text-lg text-slate-900 mt-0.5">
            {stats && stats.impressions > 0
              ? formatIsk(
                  Math.round(
                    ((stats.spendIsk * (1 - DEFAULT_PLATFORM_FEE_PERCENT / 100)) /
                      stats.impressions) *
                      1000,
                  ),
                )
              : '0 kr.'}
          </p>
        </div>
      </div>

      {/* Performance Graph Card */}
      {stats && stats.history && stats.history.length > 0 && (
        <Card className="bg-white border border-outline-variant p-6 rounded-xl shadow-[0px_4px_12px_rgba(0,0,0,0.03)] animate-fade-in">
          <div className="mb-4">
            <h3 className="text-base font-bold text-slate-800">Árangursferill auglýsingaplássa</h3>
            <p className="text-xs text-slate-400 font-semibold mt-0.5">
              Birtingar, smellir og tekjur yfir síðustu {timeframe} daga
            </p>
          </div>
          <AnalyticsChart data={stats.history} mode="publisher" />
        </Card>
      )}

      {/* Ad Slots Table */}
      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden shadow-sm">
        <div className="px-4 sm:px-6 md:px-8 py-6 border-b border-outline-variant flex justify-between items-center">
          <h3 className="font-bold text-headline-md text-primary">Virkar auglýsingastöður</h3>
          <div className="flex gap-2">
            <button className="p-2 border border-outline-variant rounded-lg hover:bg-surface-container transition-colors cursor-pointer bg-white">
              <span className="material-symbols-outlined text-[20px]">filter_list</span>
            </button>
            <button className="p-2 border border-outline-variant rounded-lg hover:bg-surface-container transition-colors cursor-pointer bg-white">
              <span className="material-symbols-outlined text-[20px]">download</span>
            </button>
          </div>
        </div>

        {!slots || slots.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={
                <span className="material-symbols-outlined text-4xl text-outline">grid_view</span>
              }
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
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-surface-container-low border-b border-outline-variant">
                <tr>
                  <th className="px-4 sm:px-5 py-4 font-semibold text-label-sm text-secondary uppercase tracking-wider">
                    Heiti pláss
                  </th>
                  <th className="px-4 sm:px-5 py-4 font-semibold text-label-sm text-secondary uppercase tracking-wider">
                    Stærð
                  </th>
                  <th className="px-4 sm:px-5 py-4 font-semibold text-label-sm text-secondary uppercase tracking-wider">
                    Staða
                  </th>
                  <th className="px-4 sm:px-5 py-4 font-semibold text-label-sm text-secondary uppercase tracking-wider text-right">
                    Birtingar
                  </th>
                  <th className="px-4 sm:px-5 py-4 font-semibold text-label-sm text-secondary uppercase tracking-wider text-right">
                    Smellir
                  </th>
                  <th className="px-4 sm:px-5 py-4 font-semibold text-label-sm text-secondary uppercase tracking-wider text-right">
                    CTR
                  </th>
                  <th className="px-4 sm:px-5 py-4 font-semibold text-label-sm text-secondary uppercase tracking-wider text-right">
                    Tekjur
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {publishers.map((pub) => {
                  const pubSlots =
                    (slots as any[])?.filter((s: any) => s.publisherId === pub.id) || [];
                  if (pubSlots.length === 0) {
                    return (
                      <tr key={pub.id} className="bg-slate-50/50">
                        <td
                          colSpan={7}
                          className="px-4 sm:px-5 py-4 text-xs font-semibold text-slate-400 font-mono"
                        >
                          🌐 {pub.domain} — Engin auglýsingapláss skráð.
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <React.Fragment key={pub.id}>
                      <tr className="bg-slate-50/80 border-y border-outline-variant select-none">
                        <td
                          colSpan={7}
                          className="px-4 sm:px-5 py-3 text-xs font-extrabold text-slate-800 tracking-wide"
                        >
                          <span className="flex items-center gap-1.5 uppercase font-sans">
                            <span className="material-symbols-outlined text-[16px] text-slate-500">
                              public
                            </span>
                            {pub.displayName} ({pub.domain})
                          </span>
                        </td>
                      </tr>
                      {pubSlots.map((s: any) => (
                        <tr
                          key={s.id}
                          className="hover:bg-surface-container transition-colors group cursor-pointer"
                          onClick={() => navigate(`/publisher/slots/${s.id}`)}
                        >
                          <td className="px-4 sm:px-5 py-4">
                            <div className="flex flex-col min-w-0">
                              <span className="font-body-md font-bold text-on-surface truncate max-w-[200px]">
                                {s.name}
                              </span>
                              <span className="text-[12px] text-outline font-medium truncate max-w-[200px]">
                                {pub.domain}
                                {s.placement?.pageMatcher && s.placement.pageMatcher !== '/*'
                                  ? s.placement.pageMatcher
                                  : ''}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 sm:px-5 py-4">
                            <span className="bg-surface-container text-secondary px-3 py-1 rounded-md text-label-sm font-semibold whitespace-nowrap">
                              {s.sizes.map((sz: any) => `${sz.width}x${sz.height}`).join(', ')}
                            </span>
                          </td>
                          <td className="px-4 sm:px-5 py-4">
                            <div className="flex items-center gap-2">
                              <span
                                className={`w-2.5 h-2.5 rounded-full ${s.status === 'active' ? 'bg-green-500' : 'bg-slate-400'}`}
                              ></span>
                              <span className="text-body-md font-medium">
                                {s.status === 'active' ? 'Virk' : 'Óvirk'}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 sm:px-5 py-4 text-right text-body-md text-on-surface font-semibold">
                            {s.stats ? s.stats.impressions.toLocaleString('is-IS') : '0'}
                          </td>
                          <td className="px-4 sm:px-5 py-4 text-right text-body-md text-on-surface font-semibold text-slate-650">
                            {s.stats ? s.stats.clicks.toLocaleString('is-IS') : '0'}
                          </td>
                          <td className="px-4 sm:px-5 py-4 text-right text-body-md text-on-surface font-semibold text-slate-650">
                            {s.stats && s.stats.impressions > 0
                              ? `${Math.min(100, (s.stats.clicks / s.stats.impressions) * 100)
                                  .toFixed(2)
                                  .replace('.', ',')}%`
                              : '0,00%'}
                          </td>
                          <td className="px-4 sm:px-5 py-4 text-right font-bold text-body-md text-primary">
                            {s.stats
                              ? formatIsk(
                                  Math.round(
                                    s.stats.spendIsk * (1 - DEFAULT_PLATFORM_FEE_PERCENT / 100),
                                  ),
                                )
                              : '0 kr.'}
                            <span className="text-[10px] text-secondary font-medium block">
                              {s.pricing.mode === 'cpm'
                                ? `${formatIsk(s.pricing.cpmIsk)} CPM`
                                : `${formatIsk(s.pricing.slotPriceIsk)} / ${s.pricing.slotPeriodDays}d`}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="px-4 sm:px-5 py-4 bg-surface-container-low flex justify-center border-t border-outline-variant">
          <button
            onClick={() => navigate('/publisher/slots')}
            className="text-primary font-bold text-label-md flex items-center gap-2 hover:underline cursor-pointer border-none bg-transparent"
          >
            Sjá öll auglýsingapláss
            <span className="material-symbols-outlined text-[16px]">chevron_right</span>
          </button>
        </div>
      </div>
    </div>
  );
}

const sidebarItems = [
  { to: '/publisher', label: 'Yfirlit', icon: 'dashboard' },
  { to: '/publisher/slots', label: 'Auglýsingapláss', icon: 'grid_view' },
  { to: '/publisher/earnings', label: 'Tekjur', icon: 'payments' },
];

export default function PublisherDashboard() {
  const { data: publishers, isLoading } = usePublishers();

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
        <Route path="earnings" element={<Earnings />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/publisher" replace />} />
      </Routes>
    </AppShell>
  );
}
