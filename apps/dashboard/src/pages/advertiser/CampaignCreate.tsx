import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreateCampaign } from '@/hooks/useCampaigns';
import { useCategoryInventory } from '@/hooks/useCategoryInventory';
import { useWallet } from '@/hooks/useWallet';
import { apiFetch } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { LoadingState } from '@/components/ui/LoadingState';
import { formatIsk } from '@/lib/format';
import {
  AlertTriangle,
  ShieldCheck,
  Upload,
  Check,
  AlertCircle,
  Info,
  Sparkles,
} from 'lucide-react';
import { AD_CATEGORIES } from '@ada/shared';
import type { Creative } from '@ada/shared';

export default function CampaignCreate() {
  const navigate = useNavigate();
  const walletQuery = useWallet();
  const categoriesInventoryQuery = useCategoryInventory();
  const createCampaignMutation = useCreateCampaign();

  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form States
  // Step 1: Basics
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [totalBudget, setTotalBudget] = useState(20000);
  const [budgetMode, setBudgetMode] = useState<'cpm_capped' | 'slot_purchased'>('cpm_capped');

  // Step 2: Creative
  const [clickUrl, setClickUrl] = useState('https://');
  const [imageUrl, setImageUrl] = useState('https://picsum.photos/300/250');
  const [ocrTextHint, setOcrTextHint] = useState('');
  const [imageWidth, setImageWidth] = useState(300);
  const [imageHeight, setImageHeight] = useState(250);
  const [creative, setCreative] = useState<Creative | null>(null);
  const [scanning, setScanning] = useState(false);

  // Step 3: Categories
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  // Handle local image file load for sizing
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setError('Skrá er of stór (hámark 2 MB)');
      return;
    }

    setError(null);

    // Create preview
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        setImageWidth(img.width);
        setImageHeight(img.height);
        // In fully hosted offline environment we can use picsum or mock server images
        setImageUrl(`https://picsum.photos/${img.width}/${img.height}`);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Submit and scan creative at Step 2
  const runCreativeScan = async () => {
    setError(null);
    if (!clickUrl.startsWith('https://')) {
      setError('Slóð verður að hefjast á https://');
      return;
    }

    setScanning(true);
    try {
      const res = await apiFetch<{ creative: Creative }>('/v1/creatives', {
        method: 'POST',
        body: JSON.stringify({
          imageUrl,
          width: imageWidth,
          height: imageHeight,
          clickUrl,
          ocrTextHint: ocrTextHint || undefined,
        }),
      });
      setCreative(res.creative);
      setStep(3);
    } catch (err: any) {
      setError(err.message || 'Ekki tókst að skanna eða skrá auglýsingaefnið.');
    } finally {
      setScanning(false);
    }
  };

  // Submit entire Campaign
  const handleFinalSubmit = async () => {
    if (!creative) return;
    setError(null);
    setSubmitting(true);
    try {
      await createCampaignMutation.mutateAsync({
        name,
        creativeIds: [creative.id],
        categories: selectedCategories,
        schedule: {
          startsAt: new Date(startDate).toISOString(),
          endsAt: endDate
            ? new Date(endDate).toISOString()
            : new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
        },
        budget: {
          mode: 'cpm_capped',
          totalIsk: totalBudget,
        },
      });
      navigate('/advertiser/campaigns');
    } catch (err: any) {
      setError(err.message || 'Ekki tókst að stofna herferð. Reyndu aftur.');
    } finally {
      setSubmitting(false);
    }
  };

  const walletBalance = walletQuery.data?.balanceIsk ?? 0;
  const isInsufficientFunds = walletBalance < totalBudget;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 font-sans">Ný auglýsingaherferð</h1>
        <div className="flex items-center gap-2 mt-2">
          <div className="flex-1 bg-slate-200 h-1 rounded-full overflow-hidden">
            <div
              className="bg-primary h-1 rounded-full transition-all"
              style={{ width: `${(step / 4) * 100}%` }}
            />
          </div>
          <span className="text-xs font-bold text-slate-500 shrink-0">Skref {step} af 4</span>
        </div>
      </div>

      <Card className="p-6">
        {/* Step 1: Basics */}
        {step === 1 && (
          <div className="space-y-5">
            <h3 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-3">
              Herferðarupplýsingar
            </h3>
            <Input
              label="Heiti herferðar *"
              placeholder="Dæmi: Sumarútsala 2026"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Byrjar þann *"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
              <Input
                label="Endar þann"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>

            <div className="p-4 bg-slate-50/50 border border-slate-200 rounded-xl flex items-start gap-3">
              <Info className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-slate-800">
                  Greiðslukerfi: Flöt CPM birting
                </h4>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  Birtingar eru verðlagðar samkvæmt flötu gjaldskrá kerfisins á{' '}
                  <strong>550 kr. pr. 1.000 birtingar</strong> (CPM). Greitt er úr veskinu þínu í
                  rauntíma eftir því sem auglýsingar birtast.
                </p>
              </div>
            </div>

            <Input
              label="Fjárhagsáætlun (ISK) *"
              type="number"
              min="5000"
              step="5000"
              value={totalBudget}
              onChange={(e) => setTotalBudget(Number(e.target.value) || 0)}
              required
            />

            <div className="flex justify-between border-t border-slate-100 pt-5 mt-6">
              <Button variant="ghost" onClick={() => navigate('/advertiser')}>
                Hætta við
              </Button>
              <Button disabled={!name || !startDate} onClick={() => setStep(2)}>
                Næsta skref →
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Creative */}
        {step === 2 && (
          <div className="space-y-5">
            <h3 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-3">
              Auglýsingaefni
            </h3>

            <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center hover:bg-slate-50 transition">
              <Upload size={32} className="mx-auto text-slate-400 mb-2" />
              <p className="text-sm font-semibold text-slate-700">Hlaða upp myndskrá</p>
              <p className="text-xs text-slate-500 mt-1">PNG, JPG eða JPEG upp að 2 MB stærð</p>
              <input
                type="file"
                accept="image/png,image/jpeg,image/jpg"
                className="hidden"
                id="creative-file"
                onChange={handleFileChange}
              />
              <Button
                type="button"
                variant="secondary"
                className="mt-3 text-xs py-2 px-4"
                onClick={() => document.getElementById('creative-file')?.click()}
              >
                Velja skrá
              </Button>
            </div>

            {imageUrl && (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex items-center gap-4">
                <div className="w-16 h-16 bg-slate-200 rounded overflow-hidden flex items-center justify-center shrink-0">
                  <img src={imageUrl} alt="Preview" className="object-cover w-full h-full" />
                </div>
                <div className="text-xs text-slate-600 font-semibold space-y-0.5">
                  <p className="font-bold text-slate-900">Uppgötvaðar víddir:</p>
                  <p>
                    {imageWidth} × {imageHeight} dílar
                  </p>
                </div>
              </div>
            )}

            <Input
              label="Vefslóð smella (Click URL) *"
              type="url"
              placeholder="https://fyrirtæki.is/tilboð"
              value={clickUrl}
              onChange={(e) => setClickUrl(e.target.value)}
              required
            />

            <Input
              label="Textahjálp (OCR lýsing) - Valfrjálst"
              placeholder="Skrifaðu textann sem stendur á myndinni til öryggisskönnunar..."
              value={ocrTextHint}
              onChange={(e) => setOcrTextHint(e.target.value)}
            />

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs font-semibold text-red-600 flex items-center gap-2">
                <AlertCircle size={14} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex justify-between border-t border-slate-100 pt-5 mt-6">
              <Button variant="ghost" onClick={() => setStep(1)}>
                Til baka
              </Button>
              <Button
                loading={scanning}
                disabled={!clickUrl.startsWith('https://') || !imageUrl}
                onClick={runCreativeScan}
              >
                Skanna og halda áfram
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Category Targeting */}
        {step === 3 && (
          <div className="space-y-5">
            <h3 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-3">
              Veldu efnisflokka til að kaupa birtingar í *
            </h3>
            <p className="text-xs text-slate-500 font-medium">
              Herferðin þín verður birt á öllum útgefendasíðum sem tilheyra völdum flokkum.
            </p>

            {categoriesInventoryQuery.isLoading ? (
              <LoadingState />
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 pt-2">
                {AD_CATEGORIES.map((cat) => {
                  const isSelected = selectedCategories.includes(cat.slug);
                  const forecast = categoriesInventoryQuery.data?.find(
                    (f) => f.category === cat.slug,
                  );
                  const avgDaily = forecast?.avgDailyImpressions ?? 0;

                  return (
                    <div
                      key={cat.slug}
                      onClick={() => {
                        setSelectedCategories((prev) =>
                          prev.includes(cat.slug)
                            ? prev.filter((s) => s !== cat.slug)
                            : [...prev, cat.slug],
                        );
                      }}
                      className={`p-4 rounded-xl border cursor-pointer transition-all duration-200 flex flex-col justify-between select-none ${
                        isSelected
                          ? 'border-primary bg-blue-50/20 ring-1 ring-primary'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 text-xs">{cat.label}</span>
                        {isSelected && <Check size={14} className="text-primary animate-scaleIn" />}
                      </div>
                      <span className="text-[10px] text-slate-500 font-semibold mt-3">
                        Daglegt áætlað: {avgDaily.toLocaleString('is-IS')} áhorf
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Reach Forecast Panel */}
            {selectedCategories.length > 0 && !categoriesInventoryQuery.isLoading && (
              <div className="p-5 bg-linear-to-r from-blue-50/30 to-sky-50/30 border border-blue-100 rounded-xl space-y-4 shadow-sm">
                <h4 className="text-xs font-bold text-blue-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles size={14} className="text-primary animate-pulse" />
                  <span>Áætlað ná herferðar (Reach & Delivery Forecast)</span>
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white p-3.5 rounded-lg border border-blue-50/60 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                    <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      Daglegt áhorf í boði
                    </span>
                    <span className="block text-lg font-extrabold text-slate-900 mt-1">
                      {selectedCategories
                        .reduce((sum, slug) => {
                          const forecast = categoriesInventoryQuery.data?.find(
                            (f) => f.category === slug,
                          );
                          return sum + (forecast?.avgDailyImpressions ?? 0);
                        }, 0)
                        .toLocaleString('is-IS')}
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium">
                      Samanlagðar birtingar á dag
                    </span>
                  </div>

                  <div className="bg-white p-3.5 rounded-lg border border-blue-50/60 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                    <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      Áætlaðar heildarbirtingar
                    </span>
                    <span className="block text-lg font-extrabold text-slate-900 mt-1">
                      {Math.round((totalBudget / 550) * 1000).toLocaleString('is-IS')}
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium">
                      Miðað við 550 kr. flatt CPM verð
                    </span>
                  </div>

                  <div className="bg-white p-3.5 rounded-lg border border-blue-50/60 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                    <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      Áætlaður líftími herferðar
                    </span>
                    <span className="block text-lg font-extrabold text-slate-900 mt-1">
                      {(() => {
                        const totalDaily = selectedCategories.reduce((sum, slug) => {
                          const forecast = categoriesInventoryQuery.data?.find(
                            (f) => f.category === slug,
                          );
                          return sum + (forecast?.avgDailyImpressions ?? 0);
                        }, 0);
                        const totalCamp = Math.round((totalBudget / 550) * 1000);
                        return totalDaily > 0
                          ? `${(totalCamp / totalDaily).toFixed(1)} dagar`
                          : 'N/A';
                      })()}
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium">
                      Hversu hratt fjárhagsáætlun klárast
                    </span>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs font-semibold text-red-600">
                {error}
              </div>
            )}

            <div className="flex justify-between border-t border-slate-100 pt-5 mt-6">
              <Button variant="ghost" onClick={() => setStep(2)}>
                Til baka
              </Button>
              <Button disabled={selectedCategories.length === 0} onClick={() => setStep(4)}>
                Næsta skref (Yfirlit) →
              </Button>
            </div>
          </div>
        )}

        {/* Step 4: Review & Confirm */}
        {step === 4 && (
          <div className="space-y-6">
            <h3 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-3">
              Staðfesta og senda
            </h3>

            {/* Campaign Summary grid */}
            <div className="bg-slate-50 rounded-lg p-5 border border-slate-200/60 text-sm space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="block text-slate-500 font-medium text-xs">Heiti herferðar:</span>
                  <span className="font-bold text-slate-950 text-sm">{name}</span>
                </div>
                <div>
                  <span className="block text-slate-500 font-medium text-xs">
                    Tegund og áætlun:
                  </span>
                  <span className="font-bold text-slate-950 text-sm">
                    {formatIsk(totalBudget)} (CPM flöt verðlagning)
                  </span>
                </div>
                <div>
                  <span className="block text-slate-500 font-medium text-xs">Upphaf:</span>
                  <span className="font-bold text-slate-950 text-sm">
                    {new Date(startDate).toLocaleDateString('is-IS')}
                  </span>
                </div>
                <div>
                  <span className="block text-slate-500 font-medium text-xs">Lokadagur:</span>
                  <span className="font-bold text-slate-950 text-sm">
                    {endDate ? new Date(endDate).toLocaleDateString('is-IS') : 'ótakmarkað'}
                  </span>
                </div>
              </div>

              <div className="border-t border-slate-200/80 pt-3">
                <span className="block text-slate-500 font-medium text-xs mb-1">
                  Valdir flokkar herferðar ({selectedCategories.length}):
                </span>
                <span className="font-semibold text-slate-800 text-xs">
                  {selectedCategories
                    .map((slug) => AD_CATEGORIES.find((c) => c.slug === slug)?.label || slug)
                    .join(', ')}
                </span>
              </div>
            </div>

            {/* Wallet checks */}
            {isInsufficientFunds ? (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex gap-3 text-sm text-amber-800 font-medium leading-relaxed">
                <AlertTriangle size={20} className="shrink-0 text-amber-600" />
                <div className="space-y-2">
                  <p>
                    <strong>Ónóg inneign í veski!</strong> Inneign þín ({formatIsk(walletBalance)})
                    dugar ekki fyrir áætluðum herferðarkostnaði ({formatIsk(totalBudget)}).
                  </p>
                  <p className="text-xs text-amber-700">
                    Þú getur samt sem áður stofnað herferðina, en hún mun verða í biðstöðu uns þú
                    bætir við inneign.
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex gap-3 text-sm text-green-800 font-medium">
                <ShieldCheck size={20} className="shrink-0 text-green-600" />
                <p>
                  <strong>Inneign staðfest!</strong> Veskið þitt inniheldur nægilegt fjármagn (
                  {formatIsk(walletBalance)}) til að keyra þessa herferð.
                </p>
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs font-semibold text-red-600">
                {error}
              </div>
            )}

            <div className="flex justify-between border-t border-slate-100 pt-5 mt-6">
              <Button variant="ghost" onClick={() => setStep(3)}>
                Til baka
              </Button>
              <Button loading={submitting} className="font-bold" onClick={handleFinalSubmit}>
                Stofna og senda í yfirferð
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
