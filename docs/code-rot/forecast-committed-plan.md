# Forecast: Available (net of committed) impressions — Implementation Plan

> **For agentic workers (Gemini):** This is the ONLY plan to execute right now. Do **not** touch
> the other plan files in this folder (they are done/merged or are separate active plans). Do tasks
> in order (FC1 → FC2). After EACH task, append a report entry to `IMPLEMENTATION-LOG.md` (template
> at the bottom): status, commit SHA, files, **real verification output**, deviations, questions.
> Claude reviews each entry.

**Goal:** In the buy-flow forecast, show **available** daily impressions per category (gross minus
what active campaigns have already committed), not just gross.

**Context:** `GET /v1/categories/inventory` (`apps/api/src/services/inventory.ts`,
`getCategoryInventory`) currently returns `{ category, avgDailyImpressions }` — the trailing 7-day
gross daily impressions per category. The dashboard (`CampaignCreate.tsx` via
`useCategoryInventory`) shows that gross figure. This adds the committed/available figures.

**Design decision (stated; do not re-litigate):** "committed daily impressions" for a category =
sum over **active `cpm_capped` campaigns** targeting that category of
`round(dailyBudgetIsk / FLAT_CPM_ISK * 1000)`, where
`dailyBudgetIsk = max(round(FLAT_CPM_ISK/1000), round(remainingIsk / daysLeft))` — the same daily
allowance used by budget pacing. A multi-category campaign attributes its **full** daily
impressions to **each** targeted category (a conservative approximation that may understate
availability for multi-category campaigns; acceptable for a forecast hint). `available = max(0,
gross − committed)`.

**Tech Stack:** TypeScript (ESM, `.js` imports), Hono, firebase-admin, Vitest, React 19 + TanStack
Query. Run `pnpm verify` before each commit. `@ada/api` tests need emulator + Java (`pnpm test:api`);
`@ada/dashboard` is plain vitest.

---

## Task FC1: Compute committed + available in the inventory service

**Files:**

- Modify: `apps/api/src/services/inventory.ts`
- Test: `apps/api/tests/inventory.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('subtracts committed impressions from gross to give availableDailyImpressions', async () => {
  // Fixture: publisher in ['matur'] with 7 daily stats docs of 11000 impressions each
  //   → gross avgDailyImpressions = 11000.
  // Active cpm_capped campaign targeting ['matur'], remaining 27500 ISK, endsAt 5 days from now
  //   → dailyBudget = round(27500/5) = 5500 → dailyImpressions = round(5500/550*1000) = 10000.
  await seedForecastCommittedFixture();
  const result = await getCategoryInventory();
  const matur = result.find((r) => r.category === 'matur')!;
  expect(matur.avgDailyImpressions).toBe(11000);
  expect(matur.committedDailyImpressions).toBe(10000);
  expect(matur.availableDailyImpressions).toBe(1000);
});
```

