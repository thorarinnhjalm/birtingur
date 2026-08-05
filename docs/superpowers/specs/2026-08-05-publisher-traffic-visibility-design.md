# Publisher traffic visibility — design

Date: 2026-08-05
Status: approved direction ("Leið A"), pending spec review

## Background

Serving fires a signed impression pixel even when no campaign fills a slot
(both `house_ad` and `transparent` fallbacks, `apps/serving/src/routes/ad.ts`).
Those events are logged as `type=pageview` under `cmp_fallback`
(`apps/serving/src/routes/impression.ts`) and aggregated into per-slot and
per-publisher stats (`slot-stats.ts`, `publisher-stats.ts`) as `pageviews`.
So the platform already measures a publisher's slot traffic independently of
ad fills — but the dashboard under-displays it. A publisher whose slots get
traffic but few fills can conclude the integration is dead when it is not.

This is slot-level traffic measurement (pages that embed the snippet, pixel
fires after the IAB viewability delay, blockable by ad blockers). It is NOT
full web analytics — no sessions, referrers, or unique-visitor counts — and
must not be marketed as a Google Analytics replacement (claims guardrail).

## Current state (audited 2026-08-05)

Good today:

- Publisher dashboard (`pages/publisher/Dashboard.tsx`): "Vefumferð" total
  StatCard, "Fyllihlutfall" (impressions/pageviews) StatCard, and an amber
  "Engin virkni greind" badge on active slots with zero pageviews.
- Slot detail (`pages/publisher/SlotDetail.tsx`): integration status card
  driven by pageviews (warning when 0, green confirmation otherwise).
- The APIs already return `pageviews` everywhere: `/v1/publishers/stats`,
  `/v1/publishers/me/stats` (used by the MCP `get-stats` tool) and
  `/v1/widgets/publisher/stats` (used by the embeddable widget).

Gaps (all presentation-only; no backend work needed):

1. `SlotDetail.tsx` history card is gated on `impressions === 0` and plots
   only earnings — a slot with traffic but no fills shows "Engin gögn enn".
   Its stat tiles show impressions/clicks/earnings but not traffic or fill
   rate. This is the worst gap: it hides traffic exactly in the no-fill case.
2. `AnalyticsChart.tsx` (publisher dashboard): pageviews exist in the data
   but are not a selectable metric, so there is no traffic trend view.
3. Embeddable stats widget (`packages/widgets/src/components/stats.ts`):
   receives `pageviews` from the API but never renders it.
4. Terminology drift: "Vefumferð" (dashboard), "flettingar" (landing page),
   "beiðnir (pageviews)" (slot detail copy).

## Design (Leið A — presentation only, one PR)

No API, serving, or schema changes. All four changes consume fields already
present in the API responses.

### 1. AnalyticsChart: traffic as a fifth metric (publisher mode only)

- Extend the metric union with `'pageviews'`; render its selector tab only
  when `mode === 'publisher'` (advertiser data has no pageviews).
- Tab label and metric label: "Vefumferð". Color: sky-500 `#0ea5e9`
  (distinct from impressions' blue-600). Formatter: `toLocaleString('is-IS')`,
  Y-axis abbreviated like impressions (`1k`-style).
- Default selected metric stays `impressions`. Advertiser mode is unchanged.

### 2. SlotDetail: traffic tiles + history that works without fills

- Add two stat tiles to the existing row, same icon-chip Card style as the
  current three (Birtingar/Smellir/Áætlaðar tekjur): "Vefumferð" (pageviews,
  locale-formatted) and "Fyllihlutfall" (`round(impressions / pageviews *
100)`, "0%" when pageviews is 0). The wrapper grid goes from
  `grid-cols-1 md:grid-cols-3` to `grid-cols-1 md:grid-cols-3 lg:grid-cols-5`
  so five tiles sit in one row on wide screens and wrap 3+2 on medium.
- History card: rename title to "Saga (síðustu 30 dagar)". Add a two-tab
  toggle in the same pill style as AnalyticsChart's selector: "Áætlaðar
  tekjur" (default, current behavior: `spendIsk * 0.8`, blue) and
  "Vefumferð" (pageviews, sky-500).
- Empty-state gate changes from `impressions === 0` to
  `impressions === 0 && pageviews === 0`, so a traffic-only slot shows its
  traffic history instead of "Engin gögn enn".

### 3. Embeddable stats widget: render traffic

- `packages/widgets/src/components/stats.ts`: add `pageviews` to the local
  stats type and render a fourth metric tile "Vefumferð" alongside
  Birtingar / Smellir / eCPM (formatted with the widget's existing
  `formatNum`). Missing/undefined `pageviews` in an old cached API response
  renders as 0 (`?? 0`), never NaN. The sparkline stays impressions-based.
- Widgets are esbuild-built and copied into `apps/serving` public assets at
  build time; verify `pnpm --filter @ada/widgets build` (and the serving
  build) still passes. No size budget applies to widgets (only the snippet).

### 4. Terminology

- Standardize on "Vefumferð" as the label everywhere a number is shown, with
  "(flettingar)" as a parenthetical only in explanatory copy.
- `SlotDetail.tsx` integration copy: "beiðnir (pageviews)" becomes
  "vefumferð (flettingar)".
- The landing-page revenue slider keeps "flettingar" (it reads naturally in
  running copy and is not a stats label).

## Error handling

All four surfaces already handle missing stats (`stats ? ... : '0'` /
empty-state branches); the new tiles and metrics follow the same pattern.
Division for fill rate guards against `pageviews === 0`.

## Testing

Presentation-only change: rely on `pnpm --filter @ada/dashboard test`
(existing suite), typecheck, lint, widget + dashboard builds, and manual
verification on the Vercel preview (acceptance criteria below). No new UI
tests — per the ship process, simple visual changes are owner-verified on
preview rather than covered by new component tests.

## Acceptance criteria (owner-verifiable on preview)

1. On the publisher dashboard chart, a "Vefumferð" tab shows the traffic
   trend for 7/30 days.
2. On a slot page for a slot with traffic but no filled ads, the history
   card shows the traffic curve (not "Engin gögn enn"), and the tile row
   shows Vefumferð and Fyllihlutfall.
3. The embeddable publisher stats widget shows a Vefumferð figure.
4. Advertiser-side charts are unchanged.

## Out of scope (possible follow-ups)

- "First traffic detected" notification and any digest email (Leið B).
- Per-slot traffic breakdowns beyond what slot-stats already returns.
- Any marketing copy claiming analytics capabilities.
