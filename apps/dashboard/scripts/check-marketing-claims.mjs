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
  { re: /less than \d+ (minute|second)|\bin (just )?\d+ (minutes|seconds)\b/i, why: 'time promises retracted in 624ae5a' },
  // Icelandic time promises. This used to require "skráning" or "uppsetning"
  // to follow the duration, which meant the live homepage line "Stofnaðu
  // herferð á 3 mínútum" did not match — the most prominent time promise on
  // the site slipped the one check meant to catch it. Icelandic is the
  // primary language here, so the pattern is now the broad one: any duration
  // in minutes or seconds.
  //
  // The `fresti` lookahead is the promise/cadence distinction. "á 15 mínútna
  // fresti" ("every 15 minutes") states how often our own machinery runs — the
  // accrual cadence in TermsPage — and is a fact about the system, not a speed
  // promised to the reader. "herferð á 3 mínútum" is a promise. Only the
  // second kind is banned, and the lookahead is what separates them without
  // needing a `claims-ok` marker inside a prerendered snapshot, which cannot
  // carry one.
  // The `\b` before the lookahead is load-bearing: without it `\w*` simply
  // backtracks a letter, ends the match mid-word, and the lookahead then sees
  // the rest of the word instead of " fresti" — so the exemption silently
  // stopped working. `\b` forces the whole word to be consumed first.
  { re: /\d+\s*(mínút|sekúnd)\w*\b(?!\s+fresti)/i, why: 'Icelandic time promise — no speed promises in public copy (624ae5a)' },
  { re: /(are|is) switching from/i, why: 'pre-launch network: nobody is "switching" yet (1fff519)' },
  { re: /high[- ]cpm/i, why: 'pricing is a flat CPM for every category — no high-CPM tiers' },
  { re: /\d[\d,.]* ?\+ (publishers|creators|sites|users|sessions|útgefend)/i, why: 'invented scale numbers' },
  { re: /outperform|\bbeats\b/i, why: 'superiority claims over competitors need citations we do not have' },
  { re: /fully compliant|compliant by design/i, why: 'legal compliance promises are banned — educational framing only (8393f47)' },
  { re: /without consent banners?/i, why: 'consent-banner promises are legal claims; the snippet itself is consent-gated' },
  { re: /\b(choose|prefer|chose)\b.{0,40}\bover (mediavine|ezoic|adsense|google)/i, why: 'pre-launch network: no adoption claims versus named competitors' },
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

const llmsPath = join(dashboardRoot, 'public', 'llms.txt');
scanText(readFileSync(llmsPath, 'utf8'), (line) => `public/llms.txt:${line}`);

// index.html carries the static fallback inside #root — the first and often
// only Birtingur text a non-JS crawler or an LLM ever reads. It was outside
// this check entirely until 2026-08-09, and a banned time promise
// ("Stofnaðu herferð á 3 mínútum") lived there in production the whole time.
// The prerender snapshots do NOT cover it: capture runs the React app, which
// replaces this markup before the snapshot is taken.
const indexPath = join(dashboardRoot, 'index.html');
scanText(readFileSync(indexPath, 'utf8'), (line) => `index.html:${line}`);

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
