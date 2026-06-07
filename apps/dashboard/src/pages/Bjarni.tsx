import { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/lib/auth-context';
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
  GraduationCap,
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
    document.title = 'Hæ Bjarni! | Birtingur';

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
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center font-extrabold text-xl text-white shadow-lg shadow-blue-500/20">
              B
            </div>
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
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-slate-900 tracking-tight leading-none">
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
              Íslenski auglýsingamarkaðurinn er ríktur af örfáum risastórum fréttamiðlum og dýrum
              milliliðum. Smærri útgefendur — blogg, nisjumiðlar, fagvefir — hafa enga programmatic
              leið til að afla tekna af umferðinni sinni.
            </p>
            <p>
              Birtingur leysir þetta með <strong>sjálfvirku ad serving kerfi</strong> sem safnar
              niche-vefjum saman á einn stað. Auglýsendur búa til herferð á 3 mín, velja flokka,
              hlaða upp creative og kerfið parar sjálfkrafa. Engir símar, engir sölumenn.
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
                <div>Hono + Cloudflare Workers</div>
                <div className="text-slate-500">&lt;15ms p99</div>
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
                Serving engine parar herferð við flokkana á vefsíðunni — engir cookies, engin PII.
                IAB viewability (50% / 1s IntersectionObserver). Impression pixel fýrar á 200 OK.
              </p>
            </Card>

            <Card className="bg-white border-slate-200/80 p-8 space-y-4 shadow-sm hover:shadow-md transition-all">
              <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600">
                <BarChart3 size={24} />
              </div>
              <h3 className="text-xl font-bold text-slate-950">3. Aggregation pipeline</h3>
              <p className="text-sm text-slate-600 leading-relaxed font-medium">
                Events → Redis queue → cron aggregate → Firestore stats. CPM reiknaður sjálfkrafa.
                80/20 revenue split. Rauntíma dashboard fyrir báða aðila.
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

        {/* WHY AKADEMIAS SHOULD CARE */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <Card className="bg-white border-slate-200/80 p-8 space-y-4 shadow-sm hover:shadow-md transition-all">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
              <GraduationCap size={24} />
            </div>
            <h3 className="text-xl font-bold text-slate-950">Námskeið seljast á réttum stað</h3>
            <p className="text-sm text-slate-600 leading-relaxed font-medium">
              Auglýsing um Excel-námskeið á rekstrarblogg nær til fólks sem er{' '}
              <strong>nú þegar að hugsa um starfsþróun</strong>. Forritunarnámskeið á tækniblogg.
              Leiðtogaþjálfun á viðskiptavef. Þetta er samhengismiðun sem virkar — ekki
              spray-and-pray.
            </p>
          </Card>

          <Card className="bg-white border-slate-200/80 p-8 space-y-4 shadow-sm hover:shadow-md transition-all">
            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
              <Target size={24} />
            </div>
            <h3 className="text-xl font-bold text-slate-950">Eitt pláss, engin þreyta</h3>
            <p className="text-sm text-slate-600 leading-relaxed font-medium">
              Á stóru fréttamiðlunum eru 8-12 auglýsingar á skjá. Hjá okkur er{' '}
              <strong>eitt pláss, ein auglýsing</strong>. Lesandinn sér Akademias — og bara
              Akademias. Enginn samkeppnisaðili á sama skjá. Óskipt athygli.
            </p>
          </Card>

          <Card className="bg-white border-slate-200/80 p-8 space-y-4 shadow-sm hover:shadow-md transition-all">
            <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center text-red-600">
              <ShieldCheck size={24} />
            </div>
            <h3 className="text-xl font-bold text-slate-950">100% GDPR — engar vafrakökur</h3>
            <p className="text-sm text-slate-600 leading-relaxed font-medium">
              Enginn þriðja aðila tracker, engin fingerprinting, engin gagnasöfnun. Samhengismiðun —
              ekki vefsporun. <strong>Cookie-laust frá grunni</strong>, ekki consent-pop-up sem
              gerir fólk ósátt.
            </p>
          </Card>

          <Card className="bg-white border-slate-200/80 p-8 space-y-4 shadow-sm hover:shadow-md transition-all">
            <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
              <Zap size={24} />
            </div>
            <h3 className="text-xl font-bold text-slate-950">Engin lágmörk — byrjaðu smátt</h3>
            <p className="text-sm text-slate-600 leading-relaxed font-medium">
              Keyptu inneign (t.d. 10.000 kr), búðu til herferð og horfðu á rauntíma tölfræðina.{' '}
              <strong>Engin binding, ekkert lágmark, hættu hvenær sem er</strong>. Fest CPM: 550 kr
              per þúsund birtingar.
            </p>
          </Card>
        </section>

        {/* COMPARISON TABLE */}
        <section className="bg-white border border-slate-200/85 rounded-3xl p-8 sm:p-12 space-y-8 shadow-xs">
          <div className="space-y-3 max-w-2xl">
            <h3 className="text-2xl font-black text-slate-950">
              Samanburður: Risamiðlar vs. Birtingur
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed font-medium">
              Skoðum hvernig upplifun og árangur breytist þegar herferðir eru fluttar á markvissari
              birtingar.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-550 font-bold">
                  <th className="pb-4 pr-4">Eiginleiki</th>
                  <th className="pb-4 px-4 text-slate-600">Hefðbundnir risamiðlar</th>
                  <th className="pb-4 pl-4 text-blue-600">Birtingur</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-600 font-medium">
                <tr>
                  <td className="py-4 pr-4 font-bold text-slate-900">Umgjörð</td>
                  <td className="py-4 px-4">Fjölmargar auglýsingar á skjá, truflun</td>
                  <td className="py-4 pl-4 text-blue-800 font-bold bg-blue-50/30">
                    Eitt pláss í senn — óskipt athygli
                  </td>
                </tr>
                <tr>
                  <td className="py-4 pr-4 font-bold text-slate-900">Traust fylgjenda</td>
                  <td className="py-4 px-4">Almennt (fréttalestur, hraði)</td>
                  <td className="py-4 pl-4 text-blue-800 font-bold bg-blue-50/30">
                    Hátt (sérhæft efni, tryggir lesendur)
                  </td>
                </tr>
                <tr>
                  <td className="py-4 pr-4 font-bold text-slate-900">Persónuvernd</td>
                  <td className="py-4 px-4">Vafrakökur og vefsporun</td>
                  <td className="py-4 pl-4 text-blue-800 font-bold bg-blue-50/30">
                    100% kökulaust frá grunni
                  </td>
                </tr>
                <tr>
                  <td className="py-4 pr-4 font-bold text-slate-900">Uppsetning</td>
                  <td className="py-4 px-4">Dýrir milliliðir, löng tilboðsferli</td>
                  <td className="py-4 pl-4 text-blue-800 font-bold bg-blue-50/30">
                    Sjálfvirk á 3 mínútum
                  </td>
                </tr>
                <tr>
                  <td className="py-4 pr-4 font-bold text-slate-900">Lágmark</td>
                  <td className="py-4 px-4">Oft krafist háa lágmarks</td>
                  <td className="py-4 pl-4 text-blue-800 font-bold bg-blue-50/30">
                    Engin lágmörk — CPM 550 kr
                  </td>
                </tr>
                <tr>
                  <td className="py-4 pr-4 font-bold text-slate-900">Tæknilegt</td>
                  <td className="py-4 px-4">Þriðja aðila tag managers, hæg load</td>
                  <td className="py-4 pl-4 text-blue-800 font-bold bg-blue-50/30">
                    REST API, &lt;15ms svartími, IAB viewability
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* DUAL OPPORTUNITY + CTA */}
        <section className="bg-linear-to-br from-indigo-900 via-indigo-950 to-emerald-950 text-white rounded-3xl p-8 sm:p-12 space-y-8 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-80 h-80 rounded-full bg-emerald-500/10 blur-[90px] pointer-events-none -z-10" />

          <div className="space-y-3">
            <span className="text-xs font-bold uppercase tracking-widest text-emerald-300 bg-white/10 px-3.5 py-1 rounded-full w-fit">
              Tvöföld tækifæri fyrir Akademias
            </span>
            <h3 className="text-2xl sm:text-3xl font-black text-white">
              Auglýsandi og útgefandi í einu
            </h3>
            <p className="text-sm sm:text-base text-indigo-200 leading-relaxed font-semibold max-w-3xl">
              Akademias getur auglýst námskeið á sérhæfðum vefjum þar sem markhópurinn hangir —
              <strong className="text-white"> og</strong> ef þið eigið blogg eða efnissíður geta þær
              líka aflað tekna af auglýsingum frá öðrum vörumerkjum. 80% af tekjum renna til ykkar.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-4 border-t border-indigo-800/80">
            <div>
              <span className="text-3xl font-black text-white block">550 kr</span>
              <span className="text-xs text-indigo-300 font-bold">CPM (per þúsund birtingar)</span>
            </div>
            <div>
              <span className="text-3xl font-black text-white block">100%</span>
              <span className="text-xs text-indigo-300 font-bold">Kökulaust og löglegt</span>
            </div>
            <div>
              <span className="text-3xl font-black text-white block">15ms</span>
              <span className="text-xs text-indigo-300 font-bold">Svartími á edge</span>
            </div>
            <div>
              <span className="text-3xl font-black text-white block">80/20</span>
              <span className="text-xs text-indigo-300 font-bold">Skipting til útgefenda</span>
            </div>
          </div>

          <div className="pt-4 flex flex-col sm:flex-row items-center gap-4">
            <button
              onClick={() =>
                (window.location.href =
                  'mailto:info@birtingur.app?subject=Kynning%20-%20Bjarni%20/%20Akademias')
              }
              className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-white hover:bg-slate-50 text-indigo-950 font-extrabold text-sm transition flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-98"
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
              Fara á forsíðu Birtingar <ExternalLink size={12} />
            </Link>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="bg-white border-t border-slate-200/80 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
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

            <div>
              <h4 className="text-xs uppercase font-extrabold tracking-wider text-slate-500 mb-3">
                Auglýsendur
              </h4>
              <ul className="space-y-2 text-xs font-semibold">
                <li>
                  <Link
                    to="/?tab=advertisers"
                    className="text-slate-500 hover:text-slate-850 transition"
                  >
                    Stofna herferð
                  </Link>
                </li>
                <li>
                  <Link
                    to="/?tab=advertisers"
                    className="text-slate-500 hover:text-slate-850 transition"
                  >
                    Inneignir og greiðslur
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="text-xs uppercase font-extrabold tracking-wider text-slate-500 mb-3">
                Útgefendur
              </h4>
              <ul className="space-y-2 text-xs font-semibold">
                <li>
                  <Link
                    to="/?tab=publishers"
                    className="text-slate-500 hover:text-slate-850 transition"
                  >
                    Sækja kóða
                  </Link>
                </li>
                <li>
                  <Link
                    to="/?tab=publishers"
                    className="text-slate-500 hover:text-slate-850 transition"
                  >
                    Tekjuöflun
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="text-xs uppercase font-extrabold tracking-wider text-slate-500 mb-3">
                Þjónusta
              </h4>
              <ul className="space-y-2 text-xs text-slate-500 font-semibold">
                <li>
                  Hafa samband:{' '}
                  <a
                    href="mailto:info@birtingur.app"
                    className="text-slate-550 hover:text-slate-850 transition"
                  >
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
