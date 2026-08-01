# SEO + GEO Revision — Birtingur (birtingur.app)

_Data window: 4 June – 29 July 2026 (GSC, pasted) · Generated: 2026-08-01_

## 1. Current state

**Architecture & rendering.** React 19 + Vite SPA, but every route in `public/sitemap.xml` (53 routes) is prerendered to static HTML at build time via the committed `prerender/snapshots.json` pipeline — so crawlers (including non-JS AI crawlers) get full HTML. `robots.txt` allows crawling on the dashboard domain only; `llms.txt` exists; per-route titles/descriptions are set by `updateSEO()` in each page component; some pages carry JSON-LD (`FAQPage`, `SoftwareApplication` on /en). A marketing-claims lint (`check-marketing-claims.mjs`) gates all public copy. Icelandic is the default locale; the /en cluster (12 pages) launched 31 July. There is an Icelandic guide section at `/handbaekur` (4 articles in `src/lib/blog-data.ts`, rendered by `BlogOverview.tsx`/`BlogPost.tsx`).

**GSC headline.** 0 clicks, ~280 impressions, 13 queries, all positions ≥7. The site is _indexed and ranking_ for its core commercial terms but earns zero clicks — partly position (most terms page 2+), partly snippet appeal at the positions it does hold. The /en cluster and most recent content are too new to show in this window.

**Branded vs non-branded.** Branded: `birtingur` (46 impr, pos 7.4 — should be pos 1 for a brand; young domain, will settle), `birtingahúsið ehf` (2 — a _different company_; navigational noise, do not chase). Non-branded is the real story: `birtingar`, `birtingaþjónusta`, `auglýsingar á netinu`, `selja auglýsingar á netinu`, `vefborðar`, `fastcpm`.

**Noise queries** (ignore): `lønarflytingar`, `breytingastjórnun`, `auglýsingar á google` (wrong intent), `ókeypis auglýsingar á netinu` (classified-ads intent at pos 85 — mismatched; not worth a page that would fight our paid positioning).

## 2. Keyword landscape

Thresholds used: site is tiny, so "high impressions" = ≥40, striking distance = pos 5–20 with ≥5 impressions.

| Cluster                             | Intent                   | Queries (impr · pos)                                | Current URL                                                      | Status                                            |
| ----------------------------------- | ------------------------ | --------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------- |
| Birtingaþjónusta / birtingahús      | Commercial               | birtingaþjónusta (66 · 8.8), birtingahús (8 · 35.4) | `/` + `/handbaekur/sjalfvirk-kerfi-vs-birtingahus`               | Striking distance — strengthen                    |
| Birtingar / CPM / verð              | Informational            | birtingar (126 · 17.9), fastcpm (2 · 10.0)          | none dedicated                                                   | **Gap — new guide**                               |
| Auglýsingar á netinu                | Commercial-informational | auglýsingar á netinu (11 · 53.9)                    | `/`, `/auglysendur`, `/handbaekur/vefauglysingar-island-handbok` | Page 5+ — deepen + interlink                      |
| Selja auglýsingar / auglýsingapláss | Commercial (publisher)   | selja auglýsingar á netinu (6 · 19.5)               | `/midlar`                                                        | Striking distance — title tweak                   |
| Vefborðar / borðagerð               | Informational            | vefborðar (2 · 56.5)                                | none                                                             | **Gap — new guide** (ties to AI banner maker USP) |
| Brand                               | Navigational             | birtingur (46 · 7.4)                                | `/`                                                              | Settles with age + entity work                    |

## 3. Opportunities

**Striking distance (do first).**

- `birtingaþjónusta` — pos 8.8, 66 impr, 0 clicks (expected CTR at pos 8–9 is 2–5%). Homepage title contains the word but buried mid-title. Front-load it and add the concrete hook (fast 550 kr. CPM, engin uppboð).
- `birtingar` — 126 impr (the site's biggest query) at pos 17.9. Ambiguous term (the metric "birtingar" + our brand-adjacent plural). An answer-first guide "Hvað eru birtingar?" targets the informational intent directly and internal-links the commercial pages. Also catches `fastcpm` (pos 10).
- `selja auglýsingar á netinu` — pos 19.5. `/midlar` title says "Selja auglýsingar á vefsíðu"; add the "á netinu" phrasing.

**CTR wins.** Every ranked query has 0% CTR. Titles are functional but generic; none carry the price (550 kr. CPM), the "engin uppboð" differentiator, or a call to action. Rewrite `/`, `/auglysendur`, `/midlar` titles + descriptions.

**Content gaps (new Icelandic guides in `/handbaekur`).**

- "Hvað eru birtingar? CPM, birtingaspá og verð vefauglýsinga" — targets `birtingar` + `fastcpm` + long-tail (hvað kostar að auglýsa á netinu).
- "Vefborðar: stærðir, hönnun og sjálfvirk borðagerð" — targets `vefborðar` + IAB-stærðir long-tail; showcases the built-in AI banner maker (verified feature).

**Cannibalization risk.** `/`, `/auglysendur` and the handbook article all mention "auglýsingar á netinu". Differentiate: `/` owns "birtingaþjónusta", `/auglysendur` owns "auglýsa á netinu" (commercial), the handbook owns the informational long-tail. Keep internal links pointing accordingly.

## 4. Architecture recommendations

**SEO.** Rendering is already solved (prerender pipeline) — the discipline is _recapturing snapshots after every copy change_ (enforced by the staleness guard). Add new guide slugs to `sitemap.xml` in the same change. Region pages (26 of them) are thin-content risk long-term; watch for them soaking up crawl without impressions.

**GEO.** Snapshots make content visible to AI crawlers; `llms.txt` exists but lists only English guides — add the Icelandic handbækur. Add `Article` JSON-LD to `BlogPost.tsx` (one component, covers all guides) and visible dates. New guides must be answer-first with quotable specifics (550 kr. CPM, 80/20 skipting, 5.000 kr. lágmarksútborgun — all on the verified USP list, and the claims-lint enforces this).

## 5. Measurement

Watch in GSC over the next 4–6 weeks: `birtingaþjónusta` CTR (>0, target 2%+) and position (<8.8→top 5); `birtingar` position (17.9 → page 1) once the guide indexes; `vefborðar` position (56 → <20); `selja auglýsingar á netinu` (19.5 → page 1); impressions on the two new guide URLs.
