import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/lib/auth-context';
import Logo from '@/components/ui/Logo';
import PublicFooter from '@/components/layout/PublicFooter';
import { updateSEO } from '@/lib/seo';
import {
  Sparkles,
  ShieldCheck,
  ArrowRight,
  MessageSquare,
  Zap,
  Code2,
  Users,
  Cpu,
  ArrowUpRight,
} from 'lucide-react';

export default function Tryggvi() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // State for Calculator
  const [budget, setBudget] = useState<number>(100000);
  const [ctr, setCtr] = useState<number>(1.8);

  // Calculations: 550 kr. CPM (per 1,000 views)
  const impressions = Math.round((budget / 550) * 1000);
  const clicks = Math.round(impressions * (ctr / 100));

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
    updateSEO(
      'Hæ Tryggvi og Datera! | Birtingur',
      'Samstarfskynning fyrir Tryggva og Datera.',
      '/tryggvi',
    );

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
              <span className="hidden sm:inline text-xs font-semibold px-2.5 py-0.5 ml-2 rounded-full text-indigo-700 bg-indigo-50 border border-indigo-200/60">
                Datera 🤝 Birta
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
                  Prófa kerfið
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
            Hönnunarsamstarf & tæknileg samlegð
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-slate-900 tracking-tight leading-tight">
            Hæ Tryggvi og Datera! 👋
            <span className="block mt-3 bg-linear-to-r from-blue-600 via-cyan-600 to-teal-600 bg-clip-text text-transparent">
              Fjölmiðlaáætlun mætir auglýsingamiðlun
            </span>
          </h1>
          <p className="text-base sm:text-lg text-slate-600 leading-relaxed font-semibold max-w-2xl mx-auto">
            Tryggvi, þú og teymið þitt eruð að smíða <strong>Birtu (Media Planning)</strong> en við
            erum með innviðina í <strong>Birtingi (Ad Serving)</strong>. Hvað ef við gætum brúað
            bilið?
          </p>
        </section>

        {/* THE PITCH CONCEPT */}
        <section className="bg-white border border-slate-200/85 rounded-3xl p-8 sm:p-12 space-y-6 shadow-xs relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-emerald-500/5 blur-2xl -z-10" />
          <div className="space-y-3 max-w-3xl">
            <span className="text-xs font-bold uppercase tracking-widest text-blue-600 bg-blue-50 px-3.5 py-1 rounded-full border border-blue-100">
              Samstarfshugmynd
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-950">
              Sjálfvirk herferðakaup beint úr Birtu
            </h2>
          </div>
          <div className="text-sm text-slate-650 leading-relaxed font-medium space-y-4 max-w-3xl">
            <p>
              <strong>Birta (birta.datera.is)</strong> er kerfi Datera til að skipuleggja
              birtingaráætlanir, bera saman fjölmiðla og halda utan um herferðir.
            </p>
            <p>
              <strong>Birtingur</strong> er að byggja upp net sérhæfðra íslenskra vefja með
              sjálfvirkum auglýsingabirtingum.
            </p>
            <div className="p-5 bg-slate-50 border border-slate-200 rounded-2xl my-4 text-slate-800">
              <strong className="block text-slate-900 mb-1.5">Samlegðin:</strong>
              Með því að tengja <strong>Birtu</strong> við <strong>Birting</strong> með einföldu
              API-kalli geta viðskiptavinir Datera keypt, dreift og birt auglýsingar sínar á
              íslenskum vefjum með <strong>einum smelli</strong>
              beint úr skipulagsborðinu yfir í okkar Ad Serving net.
            </div>
          </div>
        </section>

        {/* 4 CORE ADVANTAGES FOR DATERA */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Ad Server Speed */}
          <Card className="bg-white border-slate-200/80 p-8 space-y-4 shadow-sm hover:shadow-md transition-all">
            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
              <Zap size={24} />
            </div>
            <h3 className="text-xl font-bold text-slate-950">Blistering Fast Edge Ad Serving</h3>
            <p className="text-sm text-slate-600 leading-relaxed font-medium">
              Vefir viðskiptavina ykkar eiga ekki að hægja á sér vegna auglýsinga. Innviðir okkar
              keyra á <strong>Hono</strong> á Vercel Edge og skila auglýsingum ósamstillt. Ef netið
              dettur út, fellur skriftan hljóðleiðis niður (fail-silent) án þess að tefja síðuna.
            </p>
          </Card>

          {/* Cookie-free & GDPR */}
          <Card className="bg-white border-slate-200/80 p-8 space-y-4 shadow-sm hover:shadow-md transition-all">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
              <ShieldCheck size={24} />
            </div>
            <h3 className="text-xl font-bold text-slate-950">
              Persónuvernd í fyrirrúmi (GDPR-safe)
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed font-medium">
              Sem data-driven stofa vitið þið hversu erfitt er að halda utan um vafrakökusamþykki.
              Birtingur notar <strong>engar vafrakökur (cookies)</strong> og enga notendasporun. Við
              styðjumst eingöngu við <strong>samhengismiðun (contextual targeting)</strong> og
              lénsstýringu, sem er 100% GDPR-vænt.
            </p>
          </Card>

          {/* AI Safety Check */}
          <Card className="bg-white border-slate-200/80 p-8 space-y-4 shadow-sm hover:shadow-md transition-all">
            <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center text-purple-650">
              <Cpu size={24} />
            </div>
            <h3 className="text-xl font-bold text-slate-950">
              Sjálfvirkt AI-gæðaeftirlit (Gemini Vision)
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed font-medium">
              Allar auglýsingar sem hlaðið er upp fara í gegnum sjálfvirka myndagreiningu með
              <strong>Gemini AI</strong>. Þær eru flokkaðar og athugaðar upp á gæði, textahlutfall
              og viðeigandi innihald. Þetta tryggir 100% vörumerkjaöryggi (Brand Safety) fyrir
              viðskiptavini ykkar.
            </p>
          </Card>

          {/* Niche Net & Flat Rate */}
          <Card className="bg-white border-slate-200/80 p-8 space-y-4 shadow-sm hover:shadow-md transition-all">
            <div className="w-12 h-12 rounded-xl bg-cyan-50 flex items-center justify-center text-cyan-600">
              <Users size={24} />
            </div>
            <h3 className="text-xl font-bold text-slate-950">
              Sérhæfður fylgjendahópur (Niche Net)
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed font-medium">
              Auglýsingar drukkna oft í suðinu á risamiðlunum. Við tengjum saman trygga íslenska
              nisjumiðla þar sem hvert pláss sýnir <strong>aðeins eina auglýsingu í senn</strong>.
              Þetta gefur að jafnaði meiri athygli fyrir herferðirnar.
            </p>
          </Card>
        </section>

        {/* TECHNICAL STACK / API SPEC FOR TRYGGVI */}
        <section className="bg-white border border-slate-200/85 rounded-3xl p-8 sm:p-12 space-y-8 shadow-xs">
          <div className="space-y-4 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold uppercase tracking-wider">
              <Code2 size={14} />
              Tæknileg útfærsla
            </div>
            <h3 className="text-2xl font-black text-slate-950">
              Developer-first API fyrir Birtu / Datera
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed font-medium">
              Tryggvi, þar sem þú stýrir tækniþróuninni, þá er kerfið okkar hannað með forritara í
              huga. Hér er dæmi um hvernig tækniliðið ykkar gæti sótt laus pláss og verðskrá beint
              inn í Birtu:
            </p>
          </div>

          {/* Code block showing mock API response */}
          <div className="bg-slate-950 rounded-2xl p-6 shadow-lg overflow-x-auto border border-slate-900">
            <div className="flex items-center justify-between mb-4 border-b border-slate-900 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-red-500/80" />
                <span className="w-3 h-3 rounded-full bg-amber-500/80" />
                <span className="w-3 h-3 rounded-full bg-emerald-500/80" />
                <span className="ml-2 text-xs text-slate-400 font-mono">
                  api.birtingur.app/v1/slots
                </span>
              </div>
              <span className="text-[10px] font-mono text-slate-500">
                Authorization: Bearer datera_token
              </span>
            </div>
            <pre className="text-xs sm:text-sm font-mono leading-relaxed text-blue-400">
              <code>
                <span className="text-emerald-400">GET</span>
                <span className="text-white/80"> /v1/categories/inventory</span>
                {`\n\n`}
                <span className="text-slate-500">{'// Response: 200 OK'}</span>
                {`\n`}
                <span className="text-white/60">{'['}</span>
                {`\n`}
                <span className="text-white/60">{'  {'}</span>
                {`\n`}
                <span className="text-white/60">{'    '}</span>
                <span className="text-amber-300">"category"</span>
                <span className="text-white/60">: </span>
                <span className="text-emerald-300">"taekni"</span>
                <span className="text-white/60">,</span>
                {`\n`}
                <span className="text-white/60">{'    '}</span>
                <span className="text-amber-300">"formats"</span>
                <span className="text-white/60">: [</span>
                <span className="text-emerald-300">"300x250"</span>
                <span className="text-white/60">, </span>
                <span className="text-emerald-300">"728x90"</span>
                <span className="text-white/60">],</span>
                {`\n`}
                <span className="text-white/60">{'    '}</span>
                <span className="text-amber-300">"cpmIsk"</span>
                <span className="text-white/60">: </span>
                <span className="text-blue-300">550</span>
                {`\n`}
                <span className="text-white/60">{'  }'}</span>
                {`\n`}
                <span className="text-white/60">{']'}</span>
              </code>
            </pre>
          </div>
        </section>

        {/* DYNAMIC CALCULATOR */}
        <section className="max-w-4xl mx-auto">
          <div className="p-8 sm:p-10 rounded-3xl bg-white border border-slate-200/80 shadow-xl shadow-slate-100/50 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-48 rounded-full bg-blue-500/5 blur-3xl pointer-events-none" />

            <div className="text-center space-y-4 mb-8">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
                Árangursreiknivél
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                Áætlaðu árangur herferða
              </h2>
              <p className="text-sm text-slate-500 max-w-xl mx-auto">
                Sláðu inn markaðsfjárhæð og smellihlutfall til að sjá hversu mikið áhorf og
                heimsóknir viðskiptavinir þínir fá á nisjavefjunum okkar.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
              {/* Sliders */}
              <div className="md:col-span-7 space-y-6">
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <label className="text-sm font-bold text-slate-700">
                      Mánaðarlegt herferðarfé:
                    </label>
                    <span className="text-base font-extrabold text-blue-600">
                      {budget.toLocaleString('is-IS')} kr.
                    </span>
                  </div>
                  <input
                    type="range"
                    min="10000"
                    max="1000000"
                    step="10000"
                    value={budget}
                    onChange={(e) => setBudget(Number(e.target.value))}
                    className="custom-slider"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400 font-semibold">
                    <span>10.000 kr.</span>
                    <span>500.000 kr.</span>
                    <span>1.000.000 kr.</span>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <label className="text-sm font-bold text-slate-700">
                      Vænt smellihlutfall (CTR):
                    </label>
                    <span className="text-base font-extrabold text-blue-600">{ctr}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="5.0"
                    step="0.1"
                    value={ctr}
                    onChange={(e) => setCtr(Number(e.target.value))}
                    className="custom-slider"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400 font-semibold">
                    <span>0.5% (Lágmark)</span>
                    <span>2.5% (Meðaltal)</span>
                    <span>5.0% (Frábært!)</span>
                  </div>
                </div>
              </div>

              {/* Display */}
              <div className="md:col-span-5 p-6 rounded-2xl bg-slate-50 border border-slate-200 text-center flex flex-col justify-center min-h-[200px] space-y-4">
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">
                    Áætlaðar flettingar (Views)
                  </span>
                  <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight mt-1">
                    {impressions.toLocaleString('is-IS')}
                  </div>
                </div>
                <div className="pt-3 border-t border-slate-200">
                  <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">
                    Áætlaðir heimsóknir (Clicks)
                  </span>
                  <div className="text-2xl sm:text-3xl font-black text-emerald-600 tracking-tight mt-1">
                    {clicks.toLocaleString('is-IS')}
                  </div>
                </div>
                <div className="text-[10px] text-slate-500 leading-relaxed pt-2">
                  Reiknað út frá 550 kr. flötu CPM verði og {ctr}% nýtingarhlutfalli.
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* COMPARISON TABLE */}
        <section className="bg-white border border-slate-200/85 rounded-3xl p-8 sm:p-12 space-y-8 shadow-xs">
          <div className="space-y-3 max-w-2xl">
            <h3 className="text-2xl font-black text-slate-950">
              Samanburður: Gamla vinnubrögðin vs. Birta & Birtingur
            </h3>
            <p className="text-sm text-slate-500 leading-relaxed font-medium">
              Skoðum hvernig ferlið breytist þegar media planner tengist beint við ad server.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-bold">
                  <th className="pb-4 pr-4">Ferli</th>
                  <th className="pb-4 px-4 text-slate-600">Hefðbundin bókun</th>
                  <th className="pb-4 pl-4 text-blue-600">Birta + Birtingur samstarf</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-600 font-medium">
                <tr>
                  <td className="py-4 pr-4 font-bold text-slate-900">Umsýsla / Handtök</td>
                  <td className="py-4 px-4">
                    Senda tölvupósta, bíða eftir staðfestingum, senda efni handvirkt.
                  </td>
                  <td className="py-4 pl-4 text-blue-800 font-bold bg-blue-50/30">
                    Sjálfvirk sending og virkjun beint úr skipulagsborðinu.
                  </td>
                </tr>
                <tr>
                  <td className="py-4 pr-4 font-bold text-slate-900">Vörumerkjaöryggi</td>
                  <td className="py-4 px-4">Krefst handvirks yfirlestrar á hverri síðu.</td>
                  <td className="py-4 pl-4 text-blue-800 font-bold bg-blue-50/30">
                    Sjálfvirk Gemini AI greining við upphleðslu.
                  </td>
                </tr>
                <tr>
                  <td className="py-4 pr-4 font-bold text-slate-900">Gagnsæi í tölfræði</td>
                  <td className="py-4 px-4">Fá skýrslur sendar eftir á, stundum seint.</td>
                  <td className="py-4 pl-4 text-blue-800 font-bold bg-blue-50/30">
                    Tölfræði (Impressions, Clicks, CTR, CPM) gegnum API, uppfærð á klukkustundar
                    fresti.
                  </td>
                </tr>
                <tr>
                  <td className="py-4 pr-4 font-bold text-slate-900">Lágmarkskostnaður</td>
                  <td className="py-4 px-4">Oft kröfur um mikla lágmarksbókun á stóru miðlunum.</td>
                  <td className="py-4 pl-4 text-blue-800 font-bold bg-blue-50/30">
                    Ekkert lágmark. CPM 550 kr. flat rate.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* MOCKUP OF INTEGRATION */}
        <section className="bg-linear-to-br from-indigo-900 via-indigo-950 to-emerald-950 text-white rounded-3xl p-8 sm:p-12 space-y-8 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 rounded-full bg-emerald-500/10 blur-[100px] pointer-events-none -z-10" />

          <div className="space-y-4 max-w-3xl">
            <span className="text-xs font-bold uppercase tracking-widest text-emerald-300 bg-white/10 px-3.5 py-1 rounded-full w-fit">
              Hvernig getum við byrjað?
            </span>
            <h3 className="text-2xl sm:text-3xl font-black text-white">Tengjumst yfir kaffi ☕</h3>
            <p className="text-sm sm:text-base text-indigo-100 leading-relaxed font-semibold">
              Tryggvi, við getum búið til sérstakt sandkassa API lykil (Sandbox Token) fyrir
              Datera-hópinn þannig að þið getið prófað að kalla í kerfið okkar úr Birtu eða prufað
              MCP þjóninn í Claude og Windsurf.
            </p>
          </div>

          <div className="pt-6 flex flex-col sm:flex-row items-center gap-4">
            <button
              onClick={() => window.dispatchEvent(new window.CustomEvent('open-public-support'))}
              className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-white hover:bg-slate-50 text-indigo-950 font-extrabold text-sm transition flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-98 border-none"
            >
              <MessageSquare size={16} />
              Bóka spjall við okkur
            </button>
            <Link
              to="/"
              className="text-xs font-bold text-indigo-200 hover:text-white transition flex items-center gap-1.5"
            >
              Fara á forsíðu Birtingar <ArrowUpRight size={14} />
            </Link>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <PublicFooter />
    </div>
  );
}
