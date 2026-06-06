# Budget Pacing — Implementation Plan

> **For agentic workers (Gemini):** This is the ONLY plan to execute right now. Do **not** touch
> the other plan files in this folder (`remediation-plan.md` and `per-slot-stats-plan.md` are
> done/merged). Implement the tasks below in order (P1 → P3). After EACH task, append a report
> entry to `IMPLEMENTATION-LOG.md` (template at the bottom of that file): status, commit SHA,
> files, **real verification output**, deviations, questions. Claude reviews each entry.

**Goal:** Spread a `cpm_capped` campaign's remaining budget evenly over the days left in its
flight (daily even pacing) with a real-time daily cap, while the existing total-budget cap stays
the ceiling.

**Architecture:** Mirror the existing `budget:{id}` gate. `push-cache` seeds a daily allowance
`pace_limit:{id}`; the serving impression path increments a per-day `pace_spent:{id}:{YYYYMMDD}`
counter; the ad route drops creatives whose `pace_spent >= pace_limit` (fail-open if unset). No
new cron, no schema change. Full design: `docs/superpowers/specs/2026-06-06-budget-pacing-design.md`.

**Tech Stack:** TypeScript (ESM, `.js` import suffix), Hono, Upstash Redis, firebase-admin,
Vitest. `@ada/api` + `@ada/serving` tests need the Firestore emulator + Java (`pnpm test:api` /
`pnpm --filter @ada/serving test`); the serving route tests here are Redis-mocked and run without
the emulator.

**Conventions (already decided — do not re-litigate):** daily even pacing; all `cpm_capped`
campaigns paced automatically (no advertiser toggle); fail-open on a missing `pace_limit`. Run
`pnpm verify` (format + typecheck + lint) before each commit — the pre-push hook enforces it.

---

## Task P1: Seed the daily allowance `pace_limit:{id}` in push-cache

**Files:**

- Modify: `apps/api/src/lib/push-cache.ts` (both places that seed `budget:{id}` — the
  `eligibleCampaigns` loop in `pushSlotCache`, and `pushCacheForCampaign`)
- Test: `apps/api/tests/push-cache.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('seeds pace_limit = round(remainingIsk / daysLeft) for a cpm_capped campaign', async () => {
  // Fixture: publisher in ['matur'] + active slot; an active cpm_capped campaign targeting
  // ['matur'] with budget.remainingIsk = 50000 and schedule.endsAt = 5 days from now.
  await seedPacingFixture();
  await pushSlotCache('slot_pace');
  const limit = await getRedis().get<number>('pace_limit:cmp_pace');
  expect(limit).toBe(10000); // 50000 / 5
});
```

- [ ] **Step 2: Run it to verify it fails** — `pnpm test:api -- tests/push-cache.test.ts -t "seeds pace_limit"` → FAIL (key never set → null).

- [ ] **Step 3: Implement** — in `push-cache.ts`, add `FLAT_CPM_ISK` to the existing `@ada/shared`
      import. In `pushSlotCache`, replace the existing budget-seeding loop with one that also seeds the
      pace limit for `cpm_capped` campaigns:

```ts
for (const campaign of eligibleCampaigns) {
  await redis.set(`budget:${campaign.id}`, campaign.budget.remainingIsk, {
    ex: BUDGET_COUNTER_TTL_SECONDS,
  });
  if (campaign.budget.mode === 'cpm_capped') {
    const daysLeft = Math.max(
      1,
      Math.ceil((campaign.schedule.endsAt.getTime() - Date.now()) / 86_400_000),
    );
    const perImpression = Math.round(FLAT_CPM_ISK / 1000);
    const paceLimit = Math.max(perImpression, Math.round(campaign.budget.remainingIsk / daysLeft));
    await redis.set(`pace_limit:${campaign.id}`, paceLimit, { ex: BUDGET_COUNTER_TTL_SECONDS });
  }
}
```

In `pushCacheForCampaign`, where it already does `redis.set(\`budget:${cmp.id}\`, ...)`, add the
same `pace_limit`seeding guarded by`cmp.budget.mode === 'cpm_capped'`(identical formula, using`cmp`).

- [ ] **Step 4: Run it to verify it passes** — `pnpm test:api -- tests/push-cache.test.ts` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(api): seed daily pace_limit alongside budget counter (Task P1)"`
- [ ] **Step 6: Append report entry.**

---

## Task P2: Track today's spend (`pace_spent`) on each impression

**Files:**

- Modify: `apps/serving/src/lib/analytics.ts` (add `incrementPaceSpent`)
- Modify: `apps/serving/src/routes/impression.ts` (call it next to `decrementBudget`)
- Test: `apps/serving/tests/click-impression.test.ts` (add a case)

