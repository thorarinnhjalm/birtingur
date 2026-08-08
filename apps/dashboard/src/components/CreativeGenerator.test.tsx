import { test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CreativeGenerator } from './CreativeGenerator';
import { apiFetch, ApiError } from '@/lib/api';

// Mocked without `importActual` on purpose: the real module chain pulls in
// '@/lib/firebase', which eagerly initializes the Firebase SDK and hangs
// indefinitely in a network-less test sandbox (same reasoning as
// ApiKeyPurchasePanel.test.tsx). The component only calls `apiFetch` (and
// checks error instances against `ApiError`), so both are mocked directly
// rather than importing the real module.
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

const COPY_MANIFEST = {
  id: 'adv_1',
  advertiserId: 'adv_1',
  landingUrl: 'https://blomabud.is/',
  status: 'copy',
  createdAt: new Date().toISOString(),
  variants: [
    {
      variantId: 'gen_a',
      copy: { headline: 'Blómabúð Vesturbæjar', subline: 'Ferskir blómvendir', cta: 'Sjá nánar' },
      images: [],
    },
    {
      variantId: 'gen_b',
      copy: {
        headline: 'Kíktu við hjá okkur',
        subline: 'Blóm fyrir öll tilefni',
        cta: 'Skoða vefinn',
      },
      images: [],
    },
  ],
};

function renderedManifestFor(variantId: string) {
  return {
    ...COPY_MANIFEST,
    status: 'rendered',
    variants: COPY_MANIFEST.variants.map((v) =>
      v.variantId === variantId
        ? {
            ...v,
            templateId: 'bold',
            images: [
              {
                sizeKey: '300x250',
                width: 300,
                height: 250,
                url: `https://storage.example.test/${variantId}-300x250.png`,
              },
              {
                sizeKey: '728x90',
                width: 728,
                height: 90,
                url: `https://storage.example.test/${variantId}-728x90.png`,
              },
            ],
          }
        : v,
    ),
  };
}

