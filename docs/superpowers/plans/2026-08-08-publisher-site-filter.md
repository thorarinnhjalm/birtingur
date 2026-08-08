# Publisher Site Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publishers with several sites get a site switcher in the dashboard header, a per-site overview table, and correctly scoped stats — including fixing Earnings, which today silently reports only the first site.

**Architecture:** `GET /v1/publishers/stats` gains an optional owner-validated `?publisherId=` filter and (for multi-site owners) a `bySite` array computed from per-site subtotals it already fetches. The dashboard adds a `useSiteFilter` hook (URL `?site=` param mirrored to sessionStorage) and a `SiteSwitcher` in the TopBar; Dashboard/Earnings pass the filter to the stats query, SlotList filters client-side. Spec: `docs/superpowers/specs/2026-08-08-stats-granularity-design.md` (Part B).

**Tech Stack:** Hono + firebase-admin (emulator tests), React 19, react-router-dom, TanStack Query, Vitest + testing-library, Tailwind 4.

## Global Constraints

- ESM: relative imports use the `.js` extension even from `.ts` sources.
- API tests need the emulator: single-file runs wrapped in `firebase --config firebase/firebase.json emulators:exec "pnpm --filter @ada/api test -- tests/<file>.ts"`; full suite via `pnpm test:api`.
- Dashboard tests: `pnpm --filter @ada/dashboard test -- <pattern>`.
- All money integer ISK; UI copy Icelandic; brand tokens, no raw hex.
- Single-site publishers must see zero UI change anywhere.
- Branch: `feat/publisher-site-filter` off `main`. Never push `main` directly (oruggt-ship).

---

### Task 1: API — `bySite` subtotals and `?publisherId=` filter

**Files:**
- Modify: `apps/api/src/services/publisher-stats.ts` (`getAggregatedPublisherStats`, ~line 171)
- Modify: `apps/api/src/routes/publishers.ts` (`GET /stats` handler, ~line 33)
- Test: `apps/api/tests/publisher-routes.test.ts` (append)

**Interfaces:**
- Consumes: `getPublisherStats(publisherId, timeframeDays)` and `getPublishersByOwnerEmail(email)` (both exist).
- Produces (exact shapes Tasks 2–3 rely on):

```ts
export interface SiteBreakdown {
  publisherId: string;
  displayName: string;
  domain: string;
  impressions: number;
  clicks: number;
  pageviews: number;
  spendIsk: number;
}

// PublisherStatsResponse gains: bySite?: SiteBreakdown[]  (present only for multi-site aggregates)

export async function getAggregatedPublisherStats(
  publishers: Array<{ id: string; displayName: string; domain: string }>,
  timeframeDays: 7 | 30 = 7,
): Promise<PublisherStatsResponse>;
```

Signature change: the function takes publisher summaries instead of bare ids (it needs names for `bySite`). The `/stats` route is its only caller; update it in the same commit.

- [ ] **Step 1: Write the failing tests**

Append to `apps/api/tests/publisher-routes.test.ts`, using the file's existing pattern (mocked `auth.verifyIdToken`, real emulator Firestore, `app.request(...)`). Stats docs are seeded directly through the admin `db` (import `{ db }` from `../src/lib/firebase` — the mock spreads the original module, so `db` is real):

