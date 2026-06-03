import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createMcpServer } from './server.js';
import { getApiKey } from './lib/auth.js';

export const app = new Hono();

app.use('/*', cors());
app.get('/healthz', (c) => c.json({ ok: true }));

app.all('/mcp', async (c) => {
  let apiKey: string;
  try {
    apiKey = getApiKey(c);
  } catch {
    return c.json({ error: 'missing_auth' }, 401);
  }
  const server = createMcpServer(apiKey);
  const transport = new WebStandardStreamableHTTPServerTransport();
  await server.connect(transport);
  return transport.handleRequest(c.req.raw);
});

export default app;
