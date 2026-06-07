import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync } from 'fs';

// Load root .env.local so local `pnpm dev` has the same KV / signing creds the API uses.
// Without this, getRedis() throws ("Missing UPSTASH_REDIS_REST_URL / TOKEN") and /v1/ad
// can never read the slot cache. (getRedis is lazy, so setting env before serve() is enough.)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '../../../.env.local');

if (existsSync(envPath)) {
  try {
    const content = readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      let val = trimmed.slice(idx + 1).trim();
      if (val.startsWith('"') && val.endsWith('"')) {
        val = val.slice(1, -1);
      } else if (val.startsWith("'") && val.endsWith("'")) {
        val = val.slice(1, -1);
      }
      val = val.replace(/\\n/g, '\n');
      if (process.env[key] === undefined) {
        process.env[key] = val;
      }
    }
  } catch (e) {
    console.warn('[Serving] Failed to load .env.local:', e);
  }
}

import { serve } from '@hono/node-server';
import app from './index.js';

const port = Number(process.env.PORT) || 3002;
console.log(`[Serving] Server starting on http://localhost:${port}`);

serve({
  fetch: app.fetch,
  port,
});
