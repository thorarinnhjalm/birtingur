# Creative Wizard: Reordered Buy Flow + Stepped Banner Generation — Implementation Plan

> **Status: APPROVED (2026-07-27).** Þórarinn's decision: reorder the campaign flow so category targeting precedes creative work, and turn banner generation into a guided, self-explaining wizard. Supersedes the step order in the 2026-07-03 redesign templates for the campaign-create screen (deliberate; keep the editorial visual language and approved copy style).

**Rationale:** For Birtingur's target user, a guided wizard is _support, not friction_ — each step teaches while it executes. The step that makes this uniquely Birtingur: the system already knows which sizes a campaign needs (slot sizes × impression forecast of the chosen categories), so size selection becomes information, not a decision. That requires categories to be chosen BEFORE creative work — hence the reorder.

## New campaign-create flow (`apps/dashboard/src/pages/advertiser/CampaignCreate.tsx`)

1. **Grunnur** — name, schedule (unchanged fields, minus budget slider if it currently lives here).
2. **Kaup** (moved up from step 3) — categories, geo, budget, inventory forecast. Existing hooks/mutations preserved verbatim; only position changes.
3. **Efni** — the wizard, four sub-steps with a one-sentence explainer each:
   a. **Stærðir (read-only insight):** "Flokkarnir þínir birtast á þessum stærðum" — per-size slot count + share of forecast impressions, from the new sizes endpoint. No user decision.
   b. **Texti (the heart):** paste landing URL → 2–3 copy suggestions as TEXT CARDS (no rendering yet, ~seconds). User picks one and MAY EDIT headline/subline/CTA inline (schema length limits enforced client- and server-side).
   c. **Útlit:** template choice (bold/light) + render — only the chosen copy, only the needed sizes, background generated once.
   d. **Yfirferð:** per-size previews, regenerate-single-size button, responsibility confirmation (existing copy), save → creatives created via the normal confirm/auto-scan path, selected creative handed to submission.
   The existing manual-upload path remains as a visible alternative ("Ég er með borða") at step 3 entry.
4. **Staðfesta** — summary + submit (existing `useCreateCampaign` mutation unchanged).

`apps/dashboard/src/components/CreativeGenerator.tsx` is reworked into the wizard component, shared with `CreativeLibrary.tsx` (standalone mode: no category context → size step shows all IAB sizes with a note, or optional category picker).

## API changes (`apps/api`)

- **`GET /v1/categories/sizes?categories=a,b`** (new, advertiser auth): per-size `{ width, height, slotCount, forecastShare }` across active slots in the given categories — extends the existing inventory service; read-only.
- **Split generation** (replaces the one-shot `/v1/creatives/generate` — internal-only API, no external consumers, ak\_ keys already blocked):
  - `POST /v1/creatives/generate/copy` `{ landingUrl, variants? }` → SSRF-guarded extract + Gemini copy variants (text only). Manifest stores extract context + copy variants.
  - `POST /v1/creatives/generate/render` `{ variantId, editedCopy?, sizes[], templateId }` → validates `editedCopy` against `GeneratedCopyVariantSchema` limits, renders ONLY requested sizes (must be subset of IAB list), background once, uploads, updates manifest.
  - `POST /v1/creatives/generate/confirm` — unchanged contract (manifest-validated URLs, `manifest.landingUrl` as clickUrl).
- **Rate limits** (`lib/rate-limit.ts`): separate buckets — copy 20/day, render 10/day per advertiser; both fail-closed, same Redis pattern.
- Edited copy is user content: it bypasses the Gemini claims-guardrail by definition — the responsibility confirmation + auto-scan at confirm remain the (already-designed) backstop. Note this in code.

## Execution

Same loop as the two shipped features: Fable writes task descriptions → Sonnet implements (API first, then dashboard, sequential — shared emulator port) → Opus adversarially reviews (focus: manifest/edited-copy validation, rate-limit split, reordered-flow state bugs, sizes-endpoint auth) → findings loop through Fable until clean → commit, push, prod smoke.

**Gates per task:** full API emulator suite, dashboard typecheck/lint/test/build, `pnpm verify`. The 320x100 collision fix (in flight separately) must be merged first — the wizard renders through the same templates.

## Out of scope

No changes to money flow, MCP tools, or the approved marketing pages; no A/B of copy variants (bandit idea stays parked); no per-size custom copy (one copy set across sizes in v1).
