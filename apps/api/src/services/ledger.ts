import { COLLECTIONS, ledgerEntryConverter } from '@ada/shared/firestore';
import { LedgerEntrySchema } from '@ada/shared';
import type { LedgerEntry, LedgerParty, LedgerEntryType } from '@ada/shared';
import { db } from '../lib/firebase';
import { generateId } from '../lib/id';

export interface AppendInput {
  party: LedgerParty;
  type: LedgerEntryType;
  amountIsk: number;
  relatedId: string;
}

export async function appendLedger(input: AppendInput): Promise<LedgerEntry> {
  const entry: LedgerEntry = LedgerEntrySchema.parse({
    id: generateId('ldg'),
    party: input.party,
    type: input.type,
    amountIsk: input.amountIsk,
    relatedId: input.relatedId,
    createdAt: new Date(),
  });

  await db
    .collection(COLLECTIONS.ledger)
    .doc(entry.id)
    .withConverter(ledgerEntryConverter)
    .set(entry);

  return entry;
}

export async function sumByParty(party: LedgerParty): Promise<number> {
  const snap = await db
    .collection(COLLECTIONS.ledger)
    .where('party.type', '==', party.type)
    .where('party.id', '==', party.id)
    .withConverter(ledgerEntryConverter)
    .get();

  return snap.docs.reduce((acc, d) => acc + d.data().amountIsk, 0);
}

export async function listLedger(party: LedgerParty, limit = 100): Promise<LedgerEntry[]> {
  const snap = await db
    .collection(COLLECTIONS.ledger)
    .where('party.type', '==', party.type)
    .where('party.id', '==', party.id)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .withConverter(ledgerEntryConverter)
    .get();

  return snap.docs.map((d) => d.data());
}
