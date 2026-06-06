# Budget Pacing — Design

**Date:** 2026-06-06
**Status:** Approved design, pending implementation plan

## Problem

A `cpm_capped` campaign currently burns its budget as fast as traffic arrives — a 50.000 kr
campaign can spend out in a single busy day. Brand advertisers expect even delivery across the
campaign flight. This adds **daily even pacing**: spread the remaining budget evenly over the
days remaining in the flight, with a hard daily cap, while the existing total-budget cap stays
the enforced ceiling.

## Decisions (confirmed with owner)

1. **Model:** daily even pacing (not hourly, not continuous smoothing).
2. **Enforcement:** real-time per-day Redis counter + serve-time gate (Approach A), mirroring the
   existing `budget:{id}` gate pattern.
3. **Catch-up:** automatic — the daily allowance is recomputed as `remainingIsk / daysLeft`, so an
   under-spent day raises the next day's allowance with no extra logic.
4. **Scope (v1, YAGNI):** all `cpm_capped` campaigns are paced automatically; no advertiser
   "accelerated vs standard" toggle, no dashboard surfacing. `slot_purchased` campaigns are not
   paced.

## Mechanism (three small parts, all mirroring the existing budget gate)

### 1. Compute the daily allowance — in `apps/api/src/lib/push-cache.ts`

Seed `pace_limit:{campaignId}` next to the existing `budget:{id}` (same place, same source data:
`campaign.budget.remainingIsk` + `campaign.schedule.endsAt`). No new cron — push-cache already
runs on campaign changes, on the 15-min accrual re-push, and on the ~10-min cache-refresh cron,
so the allowance stays fresh.

```ts
const msLeft = campaign.schedule.endsAt.getTime() - Date.now();
const daysLeft = Math.max(1, Math.ceil(msLeft / 86_400_000));
const perImpression = Math.round(FLAT_CPM_ISK / 1000); // = 1
const paceLimit = Math.max(perImpression, Math.round(campaign.budget.remainingIsk / daysLeft));
await redis.set(`pace_limit:${campaign.id}`, paceLimit, { ex: BUDGET_COUNTER_TTL_SECONDS });
```

- `daysLeft` floored at 1 → on the last day the campaign may spend its remainder.
- `paceLimit` floored at one impression's cost → a tiny-budget / long-flight campaign is not fully
  starved; the **total** cap is still protected by `budget:{id}`.
- Only for `cpm_capped` campaigns (the eligible-campaign set push-cache already iterates).

### 2. Track today's spend — in `apps/serving/src/routes/impression.ts`

Next to the existing `decrementBudget`, increment a per-day counter:

```ts
const dayKey = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD (UTC = Iceland time)
await redis.incrby(`pace_spent:${campaignId}:${dayKey}`, costIsk);
await redis.expire(`pace_spent:${campaignId}:${dayKey}`, 2 * 86400);
```

A new key per UTC day → automatic daily reset (no un-pause logic). The 2-day TTL keeps Redis tidy.

### 3. Serve-time gate — in `apps/serving/src/routes/ad.ts` + `apps/serving/src/lib/analytics.ts`

The ad route already drops creatives whose `budget:{id} <= 0`. Add a parallel check: drop a
creative when `pace_spent:{id}:{today} >= pace_limit:{id}`.

- New helper in `analytics.ts`, e.g. `getPaceState(campaignIds): Promise<Record<string, {limit:number; spent:number}>>`,
  doing an `mget` of `pace_limit:{id}` and `pace_spent:{id}:{today}` (mirrors `getRemainingBudgets`).
- In `ad.ts`, the `fundedSlot` filter additionally drops creatives where a `pace_limit` is set and
  `spent >= limit`. **Fail-open:** a missing `pace_limit` (Redis miss / not yet seeded) means "no
  limit", exactly like the budget gate treats a missing counter as funded.

## Edge cases

- **Missing `pace_limit`** → fail-open (serve), allowance seeds within ~10–15 min; safe because
  `budget:{id}` still caps total spend.
- **Last day / past `endsAt`** → `daysLeft=1` (spend remainder); expired campaigns are already
  dropped by the schedule check.
- **Daily allowance reached, budget remaining** → no serving for the rest of the UTC day; resumes
  at midnight via the fresh `pace_spent` key. This is the intended behavior.
- **`slot_purchased`** → not paced.
- **Timezone** → UTC day == Iceland day (no DST).

## Testing

- **`@ada/api` push-cache:** `pace_limit:{id} === max(1, round(remainingIsk / daysLeft))` for a
  `cpm_capped` campaign with a future `endsAt` (fixture: remaining 50.000, 5 days left → 10.000).
- **`@ada/serving` ad route:** a creative is dropped when `pace_spent >= pace_limit`, and served
  when under (mock Redis `pace_limit` + `pace_spent`).
- **`@ada/serving` impression:** firing an impression increments `pace_spent:{id}:{today}` by
  `costIsk`.

## Out of scope (future)

- Advertiser-facing "accelerated vs standard" delivery option.
- Hourly pacing / continuous smoothing.
- Dashboard surfacing of pacing state ("daily cap reached").
