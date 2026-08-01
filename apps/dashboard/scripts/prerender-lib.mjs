// Shared helpers for the prerender pipeline.
//
// The dashboard is a client-rendered SPA whose per-page SEO (title, meta
// description, canonical) is applied in the browser via `updateSEO`. That means
// the raw HTML every route serves is identical, so Google treats the templated
// city pages (/auglysendur/<borg>, /midlar/<borg>, ...) as duplicates and does
// not index them ("Discovered - currently not indexed").
//
// The fix is a two-step prerender:
//   1. capture (dev-only, needs a browser) renders each route for real and
//      records {title, description, canonical, rootHtml} into prerender/snapshots.json.
//   2. apply (runs in the Vercel build, pure Node) stitches each snapshot into
//      the FRESH dist/index.html and writes dist/<route>/index.html. Stitching
//      into the fresh template keeps the hashed asset tags current, so snapshots
//      never go stale against a new build.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
export const dashboardRoot = join(here, '..');
export const ORIGIN = 'https://www.birtingur.app';
export const SNAPSHOTS_PATH = join(dashboardRoot, 'prerender', 'snapshots.json');

// Routes to prerender come straight from the sitemap so the two never drift.
// Root ("/") is intentionally excluded: it maps to dist/index.html, which we
// leave as the SPA shell so authenticated app routes keep their current
// behavior, and the homepage already ships static fallback content + is indexed.
export function readRoutes() {
  const xml = readFileSync(join(dashboardRoot, 'public', 'sitemap.xml'), 'utf8');
  const routes = [];
  for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
    let path = m[1].replace(ORIGIN, '').trim();
    if (!path.startsWith('/')) continue;
    if (path === '/') continue;
    if (!routes.includes(path)) routes.push(path);
  }
  return routes;
}

// Which sources were edited after the build that capture is about to render?
//
// capture renders dist/, not src/. It used to check only that dist/index.html
// existed, so running it without building first quietly recaptured the previous
// build's copy and reported success — and the committed snapshot cache then
// served crawlers text that no longer matched the site.
//
// `sources` is [{ path, mtimeMs }]. Equal timestamps count as fresh: a file
// written in the same millisecond as the build is part of that build.
export function findStaleSources(distMtimeMs, sources) {
  return sources.filter((s) => s.mtimeMs > distMtimeMs).map((s) => s.path);
}

// dist/<route>/index.html — Vercel resolves /a/b to a/b/index.html, and that
// filesystem match is checked before the SPA rewrite in vercel.json, so these
// files win for their exact paths while everything else falls through to the SPA.
export function outputPathFor(route) {
  const clean = route.replace(/^\/+|\/+$/g, '');
  return join(clean, 'index.html');
}

const replaceAttr = (html, pattern, value) =>
  html.replace(pattern, (_m, pre, post) => pre + value + post);

// Stitch one snapshot into the fresh built index.html template.
export function stitch(template, snap) {
  let html = template;

  html = html.replace(/<title>[\s\S]*?<\/title>/, () => `<title>${escapeText(snap.title)}</title>`);

  html = replaceAttr(
    html,
    /(<meta\s+name="description"\s+content=")[\s\S]*?("\s*\/?>)/,
    escapeAttr(snap.description),
  );
  html = replaceAttr(
    html,
    /(<meta\s+property="og:url"\s+content=")[\s\S]*?("\s*\/?>)/,
    escapeAttr(snap.canonical),
  );
  html = replaceAttr(
    html,
    /(<meta\s+property="twitter:url"\s+content=")[\s\S]*?("\s*\/?>)/,
    escapeAttr(snap.canonical),
  );
  html = replaceAttr(
    html,
    /(<meta\s+property="og:title"\s+content=")[\s\S]*?("\s*\/?>)/,
    escapeAttr(snap.title),
  );
  html = replaceAttr(
    html,
    /(<meta\s+property="twitter:title"\s+content=")[\s\S]*?("\s*\/?>)/,
    escapeAttr(snap.title),
  );
  html = replaceAttr(
    html,
    /(<meta\s+property="og:description"\s+content=")[\s\S]*?("\s*\/?>)/,
    escapeAttr(snap.description),
  );
  html = replaceAttr(
    html,
    /(<meta\s+property="twitter:description"\s+content=")[\s\S]*?("\s*\/?>)/,
    escapeAttr(snap.description),
  );

  const canonicalTag = `<link rel="canonical" href="${escapeAttr(snap.canonical)}" />`;
  if (/rel="canonical"/.test(html)) {
    html = replaceAttr(
      html,
      /(<link\s+rel="canonical"\s+href=")[\s\S]*?(")/,
      escapeAttr(snap.canonical),
    );
  } else {
    html = html.replace('</head>', `  ${canonicalTag}\n  </head>`);
  }

  // The template's #root has no nested <div>, so the non-greedy match ends at
  // its own closing tag. A function replacer keeps `$` in rootHtml literal.
  html = html.replace(
    /(<div id="root">)[\s\S]*?(<\/div>)/,
    (_m, open, close) => open + snap.rootHtml + close,
  );

  return html;
}

export function escapeText(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
export function escapeAttr(s) {
  return escapeText(s).replace(/"/g, '&quot;');
}
