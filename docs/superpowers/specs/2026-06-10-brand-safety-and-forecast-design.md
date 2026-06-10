# Creative Brand Safety & Inventory Forecast Fixes — Design

**Date:** 2026-06-10
**Status:** Approved design, pending implementation plan

## Problem

Two gaps from the category-network-buying backlog, investigated 2026-06-10:

**1. Creative-level content blocking is a silent no-op.** The plumbing exists end-to-end
but the two sides speak different vocabularies:

- Publishers block categories from `AD_CATEGORIES` (Icelandic site-content slugs:
  `matur`, `ferdalog`, …) via dashboard Settings / MCP `set_content_policy`. The
  dashboard help text even suggests blocking "gambling", which is not an option.
- Gemini auto-scan classifies creatives into an ad-hoc English list
  (`retail, food, tech, finance, travel, health, entertainment, other`) in
  `apps/api/src/services/auto-scan/gemini.ts`.
- `push-cache.ts` compares them with `blockedCategories.includes(autoScanResult.category)` —
  `"matur" ≠ "food"`, so nothing ever matches. The sensitive categories brand safety is
  actually about (alcohol, gambling, dating, politics, …) exist in neither list.

**2. The inventory forecast slightly under-counts committed demand.**
`getCategoryInventory()` already subtracts committed daily impressions (the original
backlog item was implemented), but:

- A campaign whose flight has not started yet has its daily allowance computed as
  `remainingIsk / daysUntilEnd` measured **from now**, including pre-flight days — so its
  in-flight daily commitment is under-estimated.
- `pending_approval` campaigns are excluded, although they start spending the moment
  they are approved (no wallet reservation happens at creation; spend accrues via cron).
- Nothing in the buy flow reacts when a category is oversold.

## Decisions (confirmed with owner)

1. **Taxonomy:** a new dedicated **sensitive-categories** list, not a reuse of
   `AD_CATEGORIES`. Blocking `matur` ads on a food blog is not the use case; blocking
   alcohol/gambling/dating is.
2. **Multi-flag:** a creative carries 0..n sensitive flags (a crypto-casino ad is both
   `vedmal` and `rafmyntir`), not a single category.
3. **Fail-closed:** if a publisher blocks anything and a creative has no
   `sensitiveCategories` data (old or missing scan), that creative is not served on that
   publisher. Brand safety that fails open is not brand safety.
4. **Oversell handling:** soft warning in the buy flow; no hard rejection. Fix the
   committed math; the mayonnaise maker still gets to buy.

## Part A — Sensitive-category brand safety

### Taxonomy (`packages/shared/src/constants.ts`)

```ts
export const SENSITIVE_AD_CATEGORIES = [
  { slug: 'afengi', label: 'Áfengi' },
  { slug: 'vedmal', label: 'Veðmál & happdrætti' },
  { slug: 'stefnumot', label: 'Stefnumót' },
  { slug: 'rafmyntir', label: 'Rafmyntir & áhættufjárfestingar' },
  { slug: 'megrun_utlit', label: 'Megrun & útlitsaðgerðir' },
  { slug: 'politik', label: 'Stjórnmál' },
  { slug: 'trumal', label: 'Trúmál' },
  { slug: 'tobak_veip', label: 'Tóbak & veip' },
  { slug: 'kynlifstengt', label: 'Kynlífstengt efni' },
] as const;
export const SENSITIVE_AD_CATEGORY_SLUGS = SENSITIVE_AD_CATEGORIES.map((c) => c.slug);
export type SensitiveAdCategory = (typeof SENSITIVE_AD_CATEGORIES)[number]['slug'];
```

Note: alcohol, tobacco, and gambling advertising are also legally restricted in Iceland.
These flags enable future admin enforcement; legal enforcement itself is out of scope here.

### Schema (`packages/shared/src/schemas/advertiser.ts`)

`AutoScanResultSchema` gains
`sensitiveCategories: z.array(z.enum(SENSITIVE_AD_CATEGORY_SLUGS)).optional()`.
The existing free-form `category` string stays as informational metadata.

**Deliberately `.optional()`, not `.default([])`:** absence means "never scanned for
sensitive flags" and must survive schema parsing (Firestore converters parse on read — a
default would silently turn unscanned creatives into "scanned, clean" and defeat
fail-closed). New scans always write a concrete array; `[]` means "scanned, clean".

