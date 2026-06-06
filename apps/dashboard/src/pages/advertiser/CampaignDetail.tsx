import { useParams, useNavigate } from 'react-router-dom';
import {
  useCampaign,
  useCampaignStats,
  useUpdateCampaign,
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
import { apiFetch } from '@/lib/api';
import { AD_CATEGORIES, type Creative } from '@ada/shared';
import { Input } from '@/components/ui/Input';
import { useQuery } from '@tanstack/react-query';

export default function CampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: campaign, isLoading, isError, refetch } = useCampaign(id);
  const { data: stats, isLoading: isStatsLoading } = useCampaignStats(id);

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
  const [editRegion, setEditRegion] = useState<'all' | 'capital' | 'countryside'>('all');
  const [editTotalBudget, setEditTotalBudget] = useState(0);
  const [editError, setEditError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

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
      const region = campaign.targeting.geoRegions?.[0] || 'all';
      setEditRegion(region as any);
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
          geoRegions: editRegion === 'all' ? [] : [editRegion],
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

          {campaign.status !== 'pending_approval' && (
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
          )}
        </div>
      </div>

      {toggleError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs font-medium text-red-600">
          {toggleError}
        </div>
      )}

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
        {isStatsLoading ? <LoadingState /> : <AnalyticsChart data={chartData} />}
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
        {/* Performance by Site */}
        <Card className="p-6 md:col-span-2 space-y-4">
          <h3 className="text-base font-bold text-slate-900">Frammistaða eftir flokkum</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-medium border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 font-semibold uppercase tracking-wider">
                  <th className="py-2.5">Flokkur</th>
                  <th className="py-2.5">Birtingar</th>
                  <th className="py-2.5">Smellir</th>
                  <th className="py-2.5">CTR</th>
                  <th className="py-2.5 text-right">Eytt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {campaign.targeting.categories.map((cat) => {
                  const label = AD_CATEGORIES.find((c) => c.slug === cat)?.label || cat;
                  return (
                    <tr key={cat} className="hover:bg-slate-50/50">
                      <td className="py-3 font-semibold text-slate-900">{label}</td>
                      <td className="py-3">0</td>
                      <td className="py-3">0</td>
                      <td className="py-3">0,0%</td>
                      <td className="py-3 text-right">0 kr</td>
                    </tr>
                  );
                })}
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
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 block">Landshlutamarkun</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { key: 'all', label: 'Allt land' },
                    { key: 'capital', label: 'Höfuðborgarsvæðið' },
                    { key: 'countryside', label: 'Landsbyggðin' },
                  ].map((region) => (
                    <div
                      key={region.key}
                      onClick={() => setEditRegion(region.key as any)}
                      className={`p-2.5 rounded-lg border cursor-pointer text-center select-none transition-all duration-150 ${
                        editRegion === region.key
                          ? 'border-primary bg-blue-50/20 ring-1 ring-primary font-bold text-slate-900 text-xs'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 font-semibold text-slate-600 text-xs'
                      }`}
                    >
                      {region.label}
                    </div>
                  ))}
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
                              <Check size={10} className="stroke-[3]" />
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
    </div>
  );
}
