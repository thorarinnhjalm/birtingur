import { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/lib/auth-context';
import Logo from '@/components/ui/Logo';
import PublicFooter from '@/components/layout/PublicFooter';
import { updateSEO } from '@/lib/seo';
import {
  Sparkles,
  Target,
  ShieldCheck,
  Eye,
  ArrowRight,
  MessageSquare,
  ExternalLink,
  Zap,
  Code2,
  BarChart3,
  Users,
  Cpu,
} from 'lucide-react';

export default function Bjarni() {
  const { user } = useAuth();
  const navigate = useNavigate();

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
    updateSEO('Hæ Bjarni! | Birtingur', 'Kynning fyrir Bjarna hugmyndasmið.', '/bjarni');

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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans antialiased overflow-x-hidden selection:bg-blue-600 selection:text-white">
      {/* Background Ambient Gradients */}
      <div className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full bg-blue-500/5 blur-[120px] pointer-events-none -z-10" />
      <div className="absolute top-1/3 right-10 w-[500px] h-[500px] rounded-full bg-emerald-500/5 blur-[100px] pointer-events-none -z-10" />

      {/* HEADER */}
      <header className="sticky top-0 z-50 backdrop-blur-lg bg-white/85 border-b border-slate-200/60 transition-all duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 cursor-pointer">
            <Logo size={40} className="shadow-lg shadow-blue-500/10 rounded-xl" />
            <div>
              <span className="font-extrabold text-2xl tracking-tight text-slate-900">
                Birtingur
              </span>
              <span className="hidden sm:inline text-xs font-semibold px-2.5 py-0.5 ml-2 rounded-full text-emerald-700 bg-emerald-50 border border-emerald-200/60">
                Persónulegt 🤝
              </span>
            </div>
          </Link>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-1.5 lg:gap-3 bg-white/80 border border-slate-200/80 px-2 py-1.5 rounded-full shadow-xs">
            <Link
              to="/"
              className="px-4 py-1.5 rounded-full text-sm font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100/80"
            >
              Yfirlit
            </Link>
            <Link
              to="/?tab=advertisers"
              className="px-4 py-1.5 rounded-full text-sm font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100/80"
            >
              Fyrir auglýsendur
            </Link>
            <Link
              to="/?tab=publishers"
              className="px-4 py-1.5 rounded-full text-sm font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100/80"
            >
              Fyrir útgefendur
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
      <main className="grow max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 md:py-20 space-y-16 relative">
        {/* HERO SECTION */}
        <section className="space-y-6 text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/80 text-xs font-bold uppercase tracking-wider">
            <Sparkles size={14} className="text-emerald-600" />
            Persónuleg kynning
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-slate-900 tracking-tight leading-tight">
            Hæ Bjarni! 👋
            <span className="block mt-3 bg-linear-to-r from-blue-600 via-indigo-600 to-emerald-600 bg-clip-text text-transparent">
              Ég heiti Birtingur
            </span>
          </h1>
          <p className="text-base sm:text-lg text-slate-600 leading-relaxed font-semibold max-w-2xl mx-auto">
            Ég er programmatic ad serving vettvangur — REST API, edge-deployed, cookie-laus
            samhengismiðun. Má ég kynna mig stuttlega — frá einum tæknimanni til annars?
          </p>
        </section>

        {/* WHAT IS BIRTINGUR */}
        <section className="bg-white border border-slate-200/85 rounded-3xl p-8 sm:p-12 space-y-6 shadow-xs">
          <div className="space-y-3 max-w-3xl">
            <span className="text-xs font-bold uppercase tracking-widest text-blue-600 bg-blue-50 px-3.5 py-1 rounded-full">
              Hvað er Birtingur?
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-950">
              Ad serving platform — byggt á Íslandi
            </h2>
          </div>
          <div className="text-sm text-slate-600 leading-relaxed font-medium space-y-4 max-w-3xl">
            <p>
              Íslenski auglýsingamarkaðurinn einkennist af örfáum risastórum fréttamiðlum og dýrum
              milliliðum. Smærri útgefendur — blogg, nisjumiðlar, fagvefir — hafa enga forritanlega
              leið til að afla tekna af umferðinni sinni.
            </p>
            <p>
              Birtingur leysir þetta með <strong>sjálfvirku auglýsingakerfi</strong> sem safnar
              sérhæfðum vefjum saman á einn stað. Auglýsendur setja upp herferð í nokkrum skrefum,
              velja flokka, hlaða upp auglýsingamynd og kerfið parar sjálfkrafa. Engir símar, engir
              sölumenn.
            </p>
          </div>

          {/* Tech architecture summary */}
          <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200/80 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500">
              Stack / Arkitektúr
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-medium text-slate-700">
              <div className="space-y-1">
                <div className="font-bold text-slate-900">Serving</div>
                <div>Hono á Vercel</div>
                <div className="text-slate-500">Svarhraði mældur á beiðni</div>
              </div>
              <div className="space-y-1">
                <div className="font-bold text-slate-900">API</div>
                <div>Vercel Serverless + Firestore</div>
                <div className="text-slate-500">REST, JWT auth</div>
              </div>
              <div className="space-y-1">
                <div className="font-bold text-slate-900">Cache / Queue</div>
                <div>Upstash Redis</div>
                <div className="text-slate-500">Event aggregation</div>
              </div>
              <div className="space-y-1">
                <div className="font-bold text-slate-900">Samþætting</div>
                <div>MCP Server + React SDK</div>
                <div className="text-slate-500">Claude-native onboarding</div>
              </div>
            </div>
          </div>
        </section>

        {/* HOW IT WORKS — TECH PIPELINE */}
        <section className="space-y-8">
          <div className="space-y-3 max-w-3xl">
            <span className="text-xs font-bold uppercase tracking-widest text-indigo-600 bg-indigo-50 px-3.5 py-1 rounded-full">
              Hvernig virkar þetta?
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-950">
              Undir húddinu — þrjú skref
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="bg-white border-slate-200/80 p-8 space-y-4 shadow-sm hover:shadow-md transition-all">
              <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                <Code2 size={24} />
              </div>
              <h3 className="text-xl font-bold text-slate-950">1. Útgefandi setur kóða</h3>
              <p className="text-sm text-slate-600 leading-relaxed font-medium">
                React component eða &lt;script&gt; snippet. Einn{' '}
                <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs font-mono text-blue-700">
                  GET /v1/ad?slot=xxx
                </code>{' '}
                call. MCP-þjónn (Model Context Protocol) gefur Claude útgefandans tilbúinn kóða —
                zero manual setup.
              </p>
            </Card>

            <Card className="bg-white border-slate-200/80 p-8 space-y-4 shadow-sm hover:shadow-md transition-all">
              <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                <Eye size={24} />
              </div>
              <h3 className="text-xl font-bold text-slate-950">2. Contextual matching</h3>
              <p className="text-sm text-slate-600 leading-relaxed font-medium">
                Vélin parar herferð við efnisflokka vefsíðunnar — engar vafrakökur, engin
                persónugreinanleg gögn. IAB viewability (50% sýnilegt í 1 sek). Birtingarpixel
                skráir á 200 OK.
              </p>
            </Card>

            <Card className="bg-white border-slate-200/80 p-8 space-y-4 shadow-sm hover:shadow-md transition-all">
              <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600">
                <BarChart3 size={24} />
              </div>
              <h3 className="text-xl font-bold text-slate-950">3. Aggregation pipeline</h3>
              <p className="text-sm text-slate-600 leading-relaxed font-medium">
                Events → Redis queue → cron aggregate → Firestore stats. CPM reiknaður sjálfkrafa.
                80/20 revenue split. Sameiginlegt stjórnborð fyrir báða aðila.
              </p>
            </Card>
          </div>

          {/* API call example */}
          <div className="bg-slate-900 rounded-2xl p-6 shadow-lg overflow-x-auto">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-3 h-3 rounded-full bg-red-500/80" />
              <div className="w-3 h-3 rounded-full bg-amber-500/80" />
              <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
              <span className="ml-2 text-xs text-slate-500 font-mono">serving.birtingur.app</span>
            </div>
            <pre className="text-xs sm:text-sm font-mono leading-relaxed">
              <code>
                <span className="text-slate-500">{'>'} </span>
                <span className="text-emerald-400">GET</span>
                <span className="text-white/80"> /v1/ad?slot=slot_d9e8f5&amp;consent=none</span>
                {`\n`}
                <span className="text-slate-500">{'<'} </span>
                <span className="text-emerald-400">200 OK</span>
                <span className="text-slate-500"> 12ms</span>
                {`\n`}
                <span className="text-white/60">{'{'}</span>
                {`\n`}
                <span className="text-white/60">{'  '}</span>
                <span className="text-amber-300">"creativeId"</span>
                <span className="text-white/60">: </span>
                <span className="text-emerald-300">"crt_fad69f58..."</span>
                <span className="text-white/60">,</span>
                {`\n`}
                <span className="text-white/60">{'  '}</span>
                <span className="text-amber-300">"imageUrl"</span>
                <span className="text-white/60">: </span>
                <span className="text-emerald-300">"https://cdn.birtingur.app/..."</span>
                <span className="text-white/60">,</span>
                {`\n`}
                <span className="text-white/60">{'  '}</span>
                <span className="text-amber-300">"clickUrl"</span>
                <span className="text-white/60">: </span>
                <span className="text-emerald-300">"/v1/click?c=crt_fad69f58&amp;..."</span>
                <span className="text-white/60">,</span>
                {`\n`}
                <span className="text-white/60">{'  '}</span>
                <span className="text-amber-300">"impressionPixel"</span>
                <span className="text-white/60">: </span>
                <span className="text-emerald-300">"/v1/impression?c=crt_fad69f58&amp;..."</span>
                <span className="text-white/60">,</span>
                {`\n`}
                <span className="text-white/60">{'  '}</span>
                <span className="text-amber-300">"ttl"</span>
                <span className="text-white/60">: </span>
                <span className="text-blue-300">30</span>
                {`\n`}
                <span className="text-white/60">{'}'}</span>
              </code>
            </pre>
          </div>
        </section>

        {/* WHAT BIRTINGUR CAN DO */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          <Card className="bg-white border-slate-200/80 p-5 sm:p-6 space-y-3 shadow-sm hover:shadow-md transition-all">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
              <Users size={22} />
            </div>
            <h3 className="text-lg sm:text-xl font-bold text-slate-950">Niche media network</h3>
            <p className="text-sm text-slate-600 leading-relaxed font-medium">
              Við erum að byggja upp net sérhæfðra íslenskra vefja — blogg, áhugamálasíður og
              fagvefi. Markmiðið er umhverfi þar sem auglýsingin situr við hlið efnis sem lesandinn
              valdi sér sjálfur.
            </p>
          </Card>

          <Card className="bg-white border-slate-200/80 p-5 sm:p-6 space-y-3 shadow-sm hover:shadow-md transition-all">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
              <Target size={22} />
            </div>
            <h3 className="text-lg sm:text-xl font-bold text-slate-950">
              Eitt pláss, óskipt athygli
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed font-medium">
              Hjá okkur er <strong>eitt pláss, ein auglýsing</strong>. Enginn samkeppnisaðili á sama
              skjá. Vörumerkið þitt fær óskipta athygli lesandans.
            </p>
          </Card>

          <Card className="bg-white border-slate-200/80 p-5 sm:p-6 space-y-3 shadow-sm hover:shadow-md transition-all">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-red-50 flex items-center justify-center text-red-600">
              <ShieldCheck size={22} />
            </div>
            <h3 className="text-lg sm:text-xl font-bold text-slate-950">Cookie-laust frá grunni</h3>
            <p className="text-sm text-slate-600 leading-relaxed font-medium">
              Enginn rekjari, engin fingrafarsgreining, engin persónuleg gögn. Samhengismiðun — ekki
              vefsporun. Uppfyllir GDPR frá grunni. Ekkert samþykkisglugga þarf.
            </p>
          </Card>

          <Card className="bg-white border-slate-200/80 p-5 sm:p-6 space-y-3 shadow-sm hover:shadow-md transition-all">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
              <Cpu size={22} />
            </div>
            <h3 className="text-lg sm:text-xl font-bold text-slate-950">
              AI-powered review pipeline
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed font-medium">
              Auglýsingamyndir fara í sjálfvirka AI-skönnun fyrir birtingu. Vörumerkjaöryggi og
              efnisflokkun. Útgefendur hafa alltaf lokaorðið í samþykkisferli.
            </p>
          </Card>
        </section>

        {/* COMPARISON — mobile-friendly stacked layout */}
        <section className="bg-white border border-slate-200/85 rounded-3xl p-5 sm:p-8 md:p-12 space-y-6 shadow-xs">
          <div className="space-y-3 max-w-2xl">
            <h3 className="text-xl sm:text-2xl font-black text-slate-950">
              Samanburður: Risamiðlar vs. Birtingur
            </h3>
          </div>

          {/* Desktop: table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-550 font-bold">
                  <th className="pb-4 pr-4">Eiginleiki</th>
                  <th className="pb-4 px-4 text-slate-600">Risamiðlar</th>
                  <th className="pb-4 pl-4 text-blue-600">Birtingur</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-600 font-medium">
                {[
                  ['Umgjörð', 'Mörg pláss á sama skjá', 'Eitt pláss — óskipt athygli'],
                  ['Persónuvernd', 'Vafrakökur og vefsporun', 'Kökulaust auglýsingakerfi'],
                  [
                    'Uppsetning',
                    'Milliliðir, löng tilboðsferli',
                    'Sjálfvirk uppsetning í vefviðmóti',
                  ],
                  ['Verð', 'Oft hátt lágmark', 'Engin lágmörk — CPM 550 kr'],
                  ['Tækni', 'Tag managers, hæg load', 'REST API og IAB-staðfest sýnileikamæling'],
                ].map(([label, old, birtingur], i) => (
                  <tr key={i}>
                    <td className="py-4 pr-4 font-bold text-slate-900">{label}</td>
                    <td className="py-4 px-4">{old}</td>
                    <td className="py-4 pl-4 text-blue-800 font-bold bg-blue-50/30">{birtingur}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: stacked cards */}
          <div className="md:hidden space-y-3">
            {[
              ['Umgjörð', 'Mörg pláss á sama skjá', 'Eitt pláss — óskipt athygli'],
              ['Persónuvernd', 'Vafrakökur og vefsporun', 'Kökulaust auglýsingakerfi'],
              ['Uppsetning', 'Milliliðir, löng tilboðsferli', 'Sjálfvirk uppsetning í vefviðmóti'],
              ['Verð', 'Oft hátt lágmark', 'Engin lágmörk — CPM 550 kr'],
              ['Tækni', 'Tag managers, hæg load', 'REST API og IAB-staðfest sýnileikamæling'],
            ].map(([label, old, birtingur], i) => (
              <div
                key={i}
                className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2"
              >
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  {label}
                </div>
                <div className="text-xs text-slate-500 line-through">{old}</div>
                <div className="text-sm text-blue-800 font-bold">{birtingur}</div>
              </div>
            ))}
          </div>
        </section>

        {/* CTA SECTION */}
        <section className="bg-linear-to-br from-indigo-900 via-indigo-950 to-emerald-950 text-white rounded-3xl p-6 sm:p-8 md:p-12 space-y-8 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-80 h-80 rounded-full bg-emerald-500/10 blur-[90px] pointer-events-none -z-10" />

          <div className="space-y-3">
            <span className="text-xs font-bold uppercase tracking-widest text-emerald-300 bg-white/10 px-3.5 py-1 rounded-full w-fit">
              Tölurnar
            </span>
            <h3 className="text-xl sm:text-2xl md:text-3xl font-black text-white">
              Sjálfvirkt, gagnsætt og byggt til að skala
            </h3>
            <p className="text-sm text-indigo-200 leading-relaxed font-semibold max-w-3xl">
              Vörumerkið þitt getur farið í loftið á sérhæfðum íslenskum vefjum um leið og opnað er
              fyrir nýja auglýsendur. Engar skuldbindingar — keyptu inneign, stofnaðu herferð og
              fylgstu með tölfræði sem uppfærist á klukkustundar fresti.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 pt-4 border-t border-indigo-800/80">
            <div>
              <span className="text-2xl sm:text-3xl font-black text-white block">550 kr</span>
              <span className="text-[10px] sm:text-xs text-indigo-300 font-bold">
                CPM (per þúsund birtingar)
              </span>
            </div>
            <div>
              <span className="text-2xl sm:text-3xl font-black text-white block">0</span>
              <span className="text-[10px] sm:text-xs text-indigo-300 font-bold">
                Cookies / trackers
              </span>
            </div>
            <div>
              <span className="text-2xl sm:text-3xl font-black text-white block">3 KB</span>
              <span className="text-[10px] sm:text-xs text-indigo-300 font-bold">
                Stærð auglýsingaskriftu
              </span>
            </div>
            <div>
              <span className="text-2xl sm:text-3xl font-black text-white block">80/20</span>
              <span className="text-[10px] sm:text-xs text-indigo-300 font-bold">
                Revenue split til útgefenda
              </span>
            </div>
          </div>

          <div className="pt-4 flex flex-col sm:flex-row items-center gap-3 sm:gap-4">
            <button
              onClick={() => window.dispatchEvent(new window.CustomEvent('open-public-support'))}
              className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-white hover:bg-slate-50 text-indigo-950 font-extrabold text-sm transition flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-98 border-none"
            >
              <MessageSquare size={16} />
              Tökum kaffispjall
            </button>
            <button
              onClick={() => navigate('/sign-in')}
              className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-extrabold text-sm transition flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-98"
            >
              <Zap size={16} />
              Prófa sjálfur — frítt
            </button>
            <Link
              to="/"
              className="text-xs font-bold text-indigo-200 hover:text-white transition flex items-center gap-1.5"
            >
              Fara á forsíðu <ExternalLink size={12} />
            </Link>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <PublicFooter />
    </div>
  );
}
