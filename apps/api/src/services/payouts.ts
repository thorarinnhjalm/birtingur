import { COLLECTIONS, payoutConverter, ledgerEntryConverter } from '@ada/shared/firestore';
import { PayoutSchema, MIN_PAYOUT_ISK, DEFAULT_PLATFORM_FEE_PERCENT, VAT_RATE } from '@ada/shared';
import type { Payout } from '@ada/shared';
import { db } from '../lib/firebase.js';
import { appendLedger } from './ledger.js';
import { AppError } from '../lib/errors.js';
import { getPublisherById } from './publishers.js';

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
  // Cumulative basis (2026-08-08 design): ALL credits up to periodEnd count
  // toward what a publisher is owed — earnings below the minimum in earlier
  // months are no longer dropped, they carry forward until they cross it.
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
      // after a partial failure, or new same-period credits pushed a
      // publisher back over the minimum after their first doc landed).
      // Skip it, never throw the whole run.
      if ((err as { code?: number }).code === 6) {
        console.warn(`[payouts] ${payout.id} already exists, skipping (idempotent re-run)`);
        continue;
      }
      throw err;
    }
  }
  return created;
}

export async function listPendingPayouts(): Promise<any[]> {
  const snap = await db
    .collection(COLLECTIONS.payouts)
    .where('status', 'in', ['pending', 'processing'])
    .withConverter(payoutConverter)
    .get();
  const payouts = snap.docs.map((d) => d.data());

  const enriched = [];
  for (const p of payouts) {
    const pub = await getPublisherById(p.publisherId);
    enriched.push({
      ...p,
      publisherName: pub?.displayName || 'Óþekktur',
      iban: pub?.payoutMethod?.iban || '',
      kennitala: pub?.payoutMethod?.kennitala || '',
      disburseIsk: p.netIsk + (DISBURSE_VAT ? (p.vatIsk ?? 0) : 0),
      currentPeriodIsk: p.currentPeriodIsk ?? null,
      carriedForwardIsk: p.carriedForwardIsk ?? null,
    });
  }
  return enriched;
}

export async function markPayoutCompleted(
  payoutId: string,
  bankReference: string,
): Promise<Payout> {
  const ref = db.collection(COLLECTIONS.payouts).doc(payoutId);
  const snap = await ref.withConverter(payoutConverter).get();
  if (!snap.exists) {
    throw new AppError(404, `Payout ${payoutId} not found`, 'NOT_FOUND');
  }
  const payout = snap.data() as Payout;
  // Idempotency guard: a duplicated request (retry, double-click) for an
  // already-completed payout must not append a second negative ledger
  // 'payout' entry — appendLedger has no dedup of its own, so without this
  // early return a retry would silently double-disburse the publisher's
  // recorded balance while the actual bank transfer only happened once.
  if (payout.status === 'completed') {
    return payout;
  }
  const updated: Payout = PayoutSchema.parse({ ...payout, status: 'completed', bankReference });
  await ref.withConverter(payoutConverter).set(updated);

  // Drain ledger by adding a payout entry (negative for publisher).
  // VAT is on hold pending the accountant (2026-08-08 design §VAT hold):
  // vatIsk is computed and stored on the doc, but not disbursed while
  // DISBURSE_VAT is false — flip that single constant when the tax model
  // is settled.
  const disbursedIsk = payout.netIsk + (DISBURSE_VAT ? (payout.vatIsk ?? 0) : 0);
  await appendLedger({
    party: { type: 'publisher', id: payout.publisherId },
    type: 'payout',
    amountIsk: -disbursedIsk,
    relatedId: payoutId,
  });
  return updated;
}

/**
 * IMPORTANT-5 (adversarial review): the publisher Earnings screen used to
 * derive its "pending payout" figure from a trailing-30-day spend stat, not
 * from what's actually unpaid — a creator earning below the minimum every
 * month would permanently see "0 kr." and a below-minimum warning, even in
 * the month they're actually about to get paid the accumulated total. This
 * computes the REAL unpaid basis, the same way generateMonthlyPayouts does
 * (all publisher_credit to date minus all payout docs' netIsk, any status),
 * summed across every publisher doc passed in — an owner may hold several,
 * same aggregation Earnings already does for its other stats. Read-only.
 */
export async function getUnpaidBasisIsk(publisherIds: string[]): Promise<number> {
  let totalCredits = 0;
  let totalPaid = 0;

  for (const publisherId of publisherIds) {
    const creditsSnap = await db
      .collection(COLLECTIONS.ledger)
      .where('party.id', '==', publisherId)
      .where('type', '==', 'publisher_credit')
      .withConverter(ledgerEntryConverter)
      .get();
    for (const doc of creditsSnap.docs) {
      totalCredits += doc.data().amountIsk;
    }

    const payoutsSnap = await db
      .collection(COLLECTIONS.payouts)
      .where('publisherId', '==', publisherId)
      .withConverter(payoutConverter)
      .get();
    for (const doc of payoutsSnap.docs) {
      totalPaid += doc.data().netIsk;
    }
  }

  return totalCredits - totalPaid;
}

export async function listPublisherPayouts(publisherId: string): Promise<Payout[]> {
  const snap = await db
    .collection(COLLECTIONS.payouts)
    .where('publisherId', '==', publisherId)
    .orderBy('periodStart', 'desc')
    .withConverter(payoutConverter)
    .get();
  return snap.docs.map((d) => d.data());
}
