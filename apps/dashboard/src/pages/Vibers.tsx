import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/lib/auth-context';
import { 
  Sparkles, 
  Terminal, 
  Database, 
  Code2, 
  Coins, 
  Lock, 
  RefreshCw, 
  ArrowRight, 
  CheckCircle2, 
  AlertCircle, 
  Cpu, 
  Zap
} from 'lucide-react';

export default function Vibers() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  useEffect(() => {
    // Dynamic noindex settings for search engines
    let metaRobots = document.querySelector('meta[name="robots"]');
    if (!metaRobots) {
      metaRobots = document.createElement('meta');
      metaRobots.setAttribute('name', 'robots');
      document.head.appendChild(metaRobots);
    }
    const originalContent = metaRobots.getAttribute('content');
    metaRobots.setAttribute('content', 'noindex, nofollow');

    // Set page title dynamically
    const originalTitle = document.title;
    document.title = "Hæ Árni og Villi! | Birtingur";

    return () => {
      if (metaRobots) {
        if (originalContent) {
          metaRobots.setAttribute('content', originalContent);
        } else {
          metaRobots.remove();
        }
      }
      document.title = originalTitle;
    };
  }, []);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(id);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleMinarSidur = () => {
    const lastRole = localStorage.getItem('ada_last_role');
    if (lastRole === 'advertiser') {
      navigate('/advertiser');
    } else if (lastRole === 'publisher') {
      navigate('/publisher');
    } else {
      navigate('/role');
    }
  };

  const snippetCode = `<!-- 1. Plássið þar sem borðinn á að birtast -->
<div data-adplatform-slot="slot_id_hér" style="min-height: 250px;"></div>

<!-- 2. Async skriftan sem hleður og birtir borðann -->
<script async src="https://cdn.birtingur.is/v1/snippet.js"></script>`;

  const webComponentsCode = `<!-- Hlaða inn vefhlutum (Web Components) -->
<script type="module" src="https://cdn.birtingur.is/v1/widgets.js"></script>

<!-- Tölfræði fyrir útgefanda -->
<adplatform-stats publisher-id="pub_123"></adplatform-stats>

<!-- Samþykkisbiðröð útgefanda (Approval Queue) -->
<adplatform-approval-queue publisher-id="pub_123"></adplatform-approval-queue>`;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans antialiased overflow-x-hidden selection:bg-blue-600 selection:text-white">
      {/* Background Ambient Gradients */}
      <div className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full bg-blue-500/5 blur-[120px] pointer-events-none -z-10" />
      <div className="absolute top-1/3 right-10 w-[500px] h-[500px] rounded-full bg-violet-500/5 blur-[100px] pointer-events-none -z-10" />

      {/* HEADER - MATCHES LANDING PAGE */}
      <header className="sticky top-0 z-50 backdrop-blur-lg bg-white/85 border-b border-slate-200/60 transition-all duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 cursor-pointer">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center font-extrabold text-xl text-white shadow-lg shadow-blue-500/20">
              B
            </div>
            <div>
              <span className="font-extrabold text-2xl tracking-tight text-slate-900">
                Birtingur
              </span>
              <span className="hidden sm:inline text-xs font-semibold px-2.5 py-0.5 ml-2 rounded-full bg-red-50 text-red-600 border border-red-200/60">
                Lokað / Vibers 🤫
              </span>
            </div>
          </Link>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-1.5 lg:gap-3 bg-white/80 border border-slate-200/80 px-2 py-1.5 rounded-full shadow-xs">
            <Link to="/" className="px-4 py-1.5 rounded-full text-sm font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100/80">
              Yfirlit
            </Link>
            <Link to="/?tab=advertisers" className="px-4 py-1.5 rounded-full text-sm font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100/80">
              Fyrir auglýsendur
            </Link>
            <Link to="/?tab=publishers" className="px-4 py-1.5 rounded-full text-sm font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100/80">
              Fyrir útgefendur
            </Link>
            <Link to="/?tab=faq" className="px-4 py-1.5 rounded-full text-sm font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100/80">
              Spurningar (FAQ)
            </Link>
          </nav>

          {/* CTA Buttons */}
          <div className="flex items-center gap-4">
            {user ? (
              <button
                id="btn_nav_dashboard"
                onClick={handleMinarSidur}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 font-bold text-sm text-white shadow-lg shadow-blue-600/20 hover:shadow-blue-500/30 transition-all duration-200 cursor-pointer"
              >
                Mínar síður <ArrowRight size={16} />
              </button>
            ) : (
              <>
                <button
                  id="btn_nav_signin"
                  onClick={() => navigate('/sign-in')}
                  className="px-4 py-2.5 text-sm font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                >
                  Skrá inn
                </button>
                <button
                  id="btn_nav_register"
                  onClick={() => navigate('/sign-in')}
                  className="hidden sm:inline-block px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 font-bold text-sm text-white shadow-lg shadow-blue-600/20 hover:shadow-blue-500/30 transition-all duration-200 cursor-pointer"
                >
                  Nýskráning
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="grow max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 md:py-20 space-y-20 relative">
        
        {/* HERO SECTION */}
        <section className="space-y-6 text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200/80 text-xs font-bold uppercase tracking-wider">
            <Sparkles size={14} className="text-blue-600" />
            Tæknilegt Yfirlit
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-slate-900 tracking-tight leading-none">
            Hæ Árni og Villi! 👋
            <span className="block mt-3 bg-gradient-to-r from-blue-600 via-sky-600 to-indigo-600 bg-clip-text text-transparent">
              Velkomin í Birting
            </span>
          </h1>
          <p className="text-base sm:text-lg text-slate-550 leading-relaxed font-medium max-w-2xl mx-auto">
            Þessi síða er lokuð almenningi og vefskriðum. Hér er yfirgripsmikið tæknilegt yfirlit yfir innviði og fjármagnsflæði Birtingar 
            (<span className="text-blue-600 font-semibold">birtingur.app</span>) og hvernig <strong>væb-coders</strong> geta notað kerfið.
          </p>
        </section>

        {/* 3 CORE PILLARS OF BIRTINGUR */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="bg-white border-slate-200/80 p-8 flex flex-col justify-between space-y-4 shadow-sm hover:shadow-md transition-all">
            <div>
              <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 mb-5">
                <Database size={24} />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Innviðir & Firestore</h3>
              <p className="text-sm text-slate-500 leading-relaxed font-medium">
                Gagnagrunnurinn byggir á 8 megin söfnum (collections) í Firestore sem tengja útgefendur, auglýsendur, 
                herferðir og tölfræði saman í eina heild án flókinna SQL tengsla.
              </p>
            </div>
          </Card>

          <Card className="bg-white border-slate-200/80 p-8 flex flex-col justify-between space-y-4 shadow-sm hover:shadow-md transition-all">
            <div>
              <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 mb-5">
                <Coins size={24} />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Wallet & Ledger</h3>
              <p className="text-sm text-slate-500 leading-relaxed font-medium">
                Veski auglýsenda notast við append-only færslur (Ledger). Engar gamlar færslur eru uppfærðar, sem tryggir 
                fullkominn rekjanleika bókhalds og kemur í veg fyrir tvítalningu.
              </p>
            </div>
          </Card>

          <Card className="bg-white border-slate-200/80 p-8 flex flex-col justify-between space-y-4 shadow-sm hover:shadow-md transition-all">
            <div>
              <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600 mb-5">
                <Code2 size={24} />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Hönnun fyrir Væb-coders</h3>
              <p className="text-sm text-slate-500 leading-relaxed font-medium">
                Embed skrifta (snippet.js) sem hleðst í bakgrunni og er undir 1.5 KB að stærð. Hún fellur hljóðlega niður (fail-silent) 
                ef eitthvað fer úrskeiðis án þess að breyta útliti síðunnar.
              </p>
            </div>
          </Card>
        </section>

        {/* 1. SECTION: SYSTEM ARCHITECTURE */}
        <section className="space-y-6 pt-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
              <Cpu size={18} />
            </div>
            <h2 className="text-2xl font-black text-slate-900">1. Kerfishönnun og Firestore Gagnaskipulag</h2>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-7 space-y-4 text-sm text-slate-600 leading-relaxed font-medium">
              <p>
                Birtingur er hannaður með einfaldleika og hraða í huga. Firestore er notað sem aðalgagnalind 
                og samanstendur af eftirfarandi söfnum (Collections):
              </p>
              
              <ul className="space-y-3 pt-2">
                <li className="flex items-start gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600 mt-2 shrink-0" />
                  <div>
                    <strong className="text-slate-900">publishers</strong> (Útgefendur): Lén, greiðsluupplýsingar og bannaðir flokkar auglýsinga.
                  </div>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600 mt-2 shrink-0" />
                  <div>
                    <strong className="text-slate-900">slots</strong> (Auglýsingapláss): Pláss á vefjum, stærðir (t.d. 300x250) og verðstillingar (CPM).
                  </div>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600 mt-2 shrink-0" />
                  <div>
                    <strong className="text-slate-900">advertisers</strong> (Auglýsendur): Fyrirtækjaupplýsingar, kennitölur og reikningshald.
                  </div>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600 mt-2 shrink-0" />
                  <div>
                    <strong className="text-slate-900">creatives</strong> (Auglýsingamyndir): Slóðir á hlaðnar auglýsingamyndir. Fara í gegnum sjálfvirka Gemini AI skönnun á nsfw/ofbeldi áður en þær eru samþykktar.
                  </div>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600 mt-2 shrink-0" />
                  <div>
                    <strong className="text-slate-900">campaigns</strong> (Herferðir): Tengir saman auglýsanda, mynd, og ákveðið pláss og geymir fjárhagsáætlun.
                  </div>
                </li>
              </ul>
            </div>
            
            <div className="lg:col-span-5 bg-white border border-slate-200/80 rounded-2xl p-6 space-y-4 shadow-xs">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Gagnaflæðismynd</h4>
              <div className="space-y-3 font-mono text-xs text-slate-700">
                <div className="p-3 bg-slate-50 rounded border border-slate-200/60 flex items-center justify-between">
                  <span className="font-semibold text-slate-800">Publishers ➔ Slots</span>
                  <span className="text-slate-500 font-semibold">1:N tenging</span>
                </div>
                <div className="p-3 bg-slate-50 rounded border border-slate-200/60 flex items-center justify-between">
                  <span className="font-semibold text-slate-800">Advertisers ➔ Campaigns</span>
                  <span className="text-slate-500 font-semibold">1:N tenging</span>
                </div>
                <div className="p-3 bg-slate-50 rounded border border-slate-200/60 flex items-center justify-between">
                  <span className="font-semibold text-slate-800">Campaigns ➔ Target Slot</span>
                  <span className="text-slate-500 font-semibold">1:1 tenging</span>
                </div>
                <div className="p-3 bg-slate-50 rounded border border-slate-200/60 flex items-center justify-between">
                  <span className="font-semibold text-slate-800">Campaigns ➔ Creatives</span>
                  <span className="text-slate-500 font-semibold">1:1 tenging</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 2. SECTION: FINANCIAL FLOW & WALLET SYSTEM */}
        <section className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
              <Coins size={18} />
            </div>
            <h2 className="text-2xl font-black text-slate-900">2. Bókhald og Fjármagnsflæði (Ledger)</h2>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <Card className="bg-white border-slate-200/80 p-6 space-y-4 shadow-sm">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Lock size={18} className="text-blue-600" />
                Append-Only Ledger
              </h3>
              <p className="text-sm text-slate-500 leading-relaxed font-medium">
                Veski (wallet) auglýsanda er reiknað út sem **summa allra færslna** í <code className="text-indigo-650 bg-slate-100 px-1 py-0.5 rounded text-xs font-semibold">ledger</code> safninu. 
                Þetta útilokar tapsáhættu og gefur 100% rekjanleika.
              </p>
              <ul className="text-xs text-slate-600 space-y-2 font-mono bg-slate-50 p-4 rounded-xl border border-slate-250/60">
                <li className="flex justify-between border-b border-slate-200/80 pb-1.5">
                  <span className="font-semibold">Kortagreiðsla (Teya Webhook):</span>
                  <span className="text-green-600 font-bold">+50.000 kr (type: topup)</span>
                </li>
                <li className="flex justify-between border-b border-slate-200/80 pb-1.5">
                  <span className="font-semibold">Auglýsingabirting (Accrual):</span>
                  <span className="text-red-500 font-bold">-1.200 kr (type: accrual)</span>
                </li>
                <li className="flex justify-between pb-0.5">
                  <span className="font-semibold">Endurgreiðsla vegna afbókunar:</span>
                  <span className="text-green-600 font-bold">+450 kr (type: refund)</span>
                </li>
              </ul>
            </Card>

            <Card className="bg-white border-slate-200/80 p-6 space-y-4 shadow-sm">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <RefreshCw size={18} className="text-indigo-600" />
                Hraði & Caching (Redis og Cron)
              </h3>
              <p className="text-sm text-slate-500 leading-relaxed font-medium">
                Til að tryggja að ad-serving mótorinn (Vercel Edge functions) svari á undir <strong>15ms</strong>, safnast birtingar 
                og smellir fyrst í <strong>Upstash Redis</strong> hraðminni í stað Firestore.
              </p>
              <div className="text-xs text-slate-600 bg-slate-50 p-4 rounded-xl border border-slate-250/60 leading-relaxed font-medium">
                <span className="text-blue-600 font-bold">15 mínútna fresti (Accrual Cron):</span> Sækir birtingatölfræði úr Redis, 
                reiknar eyðslu herferða <code className="text-xs text-indigo-600 font-mono">(impressions * CPM / 1000)</code> 
                og skrifar neikvæða færslu í Firestore ledger.
              </div>
            </Card>
          </div>

          <div className="bg-blue-50 border border-blue-200/60 rounded-2xl p-6">
            <h4 className="text-sm font-bold text-slate-900 mb-2">Greiðslur til útgefenda: 80/20 skiptingin</h4>
            <p className="text-sm text-slate-600 leading-relaxed font-medium">
              Í lok hvers mánaðar keyrir <code className="text-xs text-indigo-650 bg-slate-100 px-1 py-0.5 rounded font-mono font-bold">cron-payouts</code>. 
              Útgefandi fær greitt <strong>80% af heildarupphæðinni</strong> sem safnaðist beint inn á bankareikning, 
              á meðan 20% ADA þóknun stendur eftir fyrir rekstri kerfisins hjá Birtingi.
            </p>
          </div>
        </section>

        {/* 3. SECTION: DEVELOPER GUIDE / VÆB-CODERS */}
        <section className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center text-purple-600">
              <Code2 size={18} />
            </div>
            <h2 className="text-2xl font-black text-slate-900">3. Leiðarvísir fyrir Væb-Coders (Samþætting)</h2>
          </div>

          <div className="space-y-4 text-sm text-slate-600 leading-relaxed font-medium">
            <p>
              Samþætting Birtingar er hönnuð til að vera eins einföld og afkastamikil og mögulegt er fyrir vefforritara.
            </p>
          </div>

          {/* CODE SNIPPET AND RESILIENCE DETAILS */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* Snippet Block */}
            <div className="lg:col-span-7 space-y-6">
              {/* HTML Snippet */}
              <div className="rounded-xl bg-slate-900 border border-slate-850 overflow-hidden shadow-md">
                <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-950">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-red-500" />
                    <span className="w-3 h-3 rounded-full bg-yellow-500" />
                    <span className="w-3 h-3 rounded-full bg-green-500" />
                    <span className="text-xs font-bold text-slate-400 ml-2 font-mono">embed-snippet.html</span>
                  </div>
                  <Button 
                    variant="ghost" 
                    id="btn_copy_snippet"
                    onClick={() => handleCopy(snippetCode, 'snippet')} 
                    className="text-xs py-1.5 px-3 h-auto font-bold text-slate-400 hover:text-white hover:bg-slate-800"
                  >
                    {copiedCode === 'snippet' ? 'Afritað!' : 'Afrita kóða'}
                  </Button>
                </div>
                <pre className="p-5 font-mono text-xs text-slate-300 overflow-x-auto bg-slate-900 leading-relaxed">
                  <code>
                    <span className="text-slate-500">&lt;!-- 1. Plássið þar sem borðinn á að birtast --&gt;</span>{"\n"}
                    <span className="text-sky-400">&lt;div</span> <span className="text-amber-400">data-adplatform-slot</span>=<span className="text-emerald-400">"slot_id_hér"</span> <span className="text-amber-400">style</span>=<span className="text-emerald-400">"min-height: 250px;"</span><span className="text-sky-400">&gt;&lt;/div&gt;</span>{"\n\n"}
                    <span className="text-slate-500">&lt;!-- 2. Async skriftan sem hleður og birtir borðann --&gt;</span>{"\n"}
                    <span className="text-sky-400">&lt;script</span> <span className="text-amber-400">async</span> <span className="text-amber-400">src</span>=<span className="text-emerald-400">"https://cdn.birtingur.is/v1/snippet.js"</span><span className="text-sky-400">&gt;&lt;/script&gt;</span>
                  </code>
                </pre>
              </div>

              {/* Web Components */}
              <div className="rounded-xl bg-slate-900 border border-slate-850 overflow-hidden shadow-md">
                <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-950">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-red-500" />
                    <span className="w-3 h-3 rounded-full bg-yellow-500" />
                    <span className="w-3 h-3 rounded-full bg-green-500" />
                    <span className="text-xs font-bold text-slate-400 ml-2 font-mono">web-components.html</span>
                  </div>
                  <Button 
                    variant="ghost" 
                    id="btn_copy_wc"
                    onClick={() => handleCopy(webComponentsCode, 'wc')} 
                    className="text-xs py-1.5 px-3 h-auto font-bold text-slate-400 hover:text-white hover:bg-slate-800"
                  >
                    {copiedCode === 'wc' ? 'Afritað!' : 'Afrita kóða'}
                  </Button>
                </div>
                <pre className="p-5 font-mono text-xs text-slate-300 overflow-x-auto bg-slate-900 leading-relaxed">
                  <code>
                    <span className="text-slate-500">&lt;!-- Hlaða inn vefhlutum (Web Components) --&gt;</span>{"\n"}
                    <span className="text-sky-400">&lt;script</span> <span className="text-amber-400">type</span>=<span className="text-emerald-400">"module"</span> <span className="text-amber-400">src</span>=<span className="text-emerald-400">"https://cdn.birtingur.is/v1/widgets.js"</span><span className="text-sky-400">&gt;&lt;/script&gt;</span>{"\n\n"}
                    <span className="text-slate-500">&lt;!-- Tölfræði fyrir útgefanda --&gt;</span>{"\n"}
                    <span className="text-sky-400">&lt;adplatform-stats</span> <span className="text-amber-400">publisher-id</span>=<span className="text-emerald-400">"pub_123"</span><span className="text-sky-400">&gt;&lt;/adplatform-stats&gt;</span>{"\n\n"}
                    <span className="text-slate-500">&lt;!-- Samþykkisbiðröð útgefanda --&gt;</span>{"\n"}
                    <span className="text-sky-400">&lt;adplatform-approval-queue</span> <span className="text-amber-400">publisher-id</span>=<span className="text-emerald-400">"pub_123"</span><span className="text-sky-400">&gt;&lt;/adplatform-approval-queue&gt;</span>
                  </code>
                </pre>
              </div>
            </div>

            {/* Performance and Resilience specs */}
            <div className="lg:col-span-5 space-y-6">
              <Card className="bg-white border-slate-200/80 p-6 space-y-5 shadow-sm">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Zap size={18} className="text-amber-500 animate-pulse" />
                  Hönnunarskilmálar (Resilience Specs)
                </h3>
                
                <div className="space-y-4 text-xs font-semibold text-slate-500">
                  <div className="flex gap-3">
                    <CheckCircle2 size={16} className="text-green-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-slate-900 block mb-0.5">Lágmarks stærð (under 1.5 KB)</strong>
                      Skriftan er þjöppuð með esbuild. Hún hleðst alveg í bakgrunni (async) og hefur engin áhrif á SEO eða PageSpeed einkunn.
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <CheckCircle2 size={16} className="text-green-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-slate-900 block mb-0.5">Fail-Silent hönnun</strong>
                      Öll virkni er vafin inn í global try-catch blokk. Ef netið dettur út eða API-inn hægir á sér hrynur vefsíðan aldrei. Skriftan hættir keyrslu hljóðlega.
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <CheckCircle2 size={16} className="text-green-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-slate-900 block mb-0.5">Engin auð svæði (No Layout Shift)</strong>
                      Ef engin auglýsing finnst eða villa kemur upp er target hólfið falið sjálfkrafa með <code className="text-xs bg-slate-100 text-indigo-750 px-1 py-0.5 rounded font-mono">display: none</code> svo það skilji ekki eftir stór hvít svæði á síðunni.
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <CheckCircle2 size={16} className="text-green-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-slate-900 block mb-0.5">CMP Consent Detection</strong>
                      Skriftan athugar stöðu IAB CMP samþykkis vafra (<code className="text-xs bg-slate-100 text-indigo-750 px-1 py-0.5 rounded font-mono">window.__cmpConsent</code>) áður en mælipixlar eru sóttir eða keyrðir.
                    </div>
                  </div>
                </div>
              </Card>

              {/* Dev Note */}
              <div className="p-4 rounded-xl bg-blue-50 border border-blue-200/50 text-xs text-blue-800 leading-relaxed font-semibold">
                <div className="flex gap-2.5 items-start">
                  <AlertCircle size={16} className="shrink-0 mt-0.5 text-blue-600" />
                  <div>
                    <strong>Tæknilegt atriði:</strong> Embed skriftunni er dreift frá Cloudflare R2 CDN með Wrangler CLI, sem lágmarkar viðbragðstíma á heimsvísu.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

      </main>

      {/* FOOTER - MATCHES LANDING PAGE */}
      <footer className="bg-white border-t border-slate-200/80 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {/* Logo/Info */}
            <div className="space-y-4">
              <Link to="/" className="flex items-center gap-2 cursor-pointer">
                <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-extrabold text-sm text-white shadow-md shadow-blue-500/20">
                  B
                </div>
                <span className="font-extrabold text-lg text-slate-850">Birtingur</span>
              </Link>
              <p className="text-xs text-slate-500 leading-relaxed font-medium">
                Nútímaleg auglýsingamiðlun ehf.
                <br />
                Kt. 560126-1020 | VSK nr. 148902
                <br />
                Laugavegur 182, 105 Reykjavík
              </p>
            </div>

            {/* Links Advertiser */}
            <div>
              <h4 className="text-xs uppercase font-extrabold tracking-wider text-slate-500 mb-3">
                Auglýsendur
              </h4>
              <ul className="space-y-2 text-xs font-semibold">
                <li>
                  <Link to="/?tab=advertisers" className="text-slate-500 hover:text-slate-850 transition">
                    Stofna herferð
                  </Link>
                </li>
                <li>
                  <Link to="/?tab=advertisers" className="text-slate-500 hover:text-slate-850 transition">
                    Inneignir og greiðslur
                  </Link>
                </li>
              </ul>
            </div>

            {/* Links Publisher */}
            <div>
              <h4 className="text-xs uppercase font-extrabold tracking-wider text-slate-500 mb-3">
                Útgefendur
              </h4>
              <ul className="space-y-2 text-xs font-semibold">
                <li>
                  <Link to="/?tab=publishers" className="text-slate-500 hover:text-slate-850 transition">
                    Sækja kóða
                  </Link>
                </li>
                <li>
                  <Link to="/?tab=publishers" className="text-slate-500 hover:text-slate-850 transition">
                    Tekjuöflun
                  </Link>
                </li>
              </ul>
            </div>

            {/* Legal / Contact */}
            <div>
              <h4 className="text-xs uppercase font-extrabold tracking-wider text-slate-500 mb-3">
                Þjónusta
              </h4>
              <ul className="space-y-2 text-xs text-slate-500 font-semibold">
                <li>
                  Hafa samband:{' '}
                  <a href="mailto:info@birtingur.app" className="text-slate-550 hover:text-slate-850 transition">
                    info@birtingur.app
                  </a>
                </li>
                <li>Hjálparmiðstöð & FAQ</li>
              </ul>
            </div>
          </div>

          <div className="pt-8 border-t border-slate-100 mt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <span className="text-[10px] text-slate-500 font-semibold">
              © 2026 Birtingur (birtingur.app) – Nútímaleg auglýsingamiðlun. Allur réttur áskilinn.
            </span>
            <div className="flex gap-4 text-[10px] text-slate-550 font-semibold">
              <Link to="/?tab=terms" className="hover:text-slate-800 transition">
                Notendaskilmálar
              </Link>
              <Link to="/?tab=terms" className="hover:text-slate-800 transition">
                Persónuverndarstefna
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
