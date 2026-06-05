import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerPublisherTools } from './tools/publisher/index.js';

export async function createMcpServer(apiKey: string): Promise<McpServer> {
  const server = new McpServer({
    name: 'ada-ad-platform',
    version: '1.0.0',
  });

  // MCP is the publisher integration channel: project owners create ad slots and
  // embed them on their site. Advertiser/buying tools are intentionally not exposed.
  registerPublisherTools(server, apiKey);

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

  // 2. Expose a prompt for onboarding publishers
  server.prompt('publisher_onboarding', async () => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: 'Ég vil tengja vefsíðuna mína við Birtingur ad platformið. Hvaða skref þarf ég að taka og hvernig hjálpar þú mér í gegnum MCP tenginguna?',
        },
      },
    ],
  }));

  return server;
}
