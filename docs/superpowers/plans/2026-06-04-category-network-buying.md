# Category Network Buying — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let advertisers buy ad inventory by content category + budget (e.g. "matur, 50.000 kr"); the platform distributes impressions across all sites in that category, charges the correct flat CPM, and enforces budget caps.

**Architecture:** Categories live on the publisher (1..n). Campaigns target categories (not slots). `push-cache` resolves category→campaigns at cache-build time (Approach A) so the serving hot path is unchanged. Billing is corrected: flat CPM is locked server-side, charges are computed per batch (not rounded per impression), budget caps are enforced via a Redis real-time gate backed by a Firestore source of truth, and signed click/impression events are deduped to stop replay.

**Tech Stack:** TypeScript (ESM), Zod (`@ada/shared`), Hono (api/serving), firebase-admin (Firestore), Upstash Redis, Vitest, React 19 (dashboard).

---

## Execution notes (read first)

- **Monorepo:** Turborepo + pnpm. `@ada/shared` is the dependency root — after editing it, run `pnpm --filter @ada/shared build` before downstream packages typecheck/test.
- **Emulator + Java:** `@ada/api` and `@ada/serving` tests run against the Firestore emulator and need a Java runtime. Use the root wrappers `pnpm test:api` / `pnpm test:rules`, or wrap a single file in `firebase --config firebase/firebase.json emulators:exec 'pnpm --filter @ada/api test -- <file>'`. `@ada/shared` and `@ada/dashboard` tests are plain `vitest` (no emulator).
- **ESM imports:** relative imports inside a package use the `.js` extension even from `.ts` source.
- **Commit cadence:** one commit per task (after its tests pass). Branch off `main` first: `git checkout -b feat/category-network-buying`.
- **Out of scope (do not build):** geo/region targeting, budget pacing, committed-budget subtraction in forecast, creative content-category blocking. These are in the Backlog section.

---

## Phase 1 — Shared schema foundation

### Task 1: Add the `AD_CATEGORIES` taxonomy

**Files:**
- Modify: `packages/shared/src/constants.ts`
- Test: `packages/shared/tests/constants.test.ts` (create if absent)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { AD_CATEGORIES, AD_CATEGORY_SLUGS } from '../src/constants';

