import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCreateCampaign } from '@/hooks/useCampaigns';
import { useCategoryInventory, useCombinedCategoryInventory } from '@/hooks/useCategoryInventory';
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
import { AD_CATEGORIES, FLAT_CPM_ISK, formatNumberIs } from '@ada/shared';
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
// Uses formatNumberIs — the same pure-string grouping formatIsk uses.
function fmtNum(n: number): string {
  return formatNumberIs(Math.round(n));
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

  // Step 3 (Efni): Creative
  const [clickUrl, setClickUrl] = useState('https://');
  const [imageUrl, setImageUrl] = useState('');
  const [ocrTextHint, setOcrTextHint] = useState('');
  const [imageWidth, setImageWidth] = useState(300);
  const [imageHeight, setImageHeight] = useState(250);
  const [creative, setCreative] = useState<Creative | null>(null);
  // B2 (adversarial review): EVERY creative produced for this campaign —
  // either every wizard-rendered size, or the single uploaded creative — so
  // handleFinalSubmit can submit all of them as `creativeIds`, not just the
  // one `creative` used as the step-4 preview thumbnail. Submitting only one
  // ID inverts the whole point of the size wizard: push-cache resolves
  // campaigns to slots by size match, so a campaign that only carries a
  // 300x250 creative never fills a 728x90 slot even though the wizard just
  // rendered one for it.
  const [creatives, setCreatives] = useState<Creative[]>([]);
  // Fix 3 (adversarial review): tracks creatives specifically from the
  // wizard (as opposed to the manual-upload path) so that navigating from
  // step 4 back to step 3 in "generate" mode can show a completed-state
  // panel instead of remounting a fresh CreativeGenerator — which would
  // reset all of its internal wizard state and force a full copy+render
  // redo (burning rate-limit slots and creating duplicate Creative docs).
  const [wizardCreatives, setWizardCreatives] = useState<Creative[]>([]);
  const [scanning, setScanning] = useState(false);
  const [selectedFile, setSelectedFile] = useState<any>(null);
  // Toggle between the AI-generated wizard ("Á ég enga borða?" — the primary
  // path per the creative-wizard reorder) and the manual upload path
  // ("Ég er með borða", kept as a visible alternative) — both end at the
  // same setCreative + setStep(4) hand-off into "Staðfesta".
  const [creativeMode, setCreativeMode] = useState<'upload' | 'generate'>('generate');

  // Step 2 (Kaup): Categories & Region
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  // Declared here, not with the other queries above: it takes selectedCategories
  // as an argument and const is in the temporal dead zone until this line.
  const combinedInventoryQuery = useCombinedCategoryInventory(selectedCategories);
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
      setCreatives([res]);
      setWizardCreatives([]); // manual upload replaces any prior wizard run
      setStep(4);
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
      // B2: submit every creative this campaign produced (all wizard-
      // rendered sizes, or the single upload), not just the `creative`
      // preview thumbnail — falls back to `[creative.id]` defensively in
      // case `creatives` is somehow still empty (it's always populated
      // alongside `creative` by both the upload and wizard paths above).
      const submittedCreativeIds =
        creatives.length > 0 ? creatives.map((c) => c.id) : [creative.id];
      await createCampaignMutation.mutateAsync({
        name,
        creativeIds: submittedCreativeIds,
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
      // The server gates on AVAILABLE balance (balance − committed to other
      // campaigns); its message is English and numeric. Translate the case
      // an Icelandic advertiser can actually act on.
      if (err?.code === 'INSUFFICIENT_FUNDS') {
        // Don't suggest pausing another campaign: paused campaigns still hold
        // their remaining budget (FUND_HOLDING_STATUSES includes 'paused'), so
        // topping up is the only action that actually frees room.
        setError(
          'Laus inneign nægir ekki fyrir herferðina — hluti inneignarinnar er frátekinn í aðrar virkar herferðir. Fylltu á veskið til að halda áfram.',
        );
      } else {
        setError(err.message || 'Ekki tókst að stofna herferð. Reyndu aftur.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const walletBalance = walletQuery.data?.balanceIsk ?? 0;
  const walletCommitted = walletQuery.data?.committedIsk ?? 0;
  // Funds committed to other active campaigns can't back a new one — the
  // server enforces this (INSUFFICIENT_FUNDS), so the UI must gate on the
  // same number or it promises money that isn't spendable.
  const walletAvailable = walletQuery.data?.availableIsk ?? walletBalance;

  // Live forecast — flat CPM over the REAL flight length. This divided by a
  // hardcoded 30 regardless of the dates chosen in step 1, while the oversell
  // warning below used the actual length — a 7-day, 20.000 kr campaign showed
  // "1.212 birtingar á dag" above a warning saying it needed 5.195. The same
  // day-count expression as that warning, deliberately: days left of flight,
  // counted from today when the start date is already past.
  const totalImpressions = Math.round((totalBudget / FLAT_CPM_ISK) * 1000);
  const flightDays = (() => {
    if (!startDate) return 30;
    const startMs = new Date(startDate).getTime();
    const endMs = endDate ? new Date(endDate).getTime() : startMs + 30 * 24 * 3600 * 1000; // mirrors the 30-day default used on submit
    return Math.max(1, Math.ceil((endMs - Math.max(startMs, Date.now())) / 86_400_000));
  })();
  const perDayImpressions = Math.round(totalImpressions / flightDays);
  // Gate on `totalBudget` — the same figure POST /v1/campaigns debits. The
  // server admits the campaign when available balance >= budget.totalIsk
  // (services/wallet.ts); an earlier over-strict gate on budget + 24% VAT
  // blocked an advertiser holding exactly enough money from buying at all
  // (fixed in PR #18).
  //
  // There is deliberately NO VSK line or budget+24% total on this screen any
  // more (owner decision 2026-08-12, see the blueprint's Product direction):
  // that figure was never debited and contradicted TopUp/FaqPage, which both
  // say the deposit is VAT-free agency credit with VAT applying only to the
  // platform fee at serving time. The FULL VSK treatment (this copy,
  // DISBURSE_VAT in payouts, Payday/Blikk invoicing) still waits on the
  // owner's accountant and must land as ONE coherent pass — do not add VAT
  // figures back here piecemeal; see docs/superpowers/follow-ups-2026-08-09.md.
  const walletSufficient = walletAvailable >= totalBudget;
  const topUpNeeded = Math.max(0, totalBudget - walletAvailable);
  // NOT a sum over the per-category figures. Each of those reports a
  // publisher's whole daily volume under every category it declares, so adding
  // them counts one publisher once per category it is in — a single
  // 1.000-impression publisher in two categories read as 2.000 here, and the
  // oversell warning below stayed silent for campaigns that could never be
  // delivered. The server deduplicates, where the publisher identities exist.
  // `undefined` while nothing has been fetched yet, NOT 0: a zero here reads as
  // "this selection has no inventory", fires the oversell warning below, and
  // then takes it back a second later. An unknown figure is shown as unknown.
  const selectedDailyInventory = combinedInventoryQuery.data?.availableDailyImpressions;

  // Soft oversell warning: campaign needs more daily impressions than the selected
  // categories have available. Informational only — submission is never blocked.
  const deliveryWarning = (() => {
    if (selectedCategories.length === 0 || !startDate) return null;
    // No warning until the inventory is actually known.
    if (selectedDailyInventory === undefined) return null;
    const neededDaily = Math.round(((totalBudget / FLAT_CPM_ISK) * 1000) / flightDays);
    const availableDaily = selectedDailyInventory;
    if (neededDaily <= availableDaily) return null;
    return { neededDaily, availableDaily };
  })();

  const stepLabels = ['Grunnur', 'Kaup', 'Efni', 'Staðfesta'];

  return (
    // Nested inside the advertiser AppShell (Sidebar + TopBar are already
    // rendered by the router) — the buy-flow spec's own full-viewport header
    // strip is intentionally not reproduced here to avoid a duplicate chrome
    // bar; "Hætta við" is preserved as the ghost button on step 1 instead.
    <div className="max-w-190 mx-auto pb-27.5">
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

      {/* Step 1: Grunnur — name/dates, not covered by the buy-flow spec (name/
            dates are required before targeting or a creative can be chosen),
            kept functional and restyled to the same editorial rhythm. */}
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
                  sjálfkrafa úr veskinu þínu eftir því sem auglýsingar birtast.
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

      {/* Step 2: Kaup — categories, geo, budget, forecast (moved up from the
            old step 3 per the creative-wizard reorder, docs/superpowers/plans/
            2026-07-27-creative-wizard-flow.md — categories must be chosen
            BEFORE creative work so the wizard's "Stærðir" step can show real
            per-category size forecasts). Existing hooks/mutations preserved
            verbatim; only position changes. */}
      {step === 2 && (
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
                      className="relative border-[1.5px] border-slate-200 bg-white rounded-[14px] px-5.5 py-5 cursor-pointer flex flex-col gap-2 transition-colors select-none"
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

            <div className="mt-8.5 bg-[#f1f5fd] border border-[#dbe4f7] rounded-[18px] px-8 py-7.5">
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
                ≈ {fmtNum(totalImpressions)} birtingar alls yfir ~{flightDays}{' '}
                {flightDays % 10 === 1 && flightDays % 100 !== 11 ? 'dag' : 'daga'}, reiknað á föstu{' '}
                <strong className="text-primary font-bold">{fmtNum(FLAT_CPM_ISK)} kr. CPM</strong>{' '}
                verði.
              </p>
              {selectedCategories.length > 0 && (
                <div className="mt-4.5 pt-4.5 border-t border-[#dbe4f7] text-sm text-slate-600">
                  Laust pláss í {selectedCategories.length} völdum flokkum:{' '}
                  <strong className="text-slate-900 font-bold tabular-nums">
                    {selectedDailyInventory === undefined
                      ? '…'
                      : `~${fmtNum(selectedDailyInventory)}`}
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

          <div className="flex justify-between border-t border-slate-200 pt-5 mt-8">
            <Button variant="ghost" onClick={() => setStep(1)}>
              Til baka
            </Button>
            <Button disabled={selectedCategories.length === 0} onClick={() => setStep(3)}>
              Næsta skref →
            </Button>
          </div>
        </>
      )}

      {/* Step 3: Efni — the creative wizard (primary path) plus the existing
            manual-upload path as a visible alternative ("Ég er með borða").
            Categories chosen in Kaup are handed to the wizard so its
            "Stærðir" step can show the real per-category size forecast. */}
      {step === 3 && (
        <section style={{ marginTop: 'clamp(48px,6vw,72px)' }}>
          <h2 className="m-0 text-2xl font-extrabold tracking-[-0.02em]">Auglýsingaefni</h2>

          <div className="mt-5 flex flex-wrap gap-2">
            <PillButton
              active={creativeMode === 'generate'}
              onClick={() => setCreativeMode('generate')}
            >
              Á ég enga borða?
            </PillButton>
            <PillButton
              active={creativeMode === 'upload'}
              onClick={() => setCreativeMode('upload')}
            >
              Ég er með borða
            </PillButton>
          </div>

          {creativeMode === 'generate' ? (
            wizardCreatives.length > 0 ? (
              // Fix 3: the wizard already produced creatives for this
              // campaign (the advertiser is navigating back from step 4, or
              // re-entering step 3) — show a completed-state summary instead
              // of remounting a fresh CreativeGenerator, which would reset
              // its internal wizard state and force a full copy+render redo.
              <>
                <div className="mt-6 flex items-center gap-4 rounded-[14px] border border-slate-200 bg-white px-5.5 py-5">
                  {creative && (
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded bg-slate-100">
                      <img
                        src={creative.imageUrl}
                        alt="Valin auglýsing"
                        className="h-full w-full object-contain"
                      />
                    </div>
                  )}
                  <div className="text-sm">
                    <span className="block font-bold text-slate-900">
                      {wizardCreatives.length} stærðir tilbúnar
                    </span>
                    <span className="text-xs font-semibold text-slate-500">
                      Auglýsingaefni hefur þegar verið búið til fyrir þessa herferð.
                    </span>
                  </div>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-5 mt-8">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setWizardCreatives([]);
                      setCreatives([]);
                      setCreative(null);
                    }}
                  >
                    Byrja upp á nýtt
                  </Button>
                  <Button onClick={() => setStep(4)}>Halda áfram →</Button>
                </div>
              </>
            ) : (
              <>
                <div className="mt-6">
                  <CreativeGenerator
                    categories={selectedCategories}
                    onComplete={(createdCreatives) => {
                      const primary =
                        createdCreatives.find((c) => c.width === 300 && c.height === 250) ??
                        createdCreatives[0];
                      if (primary) {
                        setCreative(primary);
                        setCreatives(createdCreatives);
                        setWizardCreatives(createdCreatives);
                        setStep(4);
                      }
                    }}
                  />
                </div>
                <div className="flex justify-start border-t border-slate-200 pt-5 mt-8">
                  <Button variant="ghost" onClick={() => setStep(2)}>
                    Til baka
                  </Button>
                </div>
              </>
            )
          ) : (
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
                <Button variant="ghost" onClick={() => setStep(2)}>
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
          )}
        </section>
      )}

      {step === 4 && (
        <section style={{ marginTop: 'clamp(48px,6vw,72px)' }}>
          <h2 className="m-0 text-2xl font-extrabold tracking-[-0.02em]">Yfirlit og staðfesting</h2>
          <p className="mt-3 mb-6.5 max-w-[52ch] text-[15px] leading-normal text-slate-500">
            Fjárhæðin er sótt af inneigninni í veskinu þínu. Þú fyllir á veskið með korti í gegnum
            Teya ef inneign vantar.
          </p>

          {creative && (
            <div className="mb-6 bg-white border border-slate-200 rounded-[14px] px-5.5 py-5 flex items-center gap-4">
              <div className="w-20 h-20 bg-slate-100 rounded overflow-hidden flex items-center justify-center shrink-0">
                <img
                  src={creative.imageUrl}
                  alt="Valin auglýsing"
                  className="object-contain w-full h-full"
                />
              </div>
              <div className="text-sm">
                <span className="block text-xs font-semibold text-slate-500">Valin auglýsing</span>
                <span className="font-bold text-slate-900">
                  {creative.width} × {creative.height} px
                </span>
                {creatives.length > 1 && (
                  <span className="block text-xs font-semibold text-primary mt-0.5">
                    {creatives.length} stærðir
                  </span>
                )}
              </div>
            </div>
          )}

          {selectedCategories.length > 0 && (
            <div className="mb-6 bg-white border border-slate-200 rounded-[14px] px-5.5 py-5 text-sm space-y-3">
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

          <div className="bg-background border border-slate-200 rounded-[14px] px-5.5 py-5 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-400">
                Núverandi inneign í veskinu þínu
              </div>
              <div className="text-[22px] font-extrabold text-slate-900 tracking-[-0.02em] mt-1.5 tabular-nums">
                {fmtNum(walletBalance)} kr.
              </div>
              {walletCommitted > 0 && (
                <div className="text-xs text-slate-500 mt-1 tabular-nums">
                  Þar af frátekið í aðrar herferðir: {fmtNum(walletCommitted)} kr. · Laust:{' '}
                  {fmtNum(Math.max(0, walletAvailable))} kr.
                </div>
              )}
            </div>
            {walletSufficient ? (
              <span className="text-sm text-slate-900 font-semibold">
                Nóg inneign — engin áfylling þarf
              </span>
            ) : (
              <button
                type="button"
                onClick={() => navigate(`/advertiser/topup?amount=${topUpNeeded}`)}
                className="text-sm text-primary font-semibold bg-transparent border-0 p-0 cursor-pointer underline underline-offset-2"
              >
                Vantar {fmtNum(topUpNeeded)} kr. — fylltu fyrst á veskið
              </button>
            )}
          </div>

          <div className="mt-6.5 flex flex-col gap-3.75">
            <div className="flex justify-between items-center">
              <span className="text-[15px] text-slate-600">Fjárhæð herferðar</span>
              <span className="text-[15px] text-slate-900 tabular-nums">
                {fmtNum(totalBudget)} kr.
              </span>
            </div>
            <div className="h-px bg-slate-200 my-0.5" />
            <div className="flex justify-between items-baseline">
              <span className="text-[17px] font-bold text-slate-900">Dregst af inneign</span>
              <span className="text-2xl font-extrabold text-slate-900 tracking-[-0.02em] tabular-nums">
                {fmtNum(totalBudget)} kr.
              </span>
            </div>
            <p className="text-[13px] text-slate-500 leading-normal">
              Inneign í veskinu er umboðsfé án VSK — VSK leggst aðeins á þjónustugjald Birtings og
              kemur fram á VSK-reikningi í Greiðslum.{' '}
              {/* New tab on purpose: this sits on step 4 of a wizard with no
                  state persistence — an in-tab navigation would throw away
                  all four steps and force a full creative-wizard redo. */}
              <Link
                to="/faq"
                target="_blank"
                rel="noopener"
                className="text-primary underline underline-offset-2"
              >
                Nánar um VSK
              </Link>
            </p>
          </div>

          <div className="mt-7.5">
            {walletSufficient ? (
              <Button
                className="w-full h-13"
                loading={submitting}
                disabled={selectedCategories.length === 0 || !creative}
                onClick={handleFinalSubmit}
              >
                Hefja birtingu af inneign
              </Button>
            ) : (
              <Button
                className="w-full h-13"
                onClick={() => navigate(`/advertiser/topup?amount=${topUpNeeded}`)}
              >
                Fylla fyrst á veskið
              </Button>
            )}
          </div>
          <p className="flex items-center gap-2 justify-center mt-5 text-[13px] text-slate-500 text-center leading-normal">
            <Lock size={17} className="text-primary shrink-0" />
            Örugg greiðsla í gegnum Teya · VSK-reikningur aðgengilegur í Greiðslum · stöðvaðu hvenær
            sem er
          </p>

          <div className="flex justify-start border-t border-slate-200 pt-5 mt-8">
            <Button variant="ghost" onClick={() => setStep(3)}>
              Til baka
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
