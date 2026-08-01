import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import PublicHeader from '@/components/layout/PublicHeader';
import PublicFooter from '@/components/layout/PublicFooter';
import { updateSEO } from '@/lib/seo';
import { Eyebrow, BigFigure } from '@/components/ui/editorial';
import {
  AD_CATEGORIES,
  FLAT_CPM_ISK,
  DEFAULT_PLATFORM_FEE_PERCENT,
  MIN_PAYOUT_ISK,
} from '@ada/shared';

// Icelandic dot-grouped integer — same local-fmtNum convention as
// LandingPage.tsx/AdvertiserLanding.tsx/CampaignCreate.tsx/TopUp.tsx.
function fmtNum(n: number): string {
  return Math.round(n).toLocaleString('is-IS', { maximumFractionDigits: 0 });
}

const PUBLISHER_SHARE_PERCENT = 100 - DEFAULT_PLATFORM_FEE_PERCENT;
// The publisher's ISK cut of each 1.000-impression CPM block — derived, not
// hand-typed, so it can never drift from FLAT_CPM_ISK/DEFAULT_PLATFORM_FEE_PERCENT.
const PUBLISHER_CPM_SHARE_ISK = Math.round((FLAT_CPM_ISK * PUBLISHER_SHARE_PERCENT) / 100);

// Short display labels for the category pill row, derived from AD_CATEGORIES
// (not hand-typed) — see LandingPage.tsx for why: it keeps this list from
// drifting from what the platform actually targets.
const CATEGORY_LABELS = AD_CATEGORIES.map((c) => c.label.split(' & ')[0]);

const PUBLISHER_STEPS = [
  {
    n: '01',
    title: 'Veldu flokka',
    desc: 'Segðu okkur hvaða efnisflokkar lýsa vefnum þínum best — matur, ferðalög, tækni og fleira. Auglýsendur í þeim flokkum geta þá birst hjá þér.',
  },
  {
    n: '02',
    title: 'Settu upp pláss',
    desc: 'Límdu eina línu af HTML kóða inn á síðuna þar sem þú vilt sýna auglýsingu. Engin flókin uppsetning eða tæknivinna.',
  },
  {
    n: '03',
    title: 'Fylgstu með',
    desc: 'Sjáðu birtingar og áætlaðar tekjur í mælaborðinu og fáðu greitt í bankann þinn mánaðarlega þegar reikningurinn nær lágmarksupphæð.',
  },
];

const TRUST_ITEMS = [
  {
    title: 'Ein lína af kóða',
    desc: 'Engin tækniflóki eða flókin forritun — einn stuttur HTML-bútur og við sjáum um afganginn.',
  },
  {
    title: 'Auglýsingar úr þínum flokkum',
    desc: 'Auglýsendur kaupa eftir efnisflokkum, svo það sem birtist hjá þér passar við það sem vefurinn þinn fjallar um.',
  },
  {
    title: 'Aðeins raunverulegar birtingar taldar',
    desc: 'Birting telst aðeins þegar auglýsingin sést — í samræmi við IAB-viðmið.',
  },
  {
    title: 'Þú ræður hvað birtist',
    desc: 'Þú getur útilokað viðkvæma auglýsingaflokka sem henta ekki lesendum þínum.',
  },
  {
    title: 'Engin rakning frá þriðja aðila',
    desc: 'Engar þriðju aðila vafrakökur — tíðnistýring er eingöngu virk með samþykki notandans. Það verndar lesendur þína.',
  },
  {
    title: `Lágmarksútborgun aðeins ${fmtNum(MIN_PAYOUT_ISK)} kr.`,
    desc: 'Reikningurinn safnast upp og þú færð millifærslu í bankann þinn mánaðarlega þegar lágmarkinu er náð.',
  },
];

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

const SECTION_PAD_X = {
  paddingLeft: 'clamp(24px,5vw,72px)',
  paddingRight: 'clamp(24px,5vw,72px)',
} as const;

