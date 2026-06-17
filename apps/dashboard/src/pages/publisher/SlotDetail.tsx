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

const CATEGORY_PREVIEWS: Record<
  string,
  { title: string; desc: string; img: string; action: string }
> = {
  matur: {
    title: 'Nýbakað og yndislegt',
    desc: 'Pantaðu ljúffengar veitingar beint heim að dyrum. Fljótleg og bragðgóð heimsending.',
    img: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=600&auto=format&fit=crop&q=60',
    action: 'Panta núna',
  },
  taekni: {
    title: 'Snjallari framtíð',
    desc: 'Uppgötvaðu nýjustu græjurnar og tæknilausnirnar sem einfalda daglega lífið og vinnuna.',
    img: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=600&auto=format&fit=crop&q=60',
    action: 'Sjá meira',
  },
  lifsstill: {
    title: 'Þinn persónulegi stíll',
    desc: 'Nýjasta tískan, hönnunin og lífsstílsinnblásturinn. Gæði og stíll í fyrirrúmi.',
    img: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?w=600&auto=format&fit=crop&q=60',
    action: 'Skoða vörur',
  },
  ferdalog: {
    title: 'Upplifðu Ísland',
    desc: 'Bókaðu ógleymanlegar ferðir um stórbrotna náttúru Íslands. Ævintýrið bíður þín!',
    img: 'https://images.unsplash.com/photo-1504829857797-ddff28127792?w=600&auto=format&fit=crop&q=60',
    action: 'Bóka ferð',
  },
};

