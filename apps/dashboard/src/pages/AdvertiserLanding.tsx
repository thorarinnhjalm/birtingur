import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import PublicHeader from '@/components/layout/PublicHeader';
import PublicFooter from '@/components/layout/PublicFooter';
import {
  Sparkles,
  MapPin,
  Upload,
  Coins,
  CheckCircle2,
  ChevronRight,
  ArrowRight,
  TrendingUp,
  Target,
} from 'lucide-react';

// Icelandic dative & genitive declensions for natural Icelandic SEO text
const REGIONS: Record<
  string,
  { name: string; dative: string; genitive: string; parentName: string; regionLabel: string }
> = {
  reykjavik: {
    name: 'Reykjavík',
    dative: 'í Reykjavík',
    genitive: 'Reykjavíkur',
    parentName: 'Höfuðborgarsvæðinu',
    regionLabel: 'Capital Area',
  },
  kopavogur: {
    name: 'Kópavogur',
    dative: 'í Kópavogi',
    genitive: 'Kópavogs',
    parentName: 'Höfuðborgarsvæðinu',
    regionLabel: 'Capital Area',
  },
  hafnarfjordur: {
    name: 'Hafnarfjörður',
    dative: 'í Hafnarfirði',
    genitive: 'Hafnarfjarðar',
    parentName: 'Höfuðborgarsvæðinu',
    regionLabel: 'Capital Area',
  },
  gardabaer: {
    name: 'Garðabær',
    dative: 'í Garðabæ',
    genitive: 'Garðabæjar',
    parentName: 'Höfuðborgarsvæðinu',
    regionLabel: 'Capital Area',
  },
  mosfellsbaer: {
    name: 'Mosfellsbær',
    dative: 'í Mosfellsbæ',
    genitive: 'Mosfellsbæjar',
    parentName: 'Höfuðborgarsvæðinu',
    regionLabel: 'Capital Area',
  },
  seltjarnarnes: {
    name: 'Seltjarnarnes',
    dative: 'á Seltjarnarnesi',
    genitive: 'Seltjarnarness',
    parentName: 'Höfuðborgarsvæðinu',
    regionLabel: 'Capital Area',
  },
  akureyri: {
    name: 'Akureyri',
    dative: 'á Akureyri',
    genitive: 'Akureyrar',
    parentName: 'Landsbyggðinni',
    regionLabel: 'Countryside',
  },
  reykjanesbaer: {
    name: 'Reykjanesbær',
    dative: 'í Reykjanesbæ',
    genitive: 'Reykjanesbæjar',
    parentName: 'Landsbyggðinni',
    regionLabel: 'Countryside',
  },
  selfoss: {
    name: 'Selfoss',
    dative: 'á Selfossi',
    genitive: 'Selfoss',
    parentName: 'Landsbyggðinni',
    regionLabel: 'Countryside',
  },
  akranes: {
    name: 'Akranes',
    dative: 'á Akranesi',
    genitive: 'Akraness',
    parentName: 'Landsbyggðinni',
    regionLabel: 'Countryside',
  },
  isafjordur: {
    name: 'Ísafjörður',
    dative: 'á Ísafirði',
    genitive: 'Ísafjarðar',
    parentName: 'Landsbyggðinni',
    regionLabel: 'Countryside',
  },
  egilsstadir: {
    name: 'Egilsstaðir',
    dative: 'á Egilsstöðum',
    genitive: 'Egilsstaða',
    parentName: 'Landsbyggðinni',
    regionLabel: 'Countryside',
  },
  vestmannaeyjar: {
    name: 'Vestmannaeyjar',
    dative: 'í Vestmannaeyjum',
    genitive: 'Vestmannaeyja',
    parentName: 'Landsbyggðinni',
    regionLabel: 'Countryside',
  },
};