```ts
describe('GET /v1/publishers/stats site filter', () => {
  function todayKey(): string {
    return new Date().toISOString().split('T')[0]!.replace(/-/g, '');
  }

  async function createSite(domain: string, displayName: string): Promise<string> {
    const res = await app.request('/v1/publishers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-token' },
      body: JSON.stringify({
        domain,
        displayName,
        payoutMethod: samplePayout,
        contentPolicy: samplePolicy,
        categories: ['matur'],
      }),
    });
    expect(res.status).toBe(201);
    return (await res.json()).id;
  }

  async function seedDay(publisherId: string, impressions: number, clicks: number) {
    await db.doc(`stats/publishers/${publisherId}/${todayKey()}`).set({
      impressions,
      clicks,
      spendIsk: Math.round((impressions / 1000) * 550),
      pageviews: impressions * 2,
    });
  }

  it('returns bySite subtotals for a multi-site owner and none for single-site', async () => {
    vi.mocked(auth.verifyIdToken).mockResolvedValue(mockUser as any);
    const a = await createSite('vefur-a.is', 'Vefur A');
    const b = await createSite('vefur-b.is', 'Vefur B');
    await seedDay(a, 1000, 10);
    await seedDay(b, 500, 5);

    const res = await app.request('/v1/publishers/stats?timeframe=7', {
      headers: { Authorization: 'Bearer valid-token' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.impressions).toBe(1500);
    expect(body.bySite).toHaveLength(2);
    const siteA = body.bySite.find((s: any) => s.publisherId === a);
    expect(siteA).toMatchObject({
      displayName: 'Vefur A',
      domain: 'vefur-a.is',
      impressions: 1000,
      clicks: 10,
    });
  });

  it('filters to one owned site via ?publisherId=', async () => {
    vi.mocked(auth.verifyIdToken).mockResolvedValue(mockUser as any);
    const a = await createSite('vefur-a.is', 'Vefur A');
    const b = await createSite('vefur-b.is', 'Vefur B');
    await seedDay(a, 1000, 10);
    await seedDay(b, 500, 5);

    const res = await app.request(`/v1/publishers/stats?timeframe=7&publisherId=${b}`, {
      headers: { Authorization: 'Bearer valid-token' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.impressions).toBe(500);
    expect(body.bySite).toBeUndefined();
  });

  it('rejects a publisherId the caller does not own with 403', async () => {
    vi.mocked(auth.verifyIdToken).mockResolvedValue(mockUser as any);
    await createSite('vefur-a.is', 'Vefur A');

    const res = await app.request('/v1/publishers/stats?publisherId=pub_someone_elses', {
      headers: { Authorization: 'Bearer valid-token' },
    });
    expect(res.status).toBe(403);
  });

  it('omits bySite for a single-site owner', async () => {
    vi.mocked(auth.verifyIdToken).mockResolvedValue(mockUser as any);
    const a = await createSite('vefur-a.is', 'Vefur A');
    await seedDay(a, 100, 1);

    const res = await app.request('/v1/publishers/stats?timeframe=7', {
      headers: { Authorization: 'Bearer valid-token' },
    });
    const body = await res.json();
    expect(body.impressions).toBe(100);
    expect(body.bySite).toBeUndefined();
  });
});
```

(If `db` isn't already imported at the top of the test file, add it to the existing `../src/lib/firebase` import.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `firebase --config firebase/firebase.json emulators:exec "pnpm --filter @ada/api test -- tests/publisher-routes.test.ts"`
Expected: the four new tests FAIL (`bySite` undefined / filter ignored / 200 instead of 403); existing tests PASS.

- [ ] **Step 3: Implement**

1. `apps/api/src/services/publisher-stats.ts` — change `getAggregatedPublisherStats` to the signature in the Interfaces block. Inside, `publisherIds` becomes `publishers.map((p) => p.id)` for the parallel `getPublisherStats` calls. After the totals loop, build the subtotals (the per-site responses are already in `allStats`, index-aligned with `publishers`):

```ts
const bySite: SiteBreakdown[] =
  publishers.length > 1
    ? publishers
        .map((p, i) => ({
          publisherId: p.id,
          displayName: p.displayName,
          domain: p.domain,
          impressions: allStats[i]!.impressions,
          clicks: allStats[i]!.clicks,
          pageviews: allStats[i]!.pageviews || 0,
          spendIsk: allStats[i]!.spendIsk,
        }))
        .sort((a, b) => b.impressions - a.impressions)
    : [];
```

Return `...(bySite.length > 0 ? { bySite } : {})` merged into the existing return object, and add `bySite?: SiteBreakdown[]` to `PublisherStatsResponse`.

2. `apps/api/src/routes/publishers.ts` — the `/stats` handler:

```ts
publishersRouter.get('/stats', async (c) => {
  const user = c.get('user');
  const publishers = await getPublishersByOwnerEmail(user.email);

  const queryTimeframe = c.req.query('timeframe');
  const timeframe = queryTimeframe === '30' ? 30 : 7;

  const publisherId = c.req.query('publisherId');
  if (publisherId) {
    if (!publishers.some((p) => p.id === publisherId)) {
      throw new AppError(403, 'Publisher does not belong to caller', 'FORBIDDEN');
    }
    return c.json(await getPublisherStats(publisherId, timeframe));
  }

  const stats = await getAggregatedPublisherStats(
    publishers.map((p) => ({ id: p.id, displayName: p.displayName, domain: p.domain })),
    timeframe,
  );
  return c.json(stats);
});
```

Add `getPublisherStats` to the route file's imports from `../services/publisher-stats.js` if missing.

- [ ] **Step 4: Run tests to verify they pass**

Run: `firebase --config firebase/firebase.json emulators:exec "pnpm --filter @ada/api test -- tests/publisher-routes.test.ts"`
Expected: PASS. Also run `firebase --config firebase/firebase.json emulators:exec "pnpm --filter @ada/api test -- tests/publisher-stats.test.ts"` — if the signature change broke its fixtures, update the call sites there to pass `{ id, displayName: 'X', domain: 'x.is' }` objects.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/publisher-stats.ts apps/api/src/routes/publishers.ts apps/api/tests/publisher-routes.test.ts apps/api/tests/publisher-stats.test.ts
git commit -m "feat(api): publisher stats site filter and per-site subtotals"
```

---

### Task 2: `useSiteFilter` hook + `SiteSwitcher` in the TopBar

**Files:**
- Create: `apps/dashboard/src/hooks/useSiteFilter.ts`
- Create: `apps/dashboard/src/components/SiteSwitcher.tsx`
- Modify: `apps/dashboard/src/components/layout/TopBar.tsx` (render the switcher for the publisher area)
- Test: `apps/dashboard/src/components/SiteSwitcher.test.tsx` (new)

**Interfaces:**
- Consumes: `usePublishers()` from `@/hooks/usePublisher` (`Publisher[]` with `id`, `displayName`, `domain`).
- Produces: `useSiteFilter(): { siteId: string | null; setSiteId: (id: string | null) => void }` — Task 3's pages call this. `siteId` is only ever a publisher id the current user owns (foreign/stale ids resolve to `null`).

- [ ] **Step 1: Write the failing tests**

Create `apps/dashboard/src/components/SiteSwitcher.test.tsx`:

```tsx
import { test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SiteSwitcher } from './SiteSwitcher';
import { apiFetch } from '@/lib/api';

vi.mock('@/lib/api', () => ({ apiFetch: vi.fn() }));
const mockedApiFetch = vi.mocked(apiFetch);

function renderSwitcher() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/publisher']}>
        <SiteSwitcher />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const TWO_SITES = [
  { id: 'pub_a', displayName: 'Vefur A', domain: 'vefur-a.is' },
  { id: 'pub_b', displayName: 'Vefur B', domain: 'vefur-b.is' },
];

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});

