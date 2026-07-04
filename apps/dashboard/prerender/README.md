# Prerender pipeline (SEO for the marketing routes)

The dashboard is a client-rendered SPA. Per-page SEO (`<title>`, meta
description, canonical) is applied in the browser by `src/lib/seo.ts`
(`updateSEO`), so the **raw** HTML every route serves is identical. Google
therefore saw the templated pages — `/auglysendur/<borg>`, `/midlar/<borg>`,
`/skilmalar`, `/handbaekur/*`, … — as duplicates of the homepage and left them
_"Discovered – currently not indexed."_

This pipeline gives each of those routes its own static HTML at build time, with
a unique title, description, canonical, and fully-rendered body, so crawlers see
distinct pages. The SPA still boots and takes over on top for real users.

## How it works

Two steps, split so the build needs **no browser**:

1. **`prerender:capture`** (dev-only, needs a browser — _not_ run on Vercel).
   Serves the built `dist/` with SPA fallback, renders every sitemap route in a
   real Chromium via Playwright (so `updateSEO` + the React tree run), and
   records `{ route, title, description, canonical, rootHtml }` into
   [`snapshots.json`](./snapshots.json).

2. **`prerender-apply.mjs`** (runs in the Vercel build, pure Node). Stitches each
   snapshot into the **freshly built** `dist/index.html` and writes
   `dist/<route>/index.html`. Stitching into the fresh template keeps the hashed
   asset `<script>`/`<link>` tags current, so snapshots never go stale against a
   new build. Vercel serves `dist/<route>/index.html` for that exact path
   (filesystem match wins over the SPA rewrite in `vercel.json`).

The route list comes from `public/sitemap.xml`, so the sitemap is the single
source of truth — add a URL there and it gets prerendered. Root `/` is
intentionally excluded (it stays the SPA shell so authenticated app routes keep
their current behavior; the homepage already ships static fallback content).

## When to regenerate

`snapshots.json` is a committed cache of rendered content. **Re-run capture
whenever marketing copy, the affected page components, or the sitemap change:**

```bash
pnpm --filter @ada/dashboard build            # produce dist/
pnpm --filter @ada/dashboard prerender:capture # refresh snapshots.json
```

Then commit the updated `snapshots.json`. If it is missing, the build step logs
a notice and skips prerendering (the build still succeeds; pages just fall back
to the SPA shell).
