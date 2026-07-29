import { useState, useEffect, useMemo } from 'react';
import { Search, X, Plus } from 'lucide-react';
import PublicHeader from '@/components/layout/PublicHeader';
import PublicFooter from '@/components/layout/PublicFooter';
import { updateSEO } from '@/lib/seo';
import { Button } from '@/components/ui/Button';
import { Eyebrow, EditorialH1, PillButton } from '@/components/ui/editorial';
import {
  FLAT_CPM_ISK,
  DEFAULT_PLATFORM_FEE_PERCENT,
  MIN_PAYOUT_ISK,
  VAT_RATE,
  IAB_STANDARD_SIZES,
} from '@ada/shared';

// Icelandic dot-grouped integer — same local-fmtNum convention as
// LandingPage.tsx/AdvertiserLanding.tsx/PublisherLanding.tsx.
function fmtNum(n: number): string {
  return Math.round(n).toLocaleString('is-IS', { maximumFractionDigits: 0 });
}

const PUBLISHER_SHARE_PERCENT = 100 - DEFAULT_PLATFORM_FEE_PERCENT;
// The publisher's ISK cut of each 1.000-impression CPM block — derived, not
// hand-typed, so it can never drift from FLAT_CPM_ISK/DEFAULT_PLATFORM_FEE_PERCENT.
const PUBLISHER_CPM_SHARE_ISK = Math.round((FLAT_CPM_ISK * PUBLISHER_SHARE_PERCENT) / 100);
const VAT_PERCENT = Math.round(VAT_RATE * 100);

// Daily AI-creative generation caps — mirrored from apps/api/src/lib/rate-limit.ts's
// BUCKET_LIMITS (not exported from @ada/shared, so kept in sync here by hand):
// gen-copy is cheap (text only) and allows 20/day, gen-render is the expensive
// step (image gen + rasterization + Storage uploads) and is capped at 10/day.
const COPY_GENERATIONS_PER_DAY = 20;
const RENDER_GENERATIONS_PER_DAY = 10;

// IAB banner sizes advertised in the FAQ — read straight from the shared
// constant so this list can't drift from what SlotCreate.tsx/CreativeGenerator.tsx
// actually offer.
const IAB_SIZE_LIST = IAB_STANDARD_SIZES.map((s) => `${s.width}×${s.height}`).join(', ');

const SECTION_PAD_X = {
  paddingLeft: 'clamp(24px,5vw,72px)',
  paddingRight: 'clamp(24px,5vw,72px)',
} as const;

type Pillar = 'all' | 'advertiser' | 'publisher' | 'technical';

const PILLARS: { key: Pillar; label: string }[] = [
  { key: 'all', label: 'Allt' },
  { key: 'advertiser', label: 'Auglýsingar & herferðir' },
  { key: 'publisher', label: 'Vefstýring & tekjur' },
  { key: 'technical', label: 'Tækni & persónuvernd' },
];

