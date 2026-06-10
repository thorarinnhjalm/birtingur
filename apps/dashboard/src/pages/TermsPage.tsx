import { useEffect } from 'react';
import PublicHeader from '@/components/layout/PublicHeader';
import PublicFooter from '@/components/layout/PublicFooter';

export default function TermsPage() {
  // Dynamic SEO Metadata setup
  useEffect(() => {
    const titleText = 'Skilmálar og persónuvernd | Birtingur — Vefauglýsingar';
    const descriptionText =
      'Skilmálar og persónuverndarstefna Birtings. Upplýsingar um ábyrgð, greiðsluflæði og hvernig við tryggjum kökulausar og öruggar vefauglýsingar.';

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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans antialiased overflow-x-hidden selection:bg-blue-600 selection:text-white">
      {/* Background Ambient Gradients */}
      <div className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full bg-blue-500/5 blur-[120px] pointer-events-none -z-10" />
      <div className="absolute top-1/3 right-10 w-[500px] h-[500px] rounded-full bg-violet-500/5 blur-[100px] pointer-events-none -z-10" />

      {/* HEADER */}
      <PublicHeader currentTab="terms" />

      {/* MAIN */}
      <main className="grow">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 md:py-20 space-y-12">
          <div className="space-y-4 text-center">
            <h1 className="text-4xl font-extrabold text-slate-900">Skilmálar og Persónuvernd</h1>
            <p className="text-lg text-slate-500 font-medium">
              Notendaskilmálar og stefna um meðferð persónuupplýsinga hjá Birtingi (birtingur.app).
            </p>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-3xl p-8 sm:p-10 shadow-xs space-y-8 text-slate-650 leading-relaxed text-sm">
            <section className="space-y-3">
              <h2 className="text-xl font-bold text-slate-900 border-b border-slate-100 pb-2">
                1. Almenn ákvæði
              </h2>
              <p>
                Vefurinn <strong>birtingur.app</strong> (hér eftir „Birtingur“ eða „Vettvangurinn“)
                er rekinn af <strong>Neðri Hóll Hugmyndahús ehf.</strong>, kt. 470126-2480,
                Álfhólsvegi 97, 200 Kópavogur (hér eftir „Félagið“). Birtingur er sjálfvirkur
                sjálfsafgreiðsluvettvangur sem tengir saman útgefendur vefsvæða og auglýsendur á
                Íslandi.
              </p>
              <p>
                Skilmálar þessir gilda um öll viðskipti og notkun á þjónustu Birtings, hvort sem um
                ræðir kaup á auglýsingaplássi (auglýsendur) eða sölu á birtingum (útgefendur). Með
                því að stofna aðgang samþykkja notendur skilmála þessa í heild sinni.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-bold text-slate-900 border-b border-slate-100 pb-2">
                2. Skilmálar fyrir auglýsendur (Kaupendur)
              </h2>
              <p>
                <strong>Innborgun og Wallet</strong>: Birtingur notar fyrirframgreitt inneignarkerfi
                (Wallet). Auglýsendur leggja inn inneign með kreditkorti í gegnum örugga
                greiðslugátt
                <strong>Teya</strong>. Lágmarksinnborgun er 2.000 kr. Innlögnin er VSK-frjáls
                innlögn á veltureikning og bætist 100% við inneign þína. Við innborgun færðu senda
                kvittun fyrir innlögninni. Lögbundinn sölureikningur með 24% virðisaukaskatti (VSK)
                er gefinn út fyrir 20% umsýsluþóknun Birtings jafnóðum og herferðir eru birtar.
                Inneignir fyrnast ekki en eru almennt ekki endurgreiddar nema herferðir séu
                stöðvaðar af hálfu kerfisins.
              </p>
              <p>
                <strong>Auglýsingaefni (Creatives)</strong>: Auglýsendur bera fulla ábyrgð á því
                efni sem þeir hlaða upp í kerfið. Öllum auglýsingum er skannað sjálfvirkt fyrir
                óviðeigandi efni (t.d. nekt, ofbeldi) og þær þurfa samþykki kerfisstjóra áður en ær
                fara í birtingu. Ólöglegt efni, hatursáróður eða efni sem brýtur gegn höfundarrétti
                er stranglega bannað.
              </p>
              <p>
                <strong>Birtingar og kostnaður</strong>: Kostnaður er dreginn af inneign notanda í
                rauntíma samkvæmt CPM (kostnaður per 1.000 sýningar) eða samkvæmt föstu verði
                plássa. Kerfið ver herferð sjálfkrafa um leið og inneign hennar tæmist.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-bold text-slate-900 border-b border-slate-100 pb-2">
                3. Skilmálar fyrir útgefendur (Söluaðila)
              </h2>
              <p>
                <strong>Uppsetning og rekstur</strong>: Útgefandi setur inn létta Javascript skriftu
                (widget.js) á sitt vefsvæði til að birta auglýsingar. Skriftan vinnur ósamstillt
                (async) og fellur út hljóðlaust ef villa kemur upp, án þess að tefja eða skemma
                fyrir vefnum.
              </p>
              <p>
                <strong>Ritstjórnarlegt frelsi</strong>: Útgefandi getur virkjað handvirka
                samþykkisbiðröð (Approvals Queue) í sínu stjórnborði. Þannig er hægt að skoða og
                samþykkja eða hafna öllum auglýsingaborðum áður en þeir birtast á vefnum.
              </p>
              <p>
                <strong>Þóknun og greiðslur</strong>: Birtingur tekur{' '}
                <strong>20% flatgreidda þóknun</strong> af öllum auglýsingatekjum sem miðlast í
                gegnum kerfið. Þóknunin stendur straum af rekstri, greiðslugáttum og umsýslu. Tekjur
                útgefanda safnast upp í rauntíma. Ef áunnin inneign nær <strong>5.000 kr.</strong>{' '}
                nettó greiðist hún út á skráðan bankareikning fyrsta virka dag næsta mánaðar.
                Útgefandi ber ábyrgð á því að banka- og reikningsupplýsingar séu réttar.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-bold text-slate-900 border-b border-slate-100 pb-2">
                4. Persónuverndarstefna (GDPR)
              </h2>
              <p>
                Birtingur leggur mikla áherslu á persónuvernd og lágmarkar söfnun gagna. Kerfið
                safnar <strong>ekki persónugreinanlegum vafrakökum</strong> (tracking cookies) til
                að fylgjast með notendum á milli vefsvæða.
              </p>
              <p>
                <strong>Gagnaúrvinnsla</strong>: Auglýsingamiðlun okkar er samhengismiðuð
                (Contextual Targeting) og byggist á flokkun vefefnis og grófri staðsetningu
                (landfræðilegt svæði greint út frá IP-tölu á netþjónsstigi). IP-tölur eru aldrei
                vistaðar í gagnagrunni okkar heldur eru þær eingöngu notaðar í rauntíma til að
                ákvarða birtingarsvæði og koma í veg fyrir smellasvik (Click Fraud). Birtingur telst
                því vera vinnsluaðili (Processor) gagna en útgefandi telst ábyrgðaraðili
                (Controller) gagnvart sínum lesendum.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-bold text-slate-900 border-b border-slate-100 pb-2">
                5. Takmörkun ábyrgðar
              </h2>
              <p>
                Neðri Hóll Hugmyndahús ehf. ábyrgist ekki 100% samfellda keyrslu eða algjört
                villuleysi í kerfinu. Þjónustan er afhent „eins og hún er“. Félagið ber enga ábyrgð
                á óbeinu tjóni, glötuðum tekjum útgefenda, eða rekstrartjóni auglýsenda vegna bilana
                eða tafa á birtingum.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-bold text-slate-900 border-b border-slate-100 pb-2">
                6. Gildissvið og varnarþing
              </h2>
              <p>
                Skilmálar þessir eru háðir íslenskum lögum. Rísi ágreiningur vegna þeirra eða
                notkunar á vettvangnum skal málinu vísað til Héraðsdóms Reykjavíkur.
              </p>
              <p className="text-xs text-slate-400 pt-4">
                Síðast uppfært: 3. júní 2026. Neðri Hóll Hugmyndahús ehf. áskilur sér rétt til að
                uppfæra skilmála þessa reglulega.
              </p>
            </section>
          </div>
        </div>
      </main>

      {/* FOOTER */}
      <PublicFooter />
    </div>
  );
}
