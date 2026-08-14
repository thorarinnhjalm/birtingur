import { describe, it, expect } from 'vitest';
import { selectCreative } from '../src/lib/select';
import type { CachedCreative, SlotCacheEntry } from '@ada/shared';

/**
 * Deterministic PRNG. selectCreative defaults to Math.random; these tests inject
 * a seeded generator instead so a 1000-draw simulation asserts a stable number
 * rather than a flaky one. Without this the CTR assertions below would pass or
 * fail on the luck of the run.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCreative(over: Partial<CachedCreative> = {}): CachedCreative {
  return {
    creativeId: 'c1',
    campaignId: 'cmp1',
    imageUrl: 'https://example/img.png',
    clickUrl: 'https://example/click',
    width: 728,
    height: 90,
    weight: 1,
    frequencyCapPerDay: 1_000_000,
    budgetExhausted: false,
    validFrom: Date.now() - 60_000,
    validTo: Date.now() + 60_000,
    priority: 'cpm',
    ...over,
  };
}

function makeSlot(creatives: CachedCreative[]): SlotCacheEntry {
  return {
    slotId: 's1',
    publisherId: 'pub1',
    sizes: [{ width: 728, height: 90 }],
    pricing: { mode: 'cpm', cpmIsk: 550 },
    activeCreatives: creatives,
    blockedCategories: [],
    refreshedAt: Date.now(),
  };
}

const CTX = { country: 'IS', consent: 'none' as const, visitorImpressionsToday: {} };

/**
 * Run `draws` selections, feeding each served impression (and its simulated
 * click) back into the creative's own ctr counters — the same feedback loop
 * push-cache creates in production, compressed into one test. Returns how many
 * times each creativeId was served.
 */
function simulate(
  creatives: CachedCreative[],
  trueCtr: Record<string, number>,
  draws: number,
  seed = 1,
): Record<string, number> {
  const rng = mulberry32(seed);
  // Clone so the caller's fixtures are not mutated across cases.
  const live = creatives.map((c) => ({ ...c, ctr: { ...(c.ctr ?? { imp: 0, clk: 0 }) } }));
  const served: Record<string, number> = {};
  for (const c of live) served[c.creativeId] = 0;

  for (let i = 0; i < draws; i++) {
    const picked = selectCreative(makeSlot(live), { ...CTX, rng });
    expect(picked).not.toBeNull();
    const arm = live.find((c) => c.creativeId === picked!.creativeId)!;
    served[arm.creativeId]!++;
    arm.ctr!.imp++;
    if (rng() < (trueCtr[arm.creativeId] ?? 0)) arm.ctr!.clk++;
  }
  return served;
}

