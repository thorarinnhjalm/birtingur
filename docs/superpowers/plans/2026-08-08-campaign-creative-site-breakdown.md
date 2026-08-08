# Campaign Creative-per-Site Breakdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Advertisers see, inside the existing per-site table on the campaign detail page, how each creative performs on each site.

**Architecture:** The hourly campaign stats docs (`stats/campaigns/{campaignId}/{YYYYMMDDHH}`) gain a `byPublisherCreative` nested map written by the aggregation cron; `getCampaignStats` aggregates it across the window, computes an "unattributed" remainder for hours that predate the field, and enriches with creative size labels + thumbnails; the dashboard table rows become expandable. Spec: `docs/superpowers/specs/2026-08-08-stats-granularity-design.md` (Part A).

**Tech Stack:** TypeScript ESM (`.js` import suffixes), Firestore `FieldValue.increment` dot-path updates, Hono, Vitest, React 19 + TanStack Query, Tailwind 4.

## Global Constraints

- ESM: relative imports use the `.js` extension even from `.ts` sources.
- API tests run against the Firestore emulator. Single-file runs must be wrapped: `firebase --config firebase/firebase.json emulators:exec "pnpm --filter @ada/api test -- tests/<file>.ts"` (needs Java on PATH). `apps/api/tests/stats-aggregator.test.ts` mocks `../src/lib/firebase` entirely but lives in the same suite — use the wrapper anyway.
- Dashboard tests are plain vitest: `pnpm --filter @ada/dashboard test -- <pattern>`.
- All money is integer ISK. UI copy is Icelandic. Use brand tokens / existing table classes, no raw hex.
- No serving (`apps/serving`) changes — `creativeId` already reaches the aggregator via `QueuedEvent`.
- Branch: `feat/campaign-creative-site-breakdown` off `main`. Never push `main` directly (oruggt-ship).

---

### Task 1: Aggregator writes `byPublisherCreative`

**Files:**
- Modify: `apps/api/src/services/stats-aggregator.ts` (CampaignBucket interface ~line 47, event loop ~lines 87–105, write phase ~lines 145–160)
- Test: `apps/api/tests/stats-aggregator.test.ts` (append to existing `describe`; the file already mocks `../src/lib/firebase` with a `mockStatsDocs` map that applies dot-path increments)

**Interfaces:**
- Consumes: existing `aggregateEvents(events: QueuedEvent[])` and the test file's `mockStatsDocs` record.
- Produces: hourly campaign docs additionally contain `byPublisherCreative: { [publisherId]: { [creativeId]: { impressions: number; clicks: number } } }`. Task 2 reads this field.

- [ ] **Step 1: Write the failing tests**

Append inside the existing top-level `describe` in `apps/api/tests/stats-aggregator.test.ts`. Reuse the file's existing event-fixture style; if it has no helper, define this one next to the tests:

```ts
function makeEvent(overrides: Partial<QueuedEvent> = {}): QueuedEvent {
  return {
    type: 'impression',
    slotId: 'slot_1',
    publisherId: 'pub_a',
    creativeId: 'cre_1',
    campaignId: 'cmp_1',
    advertiserId: 'adv_1',
    country: 'IS',
    visitorToken: 'v1',
    ts: Date.UTC(2026, 7, 8, 12, 30, 0),
    ...overrides,
  };
}
```

(Import the `QueuedEvent` type from `../src/services/stats-aggregator`.)

```ts
describe('byPublisherCreative', () => {
  it('nests impressions and clicks per publisher per creative on the campaign hour doc', async () => {
    await aggregateEvents([
      makeEvent(),
      makeEvent(),
      makeEvent({ creativeId: 'cre_2' }),
      makeEvent({ publisherId: 'pub_b' }),
      makeEvent({ type: 'click', creativeId: 'cre_2' }),
    ]);

    const doc = mockStatsDocs['stats/campaigns/cmp_1/2026080812'];
    expect(doc.byPublisherCreative).toEqual({
      pub_a: {
        cre_1: { impressions: 2, clicks: 0 },
        cre_2: { impressions: 1, clicks: 1 },
      },
      pub_b: {
        cre_1: { impressions: 1, clicks: 0 },
      },
    });
    // existing per-publisher totals unchanged
    expect(doc.byPublisher.pub_a.impressions).toBe(3);
  });

  it('increments across separate batches instead of overwriting', async () => {
    await aggregateEvents([makeEvent()]);
    await aggregateEvents([makeEvent()]);
    const doc = mockStatsDocs['stats/campaigns/cmp_1/2026080812'];
    expect(doc.byPublisherCreative.pub_a.cre_1.impressions).toBe(2);
  });

  it('skips events with an empty creativeId', async () => {
    await aggregateEvents([makeEvent({ creativeId: '' })]);
    const doc = mockStatsDocs['stats/campaigns/cmp_1/2026080812'];
    expect(doc.byPublisherCreative).toBeUndefined();
    expect(doc.byPublisher.pub_a.impressions).toBe(1);
  });
});
```

