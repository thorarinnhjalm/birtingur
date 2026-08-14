import { test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
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

// BY_SITE_STATS carries a third, traffic-less site (see its comment); the
// publisher list has to match or the table renders rows the owner does not own.
const THREE_SITES = [...TWO_SITES, { id: 'pub_c', displayName: 'Vefur C', domain: 'vefur-c.is' }];

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

/**
 * The two sites are deliberately given DIFFERENT figures in every column.
 *
 * They used to be proportional (both 50% fill, both 1,00% CTR, both 440 kr
 * eCPM), which reads fine until you notice such a fixture cannot fail if the
 * table renders one site's numbers on the other site's row, or if a column is
 * wired to the wrong field. `pageViewsTrue` is present on one site and absent
 * on the other for the same reason — both branches of the traffic column get
 * exercised in one render.
 *
 * Derived values the per-site table computes from these (see the assertions
 * below, and DEFAULT_PLATFORM_FEE_PERCENT = 20 for the net figures):
 *
 *   Vefur A  fill 1600/2000 = 80%   CTR 10/1000 = 1,00%   net 440 kr   eCPM 440 kr
 *   Vefur B  fill  900/1100 = 82%   CTR 45/900  = 5,00%   net 800 kr   eCPM 889 kr
 *   Vefur C  everything zero, and no measured split — the guards
 *
 * Fill is (requests - unfilled) / requests. It is NOT impressions / requests:
 * impressions are viewability-gated, so that ratio blended "no advertiser" with
 * "never scrolled into view". Vefur C carries no `unfilled` at all, which is how
 * every day before 2026-08-14 looks — its fill must render as unmeasured rather
 * than as 0%.
 *
 * Vefur B's fill rate is deliberately NOT a round number: 900/1100 is 81,8, so
 * Math.round gives 82 and Math.floor would give 81. With both sites landing on
 * exact tens the rounding was unpinned and swapping round for floor passed.
 *
 * Vefur C exists because every division in the table is guarded and none of
 * those guards was covered: a brand-new site with no traffic yet would render
 * NaN%, (NaN%) and NaN kr eCPM to a publisher on their first visit, and the
 * suite would stay green.
 *
 * `pageViewsTrue` sits at the top level too, at the sum of the sites that have
 * it. publisher-stats.ts sets the top-level figure whenever ANY site measured
 * one, so a fixture with it per-site but absent at the top is a response the
 * API cannot produce — and it silently pushed the page's own Vefumferð card
 * into its "measurement hasn't started" state.
 */
const BY_SITE_STATS = {
  impressions: 1900,
  clicks: 55,
  spendIsk: 1550,
  pageviews: 3100,
  pageViewsTrue: 1800,
  unfilled: 600,
  history: [],
  bySite: [
    {
      publisherId: 'pub_a',
      displayName: 'Vefur A',
      domain: 'vefur-a.is',
      impressions: 1000,
      clicks: 10,
      pageviews: 2000,
      pageViewsTrue: 1800,
      unfilled: 400,
      spendIsk: 550,
    },
    {
      publisherId: 'pub_b',
      displayName: 'Vefur B',
      domain: 'vefur-b.is',
      impressions: 900,
      clicks: 45,
      pageviews: 1100,
      unfilled: 200,
      spendIsk: 1000,
    },
    {
      publisherId: 'pub_c',
      displayName: 'Vefur C',
      domain: 'vefur-c.is',
      impressions: 0,
      clicks: 0,
      pageviews: 0,
      spendIsk: 0,
    },
  ],
};

/** The `<tr>` a given site's figures live in, so column assertions cannot
 * accidentally match a number rendered elsewhere on the page. */
function siteRow(displayName: string) {
  const row = screen.getByText(displayName).closest('tr');
  if (!row) throw new Error(`no table row found for ${displayName}`);
  return row;
}

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
  setupApiMock({ publishers: THREE_SITES, slots: [], stats: BY_SITE_STATS });
  renderPage();
  expect(await screen.findByText('Vefur A')).toBeDefined();
  expect(screen.getByText('Vefur B')).toBeDefined();
});

