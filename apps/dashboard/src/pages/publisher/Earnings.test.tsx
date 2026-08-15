import { test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Earnings from './Earnings';
import { apiFetch } from '@/lib/api';
import { formatIsk, MIN_PAYOUT_ISK } from '@ada/shared';

// Mocked without `importActual`, same reasoning as Dashboard.test.tsx: the
// real module chain pulls in '@/lib/firebase', which eagerly initializes the
// Firebase SDK and hangs indefinitely in a network-less test sandbox.
// Earnings' default export only ever calls `apiFetch` (via usePublishers,
// its own stats/payouts/balance queries), so that's mocked directly.
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

const mockedApiFetch = vi.mocked(apiFetch);

const ONE_SITE = [{ id: 'pub_a', displayName: 'Vefur A', domain: 'vefur-a.is' }];

function setupApiMock({
  publishers,
  stats,
  payouts,
  balance,
  failOn = [],
}: {
  publishers: unknown[];
  stats: unknown;
  payouts: unknown[];
  balance: { unpaidBasisIsk: number; minPayoutIsk: number };
  /** URL prefixes whose request should reject, simulating a server/network failure. */
  failOn?: string[];
}) {
  mockedApiFetch.mockImplementation(async (url: unknown) => {
    const u = url as string;
    if (failOn.some((prefix) => u.startsWith(prefix))) {
      throw new Error(`simulated failure for ${u}`);
    }
    if (u.startsWith('/v1/publishers/all')) return publishers as any;
    if (u.startsWith('/v1/publishers/stats')) return stats as any;
    if (u.startsWith('/v1/publishers/me/payouts')) return payouts as any;
    if (u.startsWith('/v1/publishers/me/balance')) return balance as any;
    throw new Error(`Unhandled apiFetch call in test: ${u}`);
  });
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/']}>
        <Earnings />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** The StatCard's rendered value for a given label, read from its own Card. */
function statCardValue(label: string): string | undefined {
  const labelEl = screen.getByText(label);
  const card = labelEl.closest('.rounded-card');
  return card?.querySelector('.text-3xl')?.textContent ?? undefined;
}

beforeEach(() => {
  mockedApiFetch.mockReset();
});

// IMPORTANT-5 (adversarial review): "Beðið eftir útgreiðslu" used to derive
// from the trailing-30-day spend stat instead of the real unpaid basis — a
// publisher earning below the minimum every month permanently saw 0 kr. and
// a below-minimum warning, including in the month they're actually about to
// be paid the carried-forward total. These assert the page now reads
// GET /v1/publishers/me/balance instead.

test('shows the real unpaid basis as the pending payout figure, not the 30-day spend stat', async () => {
  // 30-day net revenue is small (800 kr.), but the real unpaid basis
  // (carried forward from earlier months) is well above it — the old bug
  // would have shown "0 kr." for pending payout here instead.
  setupApiMock({
    publishers: ONE_SITE,
    stats: { impressions: 100, clicks: 1, spendIsk: 1_000, history: [] },
    payouts: [],
    balance: { unpaidBasisIsk: 12_000, minPayoutIsk: MIN_PAYOUT_ISK },
  });
  renderPage();

  await screen.findByText('Beðið eftir útgreiðslu');
  expect(statCardValue('Beðið eftir útgreiðslu')).toBe(formatIsk(12_000));
  expect(statCardValue('Tekjur síðustu 30 daga')).toBe(formatIsk(800)); // 1000 * 0.8, unaffected
  // No below-minimum warning once the real basis clears the threshold.
  expect(screen.queryByText(/undir því marki/)).toBeNull();
});

test('shows the below-minimum warning honestly against the real unpaid basis, not the spend stat', async () => {
  setupApiMock({
    publishers: ONE_SITE,
    stats: { impressions: 500, clicks: 5, spendIsk: 20_000, history: [] }, // healthy 30-day spend
    payouts: [],
    balance: { unpaidBasisIsk: 3_000, minPayoutIsk: MIN_PAYOUT_ISK }, // but low real unpaid basis
  });
  renderPage();

  await screen.findByText(/undir því marki/);
  expect(statCardValue('Beðið eftir útgreiðslu')).toBe(formatIsk(0));
  expect(statCardValue('Tekjur síðustu 30 daga')).toBe(formatIsk(16_000)); // 20000 * 0.8, unaffected
});

test('shows no below-minimum warning when there is no unpaid basis at all', async () => {
  setupApiMock({
    publishers: ONE_SITE,
    stats: { impressions: 0, clicks: 0, spendIsk: 0, history: [] },
    payouts: [],
    balance: { unpaidBasisIsk: 0, minPayoutIsk: MIN_PAYOUT_ISK },
  });
  renderPage();

  await screen.findByText('Beðið eftir útgreiðslu');
  expect(statCardValue('Beðið eftir útgreiðslu')).toBe(formatIsk(0));
  expect(screen.queryByText(/undir því marki/)).toBeNull();
});

// Every figure on this page comes out of a query result with `?? 0`, so a
// failed request used to render as a confident "0 kr." — telling a creator
// who is owed money that they have earned nothing.
test('a failed balance request shows an error, not 0 kr.', async () => {
  setupApiMock({
    publishers: ONE_SITE,
    stats: { impressions: 500, clicks: 5, spendIsk: 20_000, history: [] },
    payouts: [],
    balance: { unpaidBasisIsk: 12_000, minPayoutIsk: MIN_PAYOUT_ISK },
    failOn: ['/v1/publishers/me/balance'],
  });
  renderPage();

  await screen.findByText('Villa kom upp');
  // The money figures must be gone entirely — not merely showing zeros.
  expect(screen.queryByText('Beðið eftir útgreiðslu')).toBeNull();
  expect(screen.queryByText(formatIsk(0))).toBeNull();
  expect(screen.queryByText(/undir því marki/)).toBeNull();
});

// usePublishers() failing is the subtler path: stats and balance carry
// `enabled: !!publishers`, and a disabled query reports isLoading false while
// still pending — so it falls straight through the loading guard into the
// same silent zeros without ever erroring itself.
test('a failed publishers request shows an error rather than falling through to zeros', async () => {
  setupApiMock({
    publishers: ONE_SITE,
    stats: { impressions: 500, clicks: 5, spendIsk: 20_000, history: [] },
    payouts: [],
    balance: { unpaidBasisIsk: 12_000, minPayoutIsk: MIN_PAYOUT_ISK },
    failOn: ['/v1/publishers/all'],
  });
  renderPage();

  await screen.findByText('Villa kom upp');
  expect(screen.queryByText('Beðið eftir útgreiðslu')).toBeNull();
});

// The guard uses isLoadingError, not isError, precisely so this case keeps
// working: TanStack Query preserves `data` when a REFETCH fails and only
// moves `status` to 'error'. The app client sets staleTime 30s with
// refetchOnMount on, so a blip on a return visit must not replace a page of
// correct cached figures with a red box.
test('a refetch that fails while the data is already cached keeps showing the figures', async () => {
  setupApiMock({
    publishers: ONE_SITE,
    stats: { impressions: 100, clicks: 1, spendIsk: 1_000, history: [] },
    payouts: [],
    balance: { unpaidBasisIsk: 12_000, minPayoutIsk: MIN_PAYOUT_ISK },
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui = (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/']}>
        <Earnings />
      </MemoryRouter>
    </QueryClientProvider>
  );
  const { rerender } = render(ui);
  await screen.findByText('Beðið eftir útgreiðslu');
  expect(statCardValue('Beðið eftir útgreiðslu')).toBe(formatIsk(12_000));

  // Now every request fails, and the cached queries are refetched.
  mockedApiFetch.mockImplementation(async (url: unknown) => {
    throw new Error(`simulated failure for ${url as string}`);
  });
  await qc.refetchQueries();
  rerender(ui);

  await waitFor(() => {
    expect(screen.getByText('Beðið eftir útgreiðslu')).toBeDefined();
  });
  expect(statCardValue('Beðið eftir útgreiðslu')).toBe(formatIsk(12_000));
  expect(screen.queryByText('Villa kom upp')).toBeNull();
});