export default function PublisherLanding() {
  const { region } = useParams<{ region?: string }>();
  const navigate = useNavigate();
  const activeRegion = region ? REGIONS[region.toLowerCase()] : null;

  // Simple earnings calculator state — the fill-rate assumption below is a
  // labeled illustrative estimate, not a promised/typical outcome (see the
  // disclaimer rendered under the result).
  const [pageviews, setPageviews] = useState(50000);
  const ASSUMED_FILL_RATE = 0.8;
  const estimatedRevenue = Math.round(
    (pageviews * ASSUMED_FILL_RATE * PUBLISHER_CPM_SHARE_ISK) / 1000,
  );

  useEffect(() => {
    // Dynamic SEO Metadata setup
    const titleText = activeRegion
      ? `Selja auglýsingar á vefsíðu ${activeRegion.dative} | Tekjur af vefnum`
      : 'Selja auglýsingar á netinu: Tekjur af vefsíðunni þinni | Birtingur';
    const descriptionText = activeRegion
      ? `Ertu með vefsíðu eða blogg ${activeRegion.dative}? Birtingur gerir þér kleift að sýna vandaðar íslenskar vefauglýsingar og fá ${PUBLISHER_SHARE_PERCENT}% tekjuskiptingu. Byrjaðu núna!`
      : `Breyttu vefumferðinni þinni í tekjur. Sýndu vandaðar íslenskar vefauglýsingar án rakningar frá þriðja aðila og fáðu ${PUBLISHER_SHARE_PERCENT}% af auglýsingatekjum. Sækja kóða og byrja strax!`;

    const path = region ? `/midlar/${region.toLowerCase()}` : '/midlar';
    updateSEO(titleText, descriptionText, path);

    return () => {
      document.title = 'Birtingur';
    };
  }, [activeRegion, region]);

  return (
    <div className="flex min-h-screen flex-col bg-white font-sans text-slate-900 antialiased selection:bg-primary selection:text-white">
      {/* HEADER */}
      <PublicHeader activeRegion={activeRegion} />

      <main className="grow">
        {/* ============ HERO ============ */}
        <section
          style={{ paddingTop: 'clamp(72px,10vw,132px)', paddingBottom: 'clamp(56px,8vw,96px)' }}
        >
          <div className="mx-auto" style={{ maxWidth: 1180, ...SECTION_PAD_X }}>
            <Eyebrow className="mb-5.5 block">Fyrir útgefendur</Eyebrow>
            <h1
              className="m-0 max-w-[18ch] font-extrabold text-slate-900"
              style={{
                fontSize: 'clamp(40px,7vw,92px)',
                letterSpacing: '-0.035em',
                lineHeight: 0.98,
                textWrap: 'balance',
              }}
            >
              {activeRegion ? (
                <>
                  Breyttu heimsóknum <span className="text-primary">{activeRegion.dative}</span> í
                  tekjur
                </>
              ) : (
                <>Breyttu vefumferðinni þinni í mánaðarlegar tekjur</>
              )}
            </h1>

            <div
              className="flex flex-wrap items-end justify-between gap-10"
              style={{ marginTop: 'clamp(36px,5vw,64px)' }}
            >
              <div className="max-w-140">
                <p
                  className="m-0 font-normal text-slate-700"
                  style={{ fontSize: 'clamp(18px,2vw,22px)', lineHeight: 1.55 }}
                >
                  Ertu með staðbundinn vef, bloggsíðu eða fréttagátt
                  {activeRegion ? ` ${activeRegion.dative}` : ''}? Settu upp einn stuttan kóðabút og
                  byrjaðu að fá borgað fyrir auglýsingar sem passa við lesendur þína.
                </p>
                <div className="mt-9 flex flex-wrap gap-3.5">
                  <Button onClick={() => navigate('/sign-in')}>Sækja auglýsingakóða</Button>
                  <a
                    href="#reiknivel"
                    className="inline-flex items-center justify-center rounded-lg border border-primary px-5 py-3 text-sm font-semibold text-primary transition-all duration-200 hover:bg-slate-50"
                  >
                    Reikna út tekjur
                  </a>
                </div>
              </div>
              <div className="mb-1.5 border-l-2 border-primary pl-5">
                <BigFigure value={`${PUBLISHER_SHARE_PERCENT}%`} suffix="til þín" />
                <div className="mt-2.5 max-w-[16ch] text-sm text-slate-500">
                  Þitt hlutfall af hverri seldri birtingu
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============ CATEGORY PILL ROW ============ */}
        <div className="border-y border-slate-200">
          <div
            className="mx-auto flex flex-wrap items-center gap-x-6 gap-y-3.5 py-5"
            style={{ maxWidth: 1180, ...SECTION_PAD_X }}
          >
            {CATEGORY_LABELS.map((label, i) => (
              <span className="contents" key={label}>
                <span className="text-[13px] font-semibold tracking-[0.14em] text-slate-500 uppercase">
                  {label}
                </span>
                {i < CATEGORY_LABELS.length - 1 && <span className="text-slate-300">/</span>}
              </span>
            ))}
          </div>
        </div>

        {/* ============ SVONA VIRKAR ÞAÐ ============ */}
        <section
          style={{ paddingTop: 'clamp(80px,11vw,148px)', paddingBottom: 'clamp(56px,7vw,96px)' }}
        >
          <div className="mx-auto" style={{ maxWidth: 1180, ...SECTION_PAD_X }}>
            <Eyebrow className="mb-5.5 block">Svona virkar það</Eyebrow>
            <h2
              className="m-0 max-w-[18ch] font-extrabold text-slate-900"
              style={{
                fontSize: 'clamp(30px,4.2vw,52px)',
                letterSpacing: '-0.025em',
                lineHeight: 1.02,
                marginBottom: 'clamp(44px,6vw,72px)',
              }}
            >
              Frá vef að fyrstu tekjum í þremur skrefum
            </h2>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
              {PUBLISHER_STEPS.map((s) => (
                <Card key={s.n} className="h-full">
                  <div className="flex min-h-59 flex-col gap-4.5 p-1">
                    <span className="text-[44px] leading-none font-extrabold tracking-[-0.03em] text-primary tabular-nums">
                      {s.n}
                    </span>
                    <div className="h-px bg-slate-200" />
                    <h3 className="m-0 text-[19px] font-bold tracking-[-0.01em] text-slate-900">
                      {s.title}
                    </h3>
                    <p className="m-0 text-[15px] leading-[1.6] text-slate-600">{s.desc}</p>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* ============ REGIONAL CONTEXT (region routes only) ============ */}
        {activeRegion && (
          <section style={{ paddingBottom: 'clamp(56px,7vw,96px)' }}>
            <div className="mx-auto" style={{ maxWidth: 1180, ...SECTION_PAD_X }}>
              <div className="rounded-card border border-slate-200 bg-slate-50 p-8">
                <h3 className="m-0 mb-3 text-xl font-bold tracking-[-0.01em] text-slate-900">
                  Vefir {activeRegion.dative}
                </h3>
                <p className="m-0 max-w-[62ch] text-[15px] leading-[1.65] text-slate-600">
                  Auglýsendur geta beint herferðum sínum á tiltekin svæði, þar á meðal{' '}
                  {activeRegion.dative}, alveg eins og þeir velja efnisflokka. Þannig geta fyrirtæki
                  náð til lesenda þinna á þínu svæði — óháð því hvar annars staðar á landinu
                  Birtingur er líka í boði.
                </p>
              </div>
            </div>
          </section>
        )}

        {/* ============ EARNINGS CALCULATOR ============ */}
        <section
          id="reiknivel"
          style={{ paddingTop: 'clamp(24px,4vw,48px)', paddingBottom: 'clamp(80px,11vw,148px)' }}
        >
          <div className="mx-auto" style={{ maxWidth: 1180, ...SECTION_PAD_X }}>
            <div className="grid grid-cols-1 gap-10 rounded-card border border-slate-200 bg-white p-8 md:grid-cols-2 md:p-12">
              <div>
                <Eyebrow className="mb-4.5 block">Tekjureiknivél</Eyebrow>
                <h2
                  className="m-0 font-extrabold text-slate-900"
                  style={{
                    fontSize: 'clamp(26px,3.2vw,38px)',
                    letterSpacing: '-0.02em',
                    lineHeight: 1.05,
                    marginBottom: '18px',
                  }}
                >
                  Reiknaðu áætlaðar tekjur
                </h2>
                <p className="m-0 text-[15px] leading-[1.65] text-slate-600">
                  Auglýsendur greiða{' '}
                  <strong className="text-slate-900">{fmtNum(FLAT_CPM_ISK)} kr.</strong> CPM (fyrir
                  1.000 birtingar) og þú færð {PUBLISHER_SHARE_PERCENT}% af því —{' '}
                  <strong className="text-slate-900">{fmtNum(PUBLISHER_CPM_SHARE_ISK)} kr.</strong>{' '}
                  — beint til þín.
                </p>
                <ul className="mt-6 flex flex-col gap-3 text-sm font-medium text-slate-600">
                  <li className="flex items-start gap-2.5">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    Millifærsla í bankann þinn mánaðarlega
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    Lágmarksútborgun er aðeins {fmtNum(MIN_PAYOUT_ISK)} kr.
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    Einfalt mælaborð til að fylgjast með stöðunni
                  </li>
                </ul>
              </div>

              <div className="rounded-card border border-slate-200 bg-slate-50 p-6">
                <label className="mb-2 flex justify-between text-xs font-bold text-slate-700">
                  <span>Mánaðarlegar síðusýningar vefsins</span>
                  <span className="font-extrabold text-primary tabular-nums">
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
                  className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-200 accent-primary"
                />
                <div className="mt-1 flex justify-between text-[10px] font-bold text-slate-400 tabular-nums">
                  <span>10.000</span>
                  <span>250.000</span>
                  <span>500.000</span>
                </div>

                <div className="mt-6 border-t border-slate-200 pt-5 text-center">
                  <span className="block text-[11px] font-bold tracking-wider text-slate-400 uppercase">
                    Áætlaðar mánaðarlegar tekjur
                  </span>
                  <span className="mt-1.5 block text-3xl font-extrabold tracking-tight text-slate-900 tabular-nums">
                    {fmtNum(estimatedRevenue)} kr.
                  </span>
                  <span className="mt-1 block text-[11px] leading-normal text-slate-500">
                    Einföld áætlun miðuð við gefna forsendu um {Math.round(ASSUMED_FILL_RATE * 100)}
                    % fyllingu, eingöngu til skýringar — engin trygging fyrir árangri. Raunverulegar
                    tekjur ráðast af eftirspurn auglýsenda í þínum flokkum.
                  </span>
                </div>

                <Button className="mt-6 w-full" onClick={() => navigate('/sign-in')}>
                  Sækja kóða og byrja
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* ============ STATS BAND (navy full-bleed) ============ */}
        <section
          className="bg-primary"
          style={{ paddingTop: 'clamp(72px,10vw,128px)', paddingBottom: 'clamp(72px,10vw,128px)' }}
        >
          <div className="mx-auto" style={{ maxWidth: 1180, ...SECTION_PAD_X }}>
            <span className="mb-5.5 inline-block text-[13px] font-semibold tracking-[0.16em] text-white/60 uppercase">
              Gagnsæ tekjuskipting
            </span>
            <h2
              className="m-0 max-w-[18ch] font-extrabold text-white"
              style={{
                fontSize: 'clamp(30px,4.2vw,52px)',
                letterSpacing: '-0.025em',
                lineHeight: 1.02,
                marginBottom: 'clamp(40px,6vw,64px)',
              }}
            >
              Þú heldur meirihlutanum. Alltaf.
            </h2>
            <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
              <div>
                <div className="text-[13px] font-semibold tracking-wider text-white/60 uppercase">
                  Hlutdeild til þín
                </div>
                <div className="mt-2.5 text-3xl font-extrabold tracking-tight text-white tabular-nums">
                  {PUBLISHER_SHARE_PERCENT}%
                </div>
              </div>
              <div>
                <div className="text-[13px] font-semibold tracking-wider text-white/60 uppercase">
                  Lágmarksútborgun
                </div>
                <div className="mt-2.5 text-3xl font-extrabold tracking-tight text-white tabular-nums">
                  {fmtNum(MIN_PAYOUT_ISK)} kr.
                </div>
              </div>
              <div>
                <div className="text-[13px] font-semibold tracking-wider text-white/60 uppercase">
                  Virkir efnisflokkar
                </div>
                <div className="mt-2.5 text-3xl font-extrabold tracking-tight text-white tabular-nums">
                  {AD_CATEGORIES.length}
                </div>
              </div>
              <div>
                <div className="text-[13px] font-semibold tracking-wider text-white/60 uppercase">
                  Greiðslur
                </div>
                <div className="mt-2.5 text-3xl font-extrabold tracking-tight text-white tabular-nums">
                  Mánaðarlega
                </div>
              </div>
            </div>
            <div className="mt-9 flex flex-wrap gap-3">
              {CATEGORY_LABELS.map((label) => (
                <span
                  key={label}
                  className="rounded-full border border-white/20 bg-white/10 px-4.5 py-2 text-sm font-medium text-slate-200"
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ============ TRUST ============ */}
        <section
          style={{ paddingTop: 'clamp(80px,11vw,148px)', paddingBottom: 'clamp(80px,11vw,148px)' }}
        >
          <div className="mx-auto" style={{ maxWidth: 1180, ...SECTION_PAD_X }}>
            <Eyebrow className="mb-5.5 block">Af hverju Birtingur</Eyebrow>
            <h2
              className="m-0 max-w-[16ch] font-extrabold text-slate-900"
              style={{
                fontSize: 'clamp(30px,4.2vw,52px)',
                letterSpacing: '-0.025em',
                lineHeight: 1.02,
                marginBottom: 'clamp(44px,6vw,72px)',
              }}
            >
              Kostir sem skipta máli
            </h2>
            <div className="grid grid-cols-1 gap-x-14 gap-y-10 sm:grid-cols-2 md:grid-cols-3">
              {TRUST_ITEMS.map((item) => (
                <div key={item.title} className="border-t-2 border-primary pt-6.5">
                  <h3 className="m-0 mb-3 text-xl font-bold tracking-[-0.01em] text-slate-900">
                    {item.title}
                  </h3>
                  <p className="m-0 text-[15px] leading-[1.65] text-slate-600">{item.desc}</p>
                </div>
              ))}
            </div>
            <div className="mt-10 flex flex-wrap items-baseline gap-x-6 gap-y-2.5 border-t border-slate-200 pt-6 text-sm text-slate-500">
              <span className="font-semibold tracking-[0.01em] text-slate-900">
                Og að sjálfsögðu
              </span>
              <span>Vörn gegn smellasvindli</span>
              <span className="text-slate-300">·</span>
              <span>Íslenskt fyrirtæki með íslenskri þjónustu</span>
              <span className="text-slate-300">·</span>
              <span>Þú heldur {PUBLISHER_SHARE_PERCENT}% af hverri krónu</span>
            </div>
            <div className="mt-10 flex flex-wrap items-center gap-3.5">
              <Button onClick={() => navigate('/sign-in')}>Sækja auglýsingakóða</Button>
              <a
                href="#reiknivel"
                className="inline-flex items-center justify-center rounded-lg border border-primary px-5 py-3 text-sm font-semibold text-primary transition-all duration-200 hover:bg-slate-50"
              >
                Reikna út tekjur
              </a>
            </div>
          </div>
        </section>

        {/* ============ REGIONAL NAVIGATION (crawlable SEO links) ============ */}
        <section
          className="border-t border-slate-200"
          style={{ paddingTop: 'clamp(56px,7vw,96px)', paddingBottom: 'clamp(56px,7vw,96px)' }}
        >
          <div className="mx-auto" style={{ maxWidth: 1180, ...SECTION_PAD_X }}>
            <Eyebrow className="mb-5.5 block">Fleiri staðir</Eyebrow>
            <h2
              className="m-0 mb-8 max-w-[18ch] font-extrabold text-slate-900"
              style={{
                fontSize: 'clamp(24px,3vw,34px)',
                letterSpacing: '-0.02em',
                lineHeight: 1.1,
              }}
            >
              Auka tekjur af vefjum á þínu svæði
            </h2>
            <div className="flex flex-wrap gap-2.5">
              {Object.entries(REGIONS).map(([key, value]) => {
                const isActive = region?.toLowerCase() === key;
                return (
                  <Link
                    key={key}
                    to={`/midlar/${key}`}
                    className={
                      isActive
                        ? 'rounded-full border border-primary bg-primary/6 px-4.5 py-2.25 text-[14px] font-semibold text-primary'
                        : 'rounded-full border border-slate-200 bg-white px-4.5 py-2.25 text-[14px] font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary'
                    }
                  >
                    Sýna auglýsingar {value.dative}
                  </Link>
                );
              })}
              <Link
                to="/midlar"
                className="rounded-full border border-slate-200 bg-white px-4.5 py-2.25 text-[14px] font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary"
              >
                Allt landið
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <PublicFooter />
    </div>
  );
}