describe('epsilon-greedy creative selection', () => {
  /**
   * The acceptance bar: a variant with 5x the CTR of its rival takes at least
   * 70% of 1000 impressions.
   *
   * Asserted as an AVERAGE over many seeds, not on one hand-picked run, because
   * the average is what is actually true. Epsilon-greedy locks in: whichever
   * variant leads when exploitation begins collects 1 - BANDIT_EPSILON of the
   * traffic and therefore most of the subsequent evidence, so a run where the
   * weaker variant got lucky early does not recover. Measured over 300 seeds:
   * mean 730/1000, but ~5% of runs finish below 700 and the worst lands near
   * 550. A single-seed assertion would hide that entirely.
   *
   * Thompson sampling was measured against the same scenario and does not have
   * this failure mode (mean 885, 1 run in 300 below 700). It is the upgrade path
   * if this ever matters; epsilon-greedy is what was specified and is what the
   * hot path runs.
   */
  const SEEDS = [1, 4, 7, 11, 16, 19, 23, 28, 33, 41, 52, 63, 77, 88, 94, 101];

  it('gives the 5x-better variant at least 70% of impressions on average', () => {
    const shares = SEEDS.map((seed) => {
      const a = makeCreative({ creativeId: 'a', campaignId: 'cmp1' });
      const b = makeCreative({ creativeId: 'b', campaignId: 'cmp1' });
      const served = simulate([a, b], { a: 0.05, b: 0.01 }, 1000, seed);
      expect(served.a! + served.b!).toBe(1000);
      return served.a!;
    });

    const mean = shares.reduce((x, y) => x + y, 0) / shares.length;
    expect(mean).toBeGreaterThanOrEqual(700);
  });

  it('clears the 70% bar on the large majority of individual runs', () => {
    // Pins the lock-in rate. If a change makes epsilon-greedy fail this bar more
    // often than roughly one run in six, it has made the rotation worse.
    const cleared = SEEDS.filter((seed) => {
      const a = makeCreative({ creativeId: 'a', campaignId: 'cmp1' });
      const b = makeCreative({ creativeId: 'b', campaignId: 'cmp1' });
      return simulate([a, b], { a: 0.05, b: 0.01 }, 1000, seed).a! >= 700;
    }).length;

    expect(cleared).toBeGreaterThanOrEqual(Math.ceil(SEEDS.length * 0.8));
  });

  it('splits evenly while any variant is still under the cold-start threshold', () => {
    // 'a' already looks far better, but 'b' has only 10 impressions of evidence.
    // Until every arm clears 100 impressions the split must stay even, otherwise
    // a variant that got unlucky in its first few draws is buried permanently.
    const a = makeCreative({ creativeId: 'a', campaignId: 'cmp1', ctr: { imp: 99, clk: 40 } });
    const b = makeCreative({ creativeId: 'b', campaignId: 'cmp1', ctr: { imp: 10, clk: 0 } });

    const rng = mulberry32(7);
    const served: Record<string, number> = { a: 0, b: 0 };
    for (let i = 0; i < 400; i++) {
      // Counters are NOT fed back here: this pins the decision made while cold,
      // not the trajectory out of it.
      const picked = selectCreative(makeSlot([a, b]), { ...CTX, rng });
      served[picked!.creativeId]!++;
    }

    expect(served.b!).toBeGreaterThan(150);
    expect(served.b!).toBeLessThan(250);
  });

  it('still explores the weaker variant instead of starving it completely', () => {
    const a = makeCreative({ creativeId: 'a', campaignId: 'cmp1' });
    const b = makeCreative({ creativeId: 'b', campaignId: 'cmp1' });

    const served = simulate([a, b], { a: 0.05, b: 0.01 }, 1000);

    expect(served.b!).toBeGreaterThan(0);
  });
});

describe('the bandit refuses to act on noise', () => {
  // These pin the defect that made the first cut of this feature worse than no
  // feature at all. Display advertising runs at roughly 0.1% CTR, so 100
  // impressions per variant buys ~0.1 clicks of evidence. Exploiting the
  // "highest CTR" at that point picks an arm essentially at random and then
  // feeds it 80% of traffic, which locks the choice in permanently. Measured
  // before the fix: with variant b genuinely twice as good as a, a still took
  // 3918 of 5000 impressions.

  it('does not favour a variant when neither has earned a single click', () => {
    // Both warm on impressions, both on a measured CTR of exactly zero. There is
    // nothing to choose between them, so the split must stay even instead of
    // defaulting to whichever sits first in creativeIds.
    const a = makeCreative({ creativeId: 'a', campaignId: 'cmp1', ctr: { imp: 5000, clk: 0 } });
    const b = makeCreative({ creativeId: 'b', campaignId: 'cmp1', ctr: { imp: 5000, clk: 0 } });

    const rng = mulberry32(21);
    const slot = makeSlot([a, b]);
    const served: Record<string, number> = { a: 0, b: 0 };
    for (let i = 0; i < 1000; i++) served[selectCreative(slot, { ...CTX, rng })!.creativeId]!++;

    expect(served.a!).toBeGreaterThan(400);
    expect(served.b!).toBeGreaterThan(400);
  });

  it('does not hand 80% of traffic to a variant on the strength of one lucky click', () => {
    const lucky = makeCreative({ creativeId: 'a', campaignId: 'cmp1', ctr: { imp: 300, clk: 1 } });
    const other = makeCreative({ creativeId: 'b', campaignId: 'cmp1', ctr: { imp: 300, clk: 0 } });

    const rng = mulberry32(22);
    const slot = makeSlot([lucky, other]);
    const served: Record<string, number> = { a: 0, b: 0 };
    for (let i = 0; i < 1000; i++) served[selectCreative(slot, { ...CTX, rng })!.creativeId]!++;

    expect(served.a!).toBeLessThan(650);
  });

  it('breaks an exact CTR tie at random, not by position in creativeIds', () => {
    const first = makeCreative({
      creativeId: 'a',
      campaignId: 'cmp1',
      ctr: { imp: 1000, clk: 30 },
    });
    const second = makeCreative({
      creativeId: 'b',
      campaignId: 'cmp1',
      ctr: { imp: 1000, clk: 30 },
    });

    const rng = mulberry32(23);
    const slot = makeSlot([first, second]);
    const served: Record<string, number> = { a: 0, b: 0 };
    for (let i = 0; i < 1000; i++) served[selectCreative(slot, { ...CTX, rng })!.creativeId]!++;

    expect(served.a!).toBeGreaterThan(400);
    expect(served.b!).toBeGreaterThan(400);
  });

  it('backs the better variant more often than not at realistic display CTR', () => {
    // b is genuinely twice as good as a, but both sit near the ~0.1% that display
    // advertising actually runs at, so 5000 impressions yield only a handful of
    // clicks. This is the scenario the evidence gate exists for: measured across
    // 300 seeds the better variant leads 81% of runs WITH the gate, against 60%
    // without it, where the winner was decided by position in creativeIds rather
    // than by performance.
    const seeds = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
    const betterWon = seeds.filter((seed) => {
      const a = makeCreative({ creativeId: 'a', campaignId: 'cmp1' });
      const b = makeCreative({ creativeId: 'b', campaignId: 'cmp1' });
      const served = simulate([a, b], { a: 0.001, b: 0.002 }, 5000, seed);
      return served.b! > served.a!;
    }).length;

    expect(betterWon).toBeGreaterThanOrEqual(7);
  });
});

