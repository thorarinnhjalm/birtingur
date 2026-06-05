import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCall } from '../../lib/api-client.js';

const Input = z.object({
  slotId: z.string().describe('ID þess pláss sem á að sækja sniðmát fyrir'),
});

export function registerGetSnippet(server: McpServer, apiKey: string) {
  server.registerTool(
    'get_snippet_code',
    {
      title: 'Sækja innfellingarkóða og samþættingarupplýsingar',
      description:
        'Sækir HTML/JS innfellingarkóða (Snippet) fyrir auglýsingapláss og skilar einnig leiðbeiningum um hvernig má útfæra Hybrid/Headless samþættingu fyrir React/Next.js með Serving REST API.',
      inputSchema: Input.shape,
    },
    async ({ slotId }) => {
      const r = await apiCall<{ snippet: string }>(`/v1/publishers/me/slots/${slotId}/snippet`, {
        apiKey,
      });

      const responseText = `--- STANDARD WIDGET SNIPPET ---
Notaðu þennan HTML/JS kóða til að fella auglýsinguna beint inn:
${r.snippet}

--- HYBRID / HEADLESS REACT SAMÞÆTTING (Mælt með fyrir React / Next.js) ---
Ef þú ert að smíða React eða Next.js vefsíðu er mælt með að gera beint GET kall í Serving API-ið í staðinn fyrir að nota JS scriptu. Það gefur fulla stjórn á fallback útliti og kemur í veg fyrir layout shift.

Keyrðu GET fyrirspurn á:
https://serving.birtingur.app/v1/ad?slot=${slotId}&consent=none

Styður CORS fyrir alla uppruna (any origin).

Færibreytur (Query parameters):
* slot: ID plássins (t.d. ${slotId})
* consent: persónuverndarsamþykki:
  - "none" (sjálfgefið): Engar viðvarandi vafrakökur, engin fylgni milli vefja.
  - "full": Leyfir fylgni til að framfylgja birtingartakmörkunum (frequency caps).

--- PERSÓNUVERND (GDPR / CONSENT) SAMÞÆTTING ---
Serving REST API styður samþættingu við GDPR kökuborða (CMP / Cookiebot o.fl.):
* Ef notandi hefur ekki samþykkt markaðssetningarkökur, notaðu 'consent=none'.
* Ef notandi hefur gefið samþykki sitt fyrir kökum, notaðu 'consent=full' til að leyfa birtingartakmarkanir (frequency capping) og hámarka virði plássins.

--- API VILLU-SVÖR (ERROR RESPONSES) ---
Ef Serving API skilar ekki 200 OK (t.d. 400 Bad Request, 500 Server Error) mun það skila JSON villu-svari á þessu formi:
{
  "error": "Lýsandi skýring á villunni",
  "code": "SLOT_NOT_FOUND" // eða annar vél-læsilegur villukóði
}
Mælt er með að grípa þessar villur (catch block) og sýna annaðhvort tóm/gegnsætt fallback (transparent fallback) til að valda ekki Layout Shift (CLS), eða skrá þær í þróunarskrár.

--- BREYTINGASKRÁ OG API ÚTGÁFUR (CHANGELOG) ---
Birtingur API fylgir semí-semantískri útgáfunotkun (núverandi Serving API útgáfa: v1.1). Hægt er að kalla á 'get_changelog' tólið hvenær sem er til að fá ítarlega skrá yfir nýlegar uppfærslur (t.d. breytingu á fallback house ad hegðun, CORS og flokkunar-target).

--- AD RESPONSE SHAPES ---

Svaruppbygging þegar auglýsing er tiltæk (JSON):
{
  "creativeId": "cre_abc123",
  "imageUrl": "https://cdn.birtingur.app/...",    // Slóð á auglýsingamynd
  "clickUrl": "/v1/click?c=...",                 // Smelltenging. Ath: Ef hún byrjar á "/" þarf að skeyta "https://serving.birtingur.app" framan á.
  "width": 980,
  "height": 120,
  "impressionPixel": "/v1/impression?c=...",      // Áhorfspixel. Skall sýndur ósýnilega (t.d. með Image() eða <img>) til að telja áhorfið. Skeytið "https://serving.birtingur.app" framan á ef hún byrjar á "/".
  "ttl": 30                                       // Cache líftími í sekúndum. Sækja ætti nýja auglýsingu eftir þennan tíma.
}

Svaruppbygging þegar engin virk herferð er tiltæk:
Hér skilar kerfið sjálfvirkri húsaauglýsingar (house ad) fallback mynd sem er responsive SVG data-URL til að kynna Birting:
{
  "creativeId": "cre_fallback_birtingur",
  "imageUrl": "data:image/svg+xml;utf8,...",
  "clickUrl": "https://birtingur.app",
  "width": 980,
  "height": 120,
  "impressionPixel": "/v1/impression?c=cre_fallback_birtingur...",
  "ttl": 60
}
Athugið: Ef gildið á creativeId er "cre_fallback_birtingur" eða "cre_fallback_transparent", er það húsaauglýsing eða gagnsætt fallback. 

Svaruppbygging ef plássið er ekki til í kerfinu:
{
  "empty": true
}
Í þessu tilfelli er plássið óþekkt. Mælt er með að fella saman plássið (display: none) eða halda stærð þess með tómum div til að koma í veg fyrir Layout Shift (CLS).`;

      return { content: [{ type: 'text' as const, text: responseText }] };
    },
  );
}
