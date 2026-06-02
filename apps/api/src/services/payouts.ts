import {
  COLLECTIONS,
  payoutConverter,
  ledgerEntryConverter,
} from '@ada/shared/firestore';
import {
  PayoutSchema,
  MIN_PAYOUT_ISK,
  DEFAULT_PLATFORM_FEE_PERCENT,
} from '@ada/shared';
import type { Payout } from '@ada/shared';
import { db } from '../lib/firebase';
import { generateId } from '../lib/id';
import { appendLedger } from './ledger';
import { AppError } from '../lib/errors';

export async function generateMonthlyPayouts(
  periodStart: Date,
  periodEnd: Date
): Promise<Payout[]> {
  // Sum publisher_credit entries per publisher in period
  const snap = await db
    .collection(COLLECTIONS.ledger)
    .where('type', '==', 'publisher_credit')
    .where('createdAt', '>=', periodStart)
    .where('createdAt', '<=', periodEnd)
    .withConverter(ledgerEntryConverter)
    .get();

  const byPublisher = new Map<string, number>();
  for (const doc of snap.docs) {
    const e = doc.data();
    if (e.party.type !== 'publisher') continue;
    byPublisher.set(e.party.id, (byPublisher.get(e.party.id) ?? 0) + e.amountIsk);
  }

  const created: Payout[] = [];
  for (const [publisherId, netIsk] of byPublisher) {
    if (netIsk < MIN_PAYOUT_ISK) continue;
    const grossIsk = Math.round(netIsk / (1 - DEFAULT_PLATFORM_FEE_PERCENT / 100));
    const platformFeeIsk = grossIsk - netIsk;

    const payout: Payout = PayoutSchema.parse({
      id: generateId('pay'),
      publisherId,
      periodStart,
      periodEnd,
      grossIsk,
      platformFeeIsk,
      netIsk,
      status: 'pending',
      bankReference: '',
    });
    await db
      .collection(COLLECTIONS.payouts)
      .doc(payout.id)
      .withConverter(payoutConverter)
      .set(payout);
    created.push(payout);
  }
  return created;
}

export async function listPendingPayouts(): Promise<Payout[]> {
  const snap = await db
    .collection(COLLECTIONS.payouts)
    .where('status', 'in', ['pending', 'processing'])
    .withConverter(payoutConverter)
    .get();
  return snap.docs.map((d) => d.data());
}

export async function markPayoutCompleted(
  payoutId: string,
  bankReference: string
): Promise<Payout> {
  const ref = db.collection(COLLECTIONS.payouts).doc(payoutId);
  const snap = await ref.withConverter(payoutConverter).get();
  if (!snap.exists) {
    throw new AppError(404, `Payout ${payoutId} not found`, 'NOT_FOUND');
  }
  const payout = snap.data() as Payout;
  const updated: Payout = PayoutSchema.parse({ ...payout, status: 'completed', bankReference });
  await ref.withConverter(payoutConverter).set(updated);
  
  // Drain ledger by adding a payout entry (negative for publisher)
  await appendLedger({
    party: { type: 'publisher', id: payout.publisherId },
    type: 'payout',
    amountIsk: -payout.netIsk,
    relatedId: payoutId,
  });
  return updated;
}