- [ ] **Step 1: Write the failing test** — firing a CPM impression increments the per-day pace
      counter by the impression cost. (Mock Redis must record `incrby`; extend the suite's Redis mock if
      it doesn't already support `incrby`/`expire`.)

```ts
it('increments pace_spent for the campaign on a charged impression', async () => {
  const ts = Date.now();
  const sig = createSignature('cre_a', 'slot_a', 'tok123', ts);
  await app.request(`/v1/impression?s=slot_a&c=cre_a&t=tok123&ts=${ts}&sig=${sig}`);
  const dayKey = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  // assert redis.incrby was called with key `pace_spent:cmp_a:<dayKey>` (cmp_a = mockSlot creative's campaignId)
  expect(redisIncrbyMock).toHaveBeenCalledWith(`pace_spent:cmp_a:${dayKey}`, expect.any(Number));
});
```

- [ ] **Step 2: Run it to verify it fails** — `pnpm --filter @ada/serving exec vitest run tests/click-impression.test.ts -t "increments pace_spent"` → FAIL.

- [ ] **Step 3: Implement** — add to `apps/serving/src/lib/analytics.ts`:

```ts
export async function incrementPaceSpent(campaignId: string, costIsk: number): Promise<void> {
  const dayKey = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD (UTC = Iceland)
  const key = `pace_spent:${campaignId}:${dayKey}`;
  const redis = getRedis();
  await redis.incrby(key, costIsk);
  await redis.expire(key, 2 * 86400);
}
```

In `apps/serving/src/routes/impression.ts`, in the CPM branch right after the existing
`void decrementBudget(creative.campaignId, costIsk);`, add:

```ts
void incrementPaceSpent(creative.campaignId, costIsk);
```

and add `incrementPaceSpent` to the import from `../lib/analytics.js`.

- [ ] **Step 4: Run it to verify it passes** — `pnpm --filter @ada/serving exec vitest run tests/click-impression.test.ts` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(serving): track per-day pace_spent per campaign on impression (Task P2)"`
- [ ] **Step 6: Append report entry.**

---

## Task P3: Gate ad serving on the daily allowance

**Files:**

- Modify: `apps/serving/src/lib/analytics.ts` (add `getPaceState`)
- Modify: `apps/serving/src/routes/ad.ts` (extend the `fundedSlot` filter)
- Test: `apps/serving/tests/ad-route.test.ts` (add cases)

- [ ] **Step 1: Write the failing test**

```ts
it('does not serve a creative whose campaign hit its daily pace limit', async () => {
  // mock redis: pace_limit:cmp_z = 100, pace_spent:cmp_z:<today> = 100, budget:cmp_z = 999999
  const res = await app.request('/v1/ad?slot=slot_z&consent=full', {
    headers: { 'CF-IPCountry': 'IS' },
  });
  const body = await res.json();
  expect(body.creativeId).toBe('cre_fallback_transparent');
});

it('serves when under the daily pace limit', async () => {
  // mock redis: pace_limit:cmp_z = 100, pace_spent:cmp_z:<today> = 10, budget:cmp_z = 999999
  const res = await app.request('/v1/ad?slot=slot_z&consent=full', {
    headers: { 'CF-IPCountry': 'IS' },
  });
  const body = await res.json();
  expect(body.creativeId).not.toBe('cre_fallback_transparent');
});
```

- [ ] **Step 2: Run it to verify it fails** — `pnpm --filter @ada/serving exec vitest run tests/ad-route.test.ts -t "daily pace"` → FAIL (limit ignored → creative served in the first case).

- [ ] **Step 3: Implement** — add to `apps/serving/src/lib/analytics.ts`:

```ts
export async function getPaceState(
  campaignIds: string[],
): Promise<Record<string, { limit: number; spent: number }>> {
  const out: Record<string, { limit: number; spent: number }> = {};
  if (campaignIds.length === 0) return out;
  const redis = getRedis();
  const dayKey = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const limits = await redis.mget<(number | null)[]>(
    ...campaignIds.map((id) => `pace_limit:${id}`),
  );
  const spents = await redis.mget<(number | null)[]>(
    ...campaignIds.map((id) => `pace_spent:${id}:${dayKey}`),
  );
  campaignIds.forEach((id, i) => {
    out[id] = { limit: limits[i] ?? Number.POSITIVE_INFINITY, spent: spents[i] ?? 0 };
  });
  return out;
}
```

In `apps/serving/src/routes/ad.ts`, where `fundedSlot` is built from `getRemainingBudgets`, also
fetch pace state and add the condition (import `getPaceState`):

```ts
const budgets = await getRemainingBudgets(campaignIds);
const pace = await getPaceState(campaignIds);
const fundedSlot = {
  ...slot,
  activeCreatives: slot.activeCreatives.filter((ac) => {
    const funded = (budgets[ac.campaignId] ?? Number.POSITIVE_INFINITY) > 0;
    const p = pace[ac.campaignId];
    const underPace = !p || p.spent < p.limit; // fail-open if unset
    return funded && underPace;
  }),
};
```

- [ ] **Step 4: Run it to verify it passes** — `pnpm --filter @ada/serving exec vitest run tests/ad-route.test.ts` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(serving): gate ad serving on daily pace limit (Task P3)"`
- [ ] **Step 6: Append report entry.**

---

## Final verification (before handing back)

- `pnpm --filter @ada/shared build && pnpm verify` (format + typecheck + lint) → all pass.
- `pnpm test:api -- tests/push-cache.test.ts` and `pnpm --filter @ada/serving test` → green
  (state explicitly if Java/emulator is unavailable and a suite could not run).

## Self-review (plan vs spec)

- Spec §Mechanism.1 (seed pace_limit) → P1. §Mechanism.2 (pace_spent on impression) → P2.
  §Mechanism.3 (serve-time gate + `getPaceState`, fail-open) → P3.
- Edge cases (daysLeft floor 1, per-impression floor, cpm_capped-only, UTC day, fail-open) are all
  encoded in the P1/P3 code above.
- Names consistent across tasks: `pace_limit:{id}`, `pace_spent:{id}:{YYYYMMDD}`,
  `incrementPaceSpent`, `getPaceState`, `BUDGET_COUNTER_TTL_SECONDS`, `FLAT_CPM_ISK`.
- Out of scope (not in this plan): advertiser toggle, hourly pacing, dashboard surfacing.
