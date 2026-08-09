# Accrual Drain Hardening Implementation Plan (PR 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The accrual cron drains its whole queue instead of one 500-event batch (removing the ~48k impressions/day billing ceiling), a failure re-queues unprocessed campaigns' events instead of destroying them, and queue depth becomes visible to the heartbeat watchdog.

**Architecture:** `drainAndAccrue` keeps its per-campaign grouping; a new outer loop in the service drains batch-after-batch until empty or a run cap, per-campaign errors re-queue that campaign's events and continue, infra-level errors re-queue everything unprocessed. Accrual events carry no signature — reprocessing safety comes from never re-queueing a campaign whose charge already happened. `cron-diagnostics` and `checkCronHeartbeats` gain `events:accrual` depth. Spec: `docs/superpowers/specs/2026-08-08-payout-integrity-design.md` (Part 3).

**Tech Stack:** Upstash Redis client, firebase-admin (emulator tests), Vitest.

## Global Constraints

- ESM `.js` suffixes package-internally; `apps/api/tests/*` no-suffix style.
- API tests emulator-wrapped WITH the only-flag: `firebase --config firebase/firebase.json emulators:exec --only firestore "pnpm --filter @ada/api test -- tests/<file>.ts"`. Never two emulator runs concurrently.
- Events whose campaign has finished charging are NEVER re-queued (double-billing). The charge→credit pair stays non-atomic as today — this PR only stops whole-batch loss.
- `apps/api/api/*.js` entrypoints are compiled-JS-importing-dist by design — edit them as JS, do not convert to TS.
- Branch: `feat/accrual-hardening` off `docs/payout-integrity-design`. Never push `main` (oruggt-ship).

---

### Task 1: Looped drain with per-campaign re-queue

**Files:**

- Modify: `apps/api/src/services/accrual.ts`
- Modify: `apps/api/api/cron-accrue.js` (call the new loop entry)
- Test: `apps/api/tests/accrual.test.ts` (extend — the file exists; read its Redis-mock pattern first and follow it)

**Interfaces:**

- Consumes: `getRedis`, `chargeCampaign`/`creditPublisher`, `pushCacheForCampaign`, `EVENT_QUEUE_ACCRUAL` — all existing.
- Produces:

```ts
// accrual.ts
export async function drainAndAccrue(batchSize = 500): Promise<number>; // unchanged contract, now with re-queue semantics
export async function drainAndAccrueAll(opts?: {
  batchSize?: number; // default 500
  maxBatches?: number; // default 20 — run cap: 10k events/run, safety valve against a runaway loop
}): Promise<{ drained: number; batches: number; requeued: number }>;
```

- [ ] **Step 1: Write the failing tests**

Extend `apps/api/tests/accrual.test.ts` following its existing setup (it already tests `drainAndAccrue` — reuse its Redis mock/fake and seeding helpers; if the current test uses a real Upstash-shaped mock, extend that mock with `lpush` and a length inspector):

```ts
describe('drainAndAccrueAll', () => {
  it('drains a queue larger than one batch across multiple batches', async () => {
    await seedQueue(1200); // helper: push 1200 impression events for a funded campaign
    const res = await drainAndAccrueAll({ batchSize: 500 });
    expect(res.drained).toBe(1200);
    expect(res.batches).toBe(3);
    expect(await queueLength()).toBe(0);
  });

  it('stops at maxBatches and leaves the rest queued', async () => {
    await seedQueue(1100);
    const res = await drainAndAccrueAll({ batchSize: 500, maxBatches: 2 });
    expect(res.drained).toBe(1000);
    expect(await queueLength()).toBe(100);
  });

  it('re-queues a failing campaign's events and still processes the healthy campaign', async () => {
    // two campaigns' events interleaved; make chargeCampaign throw an
    // UNEXPECTED error (not insufficient-funds — that path pauses the
    // campaign and must keep its existing behavior) for cmp_bad only
    await seedQueueFor('cmp_good', 10);
    await seedQueueFor('cmp_bad', 10);
    failChargeFor('cmp_bad', new Error('firestore unavailable'));

    const res = await drainAndAccrueAll();
    expect(chargedCampaigns()).toContain('cmp_good');
    expect(res.requeued).toBe(10);
    expect(await queueLength()).toBe(10); // cmp_bad's events are back
  });

  it('never re-queues events of a campaign that already charged (no double billing)', async () => {
    await seedQueueFor('cmp_good', 10);
    await drainAndAccrueAll();
    expect(await queueLength()).toBe(0);
    const res2 = await drainAndAccrueAll();
    expect(res2.drained).toBe(0);
    expect(chargeCallCount('cmp_good')).toBe(1);
  });
});
```

