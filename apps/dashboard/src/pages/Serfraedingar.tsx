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
  Users,
  ShieldCheck,
  Eye,
  ArrowRight,
  MessageSquare,
  ExternalLink,
} from 'lucide-react';

export default function Serfraedingar() {
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
    updateSEO('Hæ Auður og Eydís! | Birtingur', 'Kynning fyrir Auði og Eydísi.', '/serfraedingar');

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
              <span className="hidden sm:inline text-xs font-semibold px-2.5 py-0.5 ml-2 rounded-full bg-indigo-550 text-indigo-700 bg-indigo-50 border border-indigo-200/60">
                Lokað / Sérfræðingar 🤫
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
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200/80 text-xs font-bold uppercase tracking-wider">
            <Sparkles size={14} className="text-indigo-600" />
            Ný nálgun í markaðsmálum á Íslandi
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-slate-900 tracking-tight leading-tight">
            Hæ Auður og Eydís! 👋
            <span className="block mt-3 bg-linear-to-r from-blue-600 via-indigo-600 to-purple-650 bg-clip-text text-transparent">
              Viðbót sem vantaði
            </span>
          </h1>
          <p className="text-base sm:text-lg text-slate-600 leading-relaxed font-semibold max-w-2xl mx-auto">
            Skoðum hvers vegna hugmyndafræði Birtingar breytir leiknum fyrir íslenska
            markaðslandslagið. Hvernig getum við nýtt minni miðla með einbeittari fylgjendahópa til
            að ná betri árangri?
          </p>
        </section>

        {/* THE CORE MARKETING PHILOSOPHY */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Micro-audiences / Niche Media */}
          <Card className="bg-white border-slate-200/80 p-8 space-y-4 shadow-sm hover:shadow-md transition-all">
            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
              <Users size={24} />
            </div>
            <h3 className="text-xl font-bold text-slate-950">
              Niche miðlar: Traust og einbeittir hópar
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed font-medium">
              Íslenski markaðurinn hefur lengi verið einkennst af örfáum risastórum fréttamiðlum þar
              sem auglýsingar drukkna í suði. Birtingur safnar saman{' '}
              <strong>sérhæfðum íslenskum vefjum, bloggum og áhugamálavefjum</strong>. Þessir miðlar
              hafa kannski minni heildarumferð en risarnir, en{' '}
              <strong>fylgjendahópurinn er gríðarlega einbeittur, tryggur og traustur</strong>.
              Auglýsing þar hefur margfalt meira vægi og trúverðugleika.
            </p>
          </Card>

          {/* Contextual targeting */}
          <Card className="bg-white border-slate-200/80 p-8 space-y-4 shadow-sm hover:shadow-md transition-all">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
              <Target size={24} />
            </div>
            <h3 className="text-xl font-bold text-slate-950">
              Samhengismiðun: Rétt skilaboð á réttum stað
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed font-medium">
              Nú þegar vafrakökur (cookies) eru að deyja og persónuverndarlög (GDPR) herða tökin á
              hefðbundinni vefsporun, er tími{' '}
              <strong>samhengismiðunar (Contextual Targeting)</strong> runninn upp. Birtingur miðar
              auglýsingum eftir samhengi: fjármálaauglýsing á fjármálablogg, hönnunarauglýsing á
              lífsstílsvef. Þetta grípur neytandann í réttu hugarástandi án þess að elta hann á
              röndum eða brjóta á friðhelgi hans.
            </p>
          </Card>

          {/* Attention / No clutter */}
          <Card className="bg-white border-slate-200/80 p-8 space-y-4 shadow-sm hover:shadow-md transition-all">
            <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center text-purple-650">
              <Eye size={24} />
            </div>
            <h3 className="text-xl font-bold text-slate-950">
              Óskipt athygli (Eitt hólf - Ein auglýsing)
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed font-medium">
              Risavefirnir eru pakkaðir af blikkandi borðum, sjálfvirkum endurhleðslum (refresh
              loops) og truflunum. Birtingur bannar suð. Hvert auglýsingapláss sýnir{' '}
              <strong>aðeins eina vandaða auglýsing í senn</strong> og hún hleðst rólega. Þetta
              gefur vörumerkinu óskipta athyglin lesandans meðan á lestri stendur, sem skilar sér í
              mun betra minni og hærra smellihlutfalli.
            </p>
          </Card>

          {/* Brand Safety */}
          <Card className="bg-white border-slate-200/80 p-8 space-y-4 shadow-sm hover:shadow-md transition-all">
            <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center text-red-600">
              <ShieldCheck size={24} />
            </div>
            <h3 className="text-xl font-bold text-slate-950">
              100% vörumerkjaöryggi og sjálfvirkni
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed font-medium">
              Vettvangurinn er 100% sjálfvirkur en býður upp á fullkomið öryggi. Allar
              auglýsingamyndir eru sjálfkrafa skannaðar af Gemini AI upp á gæði og viðeigandi efni.
              Að auki fá útgefendur handvirka samþykkisbiðröð svo þeir stjórna algjörlega hvað
              birtist. Fyrir vörumerki þýðir þetta að þau birtast eingöngu í gæðaumhverfi.
            </p>
          </Card>
        </section>

        {/* COMPARISON TABLE */}
        <section className="bg-white border border-slate-200/85 rounded-3xl p-8 sm:p-12 space-y-8 shadow-xs">
          <div className="space-y-3 max-w-2xl">
            <h3 className="text-2xl font-black text-slate-950">
              Samanburður: Risamiðlar vs. Birtingur
            </h3>
            <p className="text-sm text-slate-605 leading-relaxed font-medium">
              Skoðum hvernig upplifun og árangur breytist þegar herferðir eru fluttar yfir í
              markvissari birtingar.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-550 font-bold">
                  <th className="pb-4 pr-4">Eiginleiki</th>
                  <th className="pb-4 px-4 text-slate-600">Hefðbundnir risamiðlar</th>
                  <th className="pb-4 pl-4 text-blue-600">Birtingur Vettvangurinn</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-600 font-medium">
                <tr>
                  <td className="py-4 pr-4 font-bold text-slate-900">Umgjörð / Suð</td>
                  <td className="py-4 px-4">Flókið og þétt (margar auglýsingar á skjá)</td>
                  <td className="py-4 pl-4 text-blue-800 font-bold bg-blue-50/30">
                    Einfalt og hreint (eitt pláss í senn)
                  </td>
                </tr>
                <tr>
                  <td className="py-4 pr-4 font-bold text-slate-900">Traust fylgjenda</td>
                  <td className="py-4 px-4">Almennt (fréttalestur, hraði)</td>
                  <td className="py-4 pl-4 text-blue-800 font-bold bg-blue-50/30">
                    Mjög hátt (sérhæft efni og persónuleg tengsl)
                  </td>
                </tr>
                <tr>
                  <td className="py-4 pr-4 font-bold text-slate-900">Persónuvernd (GDPR)</td>
                  <td className="py-4 px-4">Þriðja aðila vafrakökur og gagnasöfnun</td>
                  <td className="py-4 pl-4 text-blue-800 font-bold bg-blue-50/30">
                    100% kökulaust (samhengis- og lénsstýrt)
                  </td>
                </tr>
                <tr>
                  <td className="py-4 pr-4 font-bold text-slate-900">Uppsetning herferðar</td>
                  <td className="py-4 px-4">Flókin tilboðsferli eða dýrir milliliðir</td>
                  <td className="py-4 pl-4 text-blue-800 font-bold bg-blue-50/30">
                    Sjálfvirk uppsetning beint úr viðmótinu
                  </td>
                </tr>
                <tr>
                  <td className="py-4 pr-4 font-bold text-slate-900">Sveigjanleiki í fjárhæðum</td>
                  <td className="py-4 px-4">Krefst oft mikils lágmarks-auglýsingafjár</td>
                  <td className="py-4 pl-4 text-blue-800 font-bold bg-blue-50/30">
                    Engin lágmörk (reiknað á CPM gengi)
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* STATS & IMPACT FOR AGENCY PARTNERS */}
        <section className="bg-linear-to-br from-indigo-900 via-indigo-950 to-purple-950 text-white rounded-3xl p-8 sm:p-12 space-y-8 shadow-xl relative overflow-hidden">
          {/* Ambient light element inside the card */}
          <div className="absolute top-0 right-0 w-80 h-80 rounded-full bg-blue-500/10 blur-[90px] pointer-events-none -z-10" />

          <div className="space-y-3">
            <span className="text-xs font-bold uppercase tracking-widest text-indigo-300 bg-white/10 px-3.5 py-1 rounded-full w-fit">
              Hvernig náum við árangri?
            </span>
            <h3 className="text-2xl sm:text-3xl font-black text-white">
              Prófið nýja nálgun í næstu herferð
            </h3>
            <p className="text-sm sm:text-base text-indigo-200 leading-relaxed font-semibold max-w-3xl">
              Við viljum bjóða ykkur að koma með einn af ykkar viðskiptavinum í prufu. Við getum
              miðað herferðina nákvæmlega við vefi sem hafa ykkar markhóp, fylgst með tölfræði sem
              uppfærist á klukkustundar fresti og borið saman árangurinn (smellihlutfall og virkni)
              við hefðbundna risamiðla.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-4 border-t border-indigo-800/80">
            <div>
              <span className="text-3xl font-black text-white block">550 kr</span>
              <span className="text-xs text-indigo-300 font-bold">Fast CPM verð</span>
            </div>
            <div>
              <span className="text-3xl font-black text-white block">100%</span>
              <span className="text-xs text-indigo-300 font-bold">Kökulaust og löglegt</span>
            </div>
            <div>
              <span className="text-3xl font-black text-white block">80/20</span>
              <span className="text-xs text-indigo-300 font-bold">Skipting til útgefenda</span>
            </div>
            <div>
              <span className="text-3xl font-black text-white block">80/20</span>
              <span className="text-xs text-indigo-300 font-bold">Skipting til útgefenda</span>
            </div>
          </div>

          <div className="pt-4 flex flex-col sm:flex-row items-center gap-4">
            <button
              onClick={() => window.dispatchEvent(new window.CustomEvent('open-public-support'))}
              className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-white hover:bg-slate-50 text-indigo-950 font-extrabold text-sm transition flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-98 border-none"
            >
              <MessageSquare size={16} />
              Bóka kynningarspjall
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
      <PublicFooter />
    </div>
  );
}
