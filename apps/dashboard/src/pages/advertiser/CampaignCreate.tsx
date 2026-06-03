import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreateCampaign } from '@/hooks/useCampaigns';
import { useSearchSlots } from '@/hooks/usePublisher';
import { useWallet } from '@/hooks/useWallet';
import { apiFetch } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { LoadingState } from '@/components/ui/LoadingState';
import { formatIsk } from '@/lib/format';
import { AlertTriangle, ShieldCheck, Upload, Link, Check, AlertCircle } from 'lucide-react';
import type { Slot, Creative } from '@ada/shared';

export default function CampaignCreate() {
  const navigate = useNavigate();
  const walletQuery = useWallet();
  const slotsQuery = useSearchSlots();
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

  // Step 3: Slots
  const [selectedSlotIds, setSelectedSlotIds] = useState<string[]>([]);
  const [sizeFilter, setSizeFilter] = useState('');

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

  // Toggle Slot Selection
  const toggleSlot = (slotId: string) => {
    setSelectedSlotIds((prev) =>
      prev.includes(slotId) ? prev.filter((id) => id !== slotId) : [...prev, slotId]
    );
  };

  // Filtered Slots
  const filteredSlots = slotsQuery.data?.filter((s) => {
    const matchesSize = sizeFilter ? s.sizes.some(sz => `${sz.width}x${sz.height}` === sizeFilter) : true;
    return matchesSize;
  }) || [];

  // Get distinct sizes from all available slots
  const allSizes = Array.from(
    new Set(
      slotsQuery.data?.flatMap((s) => s.sizes.map((sz) => `${sz.width}x${sz.height}`)) || []
    )
  );

  // Submit entire Campaign
  const handleFinalSubmit = async () => {
    if (!creative) return;
    setError(null);
    setSubmitting(true);
    try {
      await createCampaignMutation.mutateAsync({
        name,
        startDate: new Date(startDate).toISOString(),
        endDate: endDate ? new Date(endDate).toISOString() : new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
        totalBudgetIsk: totalBudget,
        clickUrl,
        creativeUrl: creative.imageUrl,
        slotIds: selectedSlotIds,
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
            <div className="bg-primary h-1 rounded-full transition-all" style={{ width: `${(step / 4) * 100}%` }} />
          </div>
          <span className="text-xs font-bold text-slate-500 shrink-0">Skref {step} af 4</span>
        </div>
      </div>

      <Card className="p-6">
        {/* Step 1: Basics */}
        {step === 1 && (
          <div className="space-y-5">
            <h3 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-3">Herferðarupplýsingar</h3>
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
            
            <div className="space-y-2">
              <span className="block text-sm font-medium text-slate-700">Tegund birtingar</span>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setBudgetMode('cpm_capped')}
                  className={`p-4 rounded-lg border text-left cursor-pointer transition-all ${
                    budgetMode === 'cpm_capped'
                      ? 'border-primary bg-blue-50/50 ring-1 ring-primary'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <span className="block font-bold text-sm text-slate-900">CPM Birtingar (Greiða fyrir áhorf)</span>
                  <span className="block text-xs text-slate-500 mt-1 font-medium leading-relaxed">
                    Þú greiðir tiltekna upphæð á hverjar 1.000 birtingar uns hámarki er náð.
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setBudgetMode('slot_purchased')}
                  className={`p-4 rounded-lg border text-left cursor-pointer transition-all ${
                    budgetMode === 'slot_purchased'
                      ? 'border-primary bg-blue-50/50 ring-1 ring-primary'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <span className="block font-bold text-sm text-slate-900">Fast plásskaup (Flat rate)</span>
                  <span className="block text-xs text-slate-500 mt-1 font-medium leading-relaxed">
                    Keyptu tiltekið pláss alveg á föstu verði í ákveðinn tíma.
                  </span>
                </button>
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
              <Button variant="ghost" onClick={() => navigate('/advertiser')}>Hætta við</Button>
              <Button disabled={!name || !startDate} onClick={() => setStep(2)}>Næsta skref →</Button>
            </div>
          </div>
        )}

        {/* Step 2: Creative */}
        {step === 2 && (
          <div className="space-y-5">
            <h3 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-3">Auglýsingaefni</h3>
            
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
                  <p>{imageWidth} × {imageHeight} dílar</p>
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
              <Button variant="ghost" onClick={() => setStep(1)}>Til baka</Button>
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

        {/* Step 3: Slot Selection */}
        {step === 3 && (
          <div className="space-y-5">
            <h3 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-3">Veldu auglýsingapláss</h3>
            
            <div className="flex gap-3">
              <div className="flex-1">
                <select
                  value={sizeFilter}
                  onChange={(e) => setSizeFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none"
                >
                  <option value="">Allar stærðir</option>
                  {allSizes.map((sz) => (
                    <option key={sz} value={sz}>{sz}</option>
                  ))}
                </select>
              </div>
            </div>

            {slotsQuery.isLoading ? (
              <LoadingState />
            ) : filteredSlots.length === 0 ? (
              <div className="p-8 text-center text-slate-500 border border-slate-200 border-dashed rounded-lg text-sm font-medium">
                Engin auglýsingapláss fundust sem passa við síuna.
              </div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {filteredSlots.map((s) => {
                  const isChecked = selectedSlotIds.includes(s.id);
                  const isSizeMatch = s.sizes.some(
                    (sz) => sz.width === imageWidth && sz.height === imageHeight
                  );

                  return (
                    <div
                      key={s.id}
                      onClick={() => toggleSlot(s.id)}
                      className={`p-4 border rounded-lg flex items-center justify-between cursor-pointer transition-all ${
                        isChecked
                          ? 'border-primary bg-blue-50/20'
                          : 'border-slate-200 hover:bg-slate-50'
                      } ${!isSizeMatch ? 'opacity-50' : ''}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${
                          isChecked ? 'bg-primary border-primary text-white' : 'border-slate-300 bg-white'
                        }`}>
                          {isChecked && <Check size={14} />}
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                            <span>{s.name}</span>
                            {!isSizeMatch && (
                              <Badge variant="neutral">Stærð passar ekki</Badge>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 font-semibold mt-1">
                            Snið: {s.sizes.map((sz) => `${sz.width}×${sz.height}`).join(', ')} · Verð: {s.pricing.mode === 'cpm' ? `${formatIsk(s.pricing.cpmIsk)} CPM` : `${formatIsk(s.pricing.slotPriceIsk)} pr. tímabil`}
                          </div>
                        </div>
                      </div>
                      <div className="text-sm font-bold text-slate-950">
                        {s.pricing.mode === 'cpm' ? formatIsk(s.pricing.cpmIsk) : formatIsk(s.pricing.slotPriceIsk)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs font-semibold text-red-600">
                {error}
              </div>
            )}

            <div className="flex justify-between border-t border-slate-100 pt-5 mt-6">
              <Button variant="ghost" onClick={() => setStep(2)}>Til baka</Button>
              <Button disabled={selectedSlotIds.length === 0} onClick={() => setStep(4)}>Næsta skref (Yfirlit) →</Button>
            </div>
          </div>
        )}

        {/* Step 4: Review & Confirm */}
        {step === 4 && (
          <div className="space-y-6">
            <h3 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-3">Staðfesta og senda</h3>

            {/* Campaign Summary grid */}
            <div className="bg-slate-50 rounded-lg p-5 border border-slate-200/60 text-sm space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="block text-slate-500 font-medium text-xs">Heiti herferðar:</span>
                  <span className="font-bold text-slate-950 text-sm">{name}</span>
                </div>
                <div>
                  <span className="block text-slate-500 font-medium text-xs">Tegund og áætlun:</span>
                  <span className="font-bold text-slate-950 text-sm">{formatIsk(totalBudget)} ({budgetMode === 'cpm_capped' ? 'CPM' : 'Fast verð'})</span>
                </div>
                <div>
                  <span className="block text-slate-500 font-medium text-xs">Upphaf:</span>
                  <span className="font-bold text-slate-950 text-sm">{new Date(startDate).toLocaleDateString('is-IS')}</span>
                </div>
                <div>
                  <span className="block text-slate-500 font-medium text-xs">Lokadagur:</span>
                  <span className="font-bold text-slate-950 text-sm">{endDate ? new Date(endDate).toLocaleDateString('is-IS') : 'ótakmarkað'}</span>
                </div>
              </div>

              <div className="border-t border-slate-200/80 pt-3">
                <span className="block text-slate-500 font-medium text-xs mb-1">Vefir og pláss valin ({selectedSlotIds.length}):</span>
                <span className="font-semibold text-slate-800 text-xs">
                  {selectedSlotIds.map(id => slotsQuery.data?.find(s => s.id === id)?.name || id).join(', ')}
                </span>
              </div>
            </div>

            {/* Wallet checks */}
            {isInsufficientFunds ? (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex gap-3 text-sm text-amber-800 font-medium leading-relaxed">
                <AlertTriangle size={20} className="shrink-0 text-amber-600" />
                <div className="space-y-2">
                  <p>
                    <strong>Ónóg inneign í veski!</strong> Inneign þín ({formatIsk(walletBalance)}) dugar ekki fyrir áætluðum herferðarkostnaði ({formatIsk(totalBudget)}).
                  </p>
                  <p className="text-xs text-amber-700">
                    Þú getur samt sem áður stofnað herferðina, en hún mun verða í biðstöðu uns þú bætir við inneign.
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex gap-3 text-sm text-green-800 font-medium">
                <ShieldCheck size={20} className="shrink-0 text-green-600" />
                <p>
                  <strong>Inneign staðfest!</strong> Veskið þitt inniheldur nægilegt fjármagn ({formatIsk(walletBalance)}) til að keyra þessa herferð.
                </p>
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs font-semibold text-red-600">
                {error}
              </div>
            )}

            <div className="flex justify-between border-t border-slate-100 pt-5 mt-6">
              <Button variant="ghost" onClick={() => setStep(3)}>Til baka</Button>
              <Button
                loading={submitting}
                className="font-bold"
                onClick={handleFinalSubmit}
              >
                Stofna og senda í yfirferð
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
