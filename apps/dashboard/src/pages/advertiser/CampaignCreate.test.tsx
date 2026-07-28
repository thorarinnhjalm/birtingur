import { test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CampaignCreate from './CampaignCreate';
import { apiFetch } from '@/lib/api';

// Mocked without `importActual`, same reasoning as CreativeGenerator.test.tsx:
// the real module chain pulls in '@/lib/firebase', which eagerly initializes
// the Firebase SDK and hangs indefinitely in a network-less test sandbox.
// CampaignCreate (and everything it renders, including CreativeGenerator)
// only ever calls `apiFetch`, so that's mocked directly.
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

vi.mock('@/lib/firebase', () => ({ storage: {} }));
vi.mock('firebase/storage', () => ({
  ref: vi.fn(),
  uploadBytes: vi.fn(),
  getDownloadURL: vi.fn(),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

const mockedApiFetch = vi.mocked(apiFetch);

const WALLET = { advertiserId: 'adv_1', balanceIsk: 1_000_000 };
const CATEGORY_INVENTORY = [
  {
    category: 'matur',
    avgDailyImpressions: 1000,
    committedDailyImpressions: 0,
    availableDailyImpressions: 1000,
  },
];
const SIZES_RESPONSE = {
  sizes: [{ width: 300, height: 250, slotCount: 3, forecastShare: 0.6 }],
};

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
  ],
};

const RENDERED_MANIFEST = {
  ...COPY_MANIFEST,
  status: 'rendered',
  variants: [
    {
      ...COPY_MANIFEST.variants[0],
      templateId: 'bold',
      images: [
        {
          sizeKey: '300x250',
          width: 300,
          height: 250,
          url: 'https://storage.example.test/gen_a-300x250.png',
        },
        {
          sizeKey: '728x90',
          width: 728,
          height: 90,
          url: 'https://storage.example.test/gen_a-728x90.png',
        },
      ],
    },
  ],
};

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

function setupApiMock(onCreateCampaign?: (body: any) => void) {
  mockedApiFetch.mockImplementation(async (url: unknown, opts?: unknown) => {
    const u = url as string;
    const o = (opts ?? {}) as { method?: string; body?: string };
    if (u === '/v1/advertisers/me/wallet') return WALLET as any;
    if (u === '/v1/categories/inventory') return CATEGORY_INVENTORY as any;
    if (u.startsWith('/v1/categories/sizes')) return SIZES_RESPONSE as any;
    if (u === '/v1/creatives/generate/copy') return COPY_MANIFEST as any;
    if (u === '/v1/creatives/generate/render') return RENDERED_MANIFEST as any;
    if (u === '/v1/creatives/generate/confirm') return CREATED_CREATIVES as any;
    if (u === '/v1/campaigns' && o.method === 'POST') {
      onCreateCampaign?.(JSON.parse(o.body ?? '{}'));
      return { id: 'cmp_1' } as any;
    }
    throw new Error(`Unhandled apiFetch call in test: ${o.method ?? 'GET'} ${u}`);
  });
}

function renderWithClient() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <CampaignCreate />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockedApiFetch.mockReset();
  mockNavigate.mockReset();
});

async function fillBasicsAndProceed() {
  await screen.findByLabelText('Heiti herferðar *');
  fireEvent.change(screen.getByLabelText('Heiti herferðar *'), {
    target: { value: 'Sumarherferð' },
  });
  fireEvent.change(screen.getByLabelText('Byrjar þann *'), { target: { value: '2026-08-01' } });
  fireEvent.click(screen.getByText('Næsta skref →'));
}

async function selectCategoryAndProceed() {
  await screen.findByText('Matur & matreiðsla');
  fireEvent.click(screen.getByText('Matur & matreiðsla'));
  fireEvent.click(screen.getByText('Næsta skref →'));
}