- [ ] **Step 2: Run it to verify it fails** — `pnpm test:api -- tests/inventory.test.ts -t "availableDailyImpressions"` → FAIL (fields don't exist).

- [ ] **Step 3: Implement** — extend the service. Add imports and the committed computation, and
      widen the return type:

```ts
import { COLLECTIONS, publisherConverter, campaignConverter } from '@ada/shared/firestore';
import { AD_CATEGORY_SLUGS, FLAT_CPM_ISK } from '@ada/shared';

export interface CategoryInventory {
  category: string;
  avgDailyImpressions: number; // gross
  committedDailyImpressions: number;
  availableDailyImpressions: number;
}
```

After the loop that builds `totalByCategory` (gross), and before the final `return`:

```ts
// Committed: daily allowance of active cpm_capped campaigns, in impressions, per category.
const cmpSnap = await db
  .collection(COLLECTIONS.campaigns)
  .where('status', '==', 'active')
  .withConverter(campaignConverter)
  .get();
const committedByCategory = new Map<string, number>();
const now = Date.now();
const perImpression = Math.round(FLAT_CPM_ISK / 1000);
for (const doc of cmpSnap.docs) {
  const cmp = doc.data();
  if (cmp.budget.mode !== 'cpm_capped') continue;
  const daysLeft = Math.max(1, Math.ceil((cmp.schedule.endsAt.getTime() - now) / 86_400_000));
  const dailyBudgetIsk = Math.max(perImpression, Math.round(cmp.budget.remainingIsk / daysLeft));
  const dailyImpressions = Math.round((dailyBudgetIsk / FLAT_CPM_ISK) * 1000);
  for (const cat of cmp.targeting.categories) {
    committedByCategory.set(cat, (committedByCategory.get(cat) ?? 0) + dailyImpressions);
  }
}
```

Replace the final `return AD_CATEGORY_SLUGS.map(...)` with:

```ts
return AD_CATEGORY_SLUGS.map((category) => {
  const gross = totalByCategory.get(category) ?? 0;
  const committed = committedByCategory.get(category) ?? 0;
  return {
    category,
    avgDailyImpressions: gross,
    committedDailyImpressions: committed,
    availableDailyImpressions: Math.max(0, gross - committed),
  };
});
```

- [ ] **Step 4: Run it to verify it passes** — `pnpm test:api -- tests/inventory.test.ts` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(api): inventory forecast returns committed + available impressions (Task FC1)"`
- [ ] **Step 6: Append report entry.**

---

## Task FC2: Show available impressions in the buy flow

**Files:**

- Modify: `apps/dashboard/src/hooks/useCategoryInventory.ts` (widen the type)
- Modify: `apps/dashboard/src/pages/advertiser/CampaignCreate.tsx` (display available)

- [ ] **Step 1: Widen the hook interface** in `useCategoryInventory.ts`:

```ts
export interface CategoryInventory {
  category: string;
  avgDailyImpressions: number;
  committedDailyImpressions: number;
  availableDailyImpressions: number;
}
```

- [ ] **Step 2: Show available in `CampaignCreate.tsx`** — it currently reads
      `forecast?.avgDailyImpressions` in ~3 places (the per-category line ~321 and the two summed-reach
      calculations ~370 and ~401). Change the **headline "available" figure shown to the advertiser** to
      `forecast?.availableDailyImpressions ?? 0` (the per-category line and the summed reach), so the
      buyer sees what is actually available. Keep `avgDailyImpressions` only if you also want to show a
      secondary "(af X alls)" gross figure; otherwise switch all three to `availableDailyImpressions`.
      Label it clearly, e.g. `≈ {n.toLocaleString('is-IS')} lausar birtingar/dag`.

- [ ] **Step 3: Verify** — `pnpm --filter @ada/dashboard typecheck && pnpm --filter @ada/dashboard lint && pnpm format:check` → all pass.
- [ ] **Step 4: Commit** — `git commit -m "feat(dashboard): show available (not gross) impressions in buy-flow forecast (Task FC2)"`
- [ ] **Step 5: Append report entry.**

---

## Final verification

- `pnpm --filter @ada/shared build && pnpm verify` → all pass.
- `pnpm test:api -- tests/inventory.test.ts` → green (state explicitly if Java/emulator unavailable).

## Self-review (plan vs goal)

- FC1 computes committed (reusing the pacing daily-allowance formula) and available; FC2 surfaces
  available in the buy flow — that's the whole gap.
- Names consistent: `availableDailyImpressions`, `committedDailyImpressions`, `avgDailyImpressions`,
  `FLAT_CPM_ISK`, `campaignConverter`.
- Firestore: campaigns queried by `status == 'active'` only (single equality → no composite index),
  with the `cpm_capped` filter applied in memory.
- Out of scope: per-category-split attribution for multi-category campaigns (uses full attribution,
  documented above); hourly granularity.
