# Creative Brand Safety & Inventory Forecast Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make publisher creative-category blocking actually work (sensitive-category taxonomy, fail-closed) and make the category inventory forecast flight-aware, with a soft oversell warning in the buy flow.

**Architecture:** A new `SENSITIVE_AD_CATEGORIES` taxonomy in `@ada/shared` flows through auto-scan (Gemini + stub) onto `creative.autoScanResult.sensitiveCategories`, is enforced at cache-build time in `push-cache.ts` (no hot-path change), and is surfaced via `/v1/categories/content` to dashboard/MCP. The forecast in `inventory.ts` spreads committed budget over the actual flight window and counts `pending_approval` campaigns; the dashboard buy flow warns when a purchase exceeds available daily impressions.

**Tech Stack:** TypeScript ESM monorepo (Turborepo + pnpm), Zod, Hono, firebase-admin, Vitest (Firestore emulator for `@ada/api` tests), React 19.

**Spec:** `docs/superpowers/specs/2026-06-10-brand-safety-and-forecast-design.md` — read it first.

---

## Critical context for the implementer

- **ESM imports:** relative imports inside a package use the `.js` extension (`from '../constants.js'`) even though sources are `.ts`.
- **`@ada/shared` is the dependency root.** After editing anything in `packages/shared`, run `pnpm --filter @ada/shared build` before typechecking/running downstream packages.
- **Firestore converters Zod-parse on read** (`packages/shared/src/firestore/converters.ts:64`). This is why `sensitiveCategories` must be `.optional()` and NOT `.default([])` — a default would turn unscanned creatives into "scanned, clean" on read and defeat fail-closed. It is also why `ContentPolicySchema.blockedCategories` stays `z.array(z.string())` (tightening it to an enum would make existing publisher docs with stale slugs unreadable); validation of *new* values happens in the publishers service instead.
- **Running API tests:** the full suite is `pnpm test:api` from the repo root (wraps the Firestore emulator; needs Java on PATH). A single file is:
  `firebase --config firebase/firebase.json emulators:exec 'pnpm --filter @ada/api test -- tests/<file>.test.ts'`
  Shared and dashboard tests are plain vitest: `pnpm --filter @ada/shared test`, `pnpm --filter @ada/dashboard test`.
- **Commit after every task.** Run `pnpm verify` (format:check + typecheck + lint) before each commit; `pnpm format` fixes formatting.

### File map

| File | Change |
|---|---|
| `packages/shared/src/constants.ts` | Add `SENSITIVE_AD_CATEGORIES` taxonomy |
| `packages/shared/src/schemas/advertiser.ts` | Add `sensitiveCategories` to `AutoScanResultSchema` |
| `packages/shared/tests/schemas-advertiser.test.ts` | Schema tests (optional-not-defaulted) |
| `apps/api/src/services/auto-scan/stub.ts` + `gemini.ts` | Return `sensitiveCategories` |
| `apps/api/tests/auto-scan.test.ts` | Stub scanner tests |
| `apps/api/src/lib/push-cache.ts` | New blocking check (filter stale, intersect, fail-closed) + flight-aware `pace_limit` |
| `apps/api/tests/push-cache.test.ts` | Rewrite blocked-category test, add fail-closed/stale/pace tests |
| `apps/api/src/services/domain-classifier.ts` | `getAllowedCategories()` returns sensitive taxonomy |
| `apps/api/tests/categories-content.test.ts` | Update endpoint shape assertions |
| `apps/api/src/services/publishers.ts` | Validate `blockedCategories` on create/update |
| `apps/api/tests/publishers.test.ts` | Validation tests, fix `samplePolicy` fixture |
| `apps/mcp/src/tools/publisher/set-content-policy.ts` | Enum-validate input, list slugs in description |
| `apps/api/src/services/inventory.ts` | Flight-aware committed math, count `pending_approval` |
| `apps/api/tests/inventory.test.ts` | Add `startsAt` to fixtures, new tests |
| `apps/api/src/scripts/rescan-creatives.ts` (new) | Backfill script |
| `apps/api/package.json` | `rescan-creatives` script entry |
| `apps/dashboard/src/hooks/useContentCategories.ts` | Response type `{slug,label}[]` |
| `apps/dashboard/src/pages/publisher/Settings.tsx` | Render new taxonomy, drop `CATEGORY_LABEL_MAP` |
| `apps/dashboard/src/pages/advertiser/CampaignCreate.tsx` | Soft oversell warning in step 3 |

---

### Task 1: Shared taxonomy + schema field

