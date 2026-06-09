import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreatePublisher } from '@/hooks/usePublisher';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { apiFetch } from '@/lib/api';
import { AD_CATEGORIES } from '@ada/shared';
import {
  Globe,
  Cpu,
  Layers,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Info,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Loader2,
} from 'lucide-react';

export default function PublisherOnboarding() {
  const createPublisher = useCreatePublisher();
  const navigate = useNavigate();

  const [step, setStep] = useState<1 | 2>(1);
  const [domain, setDomain] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Scraped metadata states
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [confidence, setConfidence] = useState<number | null>(null);

  // Custom preferences states
  const [integrationPreference, setIntegrationPreference] = useState<'widget' | 'mcp' | 'both'>(
    'widget',
  );
  const [estimatedSlotsCount, setEstimatedSlotsCount] = useState(2);

  // Payout Details
  const [kennitala, setKennitala] = useState('');
  const [iban, setIban] = useState('');
  const [accountHolder, setAccountHolder] = useState('');
  const [minimumPayout, setMinimumPayout] = useState(5000);
  const [showPayoutPanel, setShowPayoutPanel] = useState(false);

  const [error, setError] = useState<string | null>(null);

  // Restore persisted form state on mount
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('pub_onboarding');
      if (saved) {
        const s = JSON.parse(saved);
        if (s.step) setStep(s.step);
        if (s.domain) setDomain(s.domain);
        if (s.displayName) setDisplayName(s.displayName);
        if (s.description) setDescription(s.description);
        if (s.selectedCategories?.length) setSelectedCategories(s.selectedCategories);
        if (s.confidence !== undefined) setConfidence(s.confidence);
        if (s.integrationPreference) setIntegrationPreference(s.integrationPreference);
        if (s.estimatedSlotsCount) setEstimatedSlotsCount(s.estimatedSlotsCount);
        if (s.kennitala) setKennitala(s.kennitala);
        if (s.iban) setIban(s.iban);
        if (s.accountHolder) setAccountHolder(s.accountHolder);
      }
    } catch {
      // Ignore corrupt sessionStorage data
    }
  }, []);

  // Persist form state on changes
  useEffect(() => {
    sessionStorage.setItem(
      'pub_onboarding',
      JSON.stringify({
        step,
        domain,
        displayName,
        description,
        selectedCategories,
        confidence,
        integrationPreference,
        estimatedSlotsCount,
        kennitala,
        iban,
        accountHolder,
      }),
    );
  }, [
    step,
    domain,
    displayName,
    description,
    selectedCategories,
    confidence,
    integrationPreference,
    estimatedSlotsCount,
    kennitala,
    iban,
    accountHolder,
  ]);

  // Step 1: Scrape & Classify
  const handleStartScrape = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!domain.trim()) return;

    setError(null);
    setIsLoading(true);

    // Clean up domain format (strip protocol)
    const cleanDomain = domain
      .replace(/^(https?:\/\/)?(www\.)?/i, '')
      .replace(/\/$/, '')
      .toLowerCase();

    try {
      const data = await apiFetch<any>('/v1/publishers/analyze-domain', {
        method: 'POST',
        body: JSON.stringify({ domain: cleanDomain }),
      });

      // Map classification result to states
      setDomain(cleanDomain);
      setDisplayName(data.title || cleanDomain.charAt(0).toUpperCase() + cleanDomain.slice(1));
      setDescription(data.description || '');
      setSelectedCategories(data.categories || []);
      setConfidence(data.confidence || null);
      setStep(2);
    } catch {
      // Allow passing to step 2 even if scraping fails, using fallbacks
      setDomain(cleanDomain);
      setDisplayName(cleanDomain.split('.')[0] || cleanDomain);
      setDescription('');
      setSelectedCategories(['afthreying_menning']);
      setConfidence(null);
      setStep(2);
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Complete Registration
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!domain.trim() || !displayName.trim()) {
      setError('Vinsamlegast fylltu út alla stjörnumerkta reiti');
      return;
    }

    if (selectedCategories.length === 0) {
      setError('Vinsamlegast veldu að minnsta kosti einn flokk efnis');
      return;
    }

    const hasAnyBankDetail = kennitala.trim() || iban.trim() || accountHolder.trim();
    const hasAllBankDetails = kennitala.trim() && iban.trim() && accountHolder.trim();

    if (hasAnyBankDetail && !hasAllBankDetails) {
      setError(
        'Ef bankaupplýsingar eru skráðar þarf að fylla út alla þrjá bankareitina (eða skilja alla eftir auða). Þú getur líka sleppt þeim alveg núna og skráð þær síðar í stillingum.',
      );
      return;
    }

    try {
      await createPublisher.mutateAsync({
        domain,
        displayName,
        categories: selectedCategories,
        payoutDetails: hasAllBankDetails
          ? {
              kennitala,
              iban,
              accountHolder,
            }
          : undefined,
        minimumPayoutIsk: minimumPayout,
        integrationPreference,
        estimatedSlotsCount,
      });
      sessionStorage.removeItem('pub_onboarding');
      navigate('/publisher');
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message : 'Ekki tókst að stofna útgefandaaðgang. Reyndu aftur.';
      setError(msg);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6 md:p-12">
      <Card className="max-w-2xl w-full p-6 md:p-8 shadow-xl border border-slate-100 rounded-2xl bg-white transition-all duration-300">
        {/* Wizard Header Progress */}
        <div className="flex items-center justify-between mb-8 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-lg text-primary tracking-tight">Birtingur</span>
            <span className="text-xs font-semibold px-2 py-0.5 bg-sky-50 text-sky-600 rounded-full border border-sky-100">
              Útgefandi
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
            <span className={step === 1 ? 'text-primary font-extrabold' : 'text-slate-500'}>
              1. Slóð
            </span>
            <ArrowRight className="h-3 w-3" />
            <span className={step === 2 ? 'text-primary font-extrabold' : ''}>2. Stillingar</span>
          </div>
        </div>

        {/* STEP 1: Discovery & Scrape */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="text-center max-w-md mx-auto">
              <div className="w-12 h-12 bg-sky-50 rounded-xl flex items-center justify-center mx-auto mb-4 border border-sky-100">
                <Globe className="h-6 w-6 text-sky-600 animate-pulse" />
              </div>
              <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                Skráðu vefsvæðið þitt
              </h1>
              <p className="text-sm text-slate-500 mt-2 font-medium leading-relaxed">
                Sláðu inn vefslóðina þína. Gervigreindin okkar mun sjálfkrafa skoða og flokka vefinn
                til að hámarka tekjur þínar og hjálpa auglýsendum að finna þig.
              </p>
            </div>

            <form onSubmit={handleStartScrape} className="space-y-4 pt-4 max-w-lg mx-auto">
              <div className="relative">
                <Input
                  label="Vefslóð (Lén) *"
                  placeholder="Dæmi: visir.is eða minnvefur.is"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  required
                  disabled={isLoading}
                  className="pl-4 py-4 rounded-xl text-base"
                />
              </div>

              {isLoading ? (
                <div className="flex flex-col items-center justify-center p-6 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
                  <Loader2 className="h-8 w-8 text-sky-600 animate-spin" />
                  <span className="text-sm font-semibold text-slate-700">
                    Skoðum vefsíðuna þína...
                  </span>
                  <span className="text-xs text-slate-400">
                    Sækjum lýsingu og gervigreindin flokkar efnið
                  </span>
                </div>
              ) : (
                <div className="space-y-2">
                  <Button
                    type="submit"
                    className="w-full py-4 text-base font-bold rounded-xl shadow-lg shadow-primary/10 flex items-center justify-center gap-2"
                  >
                    Greina vefsíðu
                    <ArrowRight className="h-5 w-5" />
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      const cleanDomain = domain
                        .replace(/^(https?:\/\/)?(www\.)?/i, '')
                        .replace(/\/$/, '')
                        .toLowerCase();
                      setDomain(cleanDomain || domain);
                      setDisplayName(cleanDomain.split('.')[0] || cleanDomain || '');
                      setSelectedCategories(['afthreying_menning']);
                      setConfidence(null);
                      setStep(2);
                    }}
                    className="w-full text-slate-500 hover:text-slate-700 text-sm font-semibold py-2"
                  >
                    Sleppa greiningu og fylla út handvirkt
                  </Button>
                </div>
              )}
            </form>
          </div>
        )}

        {/* STEP 2: Configuration & Details */}
        {step === 2 && (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                Upplýsingar og stillingar
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Gervigreindin fann eftirfarandi upplýsingar. Þú getur lagfært þær eða bætt við
                stillingum hér að neðan.
              </p>
            </div>

            {/* Scrape results feedback card */}
            {confidence !== null && (
              <div className="p-4 bg-emerald-50/50 border border-emerald-100 rounded-xl flex items-start gap-3">
                <Sparkles className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold text-emerald-800">
                    Sjálfvirk flokkun gervigreindar tókst
                  </h4>
                  <p className="text-xs text-emerald-600 mt-0.5 leading-relaxed">
                    Vefurinn var greindur sem{' '}
                    <strong>
                      {AD_CATEGORIES.find((c) => c.slug === selectedCategories[0])?.label ||
                        'Almennt'}
                    </strong>{' '}
                    með {Math.round(confidence * 100)}% öryggi.
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Lén vefsíðu *"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                required
                disabled={createPublisher.isPending}
              />

              <Input
                label="Opinbert heiti vefsíðu *"
                placeholder="Dæmi: Tæknifréttir"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                disabled={createPublisher.isPending}
              />
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-700">
                Lýsing á vef (fyrir auglýsendur)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Hverju lýsir vefsíðan þín? Þetta hjálpar auglýsendum og gervigreindinni að skilja markhópinn þinn."
                className="w-full px-4 py-3 border border-slate-300 rounded-lg text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm shadow-[0_1px_2px_rgba(0,0,0,0.02)] min-h-[80px]"
                disabled={createPublisher.isPending}
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-bold text-slate-800">
                Flokkar efnis * (Veldu einn eða fleiri)
              </label>
              <p className="text-xs text-slate-400 mt-0.5">
                Veldu þá flokka sem lýsa efni síðunnar þinnar best. Auglýsendur munu geta keypt
                birtingar í þessum flokkum.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 pt-2">
                {AD_CATEGORIES.map((cat) => {
                  const isSelected = selectedCategories.includes(cat.slug);
                  return (
                    <div
                      key={cat.slug}
                      onClick={() => {
                        if (isSelected) {
                          if (selectedCategories.length > 1) {
                            setSelectedCategories(selectedCategories.filter((s) => s !== cat.slug));
                          }
                        } else {
                          setSelectedCategories([...selectedCategories, cat.slug]);
                        }
                      }}
                      className={`px-3 py-2.5 rounded-xl border text-xs font-bold cursor-pointer transition-all duration-200 text-center select-none ${
                        isSelected
                          ? 'bg-primary text-white border-primary shadow-md shadow-primary/10'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {cat.label}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Premium Selector: Integration Preference */}
            <div className="space-y-3 pt-2">
              <div>
                <label className="block text-sm font-bold text-slate-800">
                  Hvernig viltu birta auglýsingar?
                </label>
                <p className="text-xs text-slate-400 mt-0.5">
                  Veldu þá samþættingu sem hentar þínum þörfum best.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Option 1: Widget */}
                <div
                  onClick={() => !createPublisher.isPending && setIntegrationPreference('widget')}
                  className={`p-4 border-2 rounded-xl cursor-pointer transition-all duration-200 relative flex flex-col justify-between ${
                    integrationPreference === 'widget'
                      ? 'border-primary bg-blue-50/20'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/20'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Layers className="h-5 w-5 text-primary" />
                      {integrationPreference === 'widget' && (
                        <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                      )}
                    </div>
                    <h4 className="text-xs font-bold text-slate-900">Vef-Sniðmát (Widget)</h4>
                    <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                      Hefðbundið samþættingarform. Þú setur inn einfaldan JavaScript kóða á síðuna
                      þína til að birta myndræna borða á ákveðnum stöðum.
                    </p>
                  </div>
                </div>

                {/* Option 2: MCP */}
                <div
                  onClick={() => !createPublisher.isPending && setIntegrationPreference('mcp')}
                  className={`p-4 border-2 rounded-xl cursor-pointer transition-all duration-200 relative flex flex-col justify-between ${
                    integrationPreference === 'mcp'
                      ? 'border-primary bg-blue-50/20'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/20'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Cpu className="h-5 w-5 text-primary" />
                      {integrationPreference === 'mcp' && (
                        <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                      )}
                    </div>
                    <h4 className="text-xs font-bold text-slate-900">
                      Gervigreindar-uppsetning (MCP)
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                      Sjálfvirk uppsetning með gervigreind. Tengdu Claude eða Cursor við okkar MCP
                      vefþjón svo gervigreindarkóðarinn þinn geti sjálfkrafa búið til og sett upp
                      auglýsingapláss í þínum kóðagrunni.
                    </p>
                  </div>
                </div>

                {/* Option 3: Both */}
                <div
                  onClick={() => !createPublisher.isPending && setIntegrationPreference('both')}
                  className={`p-4 border-2 rounded-xl cursor-pointer transition-all duration-200 relative flex flex-col justify-between ${
                    integrationPreference === 'both'
                      ? 'border-primary bg-blue-50/20'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/20'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex gap-0.5">
                        <Layers className="h-4 w-4 text-primary" />
                        <Cpu className="h-4 w-4 text-primary" />
                      </div>
                      {integrationPreference === 'both' && (
                        <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                      )}
                    </div>
                    <h4 className="text-xs font-bold text-slate-900">Bæði (Handvirkt + MCP)</h4>
                    <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                      Hámarks sveigjanleiki. Settu upp hefðbundna borða og vefkassa handvirkt með
                      kóðaklippum, eða leyfðu gervigreindarkóðaranum þínum að sjá um alla kóðunina í
                      gegnum MCP.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Estimated Slots Selector */}
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-sm font-bold text-slate-800">
                    Áætluð auglýsingapláss
                  </label>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Hversu mörg pláss ætlar þú að stofna í byrjun?
                  </p>
                </div>
                <span className="px-3 py-1 bg-sky-50 text-sky-600 font-extrabold text-sm rounded-lg border border-sky-100">
                  {estimatedSlotsCount} {estimatedSlotsCount === 1 ? 'pláss' : 'pláss'}
                </span>
              </div>

              <input
                type="range"
                min="1"
                max="5"
                value={estimatedSlotsCount}
                onChange={(e) => setEstimatedSlotsCount(Number(e.target.value))}
                disabled={createPublisher.isPending}
                className="custom-slider w-full h-2 rounded-lg appearance-none cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-400 font-bold px-1">
                <span>1 pláss</span>
                <span>2 pláss</span>
                <span>3 pláss</span>
                <span>4 pláss</span>
                <span>5+ pláss</span>
              </div>
            </div>

            {/* Collapsible Bank details panel */}
            <div className="pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowPayoutPanel(!showPayoutPanel)}
                className="w-full flex items-center justify-between py-2 text-slate-700 hover:text-slate-900 transition-colors bg-transparent border-0 cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Info className="h-4 w-4 text-slate-400 shrink-0" />
                  <span className="text-sm font-bold">
                    Greiðslu- og bankaupplýsingar (Valfrjálst)
                  </span>
                </div>
                {showPayoutPanel ? (
                  <ChevronUp className="h-4 w-4 shrink-0" />
                ) : (
                  <ChevronDown className="h-4 w-4 shrink-0" />
                )}
              </button>

              {showPayoutPanel && (
                <div className="mt-3 space-y-4 p-4 bg-slate-50/50 rounded-xl border border-slate-200/60 animate-fadeIn">
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Þú getur alveg sleppt því að fylla út bankaupplýsingar núna. Þú þarft þær
                    eingöngu þegar reikningurinn þinn nær lágmarksútborgun (
                    <strong>5.000 kr.</strong>). Þá geturðu auðveldlega skráð þær í stillingum.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input
                      label="Kennitala reikningshafa"
                      placeholder="Kennitala tengd bankareikningi"
                      value={kennitala}
                      onChange={(e) => setKennitala(e.target.value)}
                      disabled={createPublisher.isPending}
                    />

                    <Input
                      label="Nafn reikningshafa"
                      placeholder="Nafn eins og það birtist í bankanum"
                      value={accountHolder}
                      onChange={(e) => setAccountHolder(e.target.value)}
                      disabled={createPublisher.isPending}
                    />
                  </div>

                  <Input
                    label="Bankareikningur (Útibú-Höfuðbók-Reikningur)"
                    placeholder="Dæmi: 0111-26-003450"
                    value={iban}
                    onChange={(e) => setIban(e.target.value)}
                    disabled={createPublisher.isPending}
                  />

                  <Input
                    label="Lágmarksútborgun (ISK) *"
                    type="number"
                    min="5000"
                    step="1000"
                    value={minimumPayout}
                    onChange={(e) => setMinimumPayout(Number(e.target.value) || 5000)}
                    required
                    disabled={createPublisher.isPending}
                  />
                </div>
              )}
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs font-semibold text-red-600">
                {error}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-3 justify-end pt-4 border-t border-slate-100">
              <Button
                type="button"
                variant="ghost"
                disabled={createPublisher.isPending}
                onClick={() => setStep(1)}
                className="flex items-center gap-1"
              >
                <ArrowLeft className="h-4 w-4" />
                Til baka
              </Button>

              <Button
                type="submit"
                loading={createPublisher.isPending}
                className="px-6 font-bold shadow-lg shadow-primary/10"
              >
                Ljúka skráningu
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
