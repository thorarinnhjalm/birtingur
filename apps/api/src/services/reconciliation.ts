import type { DocumentData } from 'firebase-admin/firestore';
import { COLLECTIONS, campaignConverter, ledgerEntryConverter } from '@ada/shared/firestore';
import { db } from '../lib/firebase.js';
import { getRedis, isRedisConfigured } from '../lib/redis.js';
import { alertOps } from './ops-alerts.js';
import type { Campaign, LedgerEntry } from '@ada/shared';

/**
 * Daily read-only cross-check of the three money representations:
 *   1. the append-only ledger (source of truth),
 *   2. campaign.budget.remainingIsk in Firestore (the enforced spend cap), and
 *   3. the budget:{id} Redis counter (the serve-time gate).
 *
 * This service NEVER mutates state — it only reads and reports. Findings are
 * surfaced to ops via alertOps(); fixing drift is a manual/human follow-up.
 */

export type ReconciliationFindingKind =
  | 'campaign_spend_mismatch'
  | 'money_conservation_mismatch'
  | 'advertiser_mirror_mismatch'
  | 'redis_budget_overseeded'
  | 'stale_agent_pending_campaign';

export interface ReconciliationFinding {
  kind: ReconciliationFindingKind;
  entityId: string;
  detail: string;
  expected: number;
  actual: number;
}

export interface ReconciliationReport {
  findings: ReconciliationFinding[];
  counts: {
    campaignsChecked: number;
    advertisersChecked: number;
    redisBudgetsChecked: number;
  };
  generatedAt: string;
}

async function ledgerEntriesForRelatedId(relatedId: string): Promise<LedgerEntry[]> {
  const snap = await db
    .collection(COLLECTIONS.ledger)
    .where('relatedId', '==', relatedId)
    .withConverter(ledgerEntryConverter)
    .get();
  return snap.docs.map((d) => d.data());
}

async function ledgerEntriesForAdvertiser(advertiserId: string): Promise<LedgerEntry[]> {
  const snap = await db
    .collection(COLLECTIONS.ledger)
    .where('party.type', '==', 'advertiser')
    .where('party.id', '==', advertiserId)
    .withConverter(ledgerEntryConverter)
    .get();
  return snap.docs.map((d) => d.data());
}

/**
 * Checks 1 & 2 for a single campaign, sharing the one ledger query.
 *
 * Campaign creation/increase never debits the ledger — only real accrual
 * charges do (`campaign_charge` entries, see chargeCampaign in
 * services/wallet.ts) — so `budget.remainingIsk` is a committed-funds HOLD,
 * not money taken out of the wallet. Releasing an unspent hold (e.g. a
 * rejected sole creative in propagateCreativeChange, services/approvals.ts,
 * or the expiry sweep in services/campaigns.ts) is therefore just a status
 * change to `completed` plus zeroing `remainingIsk` — it records NO ledger
 * entry (refundCampaign must not be called for it; see the comment on
 * refundCampaign in services/wallet.ts for why that would mint money).
 *
 * That means `budget.totalIsk - budget.remainingIsk` ("released from
 * budget") only has to match `sum(campaign_charge)` while `remainingIsk` is
 * still positive — the only mechanism that can move it down from a positive
 * value is accrual, so any mismatch there is genuine drift. Once
 * `remainingIsk` reaches exactly 0 it's ambiguous from ledger data alone:
 * that could mean "fully spent via accrual" (released == charged, no
 * finding either way) or "released by rejection/expiry with less than full
 * spend" (released > charged, by design, not a bug). We only enforce the
 * strict equality while remainingIsk is still positive.
 */
