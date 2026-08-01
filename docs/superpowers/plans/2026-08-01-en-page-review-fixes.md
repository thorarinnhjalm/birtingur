# /en Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close out the four findings from the 2026-07-31 review of the /en English-page commits: finish and test the in-progress waitlist API fixes, remove the marketing claims that violate the truthfulness guardrail, and recapture prerender snapshots so the new English routes actually get indexed.

**Architecture:** The API fixes (welcome email via `services/mail.ts`, IP/email rate limiting, admin-gated stats) are ALREADY PARTIALLY IMPLEMENTED as uncommitted changes in the working tree — Task 1 verifies and finishes them, Task 2 adds tests, then they are committed. Copy fixes are plain text edits in three dashboard pages. Prerender recapture runs LAST because the snapshots must contain the corrected copy.

**Tech Stack:** Hono (API), Vitest with `vi.mock` (tests), React 19 + Vite (dashboard), Playwright-based prerender capture script.

## Global Constraints

- This is a Turborepo + pnpm monorepo; run commands from the repo root: `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada`.
- The working tree already contains uncommitted changes in: `apps/api/src/routes/waitlist.ts`, `apps/api/src/routes/admin/index.ts`, `apps/api/src/services/mail.ts`, `apps/dashboard/src/pages/EnglishGuidePage.tsx`, `apps/dashboard/src/pages/EnglishLanding.tsx`, and `apps/dashboard/src/components/ui/editorial.tsx`. **Do NOT revert, stash, or `git checkout` any of them.** Build on top of them.
- `apps/dashboard/src/components/ui/editorial.tsx` has uncommitted layout changes that are UNRELATED to this plan (hero-overlap follow-up to commit ec2ef7b). Never `git add` it in this plan's commits; always stage files explicitly by path, never `git add -A` or `git add .`.
- Marketing-claims guardrail (from `docs/superpowers/plans/2026-07-03-nordic-redesign-implementation.md`): public copy may only claim the verified USP list — 550 kr. CPM, category buying, no third-party cookies, 80/20 revenue split, monthly payouts ≥5.000 kr., viewability-counted impressions. No "real-time", no "instant", no time promises ("X minutes"), no publisher counts, no comparative claims about competitors with specific numbers.
- All chat-facing text is irrelevant here; code, comments, commit messages stay in English.
- Commit messages must NOT include any AI attribution footer.
- API tests run against mocks (`vi.mock` of `../src/lib/firebase`) and do not need the Firestore emulator, but the full suite `pnpm test:api` starts the emulator and needs Java on PATH. Use `pnpm test:api` for the final gate; for the single new test file during development, an emulator-free run works because the file mocks Firestore: `pnpm --filter @ada/api exec vitest run tests/waitlist.test.ts`.
- `pnpm verify` (format:check + typecheck + lint) must pass before every commit — it is also the pre-push hook.

---

### Task 1: Finish the in-progress waitlist API fixes

The uncommitted diff already: (a) replaces the inline fire-and-forget Resend call with an awaited `sendWaitlistWelcomeEmail` in `services/mail.ts` (SENDER_EMAIL fallback, HTML-escaped `category`), (b) adds IP + email rate limiting (Redis with in-memory fallback), and (c) moves the public `GET /v1/waitlist/stats` to `GET /v1/admin/waitlist/stats` behind `requireAuth, requireAdmin`. Two loose ends remain.

**Files:**

- Modify: `apps/api/src/routes/admin/index.ts` (the new `/waitlist/stats` handler, ~line 35)
- Modify: `apps/api/src/routes/waitlist.ts` (only if the unused-import check below finds one)

**Interfaces:**

- Consumes: `COLLECTIONS` from `@ada/shared/firestore`, `sendWaitlistWelcomeEmail(toEmail: string, role: string, category?: string): Promise<void>` from `../services/mail.js` (already implemented in the uncommitted diff).
- Produces: `GET /v1/admin/waitlist/stats` returning `{ total: number, roles: { advertisers: number, publishers: number, both: number }, categories: Record<string, number> }` — Task 2's tests rely on this exact shape and path.

- [ ] **Step 1: Use the collection constant instead of a string literal**

In `apps/api/src/routes/admin/index.ts`, the new handler uses `db.collection('waitlist')`. Every other route uses the typed constants. Add `COLLECTIONS` to the imports and switch the call:

```ts
// add to imports at top of apps/api/src/routes/admin/index.ts
import { COLLECTIONS } from '@ada/shared/firestore';
```

```ts
// in the /waitlist/stats handler, change:
const snapshot = await db.collection('waitlist').get();
// to:
const snapshot = await db.collection(COLLECTIONS.waitlist).get();
```

If `COLLECTIONS` is already imported there, just change the call.

- [ ] **Step 2: Check for a now-unused import in waitlist.ts**

