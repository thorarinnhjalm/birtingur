# Extend Completed Campaign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an advertiser extend a `completed` campaign that still has leftover budget: new `endsAt`, leftover re-reserved through the committed-funds gate, status back to `active`. Dashboard-only.

**Architecture:** New `extendCampaign` service function runs the same Firestore-transaction + `fundsVersion`-bump pattern as `createCampaign` (services/campaigns.ts), then reseeds serving state via `pushCacheForCampaign`. New `POST /v1/campaigns/:id/extend` route mirrors approve/reject auth (ID tokens only). Dashboard replaces the broken "Ræsa herferð" button on completed campaigns with a "Framlengja herferð" modal.

**Tech Stack:** Hono (API), firebase-admin Firestore transactions, Upstash Redis, Zod, Vitest + Firestore emulator, React 19 + TanStack Query.

**Spec:** `docs/superpowers/specs/2026-08-01-extend-completed-campaign-design.md`

## Global Constraints

- All money in integer ISK; no ledger entries are created by extension.
- The two existing "Completed campaigns cannot be reactivated" guards (services/campaigns.ts:362 and :576) stay untouched.
- API tests need the Firestore emulator: run via `pnpm test:api` from repo root (or wrap single files in `firebase --config firebase/firebase.json emulators:exec`). Never bare `vitest` for `@ada/api`.
- Dashboard user-facing copy is Icelandic; code, comments, commits English.
- `pnpm verify` must pass before every push (pre-push hook enforces).

---

### Task 1: `extendCampaign` service function with emulator tests

**Files:**

- Modify: `apps/api/src/services/campaigns.ts` (add function after `updateCampaignStatus`, ~line 618)
- Test: `apps/api/tests/campaign-extend.test.ts` (new)

**Interfaces:**

- Consumes: `getAvailableBalanceInTransaction(t, advertiserId, opts?)` from `./wallet.js` (already imported), `pushCacheForCampaign` from `../lib/push-cache.js` (already imported), `FieldValue` from `firebase-admin/firestore` (already imported), `AppError`, `campaignConverter`, `CampaignSchema`, `isRedisConfigured`.
- Produces: `extendCampaign(campaignId: string, advertiserId: string, newEndsAt: Date): Promise<Campaign>` — throws `AppError(404 NOT_FOUND | 400 BAD_REQUEST | 400 NO_REMAINING_BUDGET | 400 INSUFFICIENT_FUNDS)`. Task 2's route calls exactly this.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/tests/campaign-extend.test.ts`. Reuse the seeding helpers from `wallet-reservation.test.ts` (copy them — tests don't share helpers across files in this suite):

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { clearFirestoreEmulator } from './helpers/emulator';
import { createAdvertiser } from '../src/services/advertisers';
import { createCreative } from '../src/services/creatives';
import { StubAutoScanner } from '../src/services/auto-scan/stub';
import {
  createCampaign,
  extendCampaign,
  getCampaign,
  sweepExpiredCampaigns,
  type CreateCampaignInput,
} from '../src/services/campaigns';
import { topUp } from '../src/services/wallet';
import { db } from '../src/lib/firebase';
import { COLLECTIONS } from '@ada/shared/firestore';
import type { Advertiser, Creative } from '@ada/shared';

