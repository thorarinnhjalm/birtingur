/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { fetchAd } from '../src/api';

const okResponse = () =>
  ({
    ok: true,
    json: async () => ({ creativeId: 'cre_a' }),
  }) as Response;

beforeEach(() => {
  process.env.SERVE_BASE = 'https://serving.birtingur.app';
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchAd query string', () => {
  it('includes the visitor id when one is provided', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse());
    await fetchAd('slot_1', 'full', 'abc123456789');
    const url = fetchMock.mock.calls[0]![0] as string;
    expect(url).toContain('slot=slot_1');
    expect(url).toContain('vid=abc123456789');
  });

  it('omits the vid param when no visitor id is provided', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse());
    await fetchAd('slot_1', 'none', null);
    const url = fetchMock.mock.calls[0]![0] as string;
    expect(url).not.toContain('vid=');
  });
});
