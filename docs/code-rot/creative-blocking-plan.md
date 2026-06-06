# Creative Category Blocking (Publisher Control) — Implementation Plan

> **For agentic workers (Gemini):** This is the ONLY plan to execute right now. Do **not** touch
> the other plan files in this folder (they are done/merged). Implement the tasks in order
> (BC1 → BC3). After EACH task, append a report entry to `IMPLEMENTATION-LOG.md` (template at the
> bottom of that file): status, commit SHA, files, **real verification output**, deviations,
> questions. Claude reviews each entry.

**Goal:** Let a publisher choose which content categories of ads to **block** on their site
(e.g. `gambling`), from their Settings page.

**Context / why this is small (≈90% already built):** `push-cache.ts` ALREADY drops a creative
whose `autoScanResult.category` is in the publisher's `contentPolicy.blockedCategories`
(lines ~193–194); creatives already get `autoScanResult` from the auto-scan service; the
`contentPolicy.blockedCategories` field already exists in `PublisherSchema`. The ONLY missing
piece is the **publisher UI to set the list** (no dashboard UI exists today) plus exposing the
category vocabulary so the UI and the scanner agree.

**Category vocabulary:** the blockable set is the platform content-category list returned by
`getAllowedCategories()` in `apps/api/src/services/domain-classifier.ts` (defaults:
`news, sports, tech, finance, lifestyle, entertainment, gambling, other`; overridable via the
`config/metadata` Firestore doc). The UI must use this same list so blocked values match what the
scanner assigns to creatives.

**Tech Stack:** TypeScript (ESM, `.js` import suffix), Hono, firebase-admin, Vitest, React 19 +
TanStack Query. Run `pnpm verify` before each commit (pre-push hook enforces it). `@ada/api` tests
need the emulator + Java (`pnpm test:api`); `@ada/dashboard` tests are plain vitest.

---

## Task BC1: Expose the blockable content-category list via an endpoint

**Files:**

