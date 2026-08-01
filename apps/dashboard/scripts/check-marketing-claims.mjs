// Marketing-claims lint: fails the build when public marketing copy contains
// claim patterns that were retracted in the 2026-07 truthfulness pass
// (commits 624ae5a, 8393f47, 1fff519) or that the platform cannot back.
// Scope: the English marketing pages (source) and the committed prerender
// snapshots (which bake every marketing route, Icelandic included, into the
// HTML crawlers actually receive).
//
// Allowed claims are the verified USP list only — see AGENTS.md at the repo
// root. To allow a legitimate hit in a .tsx file, append `// claims-ok` to
// that line and say why in the adjacent code.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dashboardRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const BANNED = [
  { re: /real.?time/i, why: 'stats aggregate hourly; "real-time" was retracted in 624ae5a' },
  { re: /rauntíma/i, why: 'Icelandic "real-time" — same retraction as 624ae5a' },
  { re: /\binstant(ly)?\b/i, why: 'no instant promises; retracted in the truthfulness pass' },
  { re: /guarantee/i, why: 'no guarantees in marketing copy' },
  { re: /\bfastest\b|\bno\. ?1\b|\bbest[- ]in[- ]class\b/i, why: 'superiority claims need citations we do not have' },
  { re: /less than \d+ (minute|second)|\bin (just )?\d+ (minutes|seconds)\b|\d+.(mínút|sekúnd)\w* (skráning|uppsetning)/i, why: 'time promises retracted in 624ae5a' },
  { re: /(are|is) switching from/i, why: 'pre-launch network: nobody is "switching" yet (1fff519)' },
  { re: /high[- ]cpm/i, why: 'pricing is a flat CPM for every category — no high-CPM tiers' },
  { re: /\d[\d,.]* ?\+ (publishers|creators|sites|users|sessions|útgefend)/i, why: 'invented scale numbers' },
];

const failures = [];

function scanText(text, locate) {
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    if (/claims-ok/.test(line)) return;
    for (const { re, why } of BANNED) {
      const m = line.match(re);
      if (m) failures.push(`${locate(i + 1)}: "${m[0]}" — ${why}`);
    }
  });
}

const pagesDir = join(dashboardRoot, 'src', 'pages');
for (const f of readdirSync(pagesDir).filter((f) => f.startsWith('English') && f.endsWith('.tsx'))) {
  scanText(readFileSync(join(pagesDir, f), 'utf8'), (line) => `src/pages/${f}:${line}`);
}

const snapshotsPath = join(dashboardRoot, 'prerender', 'snapshots.json');
try {
  for (const snap of JSON.parse(readFileSync(snapshotsPath, 'utf8'))) {
    scanText(snap.rootHtml ?? '', () => `prerender/snapshots.json route ${snap.route}`);
  }
} catch {
  console.log('[claims-check] no snapshots.json — skipping snapshot scan.');
}

if (failures.length) {
  console.error(`[claims-check] ${failures.length} banned marketing claim(s) found:`);
  for (const f of failures) console.error(`  ${f}`);
  console.error('[claims-check] Only the verified USP list may be claimed — see AGENTS.md.');
  process.exit(1);
}
console.log('[claims-check] marketing copy clean.');
