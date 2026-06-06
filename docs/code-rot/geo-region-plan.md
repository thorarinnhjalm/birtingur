# Geo / Region Targeting (capital vs countryside) — Implementation Plan

> **For agentic workers (Gemini):** This is the ONLY plan to execute right now. Do **not** touch
> the other plan files in this folder. Do tasks in order (G1 → G4). After EACH task, append a report
> entry to `IMPLEMENTATION-LOG.md` (template at the bottom): status, commit SHA, files, **real
> verification output**, deviations, questions. Claude reviews each entry.

**Goal:** Let an advertiser optionally restrict a campaign to **capital** (höfuðborgarsvæðið) or
**countryside** (landsbyggð); serving only shows the ad to visitors in the targeted region.

**Design decisions (made by Claude; stated, do not re-litigate):**

1. **Region source = Vercel edge geo headers** (serving runs on Vercel): read
   `x-vercel-ip-city` (primary) and fall back to `x-vercel-ip-country-region`. No new geo-IP infra.
   (Today serving reads the Cloudflare `CF-IPCountry` header for country; the Vercel headers are
   added by Vercel automatically and are available on the request.)
2. **capital vs countryside** = a fixed capital-area city set → `capital`; any other Icelandic city
   → `countryside`; missing/unknown city → `unknown`.
3. **No consent gate.** Region is derived from IP at request time (not a cookie / not PII), so it is
   applied regardless of `consent` — unlike the existing per-visitor frequency cap.
4. **Fail-open.** A creative with no `geoRegions` (or containing `all`) is unrestricted. If the
   visitor region is `unknown`, do **not** filter it out (show the ad) — never hide ads because geo
   lookup was empty.
5. `GeoRegionSchema` (`all | capital | countryside`) already exists in
   `packages/shared/src/schemas/campaign.ts` and `CachedCreative.geoRegions` already exists; this
   plan wires them through (push-cache currently hard-codes `geoRegions: []`).

**Tech Stack:** TypeScript (ESM, `.js` imports), Zod, Hono, Vitest, React 19 + TanStack Query.
`pnpm verify` before each commit. `@ada/api`/`@ada/serving` emulator tests need Java; serving route
tests here are Redis-mocked.

---

## Task G1: Re-add optional `geoRegions` to `TargetingSchema`

**Files:**

- Modify: `packages/shared/src/schemas/campaign.ts`
- Test: `packages/shared/tests/campaign.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('accepts optional geoRegions on targeting', () => {
  const t = TargetingSchema.parse({ categories: ['matur'], geoRegions: ['capital'] });
  expect(t.geoRegions).toEqual(['capital']);
  // still valid without geoRegions
  expect(TargetingSchema.parse({ categories: ['matur'] }).geoRegions).toBeUndefined();
});
it('rejects an invalid region', () => {
  expect(() => TargetingSchema.parse({ categories: ['matur'], geoRegions: ['mars'] })).toThrow();
});
```

- [ ] **Step 2: Run it to verify it fails** — `pnpm --filter @ada/shared test -- tests/campaign.test.ts -t "geoRegions"` → FAIL.

- [ ] **Step 3: Implement** — in `campaign.ts`, add the field to `TargetingSchema` (re-use the
      existing `GeoRegionSchema`):

```ts
export const TargetingSchema = z.object({
  categories: z.array(z.enum(AD_CATEGORY_SLUGS as [string, ...string[]])).min(1),
  geoRegions: z.array(GeoRegionSchema).optional(),
});
```

- [ ] **Step 4: Run it to verify it passes** — `pnpm --filter @ada/shared test -- tests/campaign.test.ts && pnpm --filter @ada/shared build` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(shared): optional geoRegions on campaign targeting (Task G1)"`
- [ ] **Step 6: Append report entry.**

---

## Task G2: Carry `geoRegions` into the slot cache

**Files:**

- Modify: `apps/api/src/lib/push-cache.ts` (the `CachedCreative` mapping — currently sets `geoRegions: []`)
- Test: `apps/api/tests/push-cache.test.ts`

