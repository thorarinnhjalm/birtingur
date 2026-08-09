# Traffic measurement integrity: true page views, durable event logging, pipeline reconciliation

**Date:** 2026-08-09
**Status:** Approved design, pending implementation plan

## Problem

Three defects in the measurement path, found while answering the owner's
question "are these real numbers or bloated?".

### 1. "Vefumferð" is not page views (the one that matters)

`packages/snippet/src/index.ts:7-10` runs once per page load, finds every
`[data-adplatform-slot]` element and issues one `/v1/ad` request per slot.
`apps/serving/src/routes/ad.ts:149` logs a `pageview` event on **each** of
those requests, and the no-fill path logs one too
(`routes/impression.ts:80`). A page carrying three ad slots therefore
produces three "flettingar" per real page view.

The publisher dashboard sums those across all of a publisher's slots and
headlines the result as **"Vefumferð"**
(`apps/dashboard/src/pages/publisher/Dashboard.tsx:431`). A publisher
comparing that against their own analytics sees us overstating their
traffic by roughly the number of ad slots per page — and reasonably
concludes every other figure we show is inflated too.

Compounding it: the pageview is logged server-side the moment the ad
request arrives, before anything renders, with no viewability requirement.
Impressions require 50% visible for 1 continuous second
(`packages/snippet/src/render.ts:37-56`), so non-rendering crawlers drop
out of the impression count but are counted in full as traffic. There is
no bot filtering anywhere in `apps/serving` (verified: no user-agent or
crawler check exists). Both effects push the traffic number in the same
direction — up.

Per-slot figures are NOT affected in meaning: on `SlotDetail` the count is
"how often did this slot load", which is exactly right, and the fill-rate
figure (`impressions / pageviews`, `SlotDetail.tsx:215`) needs that
denominator to stay correct.

### 2. Every event is logged fire-and-forget

All five `logEvent` call sites use `void logEvent(...)`
(`routes/ad.ts:149`, `routes/impression.ts:80,113`, `routes/click.ts:53,93`).
On Vercel's Node runtime the response returns and the instance can freeze
before the Redis write resolves — the event vanishes with no error and no
signal. `logEvent` itself does two sequential round trips for impressions
(`lib/analytics.ts:25-28`).

### 3. Nothing compares what was emitted against what was recorded

`services/reconciliation.ts` covers campaign spend, money conservation,
the advertiser mirror, Redis budgets, and (as of PR #13) the publisher
side. It has no coverage of the event pipeline at all (verified: no queue
or event references in the module). Today's discovery that the
`byPublisher`/`byCampaign` breakdowns had never worked in production —
dot-path keys are not nested by `batch.set`, so the maps were written flat
and read as `undefined` for months — is direct evidence that a measurement
defect survives indefinitely when no independent count contradicts it.

## Owner decisions (2026-08-09)

- **Count correctly**, rather than renaming the existing figure: one page
  view counts once regardless of how many ad slots the page carries.
- **Start the true series fresh from the switch date.** Historical traffic
  numbers are slot-load counts and cannot be corrected retroactively (the
  slots-per-page ratio was never recorded); the site-traffic chart shows
  nothing before the switch, with an explanation, rather than a figure
  known to be wrong.
- **No Vercel-specific dependency** in `apps/serving` (`waitUntil` from
  `@vercel/functions`): the app is planned to move to a Cloudflare Worker,
  where that API does not exist. Durability comes from awaiting a
  **pipelined** write instead — see Part 2.

## Part 1 — True page views

Two distinct quantities, honestly named and separately stored:

- **Slot load** — one per `/v1/ad` request. Keeps the fill-rate
  denominator correct and keeps per-slot "how often did this slot load"
  meaningful. This is what the current `pageview` event actually measures;
  it is renamed, not removed.
- **Page view** — one per page load, regardless of slot count. New.

### Mechanism

The signature model is not weakened: the snippet cannot sign, so it may
only fire URLs the server handed it. Every `/v1/ad` response therefore
carries a signed `pageviewPixel` alongside the existing
`impressionPixel`, and **the snippet fires it exactly once per page load**
— from whichever slot's response arrives first — using a module-scoped
flag set inside `init()`. Slots added to the DOM later are already outside
today's one-shot `querySelectorAll`, so no case is lost.

Server side:

- `routes/ad.ts` stops logging `pageview` and logs `slot_load` instead
  (same fields, new `type`). The no-fill path in `routes/impression.ts`
  likewise logs `slot_load`.
- A new signed pixel target records the real `pageview`. It reuses the
  existing `/v1/impression` handler's validation shape (signature
  required, `claimSignatureOnce` under its own `'pv'` kind, slot cache
  lookup to resolve the publisher) so no new trust surface is introduced.
