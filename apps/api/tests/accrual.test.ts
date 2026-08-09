import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FLAT_CPM_ISK } from '@ada/shared';
import type * as WalletModule from '../src/services/wallet';

interface MockLedgerEntry {
  id: string;
  party: { type: string; id: string };
  type: string;
  amountIsk: number;
  relatedId: string;
  createdAt: Date;
}

interface MockCampaign {
  id: string;
  advertiserId: string;
  budget: { mode: 'cpm_capped' | 'slot_purchased'; totalIsk: number; remainingIsk: number };
  status: string;
}

interface MockSlot {
  id: string;
  pricing: { mode: 'cpm' | 'slot'; cpmIsk?: number };
}

let mockLedgerEntries: MockLedgerEntry[] = [];
const mockCampaigns = new Map<string, MockCampaign>();
const mockSlots = new Map<string, MockSlot>();
let mockAdvertisers: Array<{ id: string; walletBalanceIsk: number }> = [];
let mockEventsQueue: string[] = [];
// Advertiser ids for which the mocked advertisers-collection `update` (i.e.
// syncMirror's write, invoked from inside the REAL chargeCampaign) throws —
// proves end-to-end that a mirror-sync failure after a successful charge
// does not cause accrual to re-queue (and thus double-bill) those events.
let failMirrorSyncFor = new Set<string>();
// Campaign ids for which the mocked campaigns-collection `update` throws —
// used to simulate the auto-pause write itself failing (e.g. Firestore
// outage), so tests can prove events are never dropped when the pause
// didn't actually happen.
let failCampaignUpdateFor = new Set<string>();

vi.mock('../src/lib/firebase', () => {
  return {
    db: {
      collection: vi.fn((colName: string) => {
        const createQuery = (filters: Array<{ prop: string; val: unknown }> = []) => {
          const queryObj: Record<string, unknown> = {
            where: vi.fn((p: string, _op: string, v: unknown) => {
              return createQuery([...filters, { prop: p, val: v }]);
            }),
            orderBy: vi.fn(() => queryObj),
            limit: vi.fn(() => queryObj),
            get: vi.fn(async () => {
              if (colName === 'ledger') {
                let filtered = [...mockLedgerEntries];
                for (const filter of filters) {
                  if (filter.prop === 'party.type') {
                    filtered = filtered.filter((e) => e.party.type === filter.val);
                  } else if (filter.prop === 'party.id') {
                    filtered = filtered.filter((e) => e.party.id === filter.val);
                  } else if (filter.prop === 'relatedId') {
                    filtered = filtered.filter((e) => e.relatedId === filter.val);
                  } else if (filter.prop === 'type') {
                    filtered = filtered.filter((e) => e.type === filter.val);
                  }
                }
                return {
                  empty: filtered.length === 0,
                  docs: filtered.map((item) => ({
                    data: () => item,
                  })),
                };
              }
              return { empty: true, docs: [] };
            }),
            withConverter: vi.fn(() => ({
              get: vi.fn(async () => {
                if (colName === 'ledger') {
                  let filtered = [...mockLedgerEntries];
                  for (const filter of filters) {
                    if (filter.prop === 'party.type') {
                      filtered = filtered.filter((e) => e.party.type === filter.val);
                    } else if (filter.prop === 'party.id') {
                      filtered = filtered.filter((e) => e.party.id === filter.val);
                    } else if (filter.prop === 'relatedId') {
                      filtered = filtered.filter((e) => e.relatedId === filter.val);
                    } else if (filter.prop === 'type') {
                      filtered = filtered.filter((e) => e.type === filter.val);
                    }
                  }
                  return {
                    empty: filtered.length === 0,
                    docs: filtered.map((item) => ({
                      data: () => item,
                    })),
                  };
                }
                return { empty: true, docs: [] };
              }),
            })),
          };
          return queryObj;
        };

        return {
          doc: vi.fn((id: string) => ({
            id,
            update: vi.fn(async (fields: any) => {
              if (colName === 'campaigns') {
                if (failCampaignUpdateFor.has(id)) {
                  throw new Error('campaign doc write unavailable');
                }
                const found = mockCampaigns.get(id);
                if (found) {
                  if (fields['budget.remainingIsk'] !== undefined) {
                    found.budget.remainingIsk = fields['budget.remainingIsk'];
                  }
                  if (fields.status !== undefined) {
                    found.status = fields.status;
                  }
                }
              } else if (colName === 'advertisers') {
                if (failMirrorSyncFor.has(id)) {
                  throw new Error('mirror sync unavailable');
                }
                const found = mockAdvertisers.find((a) => a.id === id);
                if (found) {
                  Object.assign(found, fields);
                }
              }
            }),
            withConverter: vi.fn(() => ({
              set: vi.fn(async (val: any) => {
                if (colName === 'ledger') {
                  mockLedgerEntries.push(val as MockLedgerEntry);
                }
              }),
              get: vi.fn(async () => {
                if (colName === 'campaigns') {
                  const found = mockCampaigns.get(id);
                  return {
                    exists: found !== undefined,
                    data: () => found,
                  };
                } else if (colName === 'slots') {
                  const found = mockSlots.get(id);
                  return {
                    exists: found !== undefined,
                    data: () => found,
                  };
                }
                return { exists: false, data: () => null };
              }),
            })),
          })),
          ...createQuery(),
        };
      }),
    },
    auth: {},
    storage: {},
  };
});

