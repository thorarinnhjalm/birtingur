import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/lib/firebase';
import { clearFirestoreEmulator } from './helpers/emulator';
import { generateMonthlyPayouts, markPayoutCompleted, payoutDocId } from '../src/services/payouts';
import { ledgerEntryConverter } from '@ada/shared/firestore';
import { LedgerEntrySchema } from '@ada/shared';
import type { LedgerParty, LedgerEntryType } from '@ada/shared';
import { generateId } from '../src/lib/id';
import { COLLECTIONS } from '@ada/shared/firestore';
import { MIN_PAYOUT_ISK } from '@ada/shared';

async function seedPublisher(id: string, vatNumber?: string) {
  await db
    .collection(COLLECTIONS.publishers)
    .doc(id)
    .set({
      id,
      ownerEmail: `${id}@example.is`,
      domain: domainFor(id),
      displayName: id,
      contentPolicy: { blockedCategories: [], requireManualApproval: false },
      status: 'active',
      createdAt: new Date(),
      integrationPreference: 'widget',
      categories: ['matur'],
      ...(vatNumber ? { vatNumber } : {}),
    });
}

// The brief's helper used `${id}.is` verbatim, but DomainSchema
// (packages/shared/src/schemas/publisher.ts) rejects underscores, and every
// test publisher id here (pub_small, pub_tiny, ...) contains one — so the
// domain must swap underscores for hyphens while the publisher/ledger id
// itself stays untouched (payoutDocId assertions depend on the literal id).
function domainFor(id: string) {
  return `${id.replace(/_/g, '-')}.is`;
}

// Mirrors appendLedger's doc shape (services/ledger.ts) but accepts an
// explicit createdAt, which appendLedger stamps itself and doesn't expose.
async function appendLedgerAt(
  input: { party: LedgerParty; type: LedgerEntryType; amountIsk: number; relatedId: string },
  at: Date,
) {
  const entry = LedgerEntrySchema.parse({
    id: generateId('ldg'),
    party: input.party,
    type: input.type,
    amountIsk: input.amountIsk,
    relatedId: input.relatedId,
    createdAt: at,
  });
  await db
    .collection(COLLECTIONS.ledger)
    .doc(entry.id)
    .withConverter(ledgerEntryConverter)
    .set(entry);
  return entry;
}

async function credit(publisherId: string, amountIsk: number, at: Date) {
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
    expect(created[0]!.currentPeriodIsk! + created[0]!.carriedForwardIsk!).toBe(created[0]!.netIsk);
    expect(created[0]!.id).toBe(payoutDocId('pub_small', P_END));
  });

  // NOTE: the brief's verbatim test used hardcoded 9_999/10_000, which
  // implicitly assumes MIN_PAYOUT_ISK is already 10000. That bump is Task
  // 2's job (raising the minimum + public copy sweep), not Task 1's — right
  // now MIN_PAYOUT_ISK is still 5000. Parameterizing on the imported
  // constant keeps this test correct both today and after Task 2 lands,
  // without this task reaching into constants.ts out of scope.
  it('skips a publisher below the minimum WITHOUT dropping the credits (payable next run)', async () => {
    await seedPublisher('pub_tiny');
    await credit('pub_tiny', MIN_PAYOUT_ISK - 1, new Date(Date.UTC(2026, 6, 10)));
    expect(await generateMonthlyPayouts(P_START, P_END)).toHaveLength(0);

    await credit('pub_tiny', 1, new Date(Date.UTC(2026, 8, 1)));
    const septEnd = new Date(Date.UTC(2026, 8, 30, 23, 59, 59));
    const next = await generateMonthlyPayouts(new Date(Date.UTC(2026, 8, 1)), septEnd);
    expect(next).toHaveLength(1);
    expect(next[0]!.netIsk).toBe(MIN_PAYOUT_ISK);
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
