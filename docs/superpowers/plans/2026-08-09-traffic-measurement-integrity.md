# Traffic Measurement Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A page view counts once per page load (not once per ad slot), every event write is durable rather than fire-and-forget, and an independent counter pair alerts when emitted events fail to reach Firestore.

**Architecture:** The `/v1/ad` request keeps producing a per-slot event, renamed `slot_load` (it is what the fill-rate denominator needs). A new signed `pageviewPixel` rides on every ad response and the snippet fires exactly one per page load, hitting a new `/v1/pageview` route that logs the true `pageview`. `logEvent` becomes a single awaited Redis pipeline that also bumps an `emitted:{hour}` counter; the aggregator bumps `recorded:{hour}`; reconciliation compares settled hours. Spec: `docs/superpowers/specs/2026-08-09-traffic-measurement-integrity-design.md`.

**Tech Stack:** Hono on Vercel Node runtime (`apps/serving`), Upstash Redis, esbuild-built snippet (`packages/snippet`), firebase-admin + emulator tests (`apps/api`), React 19 dashboard.

## Global Constraints

- ESM `.js` suffixes for relative imports inside a package, even from `.ts`. `apps/api/tests/*` and `apps/serving/tests/*` follow each suite's existing import style — read a neighbouring test first.
- API tests emulator-wrapped WITH the only-flag: `firebase --config firebase/firebase.json emulators:exec --only firestore "pnpm --filter @ada/api test -- tests/<file>.ts"`. Serving and snippet tests are plain vitest (`pnpm --filter @ada/serving test`, `pnpm --filter @ada/snippet test`). **Never run two emulator invocations concurrently.**
- Dashboard has NO jest-dom: `getBy*` + `toBeDefined()` for presence, `queryBy*` + `toBeNull()` for absence.
- **No Vercel-specific dependency in `apps/serving`** (no `@vercel/functions`, no `waitUntil`) — the app is planned to move to a Cloudflare Worker. Durability comes from awaiting a pipelined write.
- Serving is latency-critical: no added Redis round trips on `/v1/ad` beyond what pipelining already absorbs.
- The snippet is size-budgeted (`pnpm --filter @ada/snippet size`) — keep the addition minimal; report the before/after byte count.
- Signature model is not weakened: the snippet only ever fires URLs the server signed.
- All UI copy Icelandic. Money is integer ISK. Reconciliation stays strictly read-only.
- Branch: `feat/traffic-measurement-integrity` off `docs/traffic-measurement-design`. Never push `main` (oruggt-ship).

---

### Task 1: Durable, pipelined `logEvent` with the emitted counter

**Files:**

- Modify: `apps/serving/src/lib/analytics.ts`
- Modify: `apps/serving/src/routes/ad.ts`, `apps/serving/src/routes/impression.ts`, `apps/serving/src/routes/click.ts` (await the five call sites)
- Test: `apps/serving/tests/analytics-fanout.test.ts` (exists — read its Redis-mock style and extend)

**Interfaces:**

- Consumes: `getRedis()`, `EVENT_QUEUE_STATS`, `EVENT_QUEUE_ACCRUAL`.
- Produces:

```ts
// analytics.ts — unchanged signature, new behaviour
export async function logEvent(ev: AdEvent): Promise<void>;
export function emittedCounterKey(ts: number): string; // `emitted:${YYYYMMDDHH}` in UTC, exported for tests + the aggregator's mirror
export const EVENT_COUNTER_TTL_SECONDS = 7 * 24 * 60 * 60;
```

- [ ] **Step 1: Write the failing tests**

Extend `analytics-fanout.test.ts` in its existing style (it already asserts the two-queue fan-out — reuse its Redis fake; add `pipeline()` support to that fake returning an object with `lpush`/`incr`/`expire` collecting calls and an `exec()`):