// Minimal in-memory KV store backing the accrual-fail:{campaignId} counters
// (incr/expire/del) used by the consecutive-failure pause/alert logic.
let mockKv = new Map<string, number>();

// Simulates a broken Redis WRITE path (lpush) — e.g. an infra blip mid
// re-queue (IMPORTANT-1) — independent of reads still working.
let lpushShouldFail = false;
// Simulates a broken Redis READ path (rpop) that fails after N successful
// pops within a single drainBatch call — proves already-popped events get
// pushed back rather than lost (IMPORTANT-1's pop-loop guard). `null` means
// "never fail".
let rpopFailAfterCount: number | null = null;
let rpopCallCount = 0;

vi.mock('../src/lib/redis', () => ({
  getRedis: () => ({
    rpop: vi.fn(async () => {
      if (rpopFailAfterCount !== null && rpopCallCount >= rpopFailAfterCount) {
        throw new Error('redis rpop unavailable');
      }
      rpopCallCount++;
      return mockEventsQueue.pop() || null;
    }),
    // Real Redis LPUSH pushes to the head; our mock queue is drained from the
    // tail (rpop === pop), so a re-queued event must go to the front (index
    // 0) to preserve FIFO-ish ordering relative to whatever is still queued.
    lpush: vi.fn(async (_key: string, val: string) => {
      if (lpushShouldFail) {
        throw new Error('redis lpush unavailable');
      }
      mockEventsQueue.unshift(val);
      return mockEventsQueue.length;
    }),
    incr: vi.fn(async (key: string) => {
      const next = (mockKv.get(key) ?? 0) + 1;
      mockKv.set(key, next);
      return next;
    }),
    expire: vi.fn(async (_key: string, _seconds: number) => 1),
    del: vi.fn(async (key: string) => {
      const existed = mockKv.has(key);
      mockKv.delete(key);
      return existed ? 1 : 0;
    }),
  }),
}));

// Mock pushCacheForCampaign to avoid actual cache push side effects in these tests
vi.mock('../src/lib/push-cache', () => ({
  pushCacheForCampaign: vi.fn(async () => {}),
}));

// Mock ops-alerts so tests can assert exactly when/how often a sustained
// accrual failure pages ops, without exercising real email/notification
// side effects (those are covered by ops-alerts' own tests).
// `alreadyAlerted` mimics the real Redis-backed dedup (services/ops-alerts.ts):
// the first check for a given key returns false and "marks" it, every
// subsequent check for the same key returns true, until the per-test
// `mockAlertedKeys` reset in beforeEach. Faithful dedup matters here because
// the zero-net-progress alert (MINOR-6) would otherwise fire on every
// re-queued batch in a multi-run test, drowning out the alerts these tests
// actually exist to check.
let mockAlertedKeys = new Set<string>();
vi.mock('../src/services/ops-alerts', () => ({
  alertOps: vi.fn(async () => {}),
  alreadyAlerted: vi.fn(async (key: string) => {
    if (mockAlertedKeys.has(key)) return true;
    mockAlertedKeys.add(key);
    return false;
  }),
}));

