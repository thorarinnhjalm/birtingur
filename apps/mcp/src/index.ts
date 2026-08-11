import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createMcpServer } from './server.js';
import { getApiKey } from './lib/auth.js';
import { McpAuthError, UpstreamUnavailableError } from './lib/errors.js';

const AUTH_REALM = 'birtingur-mcp';
const KEY_DOCS_URL = 'https://www.birtingur.app/faq';

/**
 * RFC 6750 challenge. Without credentials the challenge carries no `error`
 * code (nothing failed yet — the client simply hasn't authenticated); with
 * bad credentials it carries `invalid_token` plus a human-readable reason, so
 * an integrator sees *why* in the response headers instead of having to
 * correlate a silent empty tool list with a server log.
 */
function challenge(err?: McpAuthError): string {
  const parts = [`realm="${AUTH_REALM}"`];
  if (err) {
    parts.push(`error="${err.oauthError}"`, `error_description="${headerSafe(err.message)}"`);
  }
  return `Bearer ${parts.join(', ')}`;
}

/**
 * HTTP header values are ByteStrings — any codepoint above 255 throws when
 * set. Our messages are written for Icelandic integrators and reach for
 * typographic characters ("Stillingar → API-lyklar"), so the header gets an
 * ASCII transliteration while the JSON body keeps the real text.
 */
function headerSafe(value: string): string {
  return value
    .replace(/→/g, '->')
    .replace(/[‘’“”"]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export const app = new Hono();

app.use('/*', cors());
app.get('/healthz', (c) => c.json({ ok: true }));

app.get('/robots.txt', (c) => {
  return c.text('User-agent: *\nDisallow: /\n');
});

app.get('/', (c) => {
  return c.text(
    [
      'Birtingur MCP Server — the agent gateway to Icelandic display advertising.',
      'Publisher tools: register sites, manage ad slots, embed snippets, read stats.',
      'Advertiser tools: browse categories and inventory forecasts, check wallet and purchase limits, buy category campaigns with already-approved creatives (opt-in per API key, monthly cap, owner approval above a configurable threshold).',
      'Auth: Bearer ak_… API key. Docs: https://www.birtingur.app/faq',
    ].join('\n'),
  );
});

app.notFound((c) => {
  return c.json({ error: 'not_found', message: `Route not found: ${c.req.path}` }, 404);
});

app.onError((err, c) => {
  console.error('[MCP Error]', err);
  return c.json({ error: 'internal_server_error', message: err.message }, 500);
});

app.all('/mcp', async (c) => {
  c.header('X-Accel-Buffering', 'no');
  c.header('Cache-Control', 'no-cache, no-transform');
  c.header('Connection', 'keep-alive');

  let apiKey: string;
  try {
    apiKey = getApiKey(c);
  } catch {
    c.header('WWW-Authenticate', challenge());
    return c.json(
      {
        error: 'missing_auth',
        message: `Missing Authorization header. Send "Authorization: Bearer ak_…" with a Birtingur API key. Create one under Stillingar → API-lyklar in the dashboard, or see ${KEY_DOCS_URL}.`,
      },
      401,
    );
  }

  let server;
  try {
    server = await createMcpServer(apiKey);
  } catch (err) {
    if (err instanceof McpAuthError) {
      c.header('WWW-Authenticate', challenge(err));
      return c.json({ error: 'invalid_token', message: err.message, docs: KEY_DOCS_URL }, 401);
    }
    if (err instanceof UpstreamUnavailableError) {
      return c.json({ error: 'upstream_unavailable', message: err.message }, 503);
    }
    throw err;
  }

  const transport = new WebStandardStreamableHTTPServerTransport();
  await server.connect(transport);
  return transport.handleRequest(c.req.raw);
});

export default app;
