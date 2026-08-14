/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

// Smoke tests for the embeddable web components — the last package in the
// monorepo with zero tests, embedded on EXTERNAL pages where a failure is
// invisible to us (the same day these were written, the production bundle
// turned out to be calling http://localhost:3001 on every visitor's machine;
// scripts/check-host.mjs guards the built artifact, these guard the runtime
// behaviour the artifact is built from).
//
// process.env.API_BASE is read at module import time, so it is stubbed before
// the dynamic import below and every URL assertion pins that the components
// actually derive their fetch target from it.

const API = 'https://api.test.birtingur.app';

const fetchMock = vi.fn();

function lastFetch(): { url: string; init: RequestInit } {
  const call = fetchMock.mock.calls.at(-1);
  if (!call) throw new Error('expected a fetch to have happened');
  return { url: String(call[0]), init: (call[1] ?? {}) as RequestInit };
}

/** Waits until the component's async fetch/render cycle settles. */
async function flush() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

beforeAll(async () => {
  process.env.API_BASE = API;
  vi.stubGlobal('fetch', fetchMock);
  await import('../src/index.js');
});

beforeEach(() => {
  fetchMock.mockReset();
  document.body.innerHTML = '';
});

describe('component registration', () => {
  it('defines all three custom elements exactly once', () => {
    expect(customElements.get('adplatform-stats')).toBeDefined();
    expect(customElements.get('adplatform-approval-queue')).toBeDefined();
    expect(customElements.get('adplatform-campaign-stats')).toBeDefined();
  });
});

describe('<adplatform-stats>', () => {
  it('renders an error and fetches nothing when no key is given', async () => {
    const el = document.createElement('adplatform-stats');
    document.body.appendChild(el);
    await flush();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(el.shadowRoot!.innerHTML).toContain('publisher-key');
  });

  it('fetches publisher stats from API_BASE with the key as a Bearer token', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        impressions: 12345,
        clicks: 67,
        spendIsk: 8900,
        fillRate: 0.9,
        history: [],
      }),
    });

    const el = document.createElement('adplatform-stats');
    el.setAttribute('publisher-key', 'wk_test_123');
    document.body.appendChild(el);
    await flush();

    const { url, init } = lastFetch();
    expect(url).toBe(`${API}/v1/widgets/publisher/stats?timeframe=30`);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer wk_test_123');
    // The rendered numbers come from the response, Icelandic-formatted.
    expect(el.shadowRoot!.innerHTML).toContain('12.345');
  });

  /**
   * This component runs on the PUBLISHER's own site, where we never see what it
   * shows. It rendered the gross `spendIsk` under "Áætlaðar tekjur" and derived
   * eCPM from the same gross, so a publisher comparing it to their dashboard
   * saw two different figures for the same money — 25% apart, with the public
   * one being the flattering lie.
   */
  it('shows net earnings and a net eCPM, not the gross figures', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        impressions: 10_000,
        clicks: 20,
        spendIsk: 5500,
        netEarningsIsk: 4400,
        history: [],
      }),
    });

    const el = document.createElement('adplatform-stats');
    el.setAttribute('publisher-key', 'wk_test_123');
    document.body.appendChild(el);
    await flush();

    const html = el.shadowRoot!.innerHTML;
    expect(html).toContain('4.400');
    expect(html).not.toContain('5.500');
    // eCPM off the net figure: 4.400 / 10.000 * 1000 = 440, not 550.
    expect(html).toContain('440');
    expect(html).not.toContain('550');
  });

  it('renders the error state when the API answers non-ok', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401 });

    const el = document.createElement('adplatform-stats');
    el.setAttribute('publisher-key', 'wk_revoked');
    document.body.appendChild(el);
    await flush();

    expect(el.shadowRoot!.innerHTML).toContain('Ekki tókst að sækja tölfræði');
  });
});

describe('<adplatform-approval-queue>', () => {
  it('fetches pending approvals from API_BASE with the key', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ campaigns: [] }) });

    const el = document.createElement('adplatform-approval-queue');
    el.setAttribute('publisher-key', 'wk_test_123');
    document.body.appendChild(el);
    await flush();

    const { url, init } = lastFetch();
    expect(url).toBe(`${API}/v1/widgets/publisher/pending-approvals`);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer wk_test_123');
  });

  it('renders an error and fetches nothing without a key', async () => {
    const el = document.createElement('adplatform-approval-queue');
    document.body.appendChild(el);
    await flush();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('<adplatform-campaign-stats>', () => {
  it('fetches campaign stats from API_BASE with the key', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ impressions: 1, clicks: 0, spendIsk: 0, history: [] }),
    });

    const el = document.createElement('adplatform-campaign-stats');
    el.setAttribute('campaign-id', 'cmp_1');
    el.setAttribute('viewer-key', 'wk_view_123');
    document.body.appendChild(el);
    await flush();

    const { url, init } = lastFetch();
    expect(url).toBe(`${API}/v1/widgets/campaign/stats`);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer wk_view_123');
  });

  // This component recomputes CTR from raw clicks and impressions rather than
  // reading the `ctr` the API already returns, and the API clamps its own at
  // 100 (routes/campaigns.ts). Left unclamped, the same campaign reads 140%
  // here and 100% in the dashboard — on a page the advertiser embedded on
  // their own site, where we never see the discrepancy.
  //
  // Clicks legitimately outrun impressions: the impression pixel only fires
  // after the ad has been at least half visible for a continuous second, while
  // the ad is clickable from the moment it renders, so an ad that never clears
  // that threshold can still be clicked (and tracking protection blocks the
  // pixel image without blocking the link).
  it('stops CTR at 100%, matching every other surface that shows it', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      // The response is unwrapped as `data.stats` (campaign-stats.ts:75), not
      // read at the top level — a flat fixture leaves this.stats undefined and
      // the component renders its "no data" card while the test still passes.
      json: async () => ({ stats: { impressions: 5, clicks: 7, spendIsk: 0, hours: [] } }),
    });

    const el = document.createElement('adplatform-campaign-stats');
    el.setAttribute('campaign-id', 'cmp_1');
    el.setAttribute('viewer-key', 'wk_view_123');
    document.body.appendChild(el);
    await flush();

    const html = el.shadowRoot!.innerHTML;
    expect(html).toContain('100.00%');
    expect(html).not.toContain('140.00%');
  });

  it('still shows a real rate below the clamp', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ stats: { impressions: 200, clicks: 5, spendIsk: 0, hours: [] } }),
    });

    const el = document.createElement('adplatform-campaign-stats');
    el.setAttribute('campaign-id', 'cmp_1');
    el.setAttribute('viewer-key', 'wk_view_123');
    document.body.appendChild(el);
    await flush();

    expect(el.shadowRoot!.innerHTML).toContain('2.50%');
  });
});
