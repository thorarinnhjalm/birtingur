import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  EVENT_QUEUE_STATS,
  EVENT_QUEUE_ACCRUAL,
  ctrCounterKey,
  CTR_COUNTER_TTL_SECONDS,
} from '@ada/shared';

type PipelineCommand = [string, ...unknown[]];

// Tracks calls made directly on the redis client (i.e. NOT through pipeline()) —
// logEvent must never issue one of these; everything goes through the pipeline.
const directLpush = vi.fn(async () => 1);

let pipelineCalls = 0;
let allCommands: PipelineCommand[] = [];
let pendingPipelineError: Error | null = null;

function makePipelineFake() {
  pipelineCalls += 1;
  const queued: PipelineCommand[] = [];
  const fake = {
    lpush: (...args: unknown[]) => {
      queued.push(['lpush', ...args]);
      return fake;
    },
    incr: (...args: unknown[]) => {
      queued.push(['incr', ...args]);
      return fake;
    },
    hincrby: (...args: unknown[]) => {
      queued.push(['hincrby', ...args]);
      return fake;
    },
    expire: (...args: unknown[]) => {
      queued.push(['expire', ...args]);
      return fake;
    },
    exec: async () => {
      if (pendingPipelineError) {
        const err = pendingPipelineError;
        pendingPipelineError = null;
        throw err;
      }
      allCommands.push(...queued);
      return queued.map(() => 1);
    },
  };
  return fake;
}

vi.mock('../src/lib/redis', () => ({
  getRedis: () => ({
    lpush: directLpush,
    pipeline: () => makePipelineFake(),
  }),
}));

import { logEvent, emittedCounterKey } from '../src/lib/analytics';
import type { AdEvent } from '../src/lib/analytics';

function ev(type: AdEvent['type']): AdEvent {
  return {
    type,
    slotId: 'slot_a',
    publisherId: 'pub_a',
    creativeId: 'cre_a',
    campaignId: type === 'pageview' ? 'cmp_fallback' : 'cmp_a',
    advertiserId: '',
    country: 'XX',
    visitorToken: 'tok',
    ts: 1,
    // These fan-out/pipelining tests don't exercise classification at all —
    // the value is irrelevant to what's under test here, so a fixed 'human'
    // just satisfies the now-required field.
    botClass: 'human',
  };
}

function impressionEvent(): AdEvent {
  return ev('impression');
}

function pipelineCallCount(): number {
  return pipelineCalls;
}

function directRoundTrips(): number {
  return directLpush.mock.calls.length;
}

function pipelinedCommands(): PipelineCommand[] {
  return allCommands;
}

function failNextPipeline(err: Error) {
  pendingPipelineError = err;
}

beforeEach(() => {
  directLpush.mockClear();
  pipelineCalls = 0;
  allCommands = [];
  pendingPipelineError = null;
});

describe('logEvent queue fan-out', () => {
  it('pushes a pageview to the stats queue but NOT the accrual queue', async () => {
    await logEvent(ev('pageview'));
    const queues = pipelinedCommands()
      .filter(([cmd]) => cmd === 'lpush')
      .map(([, key]) => key);
    expect(queues).toContain(EVENT_QUEUE_STATS);
    expect(queues).not.toContain(EVENT_QUEUE_ACCRUAL);
  });

  it('pushes an impression to BOTH the stats and accrual queues', async () => {
    await logEvent(ev('impression'));
    const queues = pipelinedCommands()
      .filter(([cmd]) => cmd === 'lpush')
      .map(([, key]) => key);
    expect(queues).toContain(EVENT_QUEUE_STATS);
    expect(queues).toContain(EVENT_QUEUE_ACCRUAL);
  });

  it('pushes a click only to the stats queue (accrual bills impressions only)', async () => {
    await logEvent(ev('click'));
    const queues = pipelinedCommands()
      .filter(([cmd]) => cmd === 'lpush')
      .map(([, key]) => key);
    expect(queues).toContain(EVENT_QUEUE_STATS);
    expect(queues).not.toContain(EVENT_QUEUE_ACCRUAL);
  });
});

describe('logEvent durability and pipelining', () => {
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
});

describe('CTR counters feeding the creative bandit', () => {
  function ctrCommands(): PipelineCommand[] {
    return pipelinedCommands().filter(([cmd]) => cmd === 'hincrby');
  }

  it('counts an impression against the creative, in the SAME pipeline', async () => {
    await logEvent(impressionEvent());
    expect(ctrCommands()).toEqual([['hincrby', ctrCounterKey('cmp_a', 'cre_a'), 'imp', 1]]);
    // The whole point of riding the existing pipeline: the bandit's counters
    // must not cost the ad hot path an extra Upstash round trip.
    expect(pipelineCallCount()).toBe(1);
    expect(directRoundTrips()).toBe(0);
  });

  it('counts a click against the creative', async () => {
    await logEvent({ ...impressionEvent(), type: 'click' });
    expect(ctrCommands()).toEqual([['hincrby', ctrCounterKey('cmp_a', 'cre_a'), 'clk', 1]]);
  });

  it('refreshes the 30-day window on every counted event', async () => {
    await logEvent(impressionEvent());
    expect(pipelinedCommands()).toEqual(
      expect.arrayContaining([
        ['expire', ctrCounterKey('cmp_a', 'cre_a'), CTR_COUNTER_TTL_SECONDS],
      ]),
    );
  });

  it('does not count a slot load — a pageview is not an impression', async () => {
    // 'pageview' is the wire type for slot loads too (see AdEvent.type). Counting
    // those as impressions would put the bandit's denominator on ads that were
    // served but never actually seen, deflating every variant's CTR unevenly.
    await logEvent({ ...impressionEvent(), type: 'pageview' });
    expect(ctrCommands()).toEqual([]);
  });

  it('does not let bot traffic steer the rotation', async () => {
    for (const botClass of ['known_bot', 'suspected_bot'] as const) {
      allCommands = [];
      await logEvent({ ...impressionEvent(), botClass });
      expect(ctrCommands()).toEqual([]);
    }
  });

  it('still queues bot events for stats even though they do not count toward CTR', async () => {
    // Excluding bots from the bandit must not quietly drop them from the stats
    // pipeline — traffic measurement needs them.
    await logEvent({ ...impressionEvent(), botClass: 'known_bot' });
    const queues = pipelinedCommands()
      .filter(([cmd]) => cmd === 'lpush')
      .map(([, key]) => key);
    expect(queues).toContain(EVENT_QUEUE_STATS);
  });

  it('does not count house ads and other fallbacks — they are not a variant test', async () => {
    await logEvent({
      ...impressionEvent(),
      campaignId: 'cmp_fallback',
      creativeId: 'cre_fallback_birtingur',
    });
    expect(ctrCommands()).toEqual([]);
  });
});
