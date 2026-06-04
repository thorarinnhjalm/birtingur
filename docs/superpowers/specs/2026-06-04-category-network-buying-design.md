# Category Network Buying — Design

**Date:** 2026-06-04
**Status:** Approved design, pending implementation plan

## Problem & vision

Birtingur's target publisher is the **long-tail niche creator** (e.g. a food blogger
with a loyal but small audience who wants "smá auka pening í vasann") — explicitly
**not** premium publishers like mbl.is / Vísir.is.

Canonical user story: **a mayonnaise maker says "I want ads in the `matur` (food)
category for 50.000 kr"; the platform distributes the impressions across all
food-category sites automatically.** The advertiser buys **category + budget**, never
individual slots.

The system as built does the opposite: campaigns must target explicit `slotIds`,
discovery is by size/price/domain only, category is never persisted, and every
campaign needs manual per-publisher approval. This makes single-creator inventory
unsellable and contradicts the vision. Several billing bugs also mean the platform
does not charge the price it advertises.

## Scope

In scope: category taxonomy, category-based targeting, serving/cache resolution by
category, billing correctness (rounding, flat-CPM lock, budget-cap enforcement,
replay protection), per-category inventory forecast in the buy flow, and
auto-opt-in approval with an optional per-publisher review valve.

Out of scope (see Backlog): geo/region targeting, budget pacing, committed-budget
subtraction in the forecast, and creative content-category blocking.

## Decisions (all confirmed with owner)

1. **Taxonomy:** a new, finer-grained ad-category set (not the 6 coarse classifier
   buckets, not free tags).
2. **Category lives on the publisher** (1..n categories), not the slot. Slots inherit.
3. **Classifier suggests, publisher confirms.** The onboarding scan only pre-fills a
   guess; the publisher selects/edits actual categories and can change them in Settings.
4. **Targeting = categories only** (geo on backlog).
5. **Distribution:** burn budget as fast as traffic allows in v1, with an enforced
   budget cap (pacing on backlog).
6. **Show per-category daily-impression forecast in the buy flow.**
7. **Flat CPM locked server-side** to `FLAT_CPM_ISK`; publisher CPM price-setting removed.
8. **Approval:** auto-opt-in; platform creative review stays; optional per-publisher
   `requireManualApproval` valve.
9. **Core serving mechanism = Approach A** (resolve category→campaigns at cache-build
   time in push-cache; hot path unchanged).

## 1. Data model — categories

New constant `AD_CATEGORIES` in `packages/shared/src/constants.ts` — ad-friendly slugs
with Icelandic labels. Starting set (~12):

`matur` · `ferðalög` · `tíska_fegurð` · `tækni` · `heilsa_líkamsrækt` ·
`fjármál_viðskipti` · `íþróttir` · `börn_foreldrar` · `bílar` · `heimili_hönnun` ·
`afþreying_menning` · `dýr_gæludýr`

`PublisherSchema` gains:
```ts
categories: z.array(z.enum(AD_CATEGORIES)).min(1)   // 1..n
```
Slots have no category field; they inherit the publisher's categories at cache-build.

The domain classifier maps its coarse result to a best-guess subset of `AD_CATEGORIES`
to pre-fill onboarding. The publisher's chosen categories are the source of truth.

## 2. Targeting & campaign creation

`TargetingSchema` (`packages/shared/src/schemas/campaign.ts`) — `slotIds` removed:
```ts
export const TargetingSchema = z.object({
  categories: z.array(z.enum(AD_CATEGORIES)).min(1),
});
```
`perPublisherApproval` is removed from `CampaignSchema` (control moves to the publisher,
§5).

Advertiser buy flow: pick category(ies) + budget + creative + schedule. No slot picking.

### Per-category inventory forecast

New endpoint `GET /v1/categories/inventory`: for each category, sum the trailing 7-day
average daily impressions across all publishers in that category (using the existing
`stats/publishers/{id}/{date}` documents, joined via `publisher.categories`). The buy
UI shows e.g. "matur ≈ 240.000 birtingar/dag" so the advertiser can judge whether a
budget is realistic. v1 shows **gross** available impressions; subtracting committed
budget is backlog.