The stats handler was removed from `apps/api/src/routes/waitlist.ts` but the file may still import `WaitlistEntry` from `@ada/shared/types`. It IS still used (the `entry: WaitlistEntry` object in the POST handler), so it should stay — verify rather than delete:

Run: `grep -n "WaitlistEntry" apps/api/src/routes/waitlist.ts`
Expected: at least one usage besides the import line. If the only hit is the import itself, delete that import line.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @ada/api build`
Expected: exits 0. (This also rebuilds `@ada/shared` first per the monorepo convention.)

Do not commit yet — Task 2 adds the tests that belong in the same commit.

---

### Task 2: Tests for the waitlist route and admin stats, then commit the API work

There are currently NO tests for the waitlist feature. Model the new file on `apps/api/tests/admin-entities-routes.test.ts` (mock `../src/lib/firebase` with `vi.mock`, fake bearer tokens `admin-token` / `user-token`).

**Files:**

- Create: `apps/api/tests/waitlist.test.ts`

**Interfaces:**

- Consumes: `app` (named export of `apps/api/src/index.ts`), the `POST /v1/waitlist` and `GET /v1/admin/waitlist/stats` routes from Task 1, `sendWaitlistWelcomeEmail` from `../src/services/mail`.
- Produces: nothing downstream; this is the test gate.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/tests/waitlist.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { app } from '../src/index';

interface StoredEntry {
  id: string;
  email: string;
  role: string;
  category?: string;
  createdAt: Date;
}

let waitlistStore: StoredEntry[] = [];

vi.mock('../src/services/mail', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/services/mail')>();
  return {
    ...original,
    sendWaitlistWelcomeEmail: vi.fn(async () => {}),
  };
});

vi.mock('../src/lib/firebase', () => {
  return {
    auth: {
      verifyIdToken: vi.fn(async (token: string) => {
        if (token === 'admin-token') {
          return { uid: 'u-admin', email: 'admin@a.is', admin: true, email_verified: true };
        } else if (token === 'user-token') {
          return { uid: 'u-user', email: 'user@a.is', email_verified: true };
        }
        throw new Error('Invalid token');
      }),
    },
    db: {
      collection: vi.fn((colName: string) => {
        const createQuery = (filters: Array<{ prop: string; val: unknown }> = []) => {
          const queryObj: any = {
            where: vi.fn((p: string, _op: string, v: unknown) =>
              createQuery([...filters, { prop: p, val: v }]),
            ),
            limit: vi.fn(() => queryObj),
            get: vi.fn(async () => {
              let filtered: StoredEntry[] = colName === 'waitlist' ? [...waitlistStore] : [];
              for (const f of filters) {
                filtered = filtered.filter(
                  (item) => (item as Record<string, unknown>)[f.prop] === f.val,
                );
              }
              return {
                empty: filtered.length === 0,
                size: filtered.length,
                docs: filtered.map((item) => ({ id: item.id, data: () => item })),
              };
            }),
          };
          return queryObj;
        };
        return {
          ...createQuery(),
          doc: vi.fn((id: string) => ({
            withConverter: vi.fn(() => ({
              set: vi.fn(async (entry: StoredEntry) => {
                waitlistStore.push({ ...entry, id });
              }),
            })),
          })),
        };
      }),
    },
  };
});

import { sendWaitlistWelcomeEmail } from '../src/services/mail';

// Each test uses a distinct x-forwarded-for IP: the route's in-memory
// rate limiter is module-level state that persists across tests.
function post(body: unknown, ip: string) {
  return app.request('/v1/waitlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  });
}

describe('POST /v1/waitlist', () => {
  beforeEach(() => {
    waitlistStore = [];
    vi.mocked(sendWaitlistWelcomeEmail).mockClear();
  });

  it('rejects invalid input with 400', async () => {
    const res = await post({ email: 'not-an-email', role: 'advertiser' }, '10.0.0.1');
    expect(res.status).toBe(400);
  });

  it('creates an entry and awaits the welcome email', async () => {
    const res = await post({ email: 'new@example.com', role: 'publisher' }, '10.0.0.2');
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(waitlistStore).toHaveLength(1);
    expect(sendWaitlistWelcomeEmail).toHaveBeenCalledWith(
      'new@example.com',
      'publisher',
      undefined,
    );
  });

  it('returns idempotent success for an already-registered email', async () => {
    waitlistStore.push({
      id: 'wtl_existing',
      email: 'dup@example.com',
      role: 'advertiser',
      createdAt: new Date(),
    });
    const res = await post({ email: 'dup@example.com', role: 'advertiser' }, '10.0.0.3');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe('wtl_existing');
    expect(waitlistStore).toHaveLength(1);
    expect(sendWaitlistWelcomeEmail).not.toHaveBeenCalled();
  });

  it('rate-limits the 6th submission from the same IP with 429', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await post({ email: `user${i}@example.com`, role: 'both' }, '10.0.0.4');
      expect(res.status).toBe(201);
    }
    const res = await post({ email: 'user5@example.com', role: 'both' }, '10.0.0.4');
    expect(res.status).toBe(429);
  });
});

describe('GET /v1/admin/waitlist/stats', () => {
  beforeEach(() => {
    waitlistStore = [
      { id: 'w1', email: 'a@x.is', role: 'advertiser', category: 'Food', createdAt: new Date() },
      { id: 'w2', email: 'b@x.is', role: 'publisher', category: 'food', createdAt: new Date() },
      { id: 'w3', email: 'c@x.is', role: 'both', createdAt: new Date() },
    ];
  });

  it('rejects unauthenticated requests with 401', async () => {
    const res = await app.request('/v1/admin/waitlist/stats');
    expect(res.status).toBe(401);
  });

  it('rejects non-admin users with 403', async () => {
    const res = await app.request('/v1/admin/waitlist/stats', {
      headers: { Authorization: 'Bearer user-token' },
    });
    expect(res.status).toBe(403);
  });

  it('aggregates roles and case-folded categories for admins', async () => {
    const res = await app.request('/v1/admin/waitlist/stats', {
      headers: { Authorization: 'Bearer admin-token' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(3);
    expect(body.roles).toEqual({ advertisers: 1, publishers: 1, both: 1 });
    expect(body.categories).toEqual({ food: 2 });
  });

  it('is no longer reachable at the old public path', async () => {
    const res = await app.request('/v1/waitlist/stats');
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run the new test file**

Run: `pnpm --filter @ada/api exec vitest run tests/waitlist.test.ts`
Expected: all 8 tests PASS (the implementation already exists from Task 1 — if any test fails, fix the implementation or the mock, not the assertion intent).

Note: if `vitest` complains about `FIRESTORE_EMULATOR_HOST` (its config sets it but the mock never connects), that is fine — the env var alone does not require the emulator when Firestore is fully mocked. If the run genuinely tries to reach an emulator, wrap it: `pnpm exec firebase --config firebase/firebase.json emulators:exec --only firestore 'pnpm --filter @ada/api exec vitest run tests/waitlist.test.ts'`.

- [ ] **Step 3: Verify and commit the API work**

Run: `pnpm verify`
Expected: exits 0. If prettier fails, run `pnpm format` and re-check.

```bash
git add apps/api/src/routes/waitlist.ts apps/api/src/routes/admin/index.ts apps/api/src/services/mail.ts apps/api/tests/waitlist.test.ts
git commit -m "fix(api): harden waitlist signup — awaited welcome email via mail service, IP/email rate limiting, admin-gated stats"
```

---

### Task 3: Remove guardrail-violating claims from the English pages

Two exact violations remain after the uncommitted copy fixes, plus one time-promise, plus a sweep.

**Files:**

- Modify: `apps/dashboard/src/pages/EnglishLanding.tsx:39`
- Modify: `apps/dashboard/src/pages/EnglishCategoryPage.tsx:28`
- Modify: `apps/dashboard/src/pages/EnglishGuidePage.tsx` (the "less than 2 minutes" sentence, ~line 60)

**Interfaces:**

- Consumes: nothing from other tasks.
- Produces: final English copy that Task 4 captures into the prerender snapshots — Task 4 MUST run after this task's commit.

- [ ] **Step 1: Fix the FAQ "real-time" claim on the landing page**

In `apps/dashboard/src/pages/EnglishLanding.tsx`, in the `ENGLISH_FAQS` array, replace:

```
creators receive 80% of net advertising revenue with complete real-time dashboard transparency.
```

with:

```
creators receive 80% of net advertising revenue with transparent dashboard reporting updated hourly.
```

- [ ] **Step 2: Fix the "instant" claim on the food category page**

In `apps/dashboard/src/pages/EnglishCategoryPage.tsx`, in the `food` entry's `brandHook`, replace:

```
Reach engaged foodies during meal prep and grocery planning with instant category-wide placement.
```

with:

```
Reach engaged foodies during meal prep and grocery planning with category-wide placement across independent food blogs.
```

- [ ] **Step 3: Fix the "less than 2 minutes" time promise in the guide**

Commit 624ae5a removed the "3-minute signup" promise from the Icelandic pages; the English guide reintroduced the same pattern. In `apps/dashboard/src/pages/EnglishGuidePage.tsx`, replace:

```
Embedding Birtingur takes less than 2 minutes: paste a single size-budgeted script snippet into your site.
```

with:

```
Embedding Birtingur is a single copy-paste: add one size-budgeted script snippet to your site.
```

- [ ] **Step 4: Sweep all three English pages for remaining banned patterns**

Run:

```bash
grep -rniE 'real.?time|instant|guarantee|fastest|no\.? ?1|minutes|seconds|[0-9,]+\+ (sessions|users|publishers|sites)' \
  apps/dashboard/src/pages/EnglishLanding.tsx \
  apps/dashboard/src/pages/EnglishCategoryPage.tsx \
  apps/dashboard/src/pages/EnglishGuidePage.tsx
