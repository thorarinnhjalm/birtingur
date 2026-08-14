import type { Transaction } from 'firebase-admin/firestore';
import { COLLECTIONS, campaignConverter, ledgerEntryConverter } from '@ada/shared/firestore';
import { DEFAULT_PLATFORM_FEE_PERCENT, publisherNetIsk } from '@ada/shared';
import type { CampaignStatus } from '@ada/shared';
import { db } from '../lib/firebase.js';
import { appendLedger, sumByParty } from './ledger.js';
import { AppError } from '../lib/errors.js';
import { getAdvertiserById } from './advertisers.js';
import { createNotification } from './notifications.js';

export interface Wallet {
  advertiserId: string;
  balanceIsk: number;
}

export async function getWallet(advertiserId: string): Promise<Wallet> {
  const balanceIsk = await sumByParty({ type: 'advertiser', id: advertiserId });
  return { advertiserId, balanceIsk };
}

// Fund-holding statuses for the committed-funds gate: every CampaignStatus
// except the terminal `completed` still carries a budget.remainingIsk that
// represents money the advertiser could still spend — `draft`/`pending_approval`
// haven't served yet, `active` is serving now, and `paused` can be resumed —
// so all of them keep their remaining budget "committed" against the wallet.
// Only `completed` releases the hold (there is no separate cancelled/rejected
// status in CampaignStatusSchema: 'draft' | 'pending_approval' | 'active' |
// 'paused' | 'completed', see packages/shared/src/schemas/campaign.ts).
export const FUND_HOLDING_STATUSES: ReadonlySet<CampaignStatus> = new Set([
  'draft',
  'pending_approval',
  'active',
  'paused',
]);

export interface AvailableBalance {
  balanceIsk: number;
  committedIsk: number;
  availableIsk: number;
}

interface CommittedCampaignDoc {
  id: string;
  status: CampaignStatus;
  budget: { remainingIsk: number };
  schedule: { endsAt: Date };
}

/**
 * Belt-and-braces expiry release (see `sweepExpiredCampaigns` in
 * services/campaigns.ts, the primary mechanism, which runs on the 10-minute
 * cache-refresh cron and flips expired campaigns to `completed`): a campaign
 * whose `schedule.endsAt` has already passed is excluded from committed funds
 * here too, even if its status hasn't been swept to `completed` yet. This
 * only covers the window between expiry and the next sweep run — it is
 * conservative, not a substitute for the sweep: it can only ever shrink
 * committed funds (never grow them), so it can't let a campaign oversubscribe
 * the wallet. A trailing queued impression that still accrues against this
 * campaign after `endsAt` charges the ledger and decrements `remainingIsk`
 * exactly as normal — that only shrinks `availableIsk` further via the
 * balance side, it never gets un-shrunk back through this exclusion.
 */
function isFundHolding(c: CommittedCampaignDoc, now: number): boolean {
  if (!FUND_HOLDING_STATUSES.has(c.status)) return false;
  if (c.schedule.endsAt.getTime() < now) return false;
  return true;
}

function sumCommittedFromDocs(
  docs: Array<{ data: () => CommittedCampaignDoc }>,
  excludeCampaignId?: string,
): number {
  const now = Date.now();
  return docs.reduce((acc, d) => {
    const c = d.data();
    if (c.id === excludeCampaignId) return acc;
    if (!isFundHolding(c, now)) return acc;
    return acc + c.budget.remainingIsk;
  }, 0);
}

function sumBalanceFromDocs(docs: Array<{ data: () => { amountIsk: number } }>): number {
  return docs.reduce((acc, d) => acc + d.data().amountIsk, 0);
}

function campaignsQueryFor(advertiserId: string) {
  return db
    .collection(COLLECTIONS.campaigns)
    .where('advertiserId', '==', advertiserId)
    .withConverter(campaignConverter);
}

function ledgerQueryFor(advertiserId: string) {
  return db
    .collection(COLLECTIONS.ledger)
    .where('party.type', '==', 'advertiser')
    .where('party.id', '==', advertiserId)
    .withConverter(ledgerEntryConverter);
}

/**
 * Committed funds = sum of budget.remainingIsk over the advertiser's
 * fund-holding campaigns (see FUND_HOLDING_STATUSES), optionally excluding
 * one campaign — needed for budget increases, where that campaign's own
 * (stale) remainingIsk must not be double-counted against its own increase.
 * Available = ledger balance − committed. Spend accrual (services/accrual.ts)
 * decrements both balance and the spending campaign's remainingIsk by the
 * same amount, so available is invariant under spend; this only needs to be
 * checked at create/increase time.
 */