- [ ] **Step 1: Write the failing test** — a campaign targeting `geoRegions: ['capital']` produces a
      cached creative with `geoRegions: ['capital']`.

```ts
it('passes campaign targeting.geoRegions into the cached creative', async () => {
  await seedGeoFixture(); // campaign cmp_geo targeting categories ['matur'], geoRegions ['capital']
  await pushSlotCache('slot_geo');
  const entry = await getRedis().get('slot:slot_geo');
  const c = entry.activeCreatives.find((x) => x.campaignId === 'cmp_geo');
  expect(c.geoRegions).toEqual(['capital']);
});
```

- [ ] **Step 2: Run it to verify it fails** — `pnpm test:api -- tests/push-cache.test.ts -t "geoRegions"` → FAIL (cached value is `[]`).

- [ ] **Step 3: Implement** — in `push-cache.ts`, in the `activeCreatives.push({ ... })` object,
      replace `geoRegions: []` with `geoRegions: campaign.targeting.geoRegions ?? []`. (Leave
      `geoCountries: []` as-is — country targeting is out of scope here.)

- [ ] **Step 4: Run it to verify it passes** — `pnpm test:api -- tests/push-cache.test.ts` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(api): carry campaign geoRegions into slot cache (Task G2)"`
- [ ] **Step 6: Append report entry.**

---

## Task G3: Derive visitor region and filter in serving

**Files:**

- Create: `apps/serving/src/lib/geo.ts` (region derivation)
- Modify: `apps/serving/src/lib/select.ts` (filter by region in `isEligible`)
- Modify: `apps/serving/src/routes/ad.ts` (derive region from headers, pass into selection ctx)
- Test: `apps/serving/tests/geo.test.ts` (unit) and `apps/serving/tests/ad-route.test.ts` (gate)

- [ ] **Step 1: Write the failing unit test** (`apps/serving/tests/geo.test.ts`)

```ts
import { describe, it, expect } from 'vitest';
import { regionFromHeaders } from '../src/lib/geo';

describe('regionFromHeaders', () => {
  it('maps a capital-area city to capital', () => {
    expect(regionFromHeaders({ 'x-vercel-ip-city': 'Reykjavik' })).toBe('capital');
    expect(regionFromHeaders({ 'x-vercel-ip-city': 'Kópavogur' })).toBe('capital');
  });
  it('maps other Icelandic cities to countryside', () => {
    expect(regionFromHeaders({ 'x-vercel-ip-city': 'Akureyri' })).toBe('countryside');
  });
  it('returns unknown when no city header', () => {
    expect(regionFromHeaders({})).toBe('unknown');
  });
});
```

- [ ] **Step 2: Run it to verify it fails** — `pnpm --filter @ada/serving exec vitest run tests/geo.test.ts` → FAIL.

- [ ] **Step 3: Implement `geo.ts`**

```ts
export type VisitorRegion = 'capital' | 'countryside' | 'unknown';

// Höfuðborgarsvæðið. Normalised (lowercased, accents kept) — Vercel sends city names like
// "Reykjavik"/"Reykjavík"; compare case-insensitively and accent-insensitively.
const CAPITAL_CITIES = [
  'reykjavik',
  'kopavogur',
  'hafnarfjordur',
  'gardabaer',
  'mosfellsbaer',
  'seltjarnarnes',
  'alftanes',
];

function normalise(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function regionFromHeaders(headers: Record<string, string | undefined>): VisitorRegion {
  const city = headers['x-vercel-ip-city'];
  if (!city) return 'unknown';
  return CAPITAL_CITIES.includes(normalise(city)) ? 'capital' : 'countryside';
}
```

- [ ] **Step 4: Add region to selection + filter** — in `apps/serving/src/lib/select.ts`:
  - extend `SelectionContext` with `region: VisitorRegion` (import the type from `./geo.js`);
  - in `isEligible`, after the existing checks, add (applies regardless of consent — IP-based):

