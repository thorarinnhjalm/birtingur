# Payout Carry-Forward Implementation Plan (PR 1: payouts + reconciliation + 10k minimum)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publisher earnings carry forward until they reach a raised 10.000 kr minimum, payouts are idempotent and reviewable, VAT disbursement is on hold pending the accountant, and reconciliation watches the publisher side.

**Architecture:** `generateMonthlyPayouts` switches from an in-period sum to a cumulative basis (all credits up to periodEnd minus all prior payout DOCS — docs, not ledger entries, because the ledger `payout` entry only lands at `markPayoutCompleted`). Deterministic doc ids + `.create()` give idempotency. `reconciliation.ts` gains two read-only publisher checks. `MIN_PAYOUT_ISK` rises to 10000 with a public-copy sweep + prerender refresh. Spec: `docs/superpowers/specs/2026-08-08-payout-integrity-design.md` (Parts 1–2).

**Tech Stack:** firebase-admin Firestore (emulator tests), Hono, Zod, Vitest, React 19, the prerender pipeline (`apps/dashboard/prerender/`).

## Global Constraints

- ESM `.js` suffixes package-internally; `apps/api/tests/*` no-suffix style.
- API tests emulator-wrapped WITH the only-flag: `firebase --config firebase/firebase.json emulators:exec --only firestore "pnpm --filter @ada/api test -- tests/<file>.ts"`. Never two emulator runs concurrently.
- All money integer ISK. Reconciliation NEVER mutates money state. The cron only creates payout docs; disbursement stays the owner's manual transfer + mark-complete.
- After editing `@ada/shared`: `pnpm --filter @ada/shared build` before dependents.
- Copy sweep touches ONLY payout-minimum mentions (each 5.000-match judged in context — many 5.000s in the codebase are unrelated). Marketing copy must keep `check-marketing-claims.mjs` green.
- Prerender: `prerender:capture` renders the built `dist/`, so ALWAYS `pnpm --filter @ada/dashboard build` first; commit the refreshed `snapshots.json`.
- Branch: `feat/payout-carry-forward` off `docs/payout-integrity-design`. Never push `main` (oruggt-ship).

---

### Task 1: Cumulative payout basis, idempotent docs, breakdown, VAT hold

**Files:**

- Modify: `packages/shared/src/schemas/ledger.ts` (Payout schema additions)
- Modify: `apps/api/src/services/payouts.ts`
- Test: `apps/api/tests/payouts.test.ts` (new; emulator-backed)

**Interfaces:**

- Consumes: `appendLedger` (`./ledger.js`), `ledgerEntryConverter`/`payoutConverter`, `getPublisherById`, `MIN_PAYOUT_ISK`, `DEFAULT_PLATFORM_FEE_PERCENT`, `VAT_RATE` — all existing.
- Produces:

```ts
// PayoutSchema gains (all optional for backward compat with existing docs):
currentPeriodIsk: z.number().int().nonnegative().optional(),
carriedForwardIsk: z.number().int().nonnegative().optional(),

// payouts.ts
const DISBURSE_VAT = false; // accountant decision pending — see 2026-08-08 design §VAT hold
export function payoutDocId(publisherId: string, periodEnd: Date): string; // `pay_${publisherId}_${YYYYMM}`
// generateMonthlyPayouts(periodStart, periodEnd) keeps its signature; behavior changes as below.
// markPayoutCompleted: disbursed amount becomes netIsk + (DISBURSE_VAT ? vatIsk : 0).
```

- [ ] **Step 1: Write the failing tests**

Create `apps/api/tests/payouts.test.ts` following the emulator pattern of sibling service tests (real `db`, `clearFirestoreEmulator` from `./helpers/emulator` in `beforeEach`). Helpers:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/lib/firebase';
import { clearFirestoreEmulator } from './helpers/emulator';
import { generateMonthlyPayouts, markPayoutCompleted, payoutDocId } from '../src/services/payouts';
import { appendLedger } from '../src/services/ledger';
import { COLLECTIONS } from '@ada/shared/firestore';
import { MIN_PAYOUT_ISK } from '@ada/shared';

