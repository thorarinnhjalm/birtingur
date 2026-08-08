import { test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SiteSwitcher } from './SiteSwitcher';
import { apiFetch } from '@/lib/api';

vi.mock('@/lib/api', () => ({ apiFetch: vi.fn() }));
const mockedApiFetch = vi.mocked(apiFetch);

function renderSwitcher() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/publisher']}>
        <SiteSwitcher />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const TWO_SITES = [
  { id: 'pub_a', displayName: 'Vefur A', domain: 'vefur-a.is' },
  { id: 'pub_b', displayName: 'Vefur B', domain: 'vefur-b.is' },
];

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});

test('renders nothing for a single-site publisher', async () => {
  mockedApiFetch.mockResolvedValue([TWO_SITES[0]]);
  renderSwitcher();
  await vi.waitFor(() => expect(mockedApiFetch).toHaveBeenCalled());
  expect(screen.queryByRole('combobox', { name: 'Velja vef' })).toBeNull();
});

test('lists all sites plus "Allir vefir" and persists the selection', async () => {
  mockedApiFetch.mockResolvedValue(TWO_SITES);
  renderSwitcher();
  const select = await screen.findByRole('combobox', { name: 'Velja vef' });
  expect(screen.getByRole('option', { name: 'Allir vefir' })).toBeDefined();
  fireEvent.change(select, { target: { value: 'pub_b' } });
  expect((select as HTMLSelectElement).value).toBe('pub_b');
  expect(sessionStorage.getItem('birtingur.siteFilter')).toBe('pub_b');
});
