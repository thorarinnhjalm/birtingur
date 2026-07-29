import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import PublicHeader from '@/components/layout/PublicHeader';
import PublicFooter from '@/components/layout/PublicFooter';
import { updateSEO } from '@/lib/seo';
import { Eyebrow, BigFigure } from '@/components/ui/editorial';
import { AD_CATEGORIES, FLAT_CPM_ISK, DEFAULT_PLATFORM_FEE_PERCENT } from '@ada/shared';

// Icelandic dot-grouped integer — same local-fmtNum convention as
// LandingPage.tsx/CampaignCreate.tsx/TopUp.tsx.
function fmtNum(n: number): string {
  return Math.round(n).toLocaleString('is-IS', { maximumFractionDigits: 0 });
}

const PUBLISHER_SHARE_PERCENT = 100 - DEFAULT_PLATFORM_FEE_PERCENT;

// Short display labels for the category pill row, derived from AD_CATEGORIES
// (not hand-typed) — see LandingPage.tsx for why: it keeps this list from
// drifting from what the platform actually targets.
const CATEGORY_LABELS = AD_CATEGORIES.map((c) => c.label.split(' & ')[0]);

const ADVERTISER_STEPS = [
  {
    n: '01',
    title: 'Veldu flokka',
    desc: 'Veldu þá efnisflokka sem henta viðskiptavinum þínum — matur, ferðalög, tækni og fleira. Kerfið sýnir þér strax hversu margar birtingar eru í boði í hverjum flokki og í hvaða stærðum.',
  },
  {
    n: '02',
    title: 'Ákveddu fjárhæð',
    desc: 'Fast CPM verð og rauntíma birtingaspá áður en þú borgar. Engin uppboð, engir faldir kostnaðir.',
  },
  {
    n: '03',
    title: 'Búðu til borðana — eða láttu okkur gera það',
    desc: 'Áttu enga auglýsingaborða? Límdu inn slóðina á vefsíðuna þína og gervigreindin skrifar textann og útbýr borðana í öllum þeim stærðum sem herferðin þarf. Þú velur, lagar og staðfestir — eða hleður upp þínum eigin borðum.',
  },
  {
    n: '04',
    title: 'Fylgstu með',
    desc: 'Sjáðu birtingar og smelli í rauntíma og fínstilltu herferðina hvenær sem er — beint úr stjórnborðinu þínu.',
  },
];

const TRUST_ITEMS = [
  {
    title: `Eitt fast verð — ${fmtNum(FLAT_CPM_ISK)} kr. CPM`,
    desc: `${fmtNum(FLAT_CPM_ISK)} kr. fyrir hverjar 1.000 birtingar. Engin uppboð, ekkert flækjustig.`,
  },
  {
    title: 'Flokkakaup í stað stakra plássa',
    desc: 'Veldu efnisflokk og fjárhæð — við dreifum birtingunum á alla íslenska vefi í flokknum.',
  },
  {
    title: 'Borðagerð innifalin',
    desc: 'Þú þarft hvorki hönnunarstofu né hönnunarforrit. Gervigreindin býr til borðana út frá vefsíðunni þinni — í nákvæmlega þeim stærðum sem auglýsingaplássin í flokkunum þínum nota — og þú átt alltaf síðasta orðið.',
  },
  {
    title: 'Sjáðu áætlunina áður en þú borgar',
    desc: 'Rauntíma birtingaspá fyrir hvern flokk áður en herferðin fer í loftið.',
  },
  {
    title: 'Þú ferð aldrei yfir fjárhagsáætlun',
    desc: 'Herferðin stöðvast sjálfkrafa þegar fjárhæðinni er náð.',
  },
  {
    title: 'Aðeins raunverulegar birtingar teljast',
    desc: 'Birting telst aðeins þegar auglýsingin sést — í samræmi við IAB-viðmið.',
  },
  {
    title: 'Engar vafrakökur frá þriðja aðila',
    desc: 'Persónuvernd innbyggð: engin þriðju aðila rakning og tíðnistýring aðeins með samþykki notanda.',
  },
];

