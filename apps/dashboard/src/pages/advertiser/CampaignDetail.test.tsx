import { test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CampaignDetail from './CampaignDetail';
import { apiFetch } from '@/lib/api';

// Mocked without `importActual`, same reasoning as CampaignCreate.test.tsx /
// CreativeGenerator.test.tsx: the real module chain pulls in '@/lib/firebase',
// which eagerly initializes the Firebase SDK and hangs indefinitely in a
// network-less test sandbox. CampaignDetail (via useCampaigns' hooks and its
// own widget-key effect) only ever calls `apiFetch`, so that's mocked
// directly.
vi.mock('@/lib/api', () => {
  class MockApiError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message: string) {
      super(message);
      this.status = status;
      this.code = code;
      this.name = 'ApiError';
    }
  }
  return { apiFetch: vi.fn(), ApiError: MockApiError };
});

vi.mock('react-router-dom', () => ({
  useParams: () => ({ id: 'cmp_1' }),
  useNavigate: () => vi.fn(),
}));

const mockedApiFetch = vi.mocked(apiFetch);

const STATS_RESPONSE = { impressions: 0, clicks: 0, hours: [] };

function campaignFixture(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'cmp_1',
    advertiserId: 'adv_1',
    name: 'Sumarherferð',
    creativeIds: ['crt_1'],
    targeting: { categories: ['matur'], geoRegions: [] },
    schedule: { startsAt: '2026-01-01T00:00:00.000Z', endsAt: '2026-02-01T00:00:00.000Z' },
    budget: { mode: 'cpm_capped', totalIsk: 100_000, remainingIsk: 50_000 },
    status: 'completed',
    ...overrides,
  };
}

function setupApiMock(campaign: ReturnType<typeof campaignFixture>) {
  mockedApiFetch.mockImplementation(async (url: unknown) => {
    const u = url as string;
    if (u === '/v1/campaigns/cmp_1') return campaign as any;
    if (u.startsWith('/v1/campaigns/cmp_1/stats')) return STATS_RESPONSE as any;
    if (u === '/v1/campaigns/cmp_1/widget-key') return { key: 'wk_test' } as any;
    if (u === '/v1/creatives') return [] as any;
    if (u.startsWith('/v1/creatives/stats')) return {} as any;
    throw new Error(`Unhandled apiFetch call in test: ${u}`);
  });
}

function renderWithClient() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <CampaignDetail />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockedApiFetch.mockReset();
});

// The completed-campaign button block used to always render "Ræsa herferð"
// (Task 3 brief: "remove the broken reactivate button on completed
// campaigns") — reactivating a completed campaign without going through the
// committed-funds reservation gate would let it resume serving without ever
// re-checking wallet balance. These two cases pin the replacement logic.
test('completed campaign with remaining budget shows "Framlengja herferð", not "Ræsa herferð"', async () => {
  setupApiMock(
    campaignFixture({ status: 'completed', budget: { totalIsk: 100_000, remainingIsk: 50_000 } }),
  );
  renderWithClient();

  expect(await screen.findByText('Framlengja herferð')).toBeDefined();
  expect(screen.queryByText('Ræsa herferð')).toBeNull();
});

test('completed campaign with no remaining budget shows the explanation, no reactivate/extend button', async () => {
  setupApiMock(
    campaignFixture({ status: 'completed', budget: { totalIsk: 100_000, remainingIsk: 0 } }),
  );
  renderWithClient();

  expect(await screen.findByText('Herferðin kláraði fjárhæðina — lokið.')).toBeDefined();
  expect(screen.queryByText('Framlengja herferð')).toBeNull();
  expect(screen.queryByText('Ræsa herferð')).toBeNull();
});