export default function SlotDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: slot, isLoading, isError, refetch } = usePublisherSlot(id);
  const { data: slotStats } = useSlotStats(id);
  const [copied, setCopied] = useState(false);
  const [previewCategory, setPreviewCategory] = useState<string>('matur');
  const [simulationDetails, setSimulationDetails] = useState<{
    ts: number;
    sig: string;
    creativeId: string;
    targetUrl: string;
  } | null>(null);

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

      {/* Live Preview and Test Sandbox */}
      {(() => {
        const mainSize = slot.sizes[0] || { width: 300, height: 250 };
        const isHorizontal = mainSize.width >= 500;
        const selectedPreview = CATEGORY_PREVIEWS[previewCategory] || CATEGORY_PREVIEWS.matur!;

        return (
          <Card className="p-6 space-y-6">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-xl">auto_awesome</span>
                Lifandi forskoðun og prófunarsandkassi
              </h3>
              <p className="text-xs text-slate-400 font-semibold mt-1">
                Sjáðu hvernig auglýsingar munu líta út á þínum vef. Veldu flokk til að prófa
                mismunandi efni.
              </p>
            </div>

            {/* Category selector */}
            <div className="flex flex-wrap gap-2">
              {Object.entries(CATEGORY_PREVIEWS).map(([key]) => {
                const active = previewCategory === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setPreviewCategory(key);
                      setSimulationDetails(null);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border cursor-pointer ${
                      active
                        ? 'bg-primary border-primary text-white shadow-sm'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {key === 'matur'
                      ? 'Matarhorn'
                      : key === 'taekni'
                        ? 'Tækni'
                        : key === 'lifsstill'
                          ? 'Lífsstíll'
                          : 'Ferðalög'}
                  </button>
                );
              })}
            </div>

            {/* Live Slot Container Mock */}
            <div className="flex flex-col items-center justify-center p-6 bg-slate-50 rounded-2xl border border-slate-200 border-dashed">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-3">
                Eftirlíking ({mainSize.width} × {mainSize.height} px)
              </p>
              <div
                className="bg-white rounded-xl shadow-md border border-slate-100 overflow-hidden relative group cursor-pointer select-none transition hover:shadow-lg"
                style={{
                  width: '100%',
                  maxWidth: `${mainSize.width}px`,
                  aspectRatio: `${mainSize.width} / ${mainSize.height}`,
                }}
                onClick={() => {
                  const randHex = () => Math.floor(Math.random() * 16).toString(16);
                  const mockSig = Array.from({ length: 32 }, randHex).join('');
                  setSimulationDetails({
                    ts: Date.now(),
                    sig: mockSig,
                    creativeId: `cre_mock_${previewCategory}_${slot.id.substring(4, 10)}`,
                    targetUrl:
                      previewCategory === 'matur'
                        ? 'https://birtingur.app/matur'
                        : previewCategory === 'taekni'
                          ? 'https://birtingur.app/taekni'
                          : previewCategory === 'lifsstill'
                            ? 'https://birtingur.app/lifsstill'
                            : 'https://birtingur.app/island',
                  });
                }}
              >
                {/* Banner Layout */}
                <div className={`w-full h-full flex ${isHorizontal ? 'flex-row' : 'flex-col'}`}>
                  {/* Image panel */}
                  <div
                    className={`${isHorizontal ? 'w-2/5 h-full' : 'w-full h-3/5'} bg-slate-100 relative overflow-hidden`}
                  >
                    <img
                      src={selectedPreview.img}
                      alt="Mock Ad"
                      className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-500"
                    />
                  </div>
                  {/* Content panel */}
                  <div
                    className={`flex-1 p-3 flex flex-col justify-between min-w-0 ${
                      isHorizontal ? 'max-w-[60%]' : 'w-full'
                    }`}
                  >
                    <div className="space-y-1">
                      <span className="text-[9px] font-extrabold uppercase tracking-widest text-primary bg-primary-container/20 px-1.5 py-0.5 rounded">
                        Kynning
                      </span>
                      <h4
                        className={`font-bold text-slate-900 ${isHorizontal ? 'text-sm' : 'text-xs'} leading-tight truncate`}
                      >
                        {selectedPreview.title}
                      </h4>
                      {mainSize.height >= 150 && (
                        <p className="text-[10px] text-slate-500 font-semibold leading-relaxed line-clamp-2">
                          {selectedPreview.desc}
                        </p>
                      )}
                    </div>
                    <div className="flex justify-between items-center mt-2">
                      <span className="text-[9px] text-slate-400 font-medium">birtingur.is</span>
                      <span className="px-3 py-1 bg-primary text-white text-[10px] font-bold rounded-lg group-hover:bg-primary-dim transition-colors">
                        {selectedPreview.action}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/5 transition-colors duration-200"></div>
              </div>
            </div>

            {/* Simulation Output Dashboard */}
            {simulationDetails && (
              <div className="p-5 bg-slate-900 rounded-2xl border border-slate-950 text-slate-100 font-mono text-[11px] leading-relaxed relative animate-fadeIn">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSimulationDetails(null);
                  }}
                  className="absolute top-3 right-3 text-slate-400 hover:text-white p-1 hover:bg-slate-800 rounded transition cursor-pointer border-none bg-transparent"
                >
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
                <div className="flex items-center gap-2 text-emerald-400 font-bold mb-3">
                  <span className="material-symbols-outlined text-[16px] animate-pulse">
                    check_circle
                  </span>
                  <span>[HERMUNA-MÆLING] Smellur skráður og rekjað undirritaður!</span>
                </div>
                <div className="space-y-1.5 text-slate-300">
                  <p>
                    <span className="text-sky-400">Atburður:</span> CLICK_EVENT
                  </p>
                  <p>
                    <span className="text-sky-400">Tímaspjald:</span>{' '}
                    {new Date(simulationDetails.ts).toLocaleTimeString('is-IS')} (ts:{' '}
                    {simulationDetails.ts})
                  </p>
                  <p>
                    <span className="text-sky-400">Creative ID:</span>{' '}
                    {simulationDetails.creativeId}
                  </p>
                  <p>
                    <span className="text-sky-400">Slot ID:</span> {slot.id}
                  </p>
                  <p>
                    <span className="text-sky-400">Undirskrift:</span> {simulationDetails.sig}
                  </p>
                  <p className="truncate">
                    <span className="text-sky-400">Slóð:</span> {simulationDetails.targetUrl}
                    ?utm_source=birtingur&utm_medium=display&utm_campaign=mock&utm_content={slot.id}
                  </p>
                </div>
              </div>
            )}
          </Card>
        );
      })()}

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
