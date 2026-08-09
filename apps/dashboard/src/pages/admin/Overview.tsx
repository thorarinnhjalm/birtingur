import { useState, useMemo } from 'react';
import { Routes, Route, Link, useSearchParams } from 'react-router-dom';
import { Banknote, CheckCircle, XCircle, Calendar, Trash2, Copy, ExternalLink } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Card } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { formatIsk } from '@/lib/format';
import {
  useReviewQueue,
  useReviewCreative,
  usePendingPayouts,
  useMarkPayoutCompleted,
} from '@/hooks/useReviewQueue';
import {
  useAdminPublishers,
  useAdminAdvertisers,
  useAdminSlots,
  useUpdateEntityStatus,
  useGeneratePayouts,
  useAdminDiagnostics,
  useAdminTopUpAdvertiser,
  useAdminCampaigns,
  useAdminCreatives,
  useAdminLedger,
  useDeleteEntity,
  useUpdateCampaignStatus,
  useRefreshCache,
  useAdminWaitlistStats,
} from '@/hooks/useAdmin';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { Publisher, Advertiser } from '@ada/shared';

interface BotTrafficBreakdown {
  human: number;
  known_bot: number;
  suspected_bot: number;
  unclassified: number;
}

interface BotTrafficSummary {
  windowDays: number;
  impressions: BotTrafficBreakdown;
  pageViews: BotTrafficBreakdown;
}

interface AdminStats {
  totalImpressions: number;
  totalClicks: number;
  totalRevenueIsk: number;
  platformFeeIsk: number;
  p95LatencyMs: number;
  systemStatus: string;
  topCreatives: Array<{
    creativeId: string;
    advertiserId: string;
    advertiserName?: string;
    width?: number;
    height?: number;
    imageUrl: string;
    impressions: number;
    clicks: number;
    ctr: number;
  }>;
  fallbackStats: Array<{
    creativeId: string;
    name: string;
    imageUrl: string;
    impressions: number;
    clicks: number;
    ctr: number;
  }>;
  publishersCount?: number;
  advertisersCount?: number;
  slotsCount?: number;
  campaignsCount?: number;
  // Bot-classification measurement summary — see docs/superpowers/sdd/
  // 2026-08-09-bot-classification-phase1. `null` when no publisher-day
  // document in the 7-day window carries `byBotClass` at all (e.g. before
  // the classifier deploy landed) — the card shows an explanation, never
  // zeros, in that case.
  botTraffic?: BotTrafficSummary | null;
}

// Order matters here: rendered top-to-bottom, and `unclassified` deliberately
// sits last and separately labelled — it is pre-classifier-deploy or
// otherwise unclassified traffic, never folded into "Fólk" (human).
const BOT_CLASS_ROWS: Array<{ key: keyof BotTrafficBreakdown; label: string }> = [
  { key: 'human', label: 'Fólk' },
  { key: 'known_bot', label: 'Þekkt vélmenni' },
  { key: 'suspected_bot', label: 'Grunuð vélmenni' },
  { key: 'unclassified', label: 'Óflokkað' },
];

function botBreakdownTotal(b: BotTrafficBreakdown): number {
  return b.human + b.known_bot + b.suspected_bot + b.unclassified;
}

