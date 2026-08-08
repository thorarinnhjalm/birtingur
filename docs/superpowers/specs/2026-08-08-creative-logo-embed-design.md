# Advertiser logo in generated creatives

**Date:** 2026-08-08
**Status:** Approved design, pending implementation plan

## Problem

The creative wizard scrapes the advertiser's landing page for copy but the
rendered banners carry only a text brand (`siteName`). Advertisers' real
brand mark — their logo — never makes it into the ad. Fetching it is the
same class of work the pipeline already does (SSRF-guarded scrape, base64
PNG compositing under resvg), so this is a UX/quality feature, not new
infrastructure.

Decisions made during brainstorming:

- **Confirm + override, never silent:** the wizard shows the scraped logo;
  the advertiser uses it, skips it, or uploads their own. No logo ever
  reaches a rendered banner without the advertiser having seen it.
- **Fixed placement per template:** one designed position per template
  (`bold`/`light`) per size class — no user-facing placement controls.
- **Manifest-scoped storage** (not advertiser-profile): the logo lives on
  the `generated_previews` manifest like the other wizard artifacts.
  Promoting it to a reusable advertiser-profile asset is an explicit
  possible follow-up, not blocked by this design.

## Part 1 — Acquisition (extend the existing scrape)

`extractSiteContext` (already SSRF-guarded, already invoked by
`POST /v1/creatives/generate/copy`) additionally collects logo candidates
from the fetched HTML, in priority order:

1. `<link rel="apple-touch-icon">` (any `sizes`; prefer largest) — usually
   a clean 180px mark.
2. `<img>` whose `src`, `alt`, or `class` contains `logo`
   (case-insensitive) — first match in document order.
3. `<link rel="icon">` — prefer the largest declared `sizes`.

`og:image` is deliberately excluded: it is almost always a photo, not a
logo.

The top candidate URL is resolved against the page origin and fetched
through the same SSRF guard with hard limits: `Content-Type` must be
`image/*`, response capped at 1 MB, same timeout policy as the page fetch.
Failures (no candidate, fetch error, wrong type, oversize) degrade to
`logo: null` — never an error surfaced to the wizard.

Normalization: SVG sources are rasterized to PNG via `@resvg/resvg-js`
(already a dependency) at 512px on the long edge; raster sources are kept
as-is (resvg composites and scales at render time, no resize dependency
needed). The result is uploaded to Firebase Storage alongside the wizard's
preview images, and the manifest gains:

```
logo: {
  url: string,          // public URL used by wizard UI and render step
  storagePath: string,
  source: 'scraped' | 'uploaded',
} | null
```

No Gemini involvement — the key-less fallback path gains the feature too.

## Part 2 — Wizard step (confirm / skip / upload)

- The copy response (`POST /generate/copy`) now includes the manifest's
  `logo` so the UI can show it immediately.
- New endpoint `POST /v1/creatives/generate/logo` (advertiser-scoped, same
  auth pattern as the sibling generate endpoints): accepts an uploaded
  image as a base64 JSON body, applies the same type/size caps and SVG
  rasterization, replaces the manifest's `logo` with `source: 'uploaded'`.
  `DELETE /v1/creatives/generate/logo` clears it — that is the "skip"
  action.
- Wizard UI (the "Útlit" step, before render): shows the current logo with
  three actions — nota (default when one was found), sleppa, hlaða upp
  eigin. If nothing was found, only the upload affordance shows. Icelandic
  copy throughout.
- Render (`POST /generate/render`) reads the manifest's `logo` at render
  time: present → composite; null → banner renders exactly as today.

Rate limiting: logo upload shares the existing `gen-copy`/`gen-render`
bucket pattern with its own small bucket (`gen-logo`, 20/day) — same
fail-closed-when-Redis-configured semantics as the siblings.

## Part 3 — Compositing (templates)

`renderBannerSvg` gains optional `logoPng?: Buffer | string | null`
(same Buffer-or-base64 contract as `backgroundPng`). When present:

- One fixed, designed position per template per size class (leaderboard /
  rectangle / skyscraper), consistent with the Nordic-editorial layout.
  The logo renders on a small white chip (rounded rect, subtle border)
  so contrast never depends on the logo's own colors — same philosophy as
  the existing scrim guaranteeing text contrast on `bold` backgrounds.
- The logo scales to fit a fixed box (height-driven, width capped,
  `preserveAspectRatio="xMidYMid meet"`); extreme aspect ratios therefore
  cannot break the layout.
- The text `siteName` remains — the logo is an addition, not a
  replacement.

`renderCreativeVariant` fetches the logo bytes once per variant render
(from Storage via the manifest's `storagePath`), base64-encodes once, and
reuses across all requested sizes — mirroring the background-image
optimization already in place.

## Error handling

- Acquisition is best-effort end to end; every failure mode lands on
  `logo: null` and the wizard's upload affordance.
- Upload endpoint rejects non-images, oversize payloads, and undecodable
  SVGs with the standard 400 envelope.
- Render with a Storage fetch failure for the logo: render proceeds
  without the logo and marks nothing — a missing logo is never worth a
  failed render. (Log a warning; do not swallow silently.)

## Testing

- Unit: candidate extraction priority (apple-touch-icon beats img-logo
  beats icon; og:image never picked), relative URL resolution, SSRF guard
  invoked for the logo fetch (mock), size/type caps, SVG→PNG
  normalization.
- Route: upload endpoint happy path + caps + clears; copy response carries
  `logo`.
- Template: snapshot-free assertions that the SVG contains the logo image
  element with the chip when `logoPng` is set, and does not when null.
- The confirm flow's creative output goes through the existing
  `createCreative`/auto-scan path unchanged — no new review-surface tests
  needed.

## Rollout

- Additive manifest field; old manifests read as `logo: null`. No
  migration.
- Single branch/PR (`feat/creative-logo-embed`), normal oruggt-ship flow.