async function seedPublisher(id: string, vatNumber?: string) {
  await db
    .collection(COLLECTIONS.publishers)
    .doc(id)
    .set({
      id,
      ownerEmail: `${id}@example.is`,
      domain: `${id}.is`,
      displayName: id,
      contentPolicy: { blockedCategories: [], requireManualApproval: false },
      status: 'active',
      createdAt: new Date(),
      integrationPreference: 'widget',
      categories: ['matur'],
      ...(vatNumber ? { vatNumber } : {}),
    });
}

async function credit(publisherId: string, amountIsk: number, at: Date) {
  // appendLedger stamps createdAt itself; write directly when a specific
  // historical date is needed (match appendLedger's doc shape — open
  // services/ledger.ts and mirror it exactly, including the converter).
  await appendLedgerAt(
    {
      party: { type: 'publisher', id: publisherId },
      type: 'publisher_credit',
      amountIsk,
      relatedId: 'cmp_x',
    },
    at,
  );
}
```

(`appendLedgerAt` is a small test-local helper that writes the same doc shape `appendLedger` writes but with an explicit `createdAt` — read `services/ledger.ts` first and mirror its field names and converter usage.)

```ts
const P_START = new Date(Date.UTC(2026, 7, 1));
const P_END = new Date(Date.UTC(2026, 7, 31, 23, 59, 59));

beforeEach(async () => {
  await clearFirestoreEmulator();
});