test('renders nothing for a single-site publisher', async () => {
  mockedApiFetch.mockResolvedValue([TWO_SITES[0]]);
  renderSwitcher();
  await vi.waitFor(() => expect(mockedApiFetch).toHaveBeenCalled());
  expect(screen.queryByRole('combobox', { name: 'Velja vef' })).not.toBeInTheDocument();
});

test('lists all sites plus "Allir vefir" and persists the selection', async () => {
  mockedApiFetch.mockResolvedValue(TWO_SITES);
  renderSwitcher();
  const select = await screen.findByRole('combobox', { name: 'Velja vef' });
  expect(screen.getByRole('option', { name: 'Allir vefir' })).toBeInTheDocument();
  fireEvent.change(select, { target: { value: 'pub_b' } });
  expect((select as HTMLSelectElement).value).toBe('pub_b');
  expect(sessionStorage.getItem('birtingur.siteFilter')).toBe('pub_b');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @ada/dashboard test -- SiteSwitcher`
Expected: FAIL — module `./SiteSwitcher` does not exist.

- [ ] **Step 3: Implement**

`apps/dashboard/src/hooks/useSiteFilter.ts`:

```ts
import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePublishers } from './usePublisher';

const STORAGE_KEY = 'birtingur.siteFilter';

/**
 * Publisher-area site filter. Canonical value lives in the URL (?site=pub_x)
 * so filtered views are linkable; sessionStorage mirrors it so the choice
 * survives sidebar navigation (which drops query params). Ids that don't
 * belong to the signed-in owner resolve to null (= "Allir vefir").
 */
export function useSiteFilter(): {
  siteId: string | null;
  setSiteId: (id: string | null) => void;
} {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: publishers } = usePublishers();

  const raw = searchParams.get('site') ?? sessionStorage.getItem(STORAGE_KEY);
  const siteId = raw && publishers?.some((p) => p.id === raw) ? raw : null;

  const setSiteId = useCallback(
    (id: string | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (id) next.set('site', id);
          else next.delete('site');
          return next;
        },
        { replace: true },
      );
      if (id) sessionStorage.setItem(STORAGE_KEY, id);
      else sessionStorage.removeItem(STORAGE_KEY);
    },
    [setSearchParams],
  );

  return { siteId, setSiteId };
}
```

(While `usePublishers` is still loading, `siteId` is `null`; pages briefly fetch the aggregate and refetch filtered once publishers arrive. Accepted trade-off — no flash of wrong data, only of broader data.)

`apps/dashboard/src/components/SiteSwitcher.tsx`:

```tsx
import { usePublishers } from '@/hooks/usePublisher';
import { useSiteFilter } from '@/hooks/useSiteFilter';

