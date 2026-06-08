import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import Logo from '@/components/ui/Logo';
import {
  Sparkles,
  MapPin,
  Code2,
  Coins,
  ShieldCheck,
  Zap,
  CheckCircle2,
  ChevronRight,
  ArrowRight,
  HelpCircle,
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

export default function PublisherLanding() {
  const { region } = useParams<{ region?: string }>();
  const navigate = useNavigate();
  const activeRegion = region ? REGIONS[region.toLowerCase()] : null;

  // Simple earnings calculator state
  const [pageviews, setPageviews] = useState(50000);
  // Estimate revenue based on 80% fill rate and 440 ISK publisher share (out of 550 CPM)
  const estimatedRevenue = Math.round((pageviews * 0.8 * 440) / 1000);

  useEffect(() => {
    // Dynamic SEO Metadata setup
    const titleText = activeRegion
      ? `Tekjur af vefsíðu ${activeRegion.dative} | Sýndu staðbundnar vefauglýsingar`
      : 'Breyttu vefumferð í tekjur á einfaldan hátt | Birtingur';
    const descriptionText = activeRegion
      ? `Ertu með vefsíðu, fréttamiðil eða blogg ${activeRegion.dative}? Birtingur býður upp á einfalda og sjálfvirka leið til að breyta heimsóknum í mánaðarlegar tekjur án alls hægagangs.`
      : 'Birtingur býður upp á léttasta auglýsingabúnað á markaðnum. Breyttu vefumferðinni þinni í mánaðarlegar tekjur með einni línu af kóða og vönduðum íslenskum auglýsingum.';

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
      <div className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full bg-indigo-500/5 blur-[120px] pointer-events-none -z-10" />
      <div className="absolute top-1/4 right-10 w-[500px] h-[500px] rounded-full bg-blue-500/5 blur-[100px] pointer-events-none -z-10" />

      {/* HEADER */}
      <header className="sticky top-0 z-50 backdrop-blur-lg bg-white/80 border-b border-slate-200/60 transition-all duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <Logo size={40} className="shadow-lg shadow-indigo-500/10 rounded-xl" />
            <div>
              <span className="font-extrabold text-2xl tracking-tight text-slate-900">
                Birtingur
              </span>
              {activeRegion && (
                <span className="hidden sm:inline-block text-[11px] font-bold px-2.5 py-0.5 ml-2.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-150">
                  <MapPin size={10} className="inline mr-1" />
                  {activeRegion.name}
                </span>
              )}
            </div>
          </Link>

          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/sign-in')}
              className="px-4 py-2.5 text-sm font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
            >
              Skrá inn
            </button>
            <button
              onClick={() => navigate('/sign-in')}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 font-bold text-sm text-white shadow-lg shadow-blue-600/20 hover:shadow-blue-500/30 transition-all duration-200 cursor-pointer"
            >
              Prófa frítt
            </button>
          </div>
        </div>
      </header>

      <main className="grow max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 md:py-20 space-y-16 relative">
        {/* HERO SECTION */}
        <section className="space-y-6 text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200/80 text-xs font-bold uppercase tracking-wider">
            <Sparkles size={14} className="text-indigo-600" />
            Breyttu vefumferð í hrein tekjumyndun
          </div>
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-slate-900 tracking-tight leading-tight">
            {activeRegion ? (
              <>
                Breyttu heimsóknum{' '}
                <span className="block mt-2 bg-linear-to-r from-indigo-600 via-blue-600 to-teal-550 bg-clip-text text-transparent">
                  {activeRegion.dative}
                </span>
                í öruggar tekjur
              </>
            ) : (
              <>
                Breyttu vefumferðinni þinni í{' '}
                <span className="block mt-2 bg-linear-to-r from-indigo-600 via-blue-600 to-teal-550 bg-clip-text text-transparent">
                  mánaðarlegar tekjur
                </span>
              </>
            )}
          </h1>
          <p className="text-base sm:text-lg text-slate-650 leading-relaxed font-semibold max-w-2xl mx-auto">
            Ertu með staðbundinn vef, bloggsíðu eða fréttagátt
            {activeRegion ? ` ${activeRegion.dative}` : ''}? Birtingur gerir þér kleift að sýna
            fallegar íslenskar auglýsingar með einni línu af kóða án alls hægagangs.
          </p>

          <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => navigate('/sign-in')}
              className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-blue-600 hover:bg-blue-500 font-extrabold text-white shadow-xl shadow-blue-600/30 hover:shadow-blue-500/40 hover:-translate-y-0.5 transition-all duration-200 cursor-pointer flex items-center justify-center gap-2"
            >
              Sækja auglýsingakóða <ArrowRight size={18} />
            </button>
            <a
              href="#reiknivel"
              className="w-full sm:w-auto px-6 py-4 rounded-2xl bg-white hover:bg-slate-50 border border-slate-200 font-bold text-slate-700 transition cursor-pointer text-center"
            >
              Reikna út tekjur
            </a>
          </div>
        </section>

        {/* KEY HIGHLIGHTS */}
        <section className="grid md:grid-cols-3 gap-6 pt-6">
          <Card className="p-6 space-y-3 bg-white border border-slate-200/80 shadow-xs">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
              <Code2 size={24} />
            </div>
            <h3 className="text-lg font-bold text-slate-900">1. Ein lína af kóða</h3>
            <p className="text-slate-600 text-sm font-medium leading-relaxed">
              Engin tækniflóki eða flókin forritun. Þú límir einn stuttan HTML-bút þar sem þú vilt
              að auglýsingin birtist og við sjáum um afganginn.
            </p>
          </Card>

          <Card className="p-6 space-y-3 bg-white border border-slate-200/80 shadow-xs">
            <div className="w-12 h-12 rounded-xl bg-teal-50 flex items-center justify-center text-teal-600 shrink-0">
              <Zap size={24} />
            </div>
            <h3 className="text-lg font-bold text-slate-900">2. Hraðasta skriftin</h3>
            <p className="text-slate-600 text-sm font-medium leading-relaxed">
              Skriftan okkar er undir <strong>1.5 KB</strong> og hleðst async. Hún hægir ekki á
              vefnum þínum um eina einustu millisekúndu, sem tryggir óbreyttan hleðslutíma og
              fullkomna Google SEO stöðu.
            </p>
          </Card>

          <Card className="p-6 space-y-3 bg-white border border-slate-200/80 shadow-xs">
            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
              <ShieldCheck size={24} />
            </div>
            <h3 className="text-lg font-bold text-slate-900">3. Vörumerkjaöryggi</h3>
            <p className="text-slate-650 text-sm font-medium leading-relaxed">
              Engar óæskilegar erlendar pop-up auglýsingar eða óviðeigandi efni. Gemini AI skannar
              allt efni sjálfvirkt og við samþykkjum aðeins vandaðar auglýsingar frá traustum
              fyrirtækjum.
            </p>
          </Card>
        </section>

        {/* REVENUE CALCULATOR */}
        <section
          id="reiknivel"
          className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm"
        >
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold">
                <Coins size={12} />
                80% hlutdeild til þín
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 leading-tight">
                Reiknaðu út þínar tekjur
              </h2>
              <p className="text-slate-650 text-sm font-medium leading-relaxed">
                Auglýsendur greiða 550 kr. CPM (fyrir 1.000 sýningar) og þú færð 80% af því (
                <strong>440 kr.</strong>) beint til þín. Tekjurnar safnast upp og eru millifærðar
                sjálfkrafa í banka í hverjum mánuði þegar reikningurinn nær lágmarksupphæð.
              </p>
              <ul className="space-y-2 text-slate-600 text-xs font-bold pt-2">
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                  Greiðslur í banka í hverjum mánuði
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                  Lágmarksútborgun er aðeins 5.000 kr.
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                  Einfalt mælaborð til að fylgjast með í rauntíma
                </li>
              </ul>
            </div>

            <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl space-y-6">
              <div>
                <label className="flex justify-between text-xs font-bold text-slate-700 mb-2">
                  <span>Mánaðarlegar síðusýningar vefsins:</span>
                  <span className="text-blue-600 font-extrabold text-sm">
                    {pageviews.toLocaleString('is-IS')} flettingar
                  </span>
                </label>
                <input
                  type="range"
                  min="10000"
                  max="500000"
                  step="10000"
                  value={pageviews}
                  onChange={(e) => setPageviews(Number(e.target.value))}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
                <div className="flex justify-between text-[10px] font-bold text-slate-400 mt-1">
                  <span>10.000</span>
                  <span>250.000</span>
                  <span>500.000</span>
                </div>
              </div>

              <div className="border-t border-slate-200 pt-4 text-center">
                <span className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Áætlaðar mánaðarlegar tekjur þínar
                </span>
                <span className="block text-3xl font-black text-slate-900 mt-1.5 bg-linear-to-r from-indigo-600 to-blue-600 bg-clip-text text-transparent">
                  {estimatedRevenue.toLocaleString('is-IS')} kr.
                </span>
                <span className="block text-[10px] text-slate-400 font-medium mt-1">
                  Reiknað út frá 80% fyllingarhlutfalli á lausum plássum
                </span>
              </div>

              <button
                onClick={() => navigate('/sign-in')}
                className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 font-bold text-sm text-white transition-all cursor-pointer shadow-md hover:shadow-lg flex items-center justify-center gap-1.5"
              >
                Sækja kóða og byrja <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </section>

        {/* COOKIELESS AND GDPR CONFORMANCE */}
        <section className="bg-slate-900 text-white rounded-3xl p-8 space-y-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-[300px] h-[300px] rounded-full bg-indigo-500/10 blur-[80px] pointer-events-none" />
          <div className="max-w-2xl space-y-4">
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight">
              100% GDPR-vænt og eldsnöggt
            </h2>
            <p className="text-slate-300 text-sm font-medium leading-relaxed">
              Margar auglýsingaskriftur hægja á vefsíðum og krefjast flókinna
              vafrakökusamþykkis-glugga. Birtingur notar <strong>engar vafrakökur (cookies)</strong>{' '}
              og engar persónulegar upplýsingar til að velja auglýsingar. Við styðjumst eingöngu við{' '}
              <strong>samhengis- og lénsstýringu</strong> ásamt staðsetningarmörkun (út frá IP-tölum
              á Vercel Edge).
            </p>
            <p className="text-slate-350 text-xs font-semibold leading-relaxed">
              Þetta tryggir að lesendur þínir fá fallegar, hraðar síður án pirrandi krefjandi
              sprettiglugga.
            </p>
          </div>
        </section>

        {/* REGIONAL NAVIGATION FOOTER GRID (CRAWLABLE SEO LINKS) */}
        <section className="space-y-4 pt-6">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider text-center">
            Auka tekjur af vefjum á þínu svæði
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 text-xs font-bold">
            {Object.entries(REGIONS).map(([key, value]) => {
              const isActive = region?.toLowerCase() === key;
              return (
                <Link
                  key={key}
                  to={`/midlar/${key}`}
                  className={`p-3 rounded-xl border text-center transition-all ${
                    isActive
                      ? 'border-indigo-650 bg-indigo-50/20 text-indigo-750'
                      : 'border-slate-200 bg-white hover:border-slate-300 text-slate-650 hover:text-slate-900 hover:shadow-xs'
                  }`}
                >
                  Sýna auglýsingar {value.dative}
                </Link>
              );
            })}
            <Link
              to="/midlar"
              className="p-3 rounded-xl border text-center transition-all border-slate-200 bg-white hover:border-slate-300 text-slate-650 hover:text-slate-900 hover:shadow-xs"
            >
              Allt landið
            </Link>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="bg-white border-t border-slate-200 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-semibold text-slate-400">
          <div className="flex items-center gap-2 text-slate-600">
            <Logo size={24} />
            <span className="font-bold">Birtingur © 2026</span>
          </div>
          <div className="flex gap-4">
            <Link to="/" className="hover:text-slate-650">
              Forsíða
            </Link>
            <Link to="/auglysendur" className="hover:text-slate-650">
              Fyrir auglýsendur
            </Link>
            <Link to="/sign-in" className="hover:text-slate-650">
              Innskráning
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