describe('extendCampaign', () => {
  beforeEach(async () => {
    await clearFirestoreEmulator();
  });

  async function seedFundedAdvertiser(balanceIsk: number): Promise<{
    adv: Advertiser;
    creative: Creative;
  }> {
    const adv = await createAdvertiser({
      ownerEmail: 'adv@campaign-extend.test.is',
      companyName: 'Extend Test ehf.',
      kennitala: '1234567890',
      vatNumber: '1',
    });
    if (balanceIsk > 0) {
      await topUp(adv.id, balanceIsk, `topup_${adv.id}`);
    }
    const creative = await createCreative(
      adv.id,
      {
        imageUrl: 'https://example.com/a.png',
        width: 728,
        height: 90,
        clickUrl: 'https://blomabud.is/saett',
      },
      new StubAutoScanner(),
    );
    return { adv, creative };
  }

  function campaignInput(creativeId: string, totalIsk: number): CreateCampaignInput {
    return {
      creativeIds: [creativeId],
      categories: ['matur'],
      schedule: {
        // already-expired flight so sweepExpiredCampaigns completes it
        startsAt: new Date(Date.now() - 7 * 24 * 3600 * 1000),
        endsAt: new Date(Date.now() - 24 * 3600 * 1000),
      },
      budget: { mode: 'cpm_capped', totalIsk },
    };
  }

  /** Create a campaign on an expired flight and sweep it to `completed`. */
  async function seedCompletedCampaign(adv: Advertiser, creative: Creative, totalIsk: number) {
    const cmp = await createCampaign(adv.id, campaignInput(creative.id, totalIsk), {
      channel: 'dashboard',
    });
    await sweepExpiredCampaigns();
    const swept = await getCampaign(cmp.id);
    expect(swept!.status).toBe('completed');
    return swept!;
  }

  const tomorrow = () => new Date(Date.now() + 24 * 3600 * 1000);

  it('reactivates a completed campaign with leftover budget', async () => {
    const { adv, creative } = await seedFundedAdvertiser(10_000);
    const cmp = await seedCompletedCampaign(adv, creative, 10_000);

    const newEndsAt = tomorrow();
    const extended = await extendCampaign(cmp.id, adv.id, newEndsAt);

    expect(extended.status).toBe('active');
    expect(extended.schedule.endsAt.getTime()).toBe(newEndsAt.getTime());
    const persisted = await getCampaign(cmp.id);
    expect(persisted!.status).toBe('active');
    expect(persisted!.budget.remainingIsk).toBe(10_000);
  });

  it('rejects when another campaign holds the funds', async () => {
    const { adv, creative } = await seedFundedAdvertiser(10_000);
    const expired = await seedCompletedCampaign(adv, creative, 10_000);
    // Completion released the hold — this second campaign takes it all.
    await createCampaign(
      adv.id,
      {
        ...campaignInput(creative.id, 10_000),
        schedule: {
          startsAt: new Date(),
          endsAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        },
      },
      { channel: 'dashboard' },
    );

    await expect(extendCampaign(expired.id, adv.id, tomorrow())).rejects.toMatchObject({
      status: 400,
      code: 'INSUFFICIENT_FUNDS',
    });
    expect((await getCampaign(expired.id))!.status).toBe('completed');
  });

  it('rejects when the campaign has no remaining budget', async () => {
    const { adv, creative } = await seedFundedAdvertiser(10_000);
    const cmp = await seedCompletedCampaign(adv, creative, 10_000);
    // Zero the leftover directly: accrual (not chargeCampaign) is what
    // decrements remainingIsk in production, and running the whole accrual
    // pipeline here would test the wrong unit.
    await db.collection(COLLECTIONS.campaigns).doc(cmp.id).update({ 'budget.remainingIsk': 0 });

    await expect(extendCampaign(cmp.id, adv.id, tomorrow())).rejects.toMatchObject({
      status: 400,
      code: 'NO_REMAINING_BUDGET',
    });
  });

  it('rejects a campaign that is not completed', async () => {
    const { adv, creative } = await seedFundedAdvertiser(10_000);
    const cmp = await createCampaign(
      adv.id,
      {
        ...campaignInput(creative.id, 10_000),
        schedule: {
          startsAt: new Date(),
          endsAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        },
      },
      { channel: 'dashboard' },
    );

    await expect(extendCampaign(cmp.id, adv.id, tomorrow())).rejects.toMatchObject({
      status: 400,
    });
  });

  it('rejects a past endsAt', async () => {
    const { adv, creative } = await seedFundedAdvertiser(10_000);
    const cmp = await seedCompletedCampaign(adv, creative, 10_000);

    await expect(
      extendCampaign(cmp.id, adv.id, new Date(Date.now() - 3600 * 1000)),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rejects another advertiser's campaign", async () => {
    const { adv, creative } = await seedFundedAdvertiser(10_000);
    const cmp = await seedCompletedCampaign(adv, creative, 10_000);
    const other = await createAdvertiser({
      ownerEmail: 'other@campaign-extend.test.is',
      companyName: 'Other ehf.',
      kennitala: '0987654321',
      vatNumber: '2',
    });

    await expect(extendCampaign(cmp.id, other.id, tomorrow())).rejects.toMatchObject({
      status: 404,
    });
  });

  it('serializes extend against a concurrent create (oversubscription race)', async () => {
    const { adv, creative } = await seedFundedAdvertiser(10_000);
    const expired = await seedCompletedCampaign(adv, creative, 10_000);

    const results = await Promise.allSettled([
      extendCampaign(expired.id, adv.id, tomorrow()),
      createCampaign(
        adv.id,
        {
          ...campaignInput(creative.id, 10_000),
          schedule: {
            startsAt: new Date(),
            endsAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
          },
        },
        { channel: 'dashboard' },
      ),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled).toHaveLength(1); // wallet covers exactly one of the two
  });
});
```

(Deliberately no `chargeCampaign` here: its signature is `(advertiserId, campaignId, amountIsk)` and it only appends a ledger debit — it never touches `budget.remainingIsk`, which is decremented by the accrual cron in production.)

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test:api -- tests/campaign-extend.test.ts
```

Expected: FAIL — `extendCampaign` is not exported.

- [ ] **Step 3: Implement `extendCampaign`**

In `apps/api/src/services/campaigns.ts`, after `updateCampaignStatus` (~line 618):

```ts
/**
 * Extend a COMPLETED campaign that still has leftover budget: new endsAt,
 * status back to `active`. The two "cannot be reactivated" guards above
 * exist because a generic status flip would re-acquire a wallet hold
 * without passing the committed-funds gate — this path exists precisely to
 * go THROUGH that gate, using the same transaction + fundsVersion-bump
 * serialization as createCampaign, so the invariant holds by construction.
 * Dashboard-only by policy (route rejects ak_ keys); no MCP path commits
 * funds.
 */
export async function extendCampaign(
  campaignId: string,
  advertiserId: string,
  newEndsAt: Date,
): Promise<Campaign> {
  if (newEndsAt.getTime() <= Date.now()) {
    throw new AppError(400, 'endsAt must be in the future', 'BAD_REQUEST');
  }

  const advRef = db.collection(COLLECTIONS.advertisers).doc(advertiserId);
  const cmpRef = db
    .collection(COLLECTIONS.campaigns)
    .doc(campaignId)
    .withConverter(campaignConverter);

  const extended = await db.runTransaction(async (t: Transaction): Promise<Campaign> => {
    const snap = await t.get(cmpRef);
    const existing = snap.exists ? snap.data()! : null;
    if (!existing || existing.advertiserId !== advertiserId) {
      throw new AppError(404, 'Campaign not found', 'NOT_FOUND');
    }
    if (existing.status !== 'completed') {
      throw new AppError(400, 'Only completed campaigns can be extended', 'BAD_REQUEST');
    }
    if (existing.budget.remainingIsk <= 0) {
      throw new AppError(
        400,
        'Campaign has no remaining budget to extend with',
        'NO_REMAINING_BUDGET',
      );
    }

    // Completed campaigns are not fund-holding, so the leftover is currently
    // released; excludeCampaignId is belt-and-braces should that ever change.
    const { availableIsk } = await getAvailableBalanceInTransaction(t, advertiserId, {
      excludeCampaignId: campaignId,
    });
    if (availableIsk < existing.budget.remainingIsk) {
      throw new AppError(
        400,
        `Insufficient available funds to re-reserve ${existing.budget.remainingIsk} ISK ` +
          `(available ${availableIsk} ISK)`,
        'INSUFFICIENT_FUNDS',
      );
    }

    const next = CampaignSchema.parse({
      ...existing,
      status: 'active',
      schedule: { ...existing.schedule, endsAt: newEndsAt },
    });

    // Same serialization write as createCampaign: forces concurrent
    // transactions on this advertiser to conflict and retry serially.
    t.update(advRef, { fundsVersion: FieldValue.increment(1) });
    // Targeted update (never whole-doc set): a concurrent accrual write to
    // budget.remainingIsk between our read and this write must survive.
    t.update(db.collection(COLLECTIONS.campaigns).doc(campaignId), {
      status: 'active',
      'schedule.endsAt': newEndsAt,
    });
    return next;
  });

  // Completion deleted budget:{id}/pace_limit:{id} and the serving gate is
  // fail-closed (missing key = 0) — reseed now so serving resumes without
  // waiting up to 10 min for cron-refresh-cache. pushCacheForCampaign sets
  // both keys from the fresh doc and restores slot mappings. Redis being
  // down is non-fatal: the cron reseeds, under-serving in the meantime.
  if (isRedisConfigured()) {
    await pushCacheForCampaign(campaignId);
  }

  return extended;
}
```

Check imports at the top of the file — `AppError`, `Transaction`, `FieldValue`, `CampaignSchema`, `campaignConverter`, `COLLECTIONS`, `db`, `getAvailableBalanceInTransaction`, `pushCacheForCampaign`, `isRedisConfigured` are all already imported (verify; add any missing).

Note the dotted-path update (`'schedule.endsAt'`): the campaign docs are written via `campaignConverter`; check how `updateCampaignStatus` (~line 604) writes its targeted update and mirror its exact mechanics (it uses `db.collection(...).doc(id).update(updates)` without the converter — do the same, and confirm the converter stores `schedule.endsAt` as a Firestore Timestamp; if it stores ISO strings, write the same representation the converter uses).

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test:api -- tests/campaign-extend.test.ts
```

Expected: all 7 PASS. Then the full API suite:

```bash
pnpm test:api
```

Expected: PASS, including the untouched PATCH-guard tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/campaigns.ts apps/api/tests/campaign-extend.test.ts
git commit -m "feat(api): extendCampaign service — completed campaigns re-enter through the funds gate"
```

---

### Task 2: `POST /v1/campaigns/:id/extend` route

**Files:**

- Modify: `apps/api/src/routes/campaigns.ts` (add route after the `/:id/reject` handler, ~line 100)
- Test: `apps/api/tests/campaign-extend-route.test.ts` (new)

**Interfaces:**

- Consumes: `extendCampaign(campaignId, advertiserId, newEndsAt)` from Task 1; existing route helpers `getAdvertiserByOwnerEmail`, `AppError`; Zod.
- Produces: `POST /v1/campaigns/:id/extend` accepting `{ endsAt: string }` (ISO date), returning the updated campaign JSON. 403 for `ak_` keys. Task 3's dashboard hook calls exactly this.

- [ ] **Step 1: Write the failing route tests**

Create `apps/api/tests/campaign-extend-route.test.ts`. Auth pattern from the existing suites: dashboard users are `Authorization: Bearer valid-token` with `vi.mocked(auth.verifyIdToken)` resolving to the owner's email (see `advertiser-routes.test.ts:254`); real `ak_` keys are minted with `issueApiKey(email, scope)` from `../src/services/api-keys` (see `api-keys.test.ts`, returns `{ key, id }`). Mirror `advertiser-routes.test.ts`'s `vi.mock` block for `../src/lib/firebase` (it mocks `auth` while keeping the emulator-backed `db`).

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { app } from '../src/index';
import { auth } from '../src/lib/firebase';
import { clearFirestoreEmulator } from './helpers/emulator';
import { issueApiKey } from '../src/services/api-keys';
// ...same vi.mock block for ../src/lib/firebase as advertiser-routes.test.ts,
// and the seedFundedAdvertiser/seedCompletedCampaign helpers from Task 1's file.

const OWNER = 'adv@extend-route.test.is';

function asDashboardUser() {
  vi.mocked(auth.verifyIdToken).mockResolvedValue({ email: OWNER } as never);
}

const tomorrowISO = () => new Date(Date.now() + 24 * 3600 * 1000).toISOString();

describe('POST /v1/campaigns/:id/extend', () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    await clearFirestoreEmulator();
  });

  it('extends a completed campaign for a dashboard user', async () => {
    const { adv, creative } = await seedFundedAdvertiser(10_000); // ownerEmail: OWNER
    const cmp = await seedCompletedCampaign(adv, creative, 10_000);
    asDashboardUser();

    const res = await app.request(`/v1/campaigns/${cmp.id}/extend`, {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ endsAt: tomorrowISO() }),
    });

    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe('active');
  });

  it('rejects ak_ API keys with 403', async () => {
    const { adv, creative } = await seedFundedAdvertiser(10_000);
    const cmp = await seedCompletedCampaign(adv, creative, 10_000);
    const { key } = await issueApiKey(OWNER, 'both');

    const res = await app.request(`/v1/campaigns/${cmp.id}/extend`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ endsAt: tomorrowISO() }),
    });

    expect(res.status).toBe(403);
  });

  it('400s on a missing endsAt body', async () => {
    const { adv, creative } = await seedFundedAdvertiser(10_000);
    const cmp = await seedCompletedCampaign(adv, creative, 10_000);
    asDashboardUser();

    const res = await app.request(`/v1/campaigns/${cmp.id}/extend`, {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });

  it('404s on an unknown campaign id', async () => {
    await seedFundedAdvertiser(10_000);
    asDashboardUser();

    const res = await app.request('/v1/campaigns/cmp_doesnotexist/extend', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ endsAt: tomorrowISO() }),
    });

    expect(res.status).toBe(404);
  });
});
```

Copy the `seedFundedAdvertiser`/`seedCompletedCampaign` helpers from Task 1's test file but set `ownerEmail: OWNER` so `getAdvertiserByOwnerEmail` resolves the mocked dashboard user to the seeded advertiser. Note `requireScope('advertiser')` guards the campaigns router — an `ak_` key needs advertiser scope to reach the handler at all; scope `'both'` (used above) passes that check, so the 403 asserted here is the route's own `user.apiKeyId` rejection, which is exactly what we're testing.

- [ ] **Step 2: Run to verify failure**

```bash
pnpm test:api -- tests/campaign-extend-route.test.ts
```

Expected: FAIL (404 route not found).

- [ ] **Step 3: Implement the route**

In `apps/api/src/routes/campaigns.ts` after the reject handler:

```ts
const ExtendBodySchema = z.object({ endsAt: z.coerce.date() });