## 3. Serving & cache (Approach A)

`apps/api/src/lib/push-cache.ts` is generalized: when building a slot's cache, load the
slot's publisher categories and include creatives from all active campaigns whose
`targeting.categories` intersect the publisher's categories.

A campaign's creative is eligible for a slot when: campaign is active **and**
category-intersects the publisher **and** budget not exhausted **and** schedule active
**and** creative size fits a slot size.

`apps/serving/src/lib/select.ts` is unchanged — same weighted-random selection,
frequency cap, and validity checks read from `slot.activeCreatives`. The hot path gains
nothing new.

Cache invalidation: when a campaign activates/pauses/exhausts, or a publisher edits its
categories, re-push the affected slot caches. `pushCacheForCampaign` is generalized to
resolve affected slots via category intersection instead of `slotIds`.

## 4. Billing correctness (prerequisite for charging category buys correctly)

1. **Lock flat CPM server-side.** `createSlot` forces `cpmIsk = FLAT_CPM_ISK`, ignoring
   any client value. (Slot-period pricing mode is untouched, out of scope.)
2. **Fix rounding.** Stop integer rounding per impression. Accrual groups impressions
   per campaign and charges once: `charge = round(FLAT_CPM_ISK × count / 1000)`. This
   fixes the current bug where CPM 550 charges ~1000/1000 impressions and any CPM < 500
   serves free.
3. **Enforce the budget cap (real money):**
   - The accrual cron decrements `campaign.budget.remainingIsk` (not just the wallet
     ledger), so `budgetExhausted = remainingIsk <= 0` in push-cache finally becomes
     true from spend.
   - The Redis counter `budget:{campaignId}` is seeded from `remainingIsk` at cache
     push; `impression.ts` reads the `decrementBudget` return value and flips
     `budgetExhausted` (re-push) when it reaches ≤ 0 — real-time stop between cron runs.
     (Today the return value is discarded and the counter is never read.)
   - Firestore `remainingIsk` + ledger is the source of truth; Redis is the fast gate,
     reseeded from `remainingIsk` on cache rebuild.
4. **Replay protection.** Dedup by signature: `SETNX seen:{sig}` in Redis with TTL =
   the click/impression validity window. A repeated signed click/impression counts only
   once, stopping a publisher from looping its own pixel to inflate earnings / drain
   advertiser budget.

## 5. Approval & publisher control

- Per-campaign manual approval removed (`perPublisherApproval` gone). Approved creatives
  in a publisher's category serve automatically — set-and-forget.
- Platform-level creative review stays: admin approves creatives for legality/quality
  via the existing `reviewStatus` field, independent of publishers.
- Publisher control: (a) choose/leave categories (§1); (b) optional
  `contentPolicy.requireManualApproval` valve — a cautious publisher can require
  creatives to clear their own queue before serving on their site.
- Blocking specific advertiser content types (e.g. "no alcohol") is backlog (needs
  creatives categorized).

## Testing

- **Shared:** schema tests for `AD_CATEGORIES`, publisher `categories` (min 1),
  targeting `categories`.
- **API:** `createSlot` forces flat CPM; category→slots resolution in push-cache
  (campaign appears only in matching-category slots); `remainingIsk` decrements and
  flips `budgetExhausted`; `/v1/categories/inventory` aggregation.
- **Serving:** accrual batch-rounding charges `round(550 × count / 1000)`; sub-window
  replay of a signed click/impression counts once; budget counter flips exhaustion.
- **Dashboard:** advertiser buy flow shows per-category forecast; publisher
  onboarding/settings category selection.

## Backlog (tracked during design)

1. **Geo/region targeting** (capital / countryside) — needs IP→region geolocation.
2. **Budget pacing** — even delivery across the campaign flight (v1 burns fast).
3. **Forecast: subtract committed/sold budget** from available daily impressions.
4. **Creative content-category blocking** — categorize creatives so a publisher can
   exclude specific ad types.
