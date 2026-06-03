import { useParams, useNavigate } from 'react-router-dom';
import { useCampaign, useCampaignStats, useCreative } from '@/hooks/useCampaigns';
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
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api';

export default function CampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: campaign, isLoading, isError, refetch } = useCampaign(id);
  const { data: stats, isLoading: isStatsLoading } = useCampaignStats(id);

  // Fetch corresponding creative details
  const creativeId = campaign?.creativeIds?.[0];
  const { data: creative } = useCreative(creativeId);

  const [toggling, setToggling] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);

  const [viewerKey, setViewerKey] = useState<string | null>(null);
  const [loadingKey, setLoadingKey] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);
  const [copiedStats, setCopiedStats] = useState(false);

  useEffect(() => {
    if (id) {
      setLoadingKey(true);
      apiFetch<{ key: string }>(`/v1/campaigns/${id}/widget-key`)
        .then((res) => setViewerKey(res.key))
        .catch((err) => console.error('Error fetching campaign widget key:', err))
        .finally(() => setLoadingKey(false));
    }
  }, [id]);

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
      await apiFetch(`/v1/campaigns/${campaign.id}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status: nextStatus }),
      });
      refetch();
    } catch (err: any) {
      setToggleError(err.message || 'Ekki tókst að breyta stöðu herferðar.');
    } finally {
      setToggling(false);
    }
  };

  const spent = campaign.budget.totalIsk - campaign.budget.remainingIsk;
  const pct = Math.min(100, Math.round((spent / campaign.budget.totalIsk) * 100)) || 0;

  // Chart data formatting: if no stats returned from endpoint, use empty list
  const chartData = stats || [];

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
              <h1 className="text-2xl font-bold text-slate-900">
                Herferð: {campaign.id.substring(0, 8)}
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
          <div className="text-2xl font-extrabold text-slate-900 mt-2">
            {campaign.targeting.slotIds.length} pláss
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
            Samþykki vefsíðna
          </div>
          <div className="space-y-1.5 mt-2.5">
            {Object.entries(campaign.perPublisherApproval).map(([pubId, status]) => (
              <div key={pubId} className="flex justify-between items-center text-xs">
                <span className="font-semibold text-slate-600">Útgefandi ({pubId}):</span>
                <Badge
                  variant={
                    status === 'approved' ? 'success' : status === 'pending' ? 'pending' : 'danger'
                  }
                >
                  {status}
                </Badge>
              </div>
            ))}
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
                {`<script src="https://cdn.adplatform.is/v1/widgets.js" defer></script>`}
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  navigator.clipboard.writeText(
                    '<script src="https://cdn.adplatform.is/v1/widgets.js" defer></script>',
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
          <h3 className="text-base font-bold text-slate-900">Frammistaða eftir vefjum</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-medium border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 font-semibold uppercase tracking-wider">
                  <th className="py-2.5">Auglýsingapláss</th>
                  <th className="py-2.5">Birtingar</th>
                  <th className="py-2.5">Smellir</th>
                  <th className="py-2.5">CTR</th>
                  <th className="py-2.5 text-right">Eytt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {campaign.targeting.slotIds.map((slotId) => (
                  <tr key={slotId} className="hover:bg-slate-50/50">
                    <td className="py-3 font-semibold text-slate-900">{slotId}</td>
                    <td className="py-3">0</td>
                    <td className="py-3">0</td>
                    <td className="py-3">0,0%</td>
                    <td className="py-3 text-right">0 kr</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Ad Preview */}
        <Card className="p-6 space-y-4">
          <h3 className="text-base font-bold text-slate-900">Auglýsingalayout</h3>
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-center space-y-3">
            <div className="mx-auto border border-slate-300 shadow-sm rounded overflow-hidden max-h-56 flex items-center justify-center bg-white">
              {creative?.imageUrl ? (
                <img src={creative.imageUrl} alt="Auglýsing" className="object-contain max-h-48" />
              ) : campaign.creativeIds && campaign.creativeIds[0] ? (
                <img
                  src={`https://picsum.photos/300/250`}
                  alt="Auglýsing"
                  className="object-contain max-h-48"
                />
              ) : (
                <div className="h-32 flex items-center justify-center text-slate-400">
                  Engin myndskrá
                </div>
              )}
            </div>

            <div className="text-xs text-left space-y-2 border-t border-slate-200 pt-3">
              <div>
                <span className="block text-slate-500 font-semibold">Tengill á vefsíðu:</span>
                <a
                  href={creative?.clickUrl || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary font-bold hover:underline inline-flex items-center gap-1 mt-0.5 truncate max-w-full"
                >
                  <span>{creative?.clickUrl || 'Engin slóð'}</span>
                  <ExternalLink size={12} className="shrink-0" />
                </a>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