campaignsRouter.post('/:id/extend', async (c) => {
  const user = c.get('user');
  // Extension re-acquires a wallet hold — dashboard-only, like approve/
  // reject and every other operation that commits funds.
  if (user.apiKeyId) {
    throw new AppError(403, 'API keys cannot extend campaigns', 'FORBIDDEN');
  }
  const adv = await getAdvertiserByOwnerEmail(user.email);
  if (!adv) {
    throw new AppError(404, 'Advertiser profile not found', 'NOT_FOUND');
  }
  const body = ExtendBodySchema.parse(await c.req.json());
  const cmp = await extendCampaign(c.req.param('id'), adv.id, body.endsAt);
  return c.json(cmp);
});
```

Add `extendCampaign` to the existing import from `../services/campaigns.js`, and `z` if not imported. Confirm Zod parse failures map to 400 in this app's error middleware (grep `ZodError` in `apps/api/src/index.ts` or middleware — if they throw 500, wrap the parse in try/catch and rethrow `AppError(400, 'Invalid body', 'BAD_REQUEST')`).

- [ ] **Step 4: Run tests**

```bash
pnpm test:api -- tests/campaign-extend-route.test.ts
pnpm test:api
```

Expected: PASS, full suite green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/campaigns.ts apps/api/tests/campaign-extend-route.test.ts
git commit -m "feat(api): POST /v1/campaigns/:id/extend — dashboard-only route"
```

