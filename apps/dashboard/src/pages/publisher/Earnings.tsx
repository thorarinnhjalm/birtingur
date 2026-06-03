import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { LoadingState } from '@/components/ui/LoadingState';
import { Badge } from '@/components/ui/Badge';
import { formatIsk } from '@/lib/format';
import { Banknote, TrendingUp, Calendar, ArrowUpRight } from 'lucide-react';

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
  const { data: stats, isLoading } = useQuery<StatsResponse>({
    queryKey: ['publisher', 'stats'],
    queryFn: () => apiFetch<StatsResponse>('/v1/publishers/me/stats?timeframe=30'),
  });

  if (isLoading) return <LoadingState />;

  const earningsTotal = stats?.spendIsk || 0;

  // Mock payouts history for beautiful UX presentation
  const mockPayouts = [
    { id: 'pay_1', date: '2026-05-01', amount: 15400, bankRef: '1234-56-789012', status: 'completed' },
    { id: 'pay_2', date: '2026-04-01', amount: 8900, bankRef: '9876-54-321098', status: 'completed' },
  ];

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
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Samansafnaðar tekjur (síðustu 30 daga)</span>
            <span className="block text-3xl font-extrabold text-slate-900">{formatIsk(earningsTotal)}</span>
          </div>
          <div className="p-3 bg-sky-50 text-sky-600 rounded-xl shrink-0">
            <TrendingUp size={24} />
          </div>
        </Card>

        <Card className="p-5 flex items-center justify-between bg-linear-to-br from-slate-900 to-slate-950 text-white border-none">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Áætluð næsta útborgun (1. júlí)</span>
            <span className="block text-3xl font-extrabold">{formatIsk(earningsTotal >= 5000 ? earningsTotal : 0)}</span>
            <span className="text-[10px] text-slate-450 block font-semibold">
              {earningsTotal < 5000 ? 'Lágmarksútborgun (5.000 kr) hefur ekki verið náð' : 'Greiðist sjálfkrafa'}
            </span>
          </div>
          <div className="p-3 bg-white/10 text-white rounded-xl shrink-0">
            <Banknote size={24} />
          </div>
        </Card>
      </div>

      {/* Payout History */}
      <Card className="p-6 space-y-4">
        <h3 className="text-base font-bold text-slate-900">Saga útborgana (Payout History)</h3>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-medium border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-slate-400 font-semibold uppercase tracking-wider">
                <th className="py-2.5">Dagsetning</th>
                <th className="py-2.5">Auðkenni</th>
                <th className="py-2.5">Bankatilvísun</th>
                <th className="py-2.5">Staða</th>
                <th className="py-2.5 text-right">Upphæð</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {mockPayouts.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/50">
                  <td className="py-3 font-semibold text-slate-900">{new Date(p.date).toLocaleDateString('is-IS')}</td>
                  <td className="py-3 text-slate-400 font-mono">{p.id}</td>
                  <td className="py-3">{p.bankRef}</td>
                  <td className="py-3">
                    <Badge variant="success">Lokið</Badge>
                  </td>
                  <td className="py-3 text-right font-bold text-slate-900">{formatIsk(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
