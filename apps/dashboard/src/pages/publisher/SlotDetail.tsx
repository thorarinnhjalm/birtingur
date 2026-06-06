import { useParams, useNavigate } from 'react-router-dom';
import { usePublisherSlot } from '@/hooks/usePublisher';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { formatIsk } from '@/lib/format';
import {
  ArrowLeft,
  Copy,
  Check,
  Code,
  HelpCircle,
  Eye,
  MousePointerClick,
  Banknote,
} from 'lucide-react';
import { useState } from 'react';
import { useSlotStats } from '@/hooks/useSlotStats';
import { ResponsiveContainer, AreaChart, Area, Tooltip as RechartsTooltip } from 'recharts';

export default function SlotDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: slot, isLoading, isError, refetch } = usePublisherSlot(id);
  const { data: slotStats } = useSlotStats(id);
  const [copied, setCopied] = useState(false);

  if (isLoading) return <LoadingState />;
  if (isError || !slot) {
    return (
      <ErrorState
        message="Ekki tókst að sækja upplýsingar um auglýsingaplássið. Það gæti hafa verið eytt."
        onRetry={refetch}
      />
    );
  }

  // Generate JavaScript HTML Integration Code
  const snippetCode = `<!-- Birtingur Auglýsingapláss: ${slot.name} -->
<div data-adplatform-slot="${slot.id}"></div>
<script async src="https://cdn.birtingur.app/widget.js"></script>`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(snippetCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header and Back nav */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/publisher/slots')}
          className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-800 transition cursor-pointer"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900">{slot.name}</h1>
            <Badge variant={slot.status === 'active' ? 'success' : 'neutral'}>
              {slot.status === 'active' ? 'Virkt' : 'Stöðvað'}
            </Badge>
          </div>
          <p className="text-xs text-slate-400 font-semibold mt-1">Auðkenni plássins: {slot.id}</p>
        </div>
      </div>

      {/* Mælikvarðar (Stats Cards) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6 flex items-center gap-5 shadow-sm">
          <div className="w-12 h-12 bg-sky-50 text-sky-700 rounded-full flex items-center justify-center shrink-0">
            <Eye size={22} />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Birtingar
            </p>
            <p className="text-2xl font-bold text-slate-900 mt-0.5">
              {slotStats ? slotStats.impressions.toLocaleString('is-IS') : '0'}
            </p>
          </div>
        </Card>

        <Card className="p-6 flex items-center gap-5 shadow-sm">
          <div className="w-12 h-12 bg-green-50 text-green-700 rounded-full flex items-center justify-center shrink-0">
            <MousePointerClick size={22} />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Smellir</p>
            <p className="text-2xl font-bold text-slate-900 mt-0.5">
              {slotStats ? slotStats.clicks.toLocaleString('is-IS') : '0'}
            </p>
          </div>
        </Card>

        <Card className="p-6 flex items-center gap-5 shadow-sm">
          <div className="w-12 h-12 bg-purple-50 text-purple-700 rounded-full flex items-center justify-center shrink-0">
            <Banknote size={22} />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Áætlaðar tekjur
            </p>
            <p className="text-2xl font-bold text-slate-900 mt-0.5">
              {slotStats ? formatIsk(Math.round(slotStats.spendIsk * 0.8)) : '0 kr.'}
            </p>
          </div>
        </Card>
      </div>

      {/* History Chart Card */}
      <Card className="p-6 space-y-4">
        <h3 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2">
          Tekjusaga (síðustu 30 dagar)
        </h3>

        {!slotStats || slotStats.impressions === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center text-slate-400 gap-2">
            <span className="material-symbols-outlined text-3xl">insights</span>
            <p className="text-xs font-semibold">Engin gögn enn</p>
          </div>
        ) : (
          <div className="h-48 opacity-90">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={slotStats.history}
                margin={{ top: 10, right: 0, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="slotEarningsGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563eb" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#2563eb" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey={(h: any) => Math.round(h.spendIsk * 0.8)}
                  stroke="#2563eb"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#slotEarningsGradient)"
                />
                <RechartsTooltip
                  cursor={{ stroke: 'rgba(37, 99, 235, 0.1)', strokeWidth: 1 }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const val = payload[0]!.value as number;
                      const label = payload[0]!.payload.date;
                      let formattedDate = label;
                      try {
                        const parsed = new Date(label);
                        if (!isNaN(parsed.getTime())) {
                          formattedDate = parsed.toLocaleDateString('is-IS', {
                            day: '2-digit',
                            month: 'short',
                          });
                        }
                      } catch {}
                      return (
                        <div className="bg-slate-950/95 backdrop-blur text-white px-3.5 py-2 rounded-xl text-xs font-semibold shadow-xl border border-slate-800">
                          <p className="text-slate-400 font-medium mb-0.5">{formattedDate}</p>
                          <p className="text-sm font-bold text-sky-400">{formatIsk(val)}</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Slot details */}
        <Card className="p-5 space-y-4">
          <h3 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2">
            Stillingar
          </h3>
          <div className="space-y-3 text-xs font-semibold text-slate-600">
            <div>
              <span className="block text-slate-400">Verðlagning:</span>
              <span className="text-sm font-extrabold text-slate-900">
                {formatIsk(
                  slot.pricing.mode === 'cpm' ? slot.pricing.cpmIsk : slot.pricing.slotPriceIsk,
                )}{' '}
                {slot.pricing.mode === 'cpm' ? 'CPM' : `fyrir ${slot.pricing.slotPeriodDays} daga`}
              </span>
            </div>
            <div>
              <span className="block text-slate-400">Leyfðar stærðir:</span>
              <span className="text-slate-850 font-bold block mt-1">
                {slot.sizes.map((sz) => `${sz.width}×${sz.height} px`).join(', ')}
              </span>
            </div>
          </div>
        </Card>

        {/* Integration code builder */}
        <Card className="p-5 md:col-span-2 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
              <Code size={16} className="text-sky-600" />
              <span>Innfellingarkóði (Integration Snippet)</span>
            </h3>
            <button
              onClick={copyToClipboard}
              className="text-xs font-bold text-sky-600 hover:text-sky-700 flex items-center gap-1 cursor-pointer bg-sky-50 border border-sky-200 py-1.5 px-3 rounded-md transition hover:bg-sky-100"
            >
              {copied ? (
                <>
                  <Check size={14} className="text-green-600" />
                  <span className="text-green-600">Afritað!</span>
                </>
              ) : (
                <>
                  <Copy size={14} />
                  <span>Afrita kóða</span>
                </>
              )}
            </button>
          </div>

          <p className="text-xs text-slate-500 font-semibold leading-relaxed">
            Settu þennan kóða þar sem þú vilt að auglýsingin birtist á síðunni þinni.
          </p>

          <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg text-xs font-mono overflow-x-auto leading-relaxed border border-slate-950">
            <code>{snippetCode}</code>
          </pre>
        </Card>
      </div>

      {/* Quick Help Guide */}
      <Card className="bg-sky-50/20 border-sky-100 p-5 flex gap-4 text-xs font-semibold text-slate-600">
        <HelpCircle size={22} className="text-sky-600 shrink-0" />
        <div className="space-y-1">
          <h4 className="font-bold text-slate-900">Hvernig virkar samþættingin?</h4>
          <p className="leading-relaxed text-slate-500">
            HTML kóðinn vísar í áreiðanlegan CDN netþjón okkar. Þegar notandi heimsækir vefsíðu þína
            hleður skriftan sjálfkrafa viðeigandi auglýsingu úr okkar kerfi. Allar flettingar
            (birtingar) teljast sjálfkrafa til tekna í veskið þitt.
          </p>
        </div>
      </Card>
    </div>
  );
}
