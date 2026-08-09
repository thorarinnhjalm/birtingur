import { test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Dashboard from './Dashboard';
import { apiFetch } from '@/lib/api';

// Mocked without `importActual`, same reasoning as CampaignDetail.test.tsx /
// CampaignCreate.test.tsx: the real module chain pulls in '@/lib/firebase',
// which eagerly initializes the Firebase SDK and hangs indefinitely in a
// network-less test sandbox. Dashboard's default export (via usePublishers/
// usePublisherSlots and the stats query) only ever calls `apiFetch`, so
// that's mocked directly.
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

// Dashboard's default export wraps its content in AppShell, whose TopBar
// reads useAuth() from '@/lib/auth-context' — that module imports
// '@/lib/firebase' too, so it's mocked directly for the same reason as above.
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ user: null, admin: false, loading: false, signOut: vi.fn() }),
}));

const mockedApiFetch = vi.mocked(apiFetch);

// The hero earnings card renders a Recharts <ResponsiveContainer> sparkline
// unconditionally (unlike the bottom-of-page AnalyticsChart, it isn't gated
// on history.length > 0), which needs ResizeObserver — jsdom doesn't
// implement it, and an uncaught ReferenceError in that mount effect crashes
// the whole tree (no error boundary), leaving an empty container. Not part
// of this feature; stubbed so the page under test can mount at all.
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', MockResizeObserver);

// Redefined locally rather than imported from SiteSwitcher.test.tsx, per the
// brief — keeps this test file self-contained.
const TWO_SITES = [
  { id: 'pub_a', displayName: 'Vefur A', domain: 'vefur-a.is' },
  { id: 'pub_b', displayName: 'Vefur B', domain: 'vefur-b.is' },
];

// Single-site owner, for the Vefumferð stat-card tests below — a single-site
// owner never gets a `bySite` breakdown, so this exercises the plain
// stats.pageViewsTrue path without the per-site table getting in the way.
const ONE_SITE = [{ id: 'pub_a', displayName: 'Vefur A', domain: 'vefur-a.is' }];

const BASE_STATS = {
  impressions: 100,
  clicks: 5,
  spendIsk: 0,
  pageviews: 0,
  history: [],
};

const BY_SITE_STATS = {
  impressions: 1500,
  clicks: 15,
  spendIsk: 825,
  pageviews: 3000,
  history: [],
  bySite: [
    {
      publisherId: 'pub_a',
      displayName: 'Vefur A',
      domain: 'vefur-a.is',
      impressions: 1000,
      clicks: 10,
      pageviews: 2000,
      spendIsk: 550,
    },
    {
      publisherId: 'pub_b',
      displayName: 'Vefur B',
      domain: 'vefur-b.is',
      impressions: 500,
      clicks: 5,
      pageviews: 1000,
      spendIsk: 275,
    },
  ],
};

function setupApiMock({
  publishers = ONE_SITE,
  slots = [],
  stats,
}: {
  publishers?: unknown[];
  slots?: unknown[];
  stats: unknown;
}) {
  mockedApiFetch.mockImplementation(async (url: unknown) => {
    const u = url as string;
    if (u.startsWith('/v1/publishers/all')) return publishers as any;
    if (u.startsWith('/v1/publishers/me/slots')) return slots as any;
    if (u.startsWith('/v1/publishers/stats')) return stats as any;
    // TopBar (rendered by AppShell) polls notifications regardless of which
    // publisher page is under test — not part of this feature, so it's
    // stubbed to an empty list rather than asserted on.
    if (u.startsWith('/v1/notifications')) return [] as any;
    throw new Error(`Unhandled apiFetch call in test: ${u}`);
  });
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/']}>
        <Dashboard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockedApiFetch.mockReset();
  // The site-filter test below sets siteId via a row click, which persists
  // through useSiteFilter's sessionStorage backing — without clearing it
  // here, that write leaks into whichever test runs next and makes the
  // per-site-table assertions order-dependent.
  sessionStorage.clear();
});

test('shows the per-site overview table when viewing all sites', async () => {
  setupApiMock({ publishers: TWO_SITES, slots: [], stats: BY_SITE_STATS });
  renderPage();
  expect(await screen.findByText('Vefur A')).toBeDefined();
  expect(screen.getByText('Vefur B')).toBeDefined();
});

test('clicking a site row narrows the filter', async () => {
  setupApiMock({ publishers: TWO_SITES, slots: [], stats: BY_SITE_STATS });
  renderPage();
  fireEvent.click(await screen.findByText('Vefur B'));
  await vi.waitFor(() => {
    expect(mockedApiFetch).toHaveBeenCalledWith(expect.stringContaining('publisherId=pub_b'));
  });
});

test('Vefumferð shows the true page-view figure when present', async () => {
  setupApiMock({ stats: { ...BASE_STATS, pageviews: 9000, pageViewsTrue: 3000 } });
  renderPage();
  expect(await screen.findByText('3.000')).toBeDefined();
  expect(screen.queryByText('9.000')).toBeNull(); // slot loads are NOT the traffic figure
});

test('Vefumferð shows an em dash and an explanation for pre-switch history', async () => {
  setupApiMock({ stats: { ...BASE_STATS, pageviews: 9000 } }); // no pageViewsTrue
  renderPage();
  expect(await screen.findByText('—')).toBeDefined();
  expect(screen.getByText(/Nákvæm umferðarmæling hófst/)).toBeDefined();
});