test('clicking a site row narrows the filter', async () => {
  setupApiMock({ publishers: THREE_SITES, slots: [], stats: BY_SITE_STATS });
  renderPage();
  fireEvent.click(await screen.findByText('Vefur B'));
  await vi.waitFor(() => {
    expect(mockedApiFetch).toHaveBeenCalledWith(expect.stringContaining('publisherId=pub_b'));
  });
});

// The per-site table's fill rate, CTR and eCPM columns shipped with no test of
// their own. Each is a small arithmetic expression inside the render, so a
// wrong field, a swapped numerator or a dropped platform-fee factor would show
// a plausible-looking wrong number to a publisher and nothing would catch it.

test('fill is filled requests over all requests, not impressions over anything', async () => {
  // Three candidate denominators sit on the same object and only one is right.
  // Vefur A: 2000 requests, 400 of them unfilled, 1000 impressions, 1800 real
  // page views. 80% is (2000-400)/2000. 50% would be impressions/requests — the
  // ratio this used to compute, which blended "no advertiser bought your
  // categories" with "the ad loaded but nobody scrolled to it", two problems
  // with opposite owners. 56% would be impressions/pageViewsTrue.
  setupApiMock({ publishers: THREE_SITES, slots: [], stats: BY_SITE_STATS });
  renderPage();
  await screen.findByText('Vefur A');

  expect(within(siteRow('Vefur A')).getByText('80%')).toBeDefined();
  // 900/1100 is 81,8 — pins Math.round rather than Math.floor.
  expect(within(siteRow('Vefur B')).getByText('82%')).toBeDefined();
});

test('fill reads as unmeasured, not 0%, when the split was never counted', async () => {
  // Every day before 2026-08-14 looks like Vefur C. Rendering 0% would tell the
  // publisher we checked every request and found no advertiser for any of them,
  // when in fact we never counted.
  setupApiMock({ publishers: THREE_SITES, slots: [], stats: BY_SITE_STATS });
  renderPage();
  await screen.findByText('Vefur A');

  const fillCell = siteRow('Vefur C').querySelectorAll('td')[3]!;
  expect(fillCell.textContent).toBe('—');
});

test('a site with no traffic yet shows zeroes, never NaN', async () => {
  // Every figure in this table is a division. A publisher who has just added a
  // site and had no impressions yet is the first person to hit all the guards
  // at once, and NaN% in their revenue table would be their first impression of
  // the product.
  setupApiMock({ publishers: THREE_SITES, slots: [], stats: BY_SITE_STATS });
  renderPage();
  await screen.findByText('Vefur A');

  const rowC = siteRow('Vefur C');
  expect(rowC.textContent).not.toContain('NaN');
  expect(rowC.textContent).not.toContain('Infinity');
  expect(within(rowC).getByText('(0,00%)')).toBeDefined();
  // formatIsk emits "0 kr" with no trailing period; the eCPM fallback used to
  // hardcode "0 kr." and disagree with the revenue figure beside it.
  expect(within(rowC).getByText('0 kr eCPM')).toBeDefined();
});

test('per-site CTR is clicks over impressions, in Icelandic decimal notation', async () => {
  setupApiMock({ publishers: THREE_SITES, slots: [], stats: BY_SITE_STATS });
  renderPage();
  await screen.findByText('Vefur A');

  expect(within(siteRow('Vefur A')).getByText('(1,00%)')).toBeDefined();
  expect(within(siteRow('Vefur B')).getByText('(5,00%)')).toBeDefined();
});