async function checkCampaign(campaign: Campaign, findings: ReconciliationFinding[]): Promise<void> {
  const entries = await ledgerEntriesForRelatedId(campaign.id);

  // campaign_charge entries are stored with negative amountIsk; negate to get
  // the positive gross amount actually charged against this campaign.
  const chargesSum = -entries
    .filter((e) => e.type === 'campaign_charge')
    .reduce((acc, e) => acc + e.amountIsk, 0);

  const releasedFromBudget = campaign.budget.totalIsk - campaign.budget.remainingIsk;

  if (campaign.budget.remainingIsk > 0 && releasedFromBudget !== chargesSum) {
    findings.push({
      kind: 'campaign_spend_mismatch',
      entityId: campaign.id,
      detail:
        'budget.totalIsk - budget.remainingIsk does not match the sum of campaign_charge ' +
        'ledger entries for this campaign',
      expected: chargesSum,
      actual: releasedFromBudget,
    });
  }

  // Money conservation: creditPublisher always writes a publisher_credit and a
  // platform_fee entry together, splitting one gross amount, and drainAndAccrue
  // charges the campaign the sum of those grosses — so summing both entry
  // types back up must reproduce the gross charged, exactly, campaign by
  // campaign. Refunds don't participate here: rejections zero the budget
  // without ever crediting a publisher for the un-served remainder.
  const creditsAndFees = entries
    .filter((e) => e.type === 'publisher_credit' || e.type === 'platform_fee')
    .reduce((acc, e) => acc + e.amountIsk, 0);

  if (creditsAndFees !== chargesSum) {
    findings.push({
      kind: 'money_conservation_mismatch',
      entityId: campaign.id,
      detail:
        'sum(publisher_credit) + sum(platform_fee) for this campaign does not equal the gross ' +
        'campaign_charge sum — money is not conserved',
      expected: chargesSum,
      actual: creditsAndFees,
    });
  }
}

/** Check 3: the advertiser's walletBalanceIsk mirror vs the real ledger sum. */
async function checkAdvertiserMirror(
  advertiserId: string,
  raw: DocumentData,
  findings: ReconciliationFinding[],
): Promise<void> {
  const entries = await ledgerEntriesForAdvertiser(advertiserId);
  const ledgerSum = entries.reduce((acc, e) => acc + e.amountIsk, 0);
  const mirror: number | undefined = raw?.walletBalanceIsk;

  if (mirror === undefined || mirror === null) {
    if (entries.length > 0) {
      findings.push({
        kind: 'advertiser_mirror_mismatch',
        entityId: advertiserId,
        detail: 'advertiser has ledger entries but no walletBalanceIsk mirror field',
        expected: ledgerSum,
        actual: 0,
      });
    }
    // No mirror and no ledger entries: a brand new advertiser, not a finding.
    return;
  }

  if (mirror !== ledgerSum) {
    findings.push({
      kind: 'advertiser_mirror_mismatch',
      entityId: advertiserId,
      detail: "walletBalanceIsk mirror does not match the sum of this advertiser's ledger entries",
      expected: ledgerSum,
      actual: mirror,
    });
  }
}

/**
 * Check 4: the Redis budget:{id} serve-time counter must never exceed
 * Firestore's budget.remainingIsk — that would mean serving could still spend
 * money that the enforced cap in Firestore no longer accounts for. A missing
 * key or a lower value is expected drift (fail-closed behavior / un-accrued
 * impressions between cron runs) and is not reported.
 */
async function checkRedisBudgets(
  campaigns: Campaign[],
  findings: ReconciliationFinding[],
): Promise<number> {
  const redis = getRedis();
  const candidates = campaigns.filter(
    (c) => c.status !== 'completed' && c.budget.mode === 'cpm_capped',
  );

  let checked = 0;
  for (const campaign of candidates) {
    checked++;
    const raw = await redis.get<number | string>(`budget:${campaign.id}`);
    if (raw == null) continue;
    const value = Number(raw);
    if (value > campaign.budget.remainingIsk) {
      findings.push({
        kind: 'redis_budget_overseeded',
        entityId: campaign.id,
        detail:
          'Redis budget:{id} serve-time counter is greater than Firestore budget.remainingIsk ' +
          '— an over-seeded counter risks over-serving beyond the enforced cap',
        expected: campaign.budget.remainingIsk,
        actual: value,
      });
    }
  }
  return checked;
}

const STALE_AGENT_PENDING_DAYS = 7;