// Fail-injection wrapper around the real wallet service: lets tests force an
// UNEXPECTED chargeCampaign failure for specific campaigns (e.g. "firestore
// unavailable") while every other campaign still goes through the real
// implementation against the mocked db above. Also tracks call counts per
// campaign so tests can assert a campaign is never charged twice, and lets
// tests force a failure in creditPublisher AFTER a charge already
// succeeded — the scenario that must never trigger a re-queue.
let failingCampaigns = new Set<string>();
let failAfterChargeCampaigns = new Set<string>();
let chargeCallCounts = new Map<string, number>();

vi.mock('../src/services/wallet', async () => {
  const actual = await vi.importActual<typeof WalletModule>('../src/services/wallet');
  return {
    ...actual,
    chargeCampaign: vi.fn(async (advertiserId: string, campaignId: string, amountIsk: number) => {
      chargeCallCounts.set(campaignId, (chargeCallCounts.get(campaignId) ?? 0) + 1);
      if (failingCampaigns.has(campaignId)) {
        throw new Error('firestore unavailable');
      }
      return actual.chargeCampaign(advertiserId, campaignId, amountIsk);
    }),
    creditPublisher: vi.fn(async (publisherId: string, campaignId: string, grossIsk: number) => {
      if (failAfterChargeCampaigns.has(campaignId)) {
        throw new Error('publisher credit unavailable');
      }
      return actual.creditPublisher(publisherId, campaignId, grossIsk);
    }),
  };
});

import { drainAndAccrue, drainAndAccrueAll } from '../src/services/accrual';
import { alertOps } from '../src/services/ops-alerts';

async function seedWalletCampaignSlot({
  balanceIsk,
  cpmIsk,
  totalIsk = 50000,
}: {
  balanceIsk: number;
  cpmIsk: number;
  totalIsk?: number;
}) {
  mockAdvertisers.push({ id: 'adv_acc', walletBalanceIsk: balanceIsk });
  // Seed initial top-up to establish balance
  mockLedgerEntries.push({
    id: 'ldg_topup',
    party: { type: 'advertiser', id: 'adv_acc' },
    type: 'topup',
    amountIsk: balanceIsk,
    relatedId: 'topup_1',
    createdAt: new Date(),
  });

  mockCampaigns.set('cmp_acc', {
    id: 'cmp_acc',
    advertiserId: 'adv_acc',
    budget: {
      mode: 'cpm_capped',
      totalIsk,
      remainingIsk: totalIsk,
    },
    status: 'active',
  });

  mockSlots.set('slot_acc', {
    id: 'slot_acc',
    pricing: {
      mode: 'cpm',
      cpmIsk,
    },
  });
}

function enqueueImpressions({
  campaignId,
  slotId,
  publisherId,
  count,
}: {
  campaignId: string;
  slotId: string;
  publisherId: string;
  count: number;
}) {
  for (let i = 0; i < count; i++) {
    mockEventsQueue.push(
      JSON.stringify({
        type: 'impression',
        slotId,
        publisherId,
        creativeId: 'cre_1',
        campaignId,
        ts: Date.now(),
      }),
    );
  }
}

/** Fund an advertiser + campaign pair so chargeCampaign can succeed against it. */
function seedFundedCampaign({
  campaignId,
  advertiserId,
  balanceIsk = 1_000_000,
  totalIsk = 1_000_000,
}: {
  campaignId: string;
  advertiserId: string;
  balanceIsk?: number;
  totalIsk?: number;
}) {
  if (!mockAdvertisers.find((a) => a.id === advertiserId)) {
    mockAdvertisers.push({ id: advertiserId, walletBalanceIsk: balanceIsk });
    mockLedgerEntries.push({
      id: `ldg_topup_${advertiserId}`,
      party: { type: 'advertiser', id: advertiserId },
      type: 'topup',
      amountIsk: balanceIsk,
      relatedId: `topup_${advertiserId}`,
      createdAt: new Date(),
    });
  }
  mockCampaigns.set(campaignId, {
    id: campaignId,
    advertiserId,
    budget: { mode: 'cpm_capped', totalIsk, remainingIsk: totalIsk },
    status: 'active',
  });
}