describe('cross-campaign fairness', () => {
  it('does not give a campaign a bigger share of the slot for uploading more creatives', () => {
    // Every advertiser pays the same flat CPM, so a campaign must not be able to
    // buy a larger share of a slot by adding image variants. cmp2 brings three
    // creatives against cmp1's one; the split between CAMPAIGNS must stay even.
    const one = makeCreative({ creativeId: 'a', campaignId: 'cmp1' });
    const two = makeCreative({ creativeId: 'b1', campaignId: 'cmp2' });
    const three = makeCreative({ creativeId: 'b2', campaignId: 'cmp2' });
    const four = makeCreative({ creativeId: 'b3', campaignId: 'cmp2' });

    const rng = mulberry32(3);
    const slot = makeSlot([one, two, three, four]);
    let cmp1 = 0;
    for (let i = 0; i < 2000; i++) {
      if (selectCreative(slot, { ...CTX, rng })!.campaignId === 'cmp1') cmp1++;
    }

    // Even split is 1000. A naive flat weighted-random over the four creatives
    // would land near 500 (1 of 4) instead.
    expect(cmp1).toBeGreaterThan(900);
    expect(cmp1).toBeLessThan(1100);
  });

  it('caps a visitor per CAMPAIGN, so extra variants cannot multiply daily exposure', () => {
    // The frequency cap used to be counted per CREATIVE. That was equivalent
    // while a campaign could only ever place one creative in a slot. Now that a
    // campaign contributes every variant, a per-creative cap would let a
    // three-variant advertiser show one visitor 9 ads a day against a
    // single-variant competitor's 3 — at the same flat CPM, and getting steadily
    // more of that visitor's later impressions as the competitors cap out.
    const variants = ['v1', 'v2', 'v3'].map((id) =>
      makeCreative({ creativeId: id, campaignId: 'cmp1', frequencyCapPerDay: 3 }),
    );
    const slot = makeSlot(variants);

    const atCap = selectCreative(slot, {
      country: 'IS',
      consent: 'full',
      visitorImpressionsToday: { cmp1: 3 },
      rng: mulberry32(31),
    });
    expect(atCap).toBeNull();

    const underCap = selectCreative(slot, {
      country: 'IS',
      consent: 'full',
      visitorImpressionsToday: { cmp1: 2 },
      rng: mulberry32(31),
    });
    expect(underCap).not.toBeNull();
  });

  it('keeps CTR from moving impressions between campaigns', () => {
    // cmp2's creative has a spectacular CTR, cmp1's has none. The bandit runs
    // inside a campaign only, so this must NOT shift the campaign-level split.
    const poor = makeCreative({ creativeId: 'a', campaignId: 'cmp1', ctr: { imp: 5000, clk: 0 } });
    const great = makeCreative({
      creativeId: 'b',
      campaignId: 'cmp2',
      ctr: { imp: 5000, clk: 2500 },
    });

    const rng = mulberry32(11);
    const slot = makeSlot([poor, great]);
    let cmp1 = 0;
    for (let i = 0; i < 2000; i++) {
      if (selectCreative(slot, { ...CTX, rng })!.campaignId === 'cmp1') cmp1++;
    }

    expect(cmp1).toBeGreaterThan(900);
    expect(cmp1).toBeLessThan(1100);
  });
});

