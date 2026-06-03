import { serve } from '@hono/node-server';
import app from './index.js';

const port = Number(process.env.PORT) || 3003;
console.log(`[MCP] Server starting on http://localhost:${port}`);

serve({
  fetch: app.fetch,
  port,
});
