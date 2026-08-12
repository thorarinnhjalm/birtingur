// Guards the single most expensive mistake this repo has made: the snippet's
// SERVE_BASE is baked in at build time, and for months it was built against a
// hostname that did not exist in DNS. The embed loaded fine on publisher pages
// and sent every ad request, impression and click into a black hole — no error
// anywhere, publishers saw house ads, the platform recorded nothing.
//
// This script runs in CI after the build (see .github/workflows/ci.yml). It
// fails when:
//   1. the built bundle does not contain the canonical serving origin,
//   2. the bundle contains some OTHER https origin (a stray absolute URL that
//      would dodge the SERVE_BASE resolution in render.ts), or
//   3. the canonical host does not resolve in DNS / accept an HTTPS request.
//
// HTTP status is deliberately NOT checked: a 404 still proves DNS and a live
// deployment exist, and a transient 5xx must not block unrelated merges. Only
// "the host is not there at all" fails.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lookup } from 'node:dns/promises';
import { request } from 'node:https';

// The one place the canonical origin is asserted. Must match the default in
// esbuild.config.mjs; "serving.", never "serve." — the serve. variant is the
// unregistered host that caused the outage.
const CANONICAL_ORIGIN = 'https://serving.birtingur.app';

const bundlePath = resolve(dirname(fileURLToPath(import.meta.url)), '../dist/snippet.js');

let bundle;
try {
  bundle = readFileSync(bundlePath, 'utf8');
} catch {
  console.error(`[check-host] FAIL: ${bundlePath} not found — build the snippet first.`);
  process.exit(1);
}

const origins = [...new Set(bundle.match(/https:\/\/[A-Za-z0-9.-]+/g) ?? [])];

if (!origins.includes(CANONICAL_ORIGIN)) {
  console.error(
    `[check-host] FAIL: built snippet does not contain ${CANONICAL_ORIGIN}. ` +
      `Found: ${origins.join(', ') || '(none)'}. The default in esbuild.config.mjs ` +
      `must stay the real production serving origin.`,
  );
  process.exit(1);
}

// Origins that are allowed to appear hardcoded in the bundle besides the
// serving origin. Navigation-only links, never request targets: nothing the
// snippet FETCHES may live here, or a staging SERVE_BASE override would miss it.
const ALLOWED_EXTRA_ORIGINS = new Set([
  'https://www.birtingur.app', // house-ad backlink (render.ts), plain <a href>
]);

const strays = origins.filter((o) => o !== CANONICAL_ORIGIN && !ALLOWED_EXTRA_ORIGINS.has(o));
if (strays.length > 0) {
  console.error(
    `[check-host] FAIL: built snippet contains unexpected absolute origins: ${strays.join(', ')}. ` +
      `Every request must go through SERVE_BASE so staging builds can override it.`,
  );
  process.exit(1);
}

const host = new URL(CANONICAL_ORIGIN).hostname;

try {
  const { address } = await lookup(host);
  console.log(`[check-host] DNS ok: ${host} -> ${address}`);
} catch (err) {
  console.error(
    `[check-host] FAIL: ${host} does not resolve in DNS. ` +
      `This is exactly the failure that once shipped a snippet pointing at a dead host. ${err}`,
  );
  process.exit(1);
}

await new Promise((resolveDone) => {
  const req = request(
    { host, path: '/widget.js', method: 'HEAD', timeout: 10_000 },
    (res) => {
      console.log(`[check-host] HTTPS ok: HEAD ${CANONICAL_ORIGIN}/widget.js -> ${res.statusCode}`);
      res.resume();
      resolveDone();
    },
  );
  req.on('timeout', () => {
    req.destroy(new Error('timeout'));
  });
  req.on('error', (err) => {
    console.error(`[check-host] FAIL: HTTPS request to ${host} failed: ${err.message}`);
    process.exit(1);
  });
  req.end();
});

console.log('[check-host] snippet serving origin verified.');
