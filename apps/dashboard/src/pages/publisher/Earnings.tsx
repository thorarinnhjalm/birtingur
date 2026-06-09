import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { formatIsk } from '@/lib/format';
import { Banknote, TrendingUp, Calendar } from 'lucide-react';
import { DEFAULT_PLATFORM_FEE_PERCENT, type Payout } from '@ada/shared';

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

export default function Earnings() {
  const { data: stats, isLoading: isStatsLoading } = useQuery<StatsResponse>({
    queryKey: ['publisher', 'stats'],
    queryFn: () => apiFetch<StatsResponse>('/v1/publishers/me/stats?timeframe=30'),
  });

  const { data: payouts, isLoading: isPayoutsLoading } = useQuery<Payout[]>({
    queryKey: ['publisher', 'payouts'],
    queryFn: () => apiFetch<Payout[]>('/v1/publishers/me/payouts'),
  });

  if (isStatsLoading || isPayoutsLoading) return <LoadingState />;

  const earningsTotal = stats?.spendIsk || 0;
  const netEarningsTotal = Math.round(earningsTotal * (1 - DEFAULT_PLATFORM_FEE_PERCENT / 100));

  // Calculate next payout date (1st of next month)
  const now = new Date();
  const nextPayoutDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextPayoutLabel = nextPayoutDate.toLocaleDateString('is-IS', {
    day: 'numeric',
    month: 'long',
  });

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Tekjur og uppgjör</h1>
        <p className="text-slate-500 text-sm font-medium mt-1">
          Hér sérðu sundurliðun á tekjum þínum og stöðu útborgana.
        </p>
      </div>

      {/* Stats and Balance cards */}
      <div className="grid sm:grid-cols-2 gap-6">
        <Card className="p-5 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Samansafnaðar tekjur (síðustu 30 daga)
            </span>
            <span className="block text-3xl font-extrabold text-slate-900">
              {formatIsk(netEarningsTotal)}
            </span>
          </div>
          <div className="p-3 bg-sky-50 text-sky-600 rounded-xl shrink-0">
            <TrendingUp size={24} />
          </div>
        </Card>

        <Card className="p-5 flex items-center justify-between bg-linear-to-br from-slate-900 to-slate-950 text-white border-none">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Áætluð næsta útborgun ({nextPayoutLabel})
            </span>
            <span className="block text-3xl font-extrabold">
              {formatIsk(netEarningsTotal >= 5000 ? netEarningsTotal : 0)}
            </span>
            <span className="text-[10px] text-slate-450 block font-semibold">
              {netEarningsTotal < 5000
                ? 'Lágmarksútborgun (5.000 kr) hefur ekki verið náð'
                : 'Greiðist sjálfkrafa'}
            </span>
          </div>
          <div className="p-3 bg-white/10 text-white rounded-xl shrink-0">
            <Banknote size={24} />
          </div>
        </Card>
      </div>

      {/* Payout History */}
      <Card className="p-6 space-y-4">
        <h3 className="text-base font-bold text-slate-900">Saga útborgana</h3>

        {!payouts || payouts.length === 0 ? (
          <EmptyState
            icon={<Calendar size={36} className="text-slate-400" />}
            title="Engar útborganir enn"
            description="Þegar þú nærð lágmarksútborgun (5.000 kr.) verður sjálfkrafa stofnuð útborgun sem birtist hér."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-medium border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 font-semibold uppercase tracking-wider">
                  <th className="py-2.5">Tímabil</th>
                  <th className="py-2.5">Auðkenni</th>
                  <th className="py-2.5">Staða</th>
                  <th className="py-2.5 text-right">Brúttó</th>
                  <th className="py-2.5 text-right">Þóknun</th>
                  <th className="py-2.5 text-right">Útborgun</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {payouts.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/50">
                    <td className="py-3 font-semibold text-slate-900">
                      {new Date(p.periodStart).toLocaleDateString('is-IS', {
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="py-3 text-slate-400 font-mono truncate max-w-[120px]">{p.id}</td>
                    <td className="py-3">
                      <Badge
                        variant={
                          p.status === 'completed'
                            ? 'success'
                            : p.status === 'pending'
                              ? 'pending'
                              : 'neutral'
                        }
                      >
                        {p.status === 'completed'
                          ? 'Lokið'
                          : p.status === 'pending'
                            ? 'Í bið'
                            : p.status}
                      </Badge>
                    </td>
                    <td className="py-3 text-right text-slate-600">{formatIsk(p.grossIsk)}</td>
                    <td className="py-3 text-right text-slate-400">
                      −{formatIsk(p.platformFeeIsk)}
                    </td>
                    <td className="py-3 text-right font-bold text-slate-900">
                      {formatIsk(p.netIsk)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
