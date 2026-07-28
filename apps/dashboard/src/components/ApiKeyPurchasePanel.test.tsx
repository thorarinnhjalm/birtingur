import { test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ApiKeyPurchasePanel } from './ApiKeyPurchasePanel';
import type { ApiKeyRecord } from '@/hooks/useApiKeys';

const mutate = vi.fn();

// Mocked without `importActual` on purpose: the real module chain pulls in
// '@/lib/api' -> '@/lib/firebase', which eagerly initializes the Firebase SDK
// and hangs indefinitely in a network-less test sandbox. The component only
// consumes `useUpdateApiKeyPurchase` (the `ApiKeyRecord` import above is
// type-only and erased at build time), so a bare mock is enough.
vi.mock('@/hooks/useApiKeys', () => ({
  useUpdateApiKeyPurchase: () => ({
    mutate,
    isPending: false,
    isError: false,
    error: null,
    reset: vi.fn(),
  }),
}));

beforeEach(() => {
  mutate.mockReset();
});

function makeKey(overrides: Partial<ApiKeyRecord> = {}): ApiKeyRecord {
  return {
    id: 'ak_test123',
    ownerEmail: 'adv@example.is',
    scope: 'advertiser',
    createdAt: new Date().toISOString(),
    revoked: false,
    ...overrides,
  };
}

test('publisher-scoped keys show a disabled hint, no edit affordance', () => {
  render(<ApiKeyPurchasePanel apiKey={makeKey({ scope: 'publisher' })} />);
  expect(screen.getByText('Á ekki við')).toBeDefined();
  expect(screen.queryByText('Stilla')).toBeNull();
});

test('advertiser key with no purchase config shows the off state', () => {
  render(<ApiKeyPurchasePanel apiKey={makeKey()} />);
  expect(screen.getByText('Óvirkt')).toBeDefined();
  expect(screen.getByText('Stilla')).toBeDefined();
});

test('enabled key shows cap, limit and the edit affordance', () => {
  render(
    <ApiKeyPurchasePanel
      apiKey={makeKey({
        purchase: { enabled: true, monthlyCapIsk: 50000, autoApproveLimitIsk: 10000 },
      })}
    />,
  );
  expect(screen.getByText('Virkt')).toBeDefined();
  expect(screen.getByText(/50.000/)).toBeDefined();
  expect(screen.getByText(/10.000/)).toBeDefined();
});

test('enabling without filling in the required amounts blocks the save', () => {
  render(<ApiKeyPurchasePanel apiKey={makeKey()} />);
  fireEvent.click(screen.getByText('Stilla'));
  fireEvent.click(screen.getByText('Virkt'));
  fireEvent.click(screen.getByText('Vista'));

  expect(
    screen.getByText('Bæði mánaðarþak og sjálfvirknimörk þarf að fylla út til að virkja.'),
  ).toBeDefined();
  expect(mutate).not.toHaveBeenCalled();
});

test('an auto-approve limit above the monthly cap is rejected client-side', () => {
  render(<ApiKeyPurchasePanel apiKey={makeKey()} />);
  fireEvent.click(screen.getByText('Stilla'));
  fireEvent.click(screen.getByText('Virkt'));
  fireEvent.change(screen.getByLabelText('Mánaðarþak (kr.)'), { target: { value: '10000' } });
  fireEvent.change(screen.getByLabelText('Sjálfvirknimörk (kr.)'), {
    target: { value: '20000' },
  });
  fireEvent.click(screen.getByText('Vista'));

  expect(screen.getByText('Sjálfvirknimörk mega ekki vera hærri en mánaðarþakið.')).toBeDefined();
  expect(mutate).not.toHaveBeenCalled();
});

test('valid values submit the expected payload', () => {
  render(<ApiKeyPurchasePanel apiKey={makeKey()} />);
  fireEvent.click(screen.getByText('Stilla'));
  fireEvent.click(screen.getByText('Virkt'));
  fireEvent.change(screen.getByLabelText('Mánaðarþak (kr.)'), { target: { value: '50000' } });
  fireEvent.change(screen.getByLabelText('Sjálfvirknimörk (kr.)'), {
    target: { value: '10000' },
  });
  fireEvent.click(screen.getByText('Vista'));

  expect(mutate).toHaveBeenCalledTimes(1);
  expect(mutate.mock.calls[0][0]).toEqual({
    id: 'ak_test123',
    enabled: true,
    monthlyCapIsk: 50000,
    autoApproveLimitIsk: 10000,
  });
});

test('disabling a previously configured key preserves its last known amounts', () => {
  render(
    <ApiKeyPurchasePanel
      apiKey={makeKey({
        purchase: { enabled: true, monthlyCapIsk: 50000, autoApproveLimitIsk: 10000 },
      })}
    />,
  );
  fireEvent.click(screen.getByText('Stilla'));
  fireEvent.click(screen.getByText('Óvirkt'));
  fireEvent.click(screen.getByText('Vista'));

  expect(mutate).toHaveBeenCalledTimes(1);
  expect(mutate.mock.calls[0][0]).toEqual({
    id: 'ak_test123',
    enabled: false,
    monthlyCapIsk: 50000,
    autoApproveLimitIsk: 10000,
  });
});