describe('generateMonthlyPayouts — cumulative basis', () => {
  it('pays credits accumulated across earlier months once they cross the minimum', async () => {
    await seedPublisher('pub_small');
    await credit('pub_small', 4000, new Date(Date.UTC(2026, 5, 15))); // June
    await credit('pub_small', 4000, new Date(Date.UTC(2026, 6, 15))); // July
    await credit('pub_small', 4000, new Date(Date.UTC(2026, 7, 15))); // August (in period)

    const created = await generateMonthlyPayouts(P_START, P_END);
    expect(created).toHaveLength(1);
    expect(created[0]!.netIsk).toBe(12_000);
    expect(created[0]!.currentPeriodIsk).toBe(4_000);
    expect(created[0]!.carriedForwardIsk).toBe(8_000);
    expect(created[0]!.id).toBe(payoutDocId('pub_small', P_END));
  });

  it('skips a publisher below the minimum WITHOUT dropping the credits (payable next run)', async () => {
    await seedPublisher('pub_tiny');
    await credit('pub_tiny', 9_999, new Date(Date.UTC(2026, 6, 10)));
    expect(await generateMonthlyPayouts(P_START, P_END)).toHaveLength(0);

    await credit('pub_tiny', 1, new Date(Date.UTC(2026, 8, 1)));
    const septEnd = new Date(Date.UTC(2026, 8, 30, 23, 59, 59));
    const next = await generateMonthlyPayouts(new Date(Date.UTC(2026, 8, 1)), septEnd);
    expect(next).toHaveLength(1);
    expect(next[0]!.netIsk).toBe(10_000);
  });

  it('subtracts prior payout DOCS regardless of status (a pending, untransferred payout is not re-payable)', async () => {
    await seedPublisher('pub_repeat');
    await credit('pub_repeat', 15_000, new Date(Date.UTC(2026, 6, 10)));
    const first = await generateMonthlyPayouts(P_START, P_END);
    expect(first).toHaveLength(1); // pending doc, NOT completed, no ledger entry yet

    await credit('pub_repeat', 3_000, new Date(Date.UTC(2026, 8, 5)));
    const septEnd = new Date(Date.UTC(2026, 8, 30, 23, 59, 59));
    const second = await generateMonthlyPayouts(new Date(Date.UTC(2026, 8, 1)), septEnd);
    // Only the new 3k is unpaid — below minimum, so nothing is created.
    expect(second).toHaveLength(0);
  });

  it('is idempotent: re-running the same period creates no second doc', async () => {
    await seedPublisher('pub_idem');
    await credit('pub_idem', 20_000, new Date(Date.UTC(2026, 7, 5)));
    await generateMonthlyPayouts(P_START, P_END);
    const rerun = await generateMonthlyPayouts(P_START, P_END);
    expect(rerun).toHaveLength(0);
    const docs = await db.collection(COLLECTIONS.payouts).get();
    expect(docs.size).toBe(1);
  });

  it('holds VAT: vatIsk is computed and stored but excluded from the completed disbursement ledger entry', async () => {
    await seedPublisher('pub_vat', '123456');
    await credit('pub_vat', 20_000, new Date(Date.UTC(2026, 7, 5)));
    const [payout] = await generateMonthlyPayouts(P_START, P_END);
    expect(payout!.vatIsk).toBeGreaterThan(0);

    await markPayoutCompleted(payout!.id, 'B-001');
    const ledger = await db.collection(COLLECTIONS.ledger).where('type', '==', 'payout').get();
    expect(ledger.size).toBe(1);
    expect(ledger.docs[0]!.data().amountIsk).toBe(-payout!.netIsk); // net only, no VAT
  });
});
```

Also assert in the first test that `currentPeriodIsk + carriedForwardIsk === netIsk`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `firebase --config firebase/firebase.json emulators:exec --only firestore "pnpm --filter @ada/api test -- tests/payouts.test.ts"`
Expected: FAIL — `payoutDocId` not exported; cumulative cases return empty/period-only sums.

- [ ] **Step 3: Implement**

1. `packages/shared/src/schemas/ledger.ts`: add the two optional fields to `PayoutSchema` with a comment (`/** Review breakdown (2026-08-08 design): how much of netIsk arose in the run's own period vs was carried forward from earlier months. Optional — docs predating the carry-forward fix lack them. */`). Rebuild shared.

2. `apps/api/src/services/payouts.ts` — replace the body of `generateMonthlyPayouts`:

```ts
const DISBURSE_VAT = false;
// ^ Accountant decision pending (2026-08-08 design §VAT hold): vatIsk is
// computed and stored on every payout doc, but excluded from the disbursed
// amount until the tax model is settled. Flip this single constant when it is.

export function payoutDocId(publisherId: string, periodEnd: Date): string {
  const ym =
    periodEnd.getUTCFullYear().toString() + String(periodEnd.getUTCMonth() + 1).padStart(2, '0');
  return `pay_${publisherId}_${ym}`;
}