Note on the mock: its `commit` initializes missing docs as `{ impressions: 0, clicks: 0, pageviews: 0 }` and applies dot-keys by splitting on `.` — nested creative paths work without touching the mock. `clicks: 0` entries appear because the implementation (Step 3) always increments both fields (increment by 0 creates the key); if the mock's `getVal` yields no key for a 0-increment, assert with `expect(doc.byPublisherCreative.pub_a.cre_1.impressions).toBe(2)` style per-field checks instead of `toEqual` — prefer adjusting the assertions, not the mock.

- [ ] **Step 2: Run tests to verify they fail**

Run: `firebase --config firebase/firebase.json emulators:exec "pnpm --filter @ada/api test -- tests/stats-aggregator.test.ts"`
Expected: the three new tests FAIL (`byPublisherCreative` is `undefined`); all pre-existing tests PASS.

- [ ] **Step 3: Implement**

In `apps/api/src/services/stats-aggregator.ts`:

1. Extend the bucket interface:

```ts
interface CampaignBucket {
  impressions: number;
  clicks: number;
  byPublisher: Record<string, { impressions: number; clicks: number }>;
  byPublisherCreative: Record<string, Record<string, { impressions: number; clicks: number }>>;
}
```

2. Initialize `byPublisherCreative: {}` where the bucket default is constructed (`campaignHour.get(ch) ?? { impressions: 0, clicks: 0, byPublisher: {} }` — add the new field).

3. In the non-pageview branch, after the existing `byPublisher` bookkeeping (both the impression and click arms), add once (not per-arm):

```ts
if (ev.creativeId) {
  const forPub = (cb.byPublisherCreative[ev.publisherId] ??= {});
  const forCreative = (forPub[ev.creativeId] ??= { impressions: 0, clicks: 0 });
  if (ev.type === 'impression') forCreative.impressions++;
  else forCreative.clicks++;
}
```

4. In the write phase, inside the `for (const [key, b] of campaignHour)` loop after the `byPublisher` dot-path updates:

```ts
for (const [pubId, creatives] of Object.entries(b.byPublisherCreative)) {
  for (const [creativeId, cStats] of Object.entries(creatives)) {
    updateData[`byPublisherCreative.${pubId}.${creativeId}.impressions`] = FieldValue.increment(
      cStats.impressions,
    );
    updateData[`byPublisherCreative.${pubId}.${creativeId}.clicks`] = FieldValue.increment(
      cStats.clicks,
    );
  }
}
```

Ids (`pub_*`, `cre_*`) are generated slugs without dots, so dot-path keys are safe (same assumption the existing `byPublisher.${pubId}` paths already make).

- [ ] **Step 4: Run tests to verify they pass**

Run: `firebase --config firebase/firebase.json emulators:exec "pnpm --filter @ada/api test -- tests/stats-aggregator.test.ts"`
Expected: PASS (new and pre-existing).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/stats-aggregator.ts apps/api/tests/stats-aggregator.test.ts
git commit -m "feat(api): aggregate campaign stats per publisher per creative"
```

---

### Task 2: `getCampaignStats` returns `byCreative` with unattributed remainder

**Files:**
- Modify: `apps/api/src/services/campaign-stats.ts`
- Test: `apps/api/tests/campaign-stats.test.ts` (new file)

**Interfaces:**
- Consumes: `byPublisherCreative` doc field from Task 1; `getCreative(id): Promise<Creative | null>` from `./creatives.js`; `getPublisherById` (already imported).
- Produces (exact shapes Task 3 relies on):

```ts
export const UNATTRIBUTED_CREATIVE_ID = '__unattributed';