```

Expected: zero hits that are marketing claims. (Hits inside CSS class names, `readTime: '5 min read'` labels, or code identifiers are fine — judge each hit against the Global Constraints USP list; anything promising speed, scale, or superiority that is not on the list gets rewritten in the same spirit as Steps 1–3.)

- [ ] **Step 5: Verify and commit**

Run: `pnpm verify`
Expected: exits 0.

```bash
git add apps/dashboard/src/pages/EnglishLanding.tsx apps/dashboard/src/pages/EnglishCategoryPage.tsx apps/dashboard/src/pages/EnglishGuidePage.tsx
git commit -m "fix(marketing): drop real-time, instant and time-promise claims from English pages"
```

Note this deliberately also commits the previously-uncommitted copy softening in `EnglishGuidePage.tsx`/`EnglishLanding.tsx` — that is intended. It must NOT include `editorial.tsx`.

---

### Task 4: Recapture prerender snapshots so the /en routes get static HTML

The sitemap (`apps/dashboard/public/sitemap.xml`) has 44 routes but `apps/dashboard/prerender/snapshots.json` has 35 and zero `/en` routes — crawlers currently get an empty SPA shell on every English page, defeating the whole SEO purpose. The capture script renders the BUILT `dist/`, not source, and refuses to run against a stale build.

**Files:**

- Modify (generated): `apps/dashboard/prerender/snapshots.json`

**Interfaces:**

- Consumes: the committed copy from Task 3 (must be committed/present in `src/` before building).
- Produces: `snapshots.json` containing all 44 sitemap routes; the Vercel build's `prerender-apply` step turns these into `dist/<route>/index.html`.

- [ ] **Step 1: Build the dashboard**

Run: `pnpm --filter @ada/dashboard build`
Expected: exits 0, ends with the `[prerender:apply]` line (it will still say 35 pages — that is the OLD snapshot count, expected at this point).

- [ ] **Step 2: Capture snapshots**

Run: `pnpm --filter @ada/dashboard prerender:capture`
Expected: exits 0. It renders every route in `public/sitemap.xml` with Playwright and rewrites `prerender/snapshots.json`. If it refuses with a staleness error, re-run Step 1 first (the guard means `src/` is newer than `dist/index.html`). If Playwright's browser is missing, run `pnpm --filter @ada/dashboard exec playwright install chromium` and retry.

- [ ] **Step 3: Verify the snapshot contents**

Run:

```bash
node -e "const s=require('./apps/dashboard/prerender/snapshots.json');const en=s.filter(x=>x.route.startsWith('/en'));console.log('total:',s.length,'en:',en.length);console.log(en.map(x=>x.route).join('\n'));const empty=s.filter(x=>!x.rootHtml||x.rootHtml.length<500);if(empty.length){console.error('SUSPICIOUSLY EMPTY:',empty.map(x=>x.route));process.exit(1)}"
```

Expected: `total: 44`, `en:` ≥ 9, the `/en`, `/en/categories/*`, `/en/guides/*` routes listed, and no "SUSPICIOUSLY EMPTY" output. Also spot-check that the corrected copy landed:

```bash
node -e "const s=require('./apps/dashboard/prerender/snapshots.json');const en=s.find(x=>x.route==='/en');console.log(/real-time/i.test(en.rootHtml)?'FAIL: real-time still present':'OK: no real-time claim')"
```

Expected: `OK: no real-time claim`.

- [ ] **Step 4: Rebuild to confirm apply picks up all routes**

Run: `pnpm --filter @ada/dashboard build`
Expected: the final `[prerender:apply] wrote 44 prerendered page(s)` line, and `apps/dashboard/dist/en/index.html` exists.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/prerender/snapshots.json
git commit -m "chore(seo): capture prerender snapshots for the English routes"
```

---

### Task 5: Full-suite gate

**Files:** none modified.

- [ ] **Step 1: Run the API suite against the emulator**

Run: `pnpm test:api`
Expected: all tests pass, including the new `waitlist.test.ts`. Requires Java on PATH (`java -version`); if Java is missing, report that instead of skipping silently.

- [ ] **Step 2: Run repo-wide verification**

Run: `pnpm verify`
Expected: exits 0.

- [ ] **Step 3: Confirm final state**

Run: `git status --short`
Expected: ONLY `apps/dashboard/src/components/ui/editorial.tsx` remains modified (the unrelated in-progress layout work — leave it untouched). Nothing under `apps/api` or `apps/dashboard/prerender` is dirty.