const CREATED_CREATIVES = [
  {
    id: 'crt_1',
    width: 300,
    height: 250,
    imageUrl: 'https://storage.example.test/gen_a-300x250.png',
  },
  {
    id: 'crt_2',
    width: 728,
    height: 90,
    imageUrl: 'https://storage.example.test/gen_a-728x90.png',
  },
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

async function advanceFromSizesStep() {
  fireEvent.click(screen.getByText('Halda áfram →'));
  await screen.findByLabelText('Vefslóð fyrirtækisins *');
}

async function generateCopy() {
  fireEvent.change(screen.getByLabelText('Vefslóð fyrirtækisins *'), {
    target: { value: 'https://blomabud.is' },
  });
  fireEvent.click(screen.getByText('Búa til tillögur'));
  await screen.findByText('Blómabúð Vesturbæjar');
}

test('standalone mode (no categories) shows every IAB size with a neutral explainer, no API call', async () => {
  renderWithClient(<CreativeGenerator onComplete={vi.fn()} />);

  expect(screen.getByText(/Þetta eru allar staðlaðar auglýsingastærðir/)).toBeDefined();
  expect(screen.getByText('728 × 90')).toBeDefined();
  expect(screen.getByText('300 × 250')).toBeDefined();
  expect(mockedApiFetch).not.toHaveBeenCalled();

  await advanceFromSizesStep();
});

test('campaign mode fetches the per-category size forecast and shows slot counts', async () => {
  mockedApiFetch.mockResolvedValueOnce({
    sizes: [{ width: 300, height: 250, slotCount: 8, forecastShare: 0.62 }],
  } as any);

  renderWithClient(<CreativeGenerator onComplete={vi.fn()} categories={['matur']} />);

  expect(screen.getByText(/Flokkarnir sem þú valdir í Kaup-skrefinu/)).toBeDefined();

  await waitFor(() =>
    expect(mockedApiFetch).toHaveBeenCalledWith('/v1/categories/sizes?categories=matur'),
  );

  expect(
    await screen.findByText(/birtist á 8 plássum — um 62% af áætluðum birtingum/),
  ).toBeDefined();
});

test('progresses through all four sub-steps and hands the confirmed creatives to onComplete', async () => {
  mockedApiFetch
    .mockResolvedValueOnce(COPY_MANIFEST as any)
    .mockResolvedValueOnce(renderedManifestFor('gen_a') as any)
    .mockResolvedValueOnce(CREATED_CREATIVES as any);

  const onComplete = vi.fn();
  renderWithClient(<CreativeGenerator onComplete={onComplete} />);

  // a. Stærðir
  await advanceFromSizesStep();

  // b. Texti
  await generateCopy();
  expect(screen.getByText('Kíktu við hjá okkur')).toBeDefined();
  fireEvent.click(screen.getByText('Blómabúð Vesturbæjar'));
  const nextToUtlit = screen
    .getByText('Halda áfram í útlit →')
    .closest('button') as HTMLButtonElement;
  expect(nextToUtlit.disabled).toBe(false);
  fireEvent.click(nextToUtlit);

  // c. Útlit
  await screen.findByText('Áberandi (bold)');
  fireEvent.click(screen.getByText('Útbúa útlit →'));

  await waitFor(() =>
    expect(mockedApiFetch).toHaveBeenCalledWith('/v1/creatives/generate/render', {
      method: 'POST',
      body: JSON.stringify({
        variantId: 'gen_a',
        editedCopy: undefined,
        sizes: [
          { width: 728, height: 90 },
          { width: 300, height: 250 },
          { width: 300, height: 600 },
          { width: 320, height: 100 },
          { width: 980, height: 120 },
        ],
        templateId: 'bold',
      }),
    }),
  );

  // d. Yfirferð
  await screen.findByText('300x250');
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

test('confirm is disabled until the responsibility checkbox is checked', async () => {
  mockedApiFetch
    .mockResolvedValueOnce(COPY_MANIFEST as any)
    .mockResolvedValueOnce(renderedManifestFor('gen_a') as any);

  renderWithClient(<CreativeGenerator onComplete={vi.fn()} />);
  await advanceFromSizesStep();
  await generateCopy();
  fireEvent.click(screen.getByText('Blómabúð Vesturbæjar'));
  fireEvent.click(screen.getByText('Halda áfram í útlit →'));
  await screen.findByText('Áberandi (bold)');
  fireEvent.click(screen.getByText('Útbúa útlit →'));
  await screen.findByText('300x250');

  const confirmButton = screen
    .getByText('Staðfesta og vista auglýsingu')
    .closest('button') as HTMLButtonElement;
  expect(confirmButton.disabled).toBe(true);

  fireEvent.click(screen.getByText(/Þú berð ábyrgð/));
  expect(confirmButton.disabled).toBe(false);
});

test('editing copy enforces the schema length limits before proceeding to Útlit', async () => {
  mockedApiFetch.mockResolvedValueOnce(COPY_MANIFEST as any);

  renderWithClient(<CreativeGenerator onComplete={vi.fn()} />);
  await advanceFromSizesStep();
  await generateCopy();
  fireEvent.click(screen.getByText('Blómabúð Vesturbæjar'));

  const headlineInput = screen.getByLabelText('Fyrirsögn *') as HTMLInputElement;
  expect(headlineInput.value).toBe('Blómabúð Vesturbæjar');
  expect(screen.getByText('20/30')).toBeDefined();

  const nextButton = screen
    .getByText('Halda áfram í útlit →')
    .closest('button') as HTMLButtonElement;
  expect(nextButton.disabled).toBe(false);

  // Emptying a required field must block progression (min(1) on the shared
  // GeneratedCopyVariantSchema — editedCopy is held to the same limits).
  fireEvent.change(headlineInput, { target: { value: '' } });
  expect(nextButton.disabled).toBe(true);
  expect(screen.getByText('0/30')).toBeDefined();

  fireEvent.change(headlineInput, { target: { value: 'Ný fyrirsögn' } });
  expect(nextButton.disabled).toBe(false);
  expect(screen.getByText('12/30')).toBeDefined();
});

test('a 429 from the copy endpoint surfaces the API-provided daily-limit message', async () => {
  mockedApiFetch.mockRejectedValueOnce(
    new ApiError(
      429,
      'RATE_LIMITED',
      'Hámarksfjöldi textatillagna á dag er náður. Reyndu aftur á morgun.',
    ),
  );

  renderWithClient(<CreativeGenerator onComplete={vi.fn()} />);
  await advanceFromSizesStep();

  fireEvent.change(screen.getByLabelText('Vefslóð fyrirtækisins *'), {
    target: { value: 'https://blomabud.is' },
  });
  fireEvent.click(screen.getByText('Búa til tillögur'));

  expect(
    await screen.findByText('Hámarksfjöldi textatillagna á dag er náður. Reyndu aftur á morgun.'),
  ).toBeDefined();
});

test('a 429 from the render endpoint surfaces the API-provided daily-limit message', async () => {
  mockedApiFetch
    .mockResolvedValueOnce(COPY_MANIFEST as any)
    .mockRejectedValueOnce(
      new ApiError(
        429,
        'RATE_LIMITED',
        'Hámarksfjöldi útlitsgerða á dag er náður. Reyndu aftur á morgun.',
      ),
    );

  renderWithClient(<CreativeGenerator onComplete={vi.fn()} />);
  await advanceFromSizesStep();
  await generateCopy();
  fireEvent.click(screen.getByText('Blómabúð Vesturbæjar'));
  fireEvent.click(screen.getByText('Halda áfram í útlit →'));
  await screen.findByText('Áberandi (bold)');
  fireEvent.click(screen.getByText('Útbúa útlit →'));

  expect(
    await screen.findByText('Hámarksfjöldi útlitsgerða á dag er náður. Reyndu aftur á morgun.'),
  ).toBeDefined();
});

// Finding #4: an empty 7-day forecast window is common at current scale —
// the API reports `forecastShare: null` in that case (rather than a
// misleading 0 on every size) and the UI must fall back to slot counts only.
test('Finding #4: omits the forecast-share clause entirely when forecastShare is null', async () => {
  mockedApiFetch.mockResolvedValueOnce({
    sizes: [{ width: 300, height: 250, slotCount: 2, forecastShare: null }],
  } as any);

  renderWithClient(<CreativeGenerator onComplete={vi.fn()} categories={['matur']} />);

  expect(await screen.findByText('birtist á 2 plássum')).toBeDefined();
  expect(screen.queryByText(/af áætluðum birtingum/)).toBeNull();
});

// Finding #9: a real-but-small forecastShare that rounds down to a
// displayed 0% must read "minna en 1%", not "um 0%" (which would misread as
// exactly zero traffic for that size).
test('Finding #9: shows "minna en 1%" instead of "um 0%" for a small nonzero forecastShare', async () => {
  mockedApiFetch.mockResolvedValueOnce({
    sizes: [{ width: 300, height: 250, slotCount: 5, forecastShare: 0.003 }],
  } as any);

  renderWithClient(<CreativeGenerator onComplete={vi.fn()} categories={['matur']} />);

  expect(
    await screen.findByText('birtist á 5 plássum — minna en 1% af áætluðum birtingum'),
  ).toBeDefined();
  expect(screen.queryByText(/um 0%/)).toBeNull();
});

// Blocker B1 (defensive, client-side): even though the server already
// filters to IAB sizes, a non-IAB size reaching the render call would 400
// and dead-end the wizard — this proves the client-side intersect catches
// that independently of the server-side fix.
test('B1 (defensive): excludes a non-IAB size returned by the sizes endpoint from the render request', async () => {
  mockedApiFetch
    .mockResolvedValueOnce({
      sizes: [
        { width: 970, height: 250, slotCount: 4, forecastShare: 0.5 }, // non-IAB
        { width: 300, height: 250, slotCount: 4, forecastShare: 0.5 }, // IAB
      ],
    } as any)
    .mockResolvedValueOnce(COPY_MANIFEST as any)
    .mockResolvedValueOnce(renderedManifestFor('gen_a') as any);

  renderWithClient(<CreativeGenerator onComplete={vi.fn()} categories={['matur']} />);

  // a. Stærðir — wait for the (unfiltered, informational) list to render,
  // then advance.
  await screen.findByText('300 × 250');
  fireEvent.click(screen.getByText('Halda áfram →'));
  await screen.findByLabelText('Vefslóð fyrirtækisins *');

  // b. Texti
  await generateCopy();
  fireEvent.click(screen.getByText('Blómabúð Vesturbæjar'));
  fireEvent.click(screen.getByText('Halda áfram í útlit →'));

  // c. Útlit
  await screen.findByText('Áberandi (bold)');
  fireEvent.click(screen.getByText('Útbúa útlit →'));

  await waitFor(() =>
    expect(mockedApiFetch).toHaveBeenCalledWith('/v1/creatives/generate/render', {
      method: 'POST',
      body: JSON.stringify({
        variantId: 'gen_a',
        editedCopy: undefined,
        sizes: [{ width: 300, height: 250 }],
        templateId: 'bold',
      }),
    }),
  );
});

// Finding #10: regenerating still spends one of the advertiser's daily
// render slots — the wizard should say so next to the button, not just
// silently consume it.
test('Finding #10: warns that "Endurgera útlit" spends one of the daily render allotments', async () => {
  mockedApiFetch
    .mockResolvedValueOnce(COPY_MANIFEST as any)
    .mockResolvedValueOnce(renderedManifestFor('gen_a') as any);

  renderWithClient(<CreativeGenerator onComplete={vi.fn()} />);
  await advanceFromSizesStep();
  await generateCopy();
  fireEvent.click(screen.getByText('Blómabúð Vesturbæjar'));
  fireEvent.click(screen.getByText('Halda áfram í útlit →'));
  await screen.findByText('Áberandi (bold)');
  fireEvent.click(screen.getByText('Útbúa útlit →'));
  await screen.findByText('300x250');

  expect(
    screen.getByText('Endurgerð notar eitt af 10 leyfðum útlitsgerðum dagsins.'),
  ).toBeDefined();
});

// Task 5 (creative-logo-embed, 2026-08-08): the Útlit step surfaces
// manifest.logo before it's ever composited into a rendered banner, with
// explicit skip / upload-your-own affordances alongside it.
const LOGO = {
  url: 'https://storage.example.test/creatives/adv_1/logo_x.png',
  storagePath: 'creatives/adv_1/logo_x.png',
  mime: 'image/png',
  source: 'scraped',
};

async function walkToUtlitStep(manifestWithLogo: unknown) {
  mockedApiFetch.mockResolvedValueOnce(manifestWithLogo as any);
  renderWithClient(<CreativeGenerator onComplete={vi.fn()} />);
  await advanceFromSizesStep();
  await generateCopy();
  fireEvent.click(screen.getByText('Blómabúð Vesturbæjar'));
  fireEvent.click(screen.getByText('Halda áfram í útlit →'));
  await screen.findByText('Áberandi (bold)');
}

test('utlit step shows the scraped logo with skip and upload actions', async () => {
  await walkToUtlitStep({ ...COPY_MANIFEST, logo: LOGO });

  expect(screen.getByAltText('Lógó auglýsanda')).toBeDefined();
  expect(screen.getByRole('button', { name: 'Sleppa lógói' })).toBeDefined();
  expect(screen.getByLabelText('Hlaða upp eigin lógói')).toBeDefined();
});

test('skip calls DELETE and removes the logo preview', async () => {
  await walkToUtlitStep({ ...COPY_MANIFEST, logo: LOGO });
  expect(screen.getByAltText('Lógó auglýsanda')).toBeDefined();

  mockedApiFetch.mockResolvedValueOnce({ ...COPY_MANIFEST, logo: null } as any);

  fireEvent.click(screen.getByRole('button', { name: 'Sleppa lógói' }));

  await waitFor(() =>
    expect(mockedApiFetch).toHaveBeenCalledWith('/v1/creatives/generate/logo', {
      method: 'DELETE',
    }),
  );
  await waitFor(() => {
    expect(screen.queryByAltText('Lógó auglýsanda')).toBeNull();
  });
});

test('utlit step without a logo shows only the upload affordance', async () => {
  await walkToUtlitStep({ ...COPY_MANIFEST, logo: null });

  expect(screen.queryByAltText('Lógó auglýsanda')).toBeNull();
  expect(screen.getByLabelText('Hlaða upp eigin lógói')).toBeDefined();
});
