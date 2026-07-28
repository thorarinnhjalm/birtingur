# AI Creative Assistance — Implementation Plan

> **Status: PARKED.** Trigger: evidence of small advertisers dropping out of the buy flow for lack of banners (funnel data or direct feedback). Do not start before the trigger fires. Pre-written 2026-07-27.

**Goal:** An advertiser with no designer pastes their landing-page URL and gets ready-to-use banner creatives in the standard sizes, generated server-side and flowing through the normal creative-review pipeline. This attacks Birtingur's core segment (long-tail creators/small businesses) at the exact point they stall today: `CreativeSchema` requires a hosted `imageUrl`, which assumes you already have a banner.

## Design summary — text-first template banners (v1)

No image-model generation in v1. The pipeline is deterministic rendering with AI-written copy:

1. **Extract:** server fetches the advertiser's landing page (their own URL, SSRF-guarded: https only, public DNS, no redirects to private ranges), pulls title/meta description/og-image/dominant colors.
2. **Write:** Gemini (same structured-output pattern as `services/ai-advisor.ts`, `gemini-2.5-flash` with `responseSchema`) produces N copy variants in Icelandic: `{ headline ≤ 30 chars, subline ≤ 60, cta ≤ 15, paletteChoice }`. Without `GEMINI_API_KEY`: rule-based fallback (site title as headline, generic CTA "Sjá nánar") — same graceful-degradation contract as ai-advisor.
3. **Render:** 2–3 hand-designed SVG banner templates (Nordic-editorial: Inter, flat color blocks, no stock imagery) parameterized by copy + palette, instantiated per IAB size from `@ada/shared` constants, rasterized to PNG server-side (`sharp`, which bundles librsvg — verify it fits Vercel function size limits; if not, render at 2× and serve SVG directly since creatives are `imageUrl`-based and slots render `<img>`).
4. **Store + review:** upload PNGs to Firebase Storage (emulator already runs storage:9199), create `Creative` drafts with the resulting URLs; they enter the existing `reviewStatus` flow (auto-scan etc.) like any hand-uploaded creative — generated ≠ pre-approved.

## Global constraints

- **Marketing-claims guardrail applies to generated copy:** the Gemini prompt must forbid factual claims about the advertiser's product beyond what the landing page states, and forbid claims about Birtingur entirely. Copy is suggestions the advertiser confirms — the UI must show a "þú berð ábyrgð á innihaldinu" confirmation before saving.
- Icelandic copy everywhere; ISK integers; ESM `.js` imports.
- Zero impact on the serving hot path and the snippet size budget (this is all control-plane).
- Per-task gate: `pnpm --filter @ada/api test` (emulator) + dashboard typecheck/lint; `pnpm --filter @ada/dashboard build` at the end.

### Task 1: Extraction + copy service

- [ ] `apps/api/src/services/ai-creative.ts`: `extractSiteContext(url)` (fetch with timeout, SSRF guard, cheerio-or-regex title/meta/og extraction, dominant-color from og-image optional) and `generateBannerCopy(ctx, n)` (Gemini structured output + rule-based fallback, mirroring ai-advisor's shape).
- [ ] Unit tests with fixture HTML; fallback path tested without `GEMINI_API_KEY`; SSRF guard tests (localhost/private-IP/redirect rejection).

### Task 2: SVG templates + renderer

- [ ] `apps/api/src/services/banner-templates.ts`: 2–3 templates × the IAB sizes from `@ada/shared` (pure functions `(copy, palette, size) => svgString`), designed with the editorial tokens (navy `#1e3a8a` family, Inter).
- [ ] Renderer: SVG → PNG via `sharp`; decide SVG-direct vs PNG after measuring cold-start/function-size impact on Vercel (document the decision in the code).
- [ ] Snapshot tests: stable SVG output for fixed inputs; dimension assertions per size.

### Task 3: Generation endpoint + storage

- [ ] `POST /v1/creatives/generate` (advertiser auth): body `{ landingUrl, variants?: number }` → runs the pipeline, uploads to Firebase Storage under `creatives/{advertiserId}/generated/…`, returns draft previews (image URLs + copy) WITHOUT creating Creative docs yet.
- [ ] `POST /v1/creatives/generate/confirm`: advertiser picks variants → creates `Creative` docs (normal `reviewStatus` flow) pointing at the stored images.
- [ ] Rate limit per advertiser (Redis, e.g. 10 generations/day) — Gemini and fetch cost control.
- [ ] Emulator tests: full pipeline with stubbed Gemini (stub.ts pattern like teya/auto-scan), storage writes, confirm-creates-creatives, rate limit.

### Task 4: Buy-flow integration (dashboard)

- [ ] In the campaign-create flow, an "Á ég enga borða?" branch: URL input → generated previews grid (all sizes per variant) → select → responsibility confirmation → creatives saved and selected for the campaign. Editorial primitives (`NumberedSection`, `PillButton`), Icelandic copy, TanStack Query mutations; no changes to existing data plumbing elsewhere.
- [ ] Empty-state entry point on the creative-library page too.
- [ ] Playwright happy-path if the e2e harness reaches it cheaply; otherwise component tests.

### Task 5: Docs + review

- [ ] CLAUDE.md: add ai-creative to the cross-cutting services list (one line, incl. stub/fallback behavior).
- [ ] Adversarial review (Opus) focused on: SSRF surface, prompt-injection from hostile landing-page content into generated copy, storage-path authorization, rate-limit bypass.

## Explicit non-goals (v1)

Image-model banner generation, animation/HTML5 creatives, A/B rotation of generated variants (separate bandit idea), auto-regeneration on landing-page change, and any English copy. Revisit only with real usage data.
