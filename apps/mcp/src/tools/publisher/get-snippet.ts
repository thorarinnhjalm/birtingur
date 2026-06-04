import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCall } from '../../lib/api-client.js';

const Input = z.object({ slotId: z.string() });

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

Svaruppbygging (JSON):
{
  "creativeId": "cre_abc123",                    // Auðkenni auglýsingar. Ef gildið er "cre_fallback_transparent", er engin virk herferð í gangi og plássið á að fella saman eða sýna fallback UI (t.d. "Laust auglýsingapláss").
  "imageUrl": "https://cdn.birtingur.app/...",    // Slóð á auglýsingamyndina
  "clickUrl": "/v1/click?c=...",                 // Ath: Skeyttu "https://serving.birtingur.app" framan á og settu sem href á <a> taginu.
  "width": 300,
  "height": 250,
  "impressionPixel": "/v1/impression?c=...",      // Ath: Skeyttu "https://serving.birtingur.app" framan á og hlaða ósýnilega í bakgrunni (t.d. <img src="..." style="display:none" />) til að telja áhorfið.
  "ttl": 30
}

Ef engin auglýsing er tiltæk skilar endapunkturinn:
{
  "creativeId": "cre_fallback_transparent",
  "imageUrl": "data:image/gif;base64,...",
  "clickUrl": "#",
  "width": 1,
  "height": 1,
  "impressionPixel": "/v1/impression?c=cre_fallback_transparent...",
  "ttl": 60
}
Í því tilfelli er mælt með að hylja hólfið (display: none) eða birta sérsniðið "Laust auglýsingapláss" spjald.`;

      return { content: [{ type: 'text', text: responseText }] };
    },
  );
}