```ts
it('writes both queues and the emitted counter in ONE pipeline for an impression', async () => {
  await logEvent(impressionEvent());
  expect(pipelineCallCount()).toBe(1);
  expect(directRoundTrips()).toBe(0); // nothing sent outside the pipeline
  expect(pipelinedCommands()).toEqual(
    expect.arrayContaining([
      ['lpush', EVENT_QUEUE_STATS, expect.any(String)],
      ['lpush', EVENT_QUEUE_ACCRUAL, expect.any(String)],
      ['incr', emittedCounterKey(impressionEvent().ts)],
    ]),
  );
});

it('sends a non-impression to the stats queue only, still one pipeline', async () => {
  await logEvent({ ...impressionEvent(), type: 'click' });
  expect(
    pipelinedCommands().some(([cmd, key]) => cmd === 'lpush' && key === EVENT_QUEUE_ACCRUAL),
  ).toBe(false);
  expect(pipelineCallCount()).toBe(1);
});

it('buckets the emitted counter by the EVENT ts, not wall clock', () => {
  expect(emittedCounterKey(Date.UTC(2026, 7, 9, 13, 45))).toBe('emitted:2026080913');
});

it('rejects (does not swallow) when Redis fails, so call sites can log it', async () => {
  failNextPipeline(new Error('redis down'));
  await expect(logEvent(impressionEvent())).rejects.toThrow('redis down');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @ada/serving test -- analytics-fanout`
Expected: FAIL (`emittedCounterKey` not exported; no pipeline used).

- [ ] **Step 3: Implement**

`analytics.ts`:

```ts
export const EVENT_COUNTER_TTL_SECONDS = 7 * 24 * 60 * 60;

/** Hour bucket (UTC) an event belongs to, keyed by the event's OWN ts so a
 * late drain still lands in the hour the event happened. Mirrored by the
 * aggregator's `recorded:{hour}` counter — the two are compared by the
 * daily reconciliation cron (2026-08-09 design, Part 3). */
export function emittedCounterKey(ts: number): string {
  const d = new Date(ts);
  const hk =
    d.getUTCFullYear().toString() +
    String(d.getUTCMonth() + 1).padStart(2, '0') +
    String(d.getUTCDate()).padStart(2, '0') +
    String(d.getUTCHours()).padStart(2, '0');
  return `emitted:${hk}`;
}

export async function logEvent(ev: AdEvent): Promise<void> {
  const redis = getRedis();
  const payload = JSON.stringify(ev);
  const key = emittedCounterKey(ev.ts);
  // ONE round trip: previously two sequential lpush calls for an impression,
  // plus nothing for the counter. Pipelining is what makes awaiting this
  // affordable on the latency-critical /v1/ad path (2026-08-09 design).
  const p = redis.pipeline();
  p.lpush(EVENT_QUEUE_STATS, payload);
  if (ev.type === 'impression') {
    p.lpush(EVENT_QUEUE_ACCRUAL, payload);
  }
  p.incr(key);
  p.expire(key, EVENT_COUNTER_TTL_SECONDS);
  await p.exec();
}
```

Then change all five `void logEvent(...)` call sites to `await logEvent(...)`:

- `routes/impression.ts:80` and `:113` — both already sit inside the handler's outer `try`/`catch`, which returns the pixel on any throw. Nothing else needed.
- `routes/click.ts:53` and `:93` — wrap each in its own `try`/`catch` that `console.error`s and continues, so the redirect ALWAYS happens (read the handler first; if it already has an enclosing try/catch that still redirects, use that instead of adding one).
- `routes/ad.ts:149` — wrap in `try`/`catch` that `console.error`s and continues, so a Redis outage never blocks serving an ad.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @ada/serving test`
Expected: PASS (the whole serving suite — `ad-route`, `click-*` and `analytics-fanout` all touch these paths).

- [ ] **Step 5: Commit**

```bash
git add apps/serving/src/lib/analytics.ts apps/serving/src/routes/ad.ts apps/serving/src/routes/impression.ts apps/serving/src/routes/click.ts apps/serving/tests/analytics-fanout.test.ts
git commit -m "fix(serving): durable pipelined event logging with an emitted counter"
```

---

### Task 2: `slot_load` event and the signed page-view pixel

**Files:**

- Modify: `apps/serving/src/lib/analytics.ts` (`AdEvent.type` union)
- Modify: `apps/serving/src/routes/ad.ts` (log `slot_load` on BOTH fill and no-fill paths; add `pageviewPixel` to both responses)
- Modify: `apps/serving/src/routes/impression.ts` (fallback branch stops logging)
- Create: `apps/serving/src/routes/pageview.ts`
- Modify: `apps/serving/src/index.ts` (mount `/v1/pageview`)
- Test: `apps/serving/tests/ad-route.test.ts` (extend), `apps/serving/tests/pageview-route.test.ts` (new)

**Interfaces:**

- Consumes: `createSignature`/`verifySignature`/`claimSignatureOnce` (`lib/crypto.js`, `SignatureKind` already includes `'pv'`), `getSlotCache`, `logEvent` (Task 1).
- Produces:

```ts
// analytics.ts
export interface AdEvent {
  type: 'impression' | 'click' | 'pageview' | 'slot_load';
  // …unchanged fields
}