function queueLength(): number {
  return mockEventsQueue.length;
}

/** Push `count` funded impression events for a single throwaway campaign. */
async function seedQueue(count: number, campaignId = 'cmp_bulk') {
  seedFundedCampaign({ campaignId, advertiserId: `adv_${campaignId}` });
  enqueueImpressions({
    campaignId,
    slotId: `slot_${campaignId}`,
    publisherId: `pub_${campaignId}`,
    count,
  });
}

/** Push `count` funded impression events for a specific campaign id. */
async function seedQueueFor(campaignId: string, count: number) {
  seedFundedCampaign({ campaignId, advertiserId: `adv_${campaignId}` });
  enqueueImpressions({
    campaignId,
    slotId: `slot_${campaignId}`,
    publisherId: `pub_${campaignId}`,
    count,
  });
}

/** Force chargeCampaign to throw an UNEXPECTED error for this campaign (not insufficient-funds). */
function failChargeFor(campaignId: string) {
  failingCampaigns.add(campaignId);
}

/** Force creditPublisher to throw for this campaign — AFTER its charge already succeeded. */
function failAfterChargeFor(campaignId: string) {
  failAfterChargeCampaigns.add(campaignId);
}

/**
 * Force the wallet mirror sync to throw for this campaign's advertiser.
 * Exercises the REAL (non-mocked) chargeCampaign — via seedFundedCampaign's
 * `adv_${campaignId}` convention — to prove the wallet.ts fix (syncMirror
 * failures swallowed post-ledger-write) holds end-to-end through accrual.
 */
function failMirrorSyncAfterChargeFor(campaignId: string) {
  failMirrorSyncFor.add(`adv_${campaignId}`);
}

/** Force the campaign-doc `status: 'paused'` write to throw — simulates the auto-pause itself failing. */
function failPauseFor(campaignId: string) {
  failCampaignUpdateFor.add(campaignId);
}

/** Campaign ids that have at least one recorded campaign_charge ledger entry. */
function chargedCampaigns(): string[] {
  const ids = new Set<string>();
  for (const e of mockLedgerEntries) {
    if (e.party.type === 'advertiser' && e.type === 'campaign_charge') {
      ids.add(e.relatedId);
    }
  }
  return [...ids];
}

function chargeCallCount(campaignId: string): number {
  return chargeCallCounts.get(campaignId) ?? 0;
}

async function getCampaignChargeTotal(advertiserId: string): Promise<number> {
  let total = 0;
  for (const entry of mockLedgerEntries) {
    if (
      entry.party.type === 'advertiser' &&
      entry.party.id === advertiserId &&
      entry.type === 'campaign_charge'
    ) {
      total += Math.abs(entry.amountIsk);
    }
  }
  return total;
}