---

### Task 3: Dashboard — Framlengja herferð flow (and remove the broken button)

**Files:**

- Modify: `apps/dashboard/src/hooks/useCampaigns.ts` (add hook after `useUpdateCampaign`, ~line 130)
- Modify: `apps/dashboard/src/pages/advertiser/CampaignDetail.tsx` (button block at lines 303–322; add modal near the existing edit modal)
- Test: `apps/dashboard/src/pages/advertiser/CampaignDetail.test.tsx` only if a component-test pattern already fits (see Step 4) — otherwise rely on typecheck/lint and the API tests; do not build new test infrastructure for this.

**Interfaces:**

- Consumes: `POST /v1/campaigns/:id/extend` from Task 2 via `apiFetch` (`apps/dashboard/src/lib/api.ts`); `useQueryClient`/`useMutation` (TanStack Query, same as `useUpdateCampaign`); `campaign.status`, `campaign.budget.remainingIsk` already on the page's campaign object.
- Produces: `useExtendCampaign()` hook returning a mutation with `mutateAsync({ id, endsAt })`.

- [ ] **Step 1: Add the hook**

In `apps/dashboard/src/hooks/useCampaigns.ts`, after `useUpdateCampaign` (match its style exactly):

```ts
export function useExtendCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, endsAt }: { id: string; endsAt: string }) =>
      apiFetch<Campaign>(`/v1/campaigns/${id}/extend`, {
        method: 'POST',
        body: JSON.stringify({ endsAt }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });
}
```

