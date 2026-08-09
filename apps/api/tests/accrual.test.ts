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

vi.mock('../src/lib/redis', () => ({
  getRedis: () => ({
    rpop: vi.fn(async () => mockEventsQueue.pop() || null),
    // Real Redis LPUSH pushes to the head; our mock queue is drained from the
    // tail (rpop === pop), so a re-queued event must go to the front (index
    // 0) to preserve FIFO-ish ordering relative to whatever is still queued.
    lpush: vi.fn(async (_key: string, val: string) => {
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
vi.mock('../src/services/ops-alerts', () => ({
  alertOps: vi.fn(async () => {}),
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
    chargeCallCounts = new Map();
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
    chargeCallCounts = new Map();
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

  it('does not pause the campaign after a single transient accrual failure', async () => {
    await seedQueueFor('cmp_flaky2', 10);
    failChargeFor('cmp_flaky2');

    await drainAndAccrueAll();

    expect(mockCampaigns.get('cmp_flaky2')!.status).toBe('active');
    expect(alertOps).not.toHaveBeenCalled();
    expect(queueLength()).toBe(10); // re-queued, not dropped — only 1 failure so far
  });

  it('pauses the campaign and alerts ops exactly once after sustained accrual failures', async () => {
    // Same campaign fails to charge across three separate cron-style
    // drainAndAccrueAll() invocations (each pops the still-queued events,
    // fails, and re-queues them again — exactly like three real 15-minute
    // cron ticks would). The first two must NOT pause or alert; the third
    // crosses ACCRUAL_FAIL_THRESHOLD and must pause + alert exactly once.
    await seedQueueFor('cmp_sustained', 10);
    failChargeFor('cmp_sustained');

    await drainAndAccrueAll(); // failure 1
    await drainAndAccrueAll(); // failure 2
    expect(mockCampaigns.get('cmp_sustained')!.status).toBe('active');
    expect(alertOps).not.toHaveBeenCalled();

    await drainAndAccrueAll(); // failure 3 — crosses the threshold

    expect(mockCampaigns.get('cmp_sustained')!.status).toBe('paused');
    expect(alertOps).toHaveBeenCalledTimes(1);
    expect(queueLength()).toBe(0); // dropped (not re-queued) once paused
  });
});