- Modify: `apps/api/src/routes/categories.ts` (add `GET /content` to the existing `categoriesRouter`)
- Test: `apps/api/tests/categories-content.test.ts` (or add to an existing categories test)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { app } from '../src/index';
// auth mock as in other route tests (Bearer valid-token → a user)
describe('GET /v1/categories/content', () => {
  it('returns the allowed content-category list (bare array)', async () => {
    const res = await app.request('/v1/categories/content', {
      headers: { Authorization: 'Bearer valid-token' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toContain('gambling');
  });
});
```

- [ ] **Step 2: Run it to verify it fails** — `pnpm test:api -- tests/categories-content.test.ts` → FAIL (route 404).

- [ ] **Step 3: Implement** — in `apps/api/src/routes/categories.ts`, import the helper and add the
      route (bare array, mirrors the existing `/inventory` route's style):

```ts
import { getAllowedCategories } from '../services/domain-classifier.js';
// ...
categoriesRouter.get('/content', async (c) => c.json(await getAllowedCategories()));
```

- [ ] **Step 4: Run it to verify it passes** — `pnpm test:api -- tests/categories-content.test.ts` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(api): expose blockable content-category list at /v1/categories/content (Task BC1)"`
- [ ] **Step 6: Append report entry.**

---

## Task BC2: Ensure the publisher self-update persists `contentPolicy.blockedCategories`

**Files:**

- Modify (if needed): `apps/api/src/routes/publishers.ts` (the `PATCH /me` / update handler) and/or
  `apps/api/src/services/publishers.ts` (`updatePublisher`)
- Test: `apps/api/tests/publisher-routes.test.ts` (add a case)

> The update service already merges `contentPolicy` (`{ ...current.contentPolicy, ...updates.contentPolicy }`).
> This task confirms the **route** forwards `body.contentPolicy` through to the service and that a
> publisher can persist `blockedCategories`.

- [ ] **Step 1: Write the failing test**

```ts
it('persists contentPolicy.blockedCategories on publisher self-update', async () => {
  // seed a publisher owned by the authed user
  const res = await app.request('/v1/publishers/me', {
    method: 'PATCH', // use whatever verb the existing self-update handler uses
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-token' },
    body: JSON.stringify({ contentPolicy: { blockedCategories: ['gambling'] } }),
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.contentPolicy.blockedCategories).toEqual(['gambling']);
});
```

- [ ] **Step 2: Run it to verify it fails** — `pnpm test:api -- tests/publisher-routes.test.ts -t "blockedCategories"` → if it already passes, the wiring exists; record that and skip to Step 5. If it fails, continue.

- [ ] **Step 3: Implement** — in the publisher self-update route handler, pass `contentPolicy`
      through to `updatePublisher` (e.g. add `contentPolicy: body.contentPolicy` to the update object).
      The service already deep-merges it, so no service change should be needed.

- [ ] **Step 4: Run it to verify it passes** — `pnpm test:api -- tests/publisher-routes.test.ts -t "blockedCategories"` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(api): allow publisher to persist blockedCategories via self-update (Task BC2)"`
- [ ] **Step 6: Append report entry** (note explicitly if no code change was needed).

---

## Task BC3: Publisher Settings UI to choose blocked categories

**Files:**

- Create: `apps/dashboard/src/hooks/useContentCategories.ts`
- Modify: `apps/dashboard/src/pages/publisher/Settings.tsx`

- [ ] **Step 1: Create the hook**

```ts
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export function useContentCategories() {
  return useQuery<string[]>({
    queryKey: ['categories', 'content'],
    queryFn: () => apiFetch<string[]>('/v1/categories/content'),
  });
}
```

- [ ] **Step 2: Render the blocklist in `Settings.tsx`** — mirror the existing pattern there (it
      already loads the publisher and saves `displayName`/`domain`/`vatNumber`). Add:
  - `const { data: contentCategories } = useContentCategories();`
  - a `blockedCategories` state initialised from `publisher.contentPolicy?.blockedCategories ?? []`
    (set it in the same effect that seeds the other fields from `publisher`);
  - a section titled e.g. **"Útiloka auglýsingaflokka"** with one checkbox per
    `contentCategories` entry; toggling adds/removes the slug from `blockedCategories`;
  - include it in the save payload: `contentPolicy: { blockedCategories }` alongside the existing
    update fields.

  > Display the category slugs as-is (or add an Icelandic label map if desired — optional). Keep
  > the value sent to the API as the raw slug (e.g. `gambling`) so it matches the scanner.

- [ ] **Step 3: Verify** — `pnpm --filter @ada/dashboard typecheck && pnpm --filter @ada/dashboard lint && pnpm format:check` → all pass.
- [ ] **Step 4: Commit** — `git commit -m "feat(dashboard): publisher can block ad content categories in Settings (Task BC3)"`
- [ ] **Step 5: Append report entry.**

---

## Final verification

- `pnpm --filter @ada/shared build && pnpm verify` → all pass.
- `pnpm test:api -- tests/categories-content.test.ts tests/publisher-routes.test.ts` → green
  (state explicitly if Java/emulator unavailable and a suite could not run).
- Manual: as a publisher, open Settings → check a category (e.g. `gambling`) → save → confirm it
  persists on reload. (The serving-side effect — that blocked creatives stop appearing — is
  already covered by existing push-cache behaviour.)

## Self-review (plan vs goal)

- Serving filter + creative scan already exist (no change). BC1 exposes the vocabulary, BC2 ensures
  persistence, BC3 is the publisher UI — that is the whole gap.
- Names consistent: `getAllowedCategories`, `/v1/categories/content`, `useContentCategories`,
  `contentPolicy.blockedCategories`.
- Out of scope: a richer safety taxonomy beyond `getAllowedCategories()` (e.g. an explicit
  "alcohol" category) — would require extending the scanner's vocabulary first; not needed for v1.
