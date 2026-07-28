import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreateCampaign } from '@/hooks/useCampaigns';
import { useCategoryInventory } from '@/hooks/useCategoryInventory';
import { useWallet } from '@/hooks/useWallet';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { LoadingState } from '@/components/ui/LoadingState';
import {
  Eyebrow,
  EditorialH1,
  NumberedSection,
  BigFigure,
  PillButton,
  StepIndicator,
} from '@/components/ui/editorial';
import { AlertTriangle, Upload, Check, AlertCircle, Info, Lock } from 'lucide-react';
import { AD_CATEGORIES, FLAT_CPM_ISK, VAT_RATE } from '@ada/shared';
import type { Creative } from '@ada/shared';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase';
import { CreativeGenerator } from '@/components/CreativeGenerator';

const REGION_LABELS: Record<string, string> = {
  all: 'Allt landið',
  capital: 'Höfuðborgarsvæðið',
  countryside: 'Landsbyggðin',
  reykjavik: 'Reykjavík',
  kopavogur: 'Kópavogur',
  hafnarfjordur: 'Hafnarfjörður',
  gardabaer: 'Garðabær',
  mosfellsbaer: 'Mosfellsbær',
  seltjarnarnes: 'Seltjarnarnes',
  akureyri: 'Akureyri',
  reykjanesbaer: 'Reykjanesbær',
  selfoss: 'Selfoss',
  akranes: 'Akranes',
  isafjordur: 'Ísafjörður',
  egilsstadir: 'Egilsstaðir',
  vestmannaeyjar: 'Vestmannaeyjar',
};

