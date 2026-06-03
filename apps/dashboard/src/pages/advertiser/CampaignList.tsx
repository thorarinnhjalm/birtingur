import { useNavigate } from 'react-router-dom';
import { useCampaigns } from '@/hooks/useCampaigns';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatIsk } from '@/lib/format';
import { Megaphone, Plus, Calendar } from 'lucide-react';

export default function CampaignList() {
  const navigate = useNavigate();
  const { data: campaigns, isLoading, refetch } = useCampaigns();

  if (isLoading) return <LoadingState />;

  if (!campaigns || campaigns.length === 0) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-slate-900">Mínar herferðir</h1>
        </div>
        <EmptyState
          icon={<Megaphone size={44} />}
          title="Engar herferðir fundust"
          description="Þú hefur ekki stofnað neina auglýsingaherferð ennþá. Stofnaðu nýja herferð til að birta á íslenskum vefjum."
          action={
            <Button onClick={() => navigate('/advertiser/campaigns/new')} className="font-bold">
              <Plus size={16} className="mr-1" />
              Stofna herferð
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Mínar herferðir</h1>
          <p className="text-slate-500 text-sm font-medium mt-1">
            Sjáðu yfirlit og árangur allra herferða þinna.
          </p>
        </div>
        <Button
          onClick={() => navigate('/advertiser/campaigns/new')}
          className="font-bold gap-1 text-sm py-2.5"
        >
          <Plus size={16} />
          <span>Stofna herferð</span>
        </Button>
      </div>

      <div className="grid gap-4">
        {campaigns.map((c) => {
          const spent = c.budget.totalIsk - c.budget.remainingIsk;
          const pct = Math.min(100, Math.round((spent / c.budget.totalIsk) * 100)) || 0;

          return (
            <Card
              key={c.id}
              className="cursor-pointer hover:border-primary border-2 border-transparent transition-all duration-200 p-6 flex flex-col md:flex-row md:items-center justify-between gap-6"
              onClick={() => navigate(`/advertiser/campaigns/${c.id}`)}
            >
              <div className="space-y-2 flex-1 min-w-0">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-bold text-slate-900 truncate">Herferð {c.id}</h3>
                  <Badge
                    variant={
                      c.status === 'active'
                        ? 'success'
                        : c.status === 'pending_approval'
                          ? 'pending'
                          : 'neutral'
                    }
                  >
                    {c.status === 'active'
                      ? 'Virk'
                      : c.status === 'pending_approval'
                        ? 'Í yfirferð'
                        : c.status}
                  </Badge>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 font-semibold">
                  <div className="flex items-center gap-1">
                    <Calendar size={14} />
                    <span>
                      {new Date(c.schedule.startsAt).toLocaleDateString('is-IS')} -{' '}
                      {c.schedule.endsAt
                        ? new Date(c.schedule.endsAt).toLocaleDateString('is-IS')
                        : 'ótakmarkað'}
                    </span>
                  </div>
                  <div>·</div>
                  <div>{c.targeting.slotIds.length} auglýsingapláss valin</div>
                </div>
              </div>

              {/* Progress & Budget column */}
              <div className="w-full md:w-64 space-y-2 shrink-0">
                <div className="flex justify-between text-xs font-bold text-slate-500">
                  <span>Nýtt af fjárhagsáætlun:</span>
                  <span>{pct}%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-primary h-2 rounded-full transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs font-semibold text-slate-700">
                  <span>Eytt: {formatIsk(spent)}</span>
                  <span>Heildar: {formatIsk(c.budget.totalIsk)}</span>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