**Files:**
- Modify: `packages/shared/src/constants.ts` (after the `AD_CATEGORY_SLUGS` block, ~line 97)
- Modify: `packages/shared/src/schemas/advertiser.ts`
- Test: `packages/shared/tests/schemas-advertiser.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `packages/shared/tests/schemas-advertiser.test.ts` (it already imports from `../src/index.js` or similar — match the file's existing import path for `AutoScanResultSchema`; add the import if missing):

```ts
describe('AutoScanResultSchema.sensitiveCategories', () => {
  const base = { nsfwScore: 0.1, blockedTerms: [], category: 'retail', confidence: 0.9 };

  it('stays undefined when absent (unscanned ≠ scanned-clean)', () => {
    const parsed = AutoScanResultSchema.parse(base);
    expect(parsed.sensitiveCategories).toBeUndefined();
  });

  it('round-trips an empty array (scanned, clean)', () => {
    const parsed = AutoScanResultSchema.parse({ ...base, sensitiveCategories: [] });
    expect(parsed.sensitiveCategories).toEqual([]);
  });

  it('accepts valid sensitive slugs and rejects unknown ones', () => {
    const ok = AutoScanResultSchema.parse({ ...base, sensitiveCategories: ['afengi', 'vedmal'] });
    expect(ok.sensitiveCategories).toEqual(['afengi', 'vedmal']);
    expect(() =>
      AutoScanResultSchema.parse({ ...base, sensitiveCategories: ['gambling'] }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @ada/shared test -- tests/schemas-advertiser.test.ts`
Expected: FAIL — the two array cases fail (`sensitiveCategories` stripped by the current schema), the rejection case fails (no error thrown).

- [ ] **Step 3: Implement**

In `packages/shared/src/constants.ts`, directly after the `AdCategory` type export (~line 97):

```ts
/**
 * Sensitive creative categories publishers can block (brand safety).
 * A creative carries 0..n of these flags from auto-scan; publishers block from this list.
 * Note: alcohol, tobacco and gambling advertising are also legally restricted in Iceland —
 * these flags enable future admin enforcement, but legal enforcement is not done here.
 */
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

export const SENSITIVE_AD_CATEGORY_SLUGS = SENSITIVE_AD_CATEGORIES.map(
  (c) => c.slug,
) as readonly string[];
export type SensitiveAdCategory = (typeof SENSITIVE_AD_CATEGORIES)[number]['slug'];
```

In `packages/shared/src/schemas/advertiser.ts`, add the import at the top:

```ts
import { SENSITIVE_AD_CATEGORY_SLUGS } from '../constants.js';
```

and change `AutoScanResultSchema` to:

```ts
export const AutoScanResultSchema = z.object({
  nsfwScore: z.number().min(0).max(1),
  blockedTerms: z.array(z.string()),
  category: z.string().min(1),
  confidence: z.number().min(0).max(1),
  // Deliberately .optional(), NOT .default([]): converters parse on read, and absence
  // must keep meaning "never scanned for sensitive flags" (fail-closed in push-cache).
  sensitiveCategories: z
    .array(z.enum(SENSITIVE_AD_CATEGORY_SLUGS as [string, ...string[]]))
    .optional(),
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @ada/shared test`
Expected: PASS (whole shared suite — confirms no other schema test broke).

- [ ] **Step 5: Rebuild shared and verify**

Run: `pnpm --filter @ada/shared build && pnpm verify`
Expected: build succeeds; verify passes.

- [ ] **Step 6: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): sensitive ad-category taxonomy + creative sensitiveCategories field"
```

---

### Task 2: Auto-scan returns sensitive flags

**Files:**
- Modify: `apps/api/src/services/auto-scan/stub.ts`
- Modify: `apps/api/src/services/auto-scan/gemini.ts`
- Test: `apps/api/tests/auto-scan.test.ts`

- [ ] **Step 1: Write the failing tests**

Append inside the existing `describe('StubAutoScanner', …)` in `apps/api/tests/auto-scan.test.ts` (match the file's existing scanner construction — it instantiates `StubAutoScanner` at the top):

```ts
it('returns sensitiveCategories: [] for a clean creative (scanned-clean, not absent)', async () => {
  const res = await scanner.scan({
    imageUrl: 'https://example.com/clean.png',
    clickUrl: 'https://example.com/landing',
  });
  expect(res.scanResult.sensitiveCategories).toEqual([]);
});

it('flags gambling terms as vedmal', async () => {
  const res = await scanner.scan({
    imageUrl: 'https://example.com/casino.png',
    clickUrl: 'https://example.com/landing',
    ocrTextHint: 'best casino bonus',
  });
  expect(res.scanResult.sensitiveCategories).toEqual(['vedmal']);
});
```

(If the file constructs the scanner per-test instead of a shared `scanner` const, follow that pattern.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `firebase --config firebase/firebase.json emulators:exec 'pnpm --filter @ada/api test -- tests/auto-scan.test.ts'`
Expected: FAIL — `sensitiveCategories` is `undefined` in both new tests.

- [ ] **Step 3: Implement stub**

In `apps/api/src/services/auto-scan/stub.ts`, add a gambling-term set above the class and set the field in all three return branches:

```ts
const GAMBLING_TERMS = ['casino', 'gambling', 'fjárhættuspil', 'bet365'];
```

- blocked-terms branch (`found.length > 0`): add to `scanResult`:
  `sensitiveCategories: found.some((t) => GAMBLING_TERMS.includes(t)) ? ['vedmal'] : [],`
- suspicious-URL branch: add `sensitiveCategories: [],`
- clean branch: add `sensitiveCategories: [],`

- [ ] **Step 4: Implement gemini**

In `apps/api/src/services/auto-scan/gemini.ts`:

Add import at the top:

```ts
import { SENSITIVE_AD_CATEGORY_SLUGS } from '@ada/shared';
```

Extend the prompt (after item 4 in the numbered list):

```
5. Sensitive-category flags. Return every flag that applies from exactly this list
   (return [] if none apply):
   afengi (alcohol), vedmal (gambling/betting/lotteries), stefnumot (dating services),
   rafmyntir (crypto/high-risk investments), megrun_utlit (weight loss/cosmetic procedures),
   politik (politics), trumal (religion), tobak_veip (tobacco/vaping),
   kynlifstengt (sexually suggestive content)
```

Add to the `responseSchema.properties`:

```ts
sensitiveCategories: {
  type: 'ARRAY',
  items: { type: 'STRING' },
  description:
    'Sensitive flags that apply, from: afengi, vedmal, stefnumot, rafmyntir, megrun_utlit, politik, trumal, tobak_veip, kynlifstengt. Empty array if none.',
},
```

and add `'sensitiveCategories'` to the `required` array.

In the parsing block (after the `confidence` line), filter to known slugs so a hallucinated
value can never fail the downstream `CreativeSchema.parse`:

```ts
const sensitiveCategories: string[] = Array.isArray(parsed.sensitiveCategories)
  ? parsed.sensitiveCategories.filter((s: unknown) =>
      (SENSITIVE_AD_CATEGORY_SLUGS as readonly string[]).includes(String(s)),
    )
  : [];
```

and include it in the return:

```ts
scanResult: { nsfwScore, blockedTerms, category, confidence, sensitiveCategories },
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `firebase --config firebase/firebase.json emulators:exec 'pnpm --filter @ada/api test -- tests/auto-scan.test.ts'`
Expected: PASS.

- [ ] **Step 6: Verify and commit**

```bash
pnpm verify
git add apps/api/src/services/auto-scan apps/api/tests/auto-scan.test.ts
git commit -m "feat(api): auto-scan classifies creatives into sensitive categories"
```

---

### Task 3: push-cache blocking — intersect, filter stale, fail-closed

**Files:**
- Modify: `apps/api/src/lib/push-cache.ts`
- Test: `apps/api/tests/push-cache.test.ts`

- [ ] **Step 1: Rewrite/add the tests**

In `apps/api/tests/push-cache.test.ts`, **replace** the existing test
`'filters out creatives matching blocked categories'` (~line 213) with the following three
tests (same fixture style; note `sensitiveCategories` replaces the old `category` matching):

```ts
it('filters out creatives whose sensitiveCategories intersect blockedCategories', async () => {
  mockState.slot = {
    id: 'slot_123',
    publisherId: 'pub_123',
    status: 'active',
    sizes: [{ width: 300, height: 250 }],
    pricing: { mode: 'cpm', cpmIsk: 200 },
  };
  mockState.publisher = {
    id: 'pub_123',
    status: 'active',
    categories: ['taekni'],
    contentPolicy: { blockedCategories: ['vedmal'] },
  };
  mockState.campaigns = [
    {
      id: 'camp_1',
      status: 'active',
      creativeIds: ['creative_clean', 'creative_gambling'],
      budget: { remainingIsk: 1000, mode: 'cpm_capped' },
      schedule: { startsAt: new Date(Date.now() - 10000), endsAt: new Date(Date.now() + 10000) },
      targeting: { categories: ['taekni'] },
    },
  ];
  mockState.creatives = [
    {
      id: 'creative_clean',
      reviewStatus: 'auto_approved',
      width: 300,
      height: 250,
      imageUrl: 'https://ex.com/1.png',
      clickUrl: 'https://ex.com/1',
      autoScanResult: { category: 'retail', sensitiveCategories: [] },
    },
    {
      id: 'creative_gambling',
      reviewStatus: 'manual_approved',
      width: 300,
      height: 250,
      imageUrl: 'https://ex.com/2.png',
      clickUrl: 'https://ex.com/2',
      autoScanResult: { category: 'entertainment', sensitiveCategories: ['vedmal', 'rafmyntir'] },
    },
  ];

  await pushSlotCache('slot_123');

  const entry = mockRedisSet.mock.calls.find((c: any) => c[0].startsWith('slot:'))?.[1];
  expect(entry.activeCreatives).toHaveLength(1);
  expect(entry.activeCreatives[0].creativeId).toBe('creative_clean');
});

it('fail-closed: excludes unscanned creatives when the publisher blocks anything', async () => {
  mockState.slot = {
    id: 'slot_123',
    publisherId: 'pub_123',
    status: 'active',
    sizes: [{ width: 300, height: 250 }],
    pricing: { mode: 'cpm', cpmIsk: 200 },
  };
  mockState.publisher = {
    id: 'pub_123',
    status: 'active',
    categories: ['taekni'],
    contentPolicy: { blockedCategories: ['afengi'] },
  };
  mockState.campaigns = [
    {
      id: 'camp_1',
      status: 'active',
      creativeIds: ['creative_unscanned'],
      budget: { remainingIsk: 1000, mode: 'cpm_capped' },
      schedule: { startsAt: new Date(Date.now() - 10000), endsAt: new Date(Date.now() + 10000) },
      targeting: { categories: ['taekni'] },
    },
  ];
  mockState.creatives = [
    {
      id: 'creative_unscanned',
      reviewStatus: 'auto_approved',
      width: 300,
      height: 250,
      imageUrl: 'https://ex.com/1.png',
      clickUrl: 'https://ex.com/1',
      autoScanResult: { category: 'retail' }, // no sensitiveCategories → never scanned for flags
    },
  ];

  await pushSlotCache('slot_123');

  const entry = mockRedisSet.mock.calls.find((c: any) => c[0].startsWith('slot:'))?.[1];
  expect(entry.activeCreatives).toHaveLength(0);
});

it('ignores stale non-sensitive slugs in blockedCategories (no fail-closed from them)', async () => {
  mockState.slot = {
    id: 'slot_123',
    publisherId: 'pub_123',
    status: 'active',
    sizes: [{ width: 300, height: 250 }],
    pricing: { mode: 'cpm', cpmIsk: 200 },
  };
  mockState.publisher = {
    id: 'pub_123',
    status: 'active',
    categories: ['taekni'],
    // Legacy values from the old (broken) UI — must be treated as if nothing is blocked
    contentPolicy: { blockedCategories: ['Gambling', 'matur'] },
  };
  mockState.campaigns = [
    {
      id: 'camp_1',
      status: 'active',
      creativeIds: ['creative_unscanned'],
      budget: { remainingIsk: 1000, mode: 'cpm_capped' },
      schedule: { startsAt: new Date(Date.now() - 10000), endsAt: new Date(Date.now() + 10000) },
      targeting: { categories: ['taekni'] },
    },
  ];
  mockState.creatives = [
    {
      id: 'creative_unscanned',
      reviewStatus: 'auto_approved',
      width: 300,
      height: 250,
      imageUrl: 'https://ex.com/1.png',
      clickUrl: 'https://ex.com/1',
      autoScanResult: { category: 'retail' },
    },
  ];

  await pushSlotCache('slot_123');

  const entry = mockRedisSet.mock.calls.find((c: any) => c[0].startsWith('slot:'))?.[1];
  expect(entry.activeCreatives).toHaveLength(1); // stale slugs filtered → nothing blocked
  expect(entry.blockedCategories).toEqual([]); // cache entry carries the filtered list
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `firebase --config firebase/firebase.json emulators:exec 'pnpm --filter @ada/api test -- tests/push-cache.test.ts'`
Expected: FAIL — fail-closed test serves the creative; stale-slug test has `blockedCategories: ['Gambling', 'matur']` in the entry.

- [ ] **Step 3: Implement**

In `apps/api/src/lib/push-cache.ts`:

Add `SENSITIVE_AD_CATEGORY_SLUGS` to the `@ada/shared` value import and `Publisher` to the type import:

```ts
import {
  FREQUENCY_CAP_DEFAULT_PER_DAY,
  SLOT_CACHE_TTL_SECONDS,
  BUDGET_COUNTER_TTL_SECONDS,
  FLAT_CPM_ISK,
  SENSITIVE_AD_CATEGORY_SLUGS,
} from '@ada/shared';
import type { SlotCacheEntry, CachedCreative, Creative, Publisher } from '@ada/shared';
```

Add a helper above `pushSlotCache`:

```ts
/** Stale slugs (from the pre-taxonomy UI) must not block and must not trigger fail-closed. */
function blockedSensitiveCategories(publisher: Publisher): string[] {
  return (publisher.contentPolicy.blockedCategories ?? []).filter((c) =>
    (SENSITIVE_AD_CATEGORY_SLUGS as readonly string[]).includes(c),
  );
}
```

Use it in **both** places the entry is built:
- the paused/suspended early-return entry (~line 62): `blockedCategories: blockedSensitiveCategories(publisher),`
- the main path (~line 158): `const blockedCategories = blockedSensitiveCategories(publisher);`

Replace the old check (~lines 192–197):

```ts
// Check if blocked by category
if (creative.autoScanResult?.category) {
  if (blockedCategories.includes(creative.autoScanResult.category)) {
    continue;
  }
}
```

with:

```ts
// Brand safety: skip creatives whose sensitive flags intersect the publisher's blocks.
// Fail-closed: a blocking publisher never shows creatives that lack sensitive-flag data.
if (blockedCategories.length > 0) {
  const flags = creative.autoScanResult?.sensitiveCategories;
  if (!flags || flags.some((f) => blockedCategories.includes(f))) {
    continue;
  }
}
```

- [ ] **Step 4: Run the full push-cache file to verify**

Run: `firebase --config firebase/firebase.json emulators:exec 'pnpm --filter @ada/api test -- tests/push-cache.test.ts'`
Expected: PASS — all tests in the file, including the untouched pace/priority/size tests.

- [ ] **Step 5: Verify and commit**

```bash
pnpm verify
git add apps/api/src/lib/push-cache.ts apps/api/tests/push-cache.test.ts
git commit -m "feat(api): enforce sensitive-category blocking in push-cache, fail-closed"
```

---

### Task 4: Content-categories endpoint + write-path validation + MCP tool

**Files:**
- Modify: `apps/api/src/services/domain-classifier.ts` (`getAllowedCategories`, ~line 12)
- Modify: `apps/api/src/services/publishers.ts` (`createPublisher`, `updatePublisher`)
- Modify: `apps/mcp/src/tools/publisher/set-content-policy.ts`
- Test: `apps/api/tests/categories-content.test.ts`, `apps/api/tests/publishers.test.ts`

- [ ] **Step 1: Update/add the failing tests**

In `apps/api/tests/categories-content.test.ts`, replace the body of the second test:

```ts
it('returns the sensitive content-category list (slug + label objects)', async () => {
  const res = await app.request('/v1/categories/content', {
    headers: { Authorization: 'Bearer valid-token' },
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(Array.isArray(body)).toBe(true);
  expect(body.map((c: { slug: string }) => c.slug)).toContain('afengi');
  expect(body[0]).toHaveProperty('label');
});
```

In `apps/api/tests/publishers.test.ts`:
- change the `samplePolicy` fixture (~line 26) to use valid slugs:

```ts
const samplePolicy = {
  blockedCategories: ['vedmal', 'afengi'],
  requireManualApproval: true,
};
```

- add inside `describe('updatePublisher', …)`:

```ts
it('rejects blockedCategories outside the sensitive taxonomy', async () => {
  const created = await createPublisher({
    ownerEmail: 'owner@test.is',
    domain: 'test.is',
    displayName: 'Test Publisher',
    payoutMethod: samplePayout,
    contentPolicy: samplePolicy,
    categories: ['taekni'],
  });

  await expect(
    updatePublisher(created.id, {
      contentPolicy: { blockedCategories: ['gambling'], requireManualApproval: false },
    }),
  ).rejects.toThrow(/Invalid blocked categories/);

  const updated = await updatePublisher(created.id, {
    contentPolicy: { blockedCategories: ['stefnumot'], requireManualApproval: false },
  });
  expect(updated.contentPolicy.blockedCategories).toEqual(['stefnumot']);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `firebase --config firebase/firebase.json emulators:exec 'pnpm --filter @ada/api test -- tests/categories-content.test.ts tests/publishers.test.ts'`
Expected: FAIL — endpoint returns bare strings; updatePublisher accepts `'gambling'`.

- [ ] **Step 3: Implement endpoint**

In `apps/api/src/services/domain-classifier.ts`, change `getAllowedCategories` (and its
import line — it currently imports `AD_CATEGORY_SLUGS` from `@ada/shared`; keep that import
only if still used elsewhere in the file, and add `SENSITIVE_AD_CATEGORIES`):

```ts
import { SENSITIVE_AD_CATEGORIES } from '@ada/shared';

/** Blockable creative content categories shown to publishers (brand safety). */
export async function getAllowedCategories(): Promise<Array<{ slug: string; label: string }>> {
  return SENSITIVE_AD_CATEGORIES.map((c) => ({ slug: c.slug, label: c.label }));
}
```

- [ ] **Step 4: Implement write-path validation**

In `apps/api/src/services/publishers.ts`, add to the `@ada/shared` import:
`SENSITIVE_AD_CATEGORY_SLUGS`, and add a helper near the top:

```ts
function assertValidBlockedCategories(contentPolicy?: { blockedCategories?: string[] }): void {
  const blocked = contentPolicy?.blockedCategories;
  if (!blocked) return;
  const invalid = blocked.filter(
    (c) => !(SENSITIVE_AD_CATEGORY_SLUGS as readonly string[]).includes(c),
  );
  if (invalid.length > 0) {
    throw new AppError(400, `Invalid blocked categories: ${invalid.join(', ')}`, 'BAD_REQUEST');
  }
}
```

Call it as the first statement of **both** `createPublisher` (passing
`input.contentPolicy`) and `updatePublisher` (passing `updates.contentPolicy`).

- [ ] **Step 5: Implement MCP tool**

In `apps/mcp/src/tools/publisher/set-content-policy.ts`:

```ts
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SENSITIVE_AD_CATEGORY_SLUGS } from '@ada/shared';
import { apiCall } from '../../lib/api-client.js';

const Input = z.object({
  blockedCategories: z.array(z.enum(SENSITIVE_AD_CATEGORY_SLUGS as [string, ...string[]])),
  requireManualApproval: z.boolean(),
});

export function registerSetContentPolicy(server: McpServer, apiKey: string) {
  server.registerTool(
    'set_content_policy',
    {
      title: 'Stilla efnisstefnu',
      description:
        'Setur lista af bönnuðum auglýsingaflokkum og hvort útgefandi vilji samþykkja allar auglýsingar handvirkt. ' +
        `Gildir flokkar: ${(SENSITIVE_AD_CATEGORY_SLUGS as readonly string[]).join(', ')}.`,
      inputSchema: Input.shape,
    },
    async (input) => {
      const r = await apiCall<unknown>('/v1/publishers/me', {
        method: 'PATCH',
        body: { contentPolicy: input },
        apiKey,
      });
      return { content: [{ type: 'text', text: JSON.stringify(r) }] };
    },
  );
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `firebase --config firebase/firebase.json emulators:exec 'pnpm --filter @ada/api test -- tests/categories-content.test.ts tests/publishers.test.ts tests/publisher-routes.test.ts tests/domain-classifier.test.ts'`
Expected: PASS. (`publisher-routes` and `domain-classifier` are included because they touch the same service surface — if either asserts the old `samplePolicy`-style values or the old bare-array shape, update those assertions the same way as Step 1.)

- [ ] **Step 7: Verify and commit**

```bash
pnpm verify
git add apps/api apps/mcp
git commit -m "feat(api,mcp): sensitive taxonomy on /v1/categories/content + blockedCategories validation"
```

---

### Task 5: Dashboard Settings uses the new taxonomy

**Files:**
- Modify: `apps/dashboard/src/hooks/useContentCategories.ts`
- Modify: `apps/dashboard/src/pages/publisher/Settings.tsx`

No component test for this (per spec); the gates are typecheck and the existing dashboard suite.

- [ ] **Step 1: Update the hook**

```ts
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export interface ContentCategory {
  slug: string;
  label: string;
}

export function useContentCategories() {
  return useQuery<ContentCategory[]>({
    queryKey: ['categories', 'content'],
    queryFn: () => apiFetch<ContentCategory[]>('/v1/categories/content'),
  });
}
```

- [ ] **Step 2: Update Settings.tsx**

- Delete the `CATEGORY_LABEL_MAP` constant (lines 12–21).
- Change the help text (~line 280) to:
  `Veldu þá flokka af auglýsingum sem þú vilt EKKI sýna á vefsíðunni þinni (t.d. áfengi eða veðmál).`
- Replace the blocked-categories grid mapping (~lines 284–306) — it currently maps
  `contentCategories?.map((catSlug) => …)` with `CATEGORY_LABEL_MAP[catSlug]`; change to:

```tsx
{contentCategories?.map((cat) => {
  const isBlocked = blockedCategories.includes(cat.slug);
  return (
    <div
      key={cat.slug}
      onClick={() => {
        if (isBlocked) {
          setBlockedCategories(blockedCategories.filter((s) => s !== cat.slug));
        } else {
          setBlockedCategories([...blockedCategories, cat.slug]);
        }
      }}
      className={`px-3 py-2 rounded-xl border text-xs font-bold cursor-pointer transition-all duration-200 text-center select-none ${
        isBlocked
          ? 'bg-rose-600 text-white border-rose-600 shadow-md shadow-rose-600/10'
          : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
      }`}
    >
      {cat.label}
    </div>
  );
})}
```

- [ ] **Step 3: Verify**

Run: `pnpm --filter @ada/dashboard typecheck && pnpm --filter @ada/dashboard test`
Expected: PASS. (If any dashboard test referenced `CATEGORY_LABEL_MAP` or the old hook type, fix it to the new shape.)

- [ ] **Step 4: Commit**

```bash
pnpm verify
git add apps/dashboard
git commit -m "feat(dashboard): publisher blocked-categories UI uses sensitive taxonomy"
```

---

### Task 6: Backfill script `rescan-creatives`

**Files:**
- Create: `apps/api/src/scripts/rescan-creatives.ts`
- Modify: `apps/api/package.json` (scripts block)

- [ ] **Step 1: Write the script**

```ts
import { db } from '../lib/firebase.js';
import { COLLECTIONS, creativeConverter } from '@ada/shared/firestore';
import { GeminiAutoScanner } from '../services/auto-scan/gemini.js';

/**
 * Backfill: re-scan creatives that lack autoScanResult.sensitiveCategories.
 * Required before fail-closed blocking goes live — a blocking publisher shows no
 * unscanned creatives at all. Deliberately does NOT touch reviewStatus: this run
 * only adds sensitive flags, it must not retroactively reject live creatives.
 * Uses the stub scanner automatically when GEMINI_API_KEY is unset (local/emulator).
 */
async function rescanCreatives() {
  const scanner = new GeminiAutoScanner();
  const snap = await db.collection(COLLECTIONS.creatives).withConverter(creativeConverter).get();

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const doc of snap.docs) {
    const creative = doc.data();
    if (creative.autoScanResult?.sensitiveCategories) {
      skipped++;
      continue;
    }
    try {
      const scan = await scanner.scan({
        imageUrl: creative.imageUrl,
        clickUrl: creative.clickUrl,
        ocrTextHint: creative.ocrTextHint,
      });
      await doc.ref.update({ autoScanResult: scan.scanResult });
      updated++;
      console.log(`rescanned ${creative.id}: [${scan.scanResult.sensitiveCategories?.join(', ')}]`);
    } catch (err) {
      failed++;
      console.warn(`rescan failed for ${creative.id}:`, err);
    }
  }

  console.log(`Rescan complete: ${updated} updated, ${skipped} skipped, ${failed} failed.`);
  if (failed > 0) process.exitCode = 1;
}

rescanCreatives()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
```

- [ ] **Step 2: Add the package script**

In `apps/api/package.json`, after the `"seed"` entry:

```json
"rescan-creatives": "tsx src/scripts/rescan-creatives.ts",
```

- [ ] **Step 3: Verify against the emulator**

In one shell: `pnpm emulator`. In another:

```bash
pnpm --filter @ada/api seed
pnpm --filter @ada/api rescan-creatives
pnpm --filter @ada/api rescan-creatives   # second run
```

Expected: first run logs `N updated, 0 skipped` (stub scanner → flags `[]` or `['vedmal']`);
second run logs `0 updated, N skipped` (idempotent). Stop the emulator after.

- [ ] **Step 4: Verify and commit**

```bash
pnpm verify
git add apps/api/src/scripts/rescan-creatives.ts apps/api/package.json
git commit -m "feat(api): rescan-creatives backfill script for sensitiveCategories"
```

**Deploy note (carry into the PR description):** run `rescan-creatives` against production
right after this lands — fail-closed means blocking publishers serve nothing until it runs.

---

### Task 7: Flight-aware committed math in the inventory forecast

**Files:**
- Modify: `apps/api/src/services/inventory.ts`
- Test: `apps/api/tests/inventory.test.ts`

- [ ] **Step 1: Fix existing fixtures and add the failing tests**

In `apps/api/tests/inventory.test.ts`, the existing committed-campaign fixture
(~line 105) has no `schedule.startsAt`; the new code reads it. Add to that fixture's
`schedule`: `startsAt: new Date(Date.now() - 86_400_000),` (already in flight — expected
values unchanged). Then append these tests inside the `describe`:

```ts
function seedPublisherWithStats(impressionsPerDay: number) {
  mockPublishers.push({ id: 'pub_food', status: 'active', categories: ['matur'] });
  const now = new Date();
  for (let i = 1; i <= 7; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const dk = d.toISOString().split('T')[0]!.replace(/-/g, '');
    mockStatsDocs[`${COLLECTIONS.stats}/publishers/pub_food/${dk}`] = {
      impressions: impressionsPerDay,
    };
  }
}

it('spreads a future flight over its actual flight days, not days-from-now', async () => {
  seedPublisherWithStats(11000);
  // Starts in 2 days, ends in 7 → 5 flight days. 27500 ISK / 5 = 5500/day → 10000 imp/day.
  // The old (broken) math would use 7 days → ~7857 imp/day.
  mockCampaigns.push({
    status: 'active',
    budget: { mode: 'cpm_capped', remainingIsk: 27500 },
    schedule: {
      startsAt: new Date(Date.now() + 2 * 86_400_000),
      endsAt: new Date(Date.now() + 7 * 86_400_000),
    },
    targeting: { categories: ['matur'] },
  });

  const result = await getCategoryInventory();
  const matur = result.find((r) => r.category === 'matur')!;
  expect(matur.committedDailyImpressions).toBe(10000);
});

it('counts pending_approval campaigns as committed demand', async () => {
  seedPublisherWithStats(11000);
  mockCampaigns.push({
    status: 'pending_approval',
    budget: { mode: 'cpm_capped', remainingIsk: 27500 },
    schedule: {
      startsAt: new Date(Date.now() - 86_400_000),
      endsAt: new Date(Date.now() + 5 * 86_400_000),
    },
    targeting: { categories: ['matur'] },
  });

  const result = await getCategoryInventory();
  const matur = result.find((r) => r.category === 'matur')!;
  expect(matur.committedDailyImpressions).toBe(10000);
});

it('does not count paused or already-ended campaigns', async () => {
  seedPublisherWithStats(11000);
  mockCampaigns.push(
    {
      status: 'paused',
      budget: { mode: 'cpm_capped', remainingIsk: 27500 },
      schedule: {
        startsAt: new Date(Date.now() - 86_400_000),
        endsAt: new Date(Date.now() + 5 * 86_400_000),
      },
      targeting: { categories: ['matur'] },
    },
    {
      status: 'active',
      budget: { mode: 'cpm_capped', remainingIsk: 27500 },
      schedule: {
        startsAt: new Date(Date.now() - 10 * 86_400_000),
        endsAt: new Date(Date.now() - 86_400_000), // already over
      },
      targeting: { categories: ['matur'] },
    },
  );

  const result = await getCategoryInventory();
  const matur = result.find((r) => r.category === 'matur')!;
  expect(matur.committedDailyImpressions).toBe(0);
});
```

(The firebase mock in this file returns **all** `mockCampaigns` regardless of the `where()`
clause, so the service's in-memory status/endsAt guards are what these tests exercise.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `firebase --config firebase/firebase.json emulators:exec 'pnpm --filter @ada/api test -- tests/inventory.test.ts'`
Expected: FAIL — future-flight gives 7857, pending_approval gives 0, paused gives 10000.

- [ ] **Step 3: Implement**

In `apps/api/src/services/inventory.ts`, replace the committed-campaigns block
(lines 46–64) with:

```ts
// Committed: daily allowance of cpm_capped campaigns that are live or awaiting approval
// (approval can land any moment and spend starts immediately), in impressions, per
// category. Budget is spread over the actual flight window — a future startsAt must not
// dilute the daily commitment with pre-flight days.
const COMMITTED_STATUSES = ['active', 'pending_approval'];
const cmpSnap = await db
  .collection(COLLECTIONS.campaigns)
  .where('status', 'in', COMMITTED_STATUSES)
  .withConverter(campaignConverter)
  .get();
const committedByCategory = new Map<string, number>();
const now = Date.now();
const perImpression = Math.round(FLAT_CPM_ISK / 1000);
for (const doc of cmpSnap.docs) {
  const cmp = doc.data();
  if (!COMMITTED_STATUSES.includes(cmp.status)) continue;
  if (cmp.budget.mode !== 'cpm_capped') continue;
  if (cmp.schedule.endsAt.getTime() <= now) continue;
  const flightStartMs = Math.max(now, cmp.schedule.startsAt.getTime());
  const daysLeft = Math.max(1, Math.ceil((cmp.schedule.endsAt.getTime() - flightStartMs) / 86_400_000));
  const dailyBudgetIsk = Math.max(perImpression, Math.round(cmp.budget.remainingIsk / daysLeft));
  const dailyImpressions = Math.round((dailyBudgetIsk / FLAT_CPM_ISK) * 1000);
  for (const cat of cmp.targeting.categories) {
    committedByCategory.set(cat, (committedByCategory.get(cat) ?? 0) + dailyImpressions);
  }
}
```

(The in-memory `status` check is deliberate redundancy with the query — the query is the
real filter in production, the in-memory check keeps the logic self-contained and testable.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `firebase --config firebase/firebase.json emulators:exec 'pnpm --filter @ada/api test -- tests/inventory.test.ts'`
Expected: PASS — all five tests (two pre-existing, three new).

- [ ] **Step 5: Verify and commit**

```bash
pnpm verify
git add apps/api/src/services/inventory.ts apps/api/tests/inventory.test.ts
git commit -m "fix(api): inventory forecast is flight-aware and counts pending_approval demand"
```

---

### Task 8: Flight-aware `pace_limit` seeding

**Files:**
- Modify: `apps/api/src/lib/push-cache.ts` (both `pushSlotCache` ~line 114 and `pushCacheForCampaign` ~line 245)
- Test: `apps/api/tests/push-cache.test.ts`

- [ ] **Step 1: Write the failing test**

Append next to the existing pace tests in `apps/api/tests/push-cache.test.ts`:

```ts
it('seeds pace_limit over the actual flight window for future-start campaigns', async () => {
  mockState.slot = {
    id: 'slot_pace2',
    publisherId: 'pub_pace2',
    status: 'active',
    sizes: [{ width: 300, height: 250 }],
    pricing: { mode: 'cpm', cpmIsk: 200 },
  };
  mockState.publisher = {
    id: 'pub_pace2',
    status: 'active',
    categories: ['taekni'],
    contentPolicy: { blockedCategories: [] },
  };
  mockState.campaigns = [
    {
      id: 'cmp_future',
      status: 'active',
      creativeIds: ['cre_future'],
      budget: { remainingIsk: 50000, mode: 'cpm_capped' },
      schedule: {
        startsAt: new Date(Date.now() + 2 * 86_400_000), // starts in 2 days
        endsAt: new Date(Date.now() + 7 * 86_400_000), // 5 flight days
      },
      targeting: { categories: ['taekni'] },
    },
  ];
  mockState.creatives = [
    {
      id: 'cre_future',
      reviewStatus: 'auto_approved',
      width: 300,
      height: 250,
      imageUrl: 'https://ex.com/f.png',
      clickUrl: 'https://ex.com/f',
    },
  ];

  mockRedisSet.mockClear();
  await pushSlotCache('slot_pace2');

  const paceCall = mockRedisSet.mock.calls.find((c: any) => c[0] === 'pace_limit:cmp_future');
  expect(paceCall).toBeDefined();
  expect(paceCall![1]).toBe(10000); // 50000 / 5 flight days, not / 7 days-from-now
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `firebase --config firebase/firebase.json emulators:exec 'pnpm --filter @ada/api test -- tests/push-cache.test.ts'`
Expected: FAIL — pace seeded as `Math.round(50000 / 7) = 7143`.

- [ ] **Step 3: Implement**

In `apps/api/src/lib/push-cache.ts`, add `Campaign` to the type import from `@ada/shared`
and add a helper next to `blockedSensitiveCategories`:

```ts
/** Days remaining in the campaign's actual flight window (pre-flight days excluded). */
function flightDaysLeft(campaign: Campaign): number {
  const flightStartMs = Math.max(Date.now(), campaign.schedule.startsAt.getTime());
  return Math.max(1, Math.ceil((campaign.schedule.endsAt.getTime() - flightStartMs) / 86_400_000));
}
```

Replace the inline `daysLeft` computation in **both** places:

In `pushSlotCache` (~lines 114–118):

```ts
if (campaign.budget.mode === 'cpm_capped') {
  const daysLeft = flightDaysLeft(campaign);
  const perImpression = Math.round(FLAT_CPM_ISK / 1000);
  const paceLimit = Math.max(perImpression, Math.round(campaign.budget.remainingIsk / daysLeft));
  await redis.set(`pace_limit:${campaign.id}`, paceLimit, { ex: BUDGET_COUNTER_TTL_SECONDS });
}
```

In `pushCacheForCampaign` (~lines 245–249), the same substitution: replace its
`const daysLeft = Math.max(1, Math.ceil((cmp.schedule.endsAt.getTime() - Date.now()) / 86_400_000));`
with `const daysLeft = flightDaysLeft(cmp);`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `firebase --config firebase/firebase.json emulators:exec 'pnpm --filter @ada/api test -- tests/push-cache.test.ts'`
Expected: PASS — new test and the two pre-existing pace tests (their fixtures start in the past, so `flightDaysLeft` ≡ old math for them).

- [ ] **Step 5: Verify and commit**

```bash
pnpm verify
git add apps/api/src/lib/push-cache.ts apps/api/tests/push-cache.test.ts
git commit -m "fix(api): pace_limit spreads budget over the actual flight window"
```

---

### Task 9: Soft oversell warning in the buy flow

**Files:**
- Modify: `apps/dashboard/src/pages/advertiser/CampaignCreate.tsx`

No component test (per spec — manual check); gates are typecheck + dashboard suite.

- [ ] **Step 1: Implement**

In `CampaignCreate.tsx`:

Add `FLAT_CPM_ISK` to the `@ada/shared` import (line 21):

```ts
import { AD_CATEGORIES, FLAT_CPM_ISK } from '@ada/shared';
```

Add the computation right after `const isInsufficientFunds = …` (~line 199):

```ts
// Soft oversell warning: campaign needs more daily impressions than the selected
// categories have available. Informational only — submission is never blocked.
const deliveryWarning = (() => {
  if (selectedCategories.length === 0 || !startDate) return null;
  const startMs = new Date(startDate).getTime();
  const endMs = endDate
    ? new Date(endDate).getTime()
    : startMs + 30 * 24 * 3600 * 1000; // mirrors the 30-day default used on submit
  const flightDays = Math.max(1, Math.ceil((endMs - Math.max(startMs, Date.now())) / 86_400_000));
  const neededDaily = Math.round((totalBudget / FLAT_CPM_ISK) * 1000 / flightDays);
  const availableDaily = selectedCategories.reduce((sum, slug) => {
    const forecast = categoriesInventoryQuery.data?.find((f) => f.category === slug);
    return sum + (forecast?.availableDailyImpressions ?? 0);
  }, 0);
  if (neededDaily <= availableDaily) return null;
  return { neededDaily, availableDaily };
})();
```

Render it in **Step 3** of the wizard, directly after the Reach Forecast Panel's closing
`)}` (~line 565) and before the `{error && …}` block:

```tsx
{deliveryWarning && (
  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs font-semibold text-amber-700 flex items-start gap-2">
    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
    <span>
      Herferðin gæti afhent hægar en áætlað — valdir flokkar hafa um{' '}
      {deliveryWarning.availableDaily.toLocaleString('is-IS')} lausar birtingar á dag en
      herferðin þarf um {deliveryWarning.neededDaily.toLocaleString('is-IS')}.
    </span>
  </div>
)}
```

- [ ] **Step 2: Verify**

Run: `pnpm --filter @ada/dashboard typecheck && pnpm --filter @ada/dashboard test`
Expected: PASS.

Manual check (optional but recommended): `pnpm emulator` + seed + `pnpm dev`, create a
campaign with a large budget and a 1-day flight in a low-inventory category → amber warning
appears in step 3; with a small budget it does not.

- [ ] **Step 3: Commit**

```bash
pnpm verify
git add apps/dashboard/src/pages/advertiser/CampaignCreate.tsx
git commit -m "feat(dashboard): soft oversell warning in campaign buy flow"
```

---

### Task 10: Full verification

- [ ] **Step 1: Full gates**

Run from the repo root:

```bash
pnpm verify
pnpm test:api
pnpm --filter @ada/shared test
pnpm --filter @ada/dashboard test
pnpm build
```

Expected: all pass. If `pnpm test:api` surfaces failures in files this plan didn't touch
(e.g. `e2e.test.ts`, `creatives.test.ts` asserting on `autoScanResult` shape), the likely
cause is an assertion on the exact scan-result object — extend those assertions with the
new `sensitiveCategories` field rather than weakening them.

- [ ] **Step 2: Commit any stragglers**

```bash
git status   # should be clean; commit fixups if Step 1 required edits
```
