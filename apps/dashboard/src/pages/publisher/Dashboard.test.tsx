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
  // All three deliberately smaller than the whole-window figures they pair with
  // (pageviews 3.100, impressions 1.900) — the measured window is shorter than
  // the selected one, which is the real state of the data and the only fixture
  // shape in which reverting a denominator actually fails.
  requestsWithFillData: 1300,
  impressionsWithFillData: 600,
  requestsWithTrafficData: 900,
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
      // Deliberately NOT equal to this site's 2.000 pageviews: with the two the
      // same, reverting the column to `site.pageviews` passed. Fill here is
      // (800 - 400) / 800 = 50%, against 80% on the whole-window figure.
      requestsWithFillData: 800,
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
      // Same reasoning: (500 - 200) / 500 = 60%, not 82%.
      requestsWithFillData: 500,
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
  balance = { unpaidBasisIsk: 0, minPayoutIsk: 10_000 },
}: {
  publishers?: unknown[];
  slots?: unknown[];
  stats: unknown;
  balance?: unknown;
}) {
  mockedApiFetch.mockImplementation(async (url: unknown) => {
    const u = url as string;
    if (u.startsWith('/v1/publishers/all')) return publishers as any;
    if (u.startsWith('/v1/publishers/me/balance')) return balance as any;
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

test('fill is filled over the days that measured it, not over the whole window', async () => {
  // Four candidate denominators sit on the same object and only one is right.
  // Vefur A: 2.000 requests in the window, but only 800 of them on days that
  // measured `unfilled`, of which 400 found no advertiser.
  //
  //   50% = (800-400)/800        — correct: same days on both sides
  //   80% = (2000-400)/2000      — the window mismatch this change removes
  //   50% = impressions/requests — the older ratio, right here by coincidence,
  //                                which is why Vefur B carries the real check
  //   56% = impressions/pageViewsTrue
  setupApiMock({ publishers: THREE_SITES, slots: [], stats: BY_SITE_STATS });
  renderPage();
  await screen.findByText('Vefur A');

  expect(within(siteRow('Vefur A')).getByText('50%')).toBeDefined();
  // Vefur B: (500-200)/500 = 60%. The whole-window figure would be 82%, and
  // impressions/requests would be 82% too — so this row separates all three.
  expect(within(siteRow('Vefur B')).getByText('60%')).toBeDefined();
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

/**
 * Clicks are not viewability-gated; impressions are. The impression pixel fires
 * only once the ad has been at least half visible for a continuous second
 * (packages/snippet/src/render.ts), while the ad is clickable from the moment
 * it renders. An ad that never clears that threshold — half below the fold, or
 * scrolled straight past — can still be clicked with no impression behind it,
 * and tracking protection blocks the pixel image without blocking the link.
 * Serving's own rate limits are asymmetric too (30 impressions/hr against 3
 * clicks/hr per campaign+IP), and a click stays valid for 24h where an
 * impression pixel expires after 1h, so the two can land in different days.
 *
 * Both numbers are legitimate; only the ratio is nonsense to show. Every other
 * surface in the product already stops it at 100 (this page's own two cards,
 * SlotDetail, CampaignDetail, AnalyticsChart, and the API's routes/advertisers,
 * routes/campaigns and services/creative-stats). The per-site table, the CSV
 * export and the embeddable campaign-stats widget were the three that did not,
 * so the same publisher could read 140% in one place and 100% in another for
 * the same site and window.
 *
 * 7 clicks on 5 impressions. Vefur B is left ordinary so the clamp cannot be
 * faked by a component that clamps everything to 100.
 */
const CTR_OVERFLOW_STATS = {
  impressions: 105,
  clicks: 12,
  spendIsk: 0,
  pageviews: 200,
  history: [],
  bySite: [
    {
      publisherId: 'pub_a',
      displayName: 'Vefur A',
      domain: 'vefur-a.is',
      impressions: 5,
      clicks: 7,
      pageviews: 100,
      spendIsk: 0,
    },
    {
      publisherId: 'pub_b',
      displayName: 'Vefur B',
      domain: 'vefur-b.is',
      impressions: 100,
      clicks: 5,
      pageviews: 100,
      spendIsk: 0,
    },
  ],
};

test('per-site CTR stops at 100%, because a click can outrun its own impression', async () => {
  setupApiMock({ publishers: TWO_SITES, slots: [], stats: CTR_OVERFLOW_STATS });
  renderPage();
  await screen.findByText('Vefur A');

  expect(within(siteRow('Vefur A')).getByText('(100,00%)')).toBeDefined();
  expect(siteRow('Vefur A').textContent).not.toContain('140,00%');
  // Not a blanket clamp: a normal site still shows its real rate.
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

/**
 * The CSV is the fourth surface that computes these ratios, and it is the one
 * nobody looks at until a publisher opens it in Excel next to the dashboard.
 * It disagreed with the on-screen table once already, over the meaning of
 * "Fyllihlutfall", which is why its numbers are pinned here rather than trusted
 * to match by inspection.
 *
 * The download is captured at the Blob rather than at the anchor: jsdom
 * implements neither URL.createObjectURL nor real navigation, and the file's
 * contents are what the assertion is about.
 */
function captureCsvDownload(): { read: () => string; restore: () => void } {
  let captured = '';
  const RealBlob = window.Blob;
  const realClick = window.HTMLAnchorElement.prototype.click;
  const realCreate = window.URL.createObjectURL;
  const realRevoke = window.URL.revokeObjectURL;
  const hadClick = Object.hasOwn(window.HTMLAnchorElement.prototype, 'click');
  const hadCreate = Object.hasOwn(window.URL, 'createObjectURL');
  const hadRevoke = Object.hasOwn(window.URL, 'revokeObjectURL');

  (window as any).Blob = class extends RealBlob {
    constructor(...args: ConstructorParameters<typeof RealBlob>) {
      super(...args);
      captured = (args[0] ?? []).join('');
    }
  };
  // jsdom implements neither of these, and the handler appends a real <a> and
  // clicks it — left alone that logs a "navigation not implemented" error.
  (window.URL as any).createObjectURL = () => 'blob:mock';
  (window.URL as any).revokeObjectURL = () => {};
  window.HTMLAnchorElement.prototype.click = () => {};

  // Restored by hand rather than through vi.unstubAllGlobals(): the
  // ResizeObserver stub at the top of this file is a global stub too, and
  // unstubbing everything would take it down with these.
  return {
    read: () => captured,
    restore: () => {
      (window as any).Blob = RealBlob;
      // jsdom has neither of these and inherits click() from HTMLElement, so
      // assigning the saved value back would leave a NEW own property behind
      // holding `undefined`. That breaks `'createObjectURL' in window.URL`
      // feature detection, and an own click() on the anchor prototype would
      // shadow any later stub placed on HTMLElement.prototype.
      restoreOrDelete(window.URL, 'createObjectURL', hadCreate, realCreate);
      restoreOrDelete(window.URL, 'revokeObjectURL', hadRevoke, realRevoke);
      restoreOrDelete(window.HTMLAnchorElement.prototype, 'click', hadClick, realClick);
    },
  };
}

function restoreOrDelete(target: object, key: string, wasOwn: boolean, original: unknown): void {
  if (wasOwn) {
    (target as Record<string, unknown>)[key] = original;
  } else {
    delete (target as Record<string, unknown>)[key];
  }
}

const CSV_SLOTS = [
  {
    id: 'slot_fast',
    publisherId: 'pub_a',
    name: 'Efst á forsíðu',
    sizes: [{ width: 300, height: 250 }],
    status: 'active',
    // Every slot is pinned to the flat CPM on write (createSlot/updateSlot);
    // the slot table reads pricing.mode unguarded, so a fixture without it
    // crashes the page rather than failing an assertion.
    pricing: { mode: 'cpm', cpmIsk: 550 },
    // 7 clicks on 5 impressions — the same click-outruns-impression case as the
    // per-site table test above.
    // requestsWithFillData is deliberately NOT pageviews: the measured window is
    // shorter than the selected one, which is the real shape of this data and
    // the only one in which reverting the denominator fails. Fill is
    // (40-20)/40 = 50%, where the whole-window figure would read 80%.
    stats: {
      impressions: 5,
      clicks: 7,
      pageviews: 100,
      unfilled: 20,
      requestsWithFillData: 40,
      spendIsk: 1000,
    },
  },
  {
    id: 'slot_normal',
    publisherId: 'pub_a',
    name: 'Í miðri grein',
    sizes: [{ width: 728, height: 90 }],
    status: 'active',
    // Every slot is pinned to the flat CPM on write (createSlot/updateSlot);
    // the slot table reads pricing.mode unguarded, so a fixture without it
    // crashes the page rather than failing an assertion.
    pricing: { mode: 'cpm', cpmIsk: 550 },
    // Every column differs from the slot above — fill 75% against 80%, and its
    // own clicks, impressions and revenue. With both rows sharing a figure, a
    // whole-line assertion could still pass on a build that rendered one slot's
    // numbers on the other slot's row.
    // (80-50)/80 = 38%, where the whole-window figure would read 75%.
    stats: {
      impressions: 100,
      clicks: 5,
      pageviews: 200,
      unfilled: 50,
      requestsWithFillData: 80,
      spendIsk: 2000,
    },
  },
];

test('the CSV export clamps CTR at 100% too, so it agrees with the screen', async () => {
  let csvDownload: ReturnType<typeof captureCsvDownload> | undefined;
  try {
    csvDownload = captureCsvDownload();
    setupApiMock({ publishers: ONE_SITE, slots: CSV_SLOTS, stats: BASE_STATS });
    renderPage();
    await screen.findByTitle('Sækja CSV skýrslu');

    fireEvent.click(screen.getByTitle('Sækja CSV skýrslu'));

    // Asserted as whole lines, not as loose substrings: '100,00%' appearing
    // somewhere in the file does not prove it appeared in the right slot's row,
    // and the column order is exactly what a CSV read in a spreadsheet depends
    // on. The header has ten columns and so must every row — the CTR field is
    // quoted for that reason, since the Icelandic decimal comma would otherwise
    // split it in two and push revenue under the CTR heading.
    // Not .trim()'d: the leading byte-order mark is whitespace to trim(), and
    // it is what makes Excel read the file as UTF-8 rather than mangling every
    // Icelandic character in it.
    const lines = csvDownload
      .read()
      .split('\n')
      .filter((l) => l !== '');
    expect(lines[0]).toBe(
      '﻿Pláss,Lén,Stærðir,Staða,Birtingar,Auglýsingabeiðnir,Fylltar,Smellir,CTR,Áætlaðar Tekjur',
    );
    expect(lines[1]).toBe(
      '"Efst á forsíðu",vefur-a.is,"300x250",Virk,5,100,50%,7,"100,00%",800 kr.',
    );
    expect(lines[2]).toBe(
      '"Í miðri grein",vefur-a.is,"728x90",Virk,100,200,38%,5,"5,00%",1600 kr.',
    );
    // Unclamped this row would read 140,00%, and its quotes would be missing.
    expect(csvDownload.read()).not.toContain('140,00%');

    // Every row carries exactly as many fields as the header. A naive split on
    // commas is the wrong way to parse CSV in general, but it is precisely how
    // the unquoted decimal comma used to break: eleven fields against ten.
    const headerFields = splitCsvLine(lines[0]!).length;
    for (const line of lines.slice(1)) {
      expect(splitCsvLine(line)).toHaveLength(headerFields);
    }
  } finally {
    csvDownload?.restore();
  }
});

/** Fields of one CSV line, honouring double quotes. */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === ',' && !inQuotes) {
      fields.push(field);
      field = '';
    } else field += ch;
  }
  fields.push(field);
  return fields;
}

/**
 * The trend badge split history at floor(length / 2), so the 7-day preset
 * compared the first 3 days against the last 4 — perfectly flat traffic of 100
 * impressions a day read "+33,3% frá fyrra tímabili", on every visit, on both
 * the Birtingar and Tekjur cards. Equal halves now (the middle day of an odd
 * window belongs to neither), so flat traffic reads flat.
 */
test('flat traffic shows a flat trend, not +33%', async () => {
  const flatWeek = Array.from({ length: 7 }, (_, i) => ({
    date: `2026-08-0${i + 1}`,
    impressions: 100,
    clicks: 1,
    spendIsk: 55,
    pageviews: 120,
  }));
  setupApiMock({
    publishers: ONE_SITE,
    slots: [],
    stats: { ...BASE_STATS, impressions: 700, history: flatWeek },
  });
  renderPage();
  await screen.findAllByText('Birtingar');

  expect(document.body.textContent).not.toContain('+33');
  expect(document.body.textContent).toContain('+0,0% frá fyrra tímabili');
});

/**
 * "Næsta útgreiðsla" on the dashboard used to show the rolling-window revenue
 * with a payout date under it, while the Earnings page showed the real unpaid
 * ledger basis — zeroed below the payout minimum. A new publisher with 4.000 kr
 * saw a promise of money on one page and 0 kr one click away, and the figure
 * that promised was the wrong one. The hero card now shows the same ledger
 * basis the Earnings page reports.
 */
test('the payout card shows the unpaid ledger basis, not window revenue', async () => {
  setupApiMock({
    publishers: ONE_SITE,
    slots: [],
    stats: { ...BASE_STATS, spendIsk: 90_000 },
    balance: { unpaidBasisIsk: 4000, minPayoutIsk: 10_000 },
  });
  renderPage();

  const heading = await screen.findByText('Uppsafnað til útgreiðslu');
  const card = within(heading.closest('div')!.parentElement!);
  expect(card.getByText('4.000 kr')).toBeDefined();
  // Below the minimum: the card says what happens instead of naming a date.
  expect(screen.getByText(/lágmarki er náð/)).toBeDefined();
  // The old behaviour: net of 90.000 window revenue under a payout heading.
  expect(document.body.textContent).not.toContain('Næsta útgreiðsla: 72.000');
});

/**
 * The 7/30 toggle drove the cards and chart while the slot table and CSV below
 * stayed on a hardcoded 30 — 7.000 impressions above, 30.000 below, one page.
 * The slots request now carries the toggle's timeframe.
 */
test('switching to 7 days refetches the slot table on the same window', async () => {
  setupApiMock({ publishers: ONE_SITE, slots: [], stats: BASE_STATS });
  renderPage();
  await screen.findAllByText('Birtingar');

  fireEvent.click(screen.getByText('7 dagar'));

  await vi.waitFor(() => {
    const slotCalls = mockedApiFetch.mock.calls
      .map((c) => String(c[0]))
      .filter((u) => u.startsWith('/v1/publishers/me/slots'));
    expect(slotCalls.some((u) => u.includes('timeframe=7'))).toBe(true);
  });
});

test('the revenue hero shows window revenue and the payout card the ledger basis — never swapped', async () => {
  // A replace-all once pointed BOTH cards at the same value: the two old
  // expressions were textually identical, so converting the payout card
  // dragged the revenue hero with it and 90.000 kr of window revenue rendered
  // as 4.000 kr of unpaid basis under a revenue label. Distinct fixtures keep
  // the two apart.
  setupApiMock({
    publishers: ONE_SITE,
    slots: [],
    stats: { ...BASE_STATS, spendIsk: 90_000 },
    balance: { unpaidBasisIsk: 4000, minPayoutIsk: 10_000 },
  });
  renderPage();

  const revenueHeading = await screen.findByText(/Áætlaðar tekjur síðustu 30 daga/);
  const revenueCard = within(revenueHeading.closest('div')!.parentElement!);
  expect(revenueCard.getByText('72.000 kr')).toBeDefined(); // net of 90.000

  const payoutHeading = screen.getByText('Uppsafnað til útgreiðslu');
  const payoutCard = within(payoutHeading.closest('div')!.parentElement!);
  expect(payoutCard.getByText('4.000 kr')).toBeDefined();
});