async function completeWizardThroughToStepFour() {
  // a. Stærðir
  await screen.findByText('300 × 250');
  fireEvent.click(screen.getByText('Halda áfram →'));

  // b. Texti
  await screen.findByLabelText('Vefslóð fyrirtækisins *');
  fireEvent.change(screen.getByLabelText('Vefslóð fyrirtækisins *'), {
    target: { value: 'https://blomabud.is' },
  });
  fireEvent.click(screen.getByText('Búa til tillögur'));
  await screen.findByText('Blómabúð Vesturbæjar');
  fireEvent.click(screen.getByText('Blómabúð Vesturbæjar'));
  fireEvent.click(screen.getByText('Halda áfram í útlit →'));

  // c. Útlit
  await screen.findByText('Áberandi (bold)');
  fireEvent.click(screen.getByText('Útbúa útlit →'));

  // d. Yfirferð
  await screen.findByText('300x250');
  fireEvent.click(screen.getByText(/Þú berð ábyrgð/));
  fireEvent.click(screen.getByText('Staðfesta og vista auglýsingu'));

  await waitFor(() => expect(screen.getByText('Yfirlit og staðfesting')).toBeDefined());
}

// Blocker B2 (adversarial review): the wizard renders N sizes and creates N
// real Creative docs, but the old code picked ONE and submitted
// `creativeIds: [creative.id]` — push-cache resolves campaigns to slots by
// size match, so a campaign carrying only a 300x250 creative never fills a
// 728x90 slot the wizard also just rendered for it. This proves every
// wizard-produced creative id reaches the create-campaign call.
test('B2: submits every wizard-rendered creative id, not just the preview thumbnail', async () => {
  let createdBody: any = null;
  setupApiMock((body) => {
    createdBody = body;
  });

  renderWithClient();
  await fillBasicsAndProceed();
  await selectCategoryAndProceed();
  await completeWizardThroughToStepFour();

  // Step 4: "N stærðir" summary is visible for a multi-size wizard result.
  expect(screen.getByText('2 stærðir')).toBeDefined();

  fireEvent.click(screen.getByText('Hefja birtingu af inneign'));

  await waitFor(() => expect(createdBody).not.toBeNull());
  expect(createdBody.creativeIds.sort()).toEqual(['crt_1', 'crt_2']);
});

// Finding #3 (adversarial review): CreativeGenerator is only mounted while
// `step === 3`, so navigating away and back used to unmount/remount it,
// resetting all of its internal wizard state and forcing a full copy+render
// redo (burning rate-limit slots, creating duplicate Creative docs). Fixed
// by showing a completed-state panel instead of a fresh wizard when the
// parent already holds wizard-produced creatives.
test('Finding #3: returning to step 3 shows a completed panel instead of a fresh wizard, both nav directions work', async () => {
  setupApiMock();
  renderWithClient();
  await fillBasicsAndProceed();
  await selectCategoryAndProceed();
  await completeWizardThroughToStepFour();

  const copyCallsBeforeBack = mockedApiFetch.mock.calls.filter(
    ([u]) => u === '/v1/creatives/generate/copy',
  ).length;

  // Navigate step 4 -> step 3.
  fireEvent.click(screen.getByText('Til baka'));

  // Completed panel, not the fresh wizard's "Stærðir" explainer.
  expect(await screen.findByText('2 stærðir tilbúnar')).toBeDefined();
  expect(
    screen.queryByText(
      'Flokkarnir sem þú valdir í Kaup-skrefinu ráða því á hvaða stærðum auglýsingin þín birtist — hér sérðu dreifinguna áður en nokkuð er búið til.',
    ),
  ).toBeNull();

  // "Halda áfram →" goes forward to step 4 again without re-running the wizard.
  fireEvent.click(screen.getByText('Halda áfram →'));
  await screen.findByText('Yfirlit og staðfesting');
  const copyCallsAfterForward = mockedApiFetch.mock.calls.filter(
    ([u]) => u === '/v1/creatives/generate/copy',
  ).length;
  expect(copyCallsAfterForward).toBe(copyCallsBeforeBack);

  // Back to step 3, then explicitly restart — THIS should show the fresh wizard.
  fireEvent.click(screen.getByText('Til baka'));
  await screen.findByText('2 stærðir tilbúnar');
  fireEvent.click(screen.getByText('Byrja upp á nýtt'));

  expect(
    await screen.findByText(
      'Flokkarnir sem þú valdir í Kaup-skrefinu ráða því á hvaða stærðum auglýsingin þín birtist — hér sérðu dreifinguna áður en nokkuð er búið til.',
    ),
  ).toBeDefined();
});
