import { useNavigate } from 'react-router-dom';
import { usePublisherSlots } from '@/hooks/usePublisher';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatIsk } from '@/lib/format';
import { Grid3x3, Plus, ArrowRight } from 'lucide-react';

export default function SlotList() {
  const navigate = useNavigate();
  const { data: slots, isLoading, refetch } = usePublisherSlots();

  if (isLoading) return <LoadingState />;

  if (!slots || slots.length === 0) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-slate-900">Mín auglýsingapláss</h1>
        </div>
        <EmptyState
          icon={<Grid3x3 size={44} />}
          title="Engin auglýsingapláss fundust"
          description="Búðu til þitt fyrsta pláss til að geta fellt það inn á vefsíðuna þína og byrjað að fá greitt."
          action={
            <Button onClick={() => navigate('/publisher/slots/new')} className="font-bold">
              <Plus size={16} className="mr-1" />
              Búa til pláss
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Mín auglýsingapláss</h1>
          <p className="text-slate-500 text-sm font-medium mt-1">
            Stjórnaðu og skoðaðu samþættingarkóða fyrir plássin þín.
          </p>
        </div>
        <Button
          onClick={() => navigate('/publisher/slots/new')}
          className="font-bold text-sm py-2.5 gap-1"
        >
          <Plus size={16} />
          <span>Búa til pláss</span>
        </Button>
      </div>

      <div className="grid gap-4">
        {slots.map((s) => (
          <Card
            key={s.id}
            className="cursor-pointer hover:border-sky-600 border-2 border-transparent transition-all duration-200 p-6 flex justify-between items-center"
            onClick={() => navigate(`/publisher/slots/${s.id}`)}
          >
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-bold text-slate-900">{s.name}</h3>
                <Badge variant={s.status === 'active' ? 'success' : 'neutral'}>
                  {s.status === 'active' ? 'Virkt' : 'Óvirkt'}
                </Badge>
              </div>
              <div className="text-xs text-slate-500 font-semibold space-y-0.5">
                <p>Auðkenni: {s.id}</p>
                <p>Stærðir: {s.sizes.map((sz) => `${sz.width}×${sz.height}`).join(', ')}</p>
              </div>
            </div>

            <div className="flex items-center gap-6 text-right">
              <div>
                <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Verðlagning
                </span>
                <span className="text-lg font-extrabold text-slate-900">
                  {formatIsk(s.pricing.mode === 'cpm' ? s.pricing.cpmIsk : s.pricing.slotPriceIsk)}
                </span>
                <span className="text-[10px] text-slate-500 block font-bold">
                  {s.pricing.mode === 'cpm' ? 'fyrir 1.000 birtingar' : `fyrir ${s.pricing.slotPeriodDays} daga`}
                </span>
              </div>
              <ArrowRight size={18} className="text-slate-400" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
