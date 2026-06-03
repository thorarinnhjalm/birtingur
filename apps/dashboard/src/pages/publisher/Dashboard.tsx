import { Routes, Route, useNavigate, Navigate } from 'react-router-dom';
import { LayoutGrid, Grid3x3, Banknote, CheckCircle, Settings as SettingsIcon, AlertTriangle } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Card } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Badge } from '@/components/ui/Badge';
import { usePublisher, usePublisherSlots } from '@/hooks/usePublisher';
import { formatIsk } from '@/lib/format';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { ResponsiveContainer, AreaChart, Area, Tooltip as RechartsTooltip } from 'recharts';


import SlotCreate from './SlotCreate';
import SlotList from './SlotList';
import SlotDetail from './SlotDetail';
import Earnings from './Earnings';
import ApprovalQueue from './ApprovalQueue';
import Settings from './Settings';
import PublisherOnboarding from './Onboarding';

interface StatsResponse {
  impressions: number;
  clicks: number;
  spendIsk: number;
  history: {
    date: string;
    impressions: number;
    clicks: number;
    spendIsk: number;
  }[];
}

function PublisherHome() {
  const { data: publisher, isLoading: isPubLoading } = usePublisher();
  const { data: slots, isLoading: isSlotsLoading } = usePublisherSlots();
  const { data: stats } = useQuery<StatsResponse>({
    queryKey: ['publisher', 'stats'],
    queryFn: () => apiFetch<StatsResponse>('/v1/publishers/me/stats?timeframe=30'),
    enabled: !!publisher,
  });
  const navigate = useNavigate();

  if (isPubLoading || isSlotsLoading) return <LoadingState />;

  if (!publisher) {
    return <Navigate to="/publisher/onboarding" replace />;
  }

  const hasMissingPayoutDetails = !publisher.payoutMethod ||
    !publisher.payoutMethod.iban ||
    !publisher.payoutMethod.kennitala ||
    !publisher.payoutMethod.accountName;

  const hasEarnings = stats && stats.spendIsk > 0;
  const showNudgeBanner = hasMissingPayoutDetails && hasEarnings;

  return (
    <div className="space-y-gutter">
      {/* Header & Top CTA */}
      <div className="flex justify-between items-end mb-6">
        <div>
          <h2 className="text-display-lg text-primary font-bold mb-2">Góðan dag, Kristinn</h2>
          <p className="text-secondary font-body-lg">Hér er yfirlit yfir árangur og tekjur í dag.</p>
        </div>
        <button
          onClick={() => navigate('/publisher/slots/new')}
          className="bg-primary text-on-primary px-8 py-4 rounded-lg font-bold flex items-center gap-3 hover:shadow-lg transition-all active:scale-95 cursor-pointer border-none"
        >
          <span className="material-symbols-outlined">add_circle</span>
          <span>Nýtt auglýsingapláss</span>
        </button>
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
                Þú átt áætlaðar uppsafnaðar tekjur upp á <strong className="text-slate-900 font-bold">{formatIsk(stats.spendIsk)}</strong> en vantar enn reikningsupplýsingar til að geta fengið greitt. Vinsamlegast skráðu bankareikninginn þinn í stillingum.
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
      <div className="grid grid-cols-12 gap-gutter mb-gutter">
        {/* Main Earnings Card */}
        <div className="col-span-12 lg:col-span-8 bg-surface-container-lowest border border-outline-variant p-8 rounded-xl relative overflow-hidden flex flex-col justify-between min-h-[320px] shadow-[0px_4px_12px_rgba(0,0,0,0.03)] animate-fade-in">
          <div className="z-10">
            <p className="text-secondary font-medium mb-2 flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">account_balance_wallet</span>
              Áætlaðar tekjur í þessum mánuði
            </p>
            <h3 className="font-bold text-[64px] text-primary tracking-tighter leading-none my-4">
              {stats ? formatIsk(stats.spendIsk) : '0 kr.'}
            </h3>
            <div className="mt-4 flex items-center gap-2 text-primary bg-secondary-fixed w-fit px-3 py-1 rounded-full text-label-sm font-semibold">
              <span className="material-symbols-outlined text-[16px]">trending_up</span>
              +12.4% frá síðasta mánuði
            </div>
          </div>
          {/* Interactive Recharts Graph */}
          <div className="absolute bottom-0 left-0 right-0 h-32 opacity-90 z-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={stats?.history || []}
                margin={{ top: 10, right: 0, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="earningsGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563eb" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#2563eb" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="spendIsk"
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
                          formattedDate = parsed.toLocaleDateString('is-IS', { day: '2-digit', month: 'short' });
                        }
                      } catch {}
                      return (
                        <div className="bg-slate-950/95 backdrop-blur text-white px-3.5 py-2 rounded-xl text-xs font-semibold shadow-xl border border-slate-800">
                          <p className="text-slate-400 font-medium mb-0.5">{formattedDate}</p>
                          <p className="text-sm font-bold text-sky-400">{formatIsk(val)}</p>
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
        <div className="col-span-12 lg:col-span-4 bg-tertiary text-on-tertiary p-8 rounded-xl flex flex-col justify-between shadow-xl min-h-[320px]">
          <div>
            <div className="w-12 h-12 bg-on-tertiary/10 rounded-lg flex items-center justify-center mb-6">
              <span className="material-symbols-outlined text-on-tertiary">schedule_send</span>
            </div>
            <p className="text-on-tertiary/70 font-medium mb-1">Næsta útgreiðsla</p>
            <h4 className="font-bold text-headline-lg">
              {stats ? formatIsk(Math.round(stats.spendIsk * 0.8)) : '0 kr.'}
            </h4>
            <p className="text-on-tertiary/50 text-[12px] mt-2">Áætlað 1. næsta mánaðar</p>
          </div>
          <button
            onClick={() => navigate('/publisher/earnings')}
            className="w-full py-3 border border-on-tertiary/20 rounded-lg font-semibold hover:bg-on-tertiary/10 transition-colors mt-6 cursor-pointer bg-transparent text-white"
          >
            Skoða færslur
          </button>
        </div>
      </div>

      {/* Quick Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter mb-gutter">
        <div className="bg-surface-container-lowest border border-outline-variant p-6 rounded-xl flex items-center gap-5 shadow-sm">
          <div className="w-14 h-14 bg-primary/5 text-primary rounded-full flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined">visibility</span>
          </div>
          <div>
            <p className="text-secondary font-semibold text-label-sm uppercase tracking-wider">Birtingar</p>
            <p className="font-bold text-headline-md text-on-surface">
              {stats ? (stats.impressions >= 1000000 ? `${(stats.impressions / 1000000).toFixed(1)}M` : stats.impressions.toLocaleString('is-IS')) : '0'}
            </p>
          </div>
        </div>
        <div className="bg-surface-container-lowest border border-outline-variant p-6 rounded-xl flex items-center gap-5 shadow-sm">
          <div className="w-14 h-14 bg-green-50 text-green-700 rounded-full flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined">check_circle</span>
          </div>
          <div>
            <p className="text-secondary font-semibold text-label-sm uppercase tracking-wider">Fyllingarhlutfall</p>
            <p className="font-bold text-headline-md text-on-surface">94%</p>
          </div>
        </div>
        <div className="bg-surface-container-lowest border border-outline-variant p-6 rounded-xl flex items-center gap-5 shadow-sm">
          <div className="w-14 h-14 bg-purple-50 text-purple-700 rounded-full flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined">monetization_on</span>
          </div>
          <div>
            <p className="text-secondary font-semibold text-label-sm uppercase tracking-wider">eCPM</p>
            <p className="font-bold text-headline-md text-on-surface">
              {stats && stats.impressions > 0 ? formatIsk(Math.round((stats.spendIsk / stats.impressions) * 1000)) : '280 kr.'}
            </p>
          </div>
        </div>
      </div>

      {/* Ad Slots Table */}
      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden shadow-sm">
        <div className="px-8 py-6 border-b border-outline-variant flex justify-between items-center">
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
              icon={<span className="material-symbols-outlined text-4xl text-outline">grid_view</span>}
              title="Engin auglýsingapláss"
              description="Búðu til þitt fyrsta pláss, fáðu HTML kóðann og settu hann á vefinn þinn til að byrja að græða."
              action={
                <Button onClick={() => navigate('/publisher/slots/new')}>Stofna auglýsingapláss</Button>
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-surface-container-low border-b border-outline-variant">
                <tr>
                  <th className="px-8 py-4 font-semibold text-label-sm text-secondary uppercase tracking-wider">Heiti pláss</th>
                  <th className="px-8 py-4 font-semibold text-label-sm text-secondary uppercase tracking-wider">Stærð</th>
                  <th className="px-8 py-4 font-semibold text-label-sm text-secondary uppercase tracking-wider">Staða</th>
                  <th className="px-8 py-4 font-semibold text-label-sm text-secondary uppercase tracking-wider">Árangur</th>
                  <th className="px-8 py-4 font-semibold text-label-sm text-secondary uppercase tracking-wider text-right">Tekjur</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {slots.map((s) => (
                  <tr
                    key={s.id}
                    className="hover:bg-surface-container transition-colors group cursor-pointer"
                    onClick={() => navigate(`/publisher/slots/${s.id}`)}
                  >
                    <td className="px-8 py-5">
                      <div className="flex flex-col">
                        <span className="font-body-md font-bold text-on-surface">{s.name}</span>
                        <span className="text-[12px] text-outline font-medium">mbl.is/forsida</span>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <span className="bg-surface-container text-secondary px-3 py-1 rounded-md text-label-sm font-semibold">
                        {s.sizes.map((sz) => `${sz.width}x${sz.height}`).join(', ')}
                      </span>
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 bg-green-500 rounded-full"></span>
                        <span className="text-body-md font-medium">Virk</span>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex items-end gap-1 h-6 w-24">
                        <div className="w-2 bg-primary/20 group-hover:bg-primary transition-all h-3"></div>
                        <div className="w-2 bg-primary/20 group-hover:bg-primary transition-all h-5"></div>
                        <div className="w-2 bg-primary/20 group-hover:bg-primary transition-all h-4"></div>
                        <div className="w-2 bg-primary/20 group-hover:bg-primary transition-all h-6"></div>
                        <div className="w-2 bg-primary/20 group-hover:bg-primary transition-all h-4"></div>
                      </div>
                    </td>
                    <td className="px-8 py-5 text-right font-bold text-body-md text-primary">
                      {formatIsk(s.pricing.mode === 'cpm' ? s.pricing.cpmIsk : s.pricing.slotPriceIsk)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="px-8 py-4 bg-surface-container-low flex justify-center border-t border-outline-variant">
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
  { to: '/publisher/approvals', label: 'Samþykktir', icon: 'check_circle' },
];

export default function PublisherDashboard() {
  const { data: publisher, isLoading } = usePublisher();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-8">
        <div className="max-w-md w-full">
          <LoadingState />
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="onboarding" element={<PublisherOnboarding />} />
      <Route
        path="*"
        element={
          !publisher ? (
            <Navigate to="/publisher/onboarding" replace />
          ) : (
            <AppShell items={sidebarItems} title="ADA Útgefandi">
              <Routes>
                <Route path="/" element={<PublisherHome />} />
                <Route path="slots" element={<SlotList />} />
                <Route path="slots/new" element={<SlotCreate />} />
                <Route path="slots/:id" element={<SlotDetail />} />
                <Route path="earnings" element={<Earnings />} />
                <Route path="approvals" element={<ApprovalQueue />} />
                <Route path="settings" element={<Settings />} />
              </Routes>
            </AppShell>
          )
        }
      />
    </Routes>
  );
}
