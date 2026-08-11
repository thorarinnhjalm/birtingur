import { describe, it, expect, vi, beforeEach } from 'vitest';
import type * as redisModule from '../src/lib/redis';

const mockLlen = vi.fn();
const mockMget = vi.fn();
const mockLindex = vi.fn();
let redisConfigured = true;

vi.mock('../src/lib/redis', async (importOriginal) => {
  const actual = await importOriginal<typeof redisModule>();
  return {
    ...actual,
    isRedisConfigured: () => redisConfigured,
    getRedis: () => ({ llen: mockLlen, mget: mockMget, lindex: mockLindex }),
  };
});

import { collectOpsDiagnostics } from '../src/services/ops-diagnostics';

const MIN = 60_000;

/** Fresh heartbeats for every cron, well inside their staleness thresholds. */
function healthyHeartbeats(now: number) {
  return [
    now - 5 * MIN, // cron-accrue (45 min threshold)
    now - 30 * MIN, // cron-aggregate (130)
    now - 5 * MIN, // cron-refresh-cache (30)
    now - 24 * 60 * MIN, // cron-payouts (33 days)
    now - 60 * MIN, // cron-reconcile (26 h)
  ];
}

function setQueues({ stats = 0, accrual = 0, legacy = 0 }) {
  mockLlen.mockImplementation(async (key: string) => {
    if (key === 'events:stats') return stats;
    if (key === 'events:accrual') return accrual;
    if (key === 'events:queue') return legacy;
    return 0;
  });
}

describe('collectOpsDiagnostics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisConfigured = true;
    process.env.CRON_SECRET = 'x';
    process.env.FIREBASE_PRIVATE_KEY = 'x';
    setQueues({});
    mockMget.mockResolvedValue(healthyHeartbeats(Date.now()));
    mockLindex.mockResolvedValue(null);
  });

  it('reports healthy when every cron is fresh and the queues are drained', async () => {
    const d = await collectOpsDiagnostics();

    expect(d.healthy).toBe(true);
    expect(d.problems).toEqual([]);
    expect(d.crons.every((c) => !c.stale)).toBe(true);
  });

  // The signal the admin page was missing: a queue can look calm while
  // nothing is draining it, and only the heartbeat reveals that.
  it('flags a cron that has stopped running', async () => {
    const now = Date.now();
    const hb = healthyHeartbeats(now);
    hb[0] = now - 120 * MIN; // cron-accrue, threshold 45
    mockMget.mockResolvedValue(hb);

    const d = await collectOpsDiagnostics();

    expect(d.healthy).toBe(false);
    expect(d.crons.find((c) => c.name === 'cron-accrue')?.stale).toBe(true);
    expect(d.problems.join(' ')).toContain('cron-accrue');
  });

  // A fresh deploy has written no heartbeats yet. That is bootstrap state,
  // not a dead cron, and must not read as a fault.
  it('treats a never-recorded heartbeat as unknown rather than stale', async () => {
    mockMget.mockResolvedValue([null, null, null, null, null]);

    const d = await collectOpsDiagnostics();

    expect(d.crons.every((c) => c.ageMinutes === null)).toBe(true);
    expect(d.crons.every((c) => !c.stale)).toBe(true);
    expect(d.problems).toEqual([]);
  });

  it('flags an accrual backlog but tolerates ordinary traffic in the queue', async () => {
    setQueues({ accrual: 40 });
    expect((await collectOpsDiagnostics()).healthy).toBe(true);

    setQueues({ accrual: 900 });
    const d = await collectOpsDiagnostics();
    expect(d.healthy).toBe(false);
    expect(d.problems.join(' ')).toContain('events:accrual');
  });

  it('flags the drained legacy queue coming back to life', async () => {
    setQueues({ legacy: 3 });

    const d = await collectOpsDiagnostics();

    expect(d.healthy).toBe(false);
    expect(d.problems.join(' ')).toContain('events:queue');
  });

  it('reports the age of the oldest queued event, not the newest', async () => {
    const now = Date.now();
    setQueues({ stats: 2 });
    // lindex(-1) is the tail = oldest, since events are pushed with lpush.
    mockLindex.mockResolvedValue(JSON.stringify({ ts: now - 10 * MIN }));

    const d = await collectOpsDiagnostics();

    expect(mockLindex).toHaveBeenCalledWith('events:stats', -1);
    if (d.redis.status !== 'ok') throw new Error('expected ok');
    expect(d.redis.oldestStatsEventAgeSeconds).toBeGreaterThanOrEqual(595);
    expect(d.redis.oldestStatsEventAgeSeconds).toBeLessThanOrEqual(605);
  });

  it('survives a malformed queue entry instead of failing the whole check', async () => {
    setQueues({ stats: 1 });
    mockLindex.mockResolvedValue('not json at all');

    const d = await collectOpsDiagnostics();

    if (d.redis.status !== 'ok') throw new Error('expected ok');
    expect(d.redis.oldestStatsEventAgeSeconds).toBeNull();
    expect(d.healthy).toBe(true);
  });

  it('reports a Redis outage as a problem without throwing', async () => {
    mockLlen.mockRejectedValue(new Error('connection refused'));

    const d = await collectOpsDiagnostics();

    expect(d.redis.status).toBe('error');
    expect(d.healthy).toBe(false);
    expect(d.problems.join(' ')).toContain('Redis');
  });

  it('reports unconfigured Redis distinctly from a Redis failure', async () => {
    redisConfigured = false;

    const d = await collectOpsDiagnostics();

    expect(d.redis.status).toBe('unconfigured');
    expect(d.healthy).toBe(false);
    expect(mockLlen).not.toHaveBeenCalled();
  });

  it('reports only presence of secrets, never their values', async () => {
    process.env.CRON_SECRET = 'super-secret-value';

    const d = await collectOpsDiagnostics();

    expect(d.env.CRON_SECRET).toBe(true);
    expect(JSON.stringify(d)).not.toContain('super-secret-value');
  });

  it('flags a missing required secret', async () => {
    delete process.env.FIREBASE_PRIVATE_KEY;

    const d = await collectOpsDiagnostics();

    expect(d.healthy).toBe(false);
    expect(d.problems.join(' ')).toContain('FIREBASE_PRIVATE_KEY');
  });

  // SIGNING_SECRET lives in apps/serving's environment, not the API's, so it is
  // absent from the report whether or not it happens to be set here. Reporting
  // it made the admin ops card permanently red with a problem no API-side
  // change could fix.
  it('does not report SIGNING_SECRET, which belongs to another deploy', async () => {
    process.env.SIGNING_SECRET = 'set-in-this-process-but-irrelevant';

    const d = await collectOpsDiagnostics();

    expect(Object.keys(d.env)).not.toContain('SIGNING_SECRET');
    expect(d.problems.join(' ')).not.toContain('SIGNING_SECRET');
  });
});
