import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkGenerationRateLimit } from '../src/lib/rate-limit';

const mockIncr = vi.fn();
const mockExpire = vi.fn();
let mockConfigured = true;

vi.mock('../src/lib/redis', () => ({
  isRedisConfigured: () => mockConfigured,
  getRedis: () => ({ incr: mockIncr, expire: mockExpire }),
}));

describe('checkGenerationRateLimit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConfigured = true;
  });

  it('skips limiting entirely when Redis is not configured (matches CLAUDE.md test-env behavior)', async () => {
    mockConfigured = false;
    const result = await checkGenerationRateLimit('gen-copy', 'adv_1');
    expect(result.allowed).toBe(true);
    expect(mockIncr).not.toHaveBeenCalled();
  });

  it('allows requests under the daily limit and sets an expiry on the first call', async () => {
    mockIncr.mockResolvedValueOnce(1);
    const result = await checkGenerationRateLimit('gen-render', 'adv_1');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
    expect(mockExpire).toHaveBeenCalledWith(
      expect.stringContaining('ratelimit:gen-render:adv_1:'),
      expect.any(Number),
    );
  });

  it('blocks once the gen-render daily limit (10) is exceeded', async () => {
    mockIncr.mockResolvedValueOnce(11);
    const result = await checkGenerationRateLimit('gen-render', 'adv_1');
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('blocks once the gen-copy daily limit (20) is exceeded', async () => {
    mockIncr.mockResolvedValueOnce(21);
    const result = await checkGenerationRateLimit('gen-copy', 'adv_1');
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('allows a gen-copy call at count 20 (right at the limit)', async () => {
    mockIncr.mockResolvedValueOnce(20);
    const result = await checkGenerationRateLimit('gen-copy', 'adv_1');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it("fails CLOSED (refuses) when Redis errors, the opposite of serving's fail-open policy", async () => {
    mockIncr.mockRejectedValueOnce(new Error('redis down'));
    const result = await checkGenerationRateLimit('gen-render', 'adv_1');
    expect(result.allowed).toBe(false);
  });

  it('keeps gen-copy and gen-render as independent buckets (different Redis keys)', async () => {
    mockIncr.mockResolvedValueOnce(1);
    await checkGenerationRateLimit('gen-copy', 'adv_1');
    expect(mockIncr).toHaveBeenCalledWith(expect.stringContaining('ratelimit:gen-copy:adv_1:'));

    mockIncr.mockResolvedValueOnce(1);
    await checkGenerationRateLimit('gen-render', 'adv_1');
    expect(mockIncr).toHaveBeenCalledWith(expect.stringContaining('ratelimit:gen-render:adv_1:'));
  });
});