function BotTrafficBreakdownRows({ breakdown }: { breakdown: BotTrafficBreakdown }) {
  const total = botBreakdownTotal(breakdown);
  return (
    <div className="space-y-2">
      {BOT_CLASS_ROWS.map(({ key, label }) => {
        const count = breakdown[key];
        const pct = total > 0 ? (count / total) * 100 : 0;
        return (
          <div key={key} className="flex items-center justify-between text-xs">
            <span
              className={`font-semibold ${key === 'unclassified' ? 'text-slate-400' : 'text-slate-600'}`}
            >
              {label}
            </span>
            <span className="font-bold text-slate-800">
              {pct.toFixed(1).replace('.', ',')}%{' '}
              <span className="font-semibold text-slate-400">
                ({count.toLocaleString('is-IS')})
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

// 1. Admin Home (Overview metrics)
function Home() {
  const { data: stats, isLoading } = useQuery<AdminStats>({
    queryKey: ['admin', 'stats'],
    queryFn: () => apiFetch<AdminStats>('/v1/admin/stats'),
  });
  const { data: diag } = useAdminDiagnostics();
  const {
    data: waitlist,
    isLoading: waitlistLoading,
    isError: waitlistError,
  } = useAdminWaitlistStats();
  // '...' while loading and an explicit error line on failure — a silent 0
  // would be indistinguishable from "no signups yet".
  const wl = (n: number | undefined) =>
    waitlistLoading ? '...' : waitlistError ? '—' : (n ?? 0).toLocaleString('is-IS');

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Stjórnborð Birtings</h1>
        <p className="text-slate-500 text-sm font-medium mt-1">
          Yfirlit yfir heilsu og ástand vettvangsins.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard
          label="Birtingar (allur tími)"
          value={isLoading ? '...' : (stats?.totalImpressions.toLocaleString('is-IS') ?? '0')}
        />
        <StatCard
          label="Velta (allur tími)"
          value={isLoading ? '...' : formatIsk(stats?.totalRevenueIsk ?? 0)}
        />
        <StatCard
          label="Þóknun (allur tími)"
          value={isLoading ? '...' : formatIsk(stats?.platformFeeIsk ?? 0)}
        />
        <StatCard
          label="Svartími (p95)"
          value={isLoading ? '...' : `${stats?.p95LatencyMs ?? 24} ms`}
        />
        <StatCard label="Kerfisheilsa" value={isLoading ? '...' : (stats?.systemStatus ?? 'OK')} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Skráðir útgefendur"
          value={isLoading ? '...' : (stats?.publishersCount ?? 0).toLocaleString('is-IS')}
        />
        <StatCard
          label="Skráðir auglýsendur"
          value={isLoading ? '...' : (stats?.advertisersCount ?? 0).toLocaleString('is-IS')}
        />
        <StatCard
          label="Auglýsingapláss"
          value={isLoading ? '...' : (stats?.slotsCount ?? 0).toLocaleString('is-IS')}
        />
        <StatCard
          label="Skráðar herferðir"
          value={isLoading ? '...' : (stats?.campaignsCount ?? 0).toLocaleString('is-IS')}
        />
      </div>

      <div>
        <h3 className="text-base font-bold text-slate-900 mb-3">Biðlisti enska vefsins (/en)</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Skráningar alls" value={wl(waitlist?.total)} />
          <StatCard label="Auglýsendur" value={wl(waitlist?.roles?.advertisers)} />
          <StatCard label="Útgefendur" value={wl(waitlist?.roles?.publishers)} />
          <StatCard label="Bæði" value={wl(waitlist?.roles?.both)} />
        </div>
        {waitlistError && (
          <p className="mt-2 text-xs font-semibold text-red-600">
            Gat ekki sótt biðlistatölfræði — endurhladdu síðuna eða athugaðu API-ið.
          </p>
        )}
        {waitlist?.categories && Object.keys(waitlist.categories).length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {Object.entries(waitlist.categories)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 8)
              .map(([cat, count]) => (
                <span
                  key={cat}
                  className="rounded-full bg-slate-100 border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600"
                >
                  {cat} · {count}
                </span>
              ))}
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="p-6">
          <h3 className="text-base font-bold text-slate-900 mb-4">Kerfisástand</h3>
          <div className="space-y-3 text-xs font-semibold text-slate-600">
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <span>Firestore Database:</span>
              <span
                className={`font-bold ${diag?.firestore?.status === 'ok' ? 'text-green-600' : diag?.firestore?.status === 'error' ? 'text-red-600' : 'text-slate-400'}`}
              >
                {diag?.firestore?.status === 'ok'
                  ? 'Virk'
                  : diag?.firestore?.status === 'error'
                    ? 'Villa'
                    : 'Athuga...'}
              </span>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <span>Redis skyndiminni:</span>
              <span
                className={`font-bold ${diag?.redis?.status === 'ok' ? 'text-green-600' : diag?.redis?.status === 'error' ? 'text-red-600' : 'text-slate-400'}`}
              >
                {diag?.redis?.status === 'ok'
                  ? 'Tengt'
                  : diag?.redis?.status === 'error'
                    ? 'Ótengt'
                    : 'Athuga...'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Slot Query Engine:</span>
              <span
                className={`font-bold ${diag?.slotsQuery?.status === 'ok' ? 'text-green-600' : diag?.slotsQuery?.status === 'error' ? 'text-red-600' : 'text-slate-400'}`}
              >
                {diag?.slotsQuery?.status === 'ok'
                  ? 'Í lagi'
                  : diag?.slotsQuery?.status === 'error'
                    ? 'Bilun'
                    : 'Athuga...'}
              </span>
            </div>
          </div>
        </Card>

        <Card className="p-6 bg-slate-900 text-white border-none flex flex-col justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-100 mb-1">Hröð yfirferð</h3>
            <p className="text-xs text-slate-400 font-semibold leading-relaxed">
              Yfirferð auglýsinga er mikilvæg til að koma í veg fyrir óviðeigandi efni á vefjum
              útgefenda.
            </p>
          </div>
          <div className="mt-4">
            <Badge variant="pending">Sjálfvirk skönnun virk</Badge>
          </div>
        </Card>
      </div>

      {/* Top 5 creatives */}
      {stats?.topCreatives && stats.topCreatives.length > 0 && (
        <Card className="p-6">
          <h3 className="text-base font-bold text-slate-900 mb-4">Topp 5 auglýsingar (7 dagar)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="pb-2 font-bold text-slate-400 uppercase tracking-wider">#</th>
                  <th className="pb-2 font-bold text-slate-400 uppercase tracking-wider">Borði</th>
                  <th className="pb-2 font-bold text-slate-400 uppercase tracking-wider text-right">
                    Birtingar
                  </th>
                  <th className="pb-2 font-bold text-slate-400 uppercase tracking-wider text-right">
                    Smellir
                  </th>
                  <th className="pb-2 font-bold text-slate-400 uppercase tracking-wider text-right">
                    CTR
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stats.topCreatives.map((tc, i) => (
                  <tr key={tc.creativeId} className="hover:bg-slate-50">
                    <td className="py-3 font-bold text-slate-400">{i + 1}</td>
                    <td className="py-3">
                      <div className="flex items-center gap-3">
                        {tc.imageUrl && (
                          <img
                            src={tc.imageUrl}
                            alt=""
                            className="w-12 h-9 rounded object-cover border border-slate-200 bg-white shadow-sm"
                          />
                        )}
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-800">
                            {tc.advertiserName || 'Óþekktur auglýsandi'}
                          </span>
                          <span className="text-[10px] text-slate-400 font-semibold mt-0.5">
                            {tc.width && tc.height
                              ? `${tc.width} × ${tc.height} px`
                              : tc.creativeId}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 text-right font-bold text-slate-800">
                      {tc.impressions.toLocaleString('is-IS')}
                    </td>
                    <td className="py-3 text-right font-bold text-slate-800">
                      {tc.clicks.toLocaleString('is-IS')}
                    </td>
                    <td className="py-3 text-right font-bold text-slate-800">
                      {tc.ctr.toFixed(1).replace('.', ',')}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Fallback & House Ads Stats */}
      {stats?.fallbackStats && stats.fallbackStats.length > 0 && (
        <Card className="p-6">
          <h3 className="text-base font-bold text-slate-900 mb-4">
            Árangur húsa- og fylliauglýsinga (7 dagar)
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="pb-2 font-bold text-slate-400 uppercase tracking-wider">Heiti</th>
                  <th className="pb-2 font-bold text-slate-400 uppercase tracking-wider font-mono">
                    Creative ID
                  </th>
                  <th className="pb-2 font-bold text-slate-400 uppercase tracking-wider text-right">
                    Sýningar (Pageviews)
                  </th>
                  <th className="pb-2 font-bold text-slate-400 uppercase tracking-wider text-right">
                    Smellir
                  </th>
                  <th className="pb-2 font-bold text-slate-400 uppercase tracking-wider text-right">
                    CTR
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stats.fallbackStats.map((fs) => (
                  <tr key={fs.creativeId} className="hover:bg-slate-50">
                    <td className="py-3 font-semibold text-slate-700">{fs.name}</td>
                    <td className="py-3 font-mono text-[11px] text-slate-500">{fs.creativeId}</td>
                    <td className="py-3 text-right font-bold text-slate-800">
                      {fs.impressions.toLocaleString('is-IS')}
                    </td>
                    <td className="py-3 text-right font-bold text-slate-800">
                      {fs.clicks.toLocaleString('is-IS')}
                    </td>
                    <td className="py-3 text-right font-bold text-slate-800">
                      {fs.ctr.toFixed(2).replace('.', ',')}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Bot-traffic measurement summary — see docs/superpowers/sdd/
          2026-08-09-bot-classification-phase1/task-4-brief.md. Admin-only,
          measurement only: nothing here filters or deducts billed
          impressions, and no other number on this page moves. */}
      {!isLoading && (
        <Card className="p-6">
          <h3 className="text-base font-bold text-slate-900 mb-1">
            Vélmennaflokkun umferðar (síðustu 7 heilu dagar)
          </h3>
          <p className="text-xs text-slate-400 font-semibold mb-4">
            Mæling eingöngu — engum birtingum er sleppt og ekkert er ófrádregið.
          </p>
          {stats?.botTraffic ? (
            <div className="grid sm:grid-cols-2 gap-6">
              <div>
                <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Innheimtanlegar birtingar (CPM)
                </h4>
                <BotTrafficBreakdownRows breakdown={stats.botTraffic.impressions} />
              </div>
              <div>
                <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Vefumferð (síðuskoðanir)
                </h4>
                <BotTrafficBreakdownRows breakdown={stats.botTraffic.pageViews} />
              </div>
            </div>
          ) : (
            <p className="text-xs font-semibold text-slate-500">
              Engin vélmennaflokkun er tiltæk fyrir síðustu 7 daga — annaðhvort söfnuðust gögnin
              áður en flokkunin var tekin í notkun, eða engin umferð hefur mælst enn á tímabilinu.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}

// 2. Review Queue (Pending creative approval)
function AdminReviewQueue() {
  const { data: queue, isLoading, refetch } = useReviewQueue();
  const { data: advertisers } = useAdminAdvertisers();
  const reviewMutation = useReviewCreative();
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const advertiserMap = useMemo(() => {
    const map = new Map<string, { name: string; email: string }>();
    if (advertisers) {
      advertisers.forEach((a) => map.set(a.id, { name: a.companyName, email: a.ownerEmail }));
    }
    return map;
  }, [advertisers]);

  const handleApprove = async (creativeId: string) => {
    setError(null);
    try {
      await reviewMutation.mutateAsync({ creativeId, action: 'approve' });
      refetch();
    } catch (err: any) {
      setError(err.message || 'Ekki tókst að samþykkja.');
    }
  };

  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectId) return;
    setError(null);
    try {
      await reviewMutation.mutateAsync({ creativeId: rejectId, action: 'reject', reason });
      setRejectId(null);
      setReason('');
      refetch();
    } catch (err: any) {
      setError(err.message || 'Ekki tókst að hafna.');
    }
  };

  if (isLoading) return <LoadingState />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Yfirferð auglýsinga (Review Queue)</h1>
        <p className="text-slate-500 text-sm font-medium mt-1">
          Dæmdu auglýsingar sem sjálfvirki skanninn flaggaði eða krefjast handvirkrar skoðunar.
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs font-semibold text-red-600">
          {error}
        </div>
      )}

      {!queue || queue.length === 0 ? (
        <EmptyState
          icon={<CheckCircle size={44} className="text-green-500" />}
          title="Allt hreint!"
          description="Engar auglýsingar í biðröðinni."
        />
      ) : (
        <div className="grid gap-4">
          {queue.map((c) => {
            const advInfo = advertiserMap.get(c.advertiserId);
            const advLabel = advInfo ? `${advInfo.name} (${advInfo.email})` : c.advertiserId;
            return (
              <Card key={c.id} className="p-6 flex flex-col md:flex-row gap-6">
                <div className="w-full md:w-44 shrink-0 bg-slate-100 rounded border border-slate-200 overflow-hidden h-32 flex items-center justify-center">
                  <img src={c.imageUrl} alt="Ad Preview" className="object-contain w-full h-full" />
                </div>
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center gap-3">
                    <h4 className="font-bold text-slate-900 text-sm truncate max-w-[200px]">
                      {c.id}
                    </h4>
                    <Badge variant="pending">Bíður yfirferðar</Badge>
                  </div>
                  <div className="text-xs text-slate-500 font-semibold space-y-1">
                    <p>
                      Auglýsandi: <span className="font-bold text-slate-700">{advLabel}</span>
                    </p>
                    <p>
                      Stærð: {c.width} × {c.height} px
                    </p>
                    <p>
                      Smellt á:{' '}
                      <a
                        href={c.clickUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline font-bold truncate max-w-[250px] inline-block"
                      >
                        {c.clickUrl}
                      </a>
                    </p>
                    {c.autoScanResult && (
                      <div className="mt-2 p-2 bg-slate-50 border border-slate-200 rounded text-[11px] font-semibold text-slate-600">
                        AutoScan: NSFW {Math.round(c.autoScanResult.nsfwScore * 100)}% · Flaggaðir
                        frasar: {c.autoScanResult.blockedTerms.join(', ') || 'engar'}
                      </div>
                    )}
                  </div>
                </div>
                <div className="w-full md:w-36 shrink-0 flex md:flex-col justify-end gap-2">
                  <Button
                    onClick={() => handleApprove(c.id)}
                    loading={reviewMutation.isPending && rejectId !== c.id}
                    className="font-bold text-xs py-2 bg-green-600 hover:bg-green-700 w-full flex items-center justify-center gap-1 border border-transparent"
                  >
                    <CheckCircle size={14} />
                    <span>Samþykkja</span>
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setRejectId(c.id)}
                    className="font-bold text-xs py-2 border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 w-full flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <XCircle size={14} />
                    <span>Hafna</span>
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Reject Modal */}
      {rejectId && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="max-w-md w-full bg-white p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-3">
              Hafna auglýsingu
            </h3>
            <form onSubmit={handleRejectSubmit} className="space-y-4">
              <Input
                label="Ástæða höfnunar *"
                placeholder="Skrifaðu af hverju verið er að hafna (t.d. NSFW efni)..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
              />
              <div className="flex gap-3 justify-end pt-4 border-t border-slate-100">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setRejectId(null);
                    setReason('');
                  }}
                >
                  Hætta við
                </Button>
                <Button type="submit" variant="danger" loading={reviewMutation.isPending}>
                  Staðfesta höfnun
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}

// 3. Payout Queue (Managing publisher bank payouts & generation)
function AdminPayoutQueue() {
  const { data: payouts, isLoading, refetch } = usePendingPayouts();
  const { data: publishers } = useAdminPublishers();
  const markCompleted = useMarkPayoutCompleted();
  const generatePayouts = useGeneratePayouts();

  const [completeId, setCompleteId] = useState<string | null>(null);
  const [bankRef, setBankRef] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Manual generation form states
  const [genStart, setGenStart] = useState('');
  const [genEnd, setGenEnd] = useState('');
  const [genSuccessMsg, setGenSuccessMsg] = useState('');

  const publisherMap = useMemo(() => {
    const map = new Map<string, string>();
    if (publishers) {
      publishers.forEach((p) => map.set(p.id, p.ownerEmail));
    }
    return map;
  }, [publishers]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!completeId) return;
    setError(null);

    if (!bankRef.trim()) {
      setError('Skrá verður bankatilvísun (færslunúmer).');
      return;
    }

    try {
      await markCompleted.mutateAsync({ payoutId: completeId, bankReference: bankRef });
      setCompleteId(null);
      setBankRef('');
      refetch();
    } catch (err: any) {
      setError(err.message || 'Ekki tókst að afgreiða útborgun.');
    }
  };

  const handleGenerateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setGenSuccessMsg('');
    if (!genStart || !genEnd) {
      setError('Velja þarf bæði upphafs- og lokadagsetningu.');
      return;
    }
    try {
      const res = await generatePayouts.mutateAsync({ periodStart: genStart, periodEnd: genEnd });
      setGenSuccessMsg(`Útborganir stofnaðar! Stofnaðar færslur: ${res.created}`);
      refetch();
    } catch (err: any) {
      setError(err.message || 'Ekki tókst að stofna útborganir.');
    }
  };

  if (isLoading) return <LoadingState />;

  const items = payouts || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Útgreiðslur og lágmarksskoðun (Payouts Queue)
          </h1>
          <p className="text-slate-500 text-sm font-medium mt-1">
            Millifærðu handvirkt í banka og merktu útborganir sem kláraðar.
          </p>
        </div>
      </div>

      {/* Manual Generation Form */}
      <Card className="p-6">
        <h3 className="text-base font-bold text-slate-900 mb-2 flex items-center gap-2">
          <Calendar size={18} className="text-primary" />
          <span>Stofna útborganir handvirkt</span>
        </h3>
        <p className="text-xs text-slate-500 font-semibold mb-4 leading-relaxed">
          Safnaðu saman heildartekjum allra útgefenda fyrir tiltekið tímabil og búðu til nýjar
          útborganir (lágmark 10.000 kr.).
        </p>
        <form
          onSubmit={handleGenerateSubmit}
          className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end"
        >
          <Input
            type="date"
            label="Upphafstímabil *"
            value={genStart}
            onChange={(e) => setGenStart(e.target.value)}
            required
          />
          <Input
            type="date"
            label="Lokatímabil *"
            value={genEnd}
            onChange={(e) => setGenEnd(e.target.value)}
            required
          />
          <Button
            type="submit"
            loading={generatePayouts.isPending}
            className="font-bold py-3 text-xs"
          >
            Reikna og stofna
          </Button>
        </form>
        {genSuccessMsg && (
          <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg text-xs font-semibold text-green-700">
            {genSuccessMsg}
          </div>
        )}
      </Card>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs font-semibold text-red-600">
          {error}
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={<CheckCircle size={44} className="text-green-500" />}
          title="Engar pending útborganir!"
          description="Allar útborganir yfir lágmarki (10.000 kr) hafa verið millifærðar."
        />
      ) : (
        <Card className="p-6">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-medium border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 font-semibold uppercase tracking-wider">
                  <th className="py-2.5">Útgefandi</th>
                  <th className="py-2.5">Bankareikningur (IBAN)</th>
                  <th className="py-2.5">Kennitala</th>
                  <th className="py-2.5">Tímabil</th>
                  <th className="py-2.5 text-right">Upphæð</th>
                  <th className="py-2.5 text-right">Aðgerð</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {items.map((p: any) => (
                  <tr key={p.id} className="hover:bg-slate-50/50">
                    <td className="py-3">
                      <div className="font-semibold text-slate-900">{p.publisherName}</div>
                      <div className="text-[10px] text-slate-500 font-medium">
                        {publisherMap.get(p.publisherId) || ''}
                      </div>
                      <div className="text-[9px] text-slate-400 font-mono">{p.publisherId}</div>
                    </td>
                    <td className="py-3 font-mono whitespace-nowrap">
                      {p.iban ? (
                        <span>{p.iban}</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-red-50 border border-red-200 text-red-600 font-bold text-[10px]">
                          Vantar bankareikning
                        </span>
                      )}
                    </td>
                    <td className="py-3 font-mono">
                      {p.kennitala ? (
                        <span>{p.kennitala}</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-red-50 border border-red-200 text-red-600 font-bold text-[10px]">
                          Vantar kennitölu
                        </span>
                      )}
                    </td>
                    <td className="py-3 font-semibold text-slate-600">
                      {new Date(p.periodStart).toLocaleDateString('is-IS', {
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="py-3 text-right">
                      <div className="font-bold text-slate-900">
                        {formatIsk(p.disburseIsk ?? p.netIsk ?? 0)}
                      </div>
                      {(p.carriedForwardIsk ?? 0) > 0 && (
                        <div className="text-[10px] text-slate-500 font-medium">
                          Þessi mánuður: {formatIsk(p.currentPeriodIsk ?? 0)} · Eldri uppsöfnun:{' '}
                          {formatIsk(p.carriedForwardIsk)}
                        </div>
                      )}
                    </td>
                    <td className="py-3 text-right">
                      <Button
                        onClick={() => setCompleteId(p.id)}
                        className="text-[10px] font-bold py-1.5 px-3 flex items-center gap-1 ml-auto border border-transparent"
                      >
                        <Banknote size={12} />
                        <span>Klára greiðslu</span>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Complete Payout Modal */}
      {completeId && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="max-w-md w-full bg-white p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-3">
              Staðfesta útborgun
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                Sláðu inn bankatilvísun eða millifærslunúmer eftir að þú hefur framkvæmt greiðsluna
                í netbankanum þínum.
              </p>
              <Input
                label="Bankatilvísun (Færslunúmer) *"
                placeholder="Dæmi: S-120409"
                value={bankRef}
                onChange={(e) => setBankRef(e.target.value)}
                required
              />
              <div className="flex gap-3 justify-end pt-4 border-t border-slate-100">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setCompleteId(null);
                    setBankRef('');
                  }}
                >
                  Hætta við
                </Button>
                <Button type="submit" loading={markCompleted.isPending}>
                  Vista og klára
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}

// 4. Publishers List
function AdminPublishersList() {
  const { data: publishers, isLoading, refetch } = useAdminPublishers();
  const { data: slots } = useAdminSlots();
  const updateStatus = useUpdateEntityStatus();
  const deleteMutation = useDeleteEntity();
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteName, setDeleteName] = useState('');

  const handleToggleStatus = async (publisherId: string, currentStatus: string) => {
    setError(null);
    const newStatus = currentStatus === 'active' ? 'suspended' : 'active';
    try {
      await updateStatus.mutateAsync({ type: 'publisher', id: publisherId, status: newStatus });
      refetch();
    } catch (err: any) {
      setError(err.message || 'Ekki tókst að uppfæra stöðu.');
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setError(null);
    try {
      await deleteMutation.mutateAsync({ type: 'publisher', id: deleteId });
      setDeleteId(null);
      setDeleteName('');
      refetch();
    } catch (err: any) {
      setError(err.message || 'Ekki tókst að eyða útgefanda.');
    }
  };

  if (isLoading) return <LoadingState />;

  const items = publishers || [];

  const filtered = items.filter(
    (p) =>
      (p.displayName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.domain || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.ownerEmail || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.id || '').toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Útgefendur (Publishers)</h1>
          <p className="text-slate-500 text-sm font-medium mt-1">
            Skoðaðu útgefendur og frystu reikninga þeirra ef á þarf að halda.
          </p>
        </div>
      </div>

      <div className="w-full max-w-md">
        <Input
          placeholder="Leita eftir nafni, léni, netfangi eða ID..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs font-semibold text-red-600">
          {error}
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          title={searchTerm ? 'Engir útgefendur fundust' : 'Engir útgefendur skráðir'}
          description={
            searchTerm ? 'Prófaðu annað leitarorð.' : 'Engir útgefendur finnast í kerfinu.'
          }
        />
      ) : (
        <Card className="p-6">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-medium border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 font-semibold uppercase tracking-wider">
                  <th className="py-2.5">Útgefandi</th>
                  <th className="py-2.5">Lén</th>
                  <th className="py-2.5">Netfang eiganda</th>
                  <th className="py-2.5">Pláss</th>
                  <th className="py-2.5">Staða</th>
                  <th className="py-2.5">Stofnað</th>
                  <th className="py-2.5 text-right">Aðgerðir</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filtered.map((p) => {
                  const pubSlotsCount = slots?.filter((s) => s.publisherId === p.id).length ?? 0;
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/50">
                      <td className="py-3">
                        <div className="font-semibold text-slate-900">{p.displayName}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{p.id}</div>
                      </td>
                      <td className="py-3 font-semibold text-slate-600">{p.domain}</td>
                      <td className="py-3 text-slate-500 font-semibold">{p.ownerEmail}</td>
                      <td className="py-3">
                        <Link
                          to={`/admin/slots?publisherId=${p.id}`}
                          className="inline-flex items-center gap-1 font-bold text-primary hover:underline bg-primary/5 px-2.5 py-1 rounded-full border border-primary/10 hover:bg-primary/10 transition-colors"
                        >
                          {pubSlotsCount} pláss
                        </Link>
                      </td>
                      <td className="py-3">
                        <Badge variant={p.status === 'active' ? 'success' : 'danger'}>
                          {p.status === 'active' ? 'Virkur' : 'Frystur'}
                        </Badge>
                      </td>
                      <td className="py-3 text-slate-500 font-semibold">
                        {new Date(p.createdAt).toLocaleDateString('is-IS')}
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant={p.status === 'active' ? 'secondary' : 'primary'}
                            onClick={() => handleToggleStatus(p.id, p.status)}
                            loading={updateStatus.isPending}
                            className="text-[10px] font-bold py-1.5 px-3 border border-slate-200"
                          >
                            {p.status === 'active' ? 'Frysta' : 'Virkja'}
                          </Button>
                          <Button
                            variant="danger"
                            onClick={() => {
                              setDeleteId(p.id);
                              setDeleteName(p.displayName);
                            }}
                            className="text-[10px] font-bold py-1.5 px-3 flex items-center gap-1"
                          >
                            <Trash2 size={12} />
                            <span>Eyða</span>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Delete Confirmation Modal */}
      {deleteId && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="max-w-md w-full bg-white p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold border-b border-slate-100 pb-3 flex items-center gap-2 text-red-600">
              <Trash2 size={20} />
              <span>Eyða útgefanda</span>
            </h3>
            <p className="text-xs text-slate-500 font-semibold leading-relaxed">
              Ertu viss um að þú viljir eyða útgefandanum{' '}
              <span className="font-bold text-slate-900">{deleteName}</span>?<br />
              <span className="text-red-600 font-bold block mt-2">ATHUGAÐU:</span> Þessi aðgerð mun
              eyða öllum auglýsingaplássum (slots) og útgreiðslum sem tengjast þessum útgefanda.
              Þessu er ekki hægt að snúa við.
            </p>
            <div className="flex gap-3 justify-end pt-4 border-t border-slate-100">
              <Button
                variant="ghost"
                onClick={() => {
                  setDeleteId(null);
                  setDeleteName('');
                }}
              >
                Hætta við
              </Button>
              <Button
                variant="danger"
                onClick={handleDelete}
                loading={deleteMutation.isPending}
                className="font-bold text-xs"
              >
                Staðfesta eyðingu
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

// 5. Advertisers List
function AdminAdvertisersList() {
  const { data: advertisers, isLoading, refetch } = useAdminAdvertisers();
  const updateStatus = useUpdateEntityStatus();
  const deleteMutation = useDeleteEntity();
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteName, setDeleteName] = useState('');

  const [topUpAdvertiser, setTopUpAdvertiser] = useState<{ id: string; name: string } | null>(null);
  const [amountStr, setAmountStr] = useState('');
  const topUpMutation = useAdminTopUpAdvertiser();
  const [topUpError, setTopUpError] = useState<string | null>(null);

  const handleTopUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topUpAdvertiser) return;
    setTopUpError(null);
    const amount = parseInt(amountStr, 10);
    if (isNaN(amount) || amount <= 0) {
      setTopUpError('Upphæð verður að vera jákvæð tala.');
      return;
    }
    try {
      await topUpMutation.mutateAsync({ advertiserId: topUpAdvertiser.id, amountIsk: amount });
      setTopUpAdvertiser(null);
      setAmountStr('');
      refetch();
    } catch (err: any) {
      setTopUpError(err.message || 'Ekki tókst að bæta við inneign.');
    }
  };

  const handleToggleStatus = async (advertiserId: string, currentStatus: string) => {
    setError(null);
    const newStatus = currentStatus === 'active' ? 'suspended' : 'active';
    try {
      await updateStatus.mutateAsync({ type: 'advertiser', id: advertiserId, status: newStatus });
      refetch();
    } catch (err: any) {
      setError(err.message || 'Ekki tókst að uppfæra stöðu.');
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setError(null);
    try {
      await deleteMutation.mutateAsync({ type: 'advertiser', id: deleteId });
      setDeleteId(null);
      setDeleteName('');
      refetch();
    } catch (err: any) {
      setError(err.message || 'Ekki tókst að eyða auglýsanda.');
    }
  };

  if (isLoading) return <LoadingState />;

  const items = advertisers || [];

  const filtered = items.filter(
    (a) =>
      (a.companyName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (a.ownerEmail || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (a.kennitala || '').includes(searchTerm) ||
      (a.id || '').toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Auglýsendur (Advertisers)</h1>
          <p className="text-slate-500 text-sm font-medium mt-1">
            Skoðaðu auglýsendur og stöðu veskja þeirra. Frystu þá ef þeir brjóta skilmála.
          </p>
        </div>
      </div>

      <div className="w-full max-w-md">
        <Input
          placeholder="Leita eftir heiti, netfangi, kennitölu eða ID..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs font-semibold text-red-600">
          {error}
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          title={searchTerm ? 'Engir auglýsendur fundust' : 'Engir auglýsendur skráðir'}
          description={
            searchTerm ? 'Prófaðu annað leitarorð.' : 'Engir auglýsendur finnast í kerfinu.'
          }
        />
      ) : (
        <Card className="p-6">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-medium border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 font-semibold uppercase tracking-wider">
                  <th className="py-2.5">Fyrirtæki</th>
                  <th className="py-2.5">Kennitala</th>
                  <th className="py-2.5">Netfang eiganda</th>
                  <th className="py-2.5 text-right">Inneign (Veski)</th>
                  <th className="py-2.5">Staða</th>
                  <th className="py-2.5 text-right">Aðgerðir</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filtered.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50/50">
                    <td className="py-3">
                      <div className="font-semibold text-slate-900">{a.companyName}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{a.id}</div>
                    </td>
                    <td className="py-3 font-semibold text-slate-600">{a.kennitala}</td>
                    <td className="py-3 text-slate-500 font-semibold">{a.ownerEmail}</td>
                    <td className="py-3 text-right font-bold text-slate-900">
                      {formatIsk(a.walletBalanceIsk || 0)}
                    </td>
                    <td className="py-3">
                      <Badge variant={a.status === 'active' ? 'success' : 'danger'}>
                        {a.status === 'active' ? 'Virkur' : 'Frystur'}
                      </Badge>
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="secondary"
                          onClick={() => setTopUpAdvertiser({ id: a.id, name: a.companyName })}
                          className="text-[10px] font-bold py-1.5 px-3 border border-slate-200 hover:bg-slate-50 cursor-pointer"
                        >
                          Bæta við inneign
                        </Button>
                        <Button
                          variant={a.status === 'active' ? 'secondary' : 'primary'}
                          onClick={() => handleToggleStatus(a.id, a.status)}
                          loading={updateStatus.isPending}
                          className="text-[10px] font-bold py-1.5 px-3 border border-slate-200"
                        >
                          {a.status === 'active' ? 'Frysta' : 'Virkja'}
                        </Button>
                        <Button
                          variant="danger"
                          onClick={() => {
                            setDeleteId(a.id);
                            setDeleteName(a.companyName);
                          }}
                          className="text-[10px] font-bold py-1.5 px-3 flex items-center gap-1"
                        >
                          <Trash2 size={12} />
                          <span>Eyða</span>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Delete Confirmation Modal */}
      {deleteId && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="max-w-md w-full bg-white p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold border-b border-slate-100 pb-3 flex items-center gap-2 text-red-600">
              <Trash2 size={20} />
              <span>Eyða auglýsanda</span>
            </h3>
            <p className="text-xs text-slate-500 font-semibold leading-relaxed">
              Ertu viss um að þú viljir eyða auglýsandanum{' '}
              <span className="font-bold text-slate-900">{deleteName}</span>?<br />
              <span className="text-red-600 font-bold block mt-2">ATHUGAÐU:</span> Þessi aðgerð mun
              eyða öllum herferðum (campaigns), auglýsingaefni (creatives) og færslusögu (ledger)
              sem tengjast þessum auglýsanda. Þessu er ekki hægt að snúa við.
            </p>
            <div className="flex gap-3 justify-end pt-4 border-t border-slate-100">
              <Button
                variant="ghost"
                onClick={() => {
                  setDeleteId(null);
                  setDeleteName('');
                }}
              >
                Hætta við
              </Button>
              <Button
                variant="danger"
                onClick={handleDelete}
                loading={deleteMutation.isPending}
                className="font-bold text-xs"
              >
                Staðfesta eyðingu
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Top-up Modal */}
      {topUpAdvertiser && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="max-w-md w-full bg-white p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-3">
              Bæta við inneign
            </h3>
            <div className="text-xs text-slate-600 font-semibold mb-2">
              Auglýsandi: <span className="text-slate-900 font-bold">{topUpAdvertiser.name}</span>
            </div>
            <form onSubmit={handleTopUpSubmit} className="space-y-4">
              <Input
                type="number"
                label="Upphæð (kr.) *"
                placeholder="Dæmi: 50000"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                required
                min={1}
              />
              {topUpError && (
                <div className="text-xs font-semibold text-red-600 bg-red-50 p-2 rounded border border-red-200">
                  {topUpError}
                </div>
              )}
              <div className="flex gap-3 justify-end pt-4 border-t border-slate-100">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setTopUpAdvertiser(null);
                    setAmountStr('');
                    setTopUpError(null);
                  }}
                >
                  Hætta við
                </Button>
                <Button type="submit" loading={topUpMutation.isPending}>
                  Staðfesta inneign
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}

// 6. Slots List
function AdminSlotsList() {
  const { data: slots, isLoading: isSlotsLoading, refetch } = useAdminSlots();
  const { data: publishers, isLoading: isPublishersLoading } = useAdminPublishers();
  const updateStatus = useUpdateEntityStatus();
  const deleteMutation = useDeleteEntity();
  const [error, setError] = useState<string | null>(null);

  const [searchParams, setSearchParams] = useSearchParams();
  const publisherIdFilter = searchParams.get('publisherId');

  const [searchTerm, setSearchTerm] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteName, setDeleteName] = useState('');

  // Embed Modal states
  const [embedSlot, setEmbedSlot] = useState<any | null>(null);
  const [embedSize, setEmbedSize] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  const handleToggleStatus = async (slotId: string, currentStatus: string) => {
    setError(null);
    const newStatus = currentStatus === 'active' ? 'paused' : 'active';
    try {
      await updateStatus.mutateAsync({ type: 'slot', id: slotId, status: newStatus });
      refetch();
    } catch (err: any) {
      setError(err.message || 'Ekki tókst að breyta stöðu.');
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setError(null);
    try {
      await deleteMutation.mutateAsync({ type: 'slot', id: deleteId });
      setDeleteId(null);
      setDeleteName('');
      refetch();
    } catch (err: any) {
      setError(err.message || 'Ekki tókst að eyða plássi.');
    }
  };

  const publisherMap = useMemo(() => {
    const map = new Map<string, any>();
    if (publishers) {
      publishers.forEach((p) => map.set(p.id, p));
    }
    return map;
  }, [publishers]);

  if (isSlotsLoading || isPublishersLoading) return <LoadingState />;

  const items = slots || [];

  let filtered = items;
  if (publisherIdFilter) {
    filtered = filtered.filter((s) => s.publisherId === publisherIdFilter);
  }
  if (searchTerm) {
    filtered = filtered.filter(
      (s) =>
        (s.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.publisherId || '').toLowerCase().includes(searchTerm.toLowerCase()),
    );
  }

  const generatedCode = embedSlot
    ? `<div data-adplatform-slot="${embedSlot.id}"${embedSize ? ` data-adplatform-width="${embedSize.width}" data-adplatform-height="${embedSize.height}"` : ''}></div>\n<script async src="https://cdn.birtingur.app/widget.js"></script>`
    : '';

  const handleCopyCode = () => {
    navigator.clipboard.writeText(generatedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Auglýsingapláss (Slots)</h1>
          <p className="text-slate-500 text-sm font-medium mt-1">
            Skoðaðu og frystu auglýsingapláss útgefenda á kerfisvísu ef þörf krefur.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 items-center justify-between">
        <div className="w-full max-w-md">
          <Input
            placeholder="Leita eftir plássheiti, ID eða publisher ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        {publisherIdFilter && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 border border-primary/20 rounded-xl text-xs font-bold text-primary">
            <span>
              Sía: {publisherMap.get(publisherIdFilter)?.displayName || publisherIdFilter}
            </span>
            <button
              onClick={() => {
                const params = new URLSearchParams(searchParams);
                params.delete('publisherId');
                setSearchParams(params);
              }}
              className="text-red-500 hover:text-red-700 font-extrabold cursor-pointer ml-1"
            >
              Hreinsa
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs font-semibold text-red-600">
          {error}
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          title={searchTerm || publisherIdFilter ? 'Engin pláss fundust' : 'Engin pláss skráð'}
          description={
            searchTerm || publisherIdFilter
              ? 'Prófaðu að breyta leitarskilyrðum.'
              : 'Engin auglýsingapláss finnast í kerfinu.'
          }
        />
      ) : (
        <Card className="p-6">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-medium border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 font-semibold uppercase tracking-wider">
                  <th className="py-2.5">Pláss / Heiti</th>
                  <th className="py-2.5">Útgefandi</th>
                  <th className="py-2.5">Stærðir</th>
                  <th className="py-2.5">Verðlagning</th>
                  <th className="py-2.5">Staða</th>
                  <th className="py-2.5 text-right">Aðgerðir</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filtered.map((s) => {
                  const pub = publisherMap.get(s.publisherId);
                  return (
                    <tr key={s.id} className="hover:bg-slate-50/50">
                      <td className="py-3">
                        <div className="font-semibold text-slate-900">{s.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{s.id}</div>
                      </td>
                      <td className="py-3">
                        {pub ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="font-semibold text-slate-900">{pub.displayName}</span>
                            <span className="text-[10px] text-slate-500 font-medium">
                              {pub.domain}
                            </span>
                            <span className="text-[9px] text-slate-400 font-medium">
                              {pub.ownerEmail}
                            </span>
                            <span className="text-[8px] text-slate-400 font-mono">
                              {s.publisherId}
                            </span>
                          </div>
                        ) : (
                          <span className="font-mono text-slate-400">{s.publisherId}</span>
                        )}
                      </td>
                      <td className="py-3 text-slate-600 font-semibold">
                        {s.sizes.map((sz) => `${sz.width}x${sz.height}`).join(', ')} px
                      </td>
                      <td className="py-3 text-slate-600 font-semibold">
                        {s.pricing.mode === 'cpm'
                          ? `${formatIsk(s.pricing.cpmIsk)} CPM`
                          : `${formatIsk(s.pricing.slotPriceIsk)} á ${s.pricing.slotPeriodDays} daga`}
                      </td>
                      <td className="py-3">
                        <Badge variant={s.status === 'active' ? 'success' : 'pending'}>
                          {s.status === 'active' ? 'Virkt' : 'Fryst/Pásað'}
                        </Badge>
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="secondary"
                            onClick={() => {
                              setEmbedSlot(s);
                              setEmbedSize(s.sizes[0] || null);
                            }}
                            className="text-[10px] font-bold py-1.5 px-3 border border-slate-200 hover:bg-slate-50 cursor-pointer"
                          >
                            Kóði
                          </Button>
                          <Button
                            variant={s.status === 'active' ? 'secondary' : 'primary'}
                            onClick={() => handleToggleStatus(s.id, s.status)}
                            loading={updateStatus.isPending}
                            className="text-[10px] font-bold py-1.5 px-3 border border-slate-200"
                          >
                            {s.status === 'active' ? 'Frysta' : 'Virkja'}
                          </Button>
                          <Button
                            variant="danger"
                            onClick={() => {
                              setDeleteId(s.id);
                              setDeleteName(s.name);
                            }}
                            className="text-[10px] font-bold py-1.5 px-3 flex items-center gap-1"
                          >
                            <Trash2 size={12} />
                            <span>Eyða</span>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Delete Confirmation Modal */}
      {deleteId && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="max-w-md w-full bg-white p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold border-b border-slate-100 pb-3 flex items-center gap-2 text-red-600">
              <Trash2 size={20} />
              <span>Eyða auglýsingaplássi</span>
            </h3>
            <p className="text-xs text-slate-500 font-semibold leading-relaxed">
              Ertu viss um að þú viljir eyða auglýsingaplássinu{' '}
              <span className="font-bold text-slate-900">{deleteName}</span>?<br />
              Þessari aðgerð er ekki hægt að snúa við.
            </p>
            <div className="flex gap-3 justify-end pt-4 border-t border-slate-100">
              <Button
                variant="ghost"
                onClick={() => {
                  setDeleteId(null);
                  setDeleteName('');
                }}
              >
                Hætta við
              </Button>
              <Button
                variant="danger"
                onClick={handleDelete}
                loading={deleteMutation.isPending}
                className="font-bold text-xs"
              >
                Staðfesta eyðingu
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Embed Code Modal */}
      {embedSlot && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="max-w-xl w-full bg-white p-6 space-y-4 shadow-2xl text-slate-800">
            <h3 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
              <Copy size={20} className="text-primary" />
              <span>Innsetningarkóði pláss</span>
            </h3>
            <div className="space-y-4">
              <div>
                <p className="text-xs text-slate-500 font-semibold mb-2">
                  Veldu stærð (Valfrjálst, ef tómt þá teygist plássið):
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setEmbedSize(null)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-bold cursor-pointer transition-colors ${!embedSize ? 'bg-primary text-white border-primary' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
                  >
                    Teygjanlegt (Flexible)
                  </button>
                  {embedSlot.sizes.map((sz: any) => {
                    const isSelected =
                      embedSize && embedSize.width === sz.width && embedSize.height === sz.height;
                    return (
                      <button
                        key={`${sz.width}x${sz.height}`}
                        onClick={() => setEmbedSize(sz)}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-bold cursor-pointer transition-colors ${isSelected ? 'bg-primary text-white border-primary' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
                      >
                        {sz.width} × {sz.height} px
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="text-xs text-slate-500 font-semibold mb-2">
                  Afritaðu þennan HTML kóða og settu hann þar sem auglýsingin á að birtast:
                </p>
                <pre className="p-4 bg-slate-900 text-slate-200 rounded-xl text-[11px] font-mono whitespace-pre-wrap overflow-x-auto select-all leading-relaxed border border-slate-800">
                  {generatedCode}
                </pre>
              </div>
            </div>
            <div className="flex gap-3 justify-end pt-4 border-t border-slate-100">
              <Button
                variant="ghost"
                onClick={() => {
                  setEmbedSlot(null);
                  setEmbedSize(null);
                  setCopied(false);
                }}
              >
                Loka
              </Button>
              <Button onClick={handleCopyCode} className="font-bold text-xs">
                {copied ? 'Afritað!' : 'Afrita kóða'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

// 6. Admin Support Messages
interface SupportMessage {
  id: string;
  senderEmail: string;
  senderName?: string;
  role: 'advertiser' | 'publisher' | 'unknown';
  subject: string;
  body: string;
  status: 'unread' | 'read' | 'resolved';
  createdAt: string;
}

function AdminSupportMessages() {
  const {
    data: messages,
    isLoading,
    refetch,
  } = useQuery<SupportMessage[]>({
    queryKey: ['admin-support-messages'],
    queryFn: () => apiFetch<SupportMessage[]>('/v1/support/messages'),
  });

  const { data: publishers } = useAdminPublishers();
  const { data: advertisers } = useAdminAdvertisers();

  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleStatusChange = async (id: string, status: 'read' | 'resolved') => {
    await apiFetch(`/v1/support/messages/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    refetch();
  };

  const senderMap = useMemo(() => {
    const map = new Map<string, { label: string; company: string }>();
    if (publishers) {
      publishers.forEach((p) => {
        if (p.ownerEmail) {
          map.set(p.ownerEmail.toLowerCase(), { label: 'Útgefandi', company: p.displayName || '' });
        }
      });
    }
    if (advertisers) {
      advertisers.forEach((a) => {
        if (a.ownerEmail) {
          map.set(a.ownerEmail.toLowerCase(), {
            label: 'Auglýsandi',
            company: a.companyName || '',
          });
        }
      });
    }
    return map;
  }, [publishers, advertisers]);

  if (isLoading) return <LoadingState />;

  const unread = messages?.filter((m) => m.status === 'unread') || [];
  const rest = messages?.filter((m) => m.status !== 'unread') || [];
  const sorted = [...unread, ...rest];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Skilaboð frá notendum</h2>
          <p className="text-sm text-slate-500 font-medium mt-0.5">
            {unread.length > 0 ? `${unread.length} ólesin skilaboð` : 'Engin ólesin skilaboð'}
          </p>
        </div>
        <Badge variant={unread.length > 0 ? 'pending' : 'success'}>{unread.length} ólesin</Badge>
      </div>

      {sorted.length === 0 ? (
        <EmptyState
          icon="mail"
          title="Engin skilaboð"
          description="Engin skilaboð hafa borist enn."
        />
      ) : (
        <div className="space-y-3">
          {sorted.map((msg) => {
            const isExpanded = expandedId === msg.id;
            const senderInfo = msg.senderEmail
              ? senderMap.get(msg.senderEmail.toLowerCase())
              : null;
            const senderLabel = senderInfo ? `${senderInfo.company} (${senderInfo.label})` : null;

            const roleLabel =
              msg.role === 'advertiser'
                ? 'Auglýsandi'
                : msg.role === 'publisher'
                  ? 'Útgefandi'
                  : 'Óþekkt';
            const dateStr = new Date(msg.createdAt).toLocaleDateString('is-IS', {
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            });

            return (
              <Card
                key={msg.id}
                className={`p-4 transition-all cursor-pointer ${
                  msg.status === 'unread'
                    ? 'border-l-4 border-l-amber-400 bg-amber-50/30'
                    : msg.status === 'resolved'
                      ? 'opacity-60'
                      : ''
                }`}
                onClick={() => {
                  setExpandedId(isExpanded ? null : msg.id);
                  if (msg.status === 'unread') {
                    handleStatusChange(msg.id, 'read');
                  }
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-sm text-slate-900 truncate">
                        {msg.subject}
                      </span>
                      <Badge
                        variant={
                          msg.status === 'unread'
                            ? 'pending'
                            : msg.status === 'resolved'
                              ? 'success'
                              : 'neutral'
                        }
                      >
                        {msg.status === 'unread'
                          ? 'Ólesið'
                          : msg.status === 'read'
                            ? 'Lesið'
                            : 'Leyst'}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-500 font-medium">
                      {msg.senderEmail} {senderLabel ? `· ${senderLabel}` : `· ${roleLabel}`} ·{' '}
                      {dateStr}
                    </p>
                  </div>
                  <span className="material-symbols-outlined text-slate-400 text-lg">
                    {isExpanded ? 'expand_less' : 'expand_more'}
                  </span>
                </div>

                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-slate-100">
                    <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                      {msg.body}
                    </p>
                    <div className="mt-4 flex gap-2">
                      {msg.status !== 'resolved' && (
                        <Button
                          className="text-sm py-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStatusChange(msg.id, 'resolved');
                          }}
                        >
                          <CheckCircle size={14} className="mr-1.5" />
                          Merkja leyst
                        </Button>
                      )}
                      {msg.status === 'resolved' && (
                        <Button
                          className="text-sm py-2"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStatusChange(msg.id, 'read');
                          }}
                        >
                          Opna aftur
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// 6a. Admin Campaigns List
function AdminCampaignsList() {
  const { data: campaigns, isLoading, refetch } = useAdminCampaigns();
  const { data: advertisers } = useAdminAdvertisers();
  const updateStatus = useUpdateCampaignStatus();
  const deleteMutation = useDeleteEntity();
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteName, setDeleteName] = useState('');

  const advertiserMap = useMemo(() => {
    const map = new Map<string, Advertiser>();
    if (advertisers) {
      advertisers.forEach((a) => map.set(a.id, a));
    }
    return map;
  }, [advertisers]);

  const handleToggleStatus = async (campaignId: string, currentStatus: string) => {
    setError(null);
    const newStatus = currentStatus === 'active' ? 'paused' : 'active';
    try {
      await updateStatus.mutateAsync({ campaignId, status: newStatus });
      refetch();
    } catch (err: any) {
      setError(err.message || 'Ekki tókst að uppfæra stöðu herferðar.');
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setError(null);
    try {
      await deleteMutation.mutateAsync({ type: 'campaign', id: deleteId });
      setDeleteId(null);
      setDeleteName('');
      refetch();
    } catch (err: any) {
      setError(err.message || 'Ekki tókst að eyða herferð.');
    }
  };

  if (isLoading) return <LoadingState />;

  const items = campaigns || [];

  const filtered = items.filter((c) => {
    const adv = advertiserMap.get(c.advertiserId);
    const advName = adv?.companyName || '';
    const advEmail = adv?.ownerEmail || '';
    return (
      (c.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      advName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      advEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.status || '').toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Herferðir (Campaigns)</h1>
          <p className="text-slate-500 text-sm font-medium mt-1">
            Umsjón með öllum auglýsingaherferðum í kerfinu, stöðva/ræsa og eyða.
          </p>
        </div>
      </div>

      <div className="w-full max-w-md">
        <Input
          placeholder="Leita eftir heiti herferðar, ID, auglýsanda..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs font-semibold text-red-600">
          {error}
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          title={searchTerm ? 'Engar herferðir fundust' : 'Engar herferðir skráðar'}
          description={
            searchTerm ? 'Prófaðu annað leitarorð.' : 'Engar herferðir finnast í kerfinu.'
          }
        />
      ) : (
        <Card className="p-6">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-medium border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 font-semibold uppercase tracking-wider">
                  <th className="py-2.5">Herferð</th>
                  <th className="py-2.5">Auglýsandi</th>
                  <th className="py-2.5">Fjárhagsáætlun</th>
                  <th className="py-2.5">Miðun (Targeting)</th>
                  <th className="py-2.5">Tímaplan</th>
                  <th className="py-2.5">Staða</th>
                  <th className="py-2.5 text-right">Aðgerðir</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filtered.map((c) => {
                  const adv = advertiserMap.get(c.advertiserId);
                  const advLabel = adv ? `${adv.companyName} (${adv.ownerEmail})` : c.advertiserId;

                  const spent = c.budget.totalIsk - c.budget.remainingIsk;
                  const budgetStr = `Eftir: ${formatIsk(c.budget.remainingIsk)} / Heildar: ${formatIsk(c.budget.totalIsk)}`;

                  let statusVariant: 'success' | 'pending' | 'danger' | 'info' = 'pending';
                  let statusLabel = 'Óþekkt';
                  if (c.status === 'active') {
                    statusVariant = 'success';
                    statusLabel = 'Virk';
                  } else if (c.status === 'paused') {
                    statusVariant = 'pending';
                    statusLabel = 'Í bið';
                  } else if (c.status === 'completed') {
                    statusVariant = 'success';
                    statusLabel = 'Lokið';
                  } else if (c.status === 'pending_approval') {
                    statusVariant = 'pending';
                    statusLabel = 'Bíður samþykkis';
                  } else if (c.status === 'draft') {
                    statusVariant = 'pending';
                    statusLabel = 'Uppkast';
                  }

                  const startStr = new Date(c.schedule.startsAt).toLocaleDateString('is-IS');
                  const endStr = new Date(c.schedule.endsAt).toLocaleDateString('is-IS');

                  return (
                    <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 font-semibold text-slate-900">
                        <div>
                          <div>{c.name || 'Nafnlaus herferð'}</div>
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">{c.id}</div>
                        </div>
                      </td>
                      <td className="py-3 font-semibold text-slate-700">{advLabel}</td>
                      <td className="py-3">
                        <div className="space-y-0.5">
                          <div className="font-bold text-slate-950">{formatIsk(spent)} notað</div>
                          <div className="text-[10px] text-slate-400 font-medium">{budgetStr}</div>
                        </div>
                      </td>
                      <td className="py-3">
                        <div className="space-y-1">
                          <div className="flex flex-wrap gap-1">
                            {c.targeting.categories.map((cat) => (
                              <span
                                key={cat}
                                className="px-1.5 py-0.5 rounded bg-slate-100 text-[10px] text-slate-600 font-medium border border-slate-200"
                              >
                                {cat}
                              </span>
                            ))}
                          </div>
                          {c.targeting.geoRegions && c.targeting.geoRegions.length > 0 && (
                            <div className="text-[10px] text-slate-400 font-medium">
                              Svæði: {c.targeting.geoRegions.join(', ')}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="py-3 font-semibold text-slate-500">
                        {startStr} – {endStr}
                      </td>
                      <td className="py-3">
                        <Badge variant={statusVariant}>{statusLabel}</Badge>
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex justify-end gap-2">
                          {(c.status === 'active' || c.status === 'paused') && (
                            <Button
                              variant={c.status === 'active' ? 'secondary' : 'primary'}
                              onClick={() => handleToggleStatus(c.id, c.status)}
                              loading={updateStatus.isPending}
                              className="text-[10px] font-bold py-1.5 px-3 border border-slate-200"
                            >
                              {c.status === 'active' ? 'Stöðva' : 'Ræsa'}
                            </Button>
                          )}
                          <Button
                            variant="danger"
                            onClick={() => {
                              setDeleteId(c.id);
                              setDeleteName(c.name || c.id);
                            }}
                            className="text-[10px] font-bold py-1.5 px-3 flex items-center gap-1"
                          >
                            <Trash2 size={12} />
                            <span>Eyða</span>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Cascade Delete Confirmation Modal */}
      {deleteId && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="max-w-md w-full bg-white p-6 space-y-4 shadow-2xl text-slate-800">
            <h3 className="text-lg font-bold border-b border-slate-100 pb-3 flex items-center gap-2 text-red-600">
              <Trash2 size={20} />
              <span>Eyða herferð</span>
            </h3>
            <div className="text-xs font-semibold leading-relaxed space-y-2 text-slate-500">
              <p>
                Ertu viss um að þú viljir eyða herferðinni{' '}
                <span className="font-bold text-slate-900">{deleteName}</span>?
              </p>
              <div className="p-3 bg-red-50 border border-red-100 rounded-lg text-red-700 space-y-1">
                <p className="font-bold">⚠️ Afleiðingar (Cascade Effect):</p>
                <ul className="list-disc list-inside pl-1 space-y-0.5 text-[11px] font-medium">
                  <li>Herferð verður varanlega eytt úr gagnagrunni.</li>
                  <li>Fjarlægir remaining budget og pacing upplýsingar úr Redis skyndiminni.</li>
                  <li>Þessari aðgerð er ekki hægt að snúa við.</li>
                </ul>
              </div>
            </div>
            <div className="flex gap-3 justify-end pt-4 border-t border-slate-100">
              <Button
                variant="ghost"
                onClick={() => {
                  setDeleteId(null);
                  setDeleteName('');
                }}
              >
                Hætta við
              </Button>
              <Button
                variant="danger"
                onClick={handleDelete}
                loading={deleteMutation.isPending}
                className="font-bold text-xs"
              >
                Staðfesta eyðingu
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

// 6b. Admin Creatives List
function AdminCreativesList() {
  const { data: creatives, isLoading, refetch } = useAdminCreatives();
  const { data: advertisers } = useAdminAdvertisers();
  const deleteMutation = useDeleteEntity();
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const advertiserMap = useMemo(() => {
    const map = new Map<string, Advertiser>();
    if (advertisers) {
      advertisers.forEach((a) => map.set(a.id, a));
    }
    return map;
  }, [advertisers]);

  const handleDelete = async () => {
    if (!deleteId) return;
    setError(null);
    try {
      await deleteMutation.mutateAsync({ type: 'creative', id: deleteId });
      setDeleteId(null);
      refetch();
    } catch (err: any) {
      setError(
        err.message ||
          'Ekki tókst að eyða auglýsingu. Hugsanlega er hún í notkun af virkri herferð.',
      );
    }
  };

  if (isLoading) return <LoadingState />;

  const items = creatives || [];

  const filtered = items.filter((c) => {
    const adv = advertiserMap.get(c.advertiserId);
    const advName = adv?.companyName || '';
    const advEmail = adv?.ownerEmail || '';
    return (
      (c.id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.clickUrl || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.ocrTextHint || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      advName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      advEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.reviewStatus || '').toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Auglýsingar (Creatives)</h1>
          <p className="text-slate-500 text-sm font-medium mt-1">
            Skoðaðu allar auglýsingar (creatives) í kerfinu, sjálfvirka skönnun og yfirferðarstöðu.
          </p>
        </div>
      </div>

      <div className="w-full max-w-md">
        <Input
          placeholder="Leita eftir ID, url, texta, auglýsanda..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs font-semibold text-red-600">
          {error}
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          title={searchTerm ? 'Engar auglýsingar fundust' : 'Engar auglýsingar skráðar'}
          description={
            searchTerm ? 'Prófaðu annað leitarorð.' : 'Engar auglýsingar finnast í kerfinu.'
          }
        />
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((c) => {
            const adv = advertiserMap.get(c.advertiserId);
            const advLabel = adv ? `${adv.companyName} (${adv.ownerEmail})` : c.advertiserId;

            let reviewVariant: 'success' | 'pending' | 'danger' | 'info' = 'pending';
            let reviewLabel = 'Í bið';
            if (c.reviewStatus === 'auto_approved') {
              reviewVariant = 'success';
              reviewLabel = 'Sjálfvirkt samþykkt';
            } else if (c.reviewStatus === 'manual_approved') {
              reviewVariant = 'success';
              reviewLabel = 'Handvirkt samþykkt';
            } else if (c.reviewStatus === 'rejected') {
              reviewVariant = 'danger';
              reviewLabel = 'Hafnað';
            }

            const scan = c.autoScanResult;

            return (
              <Card
                key={c.id}
                className="p-5 flex flex-col justify-between space-y-4 overflow-hidden border border-slate-100 shadow-sm hover:shadow-md transition-shadow bg-white text-slate-800"
              >
                <div className="space-y-3">
                  {/* Preview of Image */}
                  <div className="relative aspect-video w-full bg-slate-50 border border-slate-100 rounded-lg overflow-hidden flex items-center justify-center group">
                    <img
                      src={c.imageUrl}
                      alt="Auglýsing"
                      className="max-h-full max-w-full object-contain transition-transform group-hover:scale-105"
                    />
                    <div className="absolute top-2 left-2">
                      <Badge variant={reviewVariant}>{reviewLabel}</Badge>
                    </div>
                    <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-slate-900/75 backdrop-blur-sm text-[10px] text-white font-mono font-bold">
                      {c.width} × {c.height} px
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] text-slate-400 font-mono">ID: {c.id}</div>
                    <div className="text-xs font-bold text-slate-800 mt-1 truncate">{advLabel}</div>
                    <a
                      href={c.clickUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] font-semibold text-primary hover:underline flex items-center gap-1 mt-1 truncate"
                    >
                      <span>{c.clickUrl}</span>
                      <ExternalLink size={10} />
                    </a>
                  </div>

                  {c.ocrTextHint && (
                    <div className="p-2 rounded bg-slate-50 border border-slate-100 text-[10px] font-semibold text-slate-600 leading-normal italic">
                      Lestur úr mynd: "{c.ocrTextHint}"
                    </div>
                  )}

                  {/* AutoScan NSFW & Blocked terms analysis */}
                  {scan ? (
                    <div className="p-3 bg-slate-50/60 border border-slate-100 rounded-lg space-y-2 text-[10px] font-semibold text-slate-600">
                      <div className="flex justify-between items-center">
                        <span>Gervigreindarskönnun:</span>
                        <span
                          className={`font-bold uppercase px-1.5 py-0.5 rounded text-[9px] ${scan.nsfwScore > 0.3 ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-green-50 text-green-600 border border-green-200'}`}
                        >
                          NSFW: {Math.round(scan.nsfwScore * 100)}%
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-slate-500">
                        <span>Flokkur:</span>
                        <span className="font-bold text-slate-800">
                          {scan.category} ({Math.round(scan.confidence * 100)}%)
                        </span>
                      </div>
                      {scan.blockedTerms && scan.blockedTerms.length > 0 && (
                        <div className="space-y-1">
                          <div>Fundust bönnuð orð:</div>
                          <div className="flex flex-wrap gap-1">
                            {scan.blockedTerms.map((term) => (
                              <span
                                key={term}
                                className="px-1.5 py-0.5 rounded bg-red-50 text-red-600 border border-red-200 font-bold"
                              >
                                {term}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {scan.sensitiveCategories && scan.sensitiveCategories.length > 0 && (
                        <div className="space-y-1 pt-1 border-t border-slate-100">
                          <div>Viðkvæmir flokkar:</div>
                          <div className="flex flex-wrap gap-1">
                            {scan.sensitiveCategories.map((cat) => (
                              <span
                                key={cat}
                                className="px-1.5 py-0.5 rounded bg-yellow-50 text-yellow-700 border border-yellow-200 font-bold"
                              >
                                {cat}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-3 bg-yellow-50/30 border border-yellow-100 rounded-lg text-[10px] font-semibold text-yellow-600 text-center">
                      Engin sjálfvirk skönnun til staðar.
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-slate-100 flex justify-end">
                  <Button
                    variant="danger"
                    onClick={() => setDeleteId(c.id)}
                    className="text-[10px] font-bold py-1.5 px-3 flex items-center gap-1 w-full justify-center"
                  >
                    <Trash2 size={12} />
                    <span>Eyða auglýsingu</span>
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteId && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="max-w-md w-full bg-white p-6 space-y-4 shadow-2xl text-slate-800">
            <h3 className="text-lg font-bold border-b border-slate-100 pb-3 flex items-center gap-2 text-red-600">
              <Trash2 size={20} />
              <span>Eyða auglýsingu</span>
            </h3>
            <div className="text-xs font-semibold leading-relaxed space-y-2 text-slate-500">
              <p>
                Ertu viss um að þú viljir eyða auglýsingunni með ID{' '}
                <span className="font-bold text-slate-900">{deleteId}</span>?
              </p>
              <div className="p-3 bg-red-50 border border-red-100 rounded-lg text-red-700 space-y-1">
                <p className="font-bold">⚠️ Athugið:</p>
                <ul className="list-disc list-inside pl-1 space-y-0.5 text-[11px] font-medium">
                  <li>Auglýsingunni verður varanlega eytt úr kerfinu.</li>
                  <li>
                    Þessari aðgerð verður aðeins leyft ef hún er ekki í notkun í virkri eða í
                    biðstöðu herferð.
                  </li>
                  <li>Þessari aðgerð er ekki hægt að snúa við.</li>
                </ul>
              </div>
            </div>
            <div className="flex gap-3 justify-end pt-4 border-t border-slate-100">
              <Button variant="ghost" onClick={() => setDeleteId(null)}>
                Hætta við
              </Button>
              <Button
                variant="danger"
                onClick={handleDelete}
                loading={deleteMutation.isPending}
                className="font-bold text-xs"
              >
                Staðfesta eyðingu
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

// 6c. Admin Ledger List
function AdminLedgerList() {
  const { data: ledger, isLoading } = useAdminLedger();
  const { data: publishers } = useAdminPublishers();
  const { data: advertisers } = useAdminAdvertisers();

  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');

  const publisherMap = useMemo(() => {
    const map = new Map<string, Publisher>();
    if (publishers) {
      publishers.forEach((p) => map.set(p.id, p));
    }
    return map;
  }, [publishers]);

  const advertiserMap = useMemo(() => {
    const map = new Map<string, Advertiser>();
    if (advertisers) {
      advertisers.forEach((a) => map.set(a.id, a));
    }
    return map;
  }, [advertisers]);

  if (isLoading) return <LoadingState />;

  const items = ledger || [];

  // Sort by date descending
  const sorted = [...items].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const filtered = sorted.filter((entry) => {
    // Determine party display name/email
    let partyName: string;
    let partyEmail = '';
    if (entry.party.type === 'publisher') {
      const pub = publisherMap.get(entry.party.id);
      partyName = pub?.displayName || '';
      partyEmail = pub?.ownerEmail || '';
    } else if (entry.party.type === 'advertiser') {
      const adv = advertiserMap.get(entry.party.id);
      partyName = adv?.companyName || '';
      partyEmail = adv?.ownerEmail || '';
    } else {
      partyName = 'Vettvangur (Platform)';
    }

    const typeMatch = filterType === 'all' || entry.type === filterType;

    const query = searchTerm.toLowerCase();
    const searchMatch =
      (entry.id || '').toLowerCase().includes(query) ||
      (entry.relatedId || '').toLowerCase().includes(query) ||
      partyName.toLowerCase().includes(query) ||
      partyEmail.toLowerCase().includes(query) ||
      (entry.type || '').toLowerCase().includes(query);

    return typeMatch && searchMatch;
  });

  const typeLabels: Record<string, string> = {
    topup: 'Innborgun (Top-up)',
    campaign_charge: 'Herferðargjald (Charge)',
    publisher_credit: 'Útgefendatekjur (Credit)',
    payout: 'Útgreiðsla (Payout)',
    refund: 'Endurgreiðsla (Refund)',
    platform_fee: 'Vettvangsþóknun (Fee)',
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Færslusaga (Ledger Logs)</h1>
        <p className="text-slate-500 text-sm font-medium mt-1">
          Heildarfærslusaga kerfisins. Hér er hægt að sjá allar fjárhagslegar hreyfingar milli
          auglýsenda, útgefenda og vettvangs.
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
        <div className="w-full max-w-md">
          <Input
            placeholder="Leita eftir ID, tengdu ID, aðila eða tegund..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 outline-none focus:border-primary"
          >
            <option value="all">Allar tegundir færslna</option>
            <option value="topup">Innborgun (Top-up)</option>
            <option value="campaign_charge">Herferðargjald (Charge)</option>
            <option value="publisher_credit">Útgefendatekjur (Credit)</option>
            <option value="payout">Útgreiðsla (Payout)</option>
            <option value="refund">Endurgreiðsla (Refund)</option>
            <option value="platform_fee">Vettvangsþóknun (Fee)</option>
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={
            searchTerm || filterType !== 'all' ? 'Engar færslur fundust' : 'Engar færslur skráðar'
          }
          description={
            searchTerm || filterType !== 'all'
              ? 'Prófaðu annað leitarorð eða síu.'
              : 'Engar færslur finnast í kerfinu.'
          }
        />
      ) : (
        <Card className="p-6">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-medium border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 font-semibold uppercase tracking-wider">
                  <th className="py-2.5">Dagsetning</th>
                  <th className="py-2.5">Færslu ID</th>
                  <th className="py-2.5">Aðili (Party)</th>
                  <th className="py-2.5">Tegund</th>
                  <th className="py-2.5">Tengt ID</th>
                  <th className="py-2.5 text-right">Upphæð (ISK)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filtered.map((entry) => {
                  let partyLabel: string;
                  if (entry.party.type === 'publisher') {
                    const pub = publisherMap.get(entry.party.id);
                    partyLabel = pub
                      ? `${pub.displayName} (Útgefandi · ${pub.ownerEmail})`
                      : `Útgefandi: ${entry.party.id}`;
                  } else if (entry.party.type === 'advertiser') {
                    const adv = advertiserMap.get(entry.party.id);
                    partyLabel = adv
                      ? `${adv.companyName} (Auglýsandi · ${adv.ownerEmail})`
                      : `Auglýsandi: ${entry.party.id}`;
                  } else {
                    partyLabel = 'Vettvangur (Platform)';
                  }

                  const isPositive = entry.amountIsk > 0;
                  const dateStr = new Date(entry.createdAt).toLocaleString('is-IS');

                  return (
                    <tr key={entry.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 font-semibold text-slate-500">{dateStr}</td>
                      <td className="py-3 font-mono text-[10px] text-slate-400">{entry.id}</td>
                      <td className="py-3 font-semibold text-slate-900">{partyLabel}</td>
                      <td className="py-3 font-semibold">{typeLabels[entry.type] || entry.type}</td>
                      <td className="py-3 font-mono text-[10px] text-slate-400">
                        {entry.relatedId}
                      </td>
                      <td
                        className={`py-3 text-right font-bold text-sm ${isPositive ? 'text-green-600' : 'text-red-600'}`}
                      >
                        {isPositive ? '+' : ''}
                        {formatIsk(entry.amountIsk)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// 7. Admin Settings (Diagnostics, Allowed Categories, Platform Fees)
function AdminSettings() {
  const { data: diag, isLoading, isError, error, refetch, isFetching } = useAdminDiagnostics();
  const refreshCache = useRefreshCache();
  const [cacheSuccessMessage, setCacheSuccessMessage] = useState<string | null>(null);
  const [cacheErrorMessage, setCacheErrorMessage] = useState<string | null>(null);

  const handleRefreshCache = async () => {
    setCacheSuccessMessage(null);
    setCacheErrorMessage(null);
    try {
      const res = await refreshCache.mutateAsync();
      if (res.success) {
        setCacheSuccessMessage(
          `Tókst að endurhlaða skyndiminni fyrir ${res.count} auglýsingapláss.`,
        );
      } else {
        setCacheErrorMessage('Eitthvað fór úrskeiðis við endurhleðslu skyndiminnis.');
      }
    } catch (err: any) {
      setCacheErrorMessage(err.message || 'Ekki tókst að endurhlaða skyndiminni.');
    }
  };

  const categories = [
    { name: 'Fréttir (news)', desc: 'Frétta- og upplýsingamiðlar' },
    { name: 'Íþróttir (sports)', desc: 'Íþróttafréttir og afþreying' },
    { name: 'Tækni (tech)', desc: 'Tæknisíður, tölvur og hugbúnaður' },
    { name: 'Fjármál (finance)', desc: 'Fjármál, viðskipti og efnahagur' },
    { name: 'Lífstíll (lifestyle)', desc: 'Matur, lífstíll, tíska og ferðalög' },
    { name: 'Afþreying (entertainment)', desc: 'Leikir, bíó, tónlist og afþreying' },
    { name: 'Veðmál (gambling)', desc: 'Veðmálasíður og spilavíti (háð takmörkunum)' },
    { name: 'Annað (other)', desc: 'Aðrir almennir veflokkar' },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Kerfisstillingar</h1>
        <p className="text-slate-500 text-sm font-medium mt-1">
          Umsjón með almennum kerfisbreytum, vefflokkum og greiningu á tengingum bakenda.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Left Side: General settings */}
        <div className="space-y-6">
          <Card className="p-6">
            <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-lg">payments</span>
              Þóknun og gjöld vettvangs
            </h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center py-2 border-b border-slate-100">
                <span className="text-xs font-semibold text-slate-600">
                  Þóknunarhlutfall (Platform Fee)
                </span>
                <span className="text-sm font-bold text-slate-955">20%</span>
              </div>
              <p className="text-[11px] font-medium text-slate-400 leading-relaxed">
                Platform þóknunin dregst sjálfkrafa af wallet-greiðslum auglýsenda við birtingu og
                rennur til Birtings. Þessi breyta er harðkóðuð í kerfiskjarnanum eins og er.
              </p>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-lg">category</span>
              Leyfilegir vefflokkar
            </h3>
            <p className="text-xs font-medium text-slate-500 mb-3">
              Þessir flokkar eru notaðir af gervigreindinni og lykilorðasíunni við flokkun á nýjum
              vefjum.
            </p>
            <div className="grid gap-2">
              {categories.map((c) => (
                <div
                  key={c.name}
                  className="flex justify-between items-center p-2 rounded-lg bg-slate-50 border border-slate-100 text-xs font-semibold text-slate-700"
                >
                  <span>{c.name}</span>
                  <span className="text-[10px] text-slate-400 font-medium">{c.desc}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-6 bg-white text-slate-800 border border-slate-100">
            <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-lg">refresh</span>
              Endurhlaða skyndiminni
            </h3>
            <p className="text-xs font-medium text-slate-500 mb-4 leading-relaxed">
              Þessir flokkar og pláss þurfa að vera rétt uppfærð. Smelltu hér til að hreinsa og
              endurbyggja upplýsingar um öll virk auglýsingapláss í Redis skyndiminni.
            </p>
            {cacheSuccessMessage && (
              <div className="p-3 mb-4 bg-green-50 border border-green-200 rounded-lg text-xs font-semibold text-green-700">
                {cacheSuccessMessage}
              </div>
            )}
            {cacheErrorMessage && (
              <div className="p-3 mb-4 bg-red-50 border border-red-200 rounded-lg text-xs font-semibold text-red-600">
                {cacheErrorMessage}
              </div>
            )}
            <Button
              onClick={handleRefreshCache}
              loading={refreshCache.isPending}
              className="w-full text-xs font-bold py-2 border border-transparent"
            >
              Endurhlaða Redis skyndiminni
            </Button>
          </Card>
        </div>

        {/* Right Side: Diagnostics */}
        <div className="space-y-6">
          <Card className="p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-lg">
                  settings_suggest
                </span>
                Tengiprófanir bakenda (Diagnostics)
              </h3>
              <Button
                variant="primary"
                onClick={() => refetch()}
                disabled={isLoading || isFetching}
                className="text-[10px] font-bold py-1 px-3 border border-transparent"
              >
                {isFetching ? 'Prófar...' : 'Prófa aftur'}
              </Button>
            </div>

            {isLoading ? (
              <div className="py-8 text-center text-xs font-medium text-slate-500">
                Sæki greiningarskýrslu af bakenda...
              </div>
            ) : isError ? (
              <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-xs font-semibold text-red-700">
                Gat ekki náð sambandi við greiningar-enda bakenda.
                <p className="text-[10px] text-red-500 font-mono mt-2">
                  {(error as any)?.message || '404/500/Connection error'}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* 1. Firebase Env Configuration */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-700">
                    Umhverfisbreytur (Vercel ENV)
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-[11px] font-semibold text-slate-600">
                    <div className="p-2 rounded bg-slate-50 border border-slate-100 flex justify-between">
                      <span>PROJECT_ID:</span>
                      <span className="font-mono text-slate-900 font-bold">
                        {diag?.env?.FIREBASE_PROJECT_ID || 'Vantar'}
                      </span>
                    </div>
                    <div className="p-2 rounded bg-slate-50 border border-slate-100 flex justify-between">
                      <span>DATABASE_ID:</span>
                      <span className="font-mono text-slate-900 font-bold">
                        {diag?.env?.FIREBASE_DATABASE_ID || '(default)'}
                      </span>
                    </div>
                    <div className="p-2 rounded bg-slate-50 border border-slate-100 flex justify-between col-span-2">
                      <span>PRIVATE_KEY (Stærð):</span>
                      <span
                        className={`font-mono font-bold ${diag?.env?.FIREBASE_PRIVATE_KEY_EXISTS ? 'text-green-600' : 'text-red-600'}`}
                      >
                        {diag?.env?.FIREBASE_PRIVATE_KEY_EXISTS
                          ? `Virkur (${diag.env.FIREBASE_PRIVATE_KEY_LENGTH} stafir)`
                          : 'VANTAR'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 2. Firebase Database status */}
                <div className="border-t border-slate-100 pt-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-bold text-slate-700">Firestore gagnagrunnur</span>
                    {diag?.firestore?.status === 'ok' ? (
                      <span className="text-[10px] font-bold text-green-600 px-2 py-0.5 rounded-full bg-green-50 border border-green-200">
                        TENGT
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-red-600 px-2 py-0.5 rounded-full bg-red-50 border border-red-200">
                        VILLA
                      </span>
                    )}
                  </div>

                  {diag?.firestore?.status === 'error' && (
                    <div className="p-3 bg-red-50/50 border border-red-200 rounded text-[10px] font-mono text-red-600 overflow-x-auto max-h-32">
                      <p className="font-bold mb-1">{diag.firestore.message}</p>
                      <pre className="text-[9px] opacity-80 leading-tight">
                        {diag.firestore.stack}
                      </pre>
                    </div>
                  )}

                  {diag?.firestore?.status === 'ok' && (
                    <p className="text-[11px] font-semibold text-slate-500">
                      Tenging er virk. Fundust söfn (collections):{' '}
                      <code className="font-mono bg-slate-100 px-1 rounded text-slate-700">
                        {diag.firestore.collections?.join(', ')}
                      </code>
                    </p>
                  )}
                </div>

                {/* 3. Slots Fetching Checks */}
                <div className="border-t border-slate-100 pt-4 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-700">
                      Slots fyrirspurnir (Raw query / Schema check)
                    </span>
                    {diag?.slotsQuery?.status === 'ok' &&
                    diag?.slotsWithConverter?.status === 'ok' ? (
                      <span className="text-[10px] font-bold text-green-600 px-2 py-0.5 rounded-full bg-green-50 border border-green-200">
                        Í LAGI
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-red-600 px-2 py-0.5 rounded-full bg-red-50 border border-red-200">
                        BILUN
                      </span>
                    )}
                  </div>

                  {/* Schema converter failure detail */}
                  {diag?.slotsWithConverter?.status === 'error' && (
                    <div className="p-3 bg-red-50/50 border border-red-200 rounded text-[10px] font-mono text-red-600 overflow-x-auto max-h-32">
                      <p className="font-bold mb-1">Schema Parser Zod Error:</p>
                      <p className="font-semibold mb-1 text-[9px]">
                        {diag.slotsWithConverter.message}
                      </p>
                      <pre className="text-[9px] opacity-80 leading-tight">
                        {diag.slotsWithConverter.stack}
                      </pre>
                    </div>
                  )}

                  {diag?.slotsQuery?.status === 'ok' && (
                    <p className="text-[11px] font-semibold text-slate-500">
                      Hrátt gagnapróf: Sótti {diag.slotsQuery.count} pláss í gagnagrunni.
                    </p>
                  )}
                </div>

                {/* 4. Redis status */}
                <div className="border-t border-slate-100 pt-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-bold text-slate-700">
                      Redis skyndiminni (Upstash Redis Cache)
                    </span>
                    {diag?.redis?.status === 'ok' ? (
                      <span className="text-[10px] font-bold text-green-600 px-2 py-0.5 rounded-full bg-green-50 border border-green-200">
                        SAMBAND
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-red-600 px-2 py-0.5 rounded-full bg-red-50 border border-red-200">
                        ÓTENGT / VILLA
                      </span>
                    )}
                  </div>
                  {diag?.redis?.status === 'error' && (
                    <div className="p-3 bg-red-50/50 border border-red-200 rounded text-[10px] font-mono text-red-600 overflow-x-auto">
                      <p className="font-bold mb-1">{diag.redis.message}</p>
                      <pre className="text-[9px] opacity-80 leading-tight">{diag.redis.stack}</pre>
                    </div>
                  )}
                  {diag?.redis?.status === 'ok' && (
                    <div className="space-y-3 text-slate-700">
                      <p className="text-[11px] font-semibold text-slate-500">
                        Tengt gegnum KV_REST_API_URL. Skyndiminni er virkt og svarar skipunum.
                      </p>
                      <div className="space-y-2 mt-2 pt-2 border-t border-slate-100">
                        <div className="text-[11px] font-bold text-slate-700">
                          Stærð á biðröðum (Redis Queues):
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-[10px] font-semibold text-slate-600">
                          <div className="p-2 rounded bg-slate-50 border border-slate-100 flex flex-col items-center">
                            <span className="text-[9px] text-slate-400 font-bold font-mono">
                              events:stats
                            </span>
                            <span className="font-mono text-slate-900 font-bold mt-1">
                              {diag.redis.queues?.['events:stats'] ?? 0}
                            </span>
                          </div>
                          <div className="p-2 rounded bg-slate-50 border border-slate-100 flex flex-col items-center">
                            <span className="text-[9px] text-slate-400 font-bold font-mono">
                              events:accrual
                            </span>
                            <span className="font-mono text-slate-900 font-bold mt-1">
                              {diag.redis.queues?.['events:accrual'] ?? 0}
                            </span>
                          </div>
                          <div className="p-2 rounded bg-slate-50 border border-slate-100 flex flex-col items-center">
                            <span className="text-[9px] text-slate-400 font-bold font-mono">
                              legacy / queue
                            </span>
                            <span className="font-mono text-slate-950 font-bold mt-1">
                              {diag.redis.queues?.['events:queue (legacy)'] ?? 0}
                            </span>
                          </div>
                        </div>
                        {diag.redis.latestEventInStatsQueue && (
                          <div className="p-2 bg-slate-50 rounded border border-slate-100 text-[9px] font-mono text-slate-500 overflow-x-auto truncate">
                            Nýjasti atburður í biðröð:{' '}
                            {JSON.stringify(diag.redis.latestEventInStatsQueue)}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

const sidebar = [
  { to: '/admin', label: 'Yfirlit', icon: 'dashboard' },
  { to: '/admin/review', label: 'Yfirferð', icon: 'shield' },
  { to: '/admin/payouts', label: 'Útborganir', icon: 'payments' },
  { to: '/admin/messages', label: 'Skilaboð', icon: 'mail' },
  { to: '/admin/publishers', label: 'Útgefendur', icon: 'web' },
  { to: '/admin/advertisers', label: 'Auglýsendur', icon: 'business' },
  { to: '/admin/slots', label: 'Auglýsingapláss', icon: 'grid_view' },
  { to: '/admin/campaigns', label: 'Herferðir', icon: 'campaign' },
  { to: '/admin/creatives', label: 'Auglýsingar', icon: 'image' },
  { to: '/admin/ledger', label: 'Færslusaga', icon: 'receipt_long' },
  { to: '/admin/settings', label: 'Stillingar', icon: 'settings' },
];

export default function AdminOverview() {
  return (
    <AppShell items={sidebar} title="Birtingur Stjórnandi">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="review" element={<AdminReviewQueue />} />
        <Route path="payouts" element={<AdminPayoutQueue />} />
        <Route path="messages" element={<AdminSupportMessages />} />
        <Route path="publishers" element={<AdminPublishersList />} />
        <Route path="advertisers" element={<AdminAdvertisersList />} />
        <Route path="slots" element={<AdminSlotsList />} />
        <Route path="campaigns" element={<AdminCampaignsList />} />
        <Route path="creatives" element={<AdminCreativesList />} />
        <Route path="ledger" element={<AdminLedgerList />} />
        <Route path="settings" element={<AdminSettings />} />
      </Routes>
    </AppShell>
  );
}