export async function getAvailableBalance(
  advertiserId: string,
  opts?: { excludeCampaignId?: string },
): Promise<AvailableBalance> {
  const [campaignsSnap, ledgerSnap] = await Promise.all([
    campaignsQueryFor(advertiserId).get(),
    ledgerQueryFor(advertiserId).get(),
  ]);
  const committedIsk = sumCommittedFromDocs(campaignsSnap.docs, opts?.excludeCampaignId);
  const balanceIsk = sumBalanceFromDocs(ledgerSnap.docs);
  return { balanceIsk, committedIsk, availableIsk: balanceIsk - committedIsk };
}

/**
 * Same computation as getAvailableBalance, but reads happen through an
 * in-flight Firestore transaction (`t.get`) so the result is consistent with
 * whatever else the transaction reads/writes. Used by the create/increase
 * funding gates in services/campaigns.ts — the transaction must also write a
 * serialization field on the advertiser doc (fundsVersion) for two concurrent
 * transactions on the same advertiser to actually conflict and retry
 * serially; reading the campaigns/ledger queries alone would not conflict on
 * phantom inserts in Firestore.
 *
 * Known limitation: this reads the advertiser's ENTIRE ledger and campaign
 * list on every call (inside the transaction, so it also counts against
 * Firestore's per-transaction read limits). That's acceptable at current
 * scale, but won't stay that way forever — if ledger sizes grow large or
 * transaction contention on hot advertisers becomes a problem, the planned
 * escape hatch is a maintained running-balance field on the advertiser doc
 * (updated atomically alongside each ledger append) instead of summing from
 * scratch every time.
 */
export async function getAvailableBalanceInTransaction(
  t: Transaction,
  advertiserId: string,
  opts?: { excludeCampaignId?: string },
): Promise<AvailableBalance> {
  const [campaignsSnap, ledgerSnap] = await Promise.all([
    t.get(campaignsQueryFor(advertiserId)),
    t.get(ledgerQueryFor(advertiserId)),
  ]);
  const committedIsk = sumCommittedFromDocs(campaignsSnap.docs, opts?.excludeCampaignId);
  const balanceIsk = sumBalanceFromDocs(ledgerSnap.docs);
  return { balanceIsk, committedIsk, availableIsk: balanceIsk - committedIsk };
}

async function syncMirror(advertiserId: string): Promise<void> {
  const balance = await sumByParty({ type: 'advertiser', id: advertiserId });
  await db
    .collection(COLLECTIONS.advertisers)
    .doc(advertiserId)
    .update({ walletBalanceIsk: balance });
}

export async function topUp(
  advertiserId: string,
  amountIsk: number,
  teyaTxnId: string,
): Promise<void> {
  if (amountIsk <= 0) {
    throw new AppError(400, 'amountIsk must be positive', 'BAD_REQUEST');
  }

  // Idempotency: if a ledger entry with this relatedId exists, skip
  const existing = await db
    .collection(COLLECTIONS.ledger)
    .where('relatedId', '==', teyaTxnId)
    .where('type', '==', 'topup')
    .limit(1)
    .get();

  if (!existing.empty) return;

  await appendLedger({
    party: { type: 'advertiser', id: advertiserId },
    type: 'topup',
    amountIsk,
    relatedId: teyaTxnId,
  });

  await syncMirror(advertiserId);

  try {
    const advertiser = await getAdvertiserById(advertiserId);
    if (advertiser) {
      await createNotification({
        userEmail: advertiser.ownerEmail,
        role: 'advertiser',
        type: 'success',
        title: 'Innborgun staðfest',
        message: `Greiðsla upp á ${amountIsk.toLocaleString('is-IS')} kr. var móttekin og bætt við reikninginn þinn.`,
        link: '/advertiser/topup',
      });
    }
  } catch (err) {
    console.error('Error creating topup notification:', err);
  }
}

