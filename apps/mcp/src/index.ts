import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createMcpServer } from './server.js';
import { getApiKey } from './lib/auth.js';

export const app = new Hono();

app.use('/*', cors());
app.get('/healthz', (c) => c.json({ ok: true }));

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
    return c.json({ error: 'missing_auth', message: 'Bearer token is invalid or missing' }, 401);
  }
  const server = await createMcpServer(apiKey);
  const transport = new WebStandardStreamableHTTPServerTransport();
  await server.connect(transport);
  return transport.handleRequest(c.req.raw);
});

export default app;
