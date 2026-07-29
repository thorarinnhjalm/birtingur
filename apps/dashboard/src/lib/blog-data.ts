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
        text: 'Markaðssetning á netinu er lykilatriði fyrir vöxt flestra fyrirtækja í dag. Hins vegar hefur flestum íslenskum markaðsstjórum verið ýtt út í að nota flókin og dýr erlend stórkerfi eins og Google Ads eða Facebook Ads, sem krefjast mikillar sérfræðiþekkingar og taka verulegan hluta af fjárhagsáætluninni í umsýslugjöld.',
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
          'Birtingar á innlendum vefjum (Display Ads) sem byggja upp traust og sýnileika á þekktum íslenskum vefsíðum þar sem markhópurinn þinn ver tíma sínum.',
        ],
      },
      { type: 'h2', text: 'Kostir þess að auglýsa beint á íslenskum gæðavefjum' },
      {
        type: 'p',
        text: 'Íslenskir netnotendur eyða miklum tíma á staðbundnum vefsíðum – hvort sem það eru fréttavefir, sérhæfð áhugamálablogg eða héraðsmiðlar. Með því að velja dýnamískar vefauglýsingar sem falla vel að efni síðunnar nærðu fram mun meira trausti en með því að láta auglýsingu elta notendur um allan netheiminn.',
      },
      { type: 'h3', text: 'Sjálfsafgreiðsla er framtíðin' },
      {
        type: 'p',
        text: 'Með sjálfvirkum kerfum eins og Birtingi geturðu sleppt dýrum milliliðum eins og auglýsingastofum. Þú einfaldlega velur flokk (t.d. matur, bílar, fasteignir) eða landshluta (t.d. Norðurland, Vesturland) og auglýsingin þín birtist á viðeigandi síðum á örfáum mínútum. Þú greiðir fast og lágt gjald per 1.000 sýningar (CPM) og hefur fulla stjórn á kostnaðinum.',
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
        text: 'Stærðirnar á auglýsingaplássinu skipta höfuðmáli fyrir smellihlutfall. Vinsælustu og dýrustu plássin eru yfirleitt standard stærðirnar:',
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
        text: 'Að selja auglýsingar handvirkt með því að senda tölvupósta og semja um verð tekur gríðarlegan tíma. Með því að nota sjálfvirkan vettvang eins og Birting geturðu skráð vefinn þinn einu sinni, sett inn einn HTML kóðabút og látið kerfið sjá um afganginn. Þú færð 80% af öllum auglýsingatekjum greiddar beint í hverjum mánuði.',
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
        text: 'Í mörg ár byggðist markaðssetning á netinu á því að fylgjast með notendum á milli vefsíðna með svokölluðum þriðju aðila vafrakökum (third-party cookies). Þessi tækni er hins vegar hratt að líða undir lok vegna herts persónuverndarlöggjafar (GDPR) og breytinga í vöfrum eins og Safari, Firefox og Chrome sem loka nú á slíkar kökur.',
      },
      { type: 'h2', text: 'Af hverju eru vafrakökur vandamál?' },
      {
        type: 'p',
        text: 'Vafrakökur safna persónugreinanlegum upplýsingum um hegðun notenda. Samkvæmt Evrópulögum (og íslenskum lögum um persónuvernd) verða vefsíður að sýna stóra og pirrandi samþykkisglugga (cookie banners) til að fá leyfi notenda áður en hægt er að sýna auglýsingar. Þetta skapar lélega notendaupplifun og yfir 50% notenda hafna þessum kökum í dag, sem gerir hefðbundnar mælingar ónákvæmar.',
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
          'Fullkomið samræmi við GDPR-löggjöfina – engin þörf á samþykkisgluggum fyrir þessar auglýsingar.',
          'Betri árangur – notandinn sér auglýsingar sem tengjast því sem hann hefur áhuga á NÚNA, frekar en eitthvað sem hann skoðaði fyrir viku.',
          'Hraðari vefsíður – kökulausar skriftur eru léttari og krefjast ekki samskipta við stóra erlenda gagnagrunna sem hægja á vefhleðslu.',
        ],
      },
      {
        type: 'p',
        text: 'Birtingur er hannaður frá grunni sem 100% kökulaust auglýsingakerfi á Íslandi. Við söfnum engum persónulegum gögnum og tryggjum að vefstjórar og auglýsendur geti unnið saman í fullkomnu öryggi og samræmi við lög.',
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
        text: 'Hefðbundin birtingahús (fjölmiðlaumboð) hafa um áratugaskeið stýrt stórum hluta af auglýsingafé íslenskra fyrirtækja. Þótt þau bjóði upp á persónulega ráðgjöf fylgir þeim oft mikill kostnaður, flókið bókunarferli og háar lágmarkskröfur sem útiloka smærri og meðalstór fyrirtæki.',
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
          'Skýrslur um árangur berast oft seint og eftir á.',
          'Umsýsluþóknun og lágmarksgjöld geta være veruleg.',
        ],
      },
      { type: 'h3', text: 'Leið 2: Sjálfvirka leiðin (Birtingur)' },
      {
        type: 'ol',
        items: [
          'Þú skráir þig inn á vefnum á 1 mínútu.',
          'Velur markflokka og fjárhæð — kerfið sýnir birtingaspá áður en þú borgar.',
          'Býrð til auglýsingaborða út frá vefsíðunni þinni — eða hleður upp þínum eigin.',
          'Herferðin fer í loftið og þú sérð birtingar og smelli í rauntíma.',
          'Ekkert lágmarksgjald – þú borgar aðeins fast gjald per 1.000 sýningar.',
        ],
      },
      { type: 'h2', text: 'Hvor valkosturinn hentar þér betur?' },
      {
        type: 'p',
        text: 'Fyrir stórfyrirtæki með milljóna fjárhagsáætlanir sem þurfa flókna alhliða ráðgjöf og birtingar í sjónvarpi og prentmiðlum getur hefðbundið birtingahús verið rétti kosturinn. En fyrir vefauglýsingar, sérstaklega hjá litlum og meðalstórum fyrirtækjum sem vilja fimi, gagnsæi og hámarks nýtingu á hverri krónu, er sjálfsafgreiðslukerfi eins og Birtingur mun hagkvæmari og fljótlegri kostur.',
      },
    ],
  },
];