describe('bandit fail-safe', () => {
  it('falls back to an even rotation when no CTR data is cached at all', () => {
    // push-cache omits `ctr` when Redis is unreachable or unconfigured. Selection
    // must degrade to the pre-bandit behaviour rather than throw or freeze on one
    // creative.
    const a = makeCreative({ creativeId: 'a', campaignId: 'cmp1' });
    const b = makeCreative({ creativeId: 'b', campaignId: 'cmp1' });
    expect(a.ctr).toBeUndefined();

    const rng = mulberry32(5);
    const slot = makeSlot([a, b]);
    const served: Record<string, number> = { a: 0, b: 0 };
    for (let i = 0; i < 1000; i++) {
      served[selectCreative(slot, { ...CTX, rng })!.creativeId]!++;
    }

    expect(served.a!).toBeGreaterThan(400);
    expect(served.b!).toBeGreaterThan(400);
  });

  it('ignores a variant whose cached counters are corrupt rather than dividing by zero', () => {
    // A clk-without-imp hash (possible if a click landed before the impression
    // pixel fired) must not produce Infinity and win every draw forever.
    const sane = makeCreative({ creativeId: 'a', campaignId: 'cmp1', ctr: { imp: 500, clk: 50 } });
    const broken = makeCreative({ creativeId: 'b', campaignId: 'cmp1', ctr: { imp: 0, clk: 9 } });

    const rng = mulberry32(9);
    const slot = makeSlot([sane, broken]);
    const served: Record<string, number> = { a: 0, b: 0 };
    for (let i = 0; i < 500; i++) {
      served[selectCreative(slot, { ...CTX, rng })!.creativeId]!++;
    }

    // 'b' is cold (0 impressions), so this is the cold-start branch: even split,
    // and critically NOT a 100% sweep for 'b' on an Infinity CTR.
    expect(served.b!).toBeLessThan(350);
  });

  it('returns the only creative when a campaign has just one', () => {
    const only = makeCreative({ creativeId: 'a', campaignId: 'cmp1', ctr: { imp: 1, clk: 0 } });
    const got = selectCreative(makeSlot([only]), { ...CTX, rng: mulberry32(2) });
    expect(got?.creativeId).toBe('a');
  });
});

describe('bandit respects the existing eligibility rules', () => {
  it('never picks a filtered-out variant even when it has the best CTR', () => {
    const winner = makeCreative({
      creativeId: 'a',
      campaignId: 'cmp1',
      ctr: { imp: 5000, clk: 4000 },
      budgetExhausted: true,
    });
    const loser = makeCreative({
      creativeId: 'b',
      campaignId: 'cmp1',
      ctr: { imp: 5000, clk: 1 },
    });

    const rng = mulberry32(4);
    const slot = makeSlot([winner, loser]);
    for (let i = 0; i < 200; i++) {
      expect(selectCreative(slot, { ...CTX, rng })!.creativeId).toBe('b');
    }
  });

  it('keeps slot_purchased ahead of a higher-CTR cpm creative', () => {
    const cpm = makeCreative({
      creativeId: 'a',
      campaignId: 'cmp1',
      priority: 'cpm',
      ctr: { imp: 5000, clk: 4000 },
    });
    const purchased = makeCreative({
      creativeId: 'b',
      campaignId: 'cmp2',
      priority: 'slot_purchased',
      ctr: { imp: 5000, clk: 1 },
    });

    const rng = mulberry32(6);
    const slot = makeSlot([cpm, purchased]);
    for (let i = 0; i < 200; i++) {
      expect(selectCreative(slot, { ...CTX, rng })!.creativeId).toBe('b');
    }
  });
});
