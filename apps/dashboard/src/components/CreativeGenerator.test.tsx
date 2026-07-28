import { test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CreativeGenerator } from './CreativeGenerator';
import { apiFetch } from '@/lib/api';

// Mocked without `importActual` on purpose: the real module chain pulls in
// '@/lib/firebase', which eagerly initializes the Firebase SDK and hangs
// indefinitely in a network-less test sandbox (same reasoning as
// ApiKeyPurchasePanel.test.tsx). The component only calls `apiFetch`.
vi.mock('@/lib/api', () => ({ apiFetch: vi.fn() }));

const mockedApiFetch = vi.mocked(apiFetch);

const MANIFEST = {
  id: 'adv_1',
  advertiserId: 'adv_1',
  landingUrl: 'https://blomabud.is/',
  createdAt: new Date().toISOString(),
  variants: [
    {
      variantId: 'gen_a',
      copy: { headline: 'Blómabúð Vesturbæjar', subline: 'Ferskir blómvendir', cta: 'Sjá nánar' },
      images: [
        {
          sizeKey: '300x250',
          width: 300,
          height: 250,
          url: 'https://storage.example.test/a-300x250.png',
        },
        {
          sizeKey: '728x90',
          width: 728,
          height: 90,
          url: 'https://storage.example.test/a-728x90.png',
        },
      ],
    },
    {
      variantId: 'gen_b',
      copy: {
        headline: 'Kíktu við hjá okkur',
        subline: 'Blóm fyrir öll tilefni',
        cta: 'Skoða vefinn',
      },
      images: [
        {
          sizeKey: '300x250',
          width: 300,
          height: 250,
          url: 'https://storage.example.test/b-300x250.png',
        },
        {
          sizeKey: '728x90',
          width: 728,
          height: 90,
          url: 'https://storage.example.test/b-728x90.png',
        },
      ],
    },
  ],
};

const CREATED_CREATIVES = [
  { id: 'crt_1', width: 300, height: 250, imageUrl: MANIFEST.variants[0]!.images[0]!.url },
  { id: 'crt_2', width: 728, height: 90, imageUrl: MANIFEST.variants[0]!.images[1]!.url },
];

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  mockedApiFetch.mockReset();
});

test('disables the generate button for a non-https URL and never calls the API', async () => {
  renderWithClient(<CreativeGenerator onComplete={vi.fn()} />);
  const input = screen.getByLabelText('Vefslóð fyrirtækisins *');
  fireEvent.change(input, { target: { value: 'http://blomabud.is' } });
  const generateButton = screen
    .getByText('Búa til tillögur')
    .closest('button') as HTMLButtonElement;
  expect(generateButton.disabled).toBe(true);

  fireEvent.click(generateButton);
  expect(mockedApiFetch).not.toHaveBeenCalled();
});

test('generates and displays preview variants', async () => {
  mockedApiFetch.mockResolvedValueOnce(MANIFEST as any);
  renderWithClient(<CreativeGenerator onComplete={vi.fn()} />);

  fireEvent.change(screen.getByLabelText('Vefslóð fyrirtækisins *'), {
    target: { value: 'https://blomabud.is' },
  });
  fireEvent.click(screen.getByText('Búa til tillögur'));

  await waitFor(() =>
    expect(mockedApiFetch).toHaveBeenCalledWith('/v1/creatives/generate', {
      method: 'POST',
      body: JSON.stringify({ landingUrl: 'https://blomabud.is', variants: 2 }),
    }),
  );

  expect(await screen.findByText('Blómabúð Vesturbæjar')).toBeDefined();
  expect(screen.getByText('Kíktu við hjá okkur')).toBeDefined();
});

test('requires the responsibility checkbox before confirm is enabled', async () => {
  mockedApiFetch.mockResolvedValueOnce(MANIFEST as any);
  renderWithClient(<CreativeGenerator onComplete={vi.fn()} />);

  fireEvent.change(screen.getByLabelText('Vefslóð fyrirtækisins *'), {
    target: { value: 'https://blomabud.is' },
  });
  fireEvent.click(screen.getByText('Búa til tillögur'));
  await screen.findByText('Blómabúð Vesturbæjar');

  fireEvent.click(screen.getByText('Blómabúð Vesturbæjar'));
  const confirmButton = screen
    .getByText('Staðfesta og vista auglýsingu')
    .closest('button') as HTMLButtonElement;
  expect(confirmButton.disabled).toBe(true);

  fireEvent.click(screen.getByText(/Þú berð ábyrgð/));
  expect(confirmButton.disabled).toBe(false);
});

test('confirming a variant calls the confirm endpoint and reports the created creatives', async () => {
  mockedApiFetch
    .mockResolvedValueOnce(MANIFEST as any)
    .mockResolvedValueOnce(CREATED_CREATIVES as any);
  const onComplete = vi.fn();
  renderWithClient(<CreativeGenerator onComplete={onComplete} />);

  fireEvent.change(screen.getByLabelText('Vefslóð fyrirtækisins *'), {
    target: { value: 'https://blomabud.is' },
  });
  fireEvent.click(screen.getByText('Búa til tillögur'));
  await screen.findByText('Blómabúð Vesturbæjar');

  fireEvent.click(screen.getByText('Blómabúð Vesturbæjar'));
  fireEvent.click(screen.getByText(/Þú berð ábyrgð/));
  fireEvent.click(screen.getByText('Staðfesta og vista auglýsingu'));

  await waitFor(() =>
    expect(mockedApiFetch).toHaveBeenCalledWith('/v1/creatives/generate/confirm', {
      method: 'POST',
      body: JSON.stringify({ variantId: 'gen_a', landingUrl: 'https://blomabud.is' }),
    }),
  );
  await waitFor(() => expect(onComplete).toHaveBeenCalledWith(CREATED_CREATIVES));
});
