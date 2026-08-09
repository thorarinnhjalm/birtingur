import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const Input = z.object({});

export function registerGetChangelog(server: McpServer) {
  server.registerTool(
    'get_changelog',
    {
      title: 'Sækja breytingaskrá og útgáfuupplýsingar',
      description:
        'Sækir nýjustu breytingar á Birtingur API og response-shapes til að tryggja að samþættingar brotni ekki við uppfærslur.',
      inputSchema: Input.shape,
    },
    async () => {
      const changelog = `--- BIRTINGUR API VERSION & CHANGELOG ---
Núverandi útgáfa Serving API: v1.3

ÚTGÁFUSAGA & DEPLOY BREYTINGAR:

[2026-08-09] API v1.3 - Raunveruleg vefumferð (pageviewPixel) & öruggari empty-svör
* Nýtt pageviewPixel svæði:
  Öll /v1/ad svör sem skila auglýsingu (fyllt eða fallback) innihalda nú valfrjálst "pageviewPixel" svæði — undirritað "pixel" sem á að fýra NÁKVÆMLEGA EINU SINNI á hverja síðuhleðslu, óháð fjölda auglýsingaplássa á síðunni. Þetta er aðgreint frá impressionPixel (fýrt einu sinni á hvert pláss) og er grunnurinn að réttri "Vefumferð" tölfræði (dashboard notar núna "pageViewsTrue" en ekki gamla "pageviews" svæðið sem taldi hleðslur plássa, ekki síðuhleðslur).
* BirtingurAdSlot component (MCP) uppfært:
  Component-inn sem get_react_component skilar fýrir nú pageviewPixel með global-flaggi (líkt og JS snippet-ið) svo margar <BirtingurAdSlot> einingar á sömu síðu skrá aðeins EITT raunverulegt vefumferðaratvik. Útgefendur sem sóttu component-inn fyrir þessa útgáfu ættu að sækja hann aftur með get_react_component — annars situr "Vefumferð" þeirra föst á "—" í dashboard-inu.
* Öruggari {empty:true} svör við cache-miss:
  Þegar pláss er alls ekki í cache (fyrsta flettingin á nýju plássi, eða cache runnið út) skilar API-ið ekki lengur pageviewPixel í því svari — aðeins impressionPixel. Cache-miss svör skila sér hraðast allra og hefðu annars kerfisbundið "unnið" kapphlaupið um að skrá vefumferðina, jafnvel þegar önnur pláss á sömu síðu voru í cache og hefðu getað skráð hana rétt.

[2026-06-07] API v1.2 - Zero-Stats Lagfæring & IAB Viewability
* Lagfæring á {empty:true} svörum:
  Þegar pláss finnst ekki í Redis cache skilar API-ið nú impressionPixel slóð MBV svari: { "empty": true, "impressionPixel": "/v1/impression?c=cre_nocache&s=SLOT_ID&type=pageview" }. Áður var svari skilað án impression pixel — flettingar á óskráðum plássum töldust aldrei og voru ósýnilegar í tölfræðinni. Útgefendur sem nota JS snippet (widget.js) fá þessa lagfærslu sjálfkrafa. Útgefendur með MCP React component þurfa að sækja uppfærðan component í gegnum get_react_component.
* Nýtt cre_nocache fallback creative:
  Nýtt creativeId "cre_nocache" er nú notað sem auðkenni fyrir flettingar sem koma frá plássum sem eru ekki í cache. Þetta ID er sjálfkrafa meðhöndlað sem pageview í impression route-inum.
* Impression route áreiðanleiki:
  Impression route (/v1/impression) er nú varin gegn Redis-villum — tracking pixel skilar sér alltaf (200 OK image/gif) jafnvel ef Redis er tímabundið niðri. Áður gat Redis villa valdið 500 villu sem missti áhorfið og olli villu í vafra útgefanda.
* Stale-slot impressions:
  Ef pláss-cache rennur út á milli þess að auglýsing er sótt og áhorf skráð (innan 1 klst. glugga), skráist áhorfið nú sem best-effort impression í stað þess að glatast. Viðvörun birtist í logum.
* IAB Viewability í JS snippet:
  widget.js snippet-ið notar nú IntersectionObserver (50% sýnilegt í 1 sek) til að mæla áhorf samkvæmt IAB staðli. Áður var áhorf skráð strax við render án sýnileikaskilyrðis.
* React component (MCP) uppfært:
  BirtingurAdSlot component sem get_react_component skilar styður nú "cre_nocache" í FALLBACK_CREATIVES og fýrir pageview pixel fyrir empty svor.

[2026-06-05] API v1.1 - Uppfærsla á Fallback og CORS
* Bætt við Dynamic SVG House Ad Fallback: 
  Þegar engin virk herferð er tiltæk fyrir virkt pláss skilar API-ið ekki lengur { "empty": true }, heldur skilar það húsaauglýsingu með creativeId "cre_fallback_birtingur" og dynamic responsive SVG mynd til að kynna Birtingur.app. Þetta svar inniheldur einnig gilda impressionPixel slóð svo útgefendur geti áfram mælt heildar-flettingar (pageviews) á vefnum sínum.
* Bætt við CORS stuðningi:
  Serving API á serving.birtingur.app styður nú CORS fyrir alla uppruna (Access-Control-Allow-Origin: *), sem leyfir beinar fyrirspurnir úr vöfrum (headless/hybrid samþætting).

[2026-06-04] API v1.0 - Stofnun plássa og empty-state
* Breyting á {empty: true} merkingu:
  Ef pláss finnst ekki í kerfinu (t.d. ef það hefur verið eytt eða finnst ekki í Redis) skilar API-ið { "empty": true }. Viðskiptavinir (clients) verða að höndla þetta tilvik með því að halda plássinu með tómum div til að forðast Layout Shift (CLS) eða fella það saman (display: none).
* Categories Target breyting:
  Bætt við categories flokkun á útgefendum og herferðum. register_publisher krefst og styður nú fylki af flokkum (t.d. ["taekni"]).`;

      return { content: [{ type: 'text' as const, text: changelog }] };
    },
  );
}