(Check how `useUpdateCampaign`'s `apiFetch` PATCH sets headers/body — mirror it exactly, including any `Content-Type` handling inside `apiFetch`.)

- [ ] **Step 2: Replace the completed-campaign button block**

In `CampaignDetail.tsx`, the block at lines 303–322 currently renders the toggle for every non-pending status. Change the logic to three cases:

```tsx
{
  campaign.status === 'completed' ? (
    campaign.budget.remainingIsk > 0 ? (
      <Button
        variant="primary"
        onClick={() => setIsExtendModalOpen(true)}
        className="text-xs font-bold py-2.5 px-4 flex items-center gap-1.5"
      >
        <Play size={14} />
        <span>Framlengja herferð</span>
      </Button>
    ) : (
      <span className="text-xs font-semibold text-slate-400">
        Herferðin kláraði fjárhæðina — lokið.
      </span>
    )
  ) : (
    campaign.status !== 'pending_approval' && (
      <Button
        variant={campaign.status === 'active' ? 'secondary' : 'primary'}
        onClick={toggleCampaignStatus}
        loading={toggling}
        className="text-xs font-bold py-2.5 px-4 flex items-center gap-1.5"
      >
        {campaign.status === 'active' ? (
          <>
            <Pause size={14} />
            <span>Stöðva birtingar</span>
          </>
        ) : (
          <>
            <Play size={14} />
            <span>Ræsa herferð</span>
          </>
        )}
      </Button>
    )
  );
}
```

- [ ] **Step 3: Add the extend modal**

State + handler at the top of the component (next to the existing edit-modal state):

```tsx
const [isExtendModalOpen, setIsExtendModalOpen] = useState(false);
const [extendEndsAt, setExtendEndsAt] = useState('');
const [extendError, setExtendError] = useState<string | null>(null);
const extendCampaignMutation = useExtendCampaign();

const handleExtend = async (e: React.FormEvent) => {
  e.preventDefault();
  setExtendError(null);
  try {
    await extendCampaignMutation.mutateAsync({
      id: campaign.id,
      endsAt: new Date(extendEndsAt).toISOString(),
    });
    setIsExtendModalOpen(false);
  } catch (err: any) {
    const msg = String(err?.message ?? '');
    if (msg.includes('INSUFFICIENT_FUNDS') || msg.includes('Insufficient')) {
      setExtendError('Ekki næg inneign í veskinu til að frátaka eftirstöðvarnar á ný.');
    } else if (msg.includes('NO_REMAINING_BUDGET')) {
      setExtendError('Herferðin á engar eftirstöðvar til að framlengja með.');
    } else {
      setExtendError('Ekki tókst að framlengja herferðina. Reyndu aftur.');
    }
  }
};
```

(Check what `apiFetch` throws on non-2xx — if the error carries a `code` property, match on `err.code` instead of message-sniffing.)

Modal JSX next to the existing edit modal, following the page's modal markup conventions (copy the edit modal's wrapper/overlay classes):