// Icelandic dot-grouped integer (no currency suffix — the buy-flow spec renders
// "kr."/"kr" as a separate, differently-styled span next to the numeral).
// Uses the same Intl grouping @ada/shared's formatIsk relies on internally.
function fmtNum(n: number): string {
  return Math.round(n).toLocaleString('is-IS', { maximumFractionDigits: 0 });
}

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

  // Step 2: Creative
  const [clickUrl, setClickUrl] = useState('https://');
  const [imageUrl, setImageUrl] = useState('');
  const [ocrTextHint, setOcrTextHint] = useState('');
  const [imageWidth, setImageWidth] = useState(300);
  const [imageHeight, setImageHeight] = useState(250);
  const [creative, setCreative] = useState<Creative | null>(null);
  const [scanning, setScanning] = useState(false);
  const [selectedFile, setSelectedFile] = useState<any>(null);
  // Toggle between the manual upload path (unchanged) and the AI-generated
  // banner flow ("Á ég enga borða?") — both end at the same setCreative +
  // setStep(3) hand-off into step 3.
  const [creativeMode, setCreativeMode] = useState<'upload' | 'generate'>('upload');

  // Step 3: Categories & Region
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedRegions, setSelectedRegions] = useState<string[]>(['all']);

  const toggleRegion = (slug: string) => {
    if (slug === 'all') {
      setSelectedRegions(['all']);
      return;
    }
    setSelectedRegions((prev) => {
      const withoutAll = prev.filter((r) => r !== 'all');
      if (withoutAll.includes(slug)) {
        const next = withoutAll.filter((r) => r !== slug);
        return next.length === 0 ? ['all'] : next;
      } else {
        return [...withoutAll, slug];
      }
    });
  };

  // Handle local image file load for sizing
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setError('Skrá er of stór (hámark 2 MB)');
      return;
    }

    setError(null);
    setSelectedFile(file);
    const objectUrl = window.URL.createObjectURL(file);
    setImageUrl(objectUrl);

    // Create preview
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        setImageWidth(img.width);
        setImageHeight(img.height);
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

    if (!selectedFile) {
      setError('Vinsamlegast veldu mynd til að hlaða upp');
      return;
    }

    const advertiserId = walletQuery.data?.advertiserId;
    if (!advertiserId) {
      setError('Prófíll auglýsanda fannst ekki. Vinsamlegast reyndu aftur.');
      return;
    }

    setScanning(true);
    try {
      // 1. Upload file to Firebase Storage
      const fileExt = selectedFile.name.split('.').pop() || 'png';
      const filename = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
      const storageRef = ref(storage, `creatives/${advertiserId}/${filename}`);
      const snapshot = await uploadBytes(storageRef, selectedFile);
      const downloadUrl = await getDownloadURL(snapshot.ref);

      // 2. Submit creative to API with the uploaded image's URL
      const res = await apiFetch<Creative>('/v1/creatives', {
        method: 'POST',
        body: JSON.stringify({
          imageUrl: downloadUrl,
          width: imageWidth,
          height: imageHeight,
          clickUrl,
          ocrTextHint: ocrTextHint || undefined,
        }),
      });
      setCreative(res);
      setStep(3);
    } catch (err: any) {
      setError(err.message || 'Ekki tókst að hlaða upp eða skrá auglýsingaefnið.');
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
        geoRegions: selectedRegions.includes('all') ? undefined : selectedRegions,
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

  // Live forecast — math per the buy-flow spec's renderVals(): flat CPM, 30-day
  // flight, 24% VAT. Uses the shared constants instead of the spec's magic numbers.
  const totalImpressions = Math.round((totalBudget / FLAT_CPM_ISK) * 1000);
  const perDayImpressions = Math.round(totalImpressions / 30);
  const vsk = Math.round(totalBudget * VAT_RATE);
  const grandTotal = totalBudget + vsk;
  const walletSufficient = walletBalance >= grandTotal;
  const topUpNeeded = Math.max(0, grandTotal - walletBalance);
  const selectedDailyInventory = selectedCategories.reduce((sum, slug) => {
    const forecast = categoriesInventoryQuery.data?.find((f) => f.category === slug);
    return sum + (forecast?.availableDailyImpressions ?? 0);
  }, 0);

  // Soft oversell warning: campaign needs more daily impressions than the selected
  // categories have available. Informational only — submission is never blocked.
  const deliveryWarning = (() => {
    if (selectedCategories.length === 0 || !startDate) return null;
    const startMs = new Date(startDate).getTime();
    const endMs = endDate ? new Date(endDate).getTime() : startMs + 30 * 24 * 3600 * 1000; // mirrors the 30-day default used on submit
    const flightDays = Math.max(1, Math.ceil((endMs - Math.max(startMs, Date.now())) / 86_400_000));
    const neededDaily = Math.round(((totalBudget / FLAT_CPM_ISK) * 1000) / flightDays);
    const availableDaily = selectedDailyInventory;
    if (neededDaily <= availableDaily) return null;
    return { neededDaily, availableDaily };
  })();

  const stepLabels = ['Grunnur', 'Efni', 'Kaup'];

  return (
    // Nested inside the advertiser AppShell (Sidebar + TopBar are already
    // rendered by the router) — the buy-flow spec's own full-viewport header
    // strip is intentionally not reproduced here to avoid a duplicate chrome
    // bar; "Hætta við" is preserved as the ghost button on step 1 instead.
    <div className="max-w-[760px] mx-auto pb-[110px]">
      <Eyebrow>Ný herferð</Eyebrow>
      <div className="mt-4">
        <EditorialH1>Stofna herferð</EditorialH1>
      </div>
      <StepIndicator steps={stepLabels} current={step - 1} />

      {error && (
        <div className="mt-8 p-3 bg-red-50 border border-red-200 rounded-lg text-xs font-semibold text-red-600 flex items-center gap-2">
          <AlertCircle size={14} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Step 1: Basics — not covered by the buy-flow spec (name/dates are
            required before a creative can be scanned), kept functional and
            restyled to the same editorial rhythm. */}
      {step === 1 && (
        <section style={{ marginTop: 'clamp(48px,6vw,72px)' }}>
          <h2 className="m-0 text-2xl font-extrabold tracking-[-0.02em]">Herferðarupplýsingar</h2>
          <div className="mt-6 space-y-5">
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

            <div className="p-4 bg-white border border-slate-200 rounded-xl flex items-start gap-3">
              <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-slate-800">
                  Greiðslukerfi: Flöt CPM birting
                </h4>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  Birtingar eru verðlagðar samkvæmt flötu gjaldskrá kerfisins á{' '}
                  <strong>{fmtNum(FLAT_CPM_ISK)} kr. pr. 1.000 birtingar</strong> (CPM). Greitt er
                  úr veskinu þínu í rauntíma eftir því sem auglýsingar birtast.
                </p>
              </div>
            </div>
          </div>

          <div className="flex justify-between border-t border-slate-200 pt-5 mt-8">
            <Button variant="ghost" onClick={() => navigate('/advertiser')}>
              Hætta við
            </Button>
            <Button disabled={!name || !startDate} onClick={() => setStep(2)}>
              Næsta skref →
            </Button>
          </div>
        </section>
      )}

      {/* Step 2: Creative — not covered by the buy-flow spec, kept functional
            and restyled to the same editorial rhythm. */}
      {step === 2 && (
        <section style={{ marginTop: 'clamp(48px,6vw,72px)' }}>
          <h2 className="m-0 text-2xl font-extrabold tracking-[-0.02em]">Auglýsingaefni</h2>

          <div className="mt-5 flex flex-wrap gap-2">
            <PillButton
              active={creativeMode === 'upload'}
              onClick={() => setCreativeMode('upload')}
            >
              Hlaða upp sjálf(ur)
            </PillButton>
            <PillButton
              active={creativeMode === 'generate'}
              onClick={() => setCreativeMode('generate')}
            >
              Á ég enga borða?
            </PillButton>
          </div>

          {creativeMode === 'upload' ? (
            <>
              <div className="mt-6 space-y-5">
                <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center hover:bg-white transition">
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
                  <div className="p-4 bg-white border border-slate-200 rounded-xl flex items-center gap-4">
                    <div className="w-16 h-16 bg-slate-100 rounded overflow-hidden flex items-center justify-center shrink-0">
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
              </div>

              <div className="flex justify-between border-t border-slate-200 pt-5 mt-8">
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
            </>
          ) : (
            <>
              <div className="mt-6">
                <CreativeGenerator
                  onComplete={(creatives) => {
                    // All IAB sizes were created as real Creatives (they're
                    // already in the library) — pick the one this flow's
                    // step 3 actually consumes as `creative`. 300x250 is the
                    // most common size; fall back to whatever came first.
                    const primary =
                      creatives.find((c) => c.width === 300 && c.height === 250) ?? creatives[0];
                    if (primary) {
                      setCreative(primary);
                      setStep(3);
                    }
                  }}
                />
              </div>
              <div className="flex justify-start border-t border-slate-200 pt-5 mt-8">
                <Button variant="ghost" onClick={() => setStep(1)}>
                  Til baka
                </Button>
              </div>
            </>
          )}
        </section>
      )}

      {/* Step 3: the buy flow proper — categories, budget, payment — laid out
            exactly per the spec as one continuous page of three numbered
            sections (01/02/03), ending in the submit CTA. */}
      {step === 3 && (
        <>
          <NumberedSection
            n="01"
            title="Veldu flokka"
            lede="Veldu efnisflokkana sem henta vörumerkinu. Við dreifum birtingunum á alla íslenska vefi í völdum flokkum."
          >
            {categoriesInventoryQuery.isLoading ? (
              <LoadingState />
            ) : (
              <div className="grid grid-cols-3 gap-3.5">
                {AD_CATEGORIES.map((cat) => {
                  const isSelected = selectedCategories.includes(cat.slug);
                  const forecast = categoriesInventoryQuery.data?.find(
                    (f) => f.category === cat.slug,
                  );
                  const availableDaily = forecast?.availableDailyImpressions ?? 0;

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
                      className="relative border-[1.5px] border-slate-200 bg-white rounded-[14px] px-[22px] py-5 cursor-pointer flex flex-col gap-2 transition-colors select-none"
                    >
                      {isSelected && (
                        <span className="absolute inset-[-1.5px] border-[1.5px] border-primary rounded-[14px] bg-primary/6 pointer-events-none" />
                      )}
                      <div className="relative flex justify-between items-center gap-2.5">
                        <span className="text-base font-bold text-slate-900">{cat.label}</span>
                        {isSelected && (
                          <span className="w-5 h-5 rounded-full bg-primary text-white text-xs flex items-center justify-center shrink-0">
                            ✓
                          </span>
                        )}
                      </div>
                      <span className="relative text-[13px] text-slate-500">
                        ~{fmtNum(availableDaily)} á dag í boði
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Region targeting — not covered by the buy-flow spec, kept
                  functional and restyled to fit the section. */}
            <div className="mt-8 pt-6 border-t border-slate-200">
              <h4 className="text-sm font-bold text-slate-900">Landshlutamarkun (Valfrjálst)</h4>
              <p className="text-xs text-slate-500 font-medium mt-1.5">
                Sýndu auglýsinguna aðeins notendum á ákveðnum landsvæðum. Sjálfgefið er allt landið.
              </p>
              <div className="grid grid-cols-3 gap-3 mt-4">
                {(
                  [
                    { key: 'all', label: '🌐 Allt landið' },
                    { key: 'capital', label: 'Höfuðborgarsvæðið' },
                    { key: 'countryside', label: 'Landsbyggðin' },
                  ] as const
                ).map((region) => (
                  <div
                    key={region.key}
                    onClick={() => toggleRegion(region.key)}
                    className={`p-3.5 rounded-xl border cursor-pointer text-center select-none transition-colors text-xs ${
                      selectedRegions.includes(region.key)
                        ? 'border-primary bg-primary/6 font-bold text-slate-900'
                        : 'border-slate-200 bg-white font-semibold text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {region.label}
                  </div>
                ))}
              </div>

              <div className="pt-4 mt-4 space-y-2">
                <label className="block text-xs font-bold text-slate-700">
                  Eða velja ákveðna bæi / bæjarfélög:
                </label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {[
                    { key: 'reykjavik', label: 'Reykjavík' },
                    { key: 'kopavogur', label: 'Kópavogur' },
                    { key: 'hafnarfjordur', label: 'Hafnarfjörður' },
                    { key: 'gardabaer', label: 'Garðabær' },
                    { key: 'mosfellsbaer', label: 'Mosfellsbær' },
                    { key: 'seltjarnarnes', label: 'Seltjarnarnes' },
                    { key: 'akureyri', label: 'Akureyri' },
                    { key: 'reykjanesbaer', label: 'Reykjanesbær' },
                    { key: 'selfoss', label: 'Selfoss' },
                    { key: 'akranes', label: 'Akranes' },
                    { key: 'isafjordur', label: 'Ísafjörður' },
                    { key: 'egilsstadir', label: 'Egilsstaðir' },
                    { key: 'vestmannaeyjar', label: 'Vestmannaeyjar' },
                  ].map((city) => {
                    const isChecked = selectedRegions.includes(city.key);
                    return (
                      <div
                        key={city.key}
                        onClick={() => toggleRegion(city.key)}
                        className={`p-2.5 rounded-lg border cursor-pointer transition-colors flex items-center justify-between select-none ${
                          isChecked
                            ? 'border-primary bg-primary/6'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <span className="font-bold text-slate-800 text-[11px]">{city.label}</span>
                        {isChecked && <Check size={12} className="text-primary" />}
                      </div>
                    );
                  })}
                </div>
                {!selectedRegions.includes('all') && (
                  <div className="p-3 bg-primary/4 border border-primary/20 rounded-xl mt-3 flex items-start gap-2">
                    <Info size={14} className="text-primary shrink-0 mt-0.5" />
                    <p className="text-[11px] text-slate-600 font-semibold leading-relaxed">
                      Valin svæði:{' '}
                      <span className="text-primary font-bold">
                        {selectedRegions.map((r) => REGION_LABELS[r] || r).join(', ')}
                      </span>
                    </p>
                  </div>
                )}
              </div>
            </div>
          </NumberedSection>

          <NumberedSection
            n="02"
            title="Fjárhæð"
            lede="Þú borgar aldrei meira. Herferðin stöðvast sjálfkrafa þegar fjárhæðinni er náð."
          >
            <BigFigure value={fmtNum(totalBudget)} suffix="kr." />
            <input
              type="range"
              min={10000}
              max={500000}
              step={5000}
              value={totalBudget}
              onChange={(e) => setTotalBudget(Number(e.target.value))}
              className="w-full mt-8 h-1 cursor-pointer accent-primary"
            />
            <div className="flex justify-between text-xs text-slate-400 mt-2.5 tabular-nums">
              <span>10.000 kr.</span>
              <span>500.000 kr.</span>
            </div>
            <div className="flex flex-wrap gap-2.5 mt-6">
              <PillButton active={totalBudget === 25000} onClick={() => setTotalBudget(25000)}>
                25.000 kr.
              </PillButton>
              <PillButton active={totalBudget === 50000} onClick={() => setTotalBudget(50000)}>
                50.000 kr.
              </PillButton>
              <PillButton active={totalBudget === 100000} onClick={() => setTotalBudget(100000)}>
                100.000 kr.
              </PillButton>
              <PillButton active={totalBudget === 200000} onClick={() => setTotalBudget(200000)}>
                200.000 kr.
              </PillButton>
            </div>

            <div className="mt-[34px] bg-[#f1f5fd] border border-[#dbe4f7] rounded-[18px] px-8 py-[30px]">
              <Eyebrow>Áætluð birting</Eyebrow>
              <div className="flex items-baseline gap-3.5 mt-3">
                <span
                  className="font-extrabold text-primary tabular-nums leading-none tracking-tight"
                  style={{ fontSize: 'clamp(36px,6vw,50px)' }}
                >
                  {fmtNum(perDayImpressions)}
                </span>
                <span className="text-base text-slate-700 font-medium">birtingar á dag</span>
              </div>
              <p className="mt-3.5 text-slate-600 text-sm leading-[1.55]">
                ≈ {fmtNum(totalImpressions)} birtingar alls yfir ~30 daga, reiknað á föstu{' '}
                <strong className="text-primary font-bold">{fmtNum(FLAT_CPM_ISK)} kr. CPM</strong>{' '}
                verði.
              </p>
              {selectedCategories.length > 0 && (
                <div className="mt-[18px] pt-[18px] border-t border-[#dbe4f7] text-sm text-slate-600">
                  Laust pláss í {selectedCategories.length} völdum flokkum:{' '}
                  <strong className="text-slate-900 font-bold tabular-nums">
                    ~{fmtNum(selectedDailyInventory)}
                  </strong>{' '}
                  birtingar á dag.
                </div>
              )}
            </div>

            {deliveryWarning && (
              <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs font-semibold text-amber-700 flex items-start gap-2">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <span>
                  Herferðin gæti afhent hægar en áætlað — valdir flokkar hafa um{' '}
                  {fmtNum(deliveryWarning.availableDaily)} lausar birtingar á dag en herferðin þarf
                  um {fmtNum(deliveryWarning.neededDaily)}.
                </span>
              </div>
            )}
          </NumberedSection>

          <NumberedSection
            n="03"
            title="Greiðsla"
            lede="Fjárhæðin er sótt af inneigninni í veskinu þínu. Þú fyllir á veskið með korti í gegnum Teya ef inneign vantar."
          >
            {/* Campaign summary — not in the spec, kept so the advertiser can
                  review name/dates/region before paying. */}
            {selectedCategories.length > 0 && (
              <div className="mb-6 bg-white border border-slate-200 rounded-[14px] px-[22px] py-5 text-sm space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="block text-xs font-semibold text-slate-500">
                      Heiti herferðar
                    </span>
                    <span className="font-bold text-slate-900">{name}</span>
                  </div>
                  <div>
                    <span className="block text-xs font-semibold text-slate-500">Upphaf</span>
                    <span className="font-bold text-slate-900">
                      {startDate ? new Date(startDate).toLocaleDateString('is-IS') : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="block text-xs font-semibold text-slate-500">Lokadagur</span>
                    <span className="font-bold text-slate-900">
                      {endDate ? new Date(endDate).toLocaleDateString('is-IS') : 'ótakmarkað'}
                    </span>
                  </div>
                  <div>
                    <span className="block text-xs font-semibold text-slate-500">Landshlutar</span>
                    <span className="font-bold text-slate-900">
                      {selectedRegions.map((r) => REGION_LABELS[r] || r).join(', ')}
                    </span>
                  </div>
                </div>
                <div className="pt-3 border-t border-slate-200">
                  <span className="block text-xs font-semibold text-slate-500 mb-1">
                    Valdir flokkar ({selectedCategories.length})
                  </span>
                  <span className="font-semibold text-slate-800 text-sm">
                    {selectedCategories
                      .map((slug) => AD_CATEGORIES.find((c) => c.slug === slug)?.label || slug)
                      .join(', ')}
                  </span>
                </div>
              </div>
            )}

            <div className="bg-background border border-slate-200 rounded-[14px] px-[22px] py-5 flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-400">
                  Núverandi inneign í veskinu þínu
                </div>
                <div className="text-[22px] font-extrabold text-slate-900 tracking-[-0.02em] mt-1.5 tabular-nums">
                  {fmtNum(walletBalance)} kr.
                </div>
              </div>
              {walletSufficient ? (
                <span className="text-sm text-slate-900 font-semibold">
                  Nóg inneign — engin áfylling þarf
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => navigate('/advertiser/topup')}
                  className="text-sm text-primary font-semibold bg-transparent border-0 p-0 cursor-pointer underline underline-offset-2"
                >
                  Vantar {fmtNum(topUpNeeded)} kr. — fylltu fyrst á veskið
                </button>
              )}
            </div>

            <div className="mt-[26px] flex flex-col gap-[15px]">
              <div className="flex justify-between items-center">
                <span className="text-[15px] text-slate-600">Fjárhæð herferðar</span>
                <span className="text-[15px] text-slate-900 tabular-nums">
                  {fmtNum(totalBudget)} kr.
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[15px] text-slate-600">
                  VSK ({Math.round(VAT_RATE * 100)}%)
                </span>
                <span className="text-[15px] text-slate-900 tabular-nums">{fmtNum(vsk)} kr.</span>
              </div>
              <div className="h-px bg-slate-200 my-0.5" />
              <div className="flex justify-between items-baseline">
                <span className="text-[17px] font-bold text-slate-900">Samtals</span>
                <span className="text-2xl font-extrabold text-slate-900 tracking-[-0.02em] tabular-nums">
                  {fmtNum(grandTotal)} kr.
                </span>
              </div>
            </div>

            <div className="mt-[30px]">
              {walletSufficient ? (
                <Button
                  className="w-full h-[52px]"
                  loading={submitting}
                  disabled={selectedCategories.length === 0}
                  onClick={handleFinalSubmit}
                >
                  Hefja birtingu af inneign
                </Button>
              ) : (
                <Button className="w-full h-[52px]" onClick={() => navigate('/advertiser/topup')}>
                  Fylla fyrst á veskið
                </Button>
              )}
            </div>
            <p className="flex items-center gap-2 justify-center mt-5 text-[13px] text-slate-500 text-center leading-normal">
              <Lock size={17} className="text-primary shrink-0" />
              Örugg greiðsla í gegnum Teya · VSK-reikningur aðgengilegur í Greiðslum · stöðvaðu
              hvenær sem er
            </p>

            <div className="flex justify-start border-t border-slate-200 pt-5 mt-8">
              <Button variant="ghost" onClick={() => setStep(2)}>
                Til baka
              </Button>
            </div>
          </NumberedSection>
        </>
      )}
    </div>
  );
}
