// Dev-only capture step (needs a browser; NOT run in the Vercel build).
// Serves the built dist/ with SPA fallback, renders each sitemap route in a real
// browser so `updateSEO` and the React tree run, and records
// {route, title, description, canonical, rootHtml} into prerender/snapshots.json.
// Re-run whenever marketing page content or the sitemap changes:
//   pnpm --filter @ada/dashboard prerender:capture
import http from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { chromium } from '@playwright/test';
import { dashboardRoot, SNAPSHOTS_PATH, readRoutes, findStaleSources } from './prerender-lib.mjs';

const distDir = join(dashboardRoot, 'dist');
const distIndex = join(distDir, 'index.html');
if (!existsSync(distIndex)) {
  console.error('[prerender:capture] dist/index.html missing — run `vite build` first.');
  process.exit(1);
}

// A present-but-stale dist is the dangerous case: capture succeeds, rewrites
// snapshots.json with the PREVIOUS build's copy, and reports success. Refuse
// instead — a wrong snapshot cache is worse than no capture, because it ships
// text the site no longer contains to Google and to AI crawlers.
function collectSources(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectSources(full));
    else out.push({ path: full.slice(dashboardRoot.length + 1), mtimeMs: statSync(full).mtimeMs });
  }
  return out;
}

const sources = [
  ...collectSources(join(dashboardRoot, 'src')),
  {
    path: 'public/sitemap.xml',
    mtimeMs: statSync(join(dashboardRoot, 'public', 'sitemap.xml')).mtimeMs,
  },
];
const stale = findStaleSources(statSync(distIndex).mtimeMs, sources);
if (stale.length > 0) {
  console.error(
    `[prerender:capture] dist/ is older than ${stale.length} source file(s) — capturing now would\n` +
      `record the PREVIOUS build's copy and silently ship stale text to crawlers.\n` +
      `Run \`pnpm --filter @ada/dashboard build\` first, then capture again.\n\n` +
      stale
        .slice(0, 10)
        .map((p) => `  ${p}`)
        .join('\n') +
      (stale.length > 10 ? `\n  ... and ${stale.length - 10} more` : ''),
  );
  process.exit(1);
}

const MIME = {
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain',
  '.xml': 'application/xml',
};

// Static server with SPA history fallback, mirroring the Vercel rewrite so the
// browser loads the app for any client route.
const server = http.createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    let filePath = join(distDir, urlPath);
    const s = await stat(filePath).catch(() => null);
    if (!s || !s.isFile()) filePath = join(distDir, 'index.html');
    const buf = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'text/html' });
    res.end(buf);
  } catch {
    res.writeHead(500);
    res.end('error');
  }
});

async function launchBrowser() {
  try {
    return await chromium.launch({ headless: true });
  } catch (err) {
    // Fall back to the environment's preinstalled Chromium if the pinned
    // browser build isn't present.
    for (const p of [
      '/opt/pw-browsers/chromium/chrome-linux/chrome',
      '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    ]) {
      if (existsSync(p)) return chromium.launch({ headless: true, executablePath: p });
    }
    throw err;
  }
}

const port = await new Promise((resolve) => {
  server.listen(0, '127.0.0.1', () => resolve(server.address().port));
});
const base = `http://127.0.0.1:${port}`;
const routes = readRoutes();
console.log(`[prerender:capture] serving dist on ${base}; capturing ${routes.length} route(s).`);

const browser = await launchBrowser();
const page = await browser.newPage();
const snapshots = [];

for (const route of routes) {
  await page.goto(base + route, { waitUntil: 'load', timeout: 30000 });
  // Wait for the app to mount and updateSEO to run.
  await page
    .waitForFunction(
      () =>
        document.getElementById('root')?.children.length > 0 &&
        !!document.title &&
        document.title !== 'Birtingur' &&
        !!document.querySelector('link[rel="canonical"]'),
      { timeout: 15000 },
    )
    .catch(() =>
      console.warn(`[prerender:capture] ${route}: SEO signal timed out; capturing as-is.`),
    );
  await page.waitForTimeout(250);

  const snap = await page.evaluate(() => ({
    title: document.title,
    description: document.querySelector('meta[name="description"]')?.getAttribute('content') || '',
    canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') || '',
    rootHtml: document.getElementById('root')?.innerHTML || '',
  }));
  snapshots.push({ route, ...snap });
  console.log(`  ✓ ${route} — ${snap.title.slice(0, 60)}`);
}

await browser.close();
server.close();

await mkdir(dirname(SNAPSHOTS_PATH), { recursive: true });
await writeFile(SNAPSHOTS_PATH, JSON.stringify(snapshots, null, 2) + '\n');
console.log(`[prerender:capture] wrote ${snapshots.length} snapshot(s) to ${SNAPSHOTS_PATH}`);