```tsx
{
  isExtendModalOpen && (
    <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
        <h2 className="text-lg font-bold text-slate-900 mb-2">Framlengja herferð</h2>
        <p className="text-sm text-slate-600 mb-4">
          Eftirstöðvar upp á {campaign.budget.remainingIsk.toLocaleString('is-IS')} kr. verða
          frátaknar á ný og birtingar hefjast strax.
        </p>
        <form onSubmit={handleExtend} className="space-y-4">
          <label className="block">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Nýr lokadagur
            </span>
            <input
              type="date"
              required
              min={new Date(Date.now() + 24 * 3600 * 1000).toISOString().split('T')[0]}
              value={extendEndsAt}
              onChange={(e) => setExtendEndsAt(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          {extendError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs font-medium text-red-600">
              {extendError}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setIsExtendModalOpen(false)} type="button">
              Hætta við
            </Button>
            <Button variant="primary" type="submit" loading={extendCampaignMutation.isPending}>
              Framlengja
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

Import `useExtendCampaign` alongside the existing `useCampaigns` imports. If the page already uses a shared `Modal` component (check the edit modal), use that instead of the raw overlay above.

- [ ] **Step 4: Component test — only if the pattern fits**

Look at `apps/dashboard/src/components/CreativeGenerator.test.tsx`. If it renders components with mocked hooks via `vi.mock`, add `CampaignDetail.test.tsx` with two cases: completed + `remainingIsk > 0` renders "Framlengja herferð" and no "Ræsa herferð"; completed + `remainingIsk === 0` renders the explanation text and neither button. If CampaignDetail's data-loading makes this disproportionate (router params, many queries), skip the component test — the button logic is simple conditional rendering and typecheck+lint+manual check cover it. Note the decision in the commit message.

- [ ] **Step 5: Verify**

```bash
pnpm --filter @ada/dashboard typecheck
pnpm --filter @ada/dashboard lint
pnpm --filter @ada/dashboard test
pnpm verify
```

Expected: all green (lint includes the marketing-claims checker — the new Icelandic strings must not trip it; "strax" is fine, but do not add "rauntíma"/"samstundis" style promises).

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/hooks/useCampaigns.ts apps/dashboard/src/pages/advertiser/CampaignDetail.tsx
git commit -m "feat(dashboard): Framlengja herferð flow; remove broken reactivate button on completed campaigns"
```

---

### Task 4: Full verification and push

**Files:** none new.

- [ ] **Step 1: Full test matrix**

```bash
pnpm test:api
pnpm --filter @ada/dashboard test
pnpm verify
```

Expected: everything green.

- [ ] **Step 2: Push (after owner confirmation if session rules require)**

```bash
git push
```

Pre-push hook runs `pnpm verify` again; expected green.
