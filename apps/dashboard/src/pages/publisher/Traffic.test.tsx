import { test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Traffic from './Traffic';
import { apiFetch } from '@/lib/api';

// Same mocking rationale as Dashboard.test.tsx: the real module chain pulls in
// '@/lib/firebase', which hangs in a network-less sandbox.
vi.mock('@/lib/api', () => {
  return { apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', MockResizeObserver);

const TWO_SITES = [
  { id: 'pub_a', displayName: 'Vefur A', domain: 'vefur-a.is' },
  { id: 'pub_b', displayName: 'Vefur B', domain: 'vefur-b.is' },
];

function setupApiMock(stats: unknown, publishers: unknown[] = TWO_SITES) {
  mockedApiFetch.mockImplementation(async (url: unknown) => {
    const u = url as string;
    if (u.startsWith('/v1/publishers/all')) return publishers as never;
    if (u.startsWith('/v1/publishers/stats')) return stats as never;
    throw new Error(`Unhandled apiFetch call in test: ${u}`);
  });
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/publisher/traffic']}>
        <Traffic />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockedApiFetch.mockReset();
  sessionStorage.clear();
});

/**
 * The split's copy carries two load-bearing constraints. bot-class.ts mandates
 * the known-bot list is a floor, never a total ("bot filtering" is banned
 * product-wide), and the split has NO billing effect — accrual never reads it.
 * An earlier draft of this screen said the human figure was "the number you
 * get paid for", which is false on both axes (payment is per viewable
 * impression, class-blind). These assertions keep both from regressing.
 */
test('shows the human/automated split as a floor, never as a billing claim', async () => {
  setupApiMock({
    impressions: 800,
    clicks: 10,
    spendIsk: 440,
    pageviews: 2200,
    pageViewsTrue: 1000,
    botClass: { human: 950, knownBot: 30, suspectedBot: 12 },
    history: [
      {
        date: '2026-08-18',
        impressions: 800,
        clicks: 10,
        spendIsk: 440,
        pageviews: 2200,
        pageViewsTrue: 1000,
      },
    ],
  });
  renderPage();

  expect(await screen.findByText('Mannleg umferð')).toBeDefined();
  expect(screen.getByText('950')).toBeDefined();
  // automated = knownBot + suspectedBot
  expect(screen.getByText('42')).toBeDefined();
  expect(screen.getByText(/gólf, ekki heildartala/)).toBeDefined();
  // The false billing claim an earlier draft made:
  expect(document.body.textContent).not.toContain('talan sem þú færð greitt fyrir');
  // The honest statement in its place:
  expect(screen.getByText(/Flokkunin breytir ekki uppgjöri/)).toBeDefined();
  // No byCountry on this fixture: the country block says when measurement
  // started instead of fabricating rows.
  expect(screen.getByText(/Landaskipting mælist frá/)).toBeDefined();
});

/**
 * Countries render as Icelandic names with counts against the page-view
 * total, 'XX' as its own honest "Óþekkt" row (dropping it would make the
 * listed countries claim to sum to the total when they do not).
 */
test('the country split lists Icelandic names and keeps the unknown bucket', async () => {
  setupApiMock({
    impressions: 800,
    clicks: 10,
    spendIsk: 440,
    pageviews: 2200,
    pageViewsTrue: 1000,
    // T1 (Tor pseudo-code) folds into the same unknown bucket as XX — a bare
    // "T1" row would be meaningless to a food blogger.
    byCountry: { IS: 850, DK: 100, XX: 30, T1: 20 },
    history: [
      {
        date: '2026-08-21',
        impressions: 800,
        clicks: 10,
        spendIsk: 440,
        pageviews: 2200,
        pageViewsTrue: 1000,
      },
    ],
  });
  renderPage();

  expect(await screen.findByText('Eftir löndum')).toBeDefined();
  expect(screen.getByText('Ísland')).toBeDefined();
  expect(screen.getByText('Óþekkt')).toBeDefined();
  expect(document.body.textContent).not.toContain('T1');
  // Full coverage in this fixture (1000 of 1000): no partial-coverage caption.
  expect(document.body.textContent).not.toContain('Landaskiptingin nær yfir');
  expect(document.body.textContent).not.toContain('Landaskipting mælist frá');
});

/**
 * Percentages divide the COUNTRY-MEASURED total, never the window's page
 * views: days before 2026-08-21 have no country data, and that gap is a
 * measurement gap, not "other countries". 600 of 1.000 measured → Ísland is
 * 500/600 = 83,3%, not 50%, and the coverage caption says what the split
 * actually covers. Everything beyond the top five groups into "Annað".
 */
test('country percentages use the measured total and partial coverage says so', async () => {
  setupApiMock({
    impressions: 800,
    clicks: 10,
    spendIsk: 440,
    pageviews: 2200,
    pageViewsTrue: 1000,
    byCountry: { IS: 500, DK: 40, NO: 20, SE: 15, GB: 10, US: 8, DE: 7 },
    history: [
      {
        date: '2026-08-21',
        impressions: 800,
        clicks: 10,
        spendIsk: 440,
        pageviews: 2200,
        pageViewsTrue: 1000,
      },
    ],
  });
  renderPage();

  expect(await screen.findByText('Eftir löndum')).toBeDefined();
  expect(screen.getByText('83,3%')).toBeDefined();
  expect(document.body.textContent).not.toContain('50,0%');
  expect(screen.getByText('Annað')).toBeDefined();
  expect(screen.getByText(/Landaskiptingin nær yfir/)).toBeDefined();
});

test('an unmeasured window says when measurement started, never a zero', async () => {
  setupApiMock({
    impressions: 800,
    clicks: 10,
    spendIsk: 440,
    pageviews: 2200,
    history: [{ date: '2026-08-01', impressions: 800, clicks: 10, spendIsk: 440, pageviews: 2200 }],
  });
  renderPage();

  expect(await screen.findByText(/Nákvæm mæling hófst/)).toBeDefined();
  expect(document.body.textContent).not.toContain('0 síðuflettingar');
});

/**
 * Per-site "Tekjur á 1.000" must divide the server's traffic-paired spend by
 * the site's measured page views — never the whole-window spendIsk. Vefur A:
 * paired spend 110 → net 88 over 500 page views = 176 kr. Its whole-window
 * spend of 9.110 would read 14.576 kr — the exact mismatch the paired field
 * exists to prevent.
 */
test('per-site value per 1.000 uses the traffic-paired spend, not window spend', async () => {
  setupApiMock({
    impressions: 20200,
    clicks: 50,
    spendIsk: 11110,
    pageviews: 30000,
    pageViewsTrue: 500,
    spendIskWithTrafficData: 110,
    botClass: { human: 480 },
    history: [
      {
        date: '2026-08-18',
        impressions: 200,
        clicks: 2,
        spendIsk: 110,
        pageviews: 400,
        pageViewsTrue: 500,
      },
    ],
    bySite: [
      {
        publisherId: 'pub_a',
        displayName: 'Vefur A',
        domain: 'vefur-a.is',
        impressions: 16500,
        pageviews: 20000,
        pageViewsTrue: 500,
        spendIskWithTrafficData: 110,
        botClass: { human: 480 },
        spendIsk: 9110,
      },
      {
        publisherId: 'pub_b',
        displayName: 'Vefur B',
        domain: 'vefur-b.is',
        impressions: 3700,
        pageviews: 10000,
        spendIsk: 2000,
      },
    ],
  });
  renderPage();

  expect(await screen.findByText('Vefur A')).toBeDefined();
  expect(screen.getAllByText('176 kr').length).toBeGreaterThan(0);
  expect(document.body.textContent).not.toContain('14.576');
  // Vefur B never measured true traffic: dashes, not fabricated figures.
  const rowB = screen.getByText('Vefur B').closest('tr')!;
  expect(rowB.textContent).toContain('—');
});

test('the honesty card about slot-less pages always renders', async () => {
  setupApiMock({
    impressions: 0,
    clicks: 0,
    spendIsk: 0,
    pageviews: 0,
    history: [],
  });
  renderPage();

  expect(await screen.findByText(/gólf á umferðinni þinni, ekki heildartala/)).toBeDefined();
});
