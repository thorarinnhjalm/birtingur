import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerPublisherTools } from './tools/publisher/index.js';
import { registerAdvertiserTools } from './tools/advertiser/index.js';
import { apiCall } from './lib/api-client.js';

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
  // via GET /v1/api-keys/me. On failure (invalid/revoked key), no tools are
  // registered at all — the API would reject every call anyway, so this just
  // avoids advertising capabilities the key can't use.
  let scope: 'advertiser' | 'publisher' | 'both' | null = null;
  try {
    const me = await apiCall<ApiKeyMeResponse>('/v1/api-keys/me', { apiKey });
    scope = me.scope;
  } catch (err) {
    console.error('[MCP] Failed to resolve API key scope, registering no tools:', err);
  }

  const isPublisher = scope === 'publisher' || scope === 'both';
  const isAdvertiser = scope === 'advertiser' || scope === 'both';

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

Skref 1: Skráðu vefinn þinn (útgefanda)
Kallaðu á 'register_publisher' tólið með þínu léni, sýnilegu nafni og bankaupplýsingum til útborgana.

Skref 2: Stofnaðu auglýsingapláss (Slots)
Kallaðu á 'create_slot' fyrir hvert pláss sem þú vilt bjóða upp á (t.d. Billboard 980x120 eða Mobile Banner 320x100).

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
1. 'register_publisher' (stofna prófíl útgefanda með léni, flokkum og bankareikningi)
2. 'create_slot' (stofna auglýsingapláss á vefnum, t.d. Billboard 980x120 eða Mobile Banner 320x100)
3. 'get_react_component' (Next.js/React - mælt með) eða 'get_snippet_code' (hefðbundið HTML/JS)
4. 'list_pending_approvals' og 'approve_creative' (stýra og leyfa herferðir)
5. 'get_stats' (fylgjast með birtingum, smellum og tekjum)`,
        },
      },
    ],
  }));

  return server;
}
