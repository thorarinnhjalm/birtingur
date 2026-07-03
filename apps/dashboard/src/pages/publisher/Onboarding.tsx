import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { useCreatePublisher } from '@/hooks/usePublisher';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { apiFetch } from '@/lib/api';
import { AD_CATEGORIES, DEFAULT_PLATFORM_FEE_PERCENT, MIN_PAYOUT_ISK } from '@ada/shared';
import { Eyebrow, EditorialH1, NumberedSection, StepIndicator } from '@/components/ui/editorial';
import {
  ArrowRight,
  CheckCircle2,
  Info,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Loader2,
  Cpu,
  Layers,
  Lock,
} from 'lucide-react';

const PUBLISHER_SHARE_PERCENT = 100 - DEFAULT_PLATFORM_FEE_PERCENT;

export default function PublisherOnboarding() {
  const createPublisher = useCreatePublisher();
  const navigate = useNavigate();
  const { signOut } = useAuth();

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

  // "Hætta við" (cancel) — this page can render with no AppShell around it
  // (the common first-run case, see Dashboard.tsx's zero-publishers branch),
  // so there's no sidebar/logout affordance to fall back on. Signing out
  // mirrors TopBar.tsx's own logout action and avoids the redirect loop that
  // navigating anywhere under /publisher/* would cause while publishers.length
  // === 0 (every such path bounces back to /publisher/onboarding).
  const handleCancel = async () => {
    await signOut();
    navigate('/sign-in', { replace: true });
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-[760px] mx-auto px-6 py-[18px] flex items-center justify-between">
          <span className="font-extrabold tracking-[-0.01em] text-slate-900">Birtingur</span>
          <button
            type="button"
            onClick={handleCancel}
            className="text-sm text-slate-500 cursor-pointer hover:text-slate-700 bg-transparent border-0 p-0"
          >
            Hætta við
          </button>
        </div>
      </div>

      <div
        className="max-w-[760px] mx-auto px-6"
        style={{ paddingTop: 'clamp(40px,6vw,72px)', paddingBottom: 110 }}
      >
        <Eyebrow>Nýr útgefandi</Eyebrow>
        <div className="mt-4">
          <EditorialH1>Skrá vef</EditorialH1>
        </div>
        <StepIndicator steps={['Vefur', 'Stillingar']} current={step - 1} />

        {error && (
          <div className="mt-8 p-3 bg-red-50 border border-red-200 rounded-lg text-xs font-semibold text-red-600">
            {error}
          </div>
        )}

        {/* STEP 1: Domain — maps to the template's "01 Vefurinn þinn" section.
              The template collects domain + category on one screen; the real
              flow gates category selection behind an AI scrape of the domain
              (handleStartScrape), so category selection is deferred to step 2. */}
        {step === 1 && (
          <NumberedSection
            n="01"
            title="Vefurinn þinn"
            lede="Segðu okkur hvar auglýsingarnar eiga heima. Þú getur breytt þessu síðar."
          >
            <p className="-mt-4 mb-6 max-w-[52ch] text-sm leading-relaxed text-slate-500">
              Sláðu inn vefslóðina þína. Gervigreindin okkar mun sjálfkrafa skoða og flokka vefinn
              til að hámarka tekjur þínar og hjálpa auglýsendum að finna þig.
            </p>

            <form onSubmit={handleStartScrape} className="max-w-[420px] space-y-4">
              <Input
                label="Vefslóð *"
                placeholder="t.d. matarbloggid.is"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                required
                disabled={isLoading}
              />

              {isLoading ? (
                <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-6">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
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
                    className="w-full flex items-center justify-center gap-2 py-4 text-base font-bold"
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
                    className="w-full text-sm font-semibold text-slate-500 hover:text-slate-700"
                  >
                    Sleppa greiningu og fylla út handvirkt
                  </Button>
                </div>
              )}
            </form>
          </NumberedSection>
        )}

        {/* STEP 2: everything the AI scrape unlocks — not a single template
              section, since the template has no scrape step of its own. Laid
              out as the template's remaining numbered sections (categories,
              then payout) plus the real-only fields the template doesn't
              cover (display name/description, integration method, estimated
              slots, extra payout fields) kept functional per the CampaignCreate
              precedent. The template's "02 Kóði" (fake code snippet) and
              "03 Staðfesting" (live install check) sections are not reproduced
              — there is no real snippet-generation or verification endpoint
              wired up here, and inventing one would violate "no new API calls". */}
        {step === 2 && (
          <form onSubmit={handleSubmit}>
            <section style={{ marginTop: 'clamp(48px,6vw,72px)' }}>
              <h2 className="m-0 text-2xl font-extrabold tracking-[-0.02em] text-slate-900">
                Upplýsingar og stillingar
              </h2>
              <p className="mt-3 mb-6 max-w-[52ch] text-[15px] leading-normal text-slate-500">
                Gervigreindin fann eftirfarandi upplýsingar. Þú getur lagfært þær eða bætt við
                stillingum hér að neðan.
              </p>

              {confidence !== null && (
                <div className="mb-6 flex items-start gap-3 rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
                  <Sparkles className="h-5 w-5 shrink-0 mt-0.5 text-emerald-600" />
                  <div>
                    <h4 className="text-xs font-bold text-emerald-800">
                      Sjálfvirk flokkun gervigreindar tókst
                    </h4>
                    <p className="mt-0.5 text-xs leading-relaxed text-emerald-600">
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

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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

              <div className="mt-4 space-y-1">
                <label className="block text-sm font-medium text-slate-700">
                  Lýsing á vef (fyrir auglýsendur)
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Hverju lýsir vefsíðan þín? Þetta hjálpar auglýsendum og gervigreindinni að skilja markhópinn þinn."
                  className="min-h-[80px] w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition-all focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  disabled={createPublisher.isPending}
                />
              </div>
            </section>

            <NumberedSection
              n="02"
              title="Flokkar efnis"
              lede="Veldu þá flokka sem lýsa efni síðunnar þinnar best. Auglýsendur munu geta keypt birtingar í þessum flokkum."
            >
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
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
                      className={clsx(
                        'relative flex select-none items-center justify-between gap-2 rounded-xl border-[1.5px] px-4 py-[14px] text-center transition-colors',
                        createPublisher.isPending
                          ? 'pointer-events-none opacity-60'
                          : 'cursor-pointer',
                        isSelected
                          ? 'border-primary bg-primary/[0.06]'
                          : 'border-slate-200 bg-white hover:border-slate-300',
                      )}
                    >
                      <span className="text-sm font-semibold text-slate-900">{cat.label}</span>
                      {isSelected && (
                        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] text-white">
                          ✓
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </NumberedSection>

            {/* Real-only content substituting for the template's "02 Kóði"
                  section — there's no live code-snippet/WordPress/GTM
                  integration flow wired up at registration time, so the
                  existing widget/MCP preference + estimated-slots fields are
                  kept here instead, restyled to the same numbered rhythm. */}
            <NumberedSection
              n="03"
              title="Hvernig viltu birta auglýsingar?"
              lede="Veldu þá samþættingu sem hentar þínum þörfum best."
            >
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {(
                  [
                    {
                      key: 'widget' as const,
                      icon: Layers,
                      title: 'Vef-Sniðmát (Widget)',
                      body: 'Hefðbundið samþættingarform. Þú setur inn einfaldan JavaScript kóða á síðuna þína til að birta myndræna borða á ákveðnum stöðum.',
                    },
                    {
                      key: 'mcp' as const,
                      icon: Cpu,
                      title: 'Gervigreindar-uppsetning (MCP)',
                      body: 'Sjálfvirk uppsetning með gervigreind. Tengdu Claude eða Cursor við okkar MCP vefþjón svo gervigreindarkóðarinn þinn geti sjálfkrafa búið til og sett upp auglýsingapláss í þínum kóðagrunni.',
                    },
                    {
                      key: 'both' as const,
                      icon: null,
                      title: 'Bæði (Handvirkt + MCP)',
                      body: 'Hámarks sveigjanleiki. Settu upp hefðbundna borða og vefkassa handvirkt með kóðaklippum, eða leyfðu gervigreindarkóðaranum þínum að sjá um alla kóðunina í gegnum MCP.',
                    },
                  ] as const
                ).map((opt) => {
                  const isSelected = integrationPreference === opt.key;
                  const Icon = opt.icon;
                  return (
                    <div
                      key={opt.key}
                      onClick={() =>
                        !createPublisher.isPending && setIntegrationPreference(opt.key)
                      }
                      className={clsx(
                        'flex flex-col justify-between rounded-xl border-2 p-4 transition-colors',
                        createPublisher.isPending
                          ? 'pointer-events-none opacity-60'
                          : 'cursor-pointer',
                        isSelected
                          ? 'border-primary bg-primary/[0.04]'
                          : 'border-slate-200 hover:border-slate-300',
                      )}
                    >
                      <div>
                        <div className="mb-2 flex items-center justify-between">
                          {Icon ? (
                            <Icon className="h-5 w-5 text-primary" />
                          ) : (
                            <div className="flex gap-0.5">
                              <Layers className="h-4 w-4 text-primary" />
                              <Cpu className="h-4 w-4 text-primary" />
                            </div>
                          )}
                          {isSelected && <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />}
                        </div>
                        <h4 className="text-xs font-bold text-slate-900">{opt.title}</h4>
                        <p className="mt-1 text-[11px] leading-snug text-slate-500">{opt.body}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-8 border-t border-slate-100 pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="block text-sm font-bold text-slate-800">
                      Áætluð auglýsingapláss
                    </label>
                    <p className="mt-0.5 text-xs text-slate-400">
                      Hversu mörg pláss ætlar þú að stofna í byrjun?
                    </p>
                  </div>
                  <span className="rounded-lg border border-sky-100 bg-sky-50 px-3 py-1 text-sm font-extrabold text-sky-600 tabular-nums">
                    {estimatedSlotsCount} pláss
                  </span>
                </div>

                <input
                  type="range"
                  min="1"
                  max="5"
                  value={estimatedSlotsCount}
                  onChange={(e) => setEstimatedSlotsCount(Number(e.target.value))}
                  disabled={createPublisher.isPending}
                  className="custom-slider mt-3 h-2 w-full cursor-pointer rounded-lg"
                />
                <div className="flex justify-between px-1 text-[10px] font-bold text-slate-400 tabular-nums">
                  <span>1 pláss</span>
                  <span>2 pláss</span>
                  <span>3 pláss</span>
                  <span>4 pláss</span>
                  <span>5+ pláss</span>
                </div>
              </div>
            </NumberedSection>

            <NumberedSection
              n="04"
              title="Greiðsluupplýsingar"
              lede="Hér berast útgreiðslur fyrir birtingar á vefnum þínum."
            >
              <div className="flex max-w-[520px] flex-col gap-2 rounded-2xl border border-[#dbe4f7] bg-[#f1f5fd] px-6 py-[22px]">
                <div className="flex justify-between">
                  <span className="text-sm text-slate-700">Þitt hlutfall af tekjum</span>
                  <span className="text-sm font-bold text-primary tabular-nums">
                    {PUBLISHER_SHARE_PERCENT}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-slate-700">Útgreiðslur</span>
                  <span className="text-sm font-bold text-slate-900">Mánaðarlega</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-slate-700">Lágmarksfjárhæð</span>
                  <span className="text-sm font-bold text-slate-900 tabular-nums">
                    {MIN_PAYOUT_ISK.toLocaleString('is-IS')} kr.
                  </span>
                </div>
              </div>

              {/* Bank details stay optional at registration time (real
                    behaviour — see handleSubmit's hasAnyBankDetail /
                    hasAllBankDetails validation), unlike the template's
                    always-visible fields — kept as a disclosed collapsible
                    "Valfrjálst" panel so that optionality isn't misrepresented. */}
              <div className="mt-6 border-t border-slate-100 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPayoutPanel(!showPayoutPanel)}
                  className="flex w-full cursor-pointer items-center justify-between border-0 bg-transparent py-2 text-slate-700 transition-colors hover:text-slate-900"
                >
                  <span className="flex items-center gap-2">
                    <Info className="h-4 w-4 shrink-0 text-slate-400" />
                    <span className="text-sm font-bold">
                      Greiðslu- og bankaupplýsingar (Valfrjálst)
                    </span>
                  </span>
                  {showPayoutPanel ? (
                    <ChevronUp className="h-4 w-4 shrink-0" />
                  ) : (
                    <ChevronDown className="h-4 w-4 shrink-0" />
                  )}
                </button>

                {showPayoutPanel && (
                  <div className="mt-3 space-y-4 rounded-xl border border-slate-200/60 bg-slate-50/50 p-4">
                    <p className="text-xs leading-relaxed text-slate-500">
                      Þú getur alveg sleppt því að fylla út bankaupplýsingar núna. Þú þarft þær
                      eingöngu þegar reikningurinn þinn nær lágmarksútborgun (
                      <strong>{MIN_PAYOUT_ISK.toLocaleString('is-IS')} kr.</strong>). Þá geturðu
                      auðveldlega skráð þær í stillingum.
                    </p>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <Input
                        label="Kennitala fyrirtækis"
                        placeholder="000000-0000"
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
                      label="Bankareikningur"
                      placeholder="0133-26-123456"
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

              <div className="mt-8 flex justify-between border-t border-slate-100 pt-5">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={createPublisher.isPending}
                  onClick={() => setStep(1)}
                >
                  Til baka
                </Button>
                <Button
                  type="submit"
                  loading={createPublisher.isPending}
                  className="px-6 font-bold"
                >
                  Ljúka skráningu
                </Button>
              </div>
              <p className="mt-5 flex items-center justify-center gap-2 text-center text-[13px] leading-relaxed text-slate-500">
                <Lock className="h-[17px] w-[17px] shrink-0 text-primary" />
                Greiðsluupplýsingar eru aðeins notaðar til útgreiðslna
              </p>
            </NumberedSection>
          </form>
        )}
      </div>
    </div>
  );
}
