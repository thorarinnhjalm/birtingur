import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import PublicHeader from '@/components/layout/PublicHeader';
import PublicFooter from '@/components/layout/PublicFooter';
import { updateSEO } from '@/lib/seo';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Eyebrow, BigFigure } from '@/components/ui/editorial';
import { AD_CATEGORIES, FLAT_CPM_ISK } from '@ada/shared';

type TabType = 'home' | 'advertisers' | 'publishers' | 'faq' | 'terms';

// Icelandic dot-grouped integer — same local-fmtNum convention as
// CampaignCreate.tsx/TopUp.tsx/CampaignList.tsx.
function fmtNum(n: number): string {
  return Math.round(n).toLocaleString('is-IS', { maximumFractionDigits: 0 });
}

// Short display labels for the category ticker/pills, derived from the real
// AD_CATEGORIES constant (not hand-typed) so the list and the "Virkir
// efnisflokkar" count can never drift from what the platform actually
// targets. The template's own ticker/pill lists were fabricated — they show
// "Menning" and "Afþreying" as two separate categories (really one merged
// "Afþreying & menning") and omit "Dýr & gæludýr" entirely — so they're
// replaced here rather than copied verbatim.
const CATEGORY_LABELS = AD_CATEGORIES.map((c) => c.label.split(' & ')[0]);

const MINI_FEATURES = [
  { title: 'Fast verð', desc: 'Sama CPM verð alltaf. Engin uppboð og engir faldir kostnaðir.' },
  {
    title: 'Engin binding',
    desc: 'Kveiktu og slökktu á herferðum hvenær sem er, án samninga.',
  },
  {
    title: 'Íslensk þjónusta',
    desc: 'Fólk á Íslandi svarar — á íslensku og með skilningi á markaðnum.',
  },
];

const HOW_IT_WORKS_STEPS = [
  {
    n: '01',
    title: 'Veldu flokka',
    desc: 'Veldu þá efnisflokka sem lesendur þínir dvelja í — matur, ferðalög, tækni og fleira. Við sjáum um að finna réttu miðlana.',
  },
  {
    n: '02',
    title: 'Stilltu herferð',
    desc: 'Ákveddu fjárhæð og tímabil. Fast CPM verð, engin uppboð og engir faldir kostnaðir — þú veist alltaf hvað þú borgar.',
  },
  {
    n: '03',
    title: 'Fylgstu með',
    desc: 'Fylgstu með birtingum og smellum — tölur uppfærast á klukkustundar fresti — og fínstilltu herferðina hvenær sem er, beint úr stjórnborðinu þínu.',
  },
];