// The creativeId component used when signing a page-level pixel (no creative
// is involved). Exported so the route and the tests agree on one constant.
export const PAGEVIEW_CREATIVE_ID = 'pageview';

// ad.ts responses (fill AND no-fill) gain:
//   pageviewPixel: `/v1/pageview?s=<slotId>&t=<token>&ts=<ts>&sig=<sig>`
```

- [ ] **Step 1: Write the failing tests**

Create `apps/serving/tests/pageview-route.test.ts` following `ad-route.test.ts`'s app-request + Redis/cache mocking style:

```ts
it('records exactly one pageview for a validly signed pixel', async () => {
  const ts = Date.now();
  const sig = createSignature(PAGEVIEW_CREATIVE_ID, 'slot_1', 'vis_1', ts);
  const res = await app.request(`/v1/pageview?s=slot_1&t=vis_1&ts=${ts}&sig=${sig}`);
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toBe('image/gif');
  expect(loggedEvents().filter((e) => e.type === 'pageview')).toHaveLength(1);
});

it('ignores a replay of the same signature', async () => {
  /* fire twice, expect 1 logged */
});
it('records nothing for a missing or wrong signature', async () => {
  /* expect 0 logged, still 200 + gif */
});
it('records nothing when the slot cache has expired (publisher unknown)', async () => {
  /* expect 0 logged */
});
```

Extend `ad-route.test.ts`:

```ts
it('logs slot_load (not pageview) and returns a signed pageviewPixel on the fill path', async () => {
  const res = await app.request('/v1/ad?slot=slot_1&consent=full');
  const body = await res.json();
  expect(body.pageviewPixel).toMatch(/^\/v1\/pageview\?s=slot_1&t=.*&ts=\d+&sig=[a-f0-9]+$/);
  expect(loggedEvents().map((e) => e.type)).toContain('slot_load');
  expect(loggedEvents().map((e) => e.type)).not.toContain('pageview');
});