export default function FaqPage() {
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPillar, setSelectedPillar] = useState<Pillar>('all');

  const toggleFaq = (index: number) => {
    setOpenFaqIndex(openFaqIndex === index ? null : index);
  };

  // Structured FAQ database organized around core content pillars. Every
  // answer is audited against the platform's real feature set/pricing —
  // see the inline notes below each corrected item.
  const faqItems = useMemo(
    () => [
      // Pillar 1: Auglýsingar & herferðir
      {
        q: 'Hver er munurinn á Birtingi og hefðbundnu birtingahúsi (birtingaþjónustu)?',
        a: `Hefðbundið birtingahús (fjölmiðlaumboð) starfar sem milliliður sem stýrir auglýsingakaupum handvirkt, tekur háa þóknun og krefst oft mikilla lágmarksfjárhæða. Birtingur er hins vegar sjálfsafgreiðslukerfi á netinu: þú velur sjálf/ur flokka og landshluta og greiðir fast, gagnsætt verð — ${fmtNum(FLAT_CPM_ISK)} kr. fyrir hverjar 1.000 birtingar (CPM) — án allra milliliða eða flókinna samninga.`,
        pillar: 'advertiser',
        tags: ['birtingahús', 'birtingaþjónusta', 'samanburður', 'milliliðir'],
      },
      {
        q: 'Hvernig kaupi ég auglýsingar á netinu hjá Birtingi?',
        a: '<p>Skráning nýrra auglýsenda er lokuð sem stendur og opnar fljótlega — þú getur skráð þig á biðlista á síðunni fyrir auglýsendur. Þegar aðgangur opnast er ferlið einfalt:</p><ol class="list-decimal pl-5 mt-2 space-y-1"><li>Stofnaðu aðgang sem auglýsandi.</li><li>Veldu markflokka (t.d. matur, ferðalög eða tækni), landsvæði og fjárhæð — kerfið sýnir þér birtingaspá áður en þú borgar.</li><li>Búðu til auglýsingaborða út frá vefsíðunni þinni með innbyggðri borðagerð — eða hladdu upp þínum eigin (PNG, JPEG eða WebP).</li><li>Leggðu inn inneign í veskið þitt og virkjaðu herferðina.</li></ol>',
        pillar: 'advertiser',
        tags: ['auglýsingar', 'herferð', 'skref', 'biðlisti'],
      },
      {
        q: 'Ég á enga auglýsingaborða — getur Birtingur búið þá til?',
        a: `Já. Í kaupferlinu límir þú inn slóðina á vefsíðuna þína og kerfið les hana, skrifar allt að þrjár tillögur að auglýsingatexta á íslensku og útbýr borða í öllum þeim stærðum sem auglýsingaplássin í flokkunum þínum nota. Þú velur tillöguna sem þér líst best á, getur breytt fyrirsögn, undirtexta og hnappatexta að vild og staðfestir áður en nokkuð fer í loftið. Borðagerðin er innifalin í þjónustunni en dagleg hámörk gilda: ${COPY_GENERATIONS_PER_DAY} textatillögur og ${RENDER_GENERATIONS_PER_DAY} útlitsgerðir á dag.`,
        pillar: 'advertiser',
        tags: ['borðagerð', 'gervigreind', 'auglýsingaborðar', 'sjálfvirkni'],
      },
      {
        q: 'Fer gervigreindarefni í sömu yfirferð og annað auglýsingaefni?',
        a: 'Já, undantekningarlaust. Borðar sem gervigreindin býr til fara í nákvæmlega sömu efnisskimun og samþykktarferli og borðar sem þú hleður upp sjálf/ur. Þar sem þú getur breytt textanum berð þú ábyrgð á endanlega efninu og staðfestir það sérstaklega áður en borðarnir eru vistaðir.',
        pillar: 'advertiser',
        tags: ['gervigreind', 'yfirferð', 'öryggi', 'efnisskimun'],
      },
      {
        q: 'Hvað er fast CPM og hvernig virkar greiðsluflæðið (VSK)?',
        a: `Við leggjum áherslu á gagnsæi. Hverjar 1.000 birtingar á netinu kosta fastan ${fmtNum(FLAT_CPM_ISK)} kr. CPM (Cost Per Mille). Innborgun í veskið þitt fer fram með kreditkorti í gegnum Teya og telst innlögn á veltureikning sem er VSK-frjáls samkvæmt lögum um umboðssölu. Virðisaukaskattur (${VAT_PERCENT}%) er svo reiknaður eingöngu af ${DEFAULT_PLATFORM_FEE_PERCENT}% þjónustuþóknun Birtings og gefinn út sem rafrænn sölureikningur jafnóðum og herferðin er sýnd á samstarfsnetinu.`,
        pillar: 'advertiser',
        tags: ['greiðslur', 'cpm', 'vsk', 'reikningur'],
      },
      {
        q: 'Hvernig beini ég auglýsingum mínum að ákveðnum landshlutum?',
        a: 'Birtingur styður svæðismörkun innan Íslands. Út frá staðsetningu lesenda getur þú beint auglýsingum þínum á netinu sérstaklega að Höfuðborgarsvæðinu, Landsbyggðinni eða ákveðnum bæjarfélögum (t.d. Akureyri, Reykjanesbæ eða Selfossi) — á sama fasta CPM verðinu, óháð svæði.',
        pillar: 'advertiser',
        tags: ['mörkun', 'staðsetning', 'landsbyggðin', 'bæir'],
      },
      {
        q: 'Hvað gerist ef skapandi efni (creative) er hafnað í yfirferð?',
        a: 'Ef sjálfvirk efnisskimun eða handvirk yfirferð okkar hafnar auglýsingu (t.d. vegna rangrar stærðar, óviðeigandi efnis eða bilaðrar slóðar) er herferðin stöðvuð. Ónotaðar eftirstöðvar herferðarinnar eru endurgreiddar inn í inneignarveskið þitt, þar sem þú getur breytt efninu eða nýtt inneignina í aðra herferð.',
        pillar: 'advertiser',
        tags: ['höfnun', 'yfirferð', 'öryggi', 'veski'],
      },
      // Pillar 2: Vefstýring & tekjur
      {
        q: 'Hvernig breyti ég vefumferðinni minni í mánaðarlegar tekjur?',
        a: `Sem útgefandi á Birtingi getur þú breytt lausu plássi á vefnum þínum í tekjur. Þú skráir lénið þitt, skilgreinir efnisflokka (t.d. matur eða tækni) og býrð til auglýsingapláss (slot). Kerfið gefur þér eina línu af HTML-kóða sem þú límir á vefinn þinn. Þú heldur ${PUBLISHER_SHARE_PERCENT}% af auglýsingatekjunum — ${fmtNum(PUBLISHER_CPM_SHARE_ISK)} kr. nettó fyrir hverjar 1.000 birtingar.`,
        pillar: 'publisher',
        tags: ['tekjur', 'útgefendur', 'vefsíður', 'auglýsingapláss'],
      },
      {
        q: 'Hefur auglýsingaskriftan áhrif á hleðslutíma eða SEO vefsins?',
        a: 'Skriftan okkar er hönnuð með lágmarkshleðslu í huga: hún er lítil að stærð, keyrir asynchronously (samhliða öðru efni á síðunni) og er hýst á CDN-kerfi. Hún er hönnuð til að lágmarka áhrif á hleðsluhraða, sýnilegt efni og Core Web Vitals mælingar vefsins þíns.',
        pillar: 'publisher',
        tags: ['hraði', 'seo', 'tæknilegt', 'widget'],
      },
      {
        q: 'Hvenær eru útborganir framkvæmdar og hvert er lágmarkið?',
        a: `Útborganir til útgefenda eru gerðar upp mánaðarlega. Í byrjun hvers mánaðar er staða reikningsins þíns gerð upp og, nái hún lágmarkinu, er greiðslan afgreidd með millifærslu í bankann þinn. Lágmarksútborgun er ${fmtNum(MIN_PAYOUT_ISK)} kr. — nái heildartekjur mánaðarins ekki því lágmarki flyst upphæðin óskert yfir á næsta mánuð og greiðist út um leið og lágmarkinu er náð.`,
        pillar: 'publisher',
        tags: ['útborganir', 'greiðslur', 'banki', 'lágmark'],
      },
      {
        q: 'Hvernig fæ ég stjórn á því hvaða auglýsingar birtast á mínum vef?',
        a: 'Þú stýrir því hvaða auglýsingar birtast á vefnum þínum: þú getur skilgreint hvaða efnisflokka þú leyfir á vefsíðunni þinni. Jafnframt hefurðu aðgang að samþykkisbiðröð (Approval Queue) í stjórnborðinu þínu þar sem þú getur skoðað og samþykkt eða hafnað hverri auglýsingu áður en hún fer í loftið hjá þér.',
        pillar: 'publisher',
        tags: ['stýring', 'öryggi', 'samþykki', 'flokkar'],
      },
      // Pillar 3: Tækni & persónuvernd
      {
        q: 'Af hverju eru kökulausar auglýsingar á netinu framtíðin?',
        a: 'Persónuverndarvænar, kökulausar auglýsingar útiloka þörfina á vafrakökum frá þriðja aðila (third-party cookies) sem elta notendur á milli vefja. Þetta eykur traust lesenda og losar vefsíðueigendur við pirrandi samþykkisglugga. Birtingur miðar auglýsingum út frá samhengi efnisins (contextual targeting) þannig að auglýsingin tengist því sem lesandinn er á þeirri stundu að lesa.',
        pillar: 'technical',
        tags: ['cookies', 'gdpr', 'persónuvernd', 'kökulaust'],
      },
      {
        q: 'Hvernig er auglýsingaefni yfirfarið áður en það birtist?',
        a: 'Þegar auglýsandi hleður upp efni eða tengir lendingarsíðu keyrir Birtingur sjálfvirka efnisskimun sem greinir bæði myndrænt og textalegt efni og flaggar hugsanlegu vandamáli (t.d. NSFW-efni eða röngum flokki) fyrir handvirka yfirferð starfsfólks okkar. Endanleg ákvörðun um samþykki er alltaf tekin af starfsfólki, ekki sjálfvirku kerfi eingöngu.',
        pillar: 'technical',
        tags: ['efnisskimun', 'öryggi', 'yfirferð', 'brand safety'],
      },
      {
        q: 'Hvernig verndar Birtingur auglýsendur gegn smellasvikum (click fraud)?',
        a: 'Við verjum fjárhagsáætlun þína með vörnum á netþjónastigi. Allir smellir og birtingar eru HMAC-undirritaðir og staðfestir í rauntíma. Kerfið síar út tvítekna atburði og óeðlilega smellitíðni úr sömu IP-tölu. Grunaðir sviksamlegir atburðir eru hreinsaðir áður en þeir birtast í mælaborðinu þínu og eru ekki gjaldfærðir.',
        pillar: 'technical',
        tags: ['clickfraud', 'öryggi', 'svik', 'smellir'],
      },
      {
        q: 'Í hvaða stærðum birtast auglýsingar?',
        a: `Birtingur notar staðlaðar IAB-stærðir (${IAB_SIZE_LIST}). Þegar þú setur upp herferð sýnir kerfið þér nákvæmlega hvaða stærðir auglýsingaplássin í flokkunum þínum nota og hversu stór hluti áætlaðra birtinga fellur á hverja stærð — og borðagerðin býr sjálfkrafa til allar þær stærðir sem þarf.`,
        pillar: 'technical',
        tags: ['stærðir', 'iab', 'auglýsingaborðar', 'tækni'],
      },
      {
        q: 'Getur gervigreindin mín keypt auglýsingar sjálf?',
        a: 'Já — Birtingur rekur MCP-þjón (Model Context Protocol) sem gerir gervigreindarumboðsmönnum kleift að kanna flokka og birtingaspá, skoða stöðu veskisins og kaupa herferðir með borðum sem þegar hafa verið samþykktir. Öryggið er innbyggt: kaupheimild er valkvæð stilling á hverjum API-lykli, þú setur mánaðarlegt hámark og kaup yfir sjálfvirknimörkunum sem þú setur bíða samþykkis þar til þú staðfestir þau í stjórnborðinu. Gervigreindin getur aldrei lagt inn peninga, hækkað fjárhæðir eða samþykkt eigin kaup — það getur aðeins þú.',
        pillar: 'technical',
        tags: ['mcp', 'gervigreind', 'kaup', 'agents'],
      },
      {
        q: 'Eruð þið með API eða MCP-tengingar fyrir gervigreind (AI Agents)?',
        a: 'Já. Auglýsendur og forritarar geta stofnað örugga API-lykla (ak_…) til að stýra herferðum og sækja gögn beint um REST-vendlann. Að auki rekum við MCP-þjón (Model Context Protocol) sem gerir gervigreindarumboðsmönnum (t.d. Claude) kleift að vinna með kerfið: útgefendur geta stofnað og stýrt auglýsingaplássum, sótt innsetningarkóða, sett efnisstefnu og fylgst með tölfræði, og auglýsendur geta kannað flokka og birtingaspá, skoðað stöðu veskisins og keypt herferðir. Kaupheimildin er valkvæð á hverjum lykli, með mánaðarþaki og samþykki þínu í stjórnborðinu yfir þeim mörkum sem þú setur.',
        pillar: 'technical',
        tags: ['api', 'mcp', 'gervigreind', 'agents'],
      },
    ],
    [],
  );

  // Dynamic SEO Metadata setup
  useEffect(() => {
    const titleText = 'Algengar spurningar um vefauglýsingar og birtingaþjónustu | Birtingur';
    const descriptionText =
      'Svör við helstu spurningum um hvernig á að auglýsa á netinu á íslenskum vefsíðum eða græða á eigin vefsíðu með birtingakerfi Birtings.';

    updateSEO(titleText, descriptionText, '/faq');

    // FAQ JSON-LD Schema — kept in sync with the visible copy above since it
    // reads directly from faqItems.
    const schema = {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqItems.map((item) => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: {
          '@type': 'Answer',
          text: item.a.replace(/<[^>]*>/g, ''), // strip HTML tags for plain text
        },
      })),
    };

    let script = document.querySelector('script[type="application/ld+json"]#faq-schema');
    if (!script) {
      script = document.createElement('script');
      script.setAttribute('type', 'application/ld+json');
      script.setAttribute('id', 'faq-schema');
      document.head.appendChild(script);
    }
    script.textContent = JSON.stringify(schema);

    return () => {
      document.title = 'Birtingur';
      const scriptToRemove = document.querySelector('#faq-schema');
      if (scriptToRemove) {
        scriptToRemove.remove();
      }
    };
  }, [faqItems]);

  // Filtered FAQ items based on search and selected pillar
  const filteredFaqs = useMemo(() => {
    return faqItems.filter((item) => {
      if (selectedPillar !== 'all' && item.pillar !== selectedPillar) {
        return false;
      }
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesQ = item.q.toLowerCase().includes(query);
        const matchesA = item.a.toLowerCase().includes(query);
        const matchesTags = item.tags.some((tag) => tag.toLowerCase().includes(query));
        return matchesQ || matchesA || matchesTags;
      }
      return true;
    });
  }, [faqItems, searchQuery, selectedPillar]);

  return (
    <div className="flex min-h-screen flex-col bg-white font-sans text-slate-900 antialiased selection:bg-primary selection:text-white">
      {/* HEADER */}
      <PublicHeader currentTab="faq" />

      <main className="grow">
        {/* ============ HERO ============ */}
        <section
          style={{ paddingTop: 'clamp(64px,9vw,112px)', paddingBottom: 'clamp(40px,6vw,64px)' }}
        >
          <div className="mx-auto" style={{ maxWidth: 1180, ...SECTION_PAD_X }}>
            <Eyebrow className="mb-[18px] block">Hjálp & svör</Eyebrow>
            <EditorialH1>Algengar spurningar</EditorialH1>
            <p className="mt-5 max-w-[62ch] text-[17px] leading-[1.6] text-slate-600">
              Leitaðu í spurningunum hér að neðan eða veldu efnisflokk til að finna svör um kaup á
              auglýsingum, tekjur af vefnum þínum og hvernig kerfið virkar að tjaldabaki.
            </p>

            {/* Search input */}
            <div className="relative mt-8 max-w-xl">
              <Search
                size={17}
                className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                placeholder="Leita að spurningum (t.d. VSK, kökur, CPM)…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white py-3.5 pr-16 pl-11 text-sm font-medium text-slate-900 shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-colors placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  aria-label="Hreinsa leit"
                  className="absolute top-1/2 right-3.5 -translate-y-1/2 cursor-pointer rounded-md border-none bg-transparent p-1 text-slate-400 transition-colors hover:text-slate-700"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Pillar jump-pills */}
            <div className="mt-7 flex flex-wrap gap-2.5">
              {PILLARS.map((p) => (
                <PillButton
                  key={p.key}
                  active={selectedPillar === p.key}
                  onClick={() => setSelectedPillar(p.key)}
                >
                  {p.label}
                </PillButton>
              ))}
            </div>
          </div>
        </section>

        {/* ============ FAQ LIST ============ */}
        <section style={{ paddingBottom: 'clamp(72px,10vw,128px)' }}>
          <div className="mx-auto" style={{ maxWidth: 1180, ...SECTION_PAD_X }}>
            <div className="mx-auto max-w-[760px]">
              {filteredFaqs.length === 0 ? (
                <div className="rounded-card border border-slate-200 bg-slate-50 p-10 text-center">
                  <h3 className="m-0 text-base font-bold text-slate-900">
                    Engar niðurstöður fundust
                  </h3>
                  <p className="mt-2 text-sm text-slate-500">
                    Prófaðu önnur leitarorð eða veldu annan flokk.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-200 rounded-card border border-slate-200 bg-white">
                  {filteredFaqs.map((faq) => {
                    const originalIndex = faqItems.findIndex((item) => item.q === faq.q);
                    const isOpen = openFaqIndex === originalIndex;

                    return (
                      <div key={originalIndex}>
                        <button
                          onClick={() => toggleFaq(originalIndex)}
                          className="flex w-full cursor-pointer items-center justify-between gap-6 border-none bg-transparent px-6 py-6 text-left transition-colors hover:bg-slate-50 sm:px-8"
                        >
                          <span className="text-[15px] font-bold text-slate-900 sm:text-base">
                            {faq.q}
                          </span>
                          <Plus
                            size={18}
                            className={`shrink-0 text-primary transition-transform duration-200 ${isOpen ? 'rotate-45' : ''}`}
                          />
                        </button>
                        {isOpen && (
                          <div
                            className="faq-answer px-6 pb-7 text-[15px] leading-[1.65] text-slate-600 sm:px-8"
                            dangerouslySetInnerHTML={{ __html: faq.a }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ============ CONTACT CTA (navy full-bleed) ============ */}
        <section
          className="bg-primary"
          style={{ paddingTop: 'clamp(56px,8vw,96px)', paddingBottom: 'clamp(56px,8vw,96px)' }}
        >
          <div
            className="mx-auto flex flex-col items-start justify-between gap-8 sm:flex-row sm:items-center"
            style={{ maxWidth: 1180, ...SECTION_PAD_X }}
          >
            <div>
              <span className="mb-3 inline-block text-[13px] font-semibold tracking-[0.16em] text-white/60 uppercase">
                Fannstu ekki svarið?
              </span>
              <h2
                className="m-0 max-w-[28ch] font-extrabold text-white"
                style={{
                  fontSize: 'clamp(24px,3vw,34px)',
                  letterSpacing: '-0.02em',
                  lineHeight: 1.15,
                }}
              >
                Við aðstoðum þig við uppsetningu og skipulagningu herferða
              </h2>
            </div>
            <Button
              variant="secondary"
              className="shrink-0"
              onClick={() => window.dispatchEvent(new window.CustomEvent('open-public-support'))}
            >
              Hafa samband
            </Button>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <PublicFooter />
    </div>
  );
}