describe('AD_CATEGORIES', () => {
  it('exposes food category for the canonical mayo use-case', () => {
    expect(AD_CATEGORY_SLUGS).toContain('matur');
  });
  it('every category has a slug and an Icelandic label', () => {
    for (const c of AD_CATEGORIES) {
      expect(c.slug).toMatch(/^[a-z_]+$/);
      expect(c.label.length).toBeGreaterThan(0);
    }
  });
  it('slugs are unique', () => {
    expect(new Set(AD_CATEGORY_SLUGS).size).toBe(AD_CATEGORY_SLUGS.length);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ada/shared test -- tests/constants.test.ts`
Expected: FAIL — `AD_CATEGORIES` is not exported.

- [ ] **Step 3: Implement**

Append to `packages/shared/src/constants.ts`:

```ts
/** Ad-buying content categories (advertiser picks these; publisher belongs to 1..n). */
export const AD_CATEGORIES = [
  { slug: 'matur', label: 'Matur & matreiðsla' },
  { slug: 'ferdalog', label: 'Ferðalög' },
  { slug: 'tiska_fegurd', label: 'Tíska & fegurð' },
  { slug: 'taekni', label: 'Tækni' },
  { slug: 'heilsa_likamsraekt', label: 'Heilsa & líkamsrækt' },
  { slug: 'fjarmal_vidskipti', label: 'Fjármál & viðskipti' },
  { slug: 'ithrottir', label: 'Íþróttir' },
  { slug: 'born_foreldrar', label: 'Börn & foreldrar' },
  { slug: 'bilar', label: 'Bílar' },
  { slug: 'heimili_honnun', label: 'Heimili & hönnun' },
  { slug: 'afthreying_menning', label: 'Afþreying & menning' },
  { slug: 'dyr_gaeludyr', label: 'Dýr & gæludýr' },
] as const;

export const AD_CATEGORY_SLUGS = AD_CATEGORIES.map((c) => c.slug) as readonly string[];
export type AdCategory = (typeof AD_CATEGORIES)[number]['slug'];
```

> Note: slugs use ASCII only (`ferdalog`, not `ferðalög`) so they are safe as Firestore values and enum members. The Icelandic label carries the display text.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @ada/shared test -- tests/constants.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/constants.ts packages/shared/tests/constants.test.ts
git commit -m "feat(shared): add AD_CATEGORIES taxonomy"
```

---

### Task 2: Add `categories` to `PublisherSchema`

**Files:**
- Modify: `packages/shared/src/schemas/publisher.ts`
- Test: `packages/shared/tests/publisher.test.ts` (create if absent)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { PublisherSchema } from '../src/schemas/publisher';

const base = {
  id: 'pub_1',
  ownerEmail: 'a@b.is',
  domain: 'matarblogg.is',
  displayName: 'Matarblogg',
  contentPolicy: { blockedCategories: [], requireManualApproval: false },
  status: 'active',
  createdAt: new Date(),
  categories: ['matur'],
};

describe('PublisherSchema.categories', () => {
  it('accepts a valid category list', () => {
    expect(PublisherSchema.parse(base).categories).toEqual(['matur']);
  });
  it('rejects an empty category list', () => {
    expect(() => PublisherSchema.parse({ ...base, categories: [] })).toThrow();
  });
  it('rejects unknown categories', () => {
    expect(() => PublisherSchema.parse({ ...base, categories: ['nope'] })).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ada/shared test -- tests/publisher.test.ts`
Expected: FAIL — `categories` not required / not validated.

- [ ] **Step 3: Implement**

In `packages/shared/src/schemas/publisher.ts`, import the slugs and add the field to `PublisherSchema`:

```ts
import { AD_CATEGORY_SLUGS } from '../constants.js';
// ...
// inside PublisherSchema object, after estimatedSlotsCount / vatNumber:
  categories: z.array(z.enum(AD_CATEGORY_SLUGS as [string, ...string[]])).min(1),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @ada/shared test -- tests/publisher.test.ts`
Expected: PASS.

- [ ] **Step 5: Build shared so downstream sees the type**

Run: `pnpm --filter @ada/shared build`
Expected: success.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/schemas/publisher.ts packages/shared/tests/publisher.test.ts
git commit -m "feat(shared): require categories (1..n) on Publisher"
```

---

### Task 3: Switch `TargetingSchema` to categories; drop `perPublisherApproval`

**Files:**
- Modify: `packages/shared/src/schemas/campaign.ts`
- Test: `packages/shared/tests/campaign.test.ts` (create if absent)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { TargetingSchema, CampaignSchema } from '../src/schemas/campaign';

describe('TargetingSchema', () => {
  it('requires at least one category', () => {
    expect(TargetingSchema.parse({ categories: ['matur'] }).categories).toEqual(['matur']);
    expect(() => TargetingSchema.parse({ categories: [] })).toThrow();
  });
  it('no longer accepts slotIds as the targeting key', () => {
    const parsed = TargetingSchema.parse({ categories: ['matur'], slotIds: ['x'] } as any);
    expect((parsed as any).slotIds).toBeUndefined();
  });
});

describe('CampaignSchema', () => {
  it('has no perPublisherApproval field', () => {
    const c = CampaignSchema.parse({
      id: 'cmp_1',
      advertiserId: 'adv_1',
      creativeIds: ['cre_1'],
      targeting: { categories: ['matur'] },
      schedule: { startsAt: new Date(), endsAt: new Date(Date.now() + 1000) },
      budget: { mode: 'cpm_capped', totalIsk: 50000, remainingIsk: 50000 },
      status: 'active',
    });
    expect((c as any).perPublisherApproval).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ada/shared test -- tests/campaign.test.ts`
Expected: FAIL — `slotIds` still required, `perPublisherApproval` still required.

- [ ] **Step 3: Implement**

In `packages/shared/src/schemas/campaign.ts`:

```ts
import { AD_CATEGORY_SLUGS } from '../constants.js';

export const TargetingSchema = z.object({
  categories: z.array(z.enum(AD_CATEGORY_SLUGS as [string, ...string[]])).min(1),
});
export type Targeting = z.infer<typeof TargetingSchema>;
```

Remove `PerPublisherApprovalSchema` and the `perPublisherApproval` property from `CampaignSchema`. Leave `GeoRegionSchema` exported (still used by the backlog and `constants`), but it is no longer part of `TargetingSchema`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @ada/shared test -- tests/campaign.test.ts`
Expected: PASS.

- [ ] **Step 5: Build shared + typecheck downstream to surface breakages**

Run: `pnpm --filter @ada/shared build && pnpm --filter @ada/api typecheck`
Expected: typecheck FAILS in `apps/api` (campaigns.ts, push-cache.ts reference removed fields). Those are fixed in Phase 3/5 — note the failing files; do not fix yet.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/schemas/campaign.ts packages/shared/tests/campaign.test.ts
git commit -m "feat(shared): target campaigns by category, drop slotIds + perPublisherApproval"
```

---

## Phase 2 — Billing correctness

### Task 4: Lock flat CPM in `createSlot`

**Files:**
- Modify: `apps/api/src/services/slots.ts:18-30`
- Test: `apps/api/tests/slots.test.ts` (add case)

- [ ] **Step 1: Write the failing test** (add to existing slots test file)

```ts
import { FLAT_CPM_ISK } from '@ada/shared';

it('forces cpm pricing to the locked flat CPM regardless of client input', async () => {
  const slot = await createSlot({
    publisherId: 'pub_x',
    name: 'Test',
    sizes: [{ width: 300, height: 250 }],
    pricing: { type: 'cpm', amountIsk: 9999 },
    placement: { pageMatcher: '/*', position: 'sidebar' },
  });
  expect(slot.pricing.mode).toBe('cpm');
  expect((slot.pricing as { cpmIsk: number }).cpmIsk).toBe(FLAT_CPM_ISK);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:api -- tests/slots.test.ts -t "locked flat CPM"`
Expected: FAIL — cpmIsk is 9999.

- [ ] **Step 3: Implement**

In `apps/api/src/services/slots.ts`, import the constant and override the cpm value in the normalization block:

```ts
import { FLAT_CPM_ISK } from '@ada/shared';
// ...
  if (pricing && pricing.type) {
    pricing = {
      mode: pricing.type === 'flat' ? 'slot' : 'cpm',
      cpmIsk: pricing.type === 'cpm' ? FLAT_CPM_ISK : undefined, // locked, ignore client value
      slotPriceIsk: pricing.type === 'flat' ? pricing.amountIsk : undefined,
      slotPeriodDays: pricing.type === 'flat' ? 7 : undefined,
    };
    Object.keys(pricing).forEach((k) => pricing[k] === undefined && delete pricing[k]);
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:api -- tests/slots.test.ts -t "locked flat CPM"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/slots.ts apps/api/tests/slots.test.ts
git commit -m "feat(api): lock slot CPM to FLAT_CPM_ISK server-side"
```

---

### Task 5: Fix per-impression rounding in accrual (batch charge)

**Files:**
- Modify: `apps/api/src/services/accrual.ts:60-101`
- Test: `apps/api/tests/accrual.test.ts` (add case)

- [ ] **Step 1: Write the failing test**

The bug: `Math.round(550/1000)=1` per impression → 1000 impressions cost 1000 ISK instead of 550. Assert the batch math.

```ts
// Seed an advertiser wallet with balance, a cpm_capped campaign, a flat-CPM slot,
// enqueue 1000 impression events for that campaign+slot, then run drainAndAccrue().
// Assert the advertiser was charged round(550 * 1000 / 1000) = 550, not 1000.
it('charges flat CPM per 1000 impressions, not rounded per impression', async () => {
  await seedWalletCampaignSlot({ balanceIsk: 100000, cpmIsk: 550 });
  await enqueueImpressions({ campaignId: 'cmp_acc', slotId: 'slot_acc', publisherId: 'pub_acc', count: 1000 });
  await drainAndAccrue(2000);
  const charge = await getCampaignChargeTotal('adv_acc'); // helper sums campaign_charge ledger (absolute)
  expect(charge).toBe(550);
});
```

> Implement `seedWalletCampaignSlot`, `enqueueImpressions`, `getCampaignChargeTotal` as local helpers in the test file using `db`, the converters, and `getRedis().lpush('events:queue', ...)`. Mirror the event shape in `QueuedEvent` (type/slotId/publisherId/creativeId/campaignId/ts).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:api -- tests/accrual.test.ts -t "per 1000 impressions"`
Expected: FAIL — charge is 1000.

- [ ] **Step 3: Implement**

Replace the per-impression rounding loop in `drainAndAccrue`. Compute per-publisher impression **counts**, then derive gross once:

```ts
import { FLAT_CPM_ISK } from '@ada/shared';
// ...
  for (const [campaignId, evs] of byCampaign) {
    const cmpSnap = await db
      .collection(COLLECTIONS.campaigns).doc(campaignId)
      .withConverter(campaignConverter).get();
    if (!cmpSnap.exists) continue;
    const cmp = cmpSnap.data()!;
    if (cmp.budget.mode !== 'cpm_capped') continue;

    // Count impressions per publisher (flat CPM, so price is uniform).
    const countByPublisher = new Map<string, number>();
    for (const ev of evs) {
      countByPublisher.set(ev.publisherId, (countByPublisher.get(ev.publisherId) ?? 0) + 1);
    }

    // Gross per publisher = round(cpm * count / 1000); campaign charge = sum (conserves money).
    const grossByPublisher = new Map<string, number>();
    let totalCharge = 0;
    for (const [publisherId, count] of countByPublisher) {
      const gross = Math.round((FLAT_CPM_ISK * count) / 1000);
      if (gross <= 0) continue;
      grossByPublisher.set(publisherId, gross);
      totalCharge += gross;
    }
    if (totalCharge <= 0) continue;

    try {
      await chargeCampaign(cmp.advertiserId, campaignId, totalCharge);
    } catch (err) {
      console.warn(`Campaign charge failed for ${campaignId}, pausing:`, err);
      await db.collection(COLLECTIONS.campaigns).doc(campaignId).update({ status: 'paused' });
      await pushCacheForCampaign(campaignId);
      continue;
    }

    for (const [publisherId, gross] of grossByPublisher) {
      await creditPublisher(publisherId, campaignId, gross);
    }
  }
```

> The old per-slot cpm lookup is removed because CPM is now locked flat (Task 4). The `slotConverter` import in `accrual.ts` becomes unused — remove it.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:api -- tests/accrual.test.ts -t "per 1000 impressions"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/accrual.ts apps/api/tests/accrual.test.ts
git commit -m "fix(api): charge flat CPM per batch, not rounded per impression"
```

---

### Task 6: Enforce the budget cap (Firestore source of truth + Redis gate)

**Files:**
- Modify: `apps/api/src/services/accrual.ts` (decrement `remainingIsk`)
- Modify: `apps/api/src/lib/push-cache.ts` (seed Redis budget counter on push)
- Modify: `apps/serving/src/routes/ad.ts` + `apps/serving/src/lib/select.ts` (gate on the counter)
- Test: `apps/api/tests/accrual.test.ts` and `apps/serving/tests/ad.test.ts`

- [ ] **Step 1: Write the failing api test** (campaign budget actually decreases)

```ts
it('decrements campaign remainingIsk by the charged amount', async () => {
  await seedWalletCampaignSlot({ balanceIsk: 100000, cpmIsk: 550, totalIsk: 50000 });
  await enqueueImpressions({ campaignId: 'cmp_acc', slotId: 'slot_acc', publisherId: 'pub_acc', count: 1000 });
  await drainAndAccrue(2000);
  const cmp = await getCampaign('cmp_acc');
  expect(cmp!.budget.remainingIsk).toBe(50000 - 550);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:api -- tests/accrual.test.ts -t "decrements campaign remainingIsk"`
Expected: FAIL — remainingIsk unchanged (50000).

- [ ] **Step 3: Implement the Firestore decrement in accrual**

After a successful `chargeCampaign(...)` in `drainAndAccrue`, update the campaign budget atomically:

```ts
import { FieldValue } from 'firebase-admin/firestore';
// ...after chargeCampaign succeeds, before crediting publishers:
    const newRemaining = Math.max(0, cmp.budget.remainingIsk - totalCharge);
    await db.collection(COLLECTIONS.campaigns).doc(campaignId).update({
      'budget.remainingIsk': newRemaining,
      ...(newRemaining <= 0 ? { status: 'paused' } : {}),
    });
    await pushCacheForCampaign(campaignId); // re-push so budgetExhausted + Redis counter refresh
```

- [ ] **Step 4: Run api test to verify it passes**

Run: `pnpm test:api -- tests/accrual.test.ts -t "decrements campaign remainingIsk"`
Expected: PASS.

- [ ] **Step 5: Seed the Redis budget counter on cache push**

In `apps/api/src/lib/push-cache.ts`, at the end of `pushSlotCache` (and anywhere a campaign cache is rebuilt), seed each active campaign's counter. Add, inside the eligible-campaign loop in `pushSlotCache` after computing `eligibleCampaigns`:

```ts
for (const campaign of eligibleCampaigns) {
  await redis.set(`budget:${campaign.id}`, campaign.budget.remainingIsk, { ex: CACHE_TTL_SECONDS * 5 });
}
```

- [ ] **Step 6: Write the failing serving test** (exhausted campaign is not served)

In `apps/serving/tests/ad.test.ts` (create if absent; mock `getSlotCache` and `getRedis`):

```ts
it('does not serve a creative whose campaign budget counter is exhausted', async () => {
  // mock slot cache with one cpm creative for campaign cmp_z
  // mock redis GET budget:cmp_z -> "0"
  const res = await app.request('/v1/ad?slot=slot_z&consent=full', { headers: { 'CF-IPCountry': 'IS' } });
  const body = await res.json();
  expect(body.creativeId).toBe('cre_fallback_transparent'); // no eligible creative
});
```

- [ ] **Step 7: Run serving test to verify it fails**

Run: `pnpm --filter @ada/serving exec vitest run tests/ad.test.ts -t "budget counter is exhausted"`
Expected: FAIL — the creative is still served.

- [ ] **Step 8: Implement the serve-time gate**

In `apps/serving/src/routes/ad.ts`, after computing the eligible set but before/within `selectCreative`, drop creatives whose campaign counter is ≤ 0. Add a helper in `apps/serving/src/lib/analytics.ts`:

```ts
export async function getRemainingBudgets(campaignIds: string[]): Promise<Record<string, number>> {
  if (campaignIds.length === 0) return {};
  const redis = getRedis();
  const vals = await redis.mget<(number | null)[]>(...campaignIds.map((id) => `budget:${id}`));
  const out: Record<string, number> = {};
  campaignIds.forEach((id, i) => { out[id] = vals[i] ?? Number.POSITIVE_INFINITY; });
  return out;
}
```

In `ad.ts`, before selection:

```ts
import { getRemainingBudgets } from '../lib/analytics.js';
// ...
const campaignIds = Array.from(new Set(slot.activeCreatives.map((c) => c.campaignId)));
const budgets = await getRemainingBudgets(campaignIds);
const fundedSlot = { ...slot, activeCreatives: slot.activeCreatives.filter((c) => (budgets[c.campaignId] ?? Infinity) > 0) };
const creative = selectCreative(fundedSlot, { country, consent: consentParam, visitorImpressionsToday });
```

> A missing counter (`null` → `Infinity`) means "not yet seeded" and is treated as funded, so the slow-path `budgetExhausted` flag still protects it. The counter is the fast real-time gate.

- [ ] **Step 9: Run serving test to verify it passes**

Run: `pnpm --filter @ada/serving exec vitest run tests/ad.test.ts -t "budget counter is exhausted"`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/services/accrual.ts apps/api/src/lib/push-cache.ts apps/serving/src/routes/ad.ts apps/serving/src/lib/analytics.ts apps/api/tests/accrual.test.ts apps/serving/tests/ad.test.ts
git commit -m "feat: enforce campaign budget cap via Firestore source of truth + Redis serve-time gate"
```

---

### Task 7: Replay protection for signed click/impression

**Files:**
- Modify: `apps/serving/src/lib/crypto.ts` (add dedup helper)
- Modify: `apps/serving/src/routes/click.ts`, `apps/serving/src/routes/impression.ts`
- Test: `apps/serving/tests/click-impression.test.ts` (add cases)

- [ ] **Step 1: Write the failing test**

```ts
it('counts a replayed signed click only once', async () => {
  const ts = Date.now();
  const sig = createSignature('cre_a', 'slot_a', 'tok123', ts);
  const url = `/v1/click?s=slot_a&c=cre_a&t=tok123&ts=${ts}&sig=${sig}`;
  const first = await app.request(url, { headers: { 'CF-IPCountry': 'IS' } });
  const second = await app.request(url, { headers: { 'CF-IPCountry': 'IS' } });
  expect(first.status).toBe(302);
  expect(second.status).toBe(409); // replay rejected
});
```

> The Redis mock for this suite must implement `set(key, val, { nx: true, ... })` returning `'OK'` the first time and `null` the second.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ada/serving exec vitest run tests/click-impression.test.ts -t "replayed signed click"`
Expected: FAIL — second request also 302.

- [ ] **Step 3: Implement the dedup helper**

Add to `apps/serving/src/lib/crypto.ts`:

```ts
import { getRedis } from './redis.js';

/** Returns true if this signature is seen for the first time; false if it is a replay. */
export async function claimSignatureOnce(sig: string, ttlSeconds: number): Promise<boolean> {
  if (!sig) return false;
  const res = await getRedis().set(`seen:${sig}`, '1', { nx: true, ex: ttlSeconds });
  return res === 'OK';
}
```

In `click.ts`, after the existing signature/age validation passes, before recording the click:

```ts
import { claimSignatureOnce } from '../lib/crypto.js';
// CLICK_MAX_AGE_MS / 1000 as TTL:
const fresh = await claimSignatureOnce(sig, CLICK_MAX_AGE_MS / 1000);
if (!fresh) return c.text('Already counted', 409);
```

In `impression.ts`, in the signed (`else`) branch after validation passes, before `recordVisitorImpression` / `decrementBudget`:

```ts
import { claimSignatureOnce } from '../lib/crypto.js';
const fresh = await claimSignatureOnce(sig, IMPRESSION_MAX_AGE_MS / 1000);
if (!fresh) {
  return new Response(PIXEL, { status: 200, headers: { 'Content-Type': 'image/gif', 'Cache-Control': 'no-store' } });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @ada/serving exec vitest run tests/click-impression.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add apps/serving/src/lib/crypto.ts apps/serving/src/routes/click.ts apps/serving/src/routes/impression.ts apps/serving/tests/click-impression.test.ts
git commit -m "feat(serving): dedup signed click/impression to prevent replay inflation"
```

---

## Phase 3 — Category serving resolution (Approach A)

### Task 8: Resolve campaigns by category in `pushSlotCache`

**Files:**
- Modify: `apps/api/src/lib/push-cache.ts:64-107`
- Test: `apps/api/tests/push-cache.test.ts` (create if absent)

- [ ] **Step 1: Write the failing test**

```ts
it('includes a campaign whose category matches the slot publisher, and excludes a non-matching one', async () => {
  // publisher pub_food with categories ['matur']; active slot slot_food (300x250)
  // approved creative cre_food (300x250) for advertiser adv_active
  // campaign cmp_food targeting categories ['matur']; campaign cmp_travel targeting ['ferdalog']
  await seedCategoryFixture();
  await pushSlotCache('slot_food');
  const entry = await getRedis().get('slot:slot_food');
  const campaignIds = entry.activeCreatives.map((c) => c.campaignId);
  expect(campaignIds).toContain('cmp_food');
  expect(campaignIds).not.toContain('cmp_travel');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:api -- tests/push-cache.test.ts -t "category matches the slot publisher"`
Expected: FAIL — query still uses `targeting.slotIds`.

- [ ] **Step 3: Implement**

In `pushSlotCache`, replace the campaign query and the eligibility filter:

```ts
// 4. Fetch active campaigns whose categories intersect this publisher's categories
const campaignsSnapshot = await db
  .collection(COLLECTIONS.campaigns)
  .where('status', '==', 'active')
  .where('targeting.categories', 'array-contains-any', publisher.categories)
  .withConverter(campaignConverter)
  .get();

const campaigns = campaignsSnapshot.docs.map((doc) => doc.data());
```

Remove the `perPublisherApproval` check from `eligibleCampaigns` (the field no longer exists). Keep advertiser-status, budget, and schedule checks:

```ts
const eligibleCampaigns = campaigns.filter((campaign) => {
  if (advertiserStatusMap.get(campaign.advertiserId) !== 'active') return false;
  if (campaign.budget.remainingIsk <= 0) return false;
  if (campaign.schedule.endsAt.getTime() <= Date.now()) return false;
  return true;
});
```

In the `CachedCreative` mapping, set geo fields to empty (geo is backlog):

```ts
  geoCountries: [],
  geoRegions: [],
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:api -- tests/push-cache.test.ts -t "category matches the slot publisher"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/push-cache.ts apps/api/tests/push-cache.test.ts
git commit -m "feat(api): resolve campaigns to slots by category in push-cache"
```

---

### Task 9: Generalize `pushCacheForCampaign` to resolve slots by category

**Files:**
- Modify: `apps/api/src/lib/push-cache.ts:206-217`
- Test: `apps/api/tests/push-cache.test.ts` (add case)

- [ ] **Step 1: Write the failing test**

```ts
it('pushCacheForCampaign refreshes every slot whose publisher matches the campaign categories', async () => {
  await seedCategoryFixture(); // pub_food/slot_food in 'matur'; pub_travel/slot_travel in 'ferdalog'
  await getRedis().del('slot:slot_food');
  await pushCacheForCampaign('cmp_food'); // targets ['matur']
  expect(await getRedis().get('slot:slot_food')).not.toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:api -- tests/push-cache.test.ts -t "refreshes every slot whose publisher matches"`
Expected: FAIL — function reads `cmp.targeting.slotIds` (undefined → no slots refreshed).

- [ ] **Step 3: Implement**

```ts
export async function pushCacheForCampaign(campaignId: string): Promise<void> {
  const snap = await db
    .collection(COLLECTIONS.campaigns).doc(campaignId)
    .withConverter(campaignConverter).get();
  if (!snap.exists) return;
  const cmp = snap.data()!;

  // Find publishers in any of the campaign's categories
  const pubSnap = await db
    .collection(COLLECTIONS.publishers)
    .where('categories', 'array-contains-any', cmp.targeting.categories)
    .withConverter(publisherConverter)
    .get();
  const publisherIds = pubSnap.docs.map((d) => d.id);
  if (publisherIds.length === 0) return;

  // Refresh every active slot owned by those publishers
  for (const publisherId of publisherIds) {
    const slotSnap = await db
      .collection(COLLECTIONS.slots)
      .where('publisherId', '==', publisherId)
      .withConverter(slotConverter)
      .get();
    for (const slotDoc of slotSnap.docs) {
      await pushSlotCache(slotDoc.id);
    }
  }
}
```

> `slotConverter` is already imported in this file.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:api -- tests/push-cache.test.ts -t "refreshes every slot whose publisher matches"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/push-cache.ts apps/api/tests/push-cache.test.ts
git commit -m "feat(api): pushCacheForCampaign resolves slots by category"
```

---

## Phase 4 — Per-category inventory forecast

### Task 10: `GET /v1/categories/inventory`

**Files:**
- Create: `apps/api/src/services/inventory.ts`
- Create: `apps/api/src/routes/categories.ts`
- Modify: `apps/api/src/index.ts` (mount router)
- Test: `apps/api/tests/inventory.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('returns trailing 7-day average daily impressions per category', async () => {
  // pub_food in ['matur'] with 7 daily stats docs of 14000 impressions each
  await seedForecastFixture();
  const result = await getCategoryInventory();
  expect(result.find((r) => r.category === 'matur')!.avgDailyImpressions).toBe(14000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:api -- tests/inventory.test.ts`
Expected: FAIL — `getCategoryInventory` not defined.

- [ ] **Step 3: Implement the service**

`apps/api/src/services/inventory.ts`:

```ts
import { COLLECTIONS, publisherConverter } from '@ada/shared/firestore';
import { AD_CATEGORY_SLUGS } from '@ada/shared';
import { db } from '../lib/firebase.js';

export interface CategoryInventory {
  category: string;
  avgDailyImpressions: number;
}

function lastNDateKeys(n: number): string[] {
  const keys: string[] = [];
  const now = new Date();
  for (let i = 1; i <= n; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    keys.push(d.toISOString().split('T')[0]!.replace(/-/g, ''));
  }
  return keys;
}

export async function getCategoryInventory(): Promise<CategoryInventory[]> {
  const pubSnap = await db.collection(COLLECTIONS.publishers)
    .where('status', '==', 'active').withConverter(publisherConverter).get();

  const dateKeys = lastNDateKeys(7);
  const totalByCategory = new Map<string, number>();

  for (const pubDoc of pubSnap.docs) {
    const pub = pubDoc.data();
    let pubTotal = 0;
    for (const dk of dateKeys) {
      const statDoc = await db.doc(`${COLLECTIONS.stats}/publishers/${pub.id}/${dk}`).get();
      pubTotal += (statDoc.data()?.impressions ?? 0) as number;
    }
    const pubAvg = Math.round(pubTotal / dateKeys.length);
    for (const cat of pub.categories) {
      totalByCategory.set(cat, (totalByCategory.get(cat) ?? 0) + pubAvg);
    }
  }

  return AD_CATEGORY_SLUGS.map((category) => ({
    category,
    avgDailyImpressions: totalByCategory.get(category) ?? 0,
  }));
}
```

> The stats doc path mirrors `seed.ts` (`stats/publishers/{id}/{YYYYMMDD}`). If the project's `stats` collection helper differs, follow the existing read pattern used by the publisher stats endpoint.

- [ ] **Step 4: Implement the route + mount**

`apps/api/src/routes/categories.ts`:

```ts
import { Hono } from 'hono';
import type { Env } from '../lib/auth.js';
import { requireAuth } from '../lib/auth.js';
import { getCategoryInventory } from '../services/inventory.js';

export const categoriesRouter = new Hono<Env>();
categoriesRouter.use('*', requireAuth);
categoriesRouter.get('/inventory', async (c) => c.json(await getCategoryInventory()));
export default categoriesRouter;
```

In `apps/api/src/index.ts`, mount it alongside the other `/v1/*` routers:

```ts
import { categoriesRouter } from './routes/categories.js';
// ...
app.route('/v1/categories', categoriesRouter);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test:api -- tests/inventory.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/inventory.ts apps/api/src/routes/categories.ts apps/api/src/index.ts apps/api/tests/inventory.test.ts
git commit -m "feat(api): per-category inventory forecast endpoint"
```

---

## Phase 5 — Campaign creation + approval

### Task 11: Rewrite `createCampaign` for category targeting + auto-opt-in

**Files:**
- Modify: `apps/api/src/services/campaigns.ts`
- Test: `apps/api/tests/campaigns.test.ts` (update existing cases)

- [ ] **Step 1: Update/Write the failing test**

```ts
it('creates a category-targeted campaign that is active when creatives are approved', async () => {
  await seedApprovedCreative('cre_ok', 'adv_1');
  const cmp = await createCampaign('adv_1', {
    creativeIds: ['cre_ok'],
    categories: ['matur'],
    schedule: { startsAt: new Date(), endsAt: new Date(Date.now() + 86400000) },
    budget: { mode: 'cpm_capped', totalIsk: 50000 },
  });
  expect(cmp.targeting.categories).toEqual(['matur']);
  expect(cmp.status).toBe('active');
  expect((cmp as any).perPublisherApproval).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:api -- tests/campaigns.test.ts -t "category-targeted campaign"`
Expected: FAIL — input schema requires `slotIds`, builds `perPublisherApproval`.

- [ ] **Step 3: Implement**

Replace the input schema and creation logic in `campaigns.ts`:

```ts
import { AD_CATEGORY_SLUGS } from '@ada/shared';

const CreateCampaignInputSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  creativeIds: z.array(z.string()).min(1),
  categories: z.array(z.enum(AD_CATEGORY_SLUGS as [string, ...string[]])).min(1),
  schedule: z.object({ startsAt: z.coerce.date(), endsAt: z.coerce.date() }),
  budget: z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('cpm_capped'), totalIsk: z.number().int().positive() }),
    z.object({ mode: z.literal('slot_purchased'), totalIsk: z.number().int().positive() }),
  ]),
});
```

In `createCampaign`, delete the per-publisher approval block (lines building `perPublisherApproval`). Status now depends only on creative approval:

```ts
  const allCreativesApproved = await allCreativesAutoApproved(parsed.creativeIds);
  const status: CampaignStatus = allCreativesApproved ? 'active' : 'pending_approval';

  const campaign: Campaign = CampaignSchema.parse({
    id: generateId('cmp'),
    advertiserId,
    creativeIds: parsed.creativeIds,
    targeting: { categories: parsed.categories },
    schedule: parsed.schedule,
    budget: { mode: parsed.budget.mode, totalIsk: parsed.budget.totalIsk, remainingIsk: parsed.budget.totalIsk },
    status,
  });
```

Remove the now-unused imports `getSlot` and `getPublisherById` if nothing else uses them.

> **Per-publisher manual-approval valve:** the optional `requireManualApproval` valve is enforced at serve-resolution, not at campaign creation. In `pushSlotCache` (Task 8), when `publisher.contentPolicy.requireManualApproval` is true, only include creatives whose `reviewStatus === 'manual_approved'` for that publisher. Add this guard in the creative loop:
> ```ts
> if (publisher.contentPolicy.requireManualApproval && creative.reviewStatus !== 'manual_approved') continue;
> ```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:api -- tests/campaigns.test.ts -t "category-targeted campaign"`
Expected: PASS.

- [ ] **Step 5: Update the campaign route handler**

In the campaigns route (`apps/api/src/routes/campaigns.ts`), update the request body type/validation to pass `categories` instead of `slotIds` through to `createCampaign`. Run the route tests: `pnpm test:api -- tests/campaigns.test.ts`. Fix any remaining `slotIds` references until green.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/campaigns.ts apps/api/src/routes/campaigns.ts apps/api/tests/campaigns.test.ts apps/api/src/lib/push-cache.ts
git commit -m "feat(api): create campaigns by category, auto-opt-in, manual-approval valve"
```

---

### Task 12: Fix remaining `slotIds` / `perPublisherApproval` references + seed script

**Files:**
- Modify: `apps/api/src/scripts/seed.ts`, `apps/api/src/routes/widgets.ts`, any approvals/admin code referencing `perPublisherApproval` (surfaced by Task 3 Step 5)
- Test: existing suites

- [ ] **Step 1: Find all references**

Run:
```bash
grep -rn "perPublisherApproval\|targeting.slotIds\|slotIds:" apps/api/src apps/mcp/src --include="*.ts" | grep -v "/dist/"
```
Expected: a list of call sites in seed.ts, widgets.ts, possibly approvals.ts/admin.

- [ ] **Step 2: Update each site**

- `seed.ts`: give `pub_demo_id` a `categories` field (e.g. `['matur']`), change campaign `targeting` to `{ categories: ['matur'] }`, and remove `perPublisherApproval`.
- `widgets.ts` / any campaign builder: replace `targeting: { slotIds }` with `targeting: { categories }`.
- `approvals.ts`: remove any per-publisher approval transitions; keep creative-level approval and the existing refund-on-reject logic.

- [ ] **Step 3: Typecheck the whole api package**

Run: `pnpm --filter @ada/api typecheck`
Expected: PASS (no references to removed fields).

- [ ] **Step 4: Run the full api suite**

Run: `pnpm test:api`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src
git commit -m "refactor(api): migrate remaining call sites to category targeting"
```

---

## Phase 6 — Dashboard

> These tasks follow existing dashboard patterns (TanStack Query hooks in `src/hooks/`, `apiFetch` from `src/lib/api`, Card/Button/Input components, Icelandic copy). Each task ends with `pnpm --filter @ada/dashboard typecheck` and a commit. Dashboard has no emulator dependency.

### Task 13: Publisher category selection (onboarding + settings)

**Files:**
- Modify: `apps/dashboard/src/pages/publisher/Onboarding.tsx`
- Modify: `apps/dashboard/src/pages/publisher/Settings.tsx`
- Modify: `apps/dashboard/src/hooks/usePublisher.ts` (include `categories` in create payload)

- [ ] **Step 1:** Import `AD_CATEGORIES` from `@ada/shared`. In Onboarding step 2, render a multi-select chip group bound to a `categories: string[]` state, pre-filled from the classifier's mapped guess (default to the single best-guess category; user can add/remove). Validate at least one selected before submit.
- [ ] **Step 2:** Include `categories` in the `useCreatePublisher` mutation payload and in the publisher update payload in Settings (so a publisher can change categories later). Mirror the existing `vatNumber` wiring added in Settings.
- [ ] **Step 3:** Run `pnpm --filter @ada/dashboard typecheck`. Expected: PASS.
- [ ] **Step 4:** Commit: `git commit -m "feat(dashboard): publisher selects content categories"`

### Task 14: Advertiser category buy flow + forecast

**Files:**
- Modify: `apps/dashboard/src/pages/advertiser/` campaign-creation page (the page that currently collects slot selection)
- Create: `apps/dashboard/src/hooks/useCategoryInventory.ts`

- [ ] **Step 1:** Create `useCategoryInventory` hook:
```ts
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
export function useCategoryInventory() {
  return useQuery({
    queryKey: ['categories', 'inventory'],
    queryFn: () => apiFetch<{ category: string; avgDailyImpressions: number }[]>('/v1/categories/inventory'),
  });
}
```
- [ ] **Step 2:** Replace slot selection in the campaign-creation form with an `AD_CATEGORIES` multi-select. For each category show the forecast from `useCategoryInventory` (e.g. "matur ≈ 240.000 birtingar/dag"). Send `categories` (not `slotIds`) in the create-campaign mutation.
- [ ] **Step 3:** Show an estimated-reach line from the chosen budget: `~round(totalIsk / FLAT_CPM_ISK * 1000)` impressions, and compare against the summed forecast of selected categories.
- [ ] **Step 4:** Run `pnpm --filter @ada/dashboard typecheck`. Expected: PASS.
- [ ] **Step 5:** Commit: `git commit -m "feat(dashboard): category buy flow with inventory forecast"`

### Task 15: Remove slot-picking UI + per-publisher approval UI

**Files:**
- Modify/Delete: any advertiser slot-search/selection components, admin per-publisher approval views

- [ ] **Step 1:** Remove the advertiser-facing slot search/selection UI and any "approve campaign for my slot" publisher UI (approval is now creative-level only, handled by admin). Keep the publisher's optional "require manual approval" toggle (it maps to `contentPolicy.requireManualApproval`).
- [ ] **Step 2:** Run `pnpm --filter @ada/dashboard typecheck && pnpm --filter @ada/dashboard test`. Expected: PASS.
- [ ] **Step 3:** Commit: `git commit -m "refactor(dashboard): drop slot-picking and per-publisher approval UI"`

---

## Final verification

- [ ] `pnpm --filter @ada/shared build`
- [ ] `pnpm typecheck` (all packages)
- [ ] `pnpm test:api` (emulator)
- [ ] `pnpm --filter @ada/serving test` (emulator/Redis mocks)
- [ ] `pnpm --filter @ada/shared test && pnpm --filter @ada/dashboard test`
- [ ] `pnpm lint`

---

## Self-review (plan vs spec)

- §1 taxonomy → Task 1; publisher categories → Task 2, classifier-confirm UI → Task 13.
- §2 targeting categories-only → Task 3; campaign creation → Task 11; forecast → Task 10 + Task 14.
- §3 serving Approach A → Tasks 8–9; hot path filtering for budget → Task 6.
- §4 billing: flat-CPM lock → Task 4; rounding → Task 5; budget cap → Task 6; replay → Task 7.
- §5 approval: auto-opt-in → Task 11; manual valve → Task 11 (push-cache guard); UI → Task 15.
- Migration of leftover references → Task 12.

No placeholders; type/field names (`categories`, `avgDailyImpressions`, `claimSignatureOnce`, `getRemainingBudgets`) are consistent across tasks.

---

## Backlog (carried from spec — not implemented here)

1. **Geo/region targeting** (capital / countryside) — needs IP→region geolocation.
2. **Budget pacing** — even delivery across the campaign flight (v1 burns fast).
3. **Forecast subtracts committed/sold budget** from available daily impressions.
4. **Creative content-category blocking** — categorize creatives so a publisher can exclude specific ad types.
