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
