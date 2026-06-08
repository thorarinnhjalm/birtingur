import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/lib/auth-context';
import Logo from '@/components/ui/Logo';
import {
  Sparkles,
  Coins,
  ArrowRight,
  CheckCircle2,
  Zap,
  ShieldAlert,
  Cookie,
  ExternalLink,
  MessageSquare,
  Cpu,
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
    document.title = 'Hæ Árni og Villi! | Birtingur';

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

  const snippetCode = `<!-- 1. Plássið þar sem auglýsingin á að birtast -->
<div data-adplatform-slot="slot_id_hér" style="min-height: 250px;"></div>

<!-- 2. Async skriftan sem hleður og birtir borðann (hleðst í bakgrunni) -->
<script async src="https://cdn.birtingur.is/v1/snippet.js"></script>`;

  const mcpCommand = `claude mcp add birtingur curl -X POST -H "Authorization: Bearer ak_DÍNN_API_LYKILL" -H "Content-Type: application/json" -d "{{mcp_payload}}" https://mcp.birtingur.app/mcp`;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans antialiased overflow-x-hidden selection:bg-blue-600 selection:text-white">
      {/* Background Ambient Gradients */}
      <div className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full bg-blue-500/5 blur-[120px] pointer-events-none -z-10" />
      <div className="absolute top-1/3 right-10 w-[500px] h-[500px] rounded-full bg-violet-500/5 blur-[100px] pointer-events-none -z-10" />

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
              <span className="hidden sm:inline text-xs font-semibold px-2.5 py-0.5 ml-2 rounded-full bg-red-50 text-red-600 border border-red-200/60">
                Lokað / Væb 🤫
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
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200/80 text-xs font-bold uppercase tracking-wider">
            <Sparkles size={14} className="text-blue-600" />
            Einfalt og áhrifaríkt fyrir vefhönnuði
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-slate-900 tracking-tight leading-tight">
            Hæ Árni og Villi! 👋
            <span className="block mt-3 bg-linear-to-r from-blue-600 via-sky-600 to-indigo-600 bg-clip-text text-transparent">
              Sleppum tæknirúnkinu
            </span>
          </h1>
          <p className="text-base sm:text-lg text-slate-600 leading-relaxed font-semibold max-w-2xl mx-auto">
            Gleymum Firestore söfnum og cron-jobbum í smástund. Talaðum um það sem skiptir ykkur og
            viðskiptavini ykkar raunverulegu máli:
            <span className="text-blue-655 block mt-1 font-black">
              Af hverju ættuð þið að samþætta Birtingur í verkefnin ykkar?
            </span>
          </p>
        </section>

        {/* WHY USE US - 4 CORE BENEFITS FOR WEB CODERS */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Tekjur */}
          <Card className="bg-white border-slate-200/80 p-8 space-y-4 shadow-sm hover:shadow-md transition-all">
            <div className="w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center text-green-600">
              <Coins size={24} />
            </div>
            <h3 className="text-xl font-bold text-slate-950">
              Auka tekjur viðskiptavina (og ykkar!)
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed font-medium">
              Vefirnir sem þið smíðið fyrir viðskiptavini ykkar geta farið að skila þeim reglulegum
              tekjum af ónýttu auglýsingaplássi.
              <strong> Og fyrir ykkur:</strong> Við getum sett upp affiliate/samstarfsprósentu af
              veltunni sem rennur í gegnum plássin sem þið komið upp.
            </p>
          </Card>

          {/* Hraði / Lighthouse */}
          <Card className="bg-white border-slate-200/80 p-8 space-y-4 shadow-sm hover:shadow-md transition-all">
            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
              <Zap size={24} />
            </div>
            <h3 className="text-xl font-bold text-slate-950">
              100% fail-silent & eldsnöggt (Lighthouse)
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed font-medium">
              Við vitum að þið viljið ekki hægja á vefnum sem þið voruð að fínstilla. Skriftan okkar
              er undir <strong>1.5 KB</strong> og hleðst async. Ef kerfið okkar myndi einhvern tíman
              liggja niðri, þá fellur hún hljóðlega niður (fail-silent) og felur plássið sjálfkrafa.
              Engin seinkun, engin SEO-refsing.
            </p>
          </Card>

          {/* Gæðastýring */}
          <Card className="bg-white border-slate-200/80 p-8 space-y-4 shadow-sm hover:shadow-md transition-all">
            <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center text-red-600">
              <ShieldAlert size={24} />
            </div>
            <h3 className="text-xl font-bold text-slate-950">
              Viðskiptavinurinn hefur fullt eftirlit
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed font-medium">
              Viðskiptavinir ykkar munu aldrei sjá óviðeigandi eða samkeppnis-auglýsingar á síðunni
              sinni. Kerfið býður upp á sjálfvirka Gemini AI skönnun og handvirka samþykkisbiðröð
              (Approval Queue). Útgefandinn á alltaf síðasta orðið.
            </p>
          </Card>

          {/* GDPR / Cookie-free */}
          <Card className="bg-white border-slate-200/80 p-8 space-y-4 shadow-sm hover:shadow-md transition-all">
            <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center text-purple-650">
              <Cookie size={24} />
            </div>
            <h3 className="text-xl font-bold text-slate-950">Kökulaust og GDPR-vænt</h3>
            <p className="text-sm text-slate-600 leading-relaxed font-medium">
              Birtingur notar engar vafrakökur (cookies) til að elta notendur á milli vefja. Miðunin
              er samhengis- og landfræðileg. Þið þurfið ekki að uppfæra persónuverndarstefnur eða
              flækja kökuborðann (consent banner) hjá viðskiptavinum ykkar vegna þessa.
            </p>
          </Card>
        </section>

        {/* HOW EASY IS IT? */}
        <section className="bg-white border border-slate-200/85 rounded-3xl p-8 sm:p-12 space-y-8 shadow-xs">
          <div className="space-y-4 max-w-2xl">
            <h3 className="text-2xl font-black text-slate-950">
              Uppsetning sem tekur bókstaflega 30 sekúndur
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed font-medium">
              Þið þurfið ekki að setja upp flókin NPM söfn eða API köll. Bara eitt einfalt `div` þar
              sem borðinn á að birtast og ein async skrifta sem keyrir í bakgrunni. Virkar í öllu:
              React, Next.js, Webflow, WordPress eða hreinu HTML.
            </p>
          </div>

          <div className="rounded-xl bg-slate-900 border border-slate-850 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-red-500" />
                <span className="w-3 h-3 rounded-full bg-yellow-500" />
                <span className="w-3 h-3 rounded-full bg-green-500" />
                <span className="text-xs font-bold text-slate-400 ml-2 font-mono">index.html</span>
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
            <pre className="p-5 font-mono text-xs text-slate-350 overflow-x-auto bg-slate-900 leading-relaxed">
              <code>
                <span className="text-slate-500">
                  &lt;!-- 1. Plássið þar sem auglýsingin á að birtast --&gt;
                </span>
                {'\n'}
                <span className="text-sky-400">&lt;div</span>{' '}
                <span className="text-amber-400">data-adplatform-slot</span>=
                <span className="text-emerald-400">"slot_id_hér"</span>{' '}
                <span className="text-amber-400">style</span>=
                <span className="text-emerald-400">"min-height: 250px;"</span>
                <span className="text-sky-400">&gt;&lt;/div&gt;</span>
                {'\n\n'}
                <span className="text-slate-500">
                  &lt;!-- 2. Async skriftan sem hleður og birtir borðann --&gt;
                </span>
                {'\n'}
                <span className="text-sky-400">&lt;script</span>{' '}
                <span className="text-amber-400">async</span>{' '}
                <span className="text-amber-400">src</span>=
                <span className="text-emerald-400">"https://cdn.birtingur.is/v1/snippet.js"</span>
                <span className="text-sky-400">&gt;&lt;/script&gt;</span>
              </code>
            </pre>
          </div>
        </section>

        {/* AI & MCP INTEGRATION SECTION */}
        <section className="bg-white border border-slate-200/85 rounded-3xl p-8 sm:p-12 space-y-8 shadow-xs">
          <div className="space-y-4 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-50 text-purple-650 border border-purple-200/60 text-xs font-bold uppercase tracking-wider">
              <Cpu size={14} className="text-purple-600" />
              Gervigreindarvænt (AI-Native)
            </div>
            <h3 className="text-2xl font-black text-slate-950">
              Láttu Claude eða Cursor sjá um vinnuna (MCP)
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed font-medium">
              Ef þið notið <strong>Claude Code</strong>, <strong>Claude Desktop</strong>, eða ritla
              eins og <strong>Cursor</strong> og <strong>Windsurf</strong> við forritun, getið þið
              tengt Birting sem <strong>MCP þjón (Model Context Protocol)</strong>. Þá getur
              gervigreindin sjálf séð um umsýsluna fyrir ykkur!
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-6 space-y-4 text-xs font-semibold text-slate-500 leading-relaxed">
              <div className="flex gap-3">
                <CheckCircle2 size={16} className="text-purple-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-slate-900 block mb-0.5">Sjálfvirk kóðainnsetning</strong>
                  Spyrjið Claude:{' '}
                  <code className="text-xs bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono font-bold">
                    „Bættu við Birtingur plássi á þessa síðu“
                  </code>{' '}
                  og Claude sækir rétta slotId-ið og skrifar kóðann beint í skrána ykkar.
                </div>
              </div>

              <div className="flex gap-3">
                <CheckCircle2 size={16} className="text-purple-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-slate-900 block mb-0.5">
                    Spurningar og staða með spjalli
                  </strong>
                  Þið getið spurt Claude:{' '}
                  <code className="text-xs bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono font-bold">
                    „Hversu mikið græddi vefsíða X í þessum mánuði?“
                  </code>{' '}
                  eða{' '}
                  <code className="text-xs bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono font-bold">
                    „Stofnaðu nýtt slot fyrir footerinn“
                  </code>{' '}
                  og þjónninn svarar samstundis.
                </div>
              </div>
            </div>

            <div className="lg:col-span-6 rounded-xl bg-slate-900 border border-slate-850 overflow-hidden w-full">
              <div className="px-4 py-2.5 border-b border-slate-800 flex items-center justify-between bg-slate-950">
                <span className="text-xs font-bold text-slate-400 font-mono">
                  Tengja við Claude Code/Desktop
                </span>
                <Button
                  variant="ghost"
                  id="btn_copy_mcp"
                  onClick={() => handleCopy(mcpCommand, 'mcp')}
                  className="text-[10px] py-1 px-2.5 h-auto font-bold text-slate-400 hover:text-white hover:bg-slate-800"
                >
                  {copiedCode === 'mcp' ? 'Afritað!' : 'Afrita stjórn'}
                </Button>
              </div>
              <pre className="p-4 font-mono text-[10px] text-purple-400 overflow-x-auto bg-slate-900 leading-relaxed select-all">
                <code>
                  {`claude mcp add birtingur curl -X POST \\
  -H "Authorization: Bearer ak_DÍNN_API_LYKILL" \\
  -H "Content-Type: application/json" \\
  -d "{{mcp_payload}}" \\
  https://mcp.birtingur.app/mcp`}
                </code>
              </pre>
            </div>
          </div>
        </section>

        {/* AGENCY & PARTNERSHIP PROPOSAL */}
        <section className="bg-linear-to-br from-blue-600 to-indigo-750 text-white rounded-3xl p-8 sm:p-12 space-y-6 shadow-lg shadow-blue-500/10">
          <div className="space-y-3">
            <span className="text-xs font-bold uppercase tracking-widest text-blue-200 bg-white/10 px-3.5 py-1 rounded-full w-fit">
              Samstarf fyrir vefstofur
            </span>
            <h3 className="text-2xl sm:text-3xl font-black text-white">Stofnum til samstarfs!</h3>
            <p className="text-sm sm:text-base text-blue-100 leading-relaxed font-semibold max-w-3xl">
              Ef þið bannið auglýsingablokka á vefjum viðskiptavina ykkar eða viljið hjálpa þeim að
              breyta ónýttu plássi í greiðslur inn á bankareikning, þá er Birtingur fullkomið tól
              fyrir ykkur. Við sjáum um allt: innheimtu, Gemini AI skönnun, greiðslukerfi og
              tölfræði.
            </p>
          </div>

          <div className="pt-4 flex flex-col sm:flex-row items-center gap-4">
            <button
              onClick={() =>
                (window.location.href =
                  'mailto:info@birtingur.app?subject=Samstarf%20-%20Væb%20Coders')
              }
              className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-white hover:bg-slate-50 text-blue-700 font-extrabold text-sm transition flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-98"
            >
              <MessageSquare size={16} />
              Spjalla um samstarf (Affiliate)
            </button>
            <Link
              to="/"
              className="text-xs font-bold text-blue-100 hover:text-white transition flex items-center gap-1.5"
            >
              Kynna sér kerfið nánar <ExternalLink size={12} />
            </Link>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="bg-white border-t border-slate-200/80 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {/* Logo/Info */}
            <div className="space-y-4">
              <Link to="/" className="flex items-center gap-2 cursor-pointer">
                <Logo size={32} className="shadow-md shadow-blue-500/10 rounded-lg" />
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

            {/* Links Publisher */}
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

            {/* Legal / Contact */}
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
