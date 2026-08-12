import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
// @ts-expect-error - plain .mjs build script, intentionally untyped
import { readRoutes } from '../scripts/prerender-lib.mjs';

/**
 * The sitemap is the route source of truth for prerendering: capture renders
 * every sitemap route into prerender/snapshots.json, and the Vercel build
 * stitches those into static HTML for crawlers. Nothing failed when the two
 * drifted apart — a route added to the sitemap without a captured snapshot
 * shipped as the empty SPA shell to crawlers, and a snapshot whose route left
 * the sitemap sat as dead weight nobody re-captured. Both directions are
 * silent SEO damage, which on this project is a shipped product (the /en
 * push).
 *
 * The sitemap side comes through `readRoutes()` — the same function capture
 * itself uses — so its one deliberate exclusion (root `/` maps to
 * dist/index.html and is never snapshotted) can't drift between the pipeline
 * and this test.
 *
 * Fails ⇒ run `pnpm --filter @ada/dashboard build` then `prerender:capture`
 * and commit the updated snapshots.json (see prerender/README.md).
 */
describe('sitemap.xml ↔ prerender/snapshots.json parity', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const sitemapRoutes: string[] = readRoutes();
  const snapshots: Array<{ route: string }> = JSON.parse(
    readFileSync(resolve(here, '../prerender/snapshots.json'), 'utf8'),
  );
  const snapshotRoutes = snapshots.map((s) => s.route);

  it('the sitemap parses to a non-trivial route list', () => {
    // Guards the guard: if readRoutes' <loc> parsing ever stops matching the
    // sitemap's formatting, this fails loudly instead of the parity checks
    // passing on two empty lists.
    expect(sitemapRoutes.length).toBeGreaterThan(5);
    expect(sitemapRoutes).toContain('/en');
    expect(sitemapRoutes).not.toContain('/'); // root is deliberately excluded
  });

  it('every sitemap route has a captured snapshot', () => {
    const missing = sitemapRoutes.filter((r) => !snapshotRoutes.includes(r));
    expect(missing).toEqual([]);
  });

  it('every snapshot corresponds to a sitemap route', () => {
    const orphaned = snapshotRoutes.filter((r) => !sitemapRoutes.includes(r));
    expect(orphaned).toEqual([]);
  });

  it('no route is snapshotted twice', () => {
    const dupes = snapshotRoutes.filter((r, i) => snapshotRoutes.indexOf(r) !== i);
    expect(dupes).toEqual([]);
  });
});
