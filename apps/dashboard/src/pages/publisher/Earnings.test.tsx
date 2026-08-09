import { test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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
}: {
  publishers: unknown[];
  stats: unknown;
  payouts: unknown[];
  balance: { unpaidBasisIsk: number; minPayoutIsk: number };
}) {
  mockedApiFetch.mockImplementation(async (url: unknown) => {
    const u = url as string;
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
  expect(statCardValue('Tekjur í mánuðinum')).toBe(formatIsk(800)); // 1000 * 0.8, unaffected
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
  expect(statCardValue('Tekjur í mánuðinum')).toBe(formatIsk(16_000)); // 20000 * 0.8, unaffected
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
