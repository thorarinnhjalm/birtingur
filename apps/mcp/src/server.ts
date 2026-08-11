import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerPublisherTools } from './tools/publisher/index.js';
import { registerAdvertiserTools } from './tools/advertiser/index.js';
import { registerCommonTools } from './tools/common/index.js';
import { apiCall, ApiClientError } from './lib/api-client.js';
import { McpAuthError, UpstreamUnavailableError } from './lib/errors.js';

interface ApiKeyMeResponse {
  scope: 'advertiser' | 'publisher' | 'both';
  purchase: {
    enabled: boolean;
    monthlyCapIsk: number;
    autoApproveLimitIsk: number;
    monthToDateSpentIsk: number;
    remainingCapIsk: number;
  } | null;
}

export async function createMcpServer(apiKey: string): Promise<McpServer> {
  const server = new McpServer({
    name: 'ada-ad-platform',
    version: '1.0.0',
  });

  // MCP is scoped per API key: publisher-scoped keys get the publisher tool
  // set (create/manage ad slots), advertiser-scoped keys get the advertiser
  // tool set (buy category campaigns, subject to the purchase guardrails —
  // see tools/advertiser), and 'both'-scoped keys get everything. This
  // supersedes the earlier "MCP is publisher-only" design (commit 6973955
  // removed advertiser tools entirely) now that the committed-funds
  // reservation gate and daily reconciliation cron make agentic buying safe
  // — see docs/superpowers/plans/2026-07-27-advertiser-mcp-agentic-buying.md.
  //
  // The MCP server has no direct DB access, so scope is resolved over HTTP
  // via GET /v1/api-keys/me. Failures are NOT swallowed: this used to return a
  // server with zero tools, which reads to a client as "connected, but this
  // account can do nothing" — indistinguishable from a revoked key or an API
  // outage. Auth failures become a 401 with a WWW-Authenticate challenge and
  // everything else a 503, both handled in src/index.ts.
  let scope: 'advertiser' | 'publisher' | 'both';
  try {
    const me = await apiCall<ApiKeyMeResponse>('/v1/api-keys/me', { apiKey });
    scope = me.scope;
  } catch (err) {
    if (err instanceof ApiClientError && (err.status === 401 || err.status === 403)) {
      throw new McpAuthError(
        'API key is invalid, revoked or expired. Issue a new key under Stillingar → API-lyklar in the Birtingur dashboard.',
      );
    }
    console.error('[MCP] Failed to resolve API key scope:', err);
    throw new UpstreamUnavailableError(
      'Could not reach the Birtingur API to verify the API key. Try again shortly.',
    );
  }

  const isPublisher = scope === 'publisher' || scope === 'both';
  const isAdvertiser = scope === 'advertiser' || scope === 'both';

  registerCommonTools(server, apiKey);

  if (isPublisher) {
    registerPublisherTools(server, apiKey);
  }
  if (isAdvertiser) {
    registerAdvertiserTools(server, apiKey);
  }

  if (!isPublisher) {
    return server;
  }

  // 1. Expose top-level integration instructions as a resource
  server.resource('publisher-guide', 'instructions://publisher-guide', async (uri) => ({
    contents: [
      {
        uri: uri.href,
        text: `--- LEIÐBEININGAR FYRIR SAMÞÆTTINGU VIÐ BIRTING ---
Sem útgefandi á Birtingur vettvangnum áttu að fylgja þessu vinnuflæði:

Skref 0: Áttaðu þig á samhenginu
Kallaðu á 'whoami' FYRST. Það segir þér hvort útgefanda-prófíll er þegar til, hvaða publisherId hann hefur, hvaða lén og flokkar eru skráðir — og hvað sé næsta skref. Slepptu skrefi 1 ef prófíllinn er þegar til.

Skref 1: Skráðu vefinn þinn (útgefanda)
Kallaðu á 'register_publisher' tólið með þínu léni, sýnilegu nafni og bankaupplýsingum til útborgana.

Skref 2: Stofnaðu auglýsingapláss (Slots)
Sæktu leyfðar stærðir með 'list_ad_sizes' (ekki harðkóða þær) og kallaðu svo á 'create_slot' fyrir hvert pláss sem þú vilt bjóða upp á (t.d. Billboard 980x120 eða Mobile Banner 320x100). Verð er fast CPM á vettvangnum og ekki stillanlegt.

Skref 3: Sæktu React component eða innfellingarkóða
- Fyrir React/Next.js: Kallaðu á 'get_react_component' til að fá tilbúinn React kóða sem höndlar loading, fallbacks án layout shifts, og viewability mælingar.
- Fyrir venjulegt HTML: Kallaðu á 'get_snippet_code' til að fá hefðbundna innfellingarskriftu.

Skref 4: Fylgstu með árangri og tekjum
Notaðu 'get_stats' reglulega til að sjá heildarfjölda birtinga, smella og uppsafnaðar tekjur fyrir þinn vef.`,
      },
    ],
  }));

  // 2. Expose a prompt for onboarding publishers and showing workflow instructions
  server.prompt('instructions', async () => ({
    description:
      'Sýnir leiðbeiningar og mælt vinnuflæði (workflow) við samþættingu plássa og stýringu herferða hjá Birtingi.',
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Ég vil tengja vefsíðuna mína við Birtingur auglýsingakerfið. Hvaða skref þarf ég að taka og í hvaða röð á ég að kalla á MCP tólin?

Mælt vinnuflæði útgefanda:
0. 'whoami' (sjá hvort prófíll er þegar til, sækja publisherId, lén og flokka)
1. 'register_publisher' (stofna prófíl útgefanda með léni, flokkum og bankareikningi — sleppt ef whoami skilar prófíl)
2. 'list_ad_sizes' + 'create_slot' (stofna auglýsingapláss á vefnum, t.d. Billboard 980x120 eða Mobile Banner 320x100)
3. 'get_react_component' (Next.js/React - mælt með) eða 'get_snippet_code' (hefðbundið HTML/JS)
4. 'list_pending_approvals' og 'approve_creative' (stýra og leyfa herferðir)
5. 'get_stats' (fylgjast með birtingum, smellum og tekjum)`,
        },
      },
    ],
  }));

  return server;
}