test('per-site eCPM is net of the platform fee, matching the revenue beside it', async () => {
  // Publishers keep 80%. An eCPM computed off gross spend would read 550 and
  // 1.111 here and would not reconcile with the revenue figure in the same
  // cell, which is the number they get paid.
  setupApiMock({ publishers: THREE_SITES, slots: [], stats: BY_SITE_STATS });
  renderPage();
  await screen.findByText('Vefur A');

  const rowA = within(siteRow('Vefur A'));
  expect(rowA.getByText('440 kr')).toBeDefined(); // net revenue
  expect(rowA.getByText('440 kr eCPM')).toBeDefined();

  const rowB = within(siteRow('Vefur B'));
  expect(rowB.getByText('800 kr')).toBeDefined();
  expect(rowB.getByText('889 kr eCPM')).toBeDefined();
});

test('the traffic column shows real page views per site, or a dash when unmeasured', async () => {
  // Vefur A has pageViewsTrue, Vefur B does not. Showing B's 1000 slot loads as
  // if they were traffic is the overcount the whole pageViewsTrue split exists
  // to prevent, so the dash matters as much as the number.
  setupApiMock({ publishers: THREE_SITES, slots: [], stats: BY_SITE_STATS });
  renderPage();
  await screen.findByText('Vefur A');

  expect(within(siteRow('Vefur A')).getByText('1.800')).toBeDefined();
  // Scoped per cell: the fill cell also dashes when the split is unmeasured, so
  // a bare getByText('—') would be ambiguous.
  const cellsB = siteRow('Vefur B').querySelectorAll('td');
  expect(cellsB[1]!.textContent).toBe('—'); // traffic: never measured for this site
  // Its 1.100 ad requests DO appear, in the requests column where they belong.
  // Conflating the two is the overcount this split exists to prevent, so the
  // point is that the number is present and correctly labelled, not absent.
  expect(cellsB[2]!.textContent).toBe('1.100');
});

test('the traffic chain shows real page views, never the ad-request count', async () => {
  // The chain's first step is page loads. Showing 9.000 ad requests there is the
  // overcount the pageViewsTrue split exists to prevent — a site with three ad
  // slots would look like it had three times its real traffic.
  setupApiMock({ stats: { ...BASE_STATS, pageviews: 9000, pageViewsTrue: 3000 } });
  renderPage();
  expect(await screen.findByText('3.000')).toBeDefined();
  expect(screen.getByText('Síðuflettingar')).toBeDefined();
});

test('the traffic chain says when accurate measurement had not started yet', async () => {
  setupApiMock({ stats: { ...BASE_STATS, pageviews: 9000 } }); // no pageViewsTrue
  renderPage();
  expect(await screen.findByText(/Nákvæm mæling hófst/)).toBeDefined();
  // 9.000 ad requests are still shown — as requests, under their own label.
  expect(screen.getByText('Auglýsingabeiðnir')).toBeDefined();
});

// usePublishers() runs with `retry: false`, so one cold function or one
// expired token used to satisfy `!publishers` and route an established
// publisher into the onboarding wizard — the app telling them the sites they
// own do not exist, with no error shown anywhere.
test('a failed publishers request shows an error instead of routing to onboarding', async () => {
  mockedApiFetch.mockImplementation(async (url: unknown) => {
    const u = url as string;
    if (u.startsWith('/v1/publishers/all')) throw new Error('simulated failure');
    if (u.startsWith('/v1/notifications')) return [] as any;
    throw new Error(`Unhandled apiFetch call in test: ${u}`);
  });
  renderPage();

  expect(await screen.findByText('Villa kom upp')).toBeDefined();
  expect(screen.getByText(/Ekki tókst að sækja vefina þína/)).toBeDefined();
  // The onboarding wizard must not have been rendered in its place.
  expect(screen.queryByText(/Skráðu vefinn þinn/)).toBeNull();
});

test('an empty publishers list still routes to onboarding', async () => {
  setupApiMock({ publishers: [], slots: [], stats: BASE_STATS });
  renderPage();

  // No error state for a genuinely new user — the onboarding route takes over.
  await new Promise((r) => setTimeout(r, 0));
  expect(screen.queryByText('Villa kom upp')).toBeNull();
});