/**
 * Check 5: a campaign still `pending_approval` with `pendingReason:
 * 'agent_purchase'` after STALE_AGENT_PENDING_DAYS days is a sign the owner
 * may never have seen (or acted on) the approval notification — the
 * in-app/email notice fires once at create time (createCampaign,
 * services/campaigns.ts) with no follow-up reminder. This is a read-only
 * flag for ops to manually nudge the owner; it never mutates the campaign
 * (approve/reject stay owner-only — see approveAgentPurchaseCampaign /
 * rejectAgentPurchaseCampaign). Campaigns without a createdAt (written before
 * that field existed) are skipped rather than treated as infinitely stale.
 */
function checkStaleAgentPendingCampaigns(
  campaigns: Campaign[],
  findings: ReconciliationFinding[],
  now: Date = new Date(),
): void {
  for (const campaign of campaigns) {
    // Fix 1d (pendingReason lifecycle): the tag alone isn't sufficient — a
    // campaign that already left pending_approval (completed via
    // creative-rejection or the expiry sweep) must not keep generating a
    // daily "stale agent-pending" alert just because a pendingReason tag
    // survived on it. Matches the invariant enforced everywhere else the tag
    // is written: "pendingReason exists iff status is pending_approval".
    if (campaign.pendingReason !== 'agent_purchase' || campaign.status !== 'pending_approval') {
      continue;
    }
    if (!campaign.createdAt) continue;
    const ageDays = (now.getTime() - campaign.createdAt.getTime()) / (24 * 60 * 60 * 1000);
    if (ageDays > STALE_AGENT_PENDING_DAYS) {
      findings.push({
        kind: 'stale_agent_pending_campaign',
        entityId: campaign.id,
        detail:
          `Campaign has been pending_approval with pendingReason 'agent_purchase' for ` +
          `${Math.floor(ageDays)} day(s) — the owner may never have seen the approval ` +
          'notification; consider a manual nudge',
        expected: STALE_AGENT_PENDING_DAYS,
        actual: Math.floor(ageDays),
      });
    }
  }
}

function buildAlertMessage(findings: ReconciliationFinding[]): string {
  const shown = findings.slice(0, 10);
  const lines = shown.map(
    (f) =>
      `- [${f.kind}] ${f.entityId}: vænt ${f.expected} kr., raun ${f.actual} kr. (${f.detail})`,
  );
  const more =
    findings.length > shown.length
      ? `\n... og ${findings.length - shown.length} atriði til viðbótar.`
      : '';
  return (
    `Dagleg afstemming (cron-reconcile) fann ${findings.length} misræmi milli ledger-sins, ` +
    `campaign.budget.remainingIsk og Redis budget-teljarans. Fyrstu ${shown.length} atriðin:\n` +
    `${lines.join('\n')}${more}\n\n` +
    'Þetta er ekki sjálfkrafa leiðrétt — athugaðu Firestore ledger og /api/cron-diagnostics handvirkt.'
  );
}

export async function runReconciliation(): Promise<ReconciliationReport> {
  const findings: ReconciliationFinding[] = [];

  const campaignsSnap = await db
    .collection(COLLECTIONS.campaigns)
    .withConverter(campaignConverter)
    .get();
  const campaigns = campaignsSnap.docs.map((d) => d.data());

  for (const campaign of campaigns) {
    await checkCampaign(campaign, findings);
  }
  checkStaleAgentPendingCampaigns(campaigns, findings);

  const advertisersSnap = await db.collection(COLLECTIONS.advertisers).get();
  for (const doc of advertisersSnap.docs) {
    await checkAdvertiserMirror(doc.id, doc.data(), findings);
  }

  let redisBudgetsChecked = 0;
  if (isRedisConfigured()) {
    redisBudgetsChecked = await checkRedisBudgets(campaigns, findings);
  }

  const report: ReconciliationReport = {
    findings,
    counts: {
      campaignsChecked: campaigns.length,
      advertisersChecked: advertisersSnap.size,
      redisBudgetsChecked,
    },
    generatedAt: new Date().toISOString(),
  };

  if (findings.length > 0) {
    await alertOps(
      `Afstemming fann misræmi í peningaflæði (${findings.length} atriði)`,
      buildAlertMessage(findings),
    );
  }

  return report;
}
