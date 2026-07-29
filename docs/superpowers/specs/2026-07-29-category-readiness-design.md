# Category Sellability Readiness — Design

**Status:** approved 2026-07-29, ready for an implementation plan.

## Problem

Birtingur is in its supply-gathering phase: advertiser registration is closed
(`RoleSelect.tsx` `REGISTRATION_CLOSED = true`) and publishers are still being
onboarded. The decision that gates everything else — _when is it safe to open for
advertisers, and for which categories?_ — has no answer in the product. Nobody can
see whether a category has enough inventory to sell.

Two facts make guessing dangerous:

1. **Category buying only works if the category has depth.** An advertiser buys
   "matur" + a budget; the impressions spread across every food site. With three
   food blogs the forecast returns numbers so small that no one buys, and the
   first advertiser experience is a failure.
2. **"Registered" is not "live".** A publisher can be `status: 'active'` and never
   embed the snippet. Nothing currently distinguishes the two, so a category can
   look populated while serving nothing.

## What "sellable" means

Owner's call (2026-07-29): a category is sellable when it can deliver a **typical
campaign within a month**.

- Typical campaign: `REFERENCE_CAMPAIGN_ISK` = 50.000 kr (the canonical
  mayonnaise-maker story the product is designed around).
- At `FLAT_CPM_ISK` (550) that is `round(50000 / 550 * 1000)` = **90.909
  impressions**.
- Target window: `TARGET_DELIVERY_DAYS` = 30 → roughly **3.030 available
  impressions per day**.

Both numbers are constants in `@ada/shared`, never hardcoded in the UI — same rule
that already governs 550, 80/20, 5.000 and 24%.

The verdict uses **available** daily impressions (already net of impressions
committed to running campaigns), not gross. Inventory promised to an existing
campaign cannot be sold twice.

## Scope

**In:** an admin-only readiness overview — one row per category, with the numbers
behind the verdict.

**Out (deliberately):** notifications when a category crosses the threshold. The
threshold is a guess until the numbers have been watched move for a few weeks; an
alert built on a wrong threshold becomes noise that gets switched off. The
computation is factored so this is a thin addition later.

**Out:** the publisher-facing "here's what you would have earned" view. It is the
other half of the same chicken-and-egg problem and shares this data, but it is a
separate surface with its own design.

## Data

Per category, all derived from the last 7 days of publisher stats:

| Field                       | Meaning                                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `category`                  | slug from `AD_CATEGORIES`                                                                                                 |
| `declaredPublishers`        | active publishers whose `categories` include this slug                                                                    |
| `livePublishers`            | of those, how many had ≥1 impression in the window — the "registered vs actually serving" split that does not exist today |
| `availableDailyImpressions` | from the existing `getCategoryInventory` (gross minus committed)                                                          |
| `daysToDeliver`             | `ceil(REFERENCE_IMPRESSIONS / availableDailyImpressions)`, or `null` when available is 0                                  |
| `sellable`                  | `daysToDeliver !== null && daysToDeliver <= TARGET_DELIVERY_DAYS`                                                         |
| `topPublisherShare`         | largest single publisher's share (0..1) of the category's impressions, `null` when there are none                         |

`topPublisherShare` is **information, not a gate**. A category carried by one blog
satisfies the delivery test but collapses if that blog leaves, and the owner should
see that before selling it. Making it a condition was considered and rejected — it
would block categories that are genuinely sellable today.

## Architecture

**Pure verdict function in `@ada/shared`.** `assessCategoryReadiness({ availableDailyImpressions })`
returns `{ daysToDeliver, sellable }`. Pure arithmetic, so it is unit-tested with
plain vitest and needs no Firestore emulator.

**One Firestore pass, not two.** `getCategoryInventory` already walks every active
publisher and reads 7 daily stat docs each. Readiness needs per-publisher totals
anyway (for `livePublishers` and `topPublisherShare`), so the existing loop is
extracted into an internal `collectPublisherCategoryTotals()` that both functions
consume. **`getCategoryInventory`'s exported signature and behaviour must not
change** — the buy flow and the creative wizard depend on it.

**Admin-only endpoint.** `GET /v1/admin/categories/readiness`, mounted under
`apps/api/src/routes/admin/` behind the existing `requireAuth, requireAdmin` pair
that `entities.ts`, `review.ts` and `payouts.ts` already use.

This must **not** be added to `GET /v1/categories/inventory`. That route is
reachable by any authenticated ID-token user, and publisher counts are on the
project's banned-claims list — they must not leak into anything that could reach
marketing copy.

**UI:** a new section on the existing admin page (`apps/dashboard/src/pages/admin/Overview.tsx`)
or a sibling page beside it, following the Nordic-editorial primitives in
`components/ui/editorial.tsx`. One row per category, sorted with sellable
categories first, then by `daysToDeliver` ascending. Show the verdict as a plain
badge and always show the numbers beside it — the point is to build the owner's
judgement about the threshold, not to hide it behind a yes/no.

## Edge cases

- **No stats at all** (fresh install, or before any impression is served): every
  category returns zeros, `daysToDeliver: null`, `sellable: false`. Must not divide
  by zero and must not emit `Infinity`, which is not valid JSON.
- **Category with no publishers:** still present in the response with zeros, so the
  owner sees which categories have nothing rather than a short list with silent
  gaps.
- **A category not in `AD_CATEGORIES`** appearing on an old publisher document is
  ignored; the response is keyed off the canonical taxonomy.
- **Publisher active but never served:** counts in `declaredPublishers`, not in
  `livePublishers`. This is the headline distinction, not an edge case.

## Testing

- `packages/shared`: unit tests for `assessCategoryReadiness` — zero available
  impressions, exactly at the threshold, one under, one over.
- `apps/api` (emulator): seed publishers and stats; assert `declaredPublishers` vs
  `livePublishers` diverge for a publisher with no impressions, assert
  `topPublisherShare`, assert the endpoint 403s for a non-admin token.
- Assert `getCategoryInventory` returns the same values before and after the
  refactor — that is the regression that would hurt, because it feeds the live buy
  flow.
