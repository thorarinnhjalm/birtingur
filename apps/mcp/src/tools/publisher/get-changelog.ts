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
Núverandi útgáfa Serving API: v1.1

ÚTGÁFUSAGA & DEPLOY BREYTINGAR:

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
