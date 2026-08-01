import { useParams, useNavigate } from 'react-router-dom';
import {
  useCampaign,
  useCampaignStats,
  useUpdateCampaign,
  useExtendCampaign,
  useBulkCreativeStats,
} from '@/hooks/useCampaigns';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { AnalyticsChart } from '@/components/charts/AnalyticsChart';
import { formatIsk } from '@/lib/format';
import {
  Calendar,
  AlertCircle,
  ArrowLeft,
  Play,
  Pause,
  ExternalLink,
  Check,
  Copy,
  X,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { AD_CATEGORIES, FLAT_CPM_ISK, type Creative } from '@ada/shared';
import { Input } from '@/components/ui/Input';
import { useQuery } from '@tanstack/react-query';

const REGION_LABELS: Record<string, string> = {
  all: 'Allt landið',
  capital: 'Höfuðborgarsvæðið',
  countryside: 'Landsbyggðin',
  reykjavik: 'Reykjavík',
  kopavogur: 'Kópavogur',
  hafnarfjordur: 'Hafnarfjörður',
  gardabaer: 'Garðabær',
  mosfellsbaer: 'Mosfellsbær',
  seltjarnarnes: 'Seltjarnarnes',
  akureyri: 'Akureyri',
  reykjanesbaer: 'Reykjanesbær',
  selfoss: 'Selfoss',
  akranes: 'Akranes',
  isafjordur: 'Ísafjörður',
  egilsstadir: 'Egilsstaðir',
  vestmannaeyjar: 'Vestmannaeyjar',
};

export default function CampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [datePreset, setDatePreset] = useState<'7' | '30' | '90' | 'custom'>('30');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [activeRange, setActiveRange] = useState<{
    timeframeDays?: number;
    startDate?: string;
    endDate?: string;
  }>({ timeframeDays: 30 });

  const { data: campaign, isLoading, isError, refetch } = useCampaign(id);
  const { data: stats, isLoading: isStatsLoading } = useCampaignStats(id, activeRange);

  // Fetch advertiser creatives and bulk stats
  const { data: advertiserCreatives } = useQuery({
    queryKey: ['creatives'],
    queryFn: () => apiFetch<Creative[]>('/v1/creatives'),
  });
  const { data: bulkStats } = useBulkCreativeStats();

  const campaignCreatives =
    advertiserCreatives?.filter((c) => campaign?.creativeIds?.includes(c.id)) || [];

  const campaignCreativesStatuses = campaignCreatives.map((c) => c.reviewStatus);
  const campaignCreativesHasRejected = campaignCreativesStatuses.includes('rejected');
  const campaignCreativesHasPending = campaignCreativesStatuses.includes('pending');
  const campaignCreativesAllApproved =
    campaignCreatives.length > 0 &&
    campaignCreatives.every(
      (c) => c.reviewStatus === 'auto_approved' || c.reviewStatus === 'manual_approved',
    );

  const updateCampaignMutation = useUpdateCampaign();

  const [toggling, setToggling] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);

  const [viewerKey, setViewerKey] = useState<string | null>(null);
  const [loadingKey, setLoadingKey] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);
  const [copiedStats, setCopiedStats] = useState(false);

  // Edit Modal states
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editStartsAt, setEditStartsAt] = useState('');
  const [editEndsAt, setEditEndsAt] = useState('');
  const [editCategories, setEditCategories] = useState<string[]>([]);
  const [editCreativeIds, setEditCreativeIds] = useState<string[]>([]);
  const [editRegions, setEditRegions] = useState<string[]>(['all']);

  const toggleEditRegion = (slug: string) => {
    if (slug === 'all') {
      setEditRegions(['all']);
      return;
    }
    setEditRegions((prev) => {
      const withoutAll = prev.filter((r) => r !== 'all');
      if (withoutAll.includes(slug)) {
        const next = withoutAll.filter((r) => r !== slug);
        return next.length === 0 ? ['all'] : next;
      } else {
        return [...withoutAll, slug];
      }
    });
  };
  const [editTotalBudget, setEditTotalBudget] = useState(0);
  const [editError, setEditError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

  // Extend Modal state (completed campaigns with leftover budget)
  const [isExtendModalOpen, setIsExtendModalOpen] = useState(false);
  const [extendEndsAt, setExtendEndsAt] = useState('');
  const [extendError, setExtendError] = useState<string | null>(null);
  const extendCampaignMutation = useExtendCampaign();

  useEffect(() => {
    if (id) {
      setLoadingKey(true);
      apiFetch<{ key: string }>(`/v1/campaigns/${id}/widget-key`)
        .then((res) => setViewerKey(res.key))
        .catch((err) => console.error('Error fetching campaign widget key:', err))
        .finally(() => setLoadingKey(false));
    }
  }, [id]);

  useEffect(() => {
    if (campaign && isEditModalOpen) {
      setEditName(campaign.name || '');
      setEditStartsAt(
        campaign.schedule.startsAt
          ? new Date(campaign.schedule.startsAt).toISOString().split('T')[0] || ''
          : '',
      );
      setEditEndsAt(
        campaign.schedule.endsAt
          ? new Date(campaign.schedule.endsAt).toISOString().split('T')[0] || ''
          : '',
      );
      setEditCategories(campaign.targeting.categories || []);
      setEditCreativeIds(campaign.creativeIds || []);
      setEditRegions(
        campaign.targeting.geoRegions && campaign.targeting.geoRegions.length > 0
          ? campaign.targeting.geoRegions
          : ['all'],
      );
      setEditTotalBudget(campaign.budget.totalIsk || 0);
      setEditError(null);
    }
  }, [campaign, isEditModalOpen]);

  if (isLoading) return <LoadingState />;
  if (isError || !campaign) {
    return (
      <ErrorState
        message="Ekki tókst að hlaða herferð. Hún gæti hafa verið fjarlægð eða þú hefur ekki aðgang að henni."
        onRetry={refetch}
      />
    );
  }

  // Toggle active status
  const toggleCampaignStatus = async () => {
    setToggling(true);
    setToggleError(null);
    const nextStatus = campaign.status === 'active' ? 'paused' : 'active';
    try {
      await updateCampaignMutation.mutateAsync({
        id: campaign.id,
        patch: { status: nextStatus },
      });
    } catch (err: any) {
      setToggleError(err.message || 'Ekki tókst að breyta stöðu herferðar.');
    } finally {
      setToggling(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdating(true);
    setEditError(null);

    if (editEndsAt && editStartsAt && new Date(editEndsAt) <= new Date(editStartsAt)) {
      setEditError('Lokadagur verður að vera eftir upphafsdag.');
      setUpdating(false);
      return;
    }

    if (editCategories.length === 0) {
      setEditError('Vinsamlegast veldu að minnsta kosti einn flokk.');
      setUpdating(false);
      return;
    }

    const spent = campaign.budget.totalIsk - campaign.budget.remainingIsk;
    if (editTotalBudget < spent) {
      setEditError(
        `Fjárhagsáætlun má ekki vera lægri en upphæðin sem hefur þegar verið eytt (${formatIsk(spent)}).`,
      );
      setUpdating(false);
      return;
    }

    try {
      await updateCampaignMutation.mutateAsync({
        id: campaign.id,
        patch: {
          name: editName || undefined,
          categories: editCategories,
          creativeIds: editCreativeIds,
          geoRegions: editRegions.includes('all') ? [] : editRegions,
          schedule: {
            startsAt: new Date(editStartsAt).toISOString(),
            endsAt: editEndsAt
              ? new Date(editEndsAt).toISOString()
              : new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
          },
          budget: {
            totalIsk: editTotalBudget,
          },
        },
      });
      setIsEditModalOpen(false);
    } catch (err: any) {
      setEditError(err.message || 'Ekki tókst að uppfæra herferð.');
    } finally {
      setUpdating(false);
    }
  };

  const handleExtend = async (e: React.FormEvent) => {
    e.preventDefault();
    setExtendError(null);
    try {
      await extendCampaignMutation.mutateAsync({
        id: campaign.id,
        endsAt: new Date(extendEndsAt).toISOString(),
      });
      setIsExtendModalOpen(false);
    } catch (err) {
      // apiFetch throws ApiError with a `code` from the API's error body
      // (`services/campaigns.ts`'s extendCampaign) — match on that instead
      // of sniffing the message text.
      const code = err instanceof ApiError ? err.code : undefined;
      if (code === 'INSUFFICIENT_FUNDS') {
        setExtendError('Ekki næg inneign í veskinu til að frátaka eftirstöðvarnar á ný.');
      } else if (code === 'NO_REMAINING_BUDGET') {
        setExtendError('Herferðin á engar eftirstöðvar til að framlengja með.');
      } else {
        setExtendError('Ekki tókst að framlengja herferðina. Reyndu aftur.');
      }
    }
  };

  const spent = campaign.budget.totalIsk - campaign.budget.remainingIsk;
  const pct = Math.min(100, Math.round((spent / campaign.budget.totalIsk) * 100)) || 0;

  // Chart data formatting: if no stats returned from endpoint, format the hourly data points
  const chartData =
    stats?.hours?.map((h) => {
      const y = h.hour.substring(0, 4);
      const m = h.hour.substring(4, 6);
      const d = h.hour.substring(6, 8);
      const hr = h.hour.substring(8, 10);
      return {
        date: `${y}-${m}-${d}T${hr}:00:00Z`,
        impressions: h.impressions,
        clicks: h.clicks,
      };
    }) || [];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header and Back navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/advertiser/campaigns')}
            className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-800 transition cursor-pointer"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900 font-sans">
                {campaign.name || `Herferð: ${campaign.id.substring(0, 8)}`}
              </h1>
              <Badge
                variant={
                  campaign.status === 'active'
                    ? 'success'
                    : campaign.status === 'pending_approval'
                      ? 'pending'
                      : 'neutral'
                }
              >
                {campaign.status === 'active'
                  ? 'Virk'
                  : campaign.status === 'pending_approval'
                    ? 'Í yfirferð'
                    : campaign.status}
              </Badge>
            </div>
            <p className="text-xs text-slate-400 font-semibold mt-1">
              Auðkenni herferðar: {campaign.id}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => setIsEditModalOpen(true)}
            className="text-xs font-bold py-2.5 px-4 flex items-center gap-1.5"
          >
            Breyta herferð
          </Button>

          {campaign.status === 'completed' ? (
            campaign.budget.remainingIsk > 0 ? (
              <Button
                variant="primary"
                onClick={() => setIsExtendModalOpen(true)}
                className="text-xs font-bold py-2.5 px-4 flex items-center gap-1.5"
              >
                <Play size={14} />
                <span>Framlengja herferð</span>
              </Button>
            ) : (
              <span className="text-xs font-semibold text-slate-400">
                Herferðin kláraði fjárhæðina — lokið.
              </span>
            )
          ) : (
            campaign.status !== 'pending_approval' && (
              <Button
                variant={campaign.status === 'active' ? 'secondary' : 'primary'}
                onClick={toggleCampaignStatus}
                loading={toggling}
                className="text-xs font-bold py-2.5 px-4 flex items-center gap-1.5"
              >
                {campaign.status === 'active' ? (
                  <>
                    <Pause size={14} />
                    <span>Stöðva birtingar</span>
                  </>
                ) : (
                  <>
                    <Play size={14} />
                    <span>Ræsa herferð</span>
                  </>
                )}
              </Button>
            )
          )}
        </div>
      </div>

      {toggleError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs font-medium text-red-600">
          {toggleError}
        </div>
      )}

      {/* Date Range Selector & eCPC/eCPM Quick Widget */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Tímabil skýrslu
          </span>
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
              {(['7', '30', '90', 'custom'] as const).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    setDatePreset(preset);
                    if (preset !== 'custom') {
                      setActiveRange({ timeframeDays: parseInt(preset, 10) });
                    }
                  }}
                  className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-all cursor-pointer ${
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
              <div className="flex items-center gap-1.5 animate-fade-in bg-slate-50 border border-slate-200 p-1 rounded-lg">
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="bg-transparent border-none text-[10px] font-bold text-slate-700 focus:outline-none p-0.5"
                />
                <span className="text-[10px] text-slate-400 font-bold">til</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="bg-transparent border-none text-[10px] font-bold text-slate-700 focus:outline-none p-0.5"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (customStart && customEnd) {
                      setActiveRange({ startDate: customStart, endDate: customEnd });
                    }
                  }}
                  disabled={!customStart || !customEnd}
                  className="bg-primary text-white text-[9px] font-extrabold px-2.5 py-1 rounded-md hover:bg-primary-dim transition cursor-pointer disabled:opacity-50"
                >
                  Sækja
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-4">
          <div className="bg-slate-50 border border-slate-100 px-4 py-2 rounded-lg">
            <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest block">
              Herferð eCPC
            </span>
            <span className="text-sm font-black text-slate-900 mt-0.5 block">
              {stats && stats.clicks > 0
                ? formatIsk(Math.round((stats.spendIsk || 0) / stats.clicks))
                : '0 kr.'}
            </span>
          </div>
          <div className="bg-slate-50 border border-slate-100 px-4 py-2 rounded-lg">
            <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest block">
              Herferð eCPM
            </span>
            <span className="text-sm font-black text-slate-900 mt-0.5 block">
              {stats && stats.impressions > 0
                ? formatIsk(Math.round(((stats.spendIsk || 0) / stats.impressions) * 1000))
                : '0 kr.'}
            </span>
          </div>
        </div>
      </div>

      {/* Dashboard KPI cards */}
      <div className="grid sm:grid-cols-3 gap-6">
        <Card className="p-5">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Fjárhagsáætlun
          </div>
          <div className="text-2xl font-extrabold text-slate-900 mt-2">
            {formatIsk(campaign.budget.totalIsk)}
          </div>
          <div className="mt-3 flex justify-between text-xs text-slate-500 font-medium">
            <span>Eytt: {formatIsk(spent)}</span>
            <span>Eftir: {formatIsk(campaign.budget.remainingIsk)}</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-1 mt-2 overflow-hidden">
            <div className="bg-primary h-1" style={{ width: `${pct}%` }} />
          </div>
        </Card>

        <Card className="p-5">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Birtingarstjórnun
          </div>
          <div className="text-lg font-extrabold text-slate-900 mt-2 truncate">
            {campaign.targeting.categories
              .map((cat) => AD_CATEGORIES.find((c) => c.slug === cat)?.label || cat)
              .join(', ')}
          </div>
          <div className="mt-2 text-xs text-slate-500 font-semibold">
            Svæði:{' '}
            <span className="text-slate-700 font-bold">
              {campaign.targeting.geoRegions && campaign.targeting.geoRegions.length > 0
                ? campaign.targeting.geoRegions.map((r) => REGION_LABELS[r] || r).join(', ')
                : 'Allt landið'}
            </span>
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-500 font-medium">
            <Calendar size={14} />
            <span>
              {new Date(campaign.schedule.startsAt).toLocaleDateString('is-IS')} -{' '}
              {campaign.schedule.endsAt
                ? new Date(campaign.schedule.endsAt).toLocaleDateString('is-IS')
                : 'ótakmarkað'}
            </span>
          </div>
        </Card>

        <Card className="p-5">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Yfirferð auglýsingar
          </div>
          <div className="text-xl font-extrabold text-slate-900 mt-2">
            {campaignCreativesAllApproved
              ? 'Samþykkt'
              : campaignCreativesHasPending
                ? 'Í yfirferð'
                : campaignCreativesHasRejected
                  ? 'Hafnað'
                  : campaignCreatives.length === 0
                    ? 'Engin auglýsing'
                    : 'Óþekkt'}
          </div>
          <div className="mt-3 text-xs text-slate-500 font-medium">
            {campaignCreativesHasRejected
              ? 'Einni eða fleiri auglýsingum var hafnað. Vinsamlegast skoðaðu reglur okkar eða skiptu þeim út.'
              : campaignCreativesHasPending
                ? 'Ein eða fleiri auglýsingar bíða yfirferðar.'
                : campaignCreativesAllApproved
                  ? 'Allar auglýsingar herferðarinnar eru virkar og tilbúnar í birtingar.'
                  : 'Engar auglýsingar eru tengdar þessari herferð.'}
          </div>
        </Card>
      </div>

      {/* Analytics Chart */}
      <Card className="p-6">
        <h3 className="text-base font-bold text-slate-900">Birtingar og smellir yfir tíma</h3>
        {isStatsLoading ? <LoadingState /> : <AnalyticsChart data={chartData} mode="advertiser" />}
      </Card>

      {/* Widget Embedding for Campaign Stats */}
      <Card className="p-6 space-y-4">
        <div>
          <h3 className="text-base font-bold text-slate-900">
            Fella árangur inn á aðra vefi (Campaign Widget)
          </h3>
          <p className="text-slate-500 text-sm font-medium mt-1">
            Þú getur fellt þessa tölfræði beint inn á þinn eigin vef eða stjórnborð (eins og á
            markadssetning.is) á öruggan hátt með eftirfarandi HTML kóða:
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 pt-2 border-t border-slate-100">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 block">
              1. Setja skriftu inn á vefsíðuna þína
            </label>
            <div className="flex gap-2">
              <div className="font-mono text-xs bg-slate-900 text-slate-100 p-3 rounded-lg grow overflow-x-auto whitespace-nowrap">
                {`<script src="https://cdn.birtingur.app/v1/widgets.js" defer></script>`}
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  navigator.clipboard.writeText(
                    '<script src="https://cdn.birtingur.app/v1/widgets.js" defer></script>',
                  );
                  setCopiedScript(true);
                  setTimeout(() => setCopiedScript(false), 2000);
                }}
                className="px-3 py-2"
              >
                {copiedScript ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 block">
              2. Setja tölfræðikassa í viðmótið
            </label>
            <div className="flex gap-2">
              <div className="font-mono text-xs bg-slate-900 text-slate-100 p-3 rounded-lg grow overflow-x-auto whitespace-nowrap">
                {`<adplatform-campaign-stats campaign-id="${campaign.id}" viewer-key="${loadingKey ? 'Hleð lykli...' : viewerKey || ''}"></adplatform-campaign-stats>`}
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  navigator.clipboard.writeText(
                    `<adplatform-campaign-stats campaign-id="${campaign.id}" viewer-key="${viewerKey || ''}"></adplatform-campaign-stats>`,
                  );
                  setCopiedStats(true);
                  setTimeout(() => setCopiedStats(false), 2000);
                }}
                className="px-3 py-2"
              >
                {copiedStats ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Performance by Web slot Table and Creative preview */}
      <div className="grid md:grid-cols-3 gap-6">
        {/* Performance by Creative */}
        <Card className="p-6 md:col-span-2 space-y-4">
          <h3 className="text-base font-bold text-slate-900">Frammistaða eftir auglýsingu</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-medium border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 font-semibold uppercase tracking-wider">
                  <th className="py-2.5">Auglýsing</th>
                  <th className="py-2.5">Birtingar</th>
                  <th className="py-2.5">Smellir</th>
                  <th className="py-2.5">CTR</th>
                  <th className="py-2.5 text-right">eCPC</th>
                  <th className="py-2.5 text-right">Eytt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {campaignCreatives.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-400">
                      Engar auglýsingar tengdar herferðinni.
                    </td>
                  </tr>
                ) : (
                  campaignCreatives.map((creative) => {
                    const cStats = bulkStats?.[creative.id] ?? {
                      impressions: 0,
                      clicks: 0,
                      ctr: 0,
                    };
                    const spendIsk = Math.round((cStats.impressions / 1000) * FLAT_CPM_ISK);
                    const ctr =
                      cStats.impressions > 0
                        ? Math.min(100, (cStats.clicks / cStats.impressions) * 100)
                        : 0;
                    const ecpc =
                      cStats.clicks > 0 ? formatIsk(Math.round(spendIsk / cStats.clicks)) : '0 kr.';
                    return (
                      <tr key={creative.id} className="hover:bg-slate-50/50">
                        <td
                          className="py-3 font-semibold text-slate-900 max-w-[180px] truncate"
                          title={creative.clickUrl}
                        >
                          {creative.clickUrl.replace(/^https?:\/\/([^/]+).*/, '$1')} ·{' '}
                          {creative.width}×{creative.height}
                        </td>
                        <td className="py-3">{cStats.impressions.toLocaleString('is-IS')}</td>
                        <td className="py-3">{cStats.clicks.toLocaleString('is-IS')}</td>
                        <td className="py-3">{ctr.toFixed(1).replace('.', ',')}%</td>
                        <td className="py-3 text-right text-amber-600 font-bold">{ecpc}</td>
                        <td className="py-3 text-right">{formatIsk(spendIsk)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Ad Previews */}
        <Card className="p-6 space-y-4">
          <h3 className="text-base font-bold text-slate-900">
            Auglýsingar ({campaignCreatives.length})
          </h3>
          <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
            {campaignCreatives.length === 0 ? (
              <div className="text-center py-6 text-xs text-slate-400 font-medium">
                Engar auglýsingar tengdar.
              </div>
            ) : (
              campaignCreatives.map((creative) => {
                const cStats = bulkStats?.[creative.id] || { impressions: 0, clicks: 0, ctr: 0 };
                return (
                  <div
                    key={creative.id}
                    className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-3 relative group"
                  >
                    <div className="mx-auto border border-slate-300 shadow-sm rounded overflow-hidden max-h-40 flex items-center justify-center bg-white">
                      <img
                        src={creative.imageUrl}
                        alt="Auglýsing"
                        className="object-contain max-h-36"
                      />
                    </div>

                    <div className="text-[10px] text-slate-400 font-mono text-center">
                      Stærð: {creative.width}x{creative.height} | Staða:{' '}
                      <span
                        className={`font-bold ${
                          creative.reviewStatus.includes('approved')
                            ? 'text-green-600'
                            : creative.reviewStatus === 'pending'
                              ? 'text-amber-500'
                              : 'text-red-500'
                        }`}
                      >
                        {creative.reviewStatus === 'auto_approved' ||
                        creative.reviewStatus === 'manual_approved'
                          ? 'Samþykkt'
                          : creative.reviewStatus === 'pending'
                            ? 'Í yfirferð'
                            : 'Hafnað'}
                      </span>
                    </div>

                    <div className="text-xs space-y-2 border-t border-slate-200 pt-2">
                      <div className="grid grid-cols-3 gap-1.5 text-center">
                        <div className="bg-white border border-slate-100 rounded-md p-1.5">
                          <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                            Birtingar
                          </div>
                          <div className="text-sm font-extrabold text-slate-800 mt-0.5">
                            {cStats.impressions?.toLocaleString('is-IS') ?? '0'}
                          </div>
                        </div>
                        <div className="bg-white border border-slate-100 rounded-md p-1.5">
                          <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                            Smellir
                          </div>
                          <div className="text-sm font-extrabold text-slate-800 mt-0.5">
                            {cStats.clicks?.toLocaleString('is-IS') ?? '0'}
                          </div>
                        </div>
                        <div className="bg-white border border-slate-100 rounded-md p-1.5">
                          <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                            CTR
                          </div>
                          <div className="text-sm font-extrabold text-slate-800 mt-0.5">
                            {cStats.ctr != null
                              ? `${cStats.ctr.toFixed(2).replace('.', ',')}%`
                              : '0,00%'}
                          </div>
                        </div>
                      </div>

                      <div>
                        <span className="block text-[10px] text-slate-500 font-semibold">
                          Tengill á vefsíðu:
                        </span>
                        <a
                          href={creative.clickUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary font-bold hover:underline inline-flex items-center gap-1 mt-0.5 truncate max-w-full text-[11px]"
                        >
                          <span className="truncate">{creative.clickUrl}</span>
                          <ExternalLink size={10} className="shrink-0" />
                        </a>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>
      </div>

      {/* Performance by Web slot Table */}
      <div className="grid md:grid-cols-3 gap-6">
        <Card className="p-6 md:col-span-2 space-y-4">
          <h3 className="text-base font-bold text-slate-900">
            Frammistaða eftir birtingavettvangi
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-medium border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 font-semibold uppercase tracking-wider">
                  <th className="py-2.5">Vettvangur</th>
                  <th className="py-2.5">Birtingar</th>
                  <th className="py-2.5">Smellir</th>
                  <th className="py-2.5">CTR</th>
                  <th className="py-2.5 text-right">eCPC</th>
                  <th className="py-2.5 text-right">Eytt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {!stats?.byPublisher || Object.keys(stats.byPublisher).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-400">
                      Engar birtingar eða smellir skráðir eftir birtingavettvangi enn sem komið er.
                    </td>
                  </tr>
                ) : (
                  Object.entries(stats.byPublisher)
                    .map(([id, pubStats]) => ({ id, ...pubStats }))
                    .sort((a, b) => b.impressions - a.impressions)
                    .map((pub) => {
                      const ctr =
                        pub.impressions > 0
                          ? Math.min(100, (pub.clicks / pub.impressions) * 100)
                          : 0;
                      const ecpc =
                        pub.clicks > 0 ? formatIsk(Math.round(pub.spendIsk / pub.clicks)) : '0 kr.';
                      return (
                        <tr key={pub.id} className="hover:bg-slate-50/50">
                          <td className="py-3">
                            <div className="font-semibold text-slate-900">{pub.displayName}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{pub.domain}</div>
                          </td>
                          <td className="py-3">{pub.impressions.toLocaleString('is-IS')}</td>
                          <td className="py-3">{pub.clicks.toLocaleString('is-IS')}</td>
                          <td className="py-3">{ctr.toFixed(1).replace('.', ',')}%</td>
                          <td className="py-3 text-right text-amber-600 font-bold">{ecpc}</td>
                          <td className="py-3 text-right">{formatIsk(pub.spendIsk)}</td>
                        </tr>
                      );
                    })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {isEditModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <Card className="max-w-xl w-full bg-white shadow-2xl overflow-hidden p-6 space-y-5 my-8">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                Breyta herferð: {campaign.name || campaign.id.substring(0, 8)}
              </h3>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-5">
              <Input
                label="Heiti herferðar *"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
              />

              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Byrjar þann *"
                  type="date"
                  value={editStartsAt}
                  onChange={(e) => setEditStartsAt(e.target.value)}
                  required
                />
                <Input
                  label="Endar þann"
                  type="date"
                  value={editEndsAt}
                  onChange={(e) => setEditEndsAt(e.target.value)}
                />
              </div>

              {/* Categories targeting */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 block">
                  Veldu efnisflokka *
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {AD_CATEGORIES.map((cat) => {
                    const isSelected = editCategories.includes(cat.slug);
                    return (
                      <div
                        key={cat.slug}
                        onClick={() => {
                          setEditCategories((prev) =>
                            prev.includes(cat.slug)
                              ? prev.filter((s) => s !== cat.slug)
                              : [...prev, cat.slug],
                          );
                        }}
                        className={`p-2.5 rounded-lg border cursor-pointer transition-all duration-150 flex items-center justify-between select-none ${
                          isSelected
                            ? 'border-primary bg-blue-50/20 ring-1 ring-primary'
                            : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <span className="font-bold text-slate-800 text-[11px]">{cat.label}</span>
                        {isSelected && <Check size={12} className="text-primary" />}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Region Targeting */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-slate-700 block">Landshlutamarkun</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { key: 'all', label: '🌐 Allt land' },
                    { key: 'capital', label: 'Höfuðborgarsvæðið' },
                    { key: 'countryside', label: 'Landsbyggðin' },
                  ].map((region) => (
                    <div
                      key={region.key}
                      onClick={() => toggleEditRegion(region.key)}
                      className={`p-2.5 rounded-lg border cursor-pointer text-center select-none transition-all duration-150 ${
                        editRegions.includes(region.key)
                          ? 'border-primary bg-blue-50/20 ring-1 ring-primary font-bold text-slate-900 text-xs'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 font-semibold text-slate-600 text-xs'
                      }`}
                    >
                      {region.label}
                    </div>
                  ))}
                </div>

                {/* Specific City Selector inside Edit Modal */}
                <div className="pt-2 space-y-2">
                  <label className="block text-[10px] font-bold text-slate-500">
                    Eða velja ákveðna bæi / bæjarfélög:
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {[
                      { key: 'reykjavik', label: 'Reykjavík' },
                      { key: 'kopavogur', label: 'Kópavogur' },
                      { key: 'hafnarfjordur', label: 'Hafnarfjörður' },
                      { key: 'gardabaer', label: 'Garðabær' },
                      { key: 'mosfellsbaer', label: 'Mosfellsbær' },
                      { key: 'seltjarnarnes', label: 'Seltjarnarnes' },
                      { key: 'akureyri', label: 'Akureyri' },
                      { key: 'reykjanesbaer', label: 'Reykjanesbær' },
                      { key: 'selfoss', label: 'Selfoss' },
                      { key: 'akranes', label: 'Akranes' },
                      { key: 'isafjordur', label: 'Ísafjörður' },
                      { key: 'egilsstadir', label: 'Egilsstaðir' },
                      { key: 'vestmannaeyjar', label: 'Vestmannaeyjar' },
                    ].map((city) => {
                      const isChecked = editRegions.includes(city.key);
                      return (
                        <div
                          key={city.key}
                          onClick={() => toggleEditRegion(city.key)}
                          className={`p-2 rounded-lg border cursor-pointer transition-all duration-150 flex items-center justify-between select-none ${
                            isChecked
                              ? 'border-primary bg-blue-50/20 ring-1 ring-primary'
                              : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          <span className="font-bold text-slate-800 text-[10px]">{city.label}</span>
                          {isChecked && <Check size={10} className="text-primary" />}
                        </div>
                      );
                    })}
                  </div>
                  {!editRegions.includes('all') && (
                    <p className="text-[10px] text-blue-600 font-bold mt-1">
                      Valin svæði: {editRegions.map((r) => REGION_LABELS[r] || r).join(', ')}
                    </p>
                  )}
                </div>
              </div>

              {/* Creative selection */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 block">
                  Tengdar auglýsingar *
                </label>
                <p className="text-[11px] text-slate-400 font-medium">
                  Veldu eina eða fleiri auglýsingar úr safninu þínu til að birta í þessari herferð.
                </p>
                <div className="grid grid-cols-2 gap-3 max-h-48 overflow-y-auto p-1 border border-slate-100 rounded-lg font-sans">
                  {advertiserCreatives?.map((c) => {
                    const isSelected = editCreativeIds.includes(c.id);
                    const isRejected = c.reviewStatus === 'rejected';

                    return (
                      <div
                        key={c.id}
                        onClick={() => {
                          if (isRejected) return;
                          setEditCreativeIds((prev) =>
                            prev.includes(c.id)
                              ? prev.filter((id) => id !== c.id)
                              : [...prev, c.id],
                          );
                        }}
                        className={`p-2.5 rounded-lg border transition-all duration-150 flex flex-col justify-between select-none relative ${
                          isRejected
                            ? 'border-red-100 bg-red-50/10 opacity-60 cursor-not-allowed'
                            : isSelected
                              ? 'border-primary bg-blue-50/20 ring-1 ring-primary cursor-pointer'
                              : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 cursor-pointer'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-12 h-10 bg-white border border-slate-200 rounded overflow-hidden flex items-center justify-center shrink-0 shadow-sm">
                            <img src={c.imageUrl} alt="" className="object-contain w-full h-full" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-[10px] font-bold text-slate-800 truncate">
                              {c.width}x{c.height}
                            </div>
                            <div className="text-[9px] text-slate-400 truncate">{c.clickUrl}</div>
                          </div>
                        </div>

                        <div className="mt-2 flex items-center justify-between">
                          <span
                            className={`text-[9px] font-bold uppercase ${
                              isRejected
                                ? 'text-red-500'
                                : c.reviewStatus === 'pending'
                                  ? 'text-amber-500'
                                  : 'text-green-600'
                            }`}
                          >
                            {isRejected
                              ? 'Hafnað'
                              : c.reviewStatus === 'pending'
                                ? 'Í yfirferð'
                                : 'Samþykkt'}
                          </span>

                          {!isRejected && isSelected && (
                            <div className="w-4 h-4 bg-primary text-white rounded-full flex items-center justify-center">
                              <Check size={10} strokeWidth={3} />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {(!advertiserCreatives || advertiserCreatives.length === 0) && (
                    <div className="col-span-2 text-center py-6 text-xs text-slate-400 font-medium font-sans">
                      Engar auglýsingar fundust í safninu þínu. Búðu til auglýsingu fyrst.
                    </div>
                  )}
                </div>
                {editCreativeIds.length === 0 && (
                  <p className="text-[10px] font-bold text-red-600 flex items-center gap-1 font-sans">
                    <AlertCircle size={12} className="shrink-0" />
                    <span>Verður að velja að minnsta kosti eina auglýsingu.</span>
                  </p>
                )}
              </div>

              {/* Budget targeting */}
              <div className="space-y-1">
                <Input
                  label="Fjárhagsáætlun (ISK) *"
                  type="number"
                  min="5000"
                  step="5000"
                  value={editTotalBudget}
                  onChange={(e) => setEditTotalBudget(Number(e.target.value) || 0)}
                  required
                />
                {editTotalBudget < spent && (
                  <p className="text-[11px] font-bold text-red-600 flex items-center gap-1 mt-1 font-sans">
                    <AlertCircle size={12} className="shrink-0" />
                    <span>
                      Má ekki vera lægri en upphæðin sem hefur verið eytt ({formatIsk(spent)}).
                    </span>
                  </p>
                )}
              </div>

              {editError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs font-semibold text-red-600 flex items-center gap-1.5 font-sans">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{editError}</span>
                </div>
              )}

              <div className="flex gap-3 justify-end pt-4 border-t border-slate-100">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setIsEditModalOpen(false)}
                  disabled={updating}
                  className="text-xs"
                >
                  Hætta við
                </Button>
                <Button
                  type="submit"
                  loading={updating}
                  disabled={
                    editTotalBudget < spent ||
                    editCategories.length === 0 ||
                    editCreativeIds.length === 0 ||
                    !editName ||
                    !editStartsAt
                  }
                  className="text-xs font-bold"
                >
                  Vista breytingar
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {isExtendModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <Card className="max-w-md w-full bg-white shadow-2xl overflow-hidden p-6 space-y-5 my-8">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Framlengja herferð</h3>
              <button
                onClick={() => setIsExtendModalOpen(false)}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-sm text-slate-600">
              Eftirstöðvar upp á {campaign.budget.remainingIsk.toLocaleString('is-IS')} kr. verða
              frátaknar á ný og birtingar hefjast strax.
            </p>

            <form onSubmit={handleExtend} className="space-y-4">
              <label className="block">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Nýr lokadagur
                </span>
                <input
                  type="date"
                  required
                  min={new Date(Date.now() + 24 * 3600 * 1000).toISOString().split('T')[0]}
                  value={extendEndsAt}
                  onChange={(e) => setExtendEndsAt(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>

              {extendError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs font-medium text-red-600">
                  {extendError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <Button
                  variant="ghost"
                  onClick={() => setIsExtendModalOpen(false)}
                  type="button"
                  className="text-xs"
                >
                  Hætta við
                </Button>
                <Button
                  variant="primary"
                  type="submit"
                  loading={extendCampaignMutation.isPending}
                  className="text-xs font-bold"
                >
                  Framlengja
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
