import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync } from 'fs';

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
    console.warn('[API] Failed to load .env.local:', e);
  }
}

if (process.env.FIRESTORE_EMULATOR_HOST === undefined) {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
}
if (process.env.FIREBASE_AUTH_EMULATOR_HOST === undefined) {
  process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
}
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'ada-test';

import { serve } from '@hono/node-server';
import app from './index.js';

const port = Number(process.env.PORT) || 3001;
console.log(`[API] Server starting on http://localhost:${port}`);

serve({
  fetch: app.fetch,
  port,
});