describe('Accrual Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLedgerEntries = [];
    mockCampaigns.clear();
    mockSlots.clear();
    mockAdvertisers = [];
    mockEventsQueue = [];
    failingCampaigns = new Set();
    failAfterChargeCampaigns = new Set();
    failMirrorSyncFor = new Set();
    mockKv = new Map();
    failCampaignUpdateFor = new Set();
    chargeCallCounts = new Map();
    mockAlertedKeys = new Set();
    lpushShouldFail = false;
    rpopFailAfterCount = null;
    rpopCallCount = 0;
  });

  it('charges flat CPM per 1000 impressions, not rounded per impression', async () => {
    await seedWalletCampaignSlot({ balanceIsk: 100000, cpmIsk: FLAT_CPM_ISK });
    enqueueImpressions({
      campaignId: 'cmp_acc',
      slotId: 'slot_acc',
      publisherId: 'pub_acc',
      count: 1000,
    });
    await drainAndAccrue(2000);
    const charge = await getCampaignChargeTotal('adv_acc');
    expect(charge).toBe(FLAT_CPM_ISK);
  });

  it('decrements campaign remainingIsk by the charged amount', async () => {
    await seedWalletCampaignSlot({ balanceIsk: 100000, cpmIsk: FLAT_CPM_ISK, totalIsk: 50000 });
    enqueueImpressions({
      campaignId: 'cmp_acc',
      slotId: 'slot_acc',
      publisherId: 'pub_acc',
      count: 1000,
    });
    await drainAndAccrue(2000);
    const cmp = mockCampaigns.get('cmp_acc');
    expect(cmp!.budget.remainingIsk).toBe(50000 - FLAT_CPM_ISK);
  });
});

