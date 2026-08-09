import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EVENT_QUEUE_ACCRUAL } from '@ada/shared';

const MIN = 60_000;

// In-memory Redis shim: covers everything checkCronHeartbeats touches
// (heartbeat mget/set, alert dedupe nx-set, and the new queue-depth
// llen/get/set) without a real Redis connection.
let mockStore: Map<string, string | number>;
// Named with the "mock" prefix so Vitest allows referencing it inside the
// hoisted vi.mock factory below (same convention as accrual.test.ts).
let mockRedisDown = false;

vi.mock('../src/lib/redis', () => ({
  isRedisConfigured: () => true,
  getRedis: () => ({
    mget: vi.fn(async (...keys: string[]) => keys.map((k) => mockStore.get(k) ?? null)),
    set: vi.fn(async (key: string, value: unknown, opts?: { nx?: boolean; ex?: number }) => {
      if (opts?.nx && mockStore.has(key)) return null; // simulate NX no-op
      mockStore.set(key, value as string | number);
      return 'OK';
    }),
    get: vi.fn(async (key: string) => mockStore.get(key) ?? null),
    llen: vi.fn(async (key: string) => {
      if (mockRedisDown) throw new Error('redis unavailable');
      return Number(mockStore.get(key) ?? 0);
    }),
  }),
}));

// Captures every alert that would have gone out by email, so tests can
// assert on subject/message without touching Resend or Firestore.
const sentEmails: Array<{ subject: string; message: string }> = [];
vi.mock('../src/services/mail', () => ({
  sendOpsAlertEmail: vi.fn(async (_to: string[], subject: string, message: string) => {
    sentEmails.push({ subject, message });
  }),
}));

vi.mock('../src/services/notifications', () => ({
  createNotification: vi.fn(async () => {}),
}));

import {
  staleCrons,
  CRON_STALENESS_MINUTES,
  checkCronHeartbeats,
} from '../src/services/ops-alerts';

/** Seed a queue-depth reading the way the real llen('events:accrual') would report it. */
function setQueueDepth(key: string, depth: number) {
  mockStore.set(key, depth);
}

function sentAlerts() {
  return sentEmails;
}

beforeEach(() => {
  mockStore = new Map();
  mockRedisDown = false;
  sentEmails.length = 0;
  process.env.OPS_ALERT_EMAILS = 'ops@example.com';
});

describe('staleCrons', () => {
  const now = 1_800_000_000_000;

  it('flags a cron whose heartbeat is older than its threshold', () => {
    const result = staleCrons(now, {
      'cron-accrue': now - 46 * MIN, // threshold 45
      'cron-refresh-cache': now - 5 * MIN,
      'cron-payouts': now - 24 * 60 * MIN,
    });
    expect(result.map((s) => s.name)).toEqual(['cron-accrue']);
    expect(result[0]?.ageMinutes).toBe(46);
  });

  it('returns nothing when every heartbeat is fresh', () => {
    const result = staleCrons(now, {
      'cron-accrue': now - 10 * MIN,
      'cron-refresh-cache': now - 9 * MIN,
      'cron-payouts': now - 2 * 24 * 60 * MIN,
    });
    expect(result).toEqual([]);
  });

  it('treats a missing heartbeat as bootstrap, not stale', () => {
    // First deploy: no keys exist yet — must not alert-storm.
    const result = staleCrons(now, {
      'cron-accrue': null,
      'cron-refresh-cache': null,
      'cron-payouts': null,
    });
    expect(result).toEqual([]);
  });

  it('flags a payouts heartbeat older than a month + grace', () => {
    const threshold = CRON_STALENESS_MINUTES['cron-payouts']!;
    const result = staleCrons(now, {
      'cron-payouts': now - (threshold + 1) * MIN,
    });
    expect(result.map((s) => s.name)).toEqual(['cron-payouts']);
  });
});

describe('checkCronHeartbeats — accrual queue depth', () => {
  it('alerts when the accrual queue grows across consecutive checks', async () => {
    setQueueDepth(EVENT_QUEUE_ACCRUAL, 800);
    await checkCronHeartbeats(); // records 800, no alert (no baseline yet)
    setQueueDepth(EVENT_QUEUE_ACCRUAL, 1600);
    await checkCronHeartbeats();
    expect(sentAlerts().some((a) => a.subject.includes('Innheimtu-biðröð'))).toBe(true);
  });

  it('does not alert when the queue shrinks or holds', async () => {
    // shrinks
    setQueueDepth(EVENT_QUEUE_ACCRUAL, 900);
    await checkCronHeartbeats(); // records 900, no alert (no baseline yet)
    setQueueDepth(EVENT_QUEUE_ACCRUAL, 600);
    await checkCronHeartbeats(); // 600 < 900: shrink
    expect(sentAlerts()).toHaveLength(0);

    // holds flat at 600 — still above the 500 alert floor, so this pins a
    // strict `depth > prev` comparison: a regression to `depth >= prev`
    // would incorrectly fire here since depth === prev.
    setQueueDepth(EVENT_QUEUE_ACCRUAL, 600);
    await checkCronHeartbeats();
    expect(sentAlerts()).toHaveLength(0);
  });

  it('does not alert on the very first check (no baseline recorded yet)', async () => {
    setQueueDepth(EVENT_QUEUE_ACCRUAL, 10_000); // huge, but nothing to compare against
    await checkCronHeartbeats();
    expect(sentAlerts()).toHaveLength(0);
  });

  it('ignores growth below the alert threshold', async () => {
    setQueueDepth(EVENT_QUEUE_ACCRUAL, 100);
    await checkCronHeartbeats();
    setQueueDepth(EVENT_QUEUE_ACCRUAL, 400); // grew, but still under 500
    await checkCronHeartbeats();
    expect(sentAlerts()).toHaveLength(0);
  });

  it('does not alert twice in a row for the same sustained growth (dedupe)', async () => {
    setQueueDepth(EVENT_QUEUE_ACCRUAL, 800);
    await checkCronHeartbeats();
    setQueueDepth(EVENT_QUEUE_ACCRUAL, 1600);
    await checkCronHeartbeats(); // first alert
    setQueueDepth(EVENT_QUEUE_ACCRUAL, 2400);
    await checkCronHeartbeats(); // still growing, but deduped within the window
    expect(sentAlerts().filter((a) => a.subject.includes('Innheimtu-biðröð'))).toHaveLength(1);
  });

  it('does not alert on queue growth when cron-accrue itself is stale (already covered by the staleness alert)', async () => {
    const staleTs = Date.now() - (CRON_STALENESS_MINUTES['cron-accrue']! + 5) * MIN;
    mockStore.set('heartbeat:cron-accrue', staleTs);
    setQueueDepth(EVENT_QUEUE_ACCRUAL, 800);
    await checkCronHeartbeats();
    setQueueDepth(EVENT_QUEUE_ACCRUAL, 1600);
    await checkCronHeartbeats();
    expect(sentAlerts().some((a) => a.subject.includes('Innheimtu-biðröð'))).toBe(false);
  });

  it('does not alert when Redis is unavailable for the depth read', async () => {
    setQueueDepth(EVENT_QUEUE_ACCRUAL, 800);
    await checkCronHeartbeats();
    setQueueDepth(EVENT_QUEUE_ACCRUAL, 1600);
    mockRedisDown = true;
    await checkCronHeartbeats();
    expect(sentAlerts().some((a) => a.subject.includes('Innheimtu-biðröð'))).toBe(false);
  });
});
