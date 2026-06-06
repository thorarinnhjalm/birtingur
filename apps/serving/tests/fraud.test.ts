import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isClickDeduplicated, checkAndIncrementRateLimit } from '../src/lib/fraud.js';
import { setRedis } from '../src/lib/redis.js';
import type { Redis } from '@upstash/redis';

describe('Fraud Prevention Logic', () => {
  let mockRedisStore: Record<string, string | number>;
  let mockSeenKeys: Set<string>;
  let expireCalls: Record<string, number>;

  const mockRedisClient = {
    set: vi.fn(async (key: string, val: string, options?: { nx?: boolean; ex?: number }) => {
      if (options?.nx) {
        if (mockSeenKeys.has(key)) {
          return null;
        }
        mockSeenKeys.add(key);
        return 'OK';
      }
      mockRedisStore[key] = val;
      return 'OK';
    }),
    incr: vi.fn(async (key: string) => {
      const current = Number(mockRedisStore[key] ?? 0);
      const next = current + 1;
      mockRedisStore[key] = next;
      return next;
    }),
    expire: vi.fn(async (key: string, seconds: number) => {
      expireCalls[key] = seconds;
      return 1;
    }),
  } as unknown as Redis;

  beforeEach(() => {
    mockRedisStore = {};
    mockSeenKeys = new Set();
    expireCalls = {};
    vi.clearAllMocks();
    setRedis(mockRedisClient);
  });

  describe('isClickDeduplicated', () => {
    it('returns false for fresh click and sets the lock key', async () => {
      const duplicate = await isClickDeduplicated('cre1', '1.2.3.4');
      expect(duplicate).toBe(false);
      expect(mockRedisClient.set).toHaveBeenCalledWith('click_dedup:cre1:1.2.3.4', '1', {
        nx: true,
        ex: 30,
      });
    });

    it('returns true if the click lock key already exists', async () => {
      mockSeenKeys.add('click_dedup:cre1:1.2.3.4');
      const duplicate = await isClickDeduplicated('cre1', '1.2.3.4');
      expect(duplicate).toBe(true);
    });

    it('fails open on Redis error', async () => {
      vi.spyOn(mockRedisClient, 'set').mockRejectedValueOnce(new Error('Redis Down'));
      const duplicate = await isClickDeduplicated('cre1', '1.2.3.4');
      expect(duplicate).toBe(false);
    });
  });

  describe('checkAndIncrementRateLimit', () => {
    const getHourKey = () => new Date().toISOString().slice(0, 13).replace(/[-T]/g, '');

    it('returns true for impressions under the threshold of 30', async () => {
      mockRedisStore[`rate_limit:impression:cmp1:1.2.3.4:${getHourKey()}`] = 29;
      const allowed = await checkAndIncrementRateLimit('cmp1', '1.2.3.4', 'impression');
      expect(allowed).toBe(true);
      expect(mockRedisClient.incr).toHaveBeenCalled();
      expect(mockRedisClient.expire).not.toHaveBeenCalled(); // count became 30, not 1
    });

    it('returns false for impressions over the threshold of 30', async () => {
      mockRedisStore[`rate_limit:impression:cmp1:1.2.3.4:${getHourKey()}`] = 30;
      const allowed = await checkAndIncrementRateLimit('cmp1', '1.2.3.4', 'impression');
      expect(allowed).toBe(false);
    });

    it('returns true for clicks under the threshold of 3', async () => {
      mockRedisStore[`rate_limit:click:cmp1:1.2.3.4:${getHourKey()}`] = 2;
      const allowed = await checkAndIncrementRateLimit('cmp1', '1.2.3.4', 'click');
      expect(allowed).toBe(true);
    });

    it('returns false for clicks over the threshold of 3', async () => {
      mockRedisStore[`rate_limit:click:cmp1:1.2.3.4:${getHourKey()}`] = 3;
      const allowed = await checkAndIncrementRateLimit('cmp1', '1.2.3.4', 'click');
      expect(allowed).toBe(false);
    });

    it('sets a 1-hour expiration on the first increment key creation', async () => {
      const allowed = await checkAndIncrementRateLimit('cmp1', '1.2.3.4', 'click');
      expect(allowed).toBe(true);
      expect(mockRedisClient.incr).toHaveBeenCalled();
      const expectedKeyPrefix = 'rate_limit:click:cmp1:1.2.3.4:';
      const expireKey = Object.keys(expireCalls).find((k) => k.startsWith(expectedKeyPrefix));
      expect(expireKey).toBeDefined();
      expect(expireCalls[expireKey!]).toBe(3600);
    });

    it('fails open on Redis error', async () => {
      vi.spyOn(mockRedisClient, 'incr').mockRejectedValueOnce(new Error('Redis Down'));
      const allowed = await checkAndIncrementRateLimit('cmp1', '1.2.3.4', 'click');
      expect(allowed).toBe(true);
    });
  });
});
