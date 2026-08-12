import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync } from 'fs';

const originallyHadEmulator = !!(
  process.env.FIRESTORE_EMULATOR_HOST ||
  process.env.FIREBASE_AUTH_EMULATOR_HOST ||
  process.env.FIREBASE_EMULATOR_HUB
);

console.log('[API env] FIRESTORE_EMULATOR_HOST =', process.env.FIRESTORE_EMULATOR_HOST);
console.log('[API env] originallyHadEmulator =', originallyHadEmulator);

// Test detection happens BEFORE the .env.local load below, because the load
// itself is the hazard: a developer's root .env.local carries real Upstash,
// Resend, Teya and Gemini credentials, and until 2026-08-12 every local
// `pnpm test:api` run inherited them — tests wrote real `slot:{id}` keys into
// production Redis and produced local-only failures (tests/slot-delivery) that
// passed in CI. Tests must see exactly what CI sees: the emulator, and nothing
// live. Vitest sets VITEST=true in every worker, so this needs no config.
const isTest = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '../../../../.env.local');

if (isTest) {
  console.log('[API env] test run — skipping .env.local');
} else if (existsSync(envPath)) {
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
    console.warn('[Env] Failed to load .env.local:', e);
  }
}

// Clear or set emulator host variables depending on environment
if (isTest) {
  // Force emulator hosts for testing
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
  process.env.GCLOUD_PROJECT = 'birtingur-8b5a4';
  // Clear production credentials to ensure we don't accidentally write to live Firestore
  delete process.env.FIREBASE_PRIVATE_KEY;
  delete process.env.FIREBASE_CLIENT_EMAIL;
  delete process.env.FIREBASE_PROJECT_ID;
  delete process.env.FIREBASE_DATABASE_ID;
  // Same guarantee for every other live service. Skipping .env.local above
  // covers the file; these deletes cover credentials exported in the shell
  // itself. Tests that need a "configured" state set the variable (or mock the
  // module) for their own duration — see tests/reconciliation.test.ts, which
  // already assumed this clean baseline and defended itself by hand.
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  delete process.env.RESEND_API_KEY;
  delete process.env.TEYA_API_KEY;
  delete process.env.TEYA_WEBHOOK_SECRET;
  delete process.env.GEMINI_API_KEY;
} else {
  const isEmulatorRunning = originallyHadEmulator;
  const hasProductionCredentials =
    !!(
      process.env.FIREBASE_PRIVATE_KEY &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PROJECT_ID
    ) && !isEmulatorRunning;
  if (hasProductionCredentials) {
    delete process.env.FIRESTORE_EMULATOR_HOST;
    delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
  }
}