export async function generateMonthlyPayouts(
  periodStart: Date,
  periodEnd: Date,
): Promise<Payout[]> {
  // Cumulative basis (2026-08-08 design): ALL credits up to periodEnd …
  const creditsSnap = await db
    .collection(COLLECTIONS.ledger)
    .where('type', '==', 'publisher_credit')
    .where('createdAt', '<=', periodEnd)
    .withConverter(ledgerEntryConverter)
    .get();

  const totalByPublisher = new Map<string, number>();
  const periodByPublisher = new Map<string, number>();
  for (const doc of creditsSnap.docs) {
    const e = doc.data();
    if (e.party.type !== 'publisher') continue;
    totalByPublisher.set(e.party.id, (totalByPublisher.get(e.party.id) ?? 0) + e.amountIsk);
    if (e.createdAt >= periodStart && e.createdAt <= periodEnd) {
      periodByPublisher.set(e.party.id, (periodByPublisher.get(e.party.id) ?? 0) + e.amountIsk);
    }
  }

  // … minus ALL prior payout DOCS (any status). Docs, not ledger entries:
  // the ledger `payout` entry only lands at markPayoutCompleted, so a
  // created-but-untransferred payout must still count as spoken-for.
  const payoutsSnap = await db.collection(COLLECTIONS.payouts).withConverter(payoutConverter).get();
  const paidByPublisher = new Map<string, number>();
  for (const doc of payoutsSnap.docs) {
    const p = doc.data();
    paidByPublisher.set(p.publisherId, (paidByPublisher.get(p.publisherId) ?? 0) + p.netIsk);
  }

  const created: Payout[] = [];
  for (const [publisherId, totalIsk] of totalByPublisher) {
    const netIsk = totalIsk - (paidByPublisher.get(publisherId) ?? 0);
    if (netIsk < MIN_PAYOUT_ISK) continue;

    const currentPeriodIsk = Math.min(periodByPublisher.get(publisherId) ?? 0, netIsk);
    const carriedForwardIsk = netIsk - currentPeriodIsk;
    const grossIsk = Math.round(netIsk / (1 - DEFAULT_PLATFORM_FEE_PERCENT / 100));
    const platformFeeIsk = grossIsk - netIsk;

    const publisher = await getPublisherById(publisherId);
    const vatIsk = publisher?.vatNumber ? Math.round(netIsk * VAT_RATE) : 0;

    const payout: Payout = PayoutSchema.parse({
      id: payoutDocId(publisherId, periodEnd),
      publisherId,
      periodStart,
      periodEnd,
      grossIsk,
      platformFeeIsk,
      netIsk,
      vatIsk,
      currentPeriodIsk,
      carriedForwardIsk,
      status: 'pending',
      bankReference: '',
    });
    try {
      await db
        .collection(COLLECTIONS.payouts)
        .doc(payout.id)
        .withConverter(payoutConverter)
        .create(payout);
      created.push(payout);
    } catch (err: unknown) {
      // ALREADY_EXISTS → this period already generated this payout (re-run
      // after a partial failure). Skip, never throw the whole run.
      if ((err as { code?: number }).code === 6) {
        console.warn(`[payouts] ${payout.id} already exists, skipping (idempotent re-run)`);
        continue;
      }
      throw err;
    }
  }
  return created;
}
```

(gRPC ALREADY_EXISTS is code 6 — verify against firebase-admin's error shape in the emulator when the test runs; adjust the check if the emulator surfaces it differently, e.g. by message.)

3. `markPayoutCompleted`: change the disbursement line to

```ts
const disbursedIsk = payout.netIsk + (DISBURSE_VAT ? (payout.vatIsk ?? 0) : 0);
```

and update the surrounding comment to say VAT is on hold (design §VAT hold) instead of the current "is collected from Birtingur" text.

4. `listPendingPayouts`: include `disburseIsk: p.netIsk + (DISBURSE_VAT ? (p.vatIsk ?? 0) : 0)`, `currentPeriodIsk: p.currentPeriodIsk ?? null`, `carriedForwardIsk: p.carriedForwardIsk ?? null` in the enriched objects (export `DISBURSE_VAT` or compute inside the module — keep it module-internal).

- [ ] **Step 4: Run tests to verify they pass**

Run: `firebase --config firebase/firebase.json emulators:exec --only firestore "pnpm --filter @ada/api test -- tests/payouts.test.ts"`
Expected: PASS. Then `pnpm --filter @ada/shared build && pnpm test:api` (full suite — admin routes tests may reference payout fixtures; fix any fallout faithfully) and `pnpm --filter @ada/api typecheck`.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/schemas/ledger.ts apps/api/src/services/payouts.ts apps/api/tests/payouts.test.ts
git commit -m "feat(api): cumulative carry-forward payout basis with idempotent docs and VAT hold"
```

---

### Task 2: 10.000 kr minimum + public copy sweep + prerender refresh + admin breakdown columns

**Files:**