(Helper names are illustrative — implement them on top of the file's existing mock in its style. The insufficient-funds→pause branch keeps its current test coverage; do not change that behavior.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `firebase --config firebase/firebase.json emulators:exec --only firestore "pnpm --filter @ada/api test -- tests/accrual.test.ts"`
Expected: `drainAndAccrueAll` not exported → FAIL; existing tests PASS.

- [ ] **Step 3: Implement**

1. Restructure `drainAndAccrue`'s processing section: keep the pop-and-parse phase; group `byCampaign` as today. Then per campaign, wrap the WHOLE per-campaign block (charge + budget decrement + credits) in try/catch:

```ts
let requeued = 0;
for (const [campaignId, evs] of byCampaign) {
  try {
    // existing body: fetch campaign, skip non-cpm, count, charge (its
    // internal insufficient-funds catch → pause stays EXACTLY as-is),
    // decrement, push cache, credit publishers
  } catch (err) {
    // Unexpected failure (not the handled charge-failure path): put this
    // campaign's raw events back so the next run retries them. Events of
    // campaigns that already charged are NOT re-queued — accrual events
    // carry no signature, so re-charging them would double-bill.
    console.warn(`[cron-accrue] re-queueing ${evs.length} events for ${campaignId}:`, err);
    for (const ev of evs) {
      await redis.lpush(EVENT_QUEUE_ACCRUAL, JSON.stringify(ev));
    }
    requeued += evs.length;
  }
}
```

Return `{ drained: events.length, requeued }` internally (adjust the public `drainAndAccrue` to keep returning the drained count for backward compat, or return the richer object and update the one caller — pick the smaller diff and note it).

2. Add the loop:

```ts
export async function drainAndAccrueAll(opts?: {
  batchSize?: number;
  maxBatches?: number;
}): Promise<{ drained: number; batches: number; requeued: number }> {
  const batchSize = opts?.batchSize ?? 500;
  const maxBatches = opts?.maxBatches ?? 20;
  let drained = 0;
  let requeued = 0;
  let batches = 0;
  for (; batches < maxBatches; batches++) {
    const res = await drainBatch(batchSize); // the refactored single-batch core
    drained += res.drained;
    requeued += res.requeued;
    // Stop when the queue yielded less than a full batch (empty), or when a
    // batch made no forward progress (everything re-queued — retrying in
    // this run would just spin on the same failure).
    if (res.drained < batchSize || res.drained === res.requeued) break;
  }
  return { drained, batches: batches + 1, requeued };
}
```

3. `api/cron-accrue.js`: import and call `drainAndAccrueAll()` instead of `drainAndAccrue(500)`; include `drained/batches/requeued` in the JSON response. Heartbeat call stays on the success path only.

- [ ] **Step 4: Run tests to verify they pass**

Run: `firebase --config firebase/firebase.json emulators:exec --only firestore "pnpm --filter @ada/api test -- tests/accrual.test.ts"`
Expected: PASS (new and pre-existing). Then `pnpm --filter @ada/api typecheck && pnpm --filter @ada/api build` (the compiled `dist/` must carry the new export for the JS entrypoint).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/accrual.ts apps/api/api/cron-accrue.js apps/api/tests/accrual.test.ts
git commit -m "feat(api): looped accrual drain with per-campaign re-queue on failure"
```

---

### Task 2: Queue-depth visibility in heartbeat and diagnostics

**Files:**

- Modify: `apps/api/src/services/ops-alerts.ts` (depth check joins `checkCronHeartbeats`)
- Modify: `apps/api/api/cron-diagnostics.js` (report `events:accrual` + `events:stats` depths — read the file first; it likely already reports queue depths per CLAUDE.md, in which case only the alerting side is new)
- Test: `apps/api/tests/ops-alerts.test.ts` (extend, following its existing mock pattern)

**Interfaces:**

- Consumes: `getRedis` (`llen`), `alertOps`, existing heartbeat plumbing.
- Produces: `checkCronHeartbeats` additionally alerts when `events:accrual` depth has GROWN across two consecutive hourly checks while `cron-accrue`'s heartbeat is fresh (draining but not keeping up). Stores the previous depth under the Redis key `queue_depth_prev:accrual`.

- [ ] **Step 1: Write the failing tests**

Extend `ops-alerts.test.ts` in its established style:

```ts
it('alerts when the accrual queue grows across consecutive checks', async () => {
  setQueueDepth('events:accrual', 800);
  await checkCronHeartbeats(); // records 800, no alert (no baseline yet)
  setQueueDepth('events:accrual', 1600);
  await checkCronHeartbeats();
  expect(sentAlerts().some((a) => a.subject.includes('accrual queue'))).toBe(true);
});

it('does not alert when the queue shrinks or holds', async () => {
  setQueueDepth('events:accrual', 800);
  await checkCronHeartbeats();
  setQueueDepth('events:accrual', 300);
  await checkCronHeartbeats();
  expect(sentAlerts()).toHaveLength(0);
});
```

(Adapt helper names to the file's existing mocks; the depth threshold logic must ignore zero/absent baselines.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `firebase --config firebase/firebase.json emulators:exec --only firestore "pnpm --filter @ada/api test -- tests/ops-alerts.test.ts"`
Expected: new tests FAIL; existing PASS.

- [ ] **Step 3: Implement**

In `checkCronHeartbeats` (after the staleness partition): `const depth = await redis.llen(EVENT_QUEUE_ACCRUAL).catch(() => null);` — read `queue_depth_prev:accrual`, alert via `alertOps('accrual queue growing', …)` when both are numbers and `depth > prev && depth > 500`, then store the new depth (no TTL needed; overwritten hourly). Reuse the existing alert-dedupe helper if the module has one. In `cron-diagnostics.js`, ensure both queue depths appear in the payload (add only if missing).

- [ ] **Step 4: Run tests to verify they pass**

Run: `firebase --config firebase/firebase.json emulators:exec --only firestore "pnpm --filter @ada/api test -- tests/ops-alerts.test.ts tests/accrual.test.ts"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/ops-alerts.ts apps/api/api/cron-diagnostics.js apps/api/tests/ops-alerts.test.ts
git commit -m "feat(api): accrual queue-depth alerting in the heartbeat watchdog"
```

---

### Task 3: Verify, ship

- [ ] **Step 1: Full verify**

Run: `pnpm verify && pnpm test:api`
Expected: all green.

- [ ] **Step 2: Push branch and open PR**

oruggt-ship flow. PR title: `feat: accrual drain hardening (looped drain, re-queue on failure, depth alerting)`. Body must note: removes the ~48k/day billing ceiling; a crash now delays billing instead of destroying it; the charge→credit non-atomicity is unchanged and documented.