export async function chargeCampaign(
  advertiserId: string,
  campaignId: string,
  amountIsk: number,
): Promise<void> {
  if (amountIsk <= 0) {
    throw new AppError(400, 'must be positive', 'BAD_REQUEST');
  }

  const wallet = await getWallet(advertiserId);
  if (wallet.balanceIsk < amountIsk) {
    throw new AppError(
      400,
      `insufficient balance: Wallet has ${wallet.balanceIsk}, needed ${amountIsk}`,
      'INSUFFICIENT_BALANCE',
    );
  }

  await appendLedger({
    party: { type: 'advertiser', id: advertiserId },
    type: 'campaign_charge',
    amountIsk: -amountIsk,
    relatedId: campaignId,
  });

  // INVARIANT: once appendLedger above has resolved, the money HAS moved —
  // the append-only ledger is the source of truth. syncMirror only refreshes
  // a derived read cache (advertiser.walletBalanceIsk), and
  // services/reconciliation.ts (checkAdvertiserMirror) already detects and
  // reports mirror drift daily. chargeCampaign must NOT reject after this
  // point: its only real caller, services/accrual.ts, decides whether to
  // re-queue an event batch based on whether this function resolved — if a
  // mirror-sync hiccup here made chargeCampaign reject, accrual would
  // re-queue events whose charge already landed, and the next run would
  // apply a second campaign_charge for the same impressions. So a mirror
  // failure is logged loudly and swallowed, never surfaced to the caller.
  try {
    await syncMirror(advertiserId);
  } catch (err) {
    console.error(
      `[wallet] syncMirror failed after chargeCampaign (charge already applied) advertiserId=${advertiserId} campaignId=${campaignId}:`,
      err,
    );
  }
}

/**
 * Refund money BACK INTO the ledger. This is only correct to call when the
 * ledger was actually debited for `amountIsk` at some point for this
 * campaign — i.e. real accrual charges (services/accrual.ts `chargeCampaign`
 * calls), not budget that was merely reserved/committed. Campaign
 * creation/increase never touches the ledger (see the committed-funds gate
 * above): a campaign's `budget.remainingIsk` is a hold on availableIsk, not
 * money taken out of the wallet, so releasing an unspent hold (e.g. a
 * rejected sole creative, or campaign expiry) is just a status change to
 * `completed` — it must NOT call refundCampaign, which would credit money
 * that was never actually removed from the balance (see
 * propagateCreativeChange in services/approvals.ts, which used to make
 * exactly this mistake). There are currently no legitimate callers of this
 * function in the codebase; it's kept as public API for genuine
 * ledger-reversal use cases (e.g. a manual admin correction after a
 * mistaken accrual charge) and is covered directly by tests/wallet.test.ts.
 */
export async function refundCampaign(
  advertiserId: string,
  campaignId: string,
  amountIsk: number,
): Promise<void> {
  if (amountIsk <= 0) {
    throw new AppError(400, 'must be positive', 'BAD_REQUEST');
  }

  await appendLedger({
    party: { type: 'advertiser', id: advertiserId },
    type: 'refund',
    amountIsk,
    relatedId: campaignId,
  });

  await syncMirror(advertiserId);
}

export async function creditPublisher(
  publisherId: string,
  campaignId: string,
  grossIsk: number,
): Promise<void> {
  if (grossIsk <= 0) {
    throw new AppError(400, 'must be positive', 'BAD_REQUEST');
  }

  // publisherNetIsk is the single definition of this split (@ada/shared); the
  // fee is what is left over, so the two can never fail to reconstruct gross.
  const netIsk = publisherNetIsk(grossIsk);
  const feeIsk = grossIsk - netIsk;

  await appendLedger({
    party: { type: 'publisher', id: publisherId },
    type: 'publisher_credit',
    amountIsk: netIsk,
    relatedId: campaignId,
  });

  // A gross small enough that the fee rounds to zero gets no fee entry at
  // all. `LedgerEntrySchema` rejects a zero amount, and on 2026-08-11 that
  // rejection threw *after* the credit above had already landed and the
  // campaign had already been charged — aborting the rest of the batch on
  // every single cron-accrue run. Skipping the entry keeps
  // `reconciliation.ts`'s money-conservation invariant intact (a zero fee
  // contributes nothing to the sum either way) and means the platform simply
  // earns nothing on that sliver. `services/accrual.ts` defers such batches
  // so the fee is usually captured rather than waived; this is the backstop
  // for the residue that can never accumulate any further.
  if (feeIsk > 0) {
    await appendLedger({
      party: { type: 'platform', id: 'platform' },
      type: 'platform_fee',
      amountIsk: feeIsk,
      relatedId: campaignId,
    });
  }
}
