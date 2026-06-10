import { useState, useEffect, useMemo } from 'react';
import PublicHeader from '@/components/layout/PublicHeader';
import PublicFooter from '@/components/layout/PublicFooter';

export default function FaqPage() {
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPillar, setSelectedPillar] = useState<
    'all' | 'advertiser' | 'publisher' | 'technical'
  >('all');

  // Dynamic SEO Metadata setup
  useEffect(() => {
    const titleText = 'Algengar spurningar | Birtingur — Auglýsingar á netinu';
    const descriptionText =
      'Fáðu svör við algengum spurningum um birtingar, auglýsingar á netinu, greiðslur og hvernig þú getur grætt á vefnum þínum með Birtingi.';

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
  }, []);

  const toggleFaq = (index: number) => {
    setOpenFaqIndex(openFaqIndex === index ? null : index);
  };

  // Structured FAQ database organized around core Content Pillars
  const faqItems = useMemo(
    () => [
      // Pillar 1: Auglýsendur & Herferðir
      {
        q: 'Hvernig stofna ég herferð og birti auglýsingar á netinu?',
        a: 'Að auglýsa á netinu með Birtingi er einstaklega einfalt. Þú stofnar herferð á 3 mínútum: <ol class="list-decimal pl-5 mt-2 space-y-1"><li>Stofnaðu aðgang og skráðu þig som auglýsanda.</li><li>Hladdu upp auglýsingaborða (PNG, JPEG eða WebP) og settu inn lendingarsíðu.</li><li>Veldu markflokka (t.d. matur, lífsstíll) og landsvæði.</li><li>Leggðu inn inneign í veskið þitt og virkjaðu herferðina.</li></ol>',
        pillar: 'advertiser',
        tags: ['auglýsingar', 'herferð', 'skref', 'stofna'],
      },
      {
        q: 'Hvað er flat CPM og hvernig virkar greiðsluflæðið (VSK-reikningar)?',
        a: 'Við trúum á fullkomið gagnsæi. Hverjar 1.000 birtingar á netinu kosta fastan 550 kr. CPM (Cost Per Mille). Innborgun í veskið þitt fer fram með kreditkorti í gegnum örugga gátt Teya og er hún VSK-frí (reiknast sem veltufjárinnlögn). Rafrænn sölureikningur með 24% VSK er gefinn út fyrir 20% umsýsluþóknun Birtings jafnóðum og herferðin er sýnd á samstarfsnetinu.',
        pillar: 'advertiser',
        tags: ['greiðslur', 'cpm', 'vsk', 'reikningur'],
      },
      {
        q: 'Hvernig beini ég auglýsingum mínum að ákveðnum landshlutum?',
        a: 'Birtingur býður upp á nákvæma og kökulausa landfræðilega mörkun. Með því að nýta Vercel Edge tækni greinum við almenna staðsetningu notenda út frá IP-tölum á augabragði. Þú getur valið að beina þínum <strong>auglýsingum á netinu</strong> sérstaklega að lesendum á Höfuðborgarsvæðinu, á Landsbyggðinni eða í ákveðnum bæjarfélögum (t.d. Akureyri, Reykjanesbæ eða Selfossi).',
        pillar: 'advertiser',
        tags: ['mörkun', 'staðsetning', 'landsbyggðin', 'bæir'],
      },
      {
        q: 'Hvað gerist ef skapandi efni (creative) er hafnað í yfirferð?',
        a: 'Ef sjálfvirka Gemini AI gæðaeftirlitið eða handvirk yfirferð okkar hafnar auglýsingu (t.d. vegna rangrar stærðar, óviðeigandi efnis eða bilaðrar slóðar) verður herferðin stöðvuð. Allar ónotaðar eftirstöðvar og innistæður herferðarinnar eru samstundis endurgreiddar inn í inneignarveskið þitt þar sem þú getur breytt efninu eða nýtt það í aðra herferð.',
        pillar: 'advertiser',
        tags: ['höfnun', 'yfirferð', 'öryggi', 'veski'],
      },
      // Pillar 2: Vefstýring & Tekjur
      {
        q: 'Hvernig breyti ég vefumferðinni minni í mánaðarlegar tekjur?',
        a: 'Sem útgefandi á Birtingi geturðu breytt lausu plássi á vefnum þínum í tekjur. Þú skráir lénið þitt, skilgreinir flokka (t.d. tækni, matvæli) og býrð til auglýsingapláss (Slots). Kerfið gefur þér einn HTML-kóðabút sem þú límir á vefinn þinn. Við sjáum um að sýna viðeigandi auglýsingar og þú færð 80% af öllum auglýsingatekjum (440 kr. nettó per 1.000 birtingar).',
        pillar: 'publisher',
        tags: ['tekjur', 'útgefendur', 'vefsíður', 'auglýsingapláss'],
      },
      {
        q: 'Hefur auglýsingskriftan (widget.js) áhrif á hleðslutíma eða SEO vefsins?',
        a: 'Alls ekki. Skriftan okkar er hönnuð frá grunni með lágmarkshleðslu í huga. Hún er undir 1.5 KB að stærð, keyrir asynchronously (hlið við hlið við annað efni) og er hýst á ofurhröðu CDN-kerfi. Vefurinn þinn hleðst eldsnöggt án þess að tefja fyrir innihaldi eða valda neikvæðum áhrifum á Google SEO eða Core Web Vitals.',
        pillar: 'publisher',
        tags: ['hraði', 'seo', 'tæknilegt', 'widget'],
      },
      {
        q: 'Hvenær eru útborganir framkvæmdar og hvert er lágmarkið?',
        a: 'Útborganir til útgefenda eru millifærðar sjálfkrafa á bankareikning þinn 1. virka dag hvers mánaðar. Lágmarksútborgun er 5.000 kr. Ef heildartekjur mánaðarins ná ekki 5.000 kr. flyst upphæðin óskert yfir á næsta mánuð og greiðist út um leið og lágmarkinu er náð.',
        pillar: 'publisher',
        tags: ['útborganir', 'greiðslur', 'banki', 'lágmark'],
      },
      {
        q: 'Hvernig fæ ég stjórn á því hvaða auglýsingar birtast á mínum vef?',
        a: 'Við bjóðum upp á fullkomið vörumerkjaöryggi (Brand Safety). Þú getur skilgreint hvaða efnisflokka þú leyfir á vefsíðunni þinni. Jafnframt hefurðu aðgang að samþykkisbiðröð (Approval Queue) í stjórnborðinu þínu þar sem þú getur skoðað og samþykkt/hafnað hverri einustu auglýsingu áður en hún fer í loftið hjá þér.',
        pillar: 'publisher',
        tags: ['stýring', 'öryggi', 'samþykki', 'flokkar'],
      },
      // Pillar 3: Kökulaus tækni & Öryggi
      {
        q: 'Af hverju eru kökulausar auglýsingar á netinu framtíðin?',
        a: 'Persónuverndarvænar, kökulausar auglýsingar útiloka þörfina á þriðju aðila vafrakökum (third-party cookies) sem elta notendur á milli vefja. Þetta eykur traust lesenda, losar vefsíðueigendur við pirrandi samþykkisglugga og tryggir 100% samræmi við GDPR-lög. Birtingur miðar auglýsingum út frá samhengi efnisins (Contextual targeting) sem skilar oft meiri árangri þar sem auglýsingin tengist beint því sem notandinn er á þeirri stundu að lesa.',
        pillar: 'technical',
        tags: ['cookies', 'gdpr', 'persónuvernd', 'kökulaust'],
      },
      {
        q: 'Hvernig virkar sjálfvirka Gemini AI gæðaeftirlitið?',
        a: 'Þegar auglýsandi hleður upp efni eða tengir lendingarsíðu, greinir Gemini AI líkanið okkar bæði myndrænt og textalegt efni. Kerfið greinir sjálfkrafa NSFW-efni (ofbeldi, nekt), skilgreinir flokka vefsins og flaggar hugsanlegum vandamálum fyrir handvirka yfirferð okkar. Þetta tryggir eldsnögga og áreiðanlega gæðavottun.',
        pillar: 'technical',
        tags: ['gemini', 'gervigreind', 'öryggi', 'skönnun'],
      },
      {
        q: 'Hvernig verndar Birtingur auglýsendur gegn smellasvikum (Click Fraud)?',
        a: 'Við verjum fjárhagsáætlun þína með öflugu varnarkerfi á netþjónastigi. Allir smellir og birtingar eru HMAC-undirritaðir og staðfestir í rauntíma. Kerfið síar sjálfkrafa út bot-umferð, tvísmelli og óeðlilega smellitíðni úr sömu IP-tölu. Sviksamlegir smellir eru hreinsaðir áður en þeir birtast í mælaborðinu þínu og eru aldrei gjaldfærðir.',
        pillar: 'technical',
        tags: ['clickfraud', 'öryggi', 'svik', 'smellir'],
      },
      {
        q: 'Eruð þið með sjálfvirkar tengingar (API / MCP) fyrir gervigreind (AI Agents)?',
        a: 'Já, Birtingur er hannaður sem „API-first“ vettvangur. Hönnuðir geta stofnað örugga API-lykla (ak_...) til að stýra herferðum og sækja gögn. Þar að auki bjóðum við upp á innbyggðan MCP (Model Context Protocol) þjón sem gerir gervigreindarkeyrðum umboðsmönnum (AI Agents, eins og Claude og Gemini) kleift að eiga samskipti beint við kerfið og stýra herferðum útgefenda sjálfvirkt.',
        pillar: 'technical',
        tags: ['api', 'mcp', 'gervigreind', 'agents'],
      },
    ],
    [],
  );

  // Filtered FAQ Items based on search and selected pillar
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
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans antialiased overflow-x-hidden selection:bg-blue-600 selection:text-white">
      {/* Background Ambient Gradients */}
      <div className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full bg-blue-500/5 blur-[120px] pointer-events-none -z-10" />
      <div className="absolute top-1/3 right-10 w-[500px] h-[500px] rounded-full bg-violet-500/5 blur-[100px] pointer-events-none -z-10" />

      {/* HEADER */}
      <PublicHeader currentTab="faq" />

      {/* MAIN */}
      <main className="grow">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 space-y-12 animate-fade-in">
          {/* Header section with Search bar */}
          <div className="space-y-6 text-center max-w-3xl mx-auto">
            <h1 className="text-3xl sm:text-5xl font-black text-slate-900 tracking-tight leading-tight">
              Algengar spurningar
            </h1>
            <p className="text-base sm:text-lg text-slate-500 font-semibold leading-relaxed">
              Leitaðu í gagnagrunni okkar eða skoðaðu flokka hér að neðan til að finna svör við
              tæknilegum og viðskiptalegum spurningum um auglýsingar á netinu og birtingar.
            </p>

            {/* Interactive Search Input */}
            <div className="relative max-w-xl mx-auto mt-4">
              <input
                type="text"
                placeholder="Leita að spurningum, leitarorðum (t.d. VSK, cookies)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-4 rounded-2xl bg-white border border-slate-200 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 font-bold text-slate-800 shadow-sm transition placeholder:text-slate-400 text-sm focus:outline-hidden"
              />
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 select-none">
                search
              </span>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-650 font-bold transition text-xs cursor-pointer"
                >
                  Hreinsa
                </button>
              )}
            </div>
          </div>

          {/* Efnisstoðir - The Three Content Pillars Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {/* Category Pill 0: Allt */}
            <button
              onClick={() => setSelectedPillar('all')}
              className={`p-5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between space-y-3 ${
                selectedPillar === 'all'
                  ? 'border-blue-600 bg-blue-50/20 text-blue-700 shadow-xs font-bold'
                  : 'border-slate-200 bg-white hover:border-slate-300 text-slate-600 hover:text-slate-900 hover:shadow-xs'
              }`}
            >
              <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 shrink-0">
                <span className="material-symbols-outlined font-bold text-lg">apps</span>
              </div>
              <div>
                <h3 className="font-extrabold text-sm mb-0.5 text-slate-900">Sýna allt</h3>
                <span className="text-[10px] text-slate-400 font-semibold block">
                  Öll svör og leiðbeiningar
                </span>
              </div>
            </button>

            {/* Category Pill 1: Auglýsendur */}
            <button
              onClick={() => setSelectedPillar('advertiser')}
              className={`p-5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between space-y-3 ${
                selectedPillar === 'advertiser'
                  ? 'border-blue-600 bg-blue-50/20 text-blue-700 shadow-xs font-bold'
                  : 'border-slate-200 bg-white hover:border-slate-300 text-slate-650 hover:text-slate-900 hover:shadow-xs'
              }`}
            >
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
                <span className="material-symbols-outlined font-bold text-lg">campaign</span>
              </div>
              <div>
                <h3 className="font-extrabold text-sm mb-0.5 text-slate-900">
                  Auglýsingar & Herferðir
                </h3>
                <span className="text-[10px] text-slate-400 font-semibold block">
                  Stofnun, CPM og staðsetning
                </span>
              </div>
            </button>

            {/* Category Pill 2: Útgefendur */}
            <button
              onClick={() => setSelectedPillar('publisher')}
              className={`p-5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between space-y-3 ${
                selectedPillar === 'publisher'
                  ? 'border-blue-600 bg-blue-50/20 text-blue-700 shadow-xs font-bold'
                  : 'border-slate-200 bg-white hover:border-slate-300 text-slate-650 hover:text-slate-900 hover:shadow-xs'
              }`}
            >
              <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
                <span className="material-symbols-outlined font-bold text-lg">add_to_queue</span>
              </div>
              <div>
                <h3 className="font-extrabold text-sm mb-0.5 text-slate-900">
                  Vefstýring & Tekjur
                </h3>
                <span className="text-[10px] text-slate-400 font-semibold block">
                  HTML-pláss, hraði og útborganir
                </span>
              </div>
            </button>

            {/* Category Pill 3: Tækni & Kökulaust */}
            <button
              onClick={() => setSelectedPillar('technical')}
              className={`p-5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between space-y-3 ${
                selectedPillar === 'technical'
                  ? 'border-blue-600 bg-blue-50/20 text-blue-700 shadow-xs font-bold'
                  : 'border-slate-200 bg-white hover:border-slate-300 text-slate-650 hover:text-slate-900 hover:shadow-xs'
              }`}
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
                <span className="material-symbols-outlined font-bold text-lg">security</span>
              </div>
              <div>
                <h3 className="font-extrabold text-sm mb-0.5 text-slate-900">
                  Tækni & Persónuvernd
                </h3>
                <span className="text-[10px] text-slate-400 font-semibold block">
                  Kökulaust, Gemini AI og API/MCP
                </span>
              </div>
            </button>
          </div>

          {/* Accordion container */}
          <div className="space-y-4 max-w-3xl mx-auto">
            {filteredFaqs.length === 0 ? (
              <div className="p-8 text-center bg-white border border-slate-200 rounded-2xl space-y-2">
                <span className="material-symbols-outlined text-slate-400 text-4xl block select-none">
                  search_off
                </span>
                <h3 className="font-bold text-slate-800 text-sm">Engar niðurstöður fundust</h3>
                <p className="text-xs text-slate-500 font-medium">
                  Prófaðu að slá inn önnur leitarorð eða velja annan flokk.
                </p>
              </div>
            ) : (
              filteredFaqs.map((faq) => {
                const originalIndex = faqItems.findIndex((item) => item.q === faq.q);
                const isOpen = openFaqIndex === originalIndex;

                return (
                  <div
                    key={originalIndex}
                    className="rounded-2xl bg-white border border-slate-200/80 shadow-xs overflow-hidden transition-all duration-200"
                  >
                    <button
                      onClick={() => toggleFaq(originalIndex)}
                      className="w-full px-6 py-5 flex items-center justify-between text-left font-bold text-slate-850 hover:bg-slate-50 cursor-pointer text-sm sm:text-base"
                    >
                      <span>{faq.q}</span>
                      <span className="material-symbols-outlined text-slate-500 select-none">
                        {isOpen ? 'expand_less' : 'expand_more'}
                      </span>
                    </button>
                    {isOpen && (
                      <div
                        className="px-6 pb-5 pt-1 text-xs sm:text-sm text-slate-650 leading-relaxed border-t border-slate-100 faq-answer"
                        dangerouslySetInnerHTML={{ __html: faq.a }}
                      />
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Help / Contact CTA */}
          <div className="max-w-2xl mx-auto p-8 rounded-3xl bg-slate-900 text-white relative overflow-hidden border border-slate-800 shadow-md">
            <div className="absolute top-0 right-0 w-48 h-48 rounded-full bg-blue-500/10 blur-2xl pointer-events-none" />
            <div className="flex flex-col sm:flex-row items-center justify-between gap-6 relative">
              <div className="space-y-2 text-center sm:text-left">
                <h3 className="text-lg font-bold text-white flex items-center justify-center sm:justify-start gap-2">
                  <span className="material-symbols-outlined text-blue-400">contact_support</span>
                  Fannstu ekki svarið sem þig vantaði?
                </h3>
                <p className="text-xs text-slate-400 font-semibold leading-relaxed max-w-sm">
                  Við erum alltaf til taks til að aðstoða þig við uppsetningu skrifta eða
                  skipulagningu herferða.
                </p>
              </div>
              <a
                href="mailto:info@birtingur.app"
                className="px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs transition cursor-pointer flex items-center gap-1.5 shrink-0 shadow-md shadow-blue-500/20"
              >
                <span className="material-symbols-outlined text-sm">mail</span>
                Sendu okkur póst
              </a>
            </div>
          </div>
        </div>
      </main>

      {/* FOOTER */}
      <PublicFooter />
    </div>
  );
}