```ts
// Region targeting (fail-open): only filter when the creative restricts regions, the visitor
// region is known, and 'all' is not present.
const regions = c.geoRegions ?? [];
if (regions.length > 0 && !regions.includes('all') && ctx.region !== 'unknown') {
  if (!regions.includes(ctx.region)) return false;
}
```

- [ ] **Step 5: Pass region in `ad.ts`** — derive and include it in the `selectCreative` context:

```ts
import { regionFromHeaders } from '../lib/geo.js';
// ...
const region = regionFromHeaders({
  'x-vercel-ip-city': c.req.header('x-vercel-ip-city'),
});
const creative = selectCreative(fundedSlot, {
  country,
  consent: consentParam,
  visitorImpressionsToday,
  region,
});
```

(Apply the same `region` to the demo/dev fallback `selectCreative` call if there is one.)

- [ ] **Step 6: Write the gate test** in `ad-route.test.ts` — a creative with `geoRegions:['capital']`
      is dropped when the request city is `Akureyri` (countryside) and served when the city is `Reykjavik`.
      Set the `x-vercel-ip-city` header in `app.request(..., { headers })`.

- [ ] **Step 7: Run tests** — `pnpm --filter @ada/serving exec vitest run tests/geo.test.ts tests/ad-route.test.ts` → PASS.
- [ ] **Step 8: Commit** — `git commit -m "feat(serving): region targeting via Vercel geo headers, fail-open (Task G3)"`
- [ ] **Step 9: Append report entry.**

---

## Task G4: Region selector in the buy flow

**Files:**

- Modify: `apps/dashboard/src/pages/advertiser/CampaignCreate.tsx`
- Modify: campaign-create hook/payload (wherever the create-campaign mutation builds `targeting`)

- [ ] **Step 1:** Add an optional region selector to `CampaignCreate.tsx` — three choices presented
      to the advertiser: **Allt land** (default → send no `geoRegions`, or `['all']`), **Höfuðborgarsvæðið**
      (`['capital']`), **Landsbyggðin** (`['countryside']`). Default = Allt land.
- [ ] **Step 2:** Include `geoRegions` in the campaign-create payload's `targeting` only when not
      "Allt land" (omit or `['all']` otherwise). Confirm the create-campaign API/service accepts
      `targeting.geoRegions` (G1 added it to the schema; the campaigns service builds `targeting` — ensure
      it forwards `geoRegions`).
- [ ] **Step 3: Verify** — `pnpm --filter @ada/dashboard typecheck && pnpm --filter @ada/dashboard lint && pnpm format:check` → pass; if the campaigns API input schema needs `geoRegions` added, do so and run `pnpm test:api -- tests/campaigns.test.ts`.
- [ ] **Step 4: Commit** — `git commit -m "feat(dashboard): optional capital/countryside region selector in buy flow (Task G4)"`
- [ ] **Step 5: Append report entry.**

---

## Final verification

- `pnpm --filter @ada/shared build && pnpm verify` → pass.
- `pnpm --filter @ada/serving test` + `pnpm test:api -- tests/push-cache.test.ts tests/campaigns.test.ts`
  → green (note explicitly if Java/emulator unavailable).
- Manual: create a `capital`-targeted campaign; confirm it serves from a Reykjavík IP and not from a
  rural IP (or simulate via the `x-vercel-ip-city` header).

## Self-review

- G1 schema → G2 cache → G3 serving filter → G4 buy-flow UI: the full path, fail-open everywhere.
- Names consistent: `geoRegions`, `regionFromHeaders`, `VisitorRegion`, `x-vercel-ip-city`.
- **Operator note:** confirm the `CAPITAL_CITIES` list matches the city strings Vercel actually emits
  for the höfuðborgarsvæði (check a real request's `x-vercel-ip-city` in prod logs); adjust if needed.
- Out of scope: country-level targeting (`geoCountries`), finer municipalities, consent interaction
  changes beyond region.
