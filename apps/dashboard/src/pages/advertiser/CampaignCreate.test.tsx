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
  // The confirm step's VSK note links to /faq; an anchor is all the tests need.
  Link: ({ to, children, ...rest }: any) => (
    <a href={typeof to === 'string' ? to : '#'} {...rest}>
      {children}
    </a>
  ),
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

function setupApiMock(
  onCreateCampaign?: (body: any) => void,
  overrides?: { wallet?: unknown; createError?: Error },
) {
  mockedApiFetch.mockImplementation(async (url: unknown, opts?: unknown) => {
    const u = url as string;
    const o = (opts ?? {}) as { method?: string; body?: string };
    if (u === '/v1/advertisers/me/wallet') return (overrides?.wallet ?? WALLET) as any;
    if (u === '/v1/categories/inventory') return CATEGORY_INVENTORY as any;
    if (u.startsWith('/v1/categories/sizes')) return SIZES_RESPONSE as any;
    if (u === '/v1/creatives/generate/copy') return COPY_MANIFEST as any;
    if (u === '/v1/creatives/generate/render') return RENDERED_MANIFEST as any;
    if (u === '/v1/creatives/generate/confirm') return CREATED_CREATIVES as any;
    if (u === '/v1/campaigns' && o.method === 'POST') {
      if (overrides?.createError) throw overrides.createError;
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

// Real-world bug (2026-08-08): the wallet endpoint returns balanceIsk,
// committedIsk and availableIsk, but the confirm step compared the campaign
// total against GROSS balance. An advertiser whose entire balance was
// committed to another active campaign saw "Nóg inneign — engin áfylling
// þarf" and then hit the server's raw English INSUFFICIENT_FUNDS rejection.
test('confirm step uses AVAILABLE balance, not gross: fully-committed wallet shows top-up path and the committed breakdown', async () => {
  // Gross balance comfortably covers the campaign total; ONLY the available
  // figure fails. This is what pins the fix: with the old gross-balance gate
  // this wallet passes and the test fails.
  setupApiMock(undefined, {
    wallet: { advertiserId: 'adv_1', balanceIsk: 100_000, committedIsk: 100_000, availableIsk: 0 },
  });
  renderWithClient();
  await fillBasicsAndProceed();
  await selectCategoryAndProceed();
  await completeWizardThroughToStepFour();

  expect(screen.queryByText('Nóg inneign — engin áfylling þarf')).toBeNull();
  expect(screen.getByText('Fylla fyrst á veskið')).toBeDefined();
  expect(screen.getByText(/frátekið í aðrar herferðir/)).toBeDefined();
});

// Real-world bug (2026-08-09): the confirm step gated on budget + 24% VSK
// while POST /v1/campaigns sends budget.totalIsk and the server admits the
// campaign on available >= that figure. The UI was strictly stricter than the
// thing that takes the money, and since an insufficient wallet swaps the
// confirm button for a top-up link, an advertiser holding exactly their
// budget could not buy at all.
test('confirm step gates on the budget the server charges, not budget + VSK', async () => {
  // Default wizard budget is 20.000 kr; VSK would put the old gate at 24.800.
  // Available is exactly the budget: passes the server's rule, failed the old
  // UI rule. This is what pins the fix — restore `grandTotal` in the gate and
  // this test goes red.
  setupApiMock(undefined, {
    wallet: { advertiserId: 'adv_1', balanceIsk: 20_000, committedIsk: 0, availableIsk: 20_000 },
  });
  renderWithClient();
  await fillBasicsAndProceed();
  await selectCategoryAndProceed();
  await completeWizardThroughToStepFour();

  expect(screen.getByText('Nóg inneign — engin áfylling þarf')).toBeDefined();
  expect(screen.getByText('Hefja birtingu af inneign')).toBeDefined();
});

test('a genuinely short wallet still shows the top-up path, with the shortfall net of VSK', async () => {
  // 15.000 available against a 20.000 budget: short under either rule, so the
  // top-up path must survive the fix. The quoted shortfall is the 5.000 the
  // server actually needs, not 9.800 (the old budget + VSK arithmetic).
  setupApiMock(undefined, {
    wallet: { advertiserId: 'adv_1', balanceIsk: 15_000, committedIsk: 0, availableIsk: 15_000 },
  });
  renderWithClient();
  await fillBasicsAndProceed();
  await selectCategoryAndProceed();
  await completeWizardThroughToStepFour();

  expect(screen.queryByText('Nóg inneign — engin áfylling þarf')).toBeNull();
  expect(screen.getByText('Fylla fyrst á veskið')).toBeDefined();
  expect(screen.getByText(/Vantar 5\.000 kr\./)).toBeDefined();

  // The top-up path carries the shortfall with it, so TopUp opens prefilled
  // on the 5.000 the advertiser actually needs instead of a hardcoded 20.000.
  fireEvent.click(screen.getByText('Fylla fyrst á veskið'));
  expect(mockNavigate).toHaveBeenCalledWith('/advertiser/topup?amount=5000');
});

test('the confirm step shows no VSK line and totals exactly what the server debits', async () => {
  // Owner decision 2026-08-12 (see the blueprint's Product direction): the old
  // "VSK (24%)" row and budget+24% "Samtals" showed a figure that was never
  // debited and contradicted TopUp/FaqPage. The total must be the budget
  // itself — the exact amount POST /v1/campaigns takes — with the VSK
  // explanation deferred to the FAQ.
  setupApiMock();
  renderWithClient();
  await fillBasicsAndProceed();
  await selectCategoryAndProceed();
  await completeWizardThroughToStepFour();

  expect(screen.queryByText(/VSK \(24%\)/)).toBeNull();
  expect(screen.queryByText('Samtals')).toBeNull();
  expect(screen.getByText('Dregst af inneign')).toBeDefined();
  // Budget 20.000 with no 24% added: 24.800 must appear nowhere.
  expect(screen.queryByText(/24\.800/)).toBeNull();
  expect(screen.getByText(/Nánar um VSK/)).toBeDefined();
});

test('a wallet response without availableIsk (old shape) falls back to gross balance', async () => {
  // The default WALLET fixture is the old shape with a large balance — the
  // sufficient path must keep working exactly as before.
  setupApiMock();
  renderWithClient();
  await fillBasicsAndProceed();
  await selectCategoryAndProceed();
  await completeWizardThroughToStepFour();

  expect(screen.getByText('Nóg inneign — engin áfylling þarf')).toBeDefined();
  expect(screen.getByText('Hefja birtingu af inneign')).toBeDefined();
});

test('a server-side INSUFFICIENT_FUNDS rejection surfaces as Icelandic copy, not the raw English message', async () => {
  const { ApiError } = await import('@/lib/api');
  setupApiMock(undefined, {
    // Sufficient-looking wallet (race: funds committed elsewhere between load
    // and submit) so the submit button renders and the server rejects.
    createError: new (ApiError as any)(
      400,
      'INSUFFICIENT_FUNDS',
      'Insufficient available balance (balance 19980 ISK, committed to other campaigns 19980 ISK, available 0 ISK) for campaign budget of 15000 ISK',
    ),
  });
  renderWithClient();
  await fillBasicsAndProceed();
  await selectCategoryAndProceed();
  await completeWizardThroughToStepFour();

  fireEvent.click(screen.getByText('Hefja birtingu af inneign'));

  await screen.findByText(/Laus inneign nægir ekki/);
  expect(screen.queryByText(/Insufficient available balance/)).toBeNull();
});
