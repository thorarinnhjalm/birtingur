import { test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
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

// Thin helpers for tests that need a custom stats response (e.g. the
// per-creative breakdown) without duplicating the mock wiring above.
function setupApiMockWithStats(campaign: ReturnType<typeof campaignFixture>, stats: unknown) {
  mockedApiFetch.mockImplementation(async (url: unknown) => {
    const u = url as string;
    if (u === '/v1/campaigns/cmp_1') return campaign as any;
    if (u.startsWith('/v1/campaigns/cmp_1/stats')) return stats as any;
    if (u === '/v1/campaigns/cmp_1/widget-key') return { key: 'wk_test' } as any;
    if (u === '/v1/creatives') return [] as any;
    if (u.startsWith('/v1/creatives/stats')) return {} as any;
    throw new Error(`Unhandled apiFetch call in test: ${u}`);
  });
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

const STATS_WITH_CREATIVES = {
  impressions: 100,
  clicks: 10,
  spendIsk: 55,
  hours: [],
  byPublisher: {
    pub_a: {
      impressions: 100,
      clicks: 10,
      spendIsk: 55,
      displayName: 'Pizzadeig',
      domain: 'pizzadeig.is',
      byCreative: {
        cre_1: {
          impressions: 60,
          clicks: 8,
          label: '300×250',
          imageUrl: 'https://cdn.example/1.png',
        },
        cre_2: {
          impressions: 40,
          clicks: 2,
          label: '728×90',
          imageUrl: 'https://cdn.example/2.png',
        },
      },
    },
    pub_b: {
      impressions: 20,
      clicks: 1,
      spendIsk: 11,
      displayName: 'Bíladella',
      domain: 'biladella.is',
      byCreative: {
        cre_1: {
          impressions: 20,
          clicks: 1,
          label: '300×250',
          imageUrl: 'https://cdn.example/1.png',
        },
      },
    },
  },
};

test('expands a publisher row to creative sub-rows', async () => {
  setupApiMockWithStats(campaignFixture(), STATS_WITH_CREATIVES);
  renderWithClient();
  const toggle = await screen.findByRole('button', {
    name: 'Sundurliðun eftir auglýsingu: Pizzadeig',
  });
  expect(screen.queryByText('728×90')).toBeNull();
  fireEvent.click(toggle);
  expect(screen.getByText('300×250')).toBeDefined();
  expect(screen.getByText('728×90')).toBeDefined();
});

test('publisher with a single creative gets no expand toggle', async () => {
  setupApiMockWithStats(campaignFixture(), STATS_WITH_CREATIVES);
  renderWithClient();
  await screen.findByText('Pizzadeig');
  expect(
    screen.queryByRole('button', { name: 'Sundurliðun eftir auglýsingu: Bíladella' }),
  ).toBeNull();
});

const STATS_WITH_UNATTRIBUTED = {
  ...STATS_WITH_CREATIVES,
  byPublisher: {
    ...STATS_WITH_CREATIVES.byPublisher,
    pub_a: {
      ...STATS_WITH_CREATIVES.byPublisher.pub_a,
      byCreative: {
        ...STATS_WITH_CREATIVES.byPublisher.pub_a.byCreative,
        // Deliberately the largest impression count of the three, to prove the
        // unattributed row sorts last on identity, not on its numbers.
        __unattributed: {
          impressions: 999,
          clicks: 5,
          label: 'Eldri gögn (fyrir sundurliðun)',
          imageUrl: null,
        },
      },
    },
  },
};

test('unattributed remainder row renders muted/italic and sorts last regardless of impressions', async () => {
  setupApiMockWithStats(campaignFixture(), STATS_WITH_UNATTRIBUTED);
  const { container } = renderWithClient();
  const toggle = await screen.findByRole('button', {
    name: 'Sundurliðun eftir auglýsingu: Pizzadeig',
  });
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(toggle);
  expect(toggle.getAttribute('aria-expanded')).toBe('true');

  const legacyLabel = screen.getByText('Eldri gögn (fyrir sundurliðun)');
  expect(legacyLabel.className).toContain('text-slate-400');
  expect(legacyLabel.className).toContain('italic');

  // "Frammistaða eftir birtingavettvangi" is the second table on the page (the
  // first is the empty per-creative table, since advertiserCreatives is []).
  const tables = container.querySelectorAll('table');
  const siteTable = tables[1]!;
  const rowTexts = within(siteTable)
    .getAllByRole('row')
    .map((r) => r.textContent || '');
  const legacyRowIndex = rowTexts.findIndex((t) => t.includes('Eldri gögn'));
  const cre1RowIndex = rowTexts.findIndex((t) => t.includes('300×250'));
  const cre2RowIndex = rowTexts.findIndex((t) => t.includes('728×90'));
  expect(legacyRowIndex).toBeGreaterThan(-1);
  expect(cre1RowIndex).toBeGreaterThan(-1);
  expect(cre2RowIndex).toBeGreaterThan(-1);
  expect(legacyRowIndex).toBeGreaterThan(cre1RowIndex);
  expect(legacyRowIndex).toBeGreaterThan(cre2RowIndex);
});