export interface CreativeSiteBreakdown {
  impressions: number;
  clicks: number;
  label: string; // "300×250", or the creative id if deleted, or the Icelandic legacy label
  imageUrl: string | null;
}

export interface PublisherStatsBreakdown {
  impressions: number;
  clicks: number;
  spendIsk: number;
  displayName: string;
  domain: string;
  byCreative?: Record<string, CreativeSiteBreakdown>; // present only when non-empty
}
```

- [ ] **Step 1: Write the failing tests**

Create `apps/api/tests/campaign-stats.test.ts`. This is a pure unit test — mock the three collaborators (pattern precedent: `creative-stats.test.ts` mocks `db.collection`). `getCampaignStats` looks up docs for the last-N-hours window keyed `YYYYMMDDHH` (UTC), so build the current hour's key in the test:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockDocs: Array<{ id: string; data: () => any }> = [];

vi.mock('../src/lib/firebase', () => ({
  db: {
    collection: vi.fn(() => ({ get: vi.fn(async () => ({ docs: mockDocs })) })),
  },
}));

vi.mock('../src/services/publishers', () => ({
  getPublisherById: vi.fn(async (id: string) =>
    id === 'pub_a' ? { id, displayName: 'Pizzadeig', domain: 'pizzadeig.is' } : null,
  ),
}));

vi.mock('../src/services/creatives', () => ({
  getCreative: vi.fn(async (id: string) =>
    id === 'cre_1'
      ? { id, imageUrl: 'https://cdn.example/cre_1.png', width: 300, height: 250 }
      : null,
  ),
}));

import { getCampaignStats, UNATTRIBUTED_CREATIVE_ID } from '../src/services/campaign-stats';

function currentHourKey(): string {
  const d = new Date();
  return (
    d.getUTCFullYear().toString() +
    String(d.getUTCMonth() + 1).padStart(2, '0') +
    String(d.getUTCDate()).padStart(2, '0') +
    String(d.getUTCHours()).padStart(2, '0')
  );
}

beforeEach(() => {
  mockDocs.length = 0;
});

describe('getCampaignStats byCreative', () => {
  it('aggregates per-creative stats and enriches with size label and image', async () => {
    mockDocs.push({
      id: currentHourKey(),
      data: () => ({
        impressions: 10,
        clicks: 2,
        byPublisher: { pub_a: { impressions: 10, clicks: 2 } },
        byPublisherCreative: { pub_a: { cre_1: { impressions: 10, clicks: 2 } } },
      }),
    });

    const stats = await getCampaignStats('cmp_1', 24);
    const pub = stats.byPublisher['pub_a']!;
    expect(pub.byCreative).toEqual({
      cre_1: {
        impressions: 10,
        clicks: 2,
        label: '300×250',
        imageUrl: 'https://cdn.example/cre_1.png',
      },
    });
  });

  it('adds an unattributed remainder when older hours lack the field', async () => {
    const hk = currentHourKey();
    mockDocs.push({
      id: hk,
      data: () => ({
        impressions: 8,
        clicks: 1,
        byPublisher: { pub_a: { impressions: 8, clicks: 1 } },
        byPublisherCreative: { pub_a: { cre_1: { impressions: 5, clicks: 1 } } },
      }),
    });

    const stats = await getCampaignStats('cmp_1', 24);
    const byCreative = stats.byPublisher['pub_a']!.byCreative!;
    expect(byCreative[UNATTRIBUTED_CREATIVE_ID]).toEqual({
      impressions: 3,
      clicks: 0,
      label: 'Eldri gögn (fyrir sundurliðun)',
      imageUrl: null,
    });
  });

  it('falls back to the creative id as label when the creative is deleted', async () => {
    mockDocs.push({
      id: currentHourKey(),
      data: () => ({
        impressions: 4,
        clicks: 0,
        byPublisher: { pub_a: { impressions: 4, clicks: 0 } },
        byPublisherCreative: { pub_a: { cre_gone: { impressions: 4, clicks: 0 } } },
      }),
    });

    const stats = await getCampaignStats('cmp_1', 24);
    const byCreative = stats.byPublisher['pub_a']!.byCreative!;
    expect(byCreative['cre_gone']!.label).toBe('cre_gone');
    expect(byCreative['cre_gone']!.imageUrl).toBeNull();
  });

  it('omits byCreative entirely for docs with no byPublisherCreative at all', async () => {
    mockDocs.push({
      id: currentHourKey(),
      data: () => ({
        impressions: 8,
        clicks: 1,
        byPublisher: { pub_a: { impressions: 8, clicks: 1 } },
      }),
    });

    const stats = await getCampaignStats('cmp_1', 24);
    expect(stats.byPublisher['pub_a']!.byCreative).toBeUndefined();
  });
});
```