export default function LandingPage() {
  const [searchParams] = useSearchParams();
  const [currentTab, setCurrentTab] = useState<TabType>('home');

  const navigate = useNavigate();

  // Handle URL synchronisation with search params (e.g. ?tab=faq)
  useEffect(() => {
    const tabParam = searchParams.get('tab') as TabType;
    if (tabParam === 'advertisers') {
      navigate('/auglysendur', { replace: true });
    } else if (tabParam === 'publishers') {
      navigate('/midlar', { replace: true });
    } else if (tabParam === 'faq') {
      navigate('/faq', { replace: true });
    } else if (tabParam === 'terms') {
      navigate('/skilmalar', { replace: true });
    } else {
      setCurrentTab('home');
    }
  }, [searchParams, navigate]);

  // Dynamic SEO Metadata setup
  useEffect(() => {
    const titleText = 'Birtingur — Einföld birtingaþjónusta og auglýsingar á netinu';
    const descriptionText =
      'Viltu auglýsa á netinu eða selja auglýsingapláss? Birtingur er sjálfvirk og kökulaus birtingaþjónusta fyrir íslenskar vefauglýsingar. Skráðu þig á biðlista.';

    updateSEO(titleText, descriptionText, '');

    return () => {
      document.title = 'Birtingur';
    };
  }, []);

  // changeTab is passed to PublicHeader/PublicFooter (which can request any
  // tab) even though, within this page, only 'home' is ever reachable — every
  // other tab immediately navigates to its own standalone page/route below,
  // unmounting LandingPage before currentTab would change.
  const changeTab = (tab: TabType) => {
    if (tab === 'advertisers') {
      navigate('/auglysendur');
      return;
    }
    if (tab === 'publishers') {
      navigate('/midlar');
      return;
    }
    if (tab === 'faq') {
      navigate('/faq');
      return;
    }
    if (tab === 'terms') {
      navigate('/skilmalar');
      return;
    }
    navigate('/');
    setCurrentTab('home');

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="flex min-h-screen flex-col bg-white font-sans text-slate-900 antialiased selection:bg-primary selection:text-white">
      {/* Informational banner — real business state (advertiser self-signup is
          currently closed, see RoleSelect.tsx REGISTRATION_CLOSED), not part
          of the template. Kept and restyled to the editorial idiom rather
          than dropped, since removing it would hide a true constraint from
          visitors trying to buy. Dispatches the same open-public-support
          event PublicFooter already listens for. */}
      <div className="flex flex-wrap items-center justify-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-center text-xs font-medium text-slate-600 sm:text-sm">
        <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold tracking-wider text-primary uppercase">
          Tilkynning
        </span>
        <span>
          Eins og er erum við eingöngu að skrá ný auglýsingapláss (vefi). Skráning nýrra auglýsenda
          opnar fljótlega –{' '}
          <button
            onClick={() => {
              const event = new window.CustomEvent('open-public-support', {
                detail: {
                  subject: 'Biðlisti: Vil kaupa auglýsingar',
                  body: 'Góðan daginn. Ég hef áhuga á að auglýsa í Birtingi þegar opnað verður fyrir skráningu nýrra auglýsenda. Vinsamlegast látið mig vita.',
                },
              });
              window.dispatchEvent(event);
            }}
            className="inline cursor-pointer border-none bg-transparent p-0 font-bold text-primary underline hover:text-primary-800"
          >
            smelltu hér til að skrá þig á biðlista!
          </button>
        </span>
      </div>

      {/* HEADER */}
      <PublicHeader onTabChange={changeTab} currentTab={currentTab} />

      <main className="grow">
        {/* ============ HERO ============ */}
        <section
          style={{ paddingTop: 'clamp(72px,10vw,132px)', paddingBottom: 'clamp(56px,8vw,96px)' }}
        >
          <div
            className="mx-auto"
            style={{
              maxWidth: 1180,
              paddingLeft: 'clamp(24px,5vw,72px)',
              paddingRight: 'clamp(24px,5vw,72px)',
            }}
          >
            <h1
              className="m-0 max-w-[16ch] font-extrabold text-slate-900"
              style={{
                fontSize: 'clamp(46px,8vw,108px)',
                letterSpacing: '-0.035em',
                lineHeight: 0.96,
                textWrap: 'balance',
              }}
            >
              Auglýstu eftir áhuga, ekki eftir vefjum
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
                  Kauptu auglýsingar eftir efnisflokkum — ekki eftir stökum vefjum. Náðu til lesenda
                  á íslenskum miðlum í kringum matinn, ferðalögin og tæknina sem þeir lesa um hvern
                  dag.
                </p>
                <div className="mt-9 flex flex-wrap gap-3.5">
                  <Button onClick={() => changeTab('advertisers')}>Stofna herferð</Button>
                  <Button variant="secondary" onClick={() => changeTab('publishers')}>
                    Skrá vef
                  </Button>
                </div>
              </div>
              <div className="mb-1.5 border-l-2 border-primary pl-5">
                <BigFigure value={fmtNum(FLAT_CPM_ISK)} suffix="kr. CPM" />
                <div className="mt-2.5 max-w-[15ch] text-sm text-slate-500">
                  Eitt fast verð fyrir hverjar 1.000 birtingar
                </div>
              </div>
            </div>

            <div
              className="grid grid-cols-1 gap-6 border-t border-slate-200 sm:grid-cols-3 sm:gap-8"
              style={{
                marginTop: 'clamp(52px,7vw,92px)',
                paddingTop: 'clamp(36px,4vw,48px)',
              }}
            >
              {MINI_FEATURES.map((f) => (
                <div key={f.title}>
                  <div className="mb-[18px] h-[3px] w-[30px] bg-primary" />
                  <div
                    className="font-bold text-slate-900"
                    style={{
                      fontSize: 'clamp(21px,2.4vw,30px)',
                      letterSpacing: '-0.02em',
                      lineHeight: 1.05,
                    }}
                  >
                    {f.title}
                  </div>
                  <p className="mt-3 max-w-[26ch] text-[15px] leading-[1.55] text-slate-500">
                    {f.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ============ CATEGORY TICKER ============ */}
        <div className="border-y border-slate-200">
          <div
            className="mx-auto flex flex-wrap items-center gap-x-6 gap-y-3.5 py-5"
            style={{
              maxWidth: 1180,
              paddingLeft: 'clamp(24px,5vw,72px)',
              paddingRight: 'clamp(24px,5vw,72px)',
            }}
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
          style={{ paddingTop: 'clamp(80px,11vw,148px)', paddingBottom: 'clamp(80px,11vw,148px)' }}
        >
          <div
            className="mx-auto"
            style={{
              maxWidth: 1180,
              paddingLeft: 'clamp(24px,5vw,72px)',
              paddingRight: 'clamp(24px,5vw,72px)',
            }}
          >
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
              Frá hugmynd að birtingu í þremur skrefum
            </h2>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
              {HOW_IT_WORKS_STEPS.map((s) => (
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

        {/* ============ STATS BAND (navy full-bleed) ============ */}
        <section
          className="bg-primary"
          style={{ paddingTop: 'clamp(72px,10vw,128px)', paddingBottom: 'clamp(72px,10vw,128px)' }}
        >
          <div
            className="mx-auto"
            style={{
              maxWidth: 1180,
              paddingLeft: 'clamp(24px,5vw,72px)',
              paddingRight: 'clamp(24px,5vw,72px)',
            }}
          >
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
                  Útgreiðslur til útgefenda
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
          <div
            className="mx-auto"
            style={{
              maxWidth: 1180,
              paddingLeft: 'clamp(24px,5vw,72px)',
              paddingRight: 'clamp(24px,5vw,72px)',
            }}
          >
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
              <div className="border-t-2 border-primary pt-[26px]">
                <h3 className="m-0 mb-3 text-xl font-bold tracking-[-0.01em] text-slate-900">
                  Eitt fast verð — {fmtNum(FLAT_CPM_ISK)} kr. CPM
                </h3>
                <p className="m-0 text-[15px] leading-[1.65] text-slate-600">
                  {fmtNum(FLAT_CPM_ISK)} kr. fyrir hverjar 1.000 birtingar. Engin uppboð, ekkert
                  flækjustig.
                </p>
              </div>
              <div className="border-t-2 border-primary pt-[26px]">
                <h3 className="m-0 mb-3 text-xl font-bold tracking-[-0.01em] text-slate-900">
                  Flokkakaup í stað stakra plássa
                </h3>
                <p className="m-0 text-[15px] leading-[1.65] text-slate-600">
                  Veldu efnisflokk og fjárhæð — við dreifum birtingunum á alla íslenska vefi í
                  flokknum.
                </p>
              </div>
              <div className="border-t-2 border-primary pt-[26px]">
                <h3 className="m-0 mb-3 text-xl font-bold tracking-[-0.01em] text-slate-900">
                  Sjáðu áætlunina áður en þú borgar
                </h3>
                <p className="m-0 text-[15px] leading-[1.65] text-slate-600">
                  Rauntíma birtingaspá fyrir hvern flokk áður en herferðin fer í loftið.
                </p>
              </div>
              <div className="border-t-2 border-primary pt-[26px]">
                <h3 className="m-0 mb-3 text-xl font-bold tracking-[-0.01em] text-slate-900">
                  Þú ferð aldrei yfir fjárhagsáætlun
                </h3>
                <p className="m-0 text-[15px] leading-[1.65] text-slate-600">
                  Herferðin stöðvast sjálfkrafa þegar fjárhæðinni er náð.
                </p>
              </div>
              <div className="border-t-2 border-primary pt-[26px]">
                <h3 className="m-0 mb-3 text-xl font-bold tracking-[-0.01em] text-slate-900">
                  Aðeins raunverulegar birtingar teljast
                </h3>
                <p className="m-0 text-[15px] leading-[1.65] text-slate-600">
                  Birting telst aðeins þegar auglýsingin sést — í samræmi við IAB-viðmið.
                </p>
              </div>
              <div className="border-t-2 border-primary pt-[26px]">
                <h3 className="m-0 mb-3 text-xl font-bold tracking-[-0.01em] text-slate-900">
                  Engar vafrakökur frá þriðja aðila
                </h3>
                <p className="m-0 text-[15px] leading-[1.65] text-slate-600">
                  Persónuvernd innbyggð: engin þriðju aðila rakning og tíðnistýring aðeins með
                  samþykki notanda.
                </p>
              </div>
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
              <span>Íslenskt fyrirtæki með íslenskri þjónustu</span>
            </div>
            <div className="mt-10 flex flex-wrap items-center gap-3.5">
              <Button onClick={() => changeTab('advertisers')}>Stofna herferð</Button>
              <Button variant="secondary" onClick={() => changeTab('publishers')}>
                Skrá vef
              </Button>
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <PublicFooter onTabChange={changeTab} />
    </div>
  );
}