export default function AdvertiserLanding() {
  const { region } = useParams<{ region?: string }>();
  const navigate = useNavigate();
  const activeRegion = region ? REGIONS[region.toLowerCase()] : null;

  // Simple pricing calculator state
  const [budget, setBudget] = useState(15000);
  const estimatedImpressions = Math.round((budget / 550) * 1000);

  useEffect(() => {
    // Dynamic SEO Metadata setup
    const titleText = activeRegion
      ? `Auglýsa á netinu ${activeRegion.dative} | Einfaldar staðbundnar vefauglýsingar`
      : 'Einfaldasta leiðin til að auglýsa á íslenskum vefsíðum | Birtingur';
    const descriptionText = activeRegion
      ? `Viltu ná til nýrra viðskiptavina ${activeRegion.dative}? Birtingur býður upp á einstaklega einfaldar og kökulausar vefauglýsingar á staðbundnum íslenskum vefjum án allrar flækju.`
      : 'Birtingur gerir litlum og meðalstórum fyrirtækjum kleift að auglýsa á vönduðum íslenskum vefsíðum á nokkrum mínútum án þess að þurfa flókin kerfi eða tæknifólk.';

    document.title = titleText;

    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.setAttribute('name', 'description');
      document.head.appendChild(metaDesc);
    }
    metaDesc.setAttribute('content', descriptionText);

    return () => {
      document.title = 'Birtingur';
    };
  }, [activeRegion]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans antialiased overflow-x-hidden selection:bg-blue-600 selection:text-white">
      {/* Background Glow */}
      <div className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full bg-blue-500/5 blur-[120px] pointer-events-none -z-10" />
      <div className="absolute top-1/4 right-10 w-[500px] h-[500px] rounded-full bg-indigo-500/5 blur-[100px] pointer-events-none -z-10" />

      {/* HEADER */}
      <PublicHeader activeRegion={activeRegion} />

      <main className="grow max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 md:py-20 space-y-16 relative">
        {/* HERO SECTION */}
        <section className="space-y-6 text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200/80 text-xs font-bold uppercase tracking-wider">
            <Sparkles size={14} className="text-blue-600" />
            Vefauglýsingar eins og þær eiga að vera
          </div>
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-slate-900 tracking-tight leading-tight">
            {activeRegion ? (
              <>
                Einfaldasta leiðin til að auglýsa{' '}
                <span className="block mt-2 bg-linear-to-r from-blue-600 via-indigo-600 to-sky-600 bg-clip-text text-transparent">
                  {activeRegion.dative}
                </span>
              </>
            ) : (
              <>
                Einfaldasta leiðin til að auglýsa á{' '}
                <span className="block mt-2 bg-linear-to-r from-blue-600 via-indigo-600 to-sky-600 bg-clip-text text-transparent">
                  íslenskum vefsíðum
                </span>
              </>
            )}
          </h1>
          <p className="text-base sm:text-lg text-slate-650 leading-relaxed font-semibold max-w-2xl mx-auto">
            Viltu ná til fleiri viðskiptavina{activeRegion ? ` ${activeRegion.dative}` : ''} án þess
            að sökkva í flókin tækniorð og erlend risakerfi? Með Birtingi geturðu birt auglýsingar á
            nokkrum mínútum.
          </p>

          <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => navigate('/sign-in')}
              className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-blue-600 hover:bg-blue-500 font-extrabold text-white shadow-xl shadow-blue-600/30 hover:shadow-blue-500/40 hover:-translate-y-0.5 transition-all duration-200 cursor-pointer flex items-center justify-center gap-2"
            >
              Stofna vefauglýsingu <ArrowRight size={18} />
            </button>
            <a
              href="#reiknivel"
              className="w-full sm:w-auto px-6 py-4 rounded-2xl bg-white hover:bg-slate-50 border border-slate-200 font-bold text-slate-700 transition cursor-pointer text-center"
            >
              Sjá verðlagningu
            </a>
          </div>
        </section>

        {/* KEY HIGHLIGHTS */}
        <section className="grid md:grid-cols-3 gap-6 pt-6">
          <Card className="p-6 space-y-3 bg-white border border-slate-200/80 shadow-xs">
            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
              <Upload size={24} />
            </div>
            <h3 className="text-lg font-bold text-slate-900">1. Hlaða upp og birta</h3>
            <p className="text-slate-600 text-sm font-medium leading-relaxed">
              Þú þarft ekki að vera grafískur hönnuður eða tæknimaður. Þú hleður bara upp lógói eða
              auglýsingamynd, setur inn vefslóðina þína og kerfið sér um afganginn.
            </p>
          </Card>

          <Card className="p-6 space-y-3 bg-white border border-slate-200/80 shadow-xs">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
              <MapPin size={24} />
            </div>
            <h3 className="text-lg font-bold text-slate-900">2. Nákvæm mörkun</h3>
            <p className="text-slate-600 text-sm font-medium leading-relaxed">
              {activeRegion ? (
                <>
                  Við beinum auglýsingunni þinni sérstaklega að lesendum á{' '}
                  <strong>{activeRegion.parentName}</strong> (þar á meðal {activeRegion.dative}) með
                  því að greina sjálfkrafa hvaðan fólk er að lesa síðurnar.
                </>
              ) : (
                <>
                  Veldu hvort þú vilt ná til lesenda á <strong>Höfuðborgarsvæðinu</strong>, á{' '}
                  <strong>Landsbyggðinni</strong> eða í <strong>ákveðnu bæjarfélagi</strong>. Allt
                  gert sjálfvirkt og kökulaust.
                </>
              )}
            </p>
          </Card>

          <Card className="p-6 space-y-3 bg-white border border-slate-200/80 shadow-xs">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
              <Coins size={24} />
            </div>
            <h3 className="text-lg font-bold text-slate-900">3. Engir bindandi samningar</h3>
            <p className="text-slate-600 text-sm font-medium leading-relaxed">
              Þú stjórnar kostnaðinum algjörlega sjálfur. Þú leggur inn upphæðina sem þú vilt nota í
              veskið þitt, og greiðir aðeins fast og gagnsætt verð fyrir þær birtingar sem þú færð.
            </p>
          </Card>
        </section>

        {/* INTEGRITY AND GEO ACCURACY BOX */}
        {activeRegion && (
          <section className="p-6 bg-blue-50/40 border border-blue-150 rounded-2xl space-y-3">
            <h4 className="text-sm font-bold text-blue-900 flex items-center gap-2">
              <Target size={16} />
              Hvernig virkar staðsetningin {activeRegion.dative}?
            </h4>
            <p className="text-xs text-slate-600 leading-relaxed font-semibold">
              Kerfið okkar notar 100% lögmæta IP-staðsetningargreiningu (án nokkurra vafrakaka eða
              notendasporunar). Þegar þú velur <strong>{activeRegion.name}</strong>, greinir kerfið
              sjálfkrafa lesendur sem koma frá {activeRegion.parentName} og sýnir þeim auglýsinguna
              þína á okkar íslenska samstarfsneti. Þú ert því aðeins að borga fyrir auglýsingar sem
              fólk á þínu svæði sér í raun og veru.
            </p>
          </section>
        )}

        {/* PRICING CALCULATOR */}
        <section
          id="reiknivel"
          className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm"
        >
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold">
                <CheckCircle2 size={12} />
                Flatt CPM verð
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 leading-tight">
                Einfalt og gagnsætt verð
              </h2>
              <p className="text-slate-600 text-sm font-medium leading-relaxed">
                Við trúum ekki á flókið tilboðsferli eða falin gjöld. Hverjar 1.000 sýningar kosta
                nákvæmlega <strong>550 kr.</strong> (CPM). Þú ræður því nákvæmlega hversu miklu þú
                eyðir.
              </p>
              <ul className="space-y-2 text-slate-600 text-xs font-bold pt-2">
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                  Engin mánaðargjöld eða uppsetningarkostnaður
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                  Breyttu eða stöðvaðu hvenær sem er með einum smelli
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                  Móttaka og sjálfvirkt gæðaeftirlit með Gemini AI
                </li>
              </ul>
            </div>

            <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl space-y-6">
              <div>
                <label className="flex justify-between text-xs font-bold text-slate-700 mb-2">
                  <span>Hversu miklu viltu eyða?</span>
                  <span className="text-blue-600 font-extrabold text-sm">
                    {budget.toLocaleString('is-IS')} kr.
                  </span>
                </label>
                <input
                  type="range"
                  min="5000"
                  max="100000"
                  step="5000"
                  value={budget}
                  onChange={(e) => setBudget(Number(e.target.value))}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
                <div className="flex justify-between text-[10px] font-bold text-slate-400 mt-1">
                  <span>5.000 kr.</span>
                  <span>50.000 kr.</span>
                  <span>100.000 kr.</span>
                </div>
              </div>

              <div className="border-t border-slate-200 pt-4 text-center">
                <span className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Áætlaður fjöldi auglýsingasýninga
                </span>
                <span className="block text-3xl font-black mt-1.5 bg-linear-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                  {estimatedImpressions.toLocaleString('is-IS')}
                </span>
                <span className="block text-[10px] text-slate-400 font-medium mt-1">
                  Mælt í skiptum sem íbúar{activeRegion ? ` ${activeRegion.dative}` : ''} sjá
                  auglýsinguna þína
                </span>
              </div>

              <button
                onClick={() => navigate('/sign-in')}
                className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 font-bold text-sm text-white transition-all cursor-pointer shadow-md hover:shadow-lg flex items-center justify-center gap-1.5"
              >
                Byrja að auglýsa núna <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </section>

        {/* WHY COOKIELESS MATTERS IN SIMPLE TERMS */}
        <section className="bg-slate-900 text-white rounded-3xl p-8 space-y-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-[300px] h-[300px] rounded-full bg-blue-500/10 blur-[80px] pointer-events-none" />
          <div className="max-w-2xl space-y-4">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 text-xs font-bold">
              <TrendingUp size={12} />
              Betri árangur, minna vesen
            </div>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight">
              Af hverju eru auglýsingarnar okkar áhrifameiri?
            </h2>
            <p className="text-slate-300 text-sm font-medium leading-relaxed">
              Margir risamiðlar sýna tugi auglýsinga á sömu síðunni. Auglýsingar þar drukkna í
              suðinu. Á okkar samstarfsneti gildir reglan:{' '}
              <strong>Hvert pláss sýnir aðeins eina vandaða auglýsingu í senn</strong>. Lesandinn
              fær frið til að taka eftir þínu vörumerki.
            </p>
            <p className="text-slate-350 text-xs font-semibold leading-relaxed">
              Auk þess notum við <strong>engar vafrakökur (cookies)</strong>. Það þýðir að síðurnar
              hlaðast eldsnöggt og engir pirrandi samþykkisgluggar birtast notendum út af okkar
              skriftu.
            </p>
          </div>
        </section>

        {/* REGIONAL NAVIGATION FOOTER GRID (CRAWLABLE SEO LINKS) */}
        <section className="space-y-4 pt-6">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider text-center">
            Auglýstu á þínu svæði
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 text-xs font-bold">
            {Object.entries(REGIONS).map(([key, value]) => {
              const isActive = region?.toLowerCase() === key;
              return (
                <Link
                  key={key}
                  to={`/auglysendur/${key}`}
                  className={`p-3 rounded-xl border text-center transition-all ${
                    isActive
                      ? 'border-blue-600 bg-blue-50/20 text-blue-700'
                      : 'border-slate-200 bg-white hover:border-slate-300 text-slate-650 hover:text-slate-900 hover:shadow-xs'
                  }`}
                >
                  Auglýsa {value.dative}
                </Link>
              );
            })}
            <Link
              to="/auglysendur"
              className="p-3 rounded-xl border text-center transition-all border-slate-200 bg-white hover:border-slate-300 text-slate-650 hover:text-slate-900 hover:shadow-xs"
            >
              Allt landið
            </Link>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <PublicFooter />
    </div>
  );
}
