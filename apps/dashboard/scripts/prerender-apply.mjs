// Build-time step (runs on Vercel, pure Node — no browser).
// Reads prerender/snapshots.json and the freshly built dist/index.html, then
// writes dist/<route>/index.html for each snapshot. Safe no-op if snapshots are
// missing, so the build never breaks when the cache hasn't been generated yet.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { dashboardRoot, SNAPSHOTS_PATH, outputPathFor, stitch } from './prerender-lib.mjs';

const distDir = join(dashboardRoot, 'dist');
const templatePath = join(distDir, 'index.html');

if (!existsSync(SNAPSHOTS_PATH)) {
  console.log('[prerender:apply] no snapshots.json — skipping (run prerender:capture to generate).');
  process.exit(0);
}
if (!existsSync(templatePath)) {
  console.error('[prerender:apply] dist/index.html not found — run vite build first.');
  process.exit(1);
}

const template = readFileSync(templatePath, 'utf8');
const snapshots = JSON.parse(readFileSync(SNAPSHOTS_PATH, 'utf8'));

let written = 0;
for (const snap of snapshots) {
  if (!snap.route || !snap.rootHtml) continue;
  const outPath = join(distDir, outputPathFor(snap.route));
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, stitch(template, snap));
  written += 1;
}

console.log(`[prerender:apply] wrote ${written} prerendered page(s) into dist/.`);
