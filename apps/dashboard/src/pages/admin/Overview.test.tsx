import { test, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminOverview from './Overview';
import { apiFetch } from '@/lib/api';

// Mocked without `importActual`, same reasoning as Dashboard.test.tsx: the real
// module chain pulls in '@/lib/firebase', which eagerly initializes the
// Firebase SDK and hangs indefinitely in a network-less test sandbox. The
// admin overview's data needs (stats, diagnostics, waitlist stats,
// notifications) all go through `apiFetch`, so that's mocked directly.
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

// AppShell's TopBar reads useAuth() from '@/lib/auth-context', which also
// imports '@/lib/firebase' — mocked for the same reason as above.
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ user: null, admin: true, loading: false, signOut: vi.fn() }),
}));

const mockedApiFetch = vi.mocked(apiFetch);

const BASE_ADMIN_STATS = {
  totalImpressions: 1000,
  totalClicks: 50,
  totalRevenueIsk: 100000,
  platformFeeIsk: 20000,
  p95LatencyMs: 24,
  systemStatus: 'OK',
  topCreatives: [],
  fallbackStats: [],
  publishersCount: 2,
  advertisersCount: 3,
  slotsCount: 5,
  campaignsCount: 4,
};

function setupApiMock({ botTraffic }: { botTraffic: unknown }) {
  mockedApiFetch.mockImplementation(async (url: unknown) => {
    const u = url as string;
    if (u.startsWith('/v1/admin/stats')) {
      return { ...BASE_ADMIN_STATS, botTraffic } as any;
    }
    if (u.startsWith('/v1/admin/diagnostics')) return {} as any;
    if (u.startsWith('/v1/admin/waitlist/stats')) {
      return { total: 0, roles: { advertisers: 0, publishers: 0, both: 0 }, categories: {} } as any;
    }
    if (u.startsWith('/v1/notifications')) return [] as any;
    throw new Error(`Unhandled apiFetch call in test: ${u}`);
  });
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/']}>
        <AdminOverview />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockedApiFetch.mockReset();
});

test('renders the bot-traffic share as percentages with absolute counts when botTraffic is present', async () => {
  // Every count (and therefore every percentage) is distinct, on purpose —
  // both within a column and across the two columns — so a `getByText`
  // assertion can never accidentally match more than one row.
  setupApiMock({
    botTraffic: {
      windowDays: 7,
      impressions: { human: 60, known_bot: 15, suspected_bot: 20, unclassified: 5 }, // /100
      pageViews: { human: 40, known_bot: 10, suspected_bot: 38, unclassified: 12 }, // /100
    },
  });
  renderPage();

  // Scoped to the "billed impressions" column so an assertion here can't be
  // satisfied by a coincidental match in the page-views column.
  const impressionsHeading = await screen.findByText('Innheimtanlegar birtingar (CPM)');
  const impressionsSection = impressionsHeading.closest('div') as HTMLDivElement;

  // impressions total = 100 → human share = 60/100 = 60.0%
  expect(within(impressionsSection).getByText(/60,0%/)).toBeDefined();
  // the absolute count must sit beside the percentage, not replace it
  expect(within(impressionsSection).getByText(/\(60\)/)).toBeDefined();
  // the unclassified remainder must be visibly shown, never hidden
  expect(within(impressionsSection).getByText(/Óflokkað/i)).toBeDefined();
  // the measurement-only disclaimer must be present so a reader can't infer filtering
  expect(
    screen.getByText(/Mæling eingöngu — engum birtingum er sleppt og ekkert er ófrádregið\./),
  ).toBeDefined();
});

test('shows an explanatory line instead of numbers when botTraffic is null', async () => {
  setupApiMock({ botTraffic: null });
  renderPage();

  // findByText retries until the stats query resolves, so this also proves
  // the explanatory line isn't just the transient loading state — the
  // second test below confirms none of the class labels or "%" leak in.
  expect(await screen.findByText(/Engin/i)).toBeDefined();
  expect(screen.queryByText(/Óflokkað/i)).toBeNull();
  expect(screen.queryByText(/%/)).toBeNull();
});
