import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreateAdvertiser } from '@/hooks/useAdvertiser';
import { useAuth } from '@/lib/auth-context';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { apiFetch } from '@/lib/api';
import {
  Globe,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Loader2,
  Copy,
  Check,
  Megaphone,
} from 'lucide-react';
import { AD_CATEGORIES } from '@ada/shared';

export default function AdvertiserOnboarding() {
  const REGISTRATION_CLOSED = true; // Set to false to reopen registration

  const createAdvertiser = useCreateAdvertiser();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<1 | 2>(1);
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Form states
  const [companyName, setCompanyName] = useState('');
  const [kennitala, setKennitala] = useState('');
  const [vatNumber, setVatNumber] = useState('');
  const [billingEmail, setBillingEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Scraped metadata states
  const [scrapedCategories, setScrapedCategories] = useState<string[]>([]);
  const [scrapedConfidence, setScrapedConfidence] = useState<number | null>(null);
  const [scrapedDescription, setScrapedDescription] = useState<string>('');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // Pre-fill email when user profile loads
  useEffect(() => {
    if (user?.email) {
      setBillingEmail(user.email);
    }
  }, [user]);

  // Restore persisted form state on mount
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('adv_onboarding');
      if (saved) {
        const s = JSON.parse(saved);
        if (s.step) setStep(s.step);
        if (s.websiteUrl) setWebsiteUrl(s.websiteUrl);
        if (s.companyName) setCompanyName(s.companyName);
        if (s.kennitala) setKennitala(s.kennitala);
        if (s.vatNumber) setVatNumber(s.vatNumber);
        if (s.scrapedCategories) setScrapedCategories(s.scrapedCategories);
        else if (s.scrapedCategory) setScrapedCategories([s.scrapedCategory]);
        if (s.scrapedConfidence !== undefined) setScrapedConfidence(s.scrapedConfidence);
        if (s.scrapedDescription) setScrapedDescription(s.scrapedDescription);
      }
    } catch {
      // Ignore corrupt sessionStorage data
    }
  }, []);

  // Persist form state on changes
  useEffect(() => {
    sessionStorage.setItem(
      'adv_onboarding',
      JSON.stringify({
        step,
        websiteUrl,
        companyName,
        kennitala,
        vatNumber,
        scrapedCategories,
        scrapedConfidence,
        scrapedDescription,
      }),
    );
  }, [
    step,
    websiteUrl,
    companyName,
    kennitala,
    vatNumber,
    scrapedCategories,
    scrapedConfidence,
    scrapedDescription,
  ]);

  if (REGISTRATION_CLOSED) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6 md:p-12">
        <Card className="max-w-md w-full p-8 shadow-xl border border-slate-100 rounded-2xl bg-white text-center">
          <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-amber-100">
            <Megaphone className="h-8 w-8 text-amber-600" />
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight mb-3">
            Skráning auglýsenda er lokuð
          </h1>
          <p className="text-sm text-slate-500 font-medium leading-relaxed mb-6">
            Tímabundið er lokað fyrir nýja auglýsendur á meðan við söfnum upp vefjum sem bjóða upp á
            auglýsingapláss.
          </p>
          <Button
            type="button"
            onClick={() => navigate('/role')}
            className="w-full py-3 font-bold rounded-xl"
          >
            Til baka í hlutverkaval
          </Button>
        </Card>
      </div>
    );
  }

  // Step 1: Scrape & Analyze Domain
  const handleStartScrape = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!websiteUrl.trim()) return;

    setError(null);
    setIsLoading(true);

    // Clean up domain format for classification (strip protocol)
    const cleanDomain = websiteUrl
      .replace(/^(https?:\/\/)?(www\.)?/i, '')
      .replace(/\/$/, '')
      .toLowerCase();

    try {
      const data = await apiFetch<any>('/v1/publishers/analyze-domain', {
        method: 'POST',
        body: JSON.stringify({ domain: cleanDomain }),
      });

      // Format URL to ensure it starts with http/https for saving in DB
      const dbUrl = websiteUrl.match(/^https?:\/\//i) ? websiteUrl : `https://${websiteUrl}`;
      setWebsiteUrl(dbUrl);

      // Pre-fill form fields based on scraped data
      setCompanyName(data.title || cleanDomain.charAt(0).toUpperCase() + cleanDomain.slice(1));
      setScrapedCategories(data.categories || []);
      setScrapedConfidence(data.confidence || null);
      setScrapedDescription(data.description || '');
      setStep(2);
    } catch {
      // Allow proceeding to step 2 with fallbacks even if scraping fails
      const fallbackUrl = websiteUrl.match(/^https?:\/\//i) ? websiteUrl : `https://${websiteUrl}`;
      setWebsiteUrl(fallbackUrl);
      setCompanyName(cleanDomain.split('.')[0] || cleanDomain);
      setScrapedCategories(['afthreying_menning']);
      setScrapedConfidence(null);
      setScrapedDescription('');
      setStep(2);
    } finally {
      setIsLoading(false);
    }
  };

  // Skip scraping and go directly to Step 2
  const handleSkipScrape = () => {
    setStep(2);
  };

  // Step 2: Complete Registration
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Simple validation
    if (!companyName.trim() || !kennitala.trim() || !vatNumber.trim() || !billingEmail.trim()) {
      setError('Vinsamlegast fylltu út alla stjörnumerkta reiti');
      return;
    }

    try {
      await createAdvertiser.mutateAsync({
        companyName,
        kennitala,
        vatNumber,
        billingEmail,
        websiteUrl: websiteUrl.trim() ? websiteUrl : undefined,
      });
      // Redirect to advertiser dashboard
      sessionStorage.removeItem('adv_onboarding');
      navigate('/advertiser');
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message : 'Ekki tókst að stofna aðgang. Vinsamlegast reyna aftur.';
      setError(msg);
    }
  };

  // Translate category into friendly Icelandic
  const translateCategory = (cat: string): string => {
    const found = AD_CATEGORIES.find((c) => c.slug === cat);
    return found ? found.label : 'Almennt / Annað';
  };

  // Generate ad copy suggestions based on scraped title/description
  const generateAdSuggestions = () => {
    const cleanDomain = websiteUrl
      .replace(/^(https?:\/\/)?(www\.)?/i, '')
      .replace(/\/$/, '')
      .split('/')[0];
    const name = companyName || cleanDomain || 'Fyrirtækið þitt';
    const desc = scrapedDescription || 'Gæðaþjónusta og persónuleg afgreiðsla í þínu nágrenni.';

    return [
      {
        headline: `Uppgötvaðu ${name}`,
        description: desc.length > 90 ? desc.slice(0, 87) + '...' : desc,
      },
      {
        headline: `Gæðaþjónusta hjá ${name}`,
        description: `Kynntu þér úrvalið á ${cleanDomain || 'vefnum okkar'}! Traust þjónusta í flokknum ${translateCategory(
          scrapedCategories[0] || 'afthreying_menning',
        )}.`,
      },
      {
        headline: `${name} - Fyrir þig`,
        description:
          'Vantar þig faglegar lausnir? Við bjóðum upp á fyrsta flokks þjónustu. Smelltu til að lesa meira.',
      },
    ];
  };

  const adSuggestions = generateAdSuggestions();

  const handleCopyText = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6 md:p-12">
      <Card className="max-w-2xl w-full p-6 md:p-8 shadow-xl border border-slate-100 rounded-2xl bg-white transition-all duration-300">
        {/* Wizard Header Progress */}
        <div className="flex items-center justify-between mb-8 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-lg text-primary tracking-tight">Birtingur</span>
            <span className="text-xs font-semibold px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full border border-indigo-100">
              Auglýsandi
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
            <span className={step === 1 ? 'text-primary font-extrabold' : 'text-slate-500'}>
              1. Slóð
            </span>
            <ArrowRight className="h-3 w-3" />
            <span className={step === 2 ? 'text-primary font-extrabold' : ''}>2. Stofnun</span>
          </div>
        </div>

        {/* STEP 1: Discovery & Scrape */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="text-center max-w-md mx-auto">
              <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center mx-auto mb-4 border border-indigo-100">
                <Globe className="h-6 w-6 text-indigo-600 animate-pulse" />
              </div>
              <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                Greindu vefsíðuna þína
              </h1>
              <p className="text-sm text-slate-500 mt-2 font-medium leading-relaxed">
                Sláðu inn vefslóð fyrirtækisins þíns. Gervigreindin okkar greinir hana til að fylla
                sjálfkrafa út upplýsingar, mæla með markhópum og hanna fyrstu auglýsingatextana
                þína.
              </p>
            </div>

            <form onSubmit={handleStartScrape} className="space-y-4 pt-4 max-w-lg mx-auto">
              <div className="relative">
                <Input
                  label="Vefslóð fyrirtækis"
                  placeholder="Dæmi: blomabudin.is eða https://minnbud.is"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  disabled={isLoading}
                  className="pl-4 py-4 rounded-xl text-base"
                />
              </div>

              {isLoading ? (
                <div className="flex flex-col items-center justify-center p-6 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
                  <Loader2 className="h-8 w-8 text-indigo-600 animate-spin" />
                  <span className="text-sm font-semibold text-slate-700">
                    Skoðum vefsíðuna þína...
                  </span>
                  <span className="text-xs text-slate-400">
                    Sækjum heiti, lýsingu og greinum helstu efnisflokka
                  </span>
                </div>
              ) : (
                <div className="space-y-2">
                  <Button
                    type="submit"
                    className="w-full py-4 text-base font-bold rounded-xl shadow-lg shadow-indigo-600/10 flex items-center justify-center gap-2"
                  >
                    Greina vefsíðu og halda áfram
                    <ArrowRight className="h-5 w-5" />
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    onClick={handleSkipScrape}
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
                Stofna auglýsendaaðgang
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Gervigreindin greindi vefsíðuna þína og pre-fyllti út fyrirtækjaupplýsingar.
                Lagfærðu eða bættu við það sem upp á vantar.
              </p>
            </div>

            {/* AI Scrape Results Card */}
            {scrapedConfidence !== null && (
              <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-xl flex items-start gap-3">
                <Sparkles className="h-5 w-5 text-indigo-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold text-indigo-800">
                    Sjálfvirk vefgreining gervigreindar
                  </h4>
                  <p className="text-xs text-indigo-600 mt-0.5 leading-relaxed">
                    Vefsíðan þín var flokkuð sem{' '}
                    <strong>
                      {scrapedCategories.map((cat) => translateCategory(cat)).join(', ') ||
                        'Almennt / Annað'}
                    </strong>{' '}
                    með {Math.round(scrapedConfidence * 100)}% nákvæmni. Þetta verður notað til að
                    mæla með bestu birtingarstöðunum fyrir auglýsingar þínar.
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Nafn fyrirtækis (Eigandi aðgangs) *"
                placeholder="Dæmi: Blómabúðin ehf."
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                required
                disabled={createAdvertiser.isPending}
              />

              <Input
                label="Vefslóð"
                placeholder="Dæmi: https://blomabudin.is"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                disabled={createAdvertiser.isPending}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Kennitala fyrirtækis *"
                placeholder="Dæmi: 550621-1230"
                value={kennitala}
                onChange={(e) => setKennitala(e.target.value)}
                required
                disabled={createAdvertiser.isPending}
              />

              <Input
                label="VSK-númer *"
                placeholder="Dæmi: 123456"
                value={vatNumber}
                onChange={(e) => setVatNumber(e.target.value)}
                required
                disabled={createAdvertiser.isPending}
              />
            </div>

            <Input
              label="Netfang fyrir reikninga *"
              type="email"
              placeholder="bokanir@blomabudin.is"
              value={billingEmail}
              onChange={(e) => setBillingEmail(e.target.value)}
              required
              disabled={createAdvertiser.isPending}
            />

            {/* AI Copywriting Suggestions Card */}
            {websiteUrl.trim() && (
              <div className="mt-6 border border-slate-200/80 rounded-xl bg-slate-50/50 p-4 md:p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="h-4 w-4 text-indigo-600" />
                  <h3 className="text-sm font-bold text-slate-800">
                    Tillögur að auglýsingatextum (AI Copy Suggestions)
                  </h3>
                </div>
                <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                  Hér eru drög að auglýsingum sem gervigreindin hannaði út frá vefnum þínum. Þú
                  getur afritað þær og notað þegar þú stofnar fyrstu herferðina þína!
                </p>

                <div className="space-y-3">
                  {adSuggestions.map((ad, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-white border border-slate-100 rounded-lg shadow-sm flex items-start justify-between gap-4 hover:border-slate-200 transition-colors"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="text-xs font-bold text-indigo-600 truncate">
                          {ad.headline}
                        </div>
                        <div className="text-[11px] text-slate-600 leading-snug line-clamp-2">
                          {ad.description}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopyText(`Fyrirsögn: ${ad.headline}\nTexti: ${ad.description}`, idx)
                        }
                        className="p-1.5 hover:bg-slate-50 rounded text-slate-400 hover:text-slate-600 transition-colors shrink-0 border border-slate-100"
                        title="Afrita texta"
                      >
                        {copiedIndex === idx ? (
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
                disabled={createAdvertiser.isPending}
                onClick={() => setStep(1)}
                className="flex items-center gap-1"
              >
                <ArrowLeft className="h-4 w-4" />
                Til baka
              </Button>

              <Button
                type="submit"
                loading={createAdvertiser.isPending}
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
