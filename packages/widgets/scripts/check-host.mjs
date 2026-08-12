// Mirror of packages/snippet/scripts/check-host.mjs for the widgets bundle,
// added the day the same class of bug was found here: the bundle's API_BASE
// default was http://localhost:3001, production shipped it, and every
// embedded widget on an external page fetched the visitor's own machine —
// silently dead, no error anywhere on our side.
//
// Runs in CI after the build. Fails when the built bundle lacks the canonical
// API origin, carries any other absolute origin (including any localhost
// leftover), or the host stops resolving / answering over HTTPS. HTTP status
// is deliberately not checked — a 404 still proves the host exists, and a
// transient 5xx must not block unrelated merges.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lookup } from 'node:dns/promises';
import { request } from 'node:https';

const CANONICAL_ORIGIN = 'https://api.birtingur.app';

const bundlePath = resolve(dirname(fileURLToPath(import.meta.url)), '../dist/widgets.js');

let bundle;
try {
  bundle = readFileSync(bundlePath, 'utf8');
} catch {
  console.error(`[check-host] FAIL: ${bundlePath} not found — build the widgets first.`);
  process.exit(1);
}

const origins = [...new Set(bundle.match(/https?:\/\/[A-Za-z0-9.:-]+/g) ?? [])];

if (!origins.includes(CANONICAL_ORIGIN)) {
  console.error(
    `[check-host] FAIL: built widgets bundle does not contain ${CANONICAL_ORIGIN}. ` +
      `Found: ${origins.join(', ') || '(none)'}. The default in esbuild.config.mjs ` +
      `must stay the real production API origin.`,
  );
  process.exit(1);
}

const strays = origins.filter((o) => o !== CANONICAL_ORIGIN);
if (strays.length > 0) {
  console.error(
    `[check-host] FAIL: built widgets bundle contains unexpected origins: ${strays.join(', ')}. ` +
      `Every request must go through API_BASE so local builds can override it.`,
  );
  process.exit(1);
}

const host = new URL(CANONICAL_ORIGIN).hostname;

try {
  const { address } = await lookup(host);
  console.log(`[check-host] DNS ok: ${host} -> ${address}`);
} catch (err) {
  console.error(`[check-host] FAIL: ${host} does not resolve in DNS. ${err}`);
  process.exit(1);
}

await new Promise((resolveDone) => {
  const req = request({ host, path: '/', method: 'HEAD', timeout: 10_000 }, (res) => {
    console.log(`[check-host] HTTPS ok: HEAD ${CANONICAL_ORIGIN}/ -> ${res.statusCode}`);
    res.resume();
    resolveDone();
  });
  req.on('timeout', () => {
    req.destroy(new Error('timeout'));
  });
  req.on('error', (err) => {
    console.error(`[check-host] FAIL: HTTPS request to ${host} failed: ${err.message}`);
    process.exit(1);
  });
  req.end();
});

console.log('[check-host] widgets API origin verified.');