### Auto-scan (`apps/api/src/services/auto-scan/`)

- `gemini.ts`: prompt and response JSON schema updated so the model returns
  `sensitiveCategories` as an array constrained to the enum slugs (empty array when none
  apply). Parsing validates/filters to known slugs.
- `stub.ts`: returns `sensitiveCategories` consistent with its existing fixtures
  (`[]` for clean creatives; include a sensitive fixture for tests).

### Blocking check (`apps/api/src/lib/push-cache.ts`)

Replace the equality check with:

```ts
const blocked = (publisher.contentPolicy.blockedCategories ?? []).filter((c) =>
  SENSITIVE_AD_CATEGORY_SLUGS.includes(c),
); // stale AD_CATEGORY slugs → no-op
if (blocked.length > 0) {
  const flags = creative.autoScanResult?.sensitiveCategories;
  if (!flags) continue; // fail-closed: unscanned creative on a blocking publisher
  if (flags.some((f) => blocked.includes(f))) continue;
}
```

Filtering stale slugs at read time means no data migration of existing publisher docs:
old `matur`-style values (which never worked) stay silent no-ops and do not trigger
fail-closed.

The `blockedCategories` field already copied into `SlotCacheEntry` keeps carrying the
filtered list.

### Surfaces

- `GET /v1/categories/content` returns `SENSITIVE_AD_CATEGORIES` (slug + label) instead
  of `AD_CATEGORY_SLUGS` (`services/domain-classifier.ts: getAllowedCategories`).
- Dashboard publisher Settings renders labels from the endpoint response and the help
  text names real examples (áfengi, veðmál) instead of "gambling".
- API publisher contentPolicy update route and MCP `set_content_policy` validate
  `blockedCategories ⊆ SENSITIVE_AD_CATEGORY_SLUGS` and the MCP tool description lists
  the valid slugs.

### Backfill

One-off script (`apps/api`, e.g. `pnpm --filter @ada/api rescan-creatives`) that re-runs
auto-scan on creatives missing `sensitiveCategories`. Required because fail-closed would
otherwise blank out every blocking publisher until creatives are re-uploaded.

## Part B — Forecast committed math + soft oversell warning

### Flight-aware daily allowance (`apps/api/src/services/inventory.ts`)

- `daysLeft = max(1, ceil((endsAt − max(now, startsAt)) / 86_400_000))` — a future
  flight's budget is spread over its actual flight days, not pre-flight days.
- Count campaigns with status `active` **or** `pending_approval` (both represent real
  demand; approval can land any moment and spend starts immediately).

### Pacing consistency (`apps/api/src/lib/push-cache.ts`)

Apply the same `max(now, startsAt)` flight-aware formula to the `pace_limit:{id}` seed so
pacing and forecast agree. (Pre-flight campaigns don't serve anyway — `validFrom` gates
them — so this only corrects the allowance visible on the first flight day.)

### Buy-flow warning (`apps/dashboard/src/pages/advertiser/CampaignCreate.tsx`)

Estimated daily impressions = `totalIsk / FLAT_CPM_ISK × 1000 / flightDays`. If that
exceeds `availableDailyImpressions` for any selected category, show an inline warning
(Icelandic copy, e.g. "Herferðin gæti afhent hægar en áætlað — valinn flokkur hefur færri
lausar birtingar en herferðin þarf á dag."). Purely informational; submission proceeds.

## Testing

Emulator tests (`pnpm test:api`):

- **Inventory:** future-flight campaign commits `remaining / flightDays`;
  `pending_approval` counted; `paused`/`completed` not counted.
- **Push-cache blocking:** creative with matching flag excluded; non-matching flag
  served; fail-closed (publisher blocks + creative without `sensitiveCategories` →
  excluded); stale `AD_CATEGORY` slugs in `blockedCategories` ignored (no fail-closed).
- **Auto-scan stub:** returns the new field; schema parse round-trips.

Dashboard warning covered by a component-level test if cheap, otherwise manual check.
Gate: `pnpm verify` + `pnpm test:api`.

## Out of scope

- Legal enforcement of restricted categories (alcohol/tobacco/gambling) at the platform
  level — the flags enable it later.
- Geo targeting, forecast UI changes beyond the warning, NSFW handling (already gated by
  `nsfwScore`), re-scanning creatives that already have `sensitiveCategories`.