it('logs slot_load and returns a pageviewPixel on the no-fill path too', async () => {
  /* empty slot */
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @ada/serving test`
Expected: new tests FAIL (no `/v1/pageview` route, no `pageviewPixel`, still logging `pageview` from `ad.ts`).

- [ ] **Step 3: Implement**

1. `analytics.ts`: widen `AdEvent.type` with `'slot_load'`; export `PAGEVIEW_CREATIVE_ID = 'pageview'`.

2. `routes/ad.ts`:
   - Change the existing `logEvent({ type: 'pageview', … })` at ~line 149 to `type: 'slot_load'`.
   - Add the same `slot_load` log to the **no-fill/empty** branch (read that branch first — it currently returns `{ empty: true, impressionPixel }` without logging; use the slot's `publisherId` from the cache, and skip logging when the cache miss means the publisher is unknown, matching the existing guard in `impression.ts`).
   - Build and attach `pageviewPixel` on both branches:

```ts
const pvTs = Date.now();
const pvSig = createSignature(PAGEVIEW_CREATIVE_ID, slotId, token, pvTs);
const pageviewPixel =
  `/v1/pageview?s=${encodeURIComponent(slotId)}&t=${encodeURIComponent(token)}` +
  `&ts=${pvTs}&sig=${pvSig}`;
```

3. Create `routes/pageview.ts` — mirror `impression.ts`'s validation shape exactly (same `PIXEL` constant and `pixelResponse()` helper, same max-age window, whole handler in `try`/`catch` returning the pixel):

```ts
// Signature required, same as every other counted event: `type` used to come
// from the query string and forging `&type=pageview` inflated publisher
// traffic (see the 2026-08-05 audit). A page-level pixel signs with the
// PAGEVIEW_CREATIVE_ID placeholder because no creative is involved.
if (!verifySignature(PAGEVIEW_CREATIVE_ID, slotId, token, ts, sig) || age < 0 || age > MAX_AGE) {
  return pixelResponse();
}
const fresh = await claimSignatureOnce(sig, MAX_AGE / 1000, 'pv');
if (!fresh) return pixelResponse();

const slot = await getSlotCache(slotId);
if (slot?.publisherId) {
  await logEvent({
    type: 'pageview',
    slotId,
    publisherId: slot.publisherId,
    creativeId: PAGEVIEW_CREATIVE_ID,
    campaignId: '',
    advertiserId: '',
    country: c.req.header('CF-IPCountry') ?? 'XX',
    visitorToken: token,
    ts: Date.now(),
  });
}
```

4. `src/index.ts`: mount `pageviewRoute` at `/v1/pageview` alongside the existing routes.

5. `routes/impression.ts`: the fallback branch (`isFallback`) stops calling `logEvent` — `slot_load` now covers no-fill slot loads server-side. Keep the branch, its signature check and its `claimSignatureOnce('pv')` claim so old cached snippets firing the legacy pixel are still validated and rate-limited; just remove the write and leave a comment saying why.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @ada/serving test && pnpm --filter @ada/serving typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/serving/src apps/serving/tests
git commit -m "feat(serving): slot_load event and a signed page-level pageview pixel"
```

---

### Task 3: Snippet fires one page view per page load

**Files:**

- Modify: `packages/snippet/src/types.ts` (`pageviewPixel`)
- Modify: `packages/snippet/src/index.ts` (one-shot flag)
- Modify: `packages/snippet/src/render.ts` (fire the page-level pixel without the viewability gate)
- Test: `packages/snippet/tests/` — check whether a test dir exists; if not, create `packages/snippet/tests/pageview-once.test.ts` and wire a plain `vitest` config mirroring another package's minimal setup

**Interfaces:**

- Consumes: `AdResponse.pageviewPixel` (Task 2).
- Produces:

```ts
// types.ts — AdResponse gains:
pageviewPixel?: string;

// render.ts
export function firePageviewOnce(pixelUrl: string): void; // module-scoped guard, no-ops after the first call per page load
```

- [ ] **Step 1: Write the failing tests**

```ts
it('fires exactly one pageview pixel when three slots each return one', async () => {
  document.body.innerHTML = `
    <div data-adplatform-slot="slot_1"></div>
    <div data-adplatform-slot="slot_2"></div>
    <div data-adplatform-slot="slot_3"></div>`;
  mockFetchAd({ empty: true, pageviewPixel: '/v1/pageview?s=slot_1&ts=1&sig=x' });
  await initAndSettle();
  expect(firedUrls().filter((u) => u.includes('/v1/pageview'))).toHaveLength(1);
});

it('still fires the pageview when the only slot returns a no-fill response', async () => {
  /* one slot, empty:true + pageviewPixel */
});
it('fires no pageview when the ad request fails entirely', async () => {
  /* fetchAd -> null */
});
it('resolves the pixel against SERVE_BASE like other pixels', async () => {
  /* absolute URL asserted */
});
```

(Fired URLs are observable via the `Image` constructor the renderer uses — stub `globalThis.Image` in the test to collect `src` assignments, mirroring how `render.ts` fires pixels.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @ada/snippet test`
Expected: FAIL — no pageview pixel is ever fired.

- [ ] **Step 3: Implement**

`render.ts`:

```ts
// One page view per page load, regardless of how many ad slots the page
// carries — the previous per-slot counting multiplied a publisher's
// reported traffic by their slots-per-page (2026-08-09 design). Module
// scope is per script execution, i.e. per page load.
let pageviewFired = false;

export function firePageviewOnce(pixelUrl: string): void {
  if (pageviewFired) return;
  pageviewFired = true;
  const pixel = new Image(1, 1);
  pixel.src = resolveServeUrl(pixelUrl);
  pixel.style.position = 'absolute';
  pixel.style.left = '-9999px';
  document.body.appendChild(pixel);
}
```

In `renderAd`, before the existing impression-pixel logic, call `if (ad.pageviewPixel) firePageviewOnce(ad.pageviewPixel);`. Note `renderAd` is only called on a non-null response, and the no-fill response also carries the pixel, so a page whose first slot does not fill still reports its page view.

`index.ts` needs no change beyond what `renderAd` already does — but verify: the current code calls `renderAd` only when `ad` is truthy, and hides the element on `!ad`. That is the intended behaviour (a failed ad request reports no page view).

`types.ts`: add `pageviewPixel?: string;`.

- [ ] **Step 4: Run tests, check size**

Run: `pnpm --filter @ada/snippet test && pnpm --filter @ada/snippet build && pnpm --filter @ada/snippet size`
Expected: PASS; report the byte count before and after in your report.

- [ ] **Step 5: Commit**

```bash
git add packages/snippet
git commit -m "feat(snippet): fire one page-view pixel per page load"
```

---

### Task 4: Aggregator writes `slotLoads` / `pageViewsTrue` and the recorded counter

**Files:**

- Modify: `apps/api/src/services/stats-aggregator.ts`
- Test: `apps/api/tests/stats-aggregator.test.ts` (emulator-backed since today's rewrite — extend in that style)

**Interfaces:**

- Consumes: `QueuedEvent` (its `type` union must gain `'slot_load'` to match the serving `AdEvent`).
- Produces: publisher-day and publisher-slot-day docs gain `pageViewsTrue`; the existing `pageviews` field keeps its current (slot-load) meaning and is now fed by `slot_load` events. A Redis `recorded:{YYYYMMDDHH}` counter mirrors `emitted:{…}` (same key shape, 7-day TTL), incremented per event by the event's own hour.

- [ ] **Step 1: Write the failing tests**

```ts
it('counts slot_load into pageviews and pageview into pageViewsTrue', async () => {
  await aggregateEvents([
    makeEvent({ type: 'slot_load' }),
    makeEvent({ type: 'slot_load' }),
    makeEvent({ type: 'pageview' }),
  ]);
  const doc = (await db.doc(`stats/publishers/pub_a/${DAY}`).get()).data()!;
  expect(doc.pageviews).toBe(2); // slot loads — fill-rate denominator
  expect(doc.pageViewsTrue).toBe(1); // real page views
});

it('increments the recorded counter per event, bucketed by event hour', async () => {
  await aggregateEvents([
    makeEvent({ ts: Date.UTC(2026, 7, 9, 13, 5) }),
    makeEvent({ ts: Date.UTC(2026, 7, 9, 13, 55) }),
  ]);
  expect(await redisGet('recorded:2026080913')).toBe(2);
});

it('leaves pageViewsTrue absent for a day that saw only slot loads', async () => {
  /* backward compat */
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `firebase --config firebase/firebase.json emulators:exec --only firestore "pnpm --filter @ada/api test -- tests/stats-aggregator.test.ts"`
Expected: FAIL.

- [ ] **Step 3: Implement**

- Widen `QueuedEvent['type']` with `'slot_load'`.
- In the event loop: treat `slot_load` exactly as the current `'pageview'` branch does (increments `pageviews`, and the creative-hour pageview bookkeeping if the current code does that for pageviews — read it and preserve behaviour). Add a new branch for `'pageview'` that increments only a `pageViewsTrue` counter on the publisher-day and publisher-slot-day buckets.
- Write `pageViewsTrue` with `FieldValue.increment` **nested-object style**, never dot-path keys — dot-paths are not split by `batch.set(..., { merge: true })` (this is the bug fixed on 2026-08-08; the whole `byPublisher`/`byCampaign` family was silently dead because of it).
- After the batch commits, increment `recorded:{hour}` per event via one Redis pipeline (import `getRedis` from `../lib/redis.js`; mirror `emittedCounterKey`'s exact key shape — duplicate the small helper here rather than importing across app boundaries, with a comment naming the counterpart).

- [ ] **Step 4: Run tests to verify they pass**

Run: `firebase --config firebase/firebase.json emulators:exec --only firestore "pnpm --filter @ada/api test -- tests/stats-aggregator.test.ts"` then `pnpm test:api`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/stats-aggregator.ts apps/api/tests/stats-aggregator.test.ts
git commit -m "feat(api): aggregate slot loads and true page views separately"
```

---

### Task 5: Emitted-vs-recorded reconciliation check

**Files:**

- Modify: `apps/api/src/services/reconciliation.ts`
- Test: `apps/api/tests/reconciliation.test.ts` (extend)

**Interfaces:**

- Consumes: Redis `emitted:{hour}` / `recorded:{hour}` (Tasks 1 and 4).
- Produces: a new `ReconciliationFindingKind` value `event_pipeline_loss`, raised through the module's existing finding/alert plumbing.

- [ ] **Step 1: Write the failing tests**

```ts
it('flags an hour where materially fewer events were recorded than emitted', async () => {
  await seedCounters('2026080910', { emitted: 1000, recorded: 800 });
  const report = await runReconciliation(new Date(Date.UTC(2026, 7, 9, 15)));
  expect(report.findings.some((f) => f.kind === 'event_pipeline_loss')).toBe(true);
});

it('tolerates a small gap', async () => {
  /* emitted 1000, recorded 995 → no finding */
});
it('ignores hours younger than two hours (events still in flight)', async () => {
  /* emitted 1000, recorded 0, hour = now → no finding */
});
it('ignores an hour with no emitted counter (evicted/expired)', async () => {
  /* recorded 0, emitted absent → no finding */
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `firebase --config firebase/firebase.json emulators:exec --only firestore "pnpm --filter @ada/api test -- tests/reconciliation.test.ts"`
Expected: new cases FAIL.

- [ ] **Step 3: Implement**

Add `checkEventPipeline(findings, now)` called from `runReconciliation` (which already takes an injectable `now` as of PR #13 — reuse it, and thread it in rather than reading the clock again):

- Walk the last 24 hour-buckets ending two hours before `now`.
- For each, read both counters. Skip when `emitted` is absent. Tolerance: flag when `recorded < emitted - max(50, emitted * 0.01)`.
- Finding carries the hour key, both counts, `expected: emitted`, `actual: recorded`.
- Strictly read-only.

- [ ] **Step 4: Run tests to verify they pass**

Run: `firebase --config firebase/firebase.json emulators:exec --only firestore "pnpm --filter @ada/api test -- tests/reconciliation.test.ts"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/reconciliation.ts apps/api/tests/reconciliation.test.ts
git commit -m "feat(api): alert when emitted events fail to reach Firestore"
```

---

### Task 6: Dashboard shows the true traffic figure honestly

**Files:**

- Modify: `apps/api/src/services/publisher-stats.ts` (surface `pageViewsTrue`, including in `bySite`)
- Modify: `apps/dashboard/src/pages/publisher/Dashboard.tsx` (the "Vefumferð" stat + chart + per-site table)
- Modify: `apps/dashboard/src/pages/publisher/SlotDetail.tsx` (relabel)
- Test: `apps/dashboard/src/pages/publisher/Dashboard.test.tsx` (exists — extend), `apps/api/tests/publisher-routes.test.ts` (extend)

**Interfaces:**

- Consumes: `pageViewsTrue` on stats docs (Task 4).
- Produces: `PublisherStatsResponse` gains `pageViewsTrue?: number` (total) and per-history-row `pageViewsTrue?: number`; `SiteBreakdown` gains `pageViewsTrue?: number`. Optional throughout — absent for pre-switch days.

- [ ] **Step 1: Write the failing tests**

Dashboard:

```tsx
test('Vefumferð shows the true page-view figure when present', async () => {
  setupApiMock({ stats: { ...BASE_STATS, pageviews: 9000, pageViewsTrue: 3000 } });
  renderPage();
  expect(await screen.findByText('3.000')).toBeDefined();
  expect(screen.queryByText('9.000')).toBeNull(); // slot loads are NOT the traffic figure
});

test('Vefumferð shows an em dash and an explanation for pre-switch history', async () => {
  setupApiMock({ stats: { ...BASE_STATS, pageviews: 9000 } }); // no pageViewsTrue
  renderPage();
  expect(await screen.findByText('—')).toBeDefined();
  expect(screen.getByText(/Nákvæm umferðarmæling hófst/)).toBeDefined();
});
```

API: `pageViewsTrue` is summed across days and present per site in `bySite`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @ada/dashboard test -- publisher/Dashboard` and the emulator-wrapped `tests/publisher-routes.test.ts`.
Expected: FAIL.

- [ ] **Step 3: Implement**

- `publisher-stats.ts`: read `pageViewsTrue` off each day doc, sum it into the response total and carry it per history row and per `bySite` entry. Leave it `undefined` (not 0) when no day in the window has it — the UI distinguishes "no accurate data yet" from "zero traffic".
- `Dashboard.tsx`: the `label="Vefumferð"` stat renders `pageViewsTrue` when defined; otherwise an em dash plus the muted note `Nákvæm umferðarmæling hófst {DATE}` (use the constant below). The traffic chart plots `pageViewsTrue` and simply has no points before the switch. The per-site table's traffic column follows the same rule.
- Add the switch date as one exported constant in `packages/shared/src/constants.ts`:

```ts
/** The day true per-page-load traffic measurement began. Before this, the
 * stored `pageviews` figure counted ad-slot loads (one per slot per page),
 * which overstated a publisher's traffic by their slots-per-page ratio —
 * it cannot be corrected retroactively, so the accurate series starts here
 * (2026-08-09 design). */
export const TRAFFIC_MEASUREMENT_START = '2026-08-09';
```

(Set it to the date the branch is merged; note in the PR body if that slips.)

- `SlotDetail.tsx`: relabel the per-slot card from `Vefumferð` to `Hleðslur pláss`. The fill-rate card is unchanged — it must keep dividing impressions by slot loads.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @ada/shared build && pnpm --filter @ada/dashboard test && pnpm --filter @ada/dashboard typecheck && pnpm --filter @ada/dashboard lint`
Expected: PASS. Then the emulator-wrapped API test.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/constants.ts apps/api/src/services/publisher-stats.ts apps/dashboard/src/pages/publisher
git commit -m "feat(dashboard): report true page views, relabel per-slot loads"
```

---

### Task 7: Verify, ship

- [ ] **Step 1: Full verify**

Run: `pnpm verify && pnpm test:api && pnpm --filter @ada/dashboard test && pnpm --filter @ada/serving test && pnpm --filter @ada/snippet test`
Expected: all green. One emulator invocation at a time.

- [ ] **Step 2: Push branch and open PR**

oruggt-ship flow. PR title: `feat: count page views once per page load, make event logging durable`. The body MUST state plainly:

- what changed for publishers: "Vefumferð" now counts a page view once instead of once per ad slot, so the number will DROP sharply and correctly; the series starts at the switch date and shows no history before it; the per-slot figure is relabelled "Hleðslur pláss" and fill rate is unaffected.
- that bot filtering is explicitly NOT part of this change — the traffic figure is now counted correctly but still includes crawlers; measuring the bot share is a separate, open decision.
- deployment note: the snippet must be rebuilt and pushed to the CDN; old cached snippets keep working and simply do not report page views until they refresh.