describe('drainAndAccrueAll', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLedgerEntries = [];
    mockCampaigns.clear();
    mockSlots.clear();
    mockAdvertisers = [];
    mockEventsQueue = [];
    failingCampaigns = new Set();
    failAfterChargeCampaigns = new Set();
    failMirrorSyncFor = new Set();
    mockKv = new Map();
    failCampaignUpdateFor = new Set();
    chargeCallCounts = new Map();
    mockAlertedKeys = new Set();
    lpushShouldFail = false;
    rpopFailAfterCount = null;
    rpopCallCount = 0;
  });

  it('drains a queue larger than one batch across multiple batches', async () => {
    await seedQueue(1200);
    const res = await drainAndAccrueAll({ batchSize: 500 });
    expect(res.drained).toBe(1200);
    expect(res.batches).toBe(3); // 3 actual drainBatch calls (500 + 500 + 200)
    expect(res.capped).toBe(false); // clean finish — queue ran dry, not maxBatches
    expect(queueLength()).toBe(0);
  });

  it('stops at maxBatches, reports the true batch count, and flags the run as capped', async () => {
    await seedQueue(1100);
    const res = await drainAndAccrueAll({ batchSize: 500, maxBatches: 2 });
    expect(res.drained).toBe(1000);
    expect(res.batches).toBe(2); // exactly 2 drainBatch calls happened — not 3
    expect(res.capped).toBe(true); // maxBatches cut the run short with work left
    expect(queueLength()).toBe(100);
  });

  it("re-queues a failing campaign's events and still processes the healthy campaign", async () => {
    // two campaigns' events; chargeCampaign is made to throw an UNEXPECTED
    // error (not insufficient-funds — that path pauses the campaign and
    // must keep its existing behavior) for cmp_bad only.
    await seedQueueFor('cmp_good', 10);
    await seedQueueFor('cmp_bad', 10);
    failChargeFor('cmp_bad');

    const res = await drainAndAccrueAll();
    expect(chargedCampaigns()).toContain('cmp_good');
    expect(chargedCampaigns()).not.toContain('cmp_bad');
    expect(res.requeued).toBe(10);
    expect(queueLength()).toBe(10); // cmp_bad's events are back
  });

  it('never re-queues a campaign whose charge already succeeded, even if a later step throws', async () => {
    // chargeCampaign succeeds for cmp_flaky, but creditPublisher (a step
    // AFTER the charge) throws. Re-queueing here would replay the charge on
    // the next run and double-bill the advertiser, so it must not happen.
    await seedQueueFor('cmp_flaky', 10);
    failAfterChargeFor('cmp_flaky');

    const res = await drainAndAccrueAll();
    expect(chargedCampaigns()).toContain('cmp_flaky');
    expect(chargeCallCount('cmp_flaky')).toBe(1);
    expect(res.requeued).toBe(0);
    expect(queueLength()).toBe(0);
  });

  it('never re-queues a campaign whose wallet mirror sync fails after the ledger charge lands', async () => {
    // Exercises the REAL chargeCampaign (not the failChargeFor/failAfterChargeFor
    // mocks) — its own internal syncMirror failure must not surface as a
    // rejection, so accrual never sees a reason to re-queue these events.
    await seedQueueFor('cmp_mirror_fail', 10);
    failMirrorSyncAfterChargeFor('cmp_mirror_fail');

    const res = await drainAndAccrueAll();
    expect(chargedCampaigns()).toContain('cmp_mirror_fail');
    expect(chargeCallCount('cmp_mirror_fail')).toBe(1);
    expect(res.requeued).toBe(0);
    expect(queueLength()).toBe(0);
  });

  /** Find the one alertOps call (if any) whose subject contains `needle`. */
  function findAlertBySubject(needle: string) {
    return vi.mocked(alertOps).mock.calls.find(([subject]) => subject.includes(needle));
  }

  it('does not pause the campaign after a single transient accrual failure, but does flag zero net progress (MINOR-6)', async () => {
    await seedQueueFor('cmp_flaky2', 10);
    failChargeFor('cmp_flaky2');

    const res = await drainAndAccrueAll();

    expect(mockCampaigns.get('cmp_flaky2')!.status).toBe('active');
    expect(queueLength()).toBe(10); // re-queued, not dropped — only 1 failure so far
    // The whole batch bounced back with nothing billed net — that's its own
    // alertable condition, separate from (and not) the sustained-failure
    // pause alert, which must not have fired for a single transient miss.
    expect(res.netDrained).toBe(0);
    expect(findAlertBySubject('sett í bið')).toBeUndefined();
    expect(alertOps).toHaveBeenCalledTimes(1);
    const [, message] = vi.mocked(alertOps).mock.calls[0]!;
    expect(message).toMatch(/10/);
  });

  it('pauses the campaign and alerts ops exactly once after sustained accrual failures', async () => {
    // Same campaign fails to charge across three separate cron-style
    // drainAndAccrueAll() invocations (each pops the still-queued events,
    // fails, and re-queues them again — exactly like three real 15-minute
    // cron ticks would). The first two must NOT pause or send the
    // sustained-failure escalation alert; the third crosses
    // ACCRUAL_FAIL_THRESHOLD and must pause + send that alert exactly once.
    // (Runs 1 and 2 DO each bounce their whole batch back with zero net
    // progress, which independently triggers — and dedupes after the first
    // firing — the MINOR-6 alert; that's expected and asserted separately.)
    await seedQueueFor('cmp_sustained', 10);
    failChargeFor('cmp_sustained');

    await drainAndAccrueAll(); // failure 1 — zero-progress alert fires once here
    await drainAndAccrueAll(); // failure 2 — zero-progress alert deduped, no new call
    expect(mockCampaigns.get('cmp_sustained')!.status).toBe('active');
    expect(findAlertBySubject('sett í bið')).toBeUndefined();
    expect(alertOps).toHaveBeenCalledTimes(1); // only the zero-progress alert so far

    await drainAndAccrueAll(); // failure 3 — crosses the threshold

    expect(mockCampaigns.get('cmp_sustained')!.status).toBe('paused');
    expect(queueLength()).toBe(0); // dropped (not re-queued) once paused

    // The escalation alert must say the campaign WAS paused — never claim
    // that when it wasn't (see the companion test below for the pause-failed
    // case) — and must include the discarded-events evidence (IMPORTANT-3).
    const escalationCall = findAlertBySubject('sett í bið');
    expect(escalationCall).toBeDefined();
    const [subject, message] = escalationCall!;
    expect(subject).toContain('sett í bið');
    expect(message).toMatch(/var sjálfkrafa sett í bið/);
    expect(message).not.toMatch(/ekki tókst|mistókst að setja/i);
    expect(message).toMatch(/10 óinnheimtar birtingar/);
    expect(message).toMatch(/pub_cmp_sustained: 10/);
    // 1 zero-progress alert (run 1) + 1 escalation alert (run 3) — run 2's
    // own zero-net batch was deduped away, run 3 dropped (not re-queued) so
    // never triggered a second zero-progress check.
    expect(alertOps).toHaveBeenCalledTimes(2);
  });

  it('re-queues (never drops) events and alerts that pausing failed, when the auto-pause write itself throws', async () => {
    // Same three-strikes setup as above, but this time the campaign-doc
    // write that would pause it also fails (e.g. the same Firestore outage
    // that caused the charge failures in the first place — the scenario
    // the coordinator flagged as "reachable exactly when it matters most").
    // The campaign must stay active, its events must come back to the
    // queue (nothing silently discarded), the failure counter must NOT be
    // cleared (so the very next run retries the pause immediately), and the
    // alert text must say plainly that the pause failed and the campaign is
    // still serving — never the "paused" wording from the happy path.
    await seedQueueFor('cmp_pause_fails', 10);
    failChargeFor('cmp_pause_fails');
    failPauseFor('cmp_pause_fails');

    await drainAndAccrueAll(); // failure 1 — zero-progress alert fires once here
    await drainAndAccrueAll(); // failure 2 — zero-progress alert deduped
    const res3 = await drainAndAccrueAll(); // failure 3 — crosses the threshold, pause attempt fails too

    expect(mockCampaigns.get('cmp_pause_fails')!.status).toBe('active'); // NOT paused
    expect(res3.requeued).toBe(10); // events re-queued, not dropped
    expect(queueLength()).toBe(10); // queue depth restored, nothing lost

    const pauseFailedCall = findAlertBySubject('Ekki tókst');
    expect(pauseFailedCall).toBeDefined();
    const [subject, message] = pauseFailedCall!;
    expect(subject.toLowerCase()).toMatch(/ekki tókst|villa/);
    expect(message).toMatch(/mistókst/);
    expect(message).toMatch(/ENN VIRK/);
    expect(message).not.toMatch(/var sjálfkrafa sett í bið/);
    // 1 zero-progress alert (run 1, deduped on runs 2 & 3's own zero-net
    // batches) + 1 pause-failed alert (run 3, not deduped — see progress.md
    // parked item on that alert's lack of dedup, out of scope here).
    expect(alertOps).toHaveBeenCalledTimes(2);

    // Counter was NOT cleared — the very next run should re-attempt the
    // pause (and this time succeed, since we stop forcing the write to fail)
    // rather than needing three more fresh failures first.
    failCampaignUpdateFor.delete('cmp_pause_fails');
    await drainAndAccrueAll(); // failure 4, but pause succeeds this time
    expect(mockCampaigns.get('cmp_pause_fails')!.status).toBe('paused');
    expect(findAlertBySubject('sett í bið')).toBeDefined();
    expect(alertOps).toHaveBeenCalledTimes(3);
  });

  it('re-queues (never drops) events when the pause write fails after a genuine insufficient-balance charge (MINOR-4)', async () => {
    // Uses the REAL chargeCampaign (not the failChargeFor mock) so it throws
    // the actual INSUFFICIENT_BALANCE AppError, then forces the campaign-doc
    // pause write to also fail — the exact "same outage causing both
    // failures" scenario the escalation path already guards against, now
    // proven for the insufficient-funds path too.
    seedFundedCampaign({ campaignId: 'cmp_broke', advertiserId: 'adv_broke', balanceIsk: 10 });
    enqueueImpressions({
      campaignId: 'cmp_broke',
      slotId: 'slot_cmp_broke',
      publisherId: 'pub_cmp_broke',
      count: 100, // gross = round(550*100/1000) = 55 > balanceIsk of 10
    });
    failPauseFor('cmp_broke');

    const res = await drainAndAccrueAll();

    expect(chargedCampaigns()).not.toContain('cmp_broke'); // never charged
    expect(mockCampaigns.get('cmp_broke')!.status).toBe('active'); // pause failed, stayed active
    expect(res.requeued).toBe(100); // events put back, not dropped
    expect(queueLength()).toBe(100);
  });

  it('re-queues already-popped events when redis.rpop fails mid-pop (IMPORTANT-1: pop loop is guarded)', async () => {
    await seedQueueFor('cmp_rpop_a', 5);
    await seedQueueFor('cmp_rpop_b', 5); // 10 events total in the mock queue
    rpopFailAfterCount = 6; // pop 6 successfully, then rpop throws

    const res = await drainAndAccrueAll({ batchSize: 10, maxBatches: 1 });

    expect(res.batches).toBe(1);
    expect(res.drained).toBe(0); // this batch made no charging progress
    expect(res.requeued).toBe(6); // the 6 already-popped events went back
    expect(queueLength()).toBe(10); // nothing lost overall
    expect(chargedCampaigns()).toEqual([]); // neither campaign was ever charged
  });

  it("keeps processing later campaigns in the batch when an earlier campaign's re-queue write fails (IMPORTANT-1: lpush failure no longer cascades)", async () => {
    // Mock queue is LIFO (rpop === array.pop()), so pushing in this order
    // makes byCampaign iterate: cmp_before, then cmp_broken, then cmp_after.
    await seedQueueFor('cmp_after', 10);
    await seedQueueFor('cmp_broken', 10);
    await seedQueueFor('cmp_before', 10);
    failChargeFor('cmp_broken'); // unexpected charge failure -> tries to re-queue

    lpushShouldFail = true; // simulate the Redis WRITE path being down
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await drainAndAccrueAll();

    // cmp_before and cmp_after only get charged if the campaign loop did NOT
    // abort when cmp_broken's re-queue attempt threw internally — before
    // this fix, an unguarded lpush would have propagated out of the whole
    // drainBatch call, so cmp_after (iterated after cmp_broken) would never
    // have been reached and its already-popped events would be gone with no
    // trace at all.
    expect(chargedCampaigns()).toContain('cmp_before');
    expect(chargedCampaigns()).toContain('cmp_after');
    expect(chargedCampaigns()).not.toContain('cmp_broken');
    // cmp_broken's events could not be pushed back — Redis writes are down,
    // which is an unavoidable loss — but it must be a LOGGED loss, not a
    // silent one.
    expect(res.requeued).toBe(0);
    expect(queueLength()).toBe(0);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('failed to re-queue an event'),
      expect.anything(),
      expect.anything(),
    );
    errorSpy.mockRestore();
  });

  it('stops starting new batches once the wall-clock deadline passes, reports timedOut, and leaves the remaining queue intact (IMPORTANT-2)', async () => {
    await seedQueueFor('cmp_deadline', 15);

    // Injectable clock: first read computes the deadline, second read (the
    // check before batch 1) is still within budget so batch 1 runs, third
    // read (the check before batch 2) has jumped well past the deadline —
    // simulates wall-clock time elapsing without an actual sleep.
    const nowValues = [0, 0, 100];
    let idx = 0;
    const now = () => nowValues[Math.min(idx++, nowValues.length - 1)]!;

    const res = await drainAndAccrueAll({ batchSize: 5, deadlineMs: 5, now });

    expect(res.timedOut).toBe(true);
    expect(res.capped).toBe(false); // stopped on time, not on the batch-count safety valve
    expect(res.batches).toBe(1); // exactly one batch completed before the deadline check stopped the next
    expect(res.drained).toBe(5);
    expect(res.netDrained).toBe(5);
    expect(chargedCampaigns()).toContain('cmp_deadline'); // the one batch that ran did real work
    expect(queueLength()).toBe(10); // the other 10 events were never touched
  });

  it('reports zero net progress and alerts when an entire run bounces back with nothing billed (MINOR-6)', async () => {
    await seedQueueFor('cmp_zero', 20);
    failChargeFor('cmp_zero');

    const res = await drainAndAccrueAll();

    expect(res.drained).toBe(20);
    expect(res.requeued).toBe(20);
    expect(res.netDrained).toBe(0);
    expect(alertOps).toHaveBeenCalledTimes(1);
    const [subject, message] = vi.mocked(alertOps).mock.calls[0]!;
    expect(subject).toMatch(/skilaði engu|zero/i);
    expect(message).toMatch(/20/);

    // Dedup: a second consecutive zero-progress run must not page again
    // within the window.
    const res2 = await drainAndAccrueAll();
    expect(res2.netDrained).toBe(0);
    expect(alertOps).toHaveBeenCalledTimes(1);
  });
});