Note the last test: a campaign whose entire history predates the field shows the plain table exactly as today — no expansion affordance, no all-unattributed noise. The remainder row only appears once at least one hour HAS per-creative data.

- [ ] **Step 2: Run tests to verify they fail**

Run: `firebase --config firebase/firebase.json emulators:exec "pnpm --filter @ada/api test -- tests/campaign-stats.test.ts"`
Expected: FAIL — `UNATTRIBUTED_CREATIVE_ID` not exported, `byCreative` undefined where expected.

- [ ] **Step 3: Implement**

In `apps/api/src/services/campaign-stats.ts`:

1. Add `import { getCreative } from './creatives.js';` and export the constant + interface from the Interfaces block above (extend the existing `PublisherStatsBreakdown`).

2. In the doc-reading loop, carry the field through `statsMap` (extend the map's value type):

```ts
statsMap.set(hk, {
  impressions: (data.impressions as number) ?? 0,
  clicks: (data.clicks as number) ?? 0,
  byPublisher: data.byPublisher,
  byPublisherCreative: data.byPublisherCreative,
});
```

3. Next to `byPublisherAggregate`, accumulate creatives and whether any hour had the field:

```ts
const byPublisherCreativeAggregate: Record<
  string,
  Record<string, { impressions: number; clicks: number }>
> = {};
let anyCreativeData = false;
```

and inside the hour loop, after the existing `byPublisher` aggregation:

```ts
if (data.byPublisherCreative) {
  anyCreativeData = true;
  for (const [pubId, creatives] of Object.entries(data.byPublisherCreative)) {
    const forPub = (byPublisherCreativeAggregate[pubId] ??= {});
    for (const [creativeId, cs] of Object.entries(
      creatives as Record<string, { impressions?: number; clicks?: number }>,
    )) {
      const t = (forPub[creativeId] ??= { impressions: 0, clicks: 0 });
      t.impressions += cs.impressions || 0;
      t.clicks += cs.clicks || 0;
    }
  }
}
```

4. After the publisher-enrichment loop, when `anyCreativeData` is true, batch-fetch creative metadata and attach `byCreative` per publisher:

```ts
if (anyCreativeData) {
  const creativeIds = [
    ...new Set(Object.values(byPublisherCreativeAggregate).flatMap((m) => Object.keys(m))),
  ];
  const creatives = await Promise.all(creativeIds.map((id) => getCreative(id)));
  const creativeMeta = new Map(
    creativeIds.map((id, i) => {
      const cre = creatives[i];
      return [
        id,
        {
          label: cre ? `${cre.width}×${cre.height}` : id,
          imageUrl: cre?.imageUrl ?? null,
        },
      ] as const;
    }),
  );

  for (const [pubId, entry] of Object.entries(enrichedByPublisher)) {
    const agg = byPublisherCreativeAggregate[pubId] ?? {};
    const byCreative: Record<string, CreativeSiteBreakdown> = {};
    let attributedImp = 0;
    let attributedClk = 0;
    for (const [creativeId, cs] of Object.entries(agg)) {
      if (cs.impressions === 0 && cs.clicks === 0) continue;
      const meta = creativeMeta.get(creativeId)!;
      byCreative[creativeId] = { ...cs, ...meta };
      attributedImp += cs.impressions;
      attributedClk += cs.clicks;
    }
    const restImp = entry.impressions - attributedImp;
    const restClk = entry.clicks - attributedClk;
    if (restImp > 0 || restClk > 0) {
      byCreative[UNATTRIBUTED_CREATIVE_ID] = {
        impressions: Math.max(0, restImp),
        clicks: Math.max(0, restClk),
        label: 'Eldri gögn (fyrir sundurliðun)',
        imageUrl: null,
      };
    }
    if (Object.keys(byCreative).length > 0) entry.byCreative = byCreative;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `firebase --config firebase/firebase.json emulators:exec "pnpm --filter @ada/api test -- tests/campaign-stats.test.ts"`
Expected: PASS.

- [ ] **Step 5: Run the full API suite and typecheck**

Run: `pnpm test:api && pnpm --filter @ada/api typecheck`
Expected: PASS — the response shape is additive, nothing existing asserts its absence.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/campaign-stats.ts apps/api/tests/campaign-stats.test.ts
git commit -m "feat(api): per-creative breakdown with unattributed remainder in campaign stats"
```

---

### Task 3: Expandable creative rows in the campaign detail table

**Files:**
- Modify: `apps/dashboard/src/hooks/useCampaigns.ts` (~line 33, the stats response type)
- Modify: `apps/dashboard/src/pages/advertiser/CampaignDetail.tsx` (~lines 770–824, the "Frammistaða eftir birtingavettvangi" table)
- Test: `apps/dashboard/src/pages/advertiser/CampaignDetail.test.tsx` (append)

**Interfaces:**
- Consumes: `byCreative?: Record<string, { impressions: number; clicks: number; label: string; imageUrl: string | null }>` on each `byPublisher` entry (Task 2). The `'__unattributed'` key is matched literally in the UI (duplicate the string as a local const; the dashboard does not import from `@ada/api`).
- Produces: UI only.

- [ ] **Step 1: Write the failing tests**

Append to `CampaignDetail.test.tsx`, following the file's existing `setupApiMock`/`campaignFixture` pattern (mocked `apiFetch`, mocked router with `id: 'cmp_1'`). Extend the stats response the mock returns for the stats endpoint:

```ts
const STATS_WITH_CREATIVES = {
  impressions: 100,
  clicks: 10,
  spendIsk: 55,
  hours: [],
  byPublisher: {
    pub_a: {
      impressions: 100,
      clicks: 10,
      spendIsk: 55,
      displayName: 'Pizzadeig',
      domain: 'pizzadeig.is',
      byCreative: {
        cre_1: { impressions: 60, clicks: 8, label: '300×250', imageUrl: 'https://cdn.example/1.png' },
        cre_2: { impressions: 40, clicks: 2, label: '728×90', imageUrl: 'https://cdn.example/2.png' },
      },
    },
    pub_b: {
      impressions: 20,
      clicks: 1,
      spendIsk: 11,
      displayName: 'Bíladella',
      domain: 'biladella.is',
      byCreative: {
        cre_1: { impressions: 20, clicks: 1, label: '300×250', imageUrl: 'https://cdn.example/1.png' },
      },
    },
  },
};
```

```tsx
test('expands a publisher row to creative sub-rows', async () => {
  setupApiMockWithStats(campaignFixture(), STATS_WITH_CREATIVES);
  renderPage();
  const toggle = await screen.findByRole('button', { name: 'Sundurliðun eftir auglýsingu: Pizzadeig' });
  expect(screen.queryByText('728×90')).not.toBeInTheDocument();
  fireEvent.click(toggle);
  expect(screen.getByText('300×250')).toBeInTheDocument();
  expect(screen.getByText('728×90')).toBeInTheDocument();
});

test('publisher with a single creative gets no expand toggle', async () => {
  setupApiMockWithStats(campaignFixture(), STATS_WITH_CREATIVES);
  renderPage();
  await screen.findByText('Pizzadeig');
  expect(
    screen.queryByRole('button', { name: 'Sundurliðun eftir auglýsingu: Bíladella' }),
  ).not.toBeInTheDocument();
});
```

If the file has no `renderPage`/`setupApiMockWithStats` helpers with these exact names, add thin ones alongside the existing helpers (a stats-response parameter on the existing mock setup, and the existing render call extracted) rather than duplicating mock wiring per test.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @ada/dashboard test -- CampaignDetail`
Expected: new tests FAIL (no such button); existing tests PASS.

- [ ] **Step 3: Implement**

1. `useCampaigns.ts`: extend the `byPublisher` entry type with `byCreative?: Record<string, { impressions: number; clicks: number; label: string; imageUrl: string | null }>`.

2. `CampaignDetail.tsx`, in the component that renders the table:

```tsx
const UNATTRIBUTED_CREATIVE_ID = '__unattributed';
const [expandedPubs, setExpandedPubs] = useState<Record<string, boolean>>({});
```

Replace the per-publisher `<tr>` body (currently a single row per publisher) with a fragment: the existing row plus, when expanded, one sub-row per creative. The chevron renders only when the breakdown has more than one entry (a single creative with no remainder would just repeat the parent line):

```tsx
.map((pub) => {
  const ctr = pub.impressions > 0 ? Math.min(100, (pub.clicks / pub.impressions) * 100) : 0;
  const ecpc = pub.clicks > 0 ? formatIsk(Math.round(pub.spendIsk / pub.clicks)) : '0 kr.';
  const creatives = Object.entries(pub.byCreative ?? {})
    .map(([id, c]) => ({ id, ...c }))
    .sort((a, b) =>
      a.id === UNATTRIBUTED_CREATIVE_ID ? 1 :
      b.id === UNATTRIBUTED_CREATIVE_ID ? -1 :
      b.impressions - a.impressions,
    );
  const expandable = creatives.length > 1;
  const isExpanded = expandable && !!expandedPubs[pub.id];
  return (
    <Fragment key={pub.id}>
      <tr className="hover:bg-slate-50/50">
        <td className="py-3">
          <div className="flex items-center gap-1.5">
            {expandable && (
              <button
                aria-label={`Sundurliðun eftir auglýsingu: ${pub.displayName}`}
                onClick={() => setExpandedPubs((s) => ({ ...s, [pub.id]: !s[pub.id] }))}
                className="p-0.5 -ml-1 text-slate-400 hover:text-slate-700 transition cursor-pointer"
              >
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
            )}
            <div>
              <div className="font-semibold text-slate-900">{pub.displayName}</div>
              <div className="text-[10px] text-slate-400 font-mono">{pub.domain}</div>
            </div>
          </div>
        </td>
        {/* impressions / clicks / CTR / eCPC / spend cells unchanged */}
      </tr>
      {isExpanded &&
        creatives.map((cre) => {
          const creCtr = cre.impressions > 0 ? Math.min(100, (cre.clicks / cre.impressions) * 100) : 0;
          const legacy = cre.id === UNATTRIBUTED_CREATIVE_ID;
          return (
            <tr key={`${pub.id}_${cre.id}`} className="bg-slate-50/60">
              <td className="py-2 pl-7">
                <div className="flex items-center gap-2">
                  {cre.imageUrl && (
                    <img src={cre.imageUrl} alt="" className="h-8 w-auto max-w-14 rounded border border-slate-200 object-contain bg-white" />
                  )}
                  <span className={legacy ? 'text-slate-400 italic' : 'text-slate-600'}>{cre.label}</span>
                </div>
              </td>
              <td className="py-2 text-slate-500">{cre.impressions.toLocaleString('is-IS')}</td>
              <td className="py-2 text-slate-500">{cre.clicks.toLocaleString('is-IS')}</td>
              <td className="py-2 text-slate-500">{creCtr.toFixed(1).replace('.', ',')}%</td>
              <td />
              <td />
            </tr>
          );
        })}
    </Fragment>
  );
})
```

Add `Fragment` to the React import, `ChevronDown, ChevronRight` to the lucide-react import. Expansion state is deliberately component-local (resets on navigation). Keep the existing `Object.entries(...).map(([id, pubStats]) => ({ id, ...pubStats }))` + sort-by-impressions wrapper around this — only the row rendering changes.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @ada/dashboard test -- CampaignDetail`
Expected: PASS.

- [ ] **Step 5: Typecheck + lint + visual sanity**

Run: `pnpm --filter @ada/dashboard typecheck && pnpm --filter @ada/dashboard lint`
Expected: clean. Optionally verify by eye against the emulator + seed (`pnpm emulator`, `pnpm --filter @ada/api seed`, `pnpm dev`).

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/hooks/useCampaigns.ts apps/dashboard/src/pages/advertiser/CampaignDetail.tsx apps/dashboard/src/pages/advertiser/CampaignDetail.test.tsx
git commit -m "feat(dashboard): expandable per-creative rows in campaign site table"
```

---

### Task 4: Verify, ship

- [ ] **Step 1: Full verify**

Run: `pnpm verify && pnpm test:api && pnpm --filter @ada/dashboard test`
Expected: all green.

- [ ] **Step 2: Push branch and open PR**

Follow the oruggt-ship process (branch → PR → adversarial review → owner merges). PR title: `feat: per-creative-per-site breakdown in campaign stats`. Body must note: additive Firestore field, no migration, remainder row semantics, and that old campaigns show today's table until new traffic accrues.
