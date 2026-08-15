import {
  FLAT_CPM_ISK,
  MIN_PAYOUT_ISK,
  DEFAULT_PLATFORM_FEE_PERCENT,
  formatNumberIs,
} from '@ada/shared';

const CPM = formatNumberIs(FLAT_CPM_ISK);
const PUBLISHER_SHARE = 100 - DEFAULT_PLATFORM_FEE_PERCENT;

export interface BlogPostData {
  slug: string;
  title: string;
  description: string;
  date: string;
  readTime: string;
  category: 'Auglýsendur' | 'Útgefendur' | 'Tækni' | 'Samanburður';
  intro: string;
  content: Array<{
    type: 'p' | 'h2' | 'h3' | 'ul' | 'ol';
    text?: string;
    items?: string[];
  }>;
}

export const BLOG_POSTS: BlogPostData[] = [
  {
    slug: 'vefauglysingar-island-handbok',
    title: 'Hvernig á að auglýsa fyrirtæki á netinu á Íslandi (2026 handbók)',
    description:
      'Viltu auglýsa fyrirtæki á netinu en veist ekki hvar á að byrja? Kynntu þér hvernig stafræn markaðssetning og árangursríkar vefauglýsingar virka á Íslandi.',
    date: '24. júní 2026',
    readTime: '5 mín lestur',
    category: 'Auglýsendur',
    intro:
      'Að auglýsa á netinu getur virkað flókið. Hér förum við yfir helstu atriði sem íslensk fyrirtæki þurfa að hafa í huga til að ná til viðskiptavina með vefauglýsingum án þess að drukkna í erlendum kerfum.',
    content: [
      {
        type: 'p',
        text: 'Markaðssetning á netinu er lykilatriði fyrir vöxt flestra fyrirtækja í dag. Mörg íslensk fyrirtæki reiða sig á erlend stórkerfi eins og Google Ads eða Facebook Ads, sem krefjast töluverðrar sérfræðiþekkingar.',
      },
      { type: 'h2', text: 'Hverjar eru helstu leiðirnar til að auglýsa á netinu?' },
      {
        type: 'p',
        text: 'Á íslenska markaðnum eru þrjár meginleiðir til að koma auglýsingum á framfæri:',
      },
      {
        type: 'ul',
        items: [
          'Leitarvélaauglýsingar (t.d. Google Search) sem miða á fólk sem er þegar að leita að ákveðnum vörum.',
          'Samfélagsmiðlar (Facebook, Instagram) sem sýna auglýsingar út frá áhugamálum notenda.',
          'Birtingar á innlendum vefjum (Display Ads) sem byggja upp traust og sýnileika á íslenskum vefjum þar sem markhópurinn þinn ver tíma sínum.',
        ],
      },
      { type: 'h2', text: 'Kostir þess að auglýsa beint á íslenskum vefjum' },
      {
        type: 'p',
        text: 'Íslenskir netnotendur eyða miklum tíma á staðbundnum vefsíðum – hvort sem það eru fréttavefir, sérhæfð áhugamálablogg eða héraðsmiðlar. Með því að velja vefauglýsingar sem falla að efni síðunnar birtist auglýsingin í samhengi við það sem lesandinn er þegar að skoða, í stað þess að fylgja honum milli vefja.',
      },
      { type: 'h3', text: 'Sjálfsafgreiðsla er framtíðin' },
      {
        type: 'p',
        text: 'Með sjálfvirkum kerfum eins og Birtingi geturðu sleppt dýrum milliliðum eins og auglýsingastofum. Þú einfaldlega velur flokk (t.d. matur, bílar, tækni) eða svæði (t.d. höfuðborgarsvæðið eða Akureyri) og auglýsingin þín birtist á viðeigandi síðum. Þú greiðir fast og lágt gjald per 1.000 sýningar (CPM) og hefur fulla stjórn á kostnaðinum.',
      },
    ],
  },
  {
    slug: 'auka-auglysingatekjur-vefsidu',
    title: '5 leiðir til að auka auglýsingatekjur af vefsíðunni þinni',
    description:
      'Ertu að leita að leiðum til að græða á vefsíðunni þinni? Lestu handbókina okkar og lærðu hvernig á að selja auglýsingapláss og hámarka tekjurnar með einföllum hætti.',
    date: '20. júní 2026',
    readTime: '4 mín lestur',
    category: 'Útgefendur',
    intro:
      'Að reka vinsæla vefsíðu kostar tíma og vinnu. Hér eru fimm árangursríkar leiðir til að breyta heimsóknum lesenda þinna í stöðugar og góðar mánaðarlegar tekjur með vefauglýsingum.',
    content: [
      {
        type: 'p',
        text: 'Margir vefstjórar og bloggarar á Íslandi treysta á hefðbundin auglýsinganet eins og Google AdSense en verða oft fyrir vonbrigðum með lágar greiðslur og óviðeigandi erlendar auglýsingar. Innlendi markaðurinn virkar öðruvísi og krefst markvissari nálgunar.',
      },
      { type: 'h2', text: '1. Veldu réttar stærðir á auglýsingaborðum' },
      {
        type: 'p',
        text: 'Stærðirnar á auglýsingaplássinu skipta máli fyrir smellihlutfall. Algengustu plássin eru staðalstærðirnar (verðið er það sama óháð stærð):',
      },
      {
        type: 'ul',
        items: [
          '300x250 (Medium Rectangle) - passar einstaklega vel í hliðarstikur eða inni í miðjum texta á farsímum.',
          '728x90 (Leaderboard) - tilvalið efst á vefsíður fyrir ofan aðalefnið.',
          '980x120 (Billboard IS) - stórt og áberandi pláss efst á vefjum sem fangar athygli strax.',
        ],
      },
      { type: 'h2', text: '2. Settu auglýsingarnar þar sem lesendur horfa' },
      {
        type: 'p',
        text: 'Ef auglýsingin er neðst í fætinum mun enginn sjá hana og auglýsendur munu ekki vilja halda áfram að birta hjá þér. Bestu plássin eru „above the fold“ (það svæði sem sést strax án þess að skruna niður) eða inni í áhugaverðu lesefni þar sem notandinn stoppar til að lesa.',
      },
      { type: 'h2', text: '3. Notaðu sjálfvirka birtingaþjónustu' },
      {
        type: 'p',
        text: 'Að selja auglýsingar handvirkt með því að senda tölvupósta og semja um verð tekur gríðarlegan tíma. Með því að nota sjálfvirkan vettvang eins og Birting geturðu skráð vefinn þinn einu sinni, sett inn einn HTML kóðabút og látið kerfið sjá um afganginn. Þú færð 80% af öllum auglýsingatekjum greidd út mánaðarlega.',
      },
      { type: 'h2', text: '4. Haltu vefnum þínum hröðum og öruggum' },
      {
        type: 'p',
        text: 'Leitarvélar eins og Google refsa vefjum sem hlaðast hægt. Gakktu úr skugga um að auglýsingskriftan sem þú notar sé ósamstillt (asynchronous) og undir nokkrum kílóbætum að stærð svo hún tefji ekki fyrir innihaldi síðunnar.',
      },
    ],
  },
  {
    slug: 'kokulausar-auglysingar-gdpr',
    title: 'Kökulausar auglýsingar: Framtíð vefauglýsinga án vafrakaka (GDPR)',
    description:
      'Vafrakökur þriðja aðila eru að hverfa. Lærðu hvernig kökulausar auglýsingar og persónuverndarvænar birtingar tryggja GDPR samræmi og betri árangur.',
    date: '15. júní 2026',
    readTime: '6 mín lestur',
    category: 'Tækni',
    intro:
      'Reglugerðir um persónuvernd (GDPR) og hertar aðgerðir vafra gegn vafrakökum eru að breyta stafrænni markaðssetningu. Kökulausar auglýsingar bjóða upp á leið til að ná árangri án þess að brjóta á friðhelgi notenda.',
    content: [
      {
        type: 'p',
        text: 'Í mörg ár byggðist markaðssetning á netinu á því að fylgjast með notendum á milli vefsíðna með svokölluðum þriðju aðila vafrakökum (third-party cookies). Vafrar eins og Safari og Firefox loka sjálfgefið á slíkar kökur og persónuverndarkröfur hafa hert að þessari tækni.',
      },
      { type: 'h2', text: 'Af hverju eru vafrakökur vandamál?' },
      {
        type: 'p',
        text: 'Vafrakökur þriðja aðila safna upplýsingum um hegðun notenda milli vefja. Þess vegna reiða margar vefsíður sig á samþykkisglugga (cookie banners), sem hefur áhrif á upplifun lesenda. Hafðu samband við lögfræðing um hvaða kröfur eiga við um þinn vef.',
      },
      { type: 'h2', text: 'Lausnin: Samhengismiðun (Contextual Targeting)' },
      {
        type: 'p',
        text: 'Kökulausar auglýsingar fylgjast ekki með notandanum persónulega. Þess í stað miða þær á samhengi síðunnar sem verið er að skoða. Ef notandi er að lesa grein um uppskriftir á matarbloggi, sýnir kerfið auglýsingu frá matvöruverslun eða eldhústækjaframleiðanda.',
      },
      { type: 'h3', text: 'Kostir samhengismiðunar:' },
      {
        type: 'ul',
        items: [
          'Engar vafrakökur eru settar vegna auglýsinganna sjálfra.',
          'Betri árangur – notandinn sér auglýsingar sem tengjast því sem hann hefur áhuga á NÚNA, frekar en eitthvað sem hann skoðaði fyrir viku.',
          'Létt skrifta – auglýsingaskriftan er undir 4 KB og hleðst ósamstillt.',
        ],
      },
      {
        type: 'p',
        text: 'Birtingur er hannaður frá grunni sem kökulaust auglýsingakerfi á Íslandi. Við söfnum ekki persónugreinanlegum upplýsingum um lesendur og tryggjum að vefstjórar og auglýsendur geti unnið saman í fullkomnu öryggi og samræmi við lög.',
      },
    ],
  },
  {
    slug: 'sjalfvirk-kerfi-vs-birtingahus',
    title: 'Sjálfvirk vefauglýsingakerfi vs. hefðbundin birtingahús',
    description:
      'Hver er munurinn á því að nota sjálfvirka birtingaþjónustu og vinna með hefðbundnum birtingahúsum eða auglýsingastofum? Við berum saman kostnað og ferla.',
    date: '10. júní 2026',
    readTime: '5 mín lestur',
    category: 'Samanburður',
    intro:
      'Þegar kemur að því að kaupa auglýsingar á netinu standa fyrirtæki frammi fyrir tveimur ólíkum kostum: Að láta hefðbundið birtingahús sjá um kaupin handvirkt eða nota sjálfvirkt sjálfsafgreiðslukerfi án milliliða.',
    content: [
      {
        type: 'p',
        text: 'Hefðbundin birtingahús (fjölmiðlaumboð) hafa um áratugaskeið stýrt stórum hluta af auglýsingafé íslenskra fyrirtækja. Þau bjóða upp á persónulega ráðgjöf og bókunarferlið fer að jafnaði fram í gegnum starfsfólk.',
      },
      { type: 'h2', text: 'Samanburður á ferlum' },
      { type: 'p', text: 'Hér er munurinn á því hvernig þú kemur herferð í loftið:' },
      { type: 'h3', text: 'Leið 1: Hefðbundið birtingahús' },
      {
        type: 'ol',
        items: [
          'Þú sendir fyrirspurn og bíður eftir fundi eða tilboði.',
          'Húsið semur handvirkt við fjölmiðla um pláss og verð.',
          'Þú sendir efnið með tölvupósti og bíður eftir að starfsmaður setji það upp.',
          'Skýrslur um árangur berast í gegnum tengilið.',
        ],
      },
      { type: 'h3', text: 'Leið 2: Sjálfvirka leiðin (Birtingur)' },
      {
        type: 'ol',
        items: [
          'Þú skráir þig á biðlista og kemst inn um leið og opnað er fyrir nýja auglýsendur.',
          'Velur markflokka og fjárhæð — kerfið sýnir birtingaspá áður en þú borgar.',
          'Býrð til auglýsingaborða út frá vefsíðunni þinni — eða hleður upp þínum eigin.',
          'Herferðin fer í loftið og þú fylgist með birtingum og smellum, sem uppfærast á klukkustundar fresti.',
          'Ekkert lágmarksgjald – þú borgar aðeins fast gjald per 1.000 sýningar.',
        ],
      },
      { type: 'h2', text: 'Hvor valkosturinn hentar þér betur?' },
      {
        type: 'p',
        text: 'Fyrir stórfyrirtæki með milljóna fjárhagsáætlanir sem þurfa flókna alhliða ráðgjöf og birtingar í sjónvarpi og prentmiðlum getur hefðbundið birtingahús verið rétti kosturinn. En fyrir vefauglýsingar, sérstaklega hjá litlum og meðalstórum fyrirtækjum sem vilja fimi, gagnsæi og hámarks nýtingu á hverri krónu, getur sjálfsafgreiðslukerfi eins og Birtingur hentað betur.',
      },
    ],
  },
  {
    slug: 'hvad-eru-birtingar-cpm-verd',
    title: 'Hvað eru birtingar? CPM, birtingaspá og verð vefauglýsinga',
    description: `Birting (impression) er hver sýning auglýsingar fyrir raunverulegum lesanda. Hér útskýrum við hvernig birtingar eru taldar, hvað CPM þýðir og hvað vefauglýsingar kosta á Íslandi.`,
    date: '1. ágúst 2026',
    readTime: '5 mín lestur',
    category: 'Auglýsendur',
    intro: `Birting (á ensku „impression") er ein sýning auglýsingar fyrir lesanda á vefsíðu. Verð vefauglýsinga er nær alltaf gefið upp sem CPM — verð fyrir hverjar 1.000 birtingar. Hjá Birtingi er CPM-verðið fast: ${CPM} kr. fyrir hverjar 1.000 birtingar, óháð flokki og árstíma.`,
    content: [
      { type: 'h2', text: 'Hvað telst vera birting?' },
      {
        type: 'p',
        text: 'Birting telst þegar auglýsing birtist á skjá lesanda. Það er þó munur á kerfum: sum telja birtingu um leið og auglýsingin er sótt, jafnvel þótt hún sjáist aldrei. Birtingur fylgir alþjóðlegum IAB-viðmiðum um sýnileika (viewability) — birting telst aðeins eftir að auglýsingin hefur raunverulega sést á skjánum. Tvíteknar og óeðlilegar birtingar eru síaðar frá áður en þær eru gjaldfærðar.',
      },
      { type: 'h2', text: 'Hvað þýðir CPM?' },
      {
        type: 'p',
        text: `CPM stendur fyrir „Cost Per Mille" — kostnað fyrir hverjar 1.000 birtingar. Ef CPM-verðið er ${CPM} kr. og þú setur 20.000 kr. í herferð færðu um það bil ${String(Math.round(20000 / FLAT_CPM_ISK) * 1000).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} birtingar. Reikniformúlan er einföld: fjárhæð ÷ CPM × 1.000 = fjöldi birtinga.`,
      },
      { type: 'h3', text: 'Fast verð eða uppboð?' },
      {
        type: 'p',
        text: `Flest erlend auglýsingakerfi nota uppboðsfyrirkomulag (RTB) þar sem verðið sveiflast eftir eftirspurn og erfitt er að áætla kostnað fyrirfram. Birtingur fer aðra leið: eitt fast CPM-verð, ${CPM} kr., í öllum efnisflokkum. Þú veist því upp á krónu hvað herferðin kostar áður en hún fer í loftið.`,
      },
      { type: 'h2', text: 'Hvað er birtingaspá?' },
      {
        type: 'p',
        text: 'Birtingaspá er mat á því hversu margar birtingar eru í boði í tilteknum efnisflokki á næstunni, byggt á raunverulegri umferð vefjanna í flokknum. Í kaupferlinu hjá Birtingi sérðu birtingaspá fyrir valda flokka áður en þú greiðir — svo þú getir metið hvort fjárhæðin skili þeirri dreifingu sem þú vilt.',
      },
      { type: 'h2', text: 'Hvað verður um peninginn?' },
      {
        type: 'p',
        text: `Af hverjum 1.000 birtingum renna ${PUBLISHER_SHARE}% af nettótekjunum til útgefandans — vefsins sem birtir auglýsinguna — og ${DEFAULT_PLATFORM_FEE_PERCENT}% eru þjónustuþóknun Birtings. Útgefendur fá útborgað mánaðarlega þegar inneign nær ${formatNumberIs(MIN_PAYOUT_ISK)} kr. lágmarki. Þannig sérðu nákvæmlega hvert auglýsingaféð þitt fer — enginn falinn milliliðakostnaður.`,
      },
      { type: 'h2', text: 'Algengar spurningar um birtingar' },
      { type: 'h3', text: 'Er smellur það sama og birting?' },
      {
        type: 'p',
        text: 'Nei. Birting er sýning auglýsingarinnar; smellur er þegar lesandi smellir á hana. Hlutfallið þar á milli kallast smellihlutfall (CTR). Hjá Birtingi greiðir þú fyrir birtingar (CPM), ekki smelli.',
      },
      { type: 'h3', text: 'Get ég fylgst með birtingum herferðarinnar?' },
      {
        type: 'p',
        text: 'Já — í stjórnborðinu sérðu birtingar og smelli hverrar herferðar, og tölurnar uppfærast á klukkustundar fresti.',
      },
    ],
  },
  {
    slug: 'vefbordar-staerdir-og-bordagerd',
    title: 'Vefborðar: stærðir, hönnun og sjálfvirk borðagerð',
    description:
      'Hvaða stærðir af vefborðum þarftu og hvað einkennir góðan auglýsingaborða? Yfirlit yfir IAB-staðalstærðir og hvernig hægt er að láta útbúa borðana sjálfkrafa.',
    date: '1. ágúst 2026',
    readTime: '4 mín lestur',
    category: 'Tækni',
    intro:
      'Vefborðar (display-borðar) eru myndauglýsingarnar sem birtast á vefsíðum — efst á síðu, í hliðarstiku eða inni í efni. Til að herferð nái yfir öll auglýsingapláss þarf borða í nokkrum staðalstærðum, og hér er farið yfir hverjar þær eru og hvernig þú kemur þér upp borðum án hönnuðar.',
    content: [
      { type: 'h2', text: 'Hvaða stærðir af vefborðum eru notaðar?' },
      {
        type: 'p',
        text: 'Vefborðar fylgja alþjóðlegum staðalstærðum frá IAB (Interactive Advertising Bureau) svo sami borði passi í sambærileg pláss á ólíkum vefjum. Á íslenskum vefjum eru þessar stærðir algengastar — og þetta eru jafnframt stærðirnar sem auglýsingapláss hjá Birtingi nota:',
      },
      {
        type: 'ul',
        items: [
          '728×90 (Leaderboard) — láréttur borði efst eða neðst á síðu.',
          '300×250 (Medium Rectangle) — ferhyrningur í hliðarstiku eða inni í efni; algengasta stærðin.',
          '300×600 (Half Page) — hár borði í hliðarstiku með miklu plássi fyrir skilaboð.',
          '320×100 (Mobile Banner) — borði sniðinn fyrir símaskjái.',
          '980×120 (Billboard) — breiður borði fyrir stærri skjái, algengur á íslenskum fréttavefjum.',
        ],
      },
      { type: 'h2', text: 'Hvað einkennir góðan vefborða?' },
      {
        type: 'ul',
        items: [
          'Ein skýr skilaboð: fyrirsögn, stutt lýsing og hnappur — ekki meira.',
          'Læsilegt letur í nægri stærð, líka í minnstu útgáfunni.',
          'Góð birtuskil milli texta og bakgrunns.',
          'Vörumerkið sýnilegt svo lesandinn viti strax frá hverjum auglýsingin er.',
          'Áfangasíðan passar við skilaboðin — borði sem lofar einu en lendir á öðru skilar litlu.',
        ],
      },
      { type: 'h2', text: 'Áttu enga borða? Sjálfvirk borðagerð' },
      {
        type: 'p',
        text: 'Þú þarft hvorki hönnuð né hönnunarforrit til að auglýsa hjá Birtingi. Í kaupferlinu límir þú inn slóðina á vefsíðuna þína og kerfið les hana, skrifar tillögur að auglýsingatexta á íslensku og útbýr borða í öllum þeim staðalstærðum sem auglýsingaplássin í völdu flokkunum þínum nota. Þú velur tillögu, getur breytt fyrirsögn, undirtexta og hnappatexta að vild, og staðfestir áður en nokkuð fer í loftið.',
      },
      { type: 'h2', text: 'Tæknilegar kröfur' },
      {
        type: 'p',
        text: 'Ef þú hleður upp eigin borðum tekur Birtingur við PNG, JPEG og WebP myndum (að hámarki 2 MB). Allt auglýsingaefni fer í gegnum efnisskimun áður en það birtist á vefjum útgefenda — það á jafnt við um upphlaðna borða og borða úr sjálfvirku borðagerðinni.',
      },
    ],
  },
];