- `AdEvent.type` becomes `'impression' | 'click' | 'pageview' | 'slot_load'`.

### Storage and display

The aggregator writes `slotLoads` where it writes `pageviews` today, and
`pageviews` becomes the true count. Because the two names would otherwise
swap meaning mid-history, the **existing `pageviews` field keeps its
existing (slot-load) meaning for existing documents** and the aggregator
writes both fields going forward:

- `pageviews` — unchanged name, unchanged meaning (slot loads). Fill rate
  keeps using it, so historical fill rates stay correct and comparable.
- `pageViewsTrue` — the new, correct per-page count. Absent for every day
  before the switch.

Dashboard changes:

- Publisher Dashboard's **"Vefumferð"** stat reads `pageViewsTrue`. When
  it is absent for the whole selected window (pre-switch history), the
  card shows an em dash with the note that accurate traffic measurement
  started on the switch date, rather than a number.
- The site-traffic chart plots `pageViewsTrue` only, so the series simply
  begins at the switch date.
- `SlotDetail` keeps its per-slot figure but relabels it from
  **"Vefumferð"** to **"Hleðslur pláss"**, and the fill-rate card is
  unchanged.
- `bySite` (PR #10's per-site overview) gains the true figure alongside.

Bot filtering is explicitly **out of scope** here and remains an open
question; measuring the bot share before deciding whether to filter is a
separate piece of work.

## Part 2 — Durable event logging

- `logEvent` sends its writes in a single Redis pipeline instead of two
  sequential round trips, so an impression costs one round trip where it
  costs two today.
- All five call sites `await` it. On the pixel and click paths the wait is
  invisible (nobody blocks on a 1×1 GIF; a click redirect already crosses
  the network). On `/v1/ad` the added cost is one pipelined round trip,
  which the pipelining offsets.
- Every call site keeps a `try`/`catch` so a Redis outage still returns
  the pixel, still redirects the click, and still serves the ad — the
  event is lost exactly as it is today, but now it is logged as an error
  instead of vanishing silently.

## Part 3 — Emitted vs recorded reconciliation

Both ends count into hour buckets as part of the work they already do:

- `logEvent` increments `emitted:{YYYYMMDDHH}` in the same pipeline as the
  queue writes (no extra round trip), 7-day TTL.
- The stats aggregator increments `recorded:{YYYYMMDDHH}` as it writes,
  keyed by each event's own hour so a late drain lands in the right
  bucket.
- The daily reconciliation cron compares buckets **older than two hours**
  (so in-flight events settle) and raises a finding when
  `recorded < emitted` beyond a tolerance of 1% or 50 events, whichever is
  larger. Read-only, alerting through the existing `ops-alerts` path like
  every other check.

This is the independent second count whose absence let the dot-path bug
live for months.

## Error handling

- A failed counter increment must never fail the event write: the counter
  rides in the same pipeline, and pipeline failure is already handled by
  the call site's `try`/`catch`.
- Missing buckets (Redis eviction, TTL expiry) are skipped, never treated
  as zero-recorded — absence is not evidence of loss.
- The `pageviewPixel` follows the existing pixel contract: any validation
  failure returns the pixel and records nothing.

## Testing

- Snippet: a page with three slots fires exactly one pageview pixel; a
  page with one slot fires one; the pixel still fires when the first slot
  returns an empty (no-fill) response.
- Serving: `/v1/ad` logs `slot_load`, not `pageview`; the pageview pixel
  logs `pageview` once and is rejected on replay; an unsigned pageview
  pixel records nothing.
- `logEvent`: one pipeline call, both queues receive impressions, only the
  stats queue receives the rest, and the emitted counter advances.
- Aggregator: `slot_load` increments `pageviews`, `pageview` increments
  `pageViewsTrue`, the recorded counter advances per event hour.
- Reconciliation: a seeded gap beyond tolerance alerts, a gap inside
  tolerance does not, a missing bucket does not.
- Dashboard: "Vefumferð" shows the em dash and the explanation for a
  pre-switch window and the number for a post-switch one; SlotDetail's
  relabel and fill rate are unchanged.

## Rollout

- Part 1 changes what a publisher-visible number means. The PR body must
  state the switch date and that the series restarts.
- Parts 2 and 3 are independent of Part 1 and of each other, but ship
  together: they are all one answer to "can we trust these numbers".
- Serving changes require the snippet to be rebuilt and redeployed to the
  CDN; the signed-pixel contract means an old cached snippet keeps working
  (it simply never fires the new pixel), so there is no flag-day.