export function SiteSwitcher() {
  const { data: publishers } = usePublishers();
  const { siteId, setSiteId } = useSiteFilter();

  if (!publishers || publishers.length < 2) return null;

  return (
    <select
      aria-label="Velja vef"
      value={siteId ?? ''}
      onChange={(e) => setSiteId(e.target.value || null)}
      className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:border-slate-300 transition cursor-pointer max-w-[220px]"
    >
      <option value="">Allir vefir</option>
      {publishers.map((p) => (
        <option key={p.id} value={p.id}>
          {p.displayName} — {p.domain}
        </option>
      ))}
    </select>
  );
}
```

`TopBar.tsx`: import `{ SiteSwitcher } from '../SiteSwitcher'` and render `{isPublisher && <SiteSwitcher />}` inside the right-hand controls flex container, immediately before the notifications bell (the `isPublisher` flag already exists at the top of the component; gating here keeps `usePublishers` from firing in the advertiser/admin areas).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @ada/dashboard test -- SiteSwitcher`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/hooks/useSiteFilter.ts apps/dashboard/src/components/SiteSwitcher.tsx apps/dashboard/src/components/layout/TopBar.tsx apps/dashboard/src/components/SiteSwitcher.test.tsx
git commit -m "feat(dashboard): site switcher for multi-site publishers"
```

---

### Task 3: Wire the filter into Dashboard, Earnings, SlotList + per-site overview table

**Files:**
- Modify: `apps/dashboard/src/pages/publisher/Dashboard.tsx` (stats query ~line 57, `StatsResponse` interface ~line 37, new overview section)
- Modify: `apps/dashboard/src/pages/publisher/Earnings.tsx` (stats query ~line 29 — also switches endpoint, see below)
- Modify: `apps/dashboard/src/pages/publisher/SlotList.tsx` (site cards loop ~line 120)
- Test: `apps/dashboard/src/pages/publisher/Dashboard.test.tsx` (new)

**Interfaces:**
- Consumes: `useSiteFilter()` (Task 2); `bySite?: SiteBreakdown[]` on the stats response (Task 1, fields `publisherId/displayName/domain/impressions/clicks/pageviews/spendIsk`).
- Produces: UI only.

- [ ] **Step 1: Write the failing tests**

Create `apps/dashboard/src/pages/publisher/Dashboard.test.tsx` following the `CampaignDetail.test.tsx` conventions (mock `@/lib/api` without `importActual` — the real chain pulls in `@/lib/firebase` which hangs in the sandbox; wrap in `MemoryRouter` since the page uses `useNavigate`/`useSearchParams`; mock any auth context the page imports the same way sibling tests do):

```tsx
const BY_SITE_STATS = {
  impressions: 1500,
  clicks: 15,
  spendIsk: 825,
  pageviews: 3000,
  history: [],
  bySite: [
    { publisherId: 'pub_a', displayName: 'Vefur A', domain: 'vefur-a.is', impressions: 1000, clicks: 10, pageviews: 2000, spendIsk: 550 },
    { publisherId: 'pub_b', displayName: 'Vefur B', domain: 'vefur-b.is', impressions: 500, clicks: 5, pageviews: 1000, spendIsk: 275 },
  ],
};

test('shows the per-site overview table when viewing all sites', async () => {
  setupApiMock({ publishers: TWO_SITES, slots: [], stats: BY_SITE_STATS });
  renderPage();
  expect(await screen.findByText('Vefur A')).toBeInTheDocument();
  expect(screen.getByText('Vefur B')).toBeInTheDocument();
});

test('clicking a site row narrows the filter', async () => {
  setupApiMock({ publishers: TWO_SITES, slots: [], stats: BY_SITE_STATS });
  renderPage();
  fireEvent.click(await screen.findByText('Vefur B'));
  await vi.waitFor(() => {
    expect(mockedApiFetch).toHaveBeenCalledWith(
      expect.stringContaining('publisherId=pub_b'),
    );
  });
});
```

`setupApiMock` routes on the URL prefix: `/v1/publishers/all` → `publishers`, `/v1/publishers/me/slots` → `slots`, `/v1/publishers/stats` → `stats`; `renderPage` renders `<Dashboard />` inside `QueryClientProvider` + `MemoryRouter`. Write both helpers in this file (mirroring the sibling test file's structure); reuse `TWO_SITES` from the SiteSwitcher test by redefining it locally.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @ada/dashboard test -- publisher/Dashboard`
Expected: FAIL — no per-site table, no `publisherId` in any fetch.

- [ ] **Step 3: Implement**

1. **Dashboard.tsx** — extend `StatsResponse` with:

