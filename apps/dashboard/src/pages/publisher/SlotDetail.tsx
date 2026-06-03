import { useParams, useNavigate } from 'react-router-dom';
import { usePublisherSlot } from '@/hooks/usePublisher';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { formatIsk } from '@/lib/format';
import { ArrowLeft, Copy, Check, Code, HelpCircle } from 'lucide-react';
import { useState } from 'react';

export default function SlotDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: slot, isLoading, isError, refetch } = usePublisherSlot(id);
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
  const snippetCode = `<!-- ADA Auglýsingapláss: ${slot.name} -->
<div class="ada-ad-slot" data-slot-id="${slot.id}"></div>
<script async src="https://cdn.adplatform.is/snippet.js"></script>`;

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

      <div className="grid md:grid-cols-3 gap-6">
        {/* Slot details */}
        <Card className="p-5 space-y-4">
          <h3 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2">Stillingar</h3>
          <div className="space-y-3 text-xs font-semibold text-slate-600">
            <div>
              <span className="block text-slate-400">Verðlagning:</span>
              <span className="text-sm font-extrabold text-slate-900">
                {formatIsk(slot.pricing.mode === 'cpm' ? slot.pricing.cpmIsk : slot.pricing.slotPriceIsk)} {slot.pricing.mode === 'cpm' ? 'CPM' : 'á viku'}
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
            HTML kóðinn vísar í áreiðanlegan CDN netþjón okkar. Þegar notandi heimsækir vefsíðu þína hleður skriftan sjálfkrafa viðeigandi auglýsingu úr okkar kerfi. Allar flettingar (birtingar) teljast sjálfkrafa til tekna í veskið þitt.
          </p>
        </div>
      </Card>
    </div>
  );
}
