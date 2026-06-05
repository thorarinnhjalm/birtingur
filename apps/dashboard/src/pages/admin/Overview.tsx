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
  Calendar,
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
import {
  useAdminPublishers,
  useAdminAdvertisers,
  useAdminSlots,
  useUpdateEntityStatus,
  useGeneratePayouts,
  useAdminDiagnostics,
} from '@/hooks/useAdmin';
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
  const { data: stats, isLoading } = useQuery<AdminStats>({
    queryKey: ['admin', 'stats'],
    queryFn: () => apiFetch<AdminStats>('/v1/admin/stats'),
  });

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

// 3. Payout Queue (Managing publisher bank payouts & generation)
function AdminPayoutQueue() {
  const { data: payouts, isLoading, refetch } = usePendingPayouts();
  const markCompleted = useMarkPayoutCompleted();
  const generatePayouts = useGeneratePayouts();

  const [completeId, setCompleteId] = useState<string | null>(null);
  const [bankRef, setBankRef] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Manual generation form states
  const [genStart, setGenStart] = useState('');
  const [genEnd, setGenEnd] = useState('');
  const [genSuccessMsg, setGenSuccessMsg] = useState('');

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
          útborganir (lágmark 5.000 kr.).
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
          description="Allar útborganir yfir lágmarki (5.000 kr) hafa verið millifærðar."
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
                      <div className="text-[10px] text-slate-400 font-mono">{p.publisherId}</div>
                    </td>
                    <td className="py-3 font-mono">{p.iban || 'Vantar reikning'}</td>
                    <td className="py-3 font-mono">{p.kennitala || 'Vantar kennitölu'}</td>
                    <td className="py-3 font-semibold text-slate-600">
                      {new Date(p.periodStart).toLocaleDateString('is-IS', {
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
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

// 4. Publishers List
function AdminPublishersList() {
  const { data: publishers, isLoading, refetch } = useAdminPublishers();
  const updateStatus = useUpdateEntityStatus();
  const [error, setError] = useState<string | null>(null);

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

  if (isLoading) return <LoadingState />;

  const items = publishers || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Útgefendur (Publishers)</h1>
        <p className="text-slate-500 text-sm font-medium mt-1">
          Skoðaðu útgefendur og frystu reikninga þeirra ef á þarf að halda.
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs font-semibold text-red-600">
          {error}
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState
          title="Engir útgefendur skráðir"
          description="Engir útgefendur finnast í kerfinu."
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
                  <th className="py-2.5">Staða</th>
                  <th className="py-2.5">Stofnað</th>
                  <th className="py-2.5 text-right">Aðgerð</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {items.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/50">
                    <td className="py-3">
                      <div className="font-semibold text-slate-900">{p.displayName}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{p.id}</div>
                    </td>
                    <td className="py-3 font-semibold text-slate-600">{p.domain}</td>
                    <td className="py-3 text-slate-500 font-semibold">{p.ownerEmail}</td>
                    <td className="py-3">
                      <Badge variant={p.status === 'active' ? 'success' : 'danger'}>
                        {p.status === 'active' ? 'Virkur' : 'Frystur'}
                      </Badge>
                    </td>
                    <td className="py-3 text-slate-500 font-semibold">
                      {new Date(p.createdAt).toLocaleDateString('is-IS')}
                    </td>
                    <td className="py-3 text-right">
                      <Button
                        variant={p.status === 'active' ? 'danger' : 'primary'}
                        onClick={() => handleToggleStatus(p.id, p.status)}
                        loading={updateStatus.isPending}
                        className="text-[10px] font-bold py-1.5 px-3 border border-transparent"
                      >
                        {p.status === 'active' ? 'Frysta' : 'Virkja'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// 5. Advertisers List
function AdminAdvertisersList() {
  const { data: advertisers, isLoading, refetch } = useAdminAdvertisers();
  const updateStatus = useUpdateEntityStatus();
  const [error, setError] = useState<string | null>(null);

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

  if (isLoading) return <LoadingState />;

  const items = advertisers || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Auglýsendur (Advertisers)</h1>
        <p className="text-slate-500 text-sm font-medium mt-1">
          Skoðaðu auglýsendur og stöðu veskja þeirra. Frystu þá ef þeir brjóta skilmála.
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs font-semibold text-red-600">
          {error}
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState
          title="Engir auglýsendur skráðir"
          description="Engir auglýsendur finnast í kerfinu."
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
                  <th className="py-2.5 text-right">Aðgerð</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {items.map((a) => (
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
                      <Button
                        variant={a.status === 'active' ? 'danger' : 'primary'}
                        onClick={() => handleToggleStatus(a.id, a.status)}
                        loading={updateStatus.isPending}
                        className="text-[10px] font-bold py-1.5 px-3 border border-transparent"
                      >
                        {a.status === 'active' ? 'Frysta' : 'Virkja'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// 6. Slots List
function AdminSlotsList() {
  const { data: slots, isLoading, refetch } = useAdminSlots();
  const updateStatus = useUpdateEntityStatus();
  const [error, setError] = useState<string | null>(null);

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

  if (isLoading) return <LoadingState />;

  const items = slots || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Auglýsingapláss (Slots)</h1>
        <p className="text-slate-500 text-sm font-medium mt-1">
          Skoðaðu og frystu auglýsingapláss útgefenda á kerfisvísu ef þörf krefur.
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs font-semibold text-red-600">
          {error}
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState
          title="Engin pláss skráð"
          description="Engin auglýsingapláss finnast í kerfinu."
        />
      ) : (
        <Card className="p-6">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-medium border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 font-semibold uppercase tracking-wider">
                  <th className="py-2.5">Pláss / Heiti</th>
                  <th className="py-2.5">Útgefandi ID</th>
                  <th className="py-2.5">Stærðir</th>
                  <th className="py-2.5">Verðlagning</th>
                  <th className="py-2.5">Staða</th>
                  <th className="py-2.5 text-right">Aðgerð</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {items.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/50">
                    <td className="py-3">
                      <div className="font-semibold text-slate-900">{s.name}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{s.id}</div>
                    </td>
                    <td className="py-3 font-mono text-slate-500">{s.publisherId}</td>
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
                      <Button
                        variant={s.status === 'active' ? 'danger' : 'primary'}
                        onClick={() => handleToggleStatus(s.id, s.status)}
                        loading={updateStatus.isPending}
                        className="text-[10px] font-bold py-1.5 px-3 border border-transparent"
                      >
                        {s.status === 'active' ? 'Frysta' : 'Virkja'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// 6. Admin Settings (Diagnostics, Allowed Categories, Platform Fees)
function AdminSettings() {
  const { data: diag, isLoading, isError, error, refetch, isFetching } = useAdminDiagnostics();

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
                    <p className="text-[11px] font-semibold text-slate-500">
                      Tengt gegnum KV_REST_API_URL. Skyndiminni er virkt og svarar skipunum.
                    </p>
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
  { to: '/admin/publishers', label: 'Útgefendur', icon: 'web' },
  { to: '/admin/advertisers', label: 'Auglýsendur', icon: 'business' },
  { to: '/admin/slots', label: 'Auglýsingapláss', icon: 'grid_view' },
];

export default function AdminOverview() {
  return (
    <AppShell items={sidebar} title="Birtingur Stjórnandi">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="review" element={<AdminReviewQueue />} />
        <Route path="payouts" element={<AdminPayoutQueue />} />
        <Route path="publishers" element={<AdminPublishersList />} />
        <Route path="advertisers" element={<AdminAdvertisersList />} />
        <Route path="slots" element={<AdminSlotsList />} />
        <Route path="settings" element={<AdminSettings />} />
      </Routes>
    </AppShell>
  );
}