const REGIONS: Record<
  string,
  {
    name: string;
    dative: string;
    genitive: string;
    parentName: string;
    regionLabel: string;
  }
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

export default function AdvertiserLanding() {
  const { region } = useParams<{ region?: string }>();
  const activeRegion = region ? REGIONS[region.toLowerCase()] : null;

  // Simple pricing calculator state
  const [budget, setBudget] = useState(15000);
  const estimatedImpressions = Math.round((budget / FLAT_CPM_ISK) * 1000);

  useEffect(() => {
    // Dynamic SEO Metadata setup
    const titleText = activeRegion
      ? `Auglýsa á netinu ${activeRegion.dative} | Einföld birtingaþjónusta`
      : 'Auglýsa á netinu: Einföld birtingaþjónusta fyrir fyrirtæki | Birtingur';
    const descriptionText = activeRegion
      ? `Auglýstu ${activeRegion.dative} með flokkakaupum á íslenskum vefjum. Fast ${fmtNum(FLAT_CPM_ISK)} kr. CPM verð, engin uppboð. Skráðu þig á biðlista!`
      : `Auglýstu á íslenskum vefsíðum eftir efnisflokkum á föstu ${fmtNum(FLAT_CPM_ISK)} kr. CPM verði. Engin uppboð, ekkert flækjustig. Skráðu þig á biðlista!`;

    const path = region ? `/auglysendur/${region.toLowerCase()}` : '/auglysendur';
    updateSEO(titleText, descriptionText, path);

    return () => {
      document.title = 'Birtingur';
    };
  }, [activeRegion, region]);

  // Dispatches the same open-public-support event PublicFooter listens for —
  // registration is closed (see RoleSelect.tsx REGISTRATION_CLOSED), so every
  // "buy" CTA on this page routes to the waitlist instead of a live signup.
  const openWaitlist = (extra?: string) => {
    const event = new window.CustomEvent('open-public-support', {
      detail: {
        subject: 'Biðlisti: Vil kaupa auglýsingar',
        body: `Góðan daginn. Ég hef áhuga á að auglýsa í Birtingi${activeRegion ? ` með miðun á ${activeRegion.name}` : ''}${extra ?? ''} þegar opnað verður fyrir skráningu nýrra auglýsenda. Vinsamlegast látið mig vita.`,
      },
    });
    window.dispatchEvent(event);
  };

  return (
    <div className="flex min-h-screen flex-col bg-white font-sans text-slate-900 antialiased selection:bg-primary selection:text-white">
      {/* Informational banner — real business state (advertiser self-signup is
          currently closed, see RoleSelect.tsx REGISTRATION_CLOSED). Mirrors
          the banner on LandingPage.tsx so the two pages read as one system. */}
      <div className="flex flex-wrap items-center justify-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-center text-xs font-medium text-slate-600 sm:text-sm">
        <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold tracking-wider text-primary uppercase">
          Tilkynning
        </span>
        <span>
          Eins og er erum við eingöngu að skrá ný auglýsingapláss (vefi). Skráning nýrra auglýsenda
          opnar fljótlega –{' '}
          <button
            onClick={() => openWaitlist()}
            className="inline cursor-pointer border-none bg-transparent p-0 font-bold text-primary underline hover:text-primary-800"
          >
            smelltu hér til að skrá þig á biðlista!
          </button>
        </span>
      </div>

      {/* HEADER */}
      <PublicHeader activeRegion={activeRegion} />

      <main className="grow">
        {/* ============ HERO ============ */}
        <section
          style={{ paddingTop: 'clamp(72px,10vw,132px)', paddingBottom: 'clamp(56px,8vw,96px)' }}
        >
          <div className="mx-auto" style={{ maxWidth: 1180, ...SECTION_PAD_X }}>
            <Eyebrow className="mb-[22px] block">Fyrir auglýsendur</Eyebrow>
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
                  Auglýstu <span className="text-primary">{activeRegion.dative}</span> á íslenskum
                  vefjum
                </>
              ) : (
                <>Auglýstu á íslenskum vefjum eftir áhugasviði, ekki eftir stökum vefjum</>
              )}
            </h1>

            <div
              className="flex flex-wrap items-end justify-between gap-10"
              style={{ marginTop: 'clamp(36px,5vw,64px)' }}
            >
              <div className="max-w-[560px]">
                <p
                  className="m-0 font-normal text-slate-700"
                  style={{ fontSize: 'clamp(18px,2vw,22px)', lineHeight: 1.55 }}
                >
                  {activeRegion ? (
                    <>
                      Kauptu auglýsingar eftir efnisflokkum sem henta fyrirtæki þínu{' '}
                      {activeRegion.dative} — matur, ferðalög, tækni og fleira. Sama fasta, gagnsæa
                      verðið hvar sem þú ert á landinu.
                    </>
                  ) : (
                    <>
                      Kauptu auglýsingar eftir efnisflokkum — ekki eftir stökum vefjum. Náðu til
                      lesenda á íslenskum miðlum í kringum matinn, ferðalögin og tæknina sem þeir
                      lesa um hvern dag.
                    </>
                  )}
                </p>
                <div className="mt-9 flex flex-wrap gap-3.5">
                  <Button onClick={() => openWaitlist()}>Skrá mig á biðlista</Button>
                  <a
                    href="#reiknivel"
                    className="inline-flex items-center justify-center rounded-lg border border-primary px-5 py-3 text-sm font-semibold text-primary transition-all duration-200 hover:bg-slate-50"
                  >
                    Sjá verðlagningu
                  </a>
                </div>
              </div>
              <div className="mb-1.5 border-l-2 border-primary pl-5">
                <BigFigure value={fmtNum(FLAT_CPM_ISK)} suffix="kr. CPM" />
                <div className="mt-2.5 max-w-[15ch] text-sm text-slate-500">
                  Eitt fast verð fyrir hverjar 1.000 birtingar
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
            <Eyebrow className="mb-[22px] block">Svona virkar það</Eyebrow>
            <h2
              className="m-0 max-w-[18ch] font-extrabold text-slate-900"
              style={{
                fontSize: 'clamp(30px,4.2vw,52px)',
                letterSpacing: '-0.025em',
                lineHeight: 1.02,
                marginBottom: 'clamp(44px,6vw,72px)',
              }}
            >
              Frá flokki að fyrstu birtingu í fjórum skrefum
            </h2>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {ADVERTISER_STEPS.map((s) => (
                <Card key={s.n} className="h-full">
                  <div className="flex min-h-[236px] flex-col gap-[18px] p-1">
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
                  Fyrirtæki {activeRegion.dative}
                </h3>
                <p className="m-0 max-w-[62ch] text-[15px] leading-[1.65] text-slate-600">
                  Birtingur dreifir birtingum eftir efnisflokkum á vefjum um allt land — óháð því
                  hvort fyrirtækið þitt er {activeRegion.dative} eða annars staðar á landinu. Þú
                  velur flokkana sem henta viðskiptavinum þínum og við sjáum um að finna réttu
                  miðlana, á sama fasta {fmtNum(FLAT_CPM_ISK)} kr. CPM verðinu.
                </p>
              </div>
            </div>
          </section>
        )}

        {/* ============ PRICING CALCULATOR ============ */}
        <section
          id="reiknivel"
          style={{ paddingTop: 'clamp(24px,4vw,48px)', paddingBottom: 'clamp(80px,11vw,148px)' }}
        >
          <div className="mx-auto" style={{ maxWidth: 1180, ...SECTION_PAD_X }}>
            <div className="grid grid-cols-1 gap-10 rounded-card border border-slate-200 bg-white p-8 md:grid-cols-2 md:p-12">
              <div>
                <Eyebrow className="mb-[18px] block">Verðreiknivél</Eyebrow>
                <h2
                  className="m-0 font-extrabold text-slate-900"
                  style={{
                    fontSize: 'clamp(26px,3.2vw,38px)',
                    letterSpacing: '-0.02em',
                    lineHeight: 1.05,
                    marginBottom: '18px',
                  }}
                >
                  Einfalt og gagnsætt verð
                </h2>
                <p className="m-0 text-[15px] leading-[1.65] text-slate-600">
                  Hverjar 1.000 birtingar kosta nákvæmlega{' '}
                  <strong className="text-slate-900">{fmtNum(FLAT_CPM_ISK)} kr.</strong> (CPM). Þú
                  ræður sjálf/ur hversu miklu þú eyðir.
                </p>
                <ul className="mt-6 flex flex-col gap-3 text-sm font-medium text-slate-600">
                  <li className="flex items-start gap-2.5">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    Engin mánaðargjöld eða uppsetningarkostnaður
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    Breyttu eða stöðvaðu herferð hvenær sem er
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    Herferðin stöðvast sjálfkrafa þegar fjárhæðinni er náð
                  </li>
                </ul>
              </div>

              <div className="rounded-card border border-slate-200 bg-slate-50 p-6">
                <label className="mb-2 flex justify-between text-xs font-bold text-slate-700">
                  <span>Hversu miklu viltu eyða á mánuði?</span>
                  <span className="font-extrabold text-primary tabular-nums">
                    {fmtNum(budget)} kr.
                  </span>
                </label>
                <input
                  type="range"
                  min="5000"
                  max="100000"
                  step="5000"
                  value={budget}
                  onChange={(e) => setBudget(Number(e.target.value))}
                  className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-200 accent-primary"
                />
                <div className="mt-1 flex justify-between text-[10px] font-bold text-slate-400 tabular-nums">
                  <span>5.000 kr.</span>
                  <span>50.000 kr.</span>
                  <span>100.000 kr.</span>
                </div>

                <div className="mt-6 border-t border-slate-200 pt-5 text-center">
                  <span className="block text-[11px] font-bold tracking-wider text-slate-400 uppercase">
                    Áætlaður fjöldi birtinga
                  </span>
                  <span className="mt-1.5 block text-3xl font-extrabold tracking-tight text-slate-900 tabular-nums">
                    {fmtNum(estimatedImpressions)}
                  </span>
                  <span className="mt-1 block text-[11px] leading-normal text-slate-500">
                    Einfölduð áætlun miðað við fast CPM verð. Nákvæm birtingaspá fyrir hvern flokk
                    birtist þegar herferð er sett upp.
                  </span>
                </div>

                <Button
                  className="mt-6 w-full"
                  onClick={() =>
                    openWaitlist(
                      ` með áætlað mánaðarlegt auglýsingafjármagn upp á um það bil ${fmtNum(budget)} kr.`,
                    )
                  }
                >
                  Skrá mig á biðlista
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
            <span className="mb-[22px] inline-block text-[13px] font-semibold tracking-[0.16em] text-white/60 uppercase">
              Gagnsætt verð
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
              Eitt fast verð. Engin uppboð.
            </h2>
            <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
              <div>
                <div className="text-[13px] font-semibold tracking-wider text-white/60 uppercase">
                  Fast CPM verð
                </div>
                <div className="mt-2.5 text-3xl font-extrabold tracking-tight text-white tabular-nums">
                  {fmtNum(FLAT_CPM_ISK)} kr.
                </div>
              </div>
              <div>
                <div className="text-[13px] font-semibold tracking-wider text-white/60 uppercase">
                  Uppsetningarkostnaður
                </div>
                <div className="mt-2.5 text-3xl font-extrabold tracking-tight text-white tabular-nums">
                  0 kr.
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
                  VSK sundurliðaður
                </div>
                <div className="mt-2.5 text-3xl font-extrabold tracking-tight text-white tabular-nums">
                  24%
                </div>
              </div>
            </div>
            <div className="mt-9 flex flex-wrap gap-3">
              {CATEGORY_LABELS.map((label) => (
                <span
                  key={label}
                  className="rounded-full border border-white/20 bg-white/10 px-[18px] py-2 text-sm font-medium text-slate-200"
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
            <Eyebrow className="mb-[22px] block">Af hverju Birtingur</Eyebrow>
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
                <div key={item.title} className="border-t-2 border-primary pt-[26px]">
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
              <span>24% VSK sundurliðaður</span>
              <span className="text-slate-300">·</span>
              <span>Teya-greiðslur</span>
              <span className="text-slate-300">·</span>
              <span>Útgefendur halda {PUBLISHER_SHARE_PERCENT}% af hverri krónu</span>
            </div>
            <div className="mt-10 flex flex-wrap items-center gap-3.5">
              <Button onClick={() => openWaitlist()}>Skrá mig á biðlista</Button>
              <a
                href="#reiknivel"
                className="inline-flex items-center justify-center rounded-lg border border-primary px-5 py-3 text-sm font-semibold text-primary transition-all duration-200 hover:bg-slate-50"
              >
                Sjá verðlagningu
              </a>
            </div>
          </div>
        </section>

        {/* ============ FOR AI AGENTS (MCP) ============ */}
        <section style={{ paddingBottom: 'clamp(56px,7vw,96px)' }}>
          <div className="mx-auto" style={{ maxWidth: 1180, ...SECTION_PAD_X }}>
            <div className="rounded-card border border-slate-200 bg-slate-50 p-8">
              <Eyebrow className="mb-3 block">Fyrir gervigreind</Eyebrow>
              <h3 className="m-0 mb-3 text-xl font-bold tracking-[-0.01em] text-slate-900">
                Gervigreindin þín getur keypt fyrir þig
              </h3>
              <p className="m-0 max-w-[62ch] text-[15px] leading-[1.65] text-slate-600">
                Birtingur er íslenskt auglýsingakerfi með opna MCP-tengingu:
                gervigreindarumboðsmaður með API-lykil getur kannað flokka, séð birtingaspá og keypt
                herferð — innan mánaðarþaks sem þú setur, og kaup yfir sjálfvirknimörkunum bíða
                alltaf staðfestingar frá þér í stjórnborðinu.{' '}
                <Link to="/faq" className="font-semibold text-primary underline">
                  Sjá tækniskjölun
                </Link>
              </p>
            </div>
          </div>
        </section>

        {/* ============ REGIONAL NAVIGATION (crawlable SEO links) ============ */}
        <section
          className="border-t border-slate-200"
          style={{ paddingTop: 'clamp(56px,7vw,96px)', paddingBottom: 'clamp(56px,7vw,96px)' }}
        >
          <div className="mx-auto" style={{ maxWidth: 1180, ...SECTION_PAD_X }}>
            <Eyebrow className="mb-[22px] block">Fleiri staðir</Eyebrow>
            <h2
              className="m-0 mb-8 max-w-[18ch] font-extrabold text-slate-900"
              style={{
                fontSize: 'clamp(24px,3vw,34px)',
                letterSpacing: '-0.02em',
                lineHeight: 1.1,
              }}
            >
              Auglýstu hvar sem er á landinu
            </h2>
            <div className="flex flex-wrap gap-2.5">
              {Object.entries(REGIONS).map(([key, value]) => {
                const isActive = region?.toLowerCase() === key;
                return (
                  <Link
                    key={key}
                    to={`/auglysendur/${key}`}
                    className={
                      isActive
                        ? 'rounded-full border border-primary bg-primary/6 px-4.5 py-[9px] text-[14px] font-semibold text-primary'
                        : 'rounded-full border border-slate-200 bg-white px-4.5 py-[9px] text-[14px] font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary'
                    }
                  >
                    Auglýsa {value.dative}
                  </Link>
                );
              })}
              <Link
                to="/auglysendur"
                className="rounded-full border border-slate-200 bg-white px-4.5 py-[9px] text-[14px] font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary"
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
