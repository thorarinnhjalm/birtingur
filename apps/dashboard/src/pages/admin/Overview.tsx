import { useState } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import {
  LayoutGrid,
  ShieldCheck,
  Banknote,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Building2,
  Users,
  Settings as SettingsIcon,
} from 'lucide-react';
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
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

interface AdminStats {
  totalImpressions: number;
  totalClicks: number;
  totalRevenueIsk: number;
  platformFeeIsk: number;
  p95LatencyMs: number;
  systemStatus: string;
}

// 1. Admin Home (Overview metrics)
function Home() {
  const { data, isLoading } = useQuery<{ stats: AdminStats }>({
    queryKey: ['admin', 'stats'],
    queryFn: () => apiFetch<{ stats: AdminStats }>('/v1/admin/stats'),
  });

  const stats = data?.stats;

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
          label="Heildarbirtingar"
          value={isLoading ? '...' : (stats?.totalImpressions.toLocaleString('is-IS') ?? '0')}
        />
        <StatCard
          label="Heildarvelta"
          value={isLoading ? '...' : formatIsk(stats?.totalRevenueIsk ?? 0)}
        />
        <StatCard
          label="Þóknun (Birtingur)"
          value={isLoading ? '...' : formatIsk(stats?.platformFeeIsk ?? 0)}
        />
        <StatCard
          label="Svartími (p95)"
          value={isLoading ? '...' : `${stats?.p95LatencyMs ?? 24} ms`}
        />
        <StatCard label="Kerfisheilsa" value={isLoading ? '...' : (stats?.systemStatus ?? 'OK')} />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="p-6">
          <h3 className="text-base font-bold text-slate-900 mb-4">Kerfisástand</h3>
          <div className="space-y-3 text-xs font-semibold text-slate-600">
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <span>Firebase Database:</span>
              <span className="text-green-600 font-bold">Virk</span>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <span>Upstash Redis aggregation:</span>
              <span className="text-green-600 font-bold">Tengt (0 í biðröð)</span>
            </div>
            <div className="flex justify-between">
              <span>Teya Webhook Handler:</span>
              <span className="text-green-600 font-bold">Í lagi</span>
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
    </div>
  );
}

// 2. Review Queue (Pending creative approval)
function AdminReviewQueue() {
  const { data: queue, isLoading, refetch } = useReviewQueue();
  const reviewMutation = useReviewCreative();
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

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
          {queue.map((c) => (
            <Card key={c.id} className="p-6 flex flex-col md:flex-row gap-6">
              <div className="w-full md:w-44 shrink-0 bg-slate-100 rounded border border-slate-200 overflow-hidden h-32 flex items-center justify-center">
                <img src={c.imageUrl} alt="Ad Preview" className="object-contain w-full h-full" />
              </div>
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex items-center gap-3">
                  <h4 className="font-bold text-slate-900 text-sm">{c.id}</h4>
                  <Badge variant="pending">Bíður yfirferðar</Badge>
                </div>
                <div className="text-xs text-slate-500 font-semibold space-y-1">
                  <p>Auglýsandi: {c.advertiserId}</p>
                  <p>
                    Stærð: {c.width} × {c.height} px
                  </p>
                  <p>
                    Smellt á:{' '}
                    <a
                      href={c.clickUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline font-bold"
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
          ))}
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

// 3. Payout Queue (Managing publisher bank payouts)
function AdminPayoutQueue() {
  const { data: payouts, isLoading, refetch } = usePendingPayouts();
  const markCompleted = useMarkPayoutCompleted();

  const [completeId, setCompleteId] = useState<string | null>(null);
  const [bankRef, setBankRef] = useState('');
  const [error, setError] = useState<string | null>(null);

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

  if (isLoading) return <LoadingState />;

  const items = payouts || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Útgreiðslur og lágmarksskoðun (Payouts Queue)
        </h1>
        <p className="text-slate-500 text-sm font-medium mt-1">
          Millifærðu handvirkt í banka og merktu útborganir sem kláraðar.
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs font-semibold text-red-600">
          {error}
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={<CheckCircle size={44} className="text-green-500" />}
          title="Engar pending útborganir!"
          description="Allar útborganir yfir lágmarki (5.000 kr) hafa verið millifærðar."
        />
      ) : (
        <Card className="p-6">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-medium border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 font-semibold uppercase tracking-wider">
                  <th className="py-2.5">Publisher ID</th>
                  <th className="py-2.5">Bankareikningur (IBAN)</th>
                  <th className="py-2.5">Kennitala</th>
                  <th className="py-2.5">Lágmarksútborgun</th>
                  <th className="py-2.5 text-right">Upphæð</th>
                  <th className="py-2.5 text-right">Aðgerð</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {items.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/50">
                    <td className="py-3 font-semibold text-slate-900">{p.publisherId}</td>
                    <td className="py-3 font-mono">Millifærsla</td>
                    <td className="py-3">{p.id}</td>
                    <td className="py-3">{p.status}</td>
                    <td className="py-3 text-right font-bold text-slate-900">
                      {formatIsk(p.netIsk || 0)}
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

const sidebar = [
  { to: '/admin', label: 'Yfirlit', icon: 'dashboard' },
  { to: '/admin/review', label: 'Yfirferð', icon: 'shield' },
  { to: '/admin/payouts', label: 'Útborganir', icon: 'payments' },
];

export default function AdminOverview() {
  return (
    <AppShell items={sidebar} title="Birtingur Stjórnandi">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="review" element={<AdminReviewQueue />} />
        <Route path="payouts" element={<AdminPayoutQueue />} />
      </Routes>
    </AppShell>
  );
}
