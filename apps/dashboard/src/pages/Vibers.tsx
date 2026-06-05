import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
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
  Layers, 
  Zap,
  BookOpen
} from 'lucide-react';

export default function Vibers() {
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

  const snippetCode = `<!-- 1. Plássið þar sem borðinn á að birtast -->
<div data-adplatform-slot="slot_id_hér" style="min-height: 250px;"></div>

<!-- 2. Async skriftan sem hleður og birtir borðann (ætti að vera í <head> eða undir <body>) -->
<script async src="https://cdn.birtingur.is/v1/snippet.js"></script>`;

  const webComponentsCode = `<!-- Hlaða inn vefhlutum (Web Components) -->
<script type="module" src="https://cdn.birtingur.is/v1/widgets.js"></script>

<!-- Tölfræði fyrir útgefanda -->
<adplatform-stats publisher-id="pub_123"></adplatform-stats>

<!-- Tölfræði fyrir herferð auglýsanda -->
<adplatform-campaign-stats campaign-id="camp_456"></adplatform-campaign-stats>

<!-- Samþykkisbiðröð útgefanda (Approval Queue) -->
<adplatform-approval-queue publisher-id="pub_123"></adplatform-approval-queue>`;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans antialiased selection:bg-blue-600 selection:text-white pb-24 overflow-x-hidden">
      {/* Glow ambient background effects */}
      <div className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full bg-blue-600/10 blur-[130px] pointer-events-none -z-10 animate-pulse-slow" />
      <div className="absolute top-1/3 right-10 w-[500px] h-[500px] rounded-full bg-indigo-600/10 blur-[120px] pointer-events-none -z-10" />
      <div className="absolute bottom-10 left-10 w-[400px] h-[400px] rounded-full bg-purple-600/10 blur-[110px] pointer-events-none -z-10" />

      {/* HEADER SECTION */}
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center font-black text-xl text-white shadow-lg shadow-blue-500/30">
              B
            </div>
            <div>
              <span className="font-extrabold text-2xl tracking-tight text-white">
                Birtingur
              </span>
              <span className="ml-3 inline-flex items-center px-2.5 py-0.5 text-xs font-bold rounded-md border bg-slate-900 border-slate-800 text-slate-400">
                Lokaður kynningarvefur
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">noindex / private</span>
          </div>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="max-w-6xl mx-auto px-6 pt-12 sm:pt-20 space-y-20 relative">
        
        {/* WELCOME HERO */}
        <section className="space-y-6 text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs font-bold uppercase tracking-wider">
            <Sparkles size={14} className="animate-spin-slow" />
            Halló Árni & Villi!
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-none">
            Hæ Árni og Villi! 👋
            <span className="block mt-3 bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent">
              Velkomin í Birting
            </span>
          </h1>
          <p className="text-base sm:text-lg text-slate-400 leading-relaxed font-medium">
            Hér er leynilegur tæknilegur leiðarvísir sem útskýrir nákvæmlega hvernig Birtingur 
            (<span className="text-blue-400">birtingur.app</span>) virkar bak við tjöldin, hvernig fjármagnsflæðið er tryggt 
            og hvernig <strong>væb-coders</strong> geta samþætt kerfið við sína vefi á örskotsstundu.
          </p>
        </section>

        {/* 3 CORE PILLARS OF BIRTINGUR */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="bg-slate-900/40 border-slate-800/80 p-6 flex flex-col justify-between space-y-4 hover:border-slate-700/80 transition-all shadow-none">
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Database size={24} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white mb-2">Innviðir & Firestore</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Styðst við 8 Firestore söfn (collections) sem tengja útgefendur, auglýsendur, herferðir 
                og tölfræði saman í eina heildstæða og hraðvirka gagnalausn.
              </p>
            </div>
          </Card>

          <Card className="bg-slate-900/40 border-slate-800/80 p-6 flex flex-col justify-between space-y-4 hover:border-slate-700/80 transition-all shadow-none">
            <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Coins size={24} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white mb-2">Wallet & Append-Only Ledger</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Ledger bókhaldskerfið er append-only. Engar breytingar eru gerðar á gömlum færslum, sem tryggir 
                100% rekjanleika og kemur í veg fyrir tvítalningu eða tapsáhættu.
              </p>
            </div>
          </Card>

          <Card className="bg-slate-900/40 border-slate-800/80 p-6 flex flex-col justify-between space-y-4 hover:border-slate-700/80 transition-all shadow-none">
            <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <Code2 size={24} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white mb-2">Hönnun fyrir Væb-coders</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Embed skrifta (snippet.js) sem er undir 1.5 KB að stærð, með innbyggðu global try-catch varnarkerfi 
                og sjálfvirkri nýtingu á IAB samþykki (CMP detection).
              </p>
            </div>
          </Card>
        </section>

        {/* 1. SECTION: SYSTEM ARCHITECTURE */}
        <section className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Cpu size={16} />
            </div>
            <h2 className="text-2xl font-extrabold text-white">1. Kerfishönnun og Firestore Gagnaskipulag</h2>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-7 space-y-4 text-sm text-slate-400 leading-relaxed font-medium">
              <p>
                Birtingur er hannaður sem nútímalegur microservice-vænn vettvangur. Meginhólf gagnaflæðisins 
                samanstendur af 8 aðalsöfnum (Collections) í Firestore:
              </p>
              
              <ul className="space-y-3 pt-2">
                <li className="flex items-start gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-2 shrink-0" />
                  <div>
                    <strong className="text-slate-200">publishers</strong>: Útgefendur og eigendur lénsins. Geymir upplýsingar 
                    um bankareikninga og útgreiðslustillingar.
                  </div>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-2 shrink-0" />
                  <div>
                    <strong className="text-slate-200">slots</strong>: Einstök auglýsingapláss á vefnum (t.d. hliðarborðar 300x250 eða risaborðar 970x250).
                  </div>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-2 shrink-0" />
                  <div>
                    <strong className="text-slate-200">advertisers</strong>: Auglýsendur, kennitölur, VSK-númer og reikningaupplýsingar.
                  </div>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-2 shrink-0" />
                  <div>
                    <strong className="text-slate-200">creatives</strong>: Auglýsingarnar sjálfar. Þær fara í gegnum sjálfvirka skönnun með Gemini (safety screening) áður en þær eru samþykktar.
                  </div>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-2 shrink-0" />
                  <div>
                    <strong className="text-slate-200">campaigns</strong>: Herferðir sem tengja saman auglýsanda, mynd (creative), pláss (slot) og fjárhagsáætlun.
                  </div>
                </li>
              </ul>
            </div>
            
            <div className="lg:col-span-5 bg-slate-900/50 border border-slate-900 rounded-2xl p-6 space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Tengslamynd gagnaflæðis</h4>
              <div className="space-y-3 font-mono text-xs text-indigo-300">
                <div className="p-3 bg-slate-950 rounded border border-slate-900 flex items-center justify-between">
                  <span>Publishers ➔ Slots</span>
                  <span className="text-slate-500">owns 1:N</span>
                </div>
                <div className="p-3 bg-slate-950 rounded border border-slate-900 flex items-center justify-between">
                  <span>Advertisers ➔ Campaigns</span>
                  <span className="text-slate-500">runs 1:N</span>
                </div>
                <div className="p-3 bg-slate-950 rounded border border-slate-900 flex items-center justify-between">
                  <span>Campaigns ➔ Target Slot</span>
                  <span className="text-slate-500">targets 1:1</span>
                </div>
                <div className="p-3 bg-slate-950 rounded border border-slate-900 flex items-center justify-between">
                  <span>Campaigns ➔ Creatives</span>
                  <span className="text-slate-500">uses 1:1</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 2. SECTION: FINANCIAL FLOW & WALLET SYSTEM */}
        <section className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Coins size={16} />
            </div>
            <h2 className="text-2xl font-extrabold text-white">2. Fjármagnsflæði, Ledger og Hraðafestingar (Accrual & Caching)</h2>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <Card className="bg-slate-900/20 border-slate-900 p-6 space-y-4 shadow-none">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Lock size={18} className="text-blue-400" />
                Append-Only Ledger
              </h3>
              <p className="text-sm text-slate-400 leading-relaxed font-medium">
                Veski (wallet) auglýsanda er aldrei beint breytt með hefðbundnu UPDATE kalli á staka tölu. 
                Þess í stað er veskið reiknað út sem <strong>summa allra færslna</strong> í <code className="text-indigo-400 text-xs">ledger</code> safninu.
              </p>
              <ul className="text-xs text-slate-500 space-y-2 font-mono">
                <li className="flex justify-between border-b border-slate-900 pb-1.5">
                  <span>Innborgun (Teya Webhook):</span>
                  <span className="text-green-500 font-bold">+50.000 kr (type: topup)</span>
                </li>
                <li className="flex justify-between border-b border-slate-900 pb-1.5">
                  <span>Birtingar-eyðsla (Accrual):</span>
                  <span className="text-red-400 font-bold">-1.200 kr (type: accrual)</span>
                </li>
                <li className="flex justify-between pb-1">
                  <span>Endurgreiðsla vegna lokunar:</span>
                  <span className="text-green-400 font-bold">+450 kr (type: refund)</span>
                </li>
              </ul>
            </Card>

            <Card className="bg-slate-900/20 border-slate-900 p-6 space-y-4 shadow-none">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <RefreshCw size={18} className="text-indigo-400" />
                Hraðvirkni með Redis & Cron
              </h3>
              <p className="text-sm text-slate-400 leading-relaxed font-medium">
                Til að tryggja að ad-serving mótorinn (Vercel Edge functions) geti afgreitt auglýsingar á undir 
                <strong>15 millisekúndum</strong>, er allri birtingatölfræði og smellum safnað fyrst í 
                <strong>Upstash Redis</strong> hraðminni í stað Firestore.
              </p>
              <div className="text-xs text-slate-400 bg-slate-950 p-4 rounded border border-slate-900 leading-relaxed font-medium">
                <span className="text-blue-400 font-bold">15 mínútna fresti (Accrual cron):</span> Sækir birtingafjölda úr 
                Redis, reiknar út eyðsluna <code className="text-xs text-indigo-300">(impressions * CPM / 1000)</code> 
                og skrifar neikvæða accrual færslu í Firestore.
              </div>
            </Card>
          </div>

          <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-6">
            <h4 className="text-sm font-bold text-white mb-2">Útgreiðslur og 80/20 reglan</h4>
            <p className="text-sm text-slate-400 leading-relaxed font-medium">
              Í lok hvers mánaðar keyrir <code className="text-xs text-indigo-300">cron-payouts</code> skriftan. Hún tekur saman 
              heildartekjur allra plássa útgefanda. Útgefandinn fær <strong>80% af heildarupphæðinni</strong> beint greitt út 
              í banka (skráð sem <code className="text-xs text-indigo-300">netIsk</code> í <code className="text-xs text-indigo-300">payouts</code>), 
              en 20% ADA þóknun situr eftir hjá Birtingi.
            </p>
          </div>
        </section>

        {/* 3. SECTION: DEVELOPER GUIDE / VÆB-CODERS */}
        <section className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <Code2 size={16} />
            </div>
            <h2 className="text-2xl font-extrabold text-white">3. Leiðarvísir fyrir Væb-Coders (Samþætting)</h2>
          </div>

          <div className="space-y-4 text-sm text-slate-400 leading-relaxed font-medium">
            <p>
              Það hefur verið lögð gríðarleg vinna í að gera samþættingu Birtingar eins einfalda og afkastamikla 
              og mögulegt er fyrir forritara. Engin þung bókasöfn, engin flókin uppsetning.
            </p>
          </div>

          {/* CODE SNIPPET AND RESILIENCE DETAILS */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* Snippet Block */}
            <div className="lg:col-span-7 space-y-6">
              <div className="rounded-xl bg-slate-950 border border-slate-900 overflow-hidden shadow-2xl">
                <div className="px-4 py-3 border-b border-slate-900 flex items-center justify-between bg-slate-950">
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
                    className="text-xs py-1.5 px-3 h-auto font-bold text-slate-400 hover:text-white"
                  >
                    {copiedCode === 'snippet' ? 'Afritað!' : 'Afrita kóða'}
                  </Button>
                </div>
                <pre className="p-5 font-mono text-xs text-blue-400 overflow-x-auto bg-slate-950/40 leading-relaxed">
                  <code>{snippetCode}</code>
                </pre>
              </div>

              {/* Web Components */}
              <div className="rounded-xl bg-slate-950 border border-slate-900 overflow-hidden shadow-2xl">
                <div className="px-4 py-3 border-b border-slate-900 flex items-center justify-between bg-slate-950">
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
                    className="text-xs py-1.5 px-3 h-auto font-bold text-slate-400 hover:text-white"
                  >
                    {copiedCode === 'wc' ? 'Afritað!' : 'Afrita kóða'}
                  </Button>
                </div>
                <pre className="p-5 font-mono text-xs text-indigo-400 overflow-x-auto bg-slate-950/40 leading-relaxed">
                  <code>{webComponentsCode}</code>
                </pre>
              </div>
            </div>

            {/* Performance and Resilience specs */}
            <div className="lg:col-span-5 space-y-6">
              <Card className="bg-slate-900/30 border-slate-900 p-6 space-y-5 shadow-none">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Zap size={18} className="text-amber-400" />
                  Eiginleikar skriftunnar (Resilience Specs)
                </h3>
                
                <div className="space-y-4 text-xs font-medium text-slate-400">
                  <div className="flex gap-3">
                    <CheckCircle2 size={16} className="text-green-500 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-slate-200 block mb-0.5">Ultra-létt og hraðvirk</strong>
                      Undir 1.5 KB minified og gzipped. Hleðst algjörlega async án þess að hægja á vefsíðunni eða breyta PageSpeed / Lighthouse stigum.
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <CheckCircle2 size={16} className="text-green-500 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-slate-200 block mb-0.5">Fail-Silent hönnun</strong>
                      Öll skriftan er vafin inn í global try-catch. Ef netið dettur út eða bakendinn svarar ekki, hrynur síða útgefandans aldrei. Skriftan fellur hljóðlega niður.
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <CheckCircle2 size={16} className="text-green-500 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-slate-200 block mb-0.5">Sjálfvirk lokun (No Layout Shift)</strong>
                      Ef ekkert tilboð finnst eða villa kemur upp er plássinu breytt í <code className="text-xs bg-slate-900 text-indigo-300 px-1 py-0.5 rounded">display: none</code> svo það skilur ekki eftir tómt hvítt svæði á vefnum.
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <CheckCircle2 size={16} className="text-green-500 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-slate-200 block mb-0.5">CMP Consent Detection</strong>
                      Skriftan leitar sjálfkrafa að stöðluðu IAB CMP samþykki (<code className="text-xs bg-slate-900 text-indigo-300 px-1 py-0.5 rounded">window.__cmpConsent</code>) áður en mælipixlar (impressions) og auðkenni eru send.
                    </div>
                  </div>
                </div>
              </Card>

              {/* Dev Note */}
              <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/15 text-xs text-blue-400/90 leading-relaxed font-medium">
                <div className="flex gap-2.5 items-start">
                  <AlertCircle size={16} className="shrink-0 mt-0.5 text-blue-400" />
                  <div>
                    <strong>Tæknilegt atriði fyrir Wrangler CDN deployment:</strong> Skriftunni er dreift í gegnum Cloudflare R2 bucket með Wrangler CLI til að tryggja lágmarks viðbragðstíma á heimsvísu.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* BOTTOM MESSAGE */}
        <section className="text-center pt-8 border-t border-slate-900/60 max-w-2xl mx-auto space-y-4">
          <p className="text-xs text-slate-500 font-mono">
            Birtingur — Þróað með 💙 af Antigravity fyrir íslenska vefinn.
          </p>
          <div className="flex justify-center gap-4">
            <Button 
              variant="secondary" 
              id="btn_back_home"
              onClick={() => window.location.href = '/'}
              className="border-slate-800 text-slate-300 hover:bg-slate-900 hover:text-white"
            >
              Fara aftur á aðalsíðu
            </Button>
          </div>
        </section>

      </main>
    </div>
  );
}