- Modify: `packages/shared/src/constants.ts` (MIN_PAYOUT_ISK)
- Modify: copy in `apps/dashboard/src/pages/FaqPage.tsx`, `TermsPage.tsx`, `PublisherLanding.tsx`, `components/layout/AppShell.tsx`, `EnglishGuidePage.tsx`, `EnglishCategoryPage.tsx` (+ any `locales/` hits; judge every match in context)
- Modify: `apps/dashboard/src/pages/admin/Overview.tsx` (payout list: show carried-forward breakdown + disburse amount where payouts render)
- Modify: `apps/dashboard/prerender/snapshots.json` (regenerated, committed)
- Test: existing suites (constant-driven displays update themselves); grep gate in the verify step

**Interfaces:**

- Consumes: `MIN_PAYOUT_ISK` (code readers update automatically), `listPendingPayouts` enrichment fields from Task 1 (`disburseIsk`, `currentPeriodIsk`, `carriedForwardIsk` — nullable for old docs).
- Produces: no new interfaces.

- [ ] **Step 1: Change the constant**

`packages/shared/src/constants.ts`: `MIN_PAYOUT_ISK = 5000` → `10000` (keep the "below this rolls into next month" comment — it is finally true). `pnpm --filter @ada/shared build`.

- [ ] **Step 2: Find and fix every payout-minimum copy mention**