```ts
bySite?: {
  publisherId: string;
  displayName: string;
  domain: string;
  impressions: number;
  clicks: number;
  pageviews: number;
  spendIsk: number;
}[];
```

In `PublisherHome`, add `const { siteId, setSiteId } = useSiteFilter();` and thread it through the stats query:

```ts
const { data: stats } = useQuery<StatsResponse>({
  queryKey: ['publisher', 'stats', timeframe, siteId],
  queryFn: () =>
    apiFetch<StatsResponse>(
      `/v1/publishers/stats?timeframe=${timeframe}${siteId ? `&publisherId=${siteId}` : ''}`,
    ),
  enabled: !!publishers && publishers.length > 0,
});
```

Below the existing stat cards, render the overview when unfiltered and multi-site (`!siteId && stats?.bySite && stats.bySite.length > 1`) — a `Card` with the same table classes as the campaign-detail site table (`text-xs font-medium border-collapse`, header row `text-slate-400 font-semibold uppercase tracking-wider`), heading `Yfirlit eftir vefjum`, columns Vefur / Birtingar / Flettingar / Smellir / Tekjur:

```tsx
{stats.bySite.map((site) => (
  <tr
    key={site.publisherId}
    onClick={() => setSiteId(site.publisherId)}
    className="hover:bg-slate-50 cursor-pointer"
  >
    <td className="py-3">
      <div className="font-semibold text-slate-900">{site.displayName}</div>
      <div className="text-[10px] text-slate-400 font-mono">{site.domain}</div>
    </td>
    <td className="py-3">{site.impressions.toLocaleString('is-IS')}</td>
    <td className="py-3">{site.pageviews.toLocaleString('is-IS')}</td>
    <td className="py-3">{site.clicks.toLocaleString('is-IS')}</td>
    <td className="py-3 text-right">{formatIsk(site.spendIsk)}</td>
  </tr>
))}
```

(`bySite` is pre-sorted by impressions server-side. Revenue column shows gross `spendIsk`, matching the page's existing figures.)

2. **Earnings.tsx** — replace the stats query (this also fixes the first-site-only bug: `/me/stats` resolves a single publisher doc):

```ts
const { siteId } = useSiteFilter();
const { data: stats, isLoading: isStatsLoading } = useQuery<StatsResponse>({
  queryKey: ['publisher', 'stats', 30, siteId],
  queryFn: () =>
    apiFetch<StatsResponse>(
      `/v1/publishers/stats?timeframe=30${siteId ? `&publisherId=${siteId}` : ''}`,
    ),
});
```

Both endpoints return the same `PublisherStatsResponse` shape, so the local `StatsResponse` interface needs no change. Under the payouts list, when `siteId` is set, add one muted line: `<p className="text-xs text-slate-400">Uppgjör eru alltaf fyrir alla vefi þína samanlagt.</p>` (payout runs are per owner, not per site).

3. **SlotList.tsx** — add `const { siteId } = useSiteFilter();` and narrow the cards loop: `{sites.filter((site) => !siteId || site.id === siteId).map((site) => (`. (The local variable holding the publisher list is `sites`; only the `.map` call site changes.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @ada/dashboard test -- publisher/Dashboard && pnpm --filter @ada/dashboard test -- SiteSwitcher`
Expected: PASS.

- [ ] **Step 5: Typecheck, lint, visual sanity**

Run: `pnpm --filter @ada/dashboard typecheck && pnpm --filter @ada/dashboard lint`
Expected: clean. Then by eye against seeded emulator data (`pnpm emulator` + `pnpm --filter @ada/api seed` + `pnpm dev`): switcher appears only with ≥2 sites, per-site table rows narrow the view, Earnings totals now cover all sites.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/pages/publisher/Dashboard.tsx apps/dashboard/src/pages/publisher/Earnings.tsx apps/dashboard/src/pages/publisher/SlotList.tsx apps/dashboard/src/pages/publisher/Dashboard.test.tsx
git commit -m "feat(dashboard): wire site filter through publisher pages, fix Earnings multi-site totals"
```

---

### Task 4: Verify, ship

- [ ] **Step 1: Full verify**

Run: `pnpm verify && pnpm test:api && pnpm --filter @ada/dashboard test`
Expected: all green.

- [ ] **Step 2: Push branch and open PR**

Follow the oruggt-ship process (branch → PR → adversarial review → owner merges). PR title: `feat: publisher site filter and per-site overview`. Body must call out the `getAggregatedPublisherStats` signature change and the Earnings endpoint switch (bug fix: multi-site owners previously saw only their first site's earnings).
