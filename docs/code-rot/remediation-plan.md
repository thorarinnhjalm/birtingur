# Code-Rot Remediation Implementation Plan

> ## ✅ COMPLETED 2026-06-05 — DO NOT RE-IMPLEMENT
>
> All tasks (A1–D3) in this plan are **done, reviewed, and merged to `main`** (see
> `IMPLEMENTATION-LOG.md` for per-task report + Claude's review). The unchecked `- [ ]`
> boxes below are historical — this file is a record, **not** a to-do list. Do not hand
> this file to an agent as work to perform. New work lives in separate plan files.

> **For agentic workers (Gemini):** Implement this plan task-by-task, **in order**. After
> EACH task you MUST append a report entry to `IMPLEMENTATION-LOG.md` (see the Report-Back
> Protocol below) before moving on. Steps use checkbox (`- [ ]`) syntax — tick them as you go.

**Goal:** Close the highest-value rot identified in `DIAGNOSIS.md` / `SYSTEM-REVIEW.md` —
finish the half-removed per-publisher approval refactor, stop silent category mislabeling,
restore real cache refresh, and consolidate Redis config — without regressing the working demo.

**Architecture:** Category-based ad model is already live. This plan removes dead/contradictory
remnants of the pre-category model, replaces band-aids (7-day cache TTL, `['taekni']` default)
with real fixes, and standardizes the API response envelope. Each task is independently
shippable and committed separately.

**Tech Stack:** TypeScript (ESM, `.js` import suffix), Zod (`@ada/shared`), Hono (api/serving),
firebase-admin (Firestore), Upstash Redis, Vitest, React 19 (dashboard).

---

## Execution notes (read first)

- **Monorepo:** after editing `@ada/shared`, run `pnpm --filter @ada/shared build` before
  downstream typecheck/tests.
- **Emulator + Java REQUIRED:** `@ada/api` and `@ada/serving` tests need the Firestore emulator
  and a Java runtime. Run via `pnpm test:api` / `pnpm test:rules` (root wrappers that start the
  emulator) or wrap: `firebase --config firebase/firebase.json emulators:exec 'pnpm --filter @ada/api test'`.
  **Do not mark a task done until its emulator tests pass.** `@ada/shared`/`@ada/dashboard` tests
  are plain `vitest`.
- **Branch:** work on `fix/code-rot-pass-1` (already exists with K1/M2/M3) or branch from it.
- **One commit per task.** End commit messages with the task id, e.g. `... (Task A1)`.
- **Decisions already made (from approved design, do NOT re-litigate):** per-publisher approval
  is removed in favour of auto-opt-in + the `contentPolicy.requireManualApproval` valve; the
  response envelope is standardized to **bare** payloads.

---

## Report-Back Protocol (how Gemini reports to Claude)

This is the contract that lets Claude review exactly what was done.

1. **Per task**, append one entry to `IMPLEMENTATION-LOG.md` using the template at the bottom of
   that file. Fill every field — no blanks.
2. **Required fields:** task id, status (`done` / `blocked` / `deviated`), commit SHA(s), exact
   files changed, the verification commands you ran **and their real output** (pass/fail counts),
   any deviation from the plan **with the reason**, and any new question/decision for Claude.
3. **Evidence, not claims.** Paste the actual last lines of test output (e.g.
   `Tests 75 passed (75)`), not “tests pass”. If you could not run a suite (e.g. no Java), say so
   explicitly — do not claim it passed.
4. **If blocked or you must deviate:** stop, write the log entry with status `blocked`/`deviated`
   and your question, and do not start the next task until resolved.
5. **Never edit files outside a task's stated `Files:` list** without logging it as a deviation.

---

## Phase A — Finish the per-publisher approval removal + category default (R1 + K3)

### Task A1: Remove the `['taekni']` category default (both schemas)

**Files:**

- Modify: `packages/shared/src/schemas/publisher.ts` (PublisherSchema `categories`)
- Modify: `packages/shared/src/schemas/campaign.ts` (TargetingSchema `categories`)
- Test: `packages/shared/tests/publisher.test.ts`, `packages/shared/tests/campaign.test.ts`

- [ ] **Step 1: Update the failing test** — assert that a missing `categories` now THROWS (no silent default).

In `packages/shared/tests/publisher.test.ts` add:

```ts
it('requires categories explicitly (no silent default)', () => {
  const { categories, ...without } = base;
  expect(() => PublisherSchema.parse(without)).toThrow();
});
```

In `packages/shared/tests/campaign.test.ts` add:

```ts
it('requires targeting.categories explicitly (no silent default)', () => {
  expect(() => TargetingSchema.parse({})).toThrow();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @ada/shared test -- tests/publisher.test.ts tests/campaign.test.ts`
Expected: FAIL — currently `.default(['taekni'])` makes these pass-through instead of throwing.

- [ ] **Step 3: Remove the default in both schemas**

`publisher.ts` — change the `categories` field to:

```ts
  categories: z.array(z.enum(AD_CATEGORY_SLUGS as [string, ...string[]])).min(1),
```

`campaign.ts` — change `TargetingSchema` to:

```ts
export const TargetingSchema = z.object({
  categories: z.array(z.enum(AD_CATEGORY_SLUGS as [string, ...string[]])).min(1),
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @ada/shared test -- tests/publisher.test.ts tests/campaign.test.ts && pnpm --filter @ada/shared build`
Expected: PASS, build OK.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/schemas/publisher.ts packages/shared/src/schemas/campaign.ts packages/shared/tests/
git commit -m "fix(shared): require categories explicitly, drop silent taekni default (Task A1)"
```

- [ ] **Step 6: Append report entry to IMPLEMENTATION-LOG.md.**

> ⚠️ Removing the default means any Firestore doc lacking `categories` will now fail to parse on
> read. Task A2 provides the backfill; **run A2's migration (or reseed) before deploying A1** so
> existing publisher/campaign docs don't break. In demo, reseeding (`pnpm --filter @ada/api exec
tsx src/scripts/seed.ts` against the emulator/project) is sufficient.

### Task A2: Backfill migration for legacy docs missing `categories`

**Files:**

- Create: `apps/api/src/scripts/migrate-categories.ts`
- Test: manual (script run against emulator)

- [ ] **Step 1: Write the migration script**

```ts
import { COLLECTIONS } from '@ada/shared/firestore';
import { db } from '../lib/firebase.js';

// Backfills a default category for any publisher/campaign doc missing `categories`.
// Publishers: best-effort 'taekni' placeholder (operator should review in dashboard).
// Campaigns: skip + log (a campaign with no category is invalid and must be fixed by hand).
async function migrate() {
  const pubSnap = await db.collection(COLLECTIONS.publishers).get();
  let pubFixed = 0;
  for (const doc of pubSnap.docs) {
    const data = doc.data();
    if (!Array.isArray(data.categories) || data.categories.length === 0) {
      await doc.ref.update({ categories: ['taekni'] });
      console.warn(`Publisher ${doc.id}: backfilled categories=['taekni'] — REVIEW in dashboard`);
      pubFixed++;
    }
  }
  const cmpSnap = await db.collection(COLLECTIONS.campaigns).get();
  let cmpBad = 0;
  for (const doc of cmpSnap.docs) {
    const t = doc.data().targeting;
    if (!t || !Array.isArray(t.categories) || t.categories.length === 0) {
      console.error(`Campaign ${doc.id}: INVALID — no targeting.categories, needs manual fix`);
      cmpBad++;
    }
  }
  console.log(`Done. Publishers backfilled: ${pubFixed}. Invalid campaigns: ${cmpBad}.`);
}
migrate().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Run against the emulator** (or the target project with admin creds)

Run: `firebase --config firebase/firebase.json emulators:exec 'pnpm --filter @ada/api exec tsx src/scripts/migrate-categories.ts'`
Expected: prints counts; no crash. (Demo: may print 0 if already seeded with categories.)

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/scripts/migrate-categories.ts
git commit -m "feat(api): add categories backfill migration for legacy docs (Task A2)"
```

- [ ] **Step 4: Append report entry** (include the script's console output as evidence).

### Task A3: Remove the orphaned per-publisher approval flow

**Decision:** per-publisher campaign approval is gone; publisher control is the
`contentPolicy.requireManualApproval` valve (already enforced in `push-cache.ts`). Remove the
dead flow end-to-end.

**Files:**

- Modify: `apps/api/src/services/approvals.ts` (remove `listPublisherQueue`, `publisherReview`; keep `listAdminQueue`, `adminReview`)
- Modify: `apps/api/src/index.ts` (remove `publisherApprovalsRoutes` import + mount at line ~44)
- Delete: `apps/api/src/routes/publisher-approvals.ts`
- Modify: `apps/dashboard/src/pages/publisher/Dashboard.tsx` (remove `ApprovalQueue` import + the `approvals` route, and any sidebar link to it)
- Delete: `apps/dashboard/src/pages/publisher/ApprovalQueue.tsx`

- [ ] **Step 1: Confirm scope** — list every reference first.

Run: `grep -rn "listPublisherQueue\|publisherReview\|publisher-approvals\|publisherApprovalsRoutes\|ApprovalQueue" apps --include="*.ts" --include="*.tsx" | grep -v /dist/`
Expected: references only in the files listed above. If any OTHER file references them, stop and log a deviation.

- [ ] **Step 2: Remove the API pieces** — delete `listPublisherQueue` and `publisherReview` from `approvals.ts`; delete `routes/publisher-approvals.ts`; remove its import + `app.route('/v1/publishers/me', publisherApprovalsRoutes)` from `index.ts`.

- [ ] **Step 3: Remove the dashboard pieces** — delete `ApprovalQueue.tsx`; in `publisher/Dashboard.tsx` remove the `import ApprovalQueue` line, the `<Route path="approvals" ... />`, and any nav link pointing at `approvals`.

- [ ] **Step 4: Verify nothing dangles**

Run: `grep -rn "listPublisherQueue\|publisherReview\|publisher-approvals\|ApprovalQueue" apps --include="*.ts" --include="*.tsx" | grep -v /dist/ || echo "none"`
Expected: `none`.
Run: `pnpm --filter @ada/shared build && pnpm --filter @ada/api typecheck && pnpm --filter @ada/dashboard typecheck`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A apps/api/src/services/approvals.ts apps/api/src/index.ts apps/dashboard/src/pages/publisher/
git rm apps/api/src/routes/publisher-approvals.ts apps/dashboard/src/pages/publisher/ApprovalQueue.tsx
git commit -m "refactor: remove orphaned per-publisher approval flow (Task A3)"
```

- [ ] **Step 6: Append report entry.**

### Task A4: Purge `perPublisherApproval` from test fixtures

**Files:**

- Modify: `apps/api/tests/push-cache.test.ts`, `apps/api/tests/e2e.test.ts`, `apps/api/tests/approvals-admin.test.ts` (and any other file from the grep below)

- [ ] **Step 1: Find every fixture using it**

Run: `grep -rln "perPublisherApproval" apps/api/tests`
Expected: the files above.

- [ ] **Step 2: Update fixtures** — remove the `perPublisherApproval` field from every campaign
      fixture and the local `Campaign` type definitions, and ensure each campaign fixture uses
      `targeting: { categories: ['...'] }` matching the publisher's categories under test. Remove any
      `slotIds` targeting that remains.

- [ ] **Step 3: Run the affected suites (emulator)**

Run: `pnpm test:api -- tests/push-cache.test.ts tests/e2e.test.ts tests/approvals-admin.test.ts`
Expected: PASS. Paste the pass/fail counts into the log.

- [ ] **Step 4: Commit**

```bash
git add apps/api/tests/
git commit -m "test(api): drop perPublisherApproval, align fixtures with category schema (Task A4)"
```

- [ ] **Step 5: Append report entry** (must include real emulator test output).

---

## Phase B — Real cache refresh (K2)

### Task B1: Split the cache TTL constants

**Files:**

- Modify: `packages/shared/src/constants.ts`
- Modify: `apps/serving/src/lib/cache.ts` (no longer imports TTL — already removed in M3), `apps/api/src/lib/push-cache.ts` (uses the new names)

- [ ] **Step 1:** In `constants.ts` replace the single `CACHE_TTL_SECONDS` with two purpose-named
      constants (keep a sane hot TTL, not 7 days):

```ts
/** Hot slot-cache eviction TTL (kept short; a refresh cron rebuilds active slots). */
export const SLOT_CACHE_TTL_SECONDS = 15 * 60; // 15 min
/** Budget gate counter TTL — must outlive a cache cycle comfortably. */
export const BUDGET_COUNTER_TTL_SECONDS = 60 * 60; // 1h
```

Keep `export const CACHE_TTL_SECONDS = SLOT_CACHE_TTL_SECONDS;` temporarily ONLY if other code
still imports it; otherwise remove it and fix importers in this task.

- [ ] **Step 2:** In `push-cache.ts` use `SLOT_CACHE_TTL_SECONDS` for `set(key, entry, {ex})` and
      `BUDGET_COUNTER_TTL_SECONDS` for the `budget:{id}` counter (replace the `CACHE_TTL_SECONDS * 5`).

- [ ] **Step 3: Typecheck + build**

Run: `pnpm --filter @ada/shared build && pnpm --filter @ada/api typecheck && pnpm --filter @ada/serving typecheck`
Expected: pass. Grep `grep -rn "CACHE_TTL_SECONDS" apps packages --include=*.ts | grep -v /dist/` and confirm no stale references.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/constants.ts apps/api/src/lib/push-cache.ts
git commit -m "refactor: split slot-cache and budget-counter TTLs (Task B1)"
```

- [ ] **Step 5: Append report entry.**

### Task B2: Add a cron that rebuilds all active slot caches

**Files:**

- Create: `apps/api/src/services/cache-refresh.ts` (function `refreshAllActiveSlotCaches()`)
- Create: `apps/api/api/cron-refresh-cache.js` (Vercel entrypoint, mirrors the other cron `.js` files)
- Modify: `apps/api/vercel.json` (add function + cron schedule + rewrite)
- Test: `apps/api/tests/cache-refresh.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// Seed 2 active slots + 1 paused slot; clear their Redis keys; run refreshAllActiveSlotCaches();
// assert the 2 active slots now have a `slot:{id}` cache entry and the paused one does too
// (paused slots cache with empty activeCreatives — see pushSlotCache behavior).
it('rebuilds cache for every active slot', async () => {
  await seedSlots(); // helper: 2 active, 1 paused
  await getRedis().del('slot:slot_active_1');
  await refreshAllActiveSlotCaches();
  expect(await getRedis().get('slot:slot_active_1')).not.toBeNull();
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm test:api -- tests/cache-refresh.test.ts` → FAIL (function undefined).

- [ ] **Step 3: Implement the service**

```ts
import { COLLECTIONS, slotConverter } from '@ada/shared/firestore';
import { db } from '../lib/firebase.js';
import { pushSlotCache } from '../lib/push-cache.js';

export async function refreshAllActiveSlotCaches(): Promise<number> {
  const snap = await db
    .collection(COLLECTIONS.slots)
    .where('status', '==', 'active')
    .withConverter(slotConverter)
    .get();
  let n = 0;
  for (const doc of snap.docs) {
    await pushSlotCache(doc.id);
    n++;
  }
  return n;
}
```

- [ ] **Step 4: Create the Vercel cron entrypoint** `apps/api/api/cron-refresh-cache.js` (mirror
      `cron-accrue.js`: same `CRON_SECRET` auth check, `export async function GET(req)`, import from
      `../dist/src/services/cache-refresh.js`, call `refreshAllActiveSlotCaches()`).

- [ ] **Step 5: Wire `vercel.json`** — add to `functions`, `crons` (e.g. `*/10 * * * *`), and
      `rewrites` exactly like the existing cron entries.

- [ ] **Step 6: Run test to verify it passes** — `pnpm test:api -- tests/cache-refresh.test.ts` → PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/cache-refresh.ts apps/api/api/cron-refresh-cache.js apps/api/vercel.json apps/api/tests/cache-refresh.test.ts
git commit -m "feat(api): cron to rebuild active slot caches; removes reliance on long TTL (Task B2)"
```

- [ ] **Step 8: Append report entry** (real emulator test output required).

---

## Phase C — Standardize API response envelope (K4)

> **Convention:** every endpoint returns the **bare** payload (`c.json(publisher)`,
> `c.json(campaigns)`), never `{ publisher }` / `{ campaigns }`. This matches the newest endpoints
> (publishers, slots, categories). This is a broad runtime-contract change that typecheck does NOT
> catch, so it MUST be verified by the full `pnpm test:api` suite plus a manual dashboard smoke test.

### Task C1: Inventory the mismatch (no code change)

- [ ] **Step 1:** Produce the authoritative list:

```bash
grep -rn "c.json(" apps/api/src/routes | grep -v "error\|AppError"
grep -rn "apiFetch<{" apps/dashboard/src/hooks
```

- [ ] **Step 2:** In the log entry, record a table: endpoint → current shape → hooks consuming it.
      Mark each as `bare` or `wrapped`. This table is the checklist for C2.

### Task C2: Convert wrapped endpoints + their hooks to bare, one resource at a time

For EACH wrapped resource (campaigns, creatives, advertisers, wallet, admin/\*), do this as its own
commit:

- [ ] **Step 1:** Change the route(s) to return bare payloads (`c.json(cmp)` not `c.json({campaign: cmp})`).
- [ ] **Step 2:** Update the matching dashboard hook(s) to drop the `.then(r => r.x)` unwrap and the
      `<{ x: ... }>` generic (use `apiFetch<Campaign[]>(...)`).
- [ ] **Step 3:** Update the API tests that assert `body.<key>` to assert the bare shape.
- [ ] **Step 4:** Run `pnpm test:api` (full) + `pnpm --filter @ada/dashboard typecheck`. Paste counts.
- [ ] **Step 5:** Commit `refactor(api+dashboard): bare response envelope for <resource> (Task C2/<resource>)`.
- [ ] **Step 6:** Append a report entry per resource.

> Do NOT do all resources in one commit — one resource per commit so Claude can review each and a
> regression is easy to bisect.

---

## Phase D — Go-live hardening (M1, M4, demo token) — lower priority (payments are on hold)

### Task D1: Single Redis-config helper (M4)

**Files:** Modify `apps/api/src/lib/redis.ts`, `apps/api/src/services/slots.ts`, `apps/api/src/services/campaigns.ts`

- [ ] **Step 1:** Add to `apps/api/src/lib/redis.ts`:

```ts
export function isRedisConfigured(): boolean {
  return Boolean(
    (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL) &&
    (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN),
  );
}
```

- [ ] **Step 2:** Replace the inline `if (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL)`
      checks in `slots.ts` (3 sites) and `campaigns.ts` (2 sites) with `if (isRedisConfigured())`.
- [ ] **Step 3:** `pnpm --filter @ada/api typecheck` → pass. Commit `refactor(api): single isRedisConfigured() helper (Task D1)`.
- [ ] **Step 4:** Append report entry.

### Task D2: Signing-secret fail-fast (M1) — DO NOT START until SIGNING_SECRET is set in Vercel

- [ ] **Step 1:** Confirm with the operator that `SIGNING_SECRET` is configured in the serving
      Vercel project. If not, STOP and log `blocked` (re-adding fail-fast without the env breaks deploy).
- [ ] **Step 2:** In `apps/serving/src/lib/crypto.ts` `resolveSecret()`, in the production branch
      `throw new Error('SIGNING_SECRET is required in production')` instead of returning the fallback.
- [ ] **Step 3:** `pnpm --filter @ada/serving test` → pass. Commit `fix(serving): fail-fast on missing SIGNING_SECRET in prod (Task D2)`.
- [ ] **Step 4:** Append report entry.

### Task D3: Gate `demo-mock-token` to non-production (admin bypass)

- [ ] **Step 1:** In `apps/api/src/lib/auth.ts`, make the `demo-mock-token` branch a no-op when
      `process.env.NODE_ENV === 'production'` (return unauthorized). Add a test in
      `apps/api/tests/auth.test.ts` asserting the token is rejected when `NODE_ENV=production`.
- [ ] **Step 2:** `pnpm test:api -- tests/auth.test.ts` → pass. Commit `fix(api): disable demo-mock-token in production (Task D3)`.
- [ ] **Step 3:** Append report entry.

---

## Self-Review (plan vs spec)

- DIAGNOSIS/SYSTEM-REVIEW K3 → A1 + A2. R1 → A3 + A4. K2 → B1 + B2. K4 → C1 + C2. M4 → D1.
  M1 → D2. demo-token → D3. K1/M2/M3 already done on the branch.
- Out of scope here (documented debt, not rot-critical): splitting `LandingPage.tsx` /
  `push-cache.ts`, taxonomy doc-drift, api-keys/widget-keys in `COLLECTIONS`. Add later if desired.
- Type/name consistency: `refreshAllActiveSlotCaches`, `isRedisConfigured`,
  `SLOT_CACHE_TTL_SECONDS`, `BUDGET_COUNTER_TTL_SECONDS` used consistently across tasks.
- No placeholders: every code step shows real code; broad C2 is a per-resource procedure with the
  convention fixed and verification mandated.