Run: `grep -rn "5\.000\|5,000\|5000" apps/dashboard/src --include="*.tsx" --include="*.ts"` and judge each hit in context. Change ONLY payout-minimum mentions to the 10.000-kr equivalent (Icelandic pages: "10.000 kr."; English pages: "ISK 10,000" matching each page's existing style). Known carriers: FaqPage (carry-over promise), TermsPage, PublisherLanding, AppShell FAQ answer ("þegar inneignin nær 5.000 kr."), EnglishGuidePage, EnglishCategoryPage. Do NOT touch unrelated 5.000 figures (top-up amounts, examples). Run `pnpm --filter @ada/dashboard test` and `node apps/dashboard/scripts/check-marketing-claims.mjs` (via `pnpm --filter @ada/dashboard lint`) — both must stay green; if the claims script pins the old figure, update its verified-claims source per its own documentation, not by weakening the check.

- [ ] **Step 3: Admin payout list breakdown**

In `admin/Overview.tsx`, where pending payouts render, add the breakdown when present: a muted line/cell "Þar af eldri uppsöfnun: {formatIsk(carriedForwardIsk)}" when `carriedForwardIsk > 0`, and show `disburseIsk` as the transfer amount. Follow the existing table/card markup style in that file.

- [ ] **Step 4: Rebuild + regenerate prerender snapshots**

```bash
pnpm --filter @ada/dashboard build
pnpm --filter @ada/dashboard prerender:capture
```

(The capture guard refuses stale builds — build FIRST. Playwright/Chromium is a dev dependency of the prerender pipeline; if capture fails on a missing browser, `pnpm --filter @ada/dashboard exec playwright install chromium` once.) Commit the changed `snapshots.json`.

- [ ] **Step 5: Verify**

Run: `pnpm verify && pnpm --filter @ada/dashboard test`
And the grep gate: `grep -rn "5\.000 kr" apps/dashboard/src --include="*.tsx" | grep -iv "topup\|inneign í veskinu"` must show no payout-minimum survivors (manually confirm the remaining hits are unrelated).

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/constants.ts apps/dashboard/src apps/dashboard/prerender/snapshots.json
git commit -m "feat: raise publisher payout minimum to 10000 ISK with full copy sweep"
```

---

### Task 3: Publisher-side reconciliation checks

**Files:**

- Modify: `apps/api/src/services/reconciliation.ts`
- Test: `apps/api/tests/reconciliation.test.ts` (extend if it exists; otherwise create following the file's own test conventions — check first)

**Interfaces:**

- Consumes: `ledgerEntryConverter`, `payoutConverter`, `alertOps` — all already imported/used by the module; `MIN_PAYOUT_ISK` from `@ada/shared`.
- Produces: two new finding kinds appended to the module's `ReconciliationFinding[]`, wired into `runReconciliation` alongside the existing checks (same reporting/alert path; open the module and mirror how `checkCampaign` registers findings).

- [ ] **Step 1: Write the failing tests**

Read `reconciliation.ts` and its existing test (if any) first; mirror the established pattern. Cases (emulator-backed, direct ledger/payout doc seeding like Task 1's helpers):

```ts
it('flags a publisher whose ledger balance is negative (credits < completed payouts)', async () => {
  // seed publisher, one 5.000 credit, one COMPLETED payout doc of 10.000
  // with its -10.000 ledger payout entry → balance -5.000
  const report = await runReconciliation();
  expect(report.findings.some((f) => f.kind === 'publisher_negative_balance')).toBe(true);
});

it('flags a publisher stuck above the minimum across a payout run', async () => {
  // seed credits totalling 15.000 all dated > 40 days ago, NO payout docs
  const report = await runReconciliation();
  expect(report.findings.some((f) => f.kind === 'publisher_stuck_payable')).toBe(true);
});

it('is quiet for a healthy publisher', async () => {
  // credits 3.000 (below minimum, recent), no payouts
  const report = await runReconciliation();
  expect(report.findings.filter((f) => f.kind.startsWith('publisher_'))).toHaveLength(0);
});
```

(Adapt `kind` field naming to whatever discriminator the module's `ReconciliationFinding` actually uses — read it first; if it uses message strings, assert on those instead.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `firebase --config firebase/firebase.json emulators:exec --only firestore "pnpm --filter @ada/api test -- tests/reconciliation.test.ts"`
Expected: new cases FAIL (no publisher findings produced); pre-existing cases PASS.

- [ ] **Step 3: Implement**

Add `checkPublisherBalances(findings)` to `reconciliation.ts`, called from `runReconciliation` after the existing checks:

- Load all `publisher_credit` and `payout` ledger entries grouped per publisher, plus all payout docs.
- **Negative balance:** `sum(credits) − sum(|payout ledger entries|) < 0` → finding (VAT-drift signature).
- **Stuck payable:** unpaid basis (credits − all payout docs' netIsk, the same arithmetic as `generateMonthlyPayouts`) ≥ `MIN_PAYOUT_ISK` AND the oldest contributing credit predates the previous month's payout-run date (the 1st of the current month) → finding (carry-forward-regression signature).
- Read-only throughout; findings flow into the module's existing alert path.

Keep the arithmetic in one exported helper shared with nothing (duplication of the payout basis is deliberate — reconciliation must be an independent computation, same philosophy as the existing campaign checks; note this in a comment).

- [ ] **Step 4: Run tests to verify they pass**

Run: `firebase --config firebase/firebase.json emulators:exec --only firestore "pnpm --filter @ada/api test -- tests/reconciliation.test.ts tests/payouts.test.ts"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/reconciliation.ts apps/api/tests/reconciliation.test.ts
git commit -m "feat(api): publisher-side reconciliation checks (negative balance, stuck payable)"
```

---

### Task 4: Verify, ship

- [ ] **Step 1: Full verify**

Run: `pnpm verify && pnpm test:api && pnpm --filter @ada/dashboard test`
Expected: all green. (One emulator invocation at a time.)

- [ ] **Step 2: Push branch and open PR**

oruggt-ship flow. PR title: `feat: payout carry-forward, 10k minimum, VAT hold, publisher reconciliation`. Body MUST flag: the first monthly run after merge computes the historical backlog into payout docs for the owner's review — no money moves until his manual transfers; VAT disbursement is paused behind `DISBURSE_VAT=false` pending the accountant; the public minimum changed everywhere including prerendered pages.
