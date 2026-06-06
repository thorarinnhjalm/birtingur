# Per-Slot Publisher Stats — Implementation Plan

> **For agentic workers (Gemini):** This is the ONLY plan to execute right now. Do **not**
> touch `remediation-plan.md` (that work is already done/merged). Implement the tasks below
> in order (E1 → E3). After EACH task, append a report entry to `IMPLEMENTATION-LOG.md`
> using the template at the bottom of that file (real verification output, commit SHA,
> deviations, questions). Claude reviews each entry.

**Goal:** Let a publisher see their stats broken down **per ad slot** (impressions, clicks,
spend) on the slot detail page — the aggregation already exists, it just isn't exposed.

**Context / why this is small:** the hourly aggregator already writes per-slot daily docs at
`stats/publisher_slots/{publisherId}_{slotId}/{YYYYMMDD}` (see
`apps/api/src/services/stats-aggregator.ts`). Today nothing reads them: there is no service,
no endpoint, and `SlotDetail.tsx` shows only the embed snippet. This plan adds the read path.

**Tech Stack:** TypeScript (ESM, `.js` import suffix), Hono, firebase-admin (Firestore),
Vitest, React 19 + TanStack Query (dashboard).

**Conventions (already decided — follow, don't re-litigate):** bare response envelopes
(`c.json(data)`, hooks `apiFetch<T>` with no unwrap); emulator/Java needed for `pnpm test:api`;
`pnpm --filter @ada/shared build` after any shared edit; one commit per task; run `pnpm verify`
(format + typecheck + lint) before each commit — the pre-push hook enforces it.

---

## Task E1: `getSlotStats` service (read per-slot daily stats)

**Files:**

- Create: `apps/api/src/services/slot-stats.ts`
- Test: `apps/api/tests/slot-stats.test.ts`

- [ ] **Step 1: Write the failing test** (mock Firestore like `cache-refresh.test.ts` does, or use the emulator — match the existing test style in this package)

```ts
import { describe, it, expect } from 'vitest';
import { getSlotStats } from '../src/services/slot-stats';
// Seed two daily docs at stats/publisher_slots/pub_1_slot_1/<YYYYMMDD> for the last 2 days
// (impressions/clicks/spendIsk/pageviews), then:
it('sums per-slot daily stats over the timeframe and returns a history array', async () => {
  await seedSlotStats('pub_1', 'slot_1'); // helper: writes 2 days, 100 impressions each
  const stats = await getSlotStats('pub_1', 'slot_1', 7);
  expect(stats.impressions).toBe(200);
  expect(stats.history).toHaveLength(7);
  expect(stats.history.at(-1)!.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});
```

- [ ] **Step 2: Run it to verify it fails** — `pnpm test:api -- tests/slot-stats.test.ts` → FAIL (function undefined).

- [ ] **Step 3: Implement** (`apps/api/src/services/slot-stats.ts`) — mirrors `publisher-stats.ts` but reads the per-slot path:

```ts
import { db } from '../lib/firebase.js';
import { COLLECTIONS } from '@ada/shared/firestore';

export interface SlotStatsResponse {
  impressions: number;
  clicks: number;
  spendIsk: number;
  pageviews: number;
  history: {
    date: string;
    impressions: number;
    clicks: number;
    spendIsk: number;
    pageviews: number;
  }[];
}

export async function getSlotStats(
  publisherId: string,
  slotId: string,
  timeframeDays: 7 | 30 = 7,
): Promise<SlotStatsResponse> {
  const history: SlotStatsResponse['history'] = [];
  let impressions = 0,
    clicks = 0,
    spendIsk = 0,
    pageviews = 0;
  const now = new Date();

  for (let i = timeframeDays - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const dateStr = d.toISOString().split('T')[0]!; // YYYY-MM-DD
    const dk = dateStr.replace(/-/g, ''); // YYYYMMDD

    const snap = await db
      .doc(`${COLLECTIONS.stats}/publisher_slots/${publisherId}_${slotId}/${dk}`)
      .get();
    const data = snap.exists ? snap.data() : undefined;
    const day = {
      date: dateStr,
      impressions: (data?.impressions as number) || 0,
      clicks: (data?.clicks as number) || 0,
      spendIsk: (data?.spendIsk as number) || 0,
      pageviews: (data?.pageviews as number) || 0,
    };
    history.push(day);
    impressions += day.impressions;
    clicks += day.clicks;
    spendIsk += day.spendIsk;
    pageviews += day.pageviews;
  }

  return { impressions, clicks, spendIsk, pageviews, history };
}
```

- [ ] **Step 4: Run it to verify it passes** — `pnpm test:api -- tests/slot-stats.test.ts` → PASS (paste counts into the log).

- [ ] **Step 5: Commit** — `git commit -m "feat(api): getSlotStats reads per-slot daily aggregates (Task E1)"`
- [ ] **Step 6: Append report entry to IMPLEMENTATION-LOG.md.**

---

## Task E2: `GET /v1/publishers/me/slots/:id/stats` endpoint

**Files:**

- Modify: `apps/api/src/routes/slots.ts` (add the route; mirror the ownership check already in the existing `GET /:id` handler)
- Test: `apps/api/tests/slot-routes.test.ts` (add a case)

- [ ] **Step 1: Write the failing test** — assert the endpoint returns bare stats for the owner and 404 for a slot the caller doesn't own.

```ts
it('returns per-slot stats (bare) for the owning publisher', async () => {
  // seed publisher for the authed user + a slot they own + 1 day of slot stats
  const res = await app.request('/v1/publishers/me/slots/slot_1/stats?timeframe=7', {
    headers: { Authorization: 'Bearer valid-token' },
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body).toHaveProperty('impressions');
  expect(body).toHaveProperty('history');
});

it('returns 404 for a slot the caller does not own', async () => {
  const res = await app.request('/v1/publishers/me/slots/slot_other/stats', {
    headers: { Authorization: 'Bearer valid-token' },
  });
  expect(res.status).toBe(404);
});
```

- [ ] **Step 2: Run it to verify it fails** — `pnpm test:api -- tests/slot-routes.test.ts -t "per-slot stats"` → FAIL (route missing → 404 for both).

- [ ] **Step 3: Implement** — in `apps/api/src/routes/slots.ts`, add (mirror the existing `GET /:id` ownership pattern; import `getSlotStats`):

```ts
import { getSlotStats } from '../services/slot-stats.js';
// ...
slotsRouter.get('/:id/stats', async (c) => {
  const user = c.get('user');
  const publisher = await getPublisherByOwnerEmail(user.email);
  if (!publisher) {
    throw new AppError(404, 'Publisher profile not found', 'NOT_FOUND');
  }
  const id = c.req.param('id');
  const slot = await getSlot(id);
  if (!slot || slot.publisherId !== publisher.id) {
    throw new AppError(404, `Slot with ID ${id} not found`, 'NOT_FOUND');
  }
  const timeframe = c.req.query('timeframe') === '30' ? 30 : 7;
  const stats = await getSlotStats(publisher.id, id, timeframe);
  return c.json(stats);
});
```

> Place this BEFORE any broader handler so `/:id/stats` is matched correctly; with Hono's
> router order, defining it next to the existing `GET /:id` is fine.

- [ ] **Step 4: Run it to verify it passes** — `pnpm test:api -- tests/slot-routes.test.ts` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(api): per-slot stats endpoint with ownership check (Task E2)"`
- [ ] **Step 6: Append report entry.**

---

## Task E3: Show per-slot stats on the slot detail page

**Files:**

- Create: `apps/dashboard/src/hooks/useSlotStats.ts`
- Modify: `apps/dashboard/src/pages/publisher/SlotDetail.tsx`

- [ ] **Step 1: Create the hook**

```ts
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

interface SlotStats {
  impressions: number;
  clicks: number;
  spendIsk: number;
  pageviews: number;
  history: {
    date: string;
    impressions: number;
    clicks: number;
    spendIsk: number;
    pageviews: number;
  }[];
}

export function useSlotStats(slotId: string | undefined) {
  return useQuery<SlotStats>({
    queryKey: ['publisher', 'slot-stats', slotId],
    queryFn: () => apiFetch<SlotStats>(`/v1/publishers/me/slots/${slotId}/stats?timeframe=30`),
    enabled: !!slotId,
  });
}
```

- [ ] **Step 2: Render stats on `SlotDetail.tsx`** — add a stats section above/below the existing
      snippet block. Use `formatIsk` from `@/lib/format` for spend. Mirror the card style already used
      in `publisher/Dashboard.tsx` (impressions, clicks, earnings = `Math.round(spendIsk * 0.8)` for the
      publisher's net share, matching Dashboard). Show "Engin gögn enn" when totals are 0. Example:

```tsx
const { data: slotStats } = useSlotStats(slot?.id);
// ...inside the render, a 3-card row:
// Birtingar: slotStats?.impressions ?? 0
// Smellir:   slotStats?.clicks ?? 0
// Tekjur:    formatIsk(Math.round((slotStats?.spendIsk ?? 0) * 0.8))
// plus an optional 30-day mini chart from slotStats.history (reuse the chart component
// used in publisher/Dashboard.tsx if there is one; otherwise a simple list is fine for v1).
```

- [ ] **Step 3: Verify** — `pnpm --filter @ada/dashboard typecheck && pnpm --filter @ada/dashboard lint && pnpm format:check` → all pass.
- [ ] **Step 4: Commit** — `git commit -m "feat(dashboard): show per-slot stats on SlotDetail (Task E3)"`
- [ ] **Step 5: Append report entry.**

---

## Notes / out of scope

- The publisher-level `getPublisherStats` has a dev/emulator-only mock-data fallback so the UI
  looks alive locally. This plan does **not** add a mock for slots — per-slot will read real data
  (zeros until traffic flows). If you want the slot cards populated in local dev, mirror that
  dev-only fallback in `getSlotStats`, but do NOT enable it in production.
- No schema changes needed (the per-slot docs already exist).

## Self-review

- Aggregation (write side) already done → E1 read service, E2 endpoint, E3 UI cover the gap.
- Names consistent: `getSlotStats`, `SlotStatsResponse`/`SlotStats`, `useSlotStats`,
  path `stats/publisher_slots/{publisherId}_{slotId}/{YYYYMMDD}`.
- Ownership check on E2 mirrors the existing `GET /:id` handler (no new auth pattern).
