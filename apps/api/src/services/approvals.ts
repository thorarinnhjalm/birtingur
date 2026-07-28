import { z } from 'zod';
import { COLLECTIONS, creativeConverter, campaignConverter } from '@ada/shared/firestore';
import type { Creative, Campaign } from '@ada/shared';
import { db } from '../lib/firebase.js';
import { AppError } from '../lib/errors.js';
import { updateCreativeReview, requireCreative } from './creatives.js';
import { pushCacheForCampaign } from '../lib/push-cache.js';
import { isRedisConfigured } from '../lib/redis.js';
import { createNotification } from './notifications.js';
import { getAdvertiserById } from './advertisers.js';

export async function listAdminQueue(limit = 50): Promise<Creative[]> {
  const snap = await db
    .collection(COLLECTIONS.creatives)
    .where('reviewStatus', '==', 'pending')
    .limit(limit)
    .withConverter(creativeConverter)
    .get();
  return snap.docs.map((d) => d.data() as Creative);
}

const AdminReviewSchema = z.object({
  action: z.enum(['approve', 'reject']),
  adminEmail: z.string().email(),
  reason: z.string().max(500).optional(),
});
export type AdminReviewInput = z.infer<typeof AdminReviewSchema>;

export async function adminReview(creativeId: string, input: AdminReviewInput): Promise<Creative> {
  const parsed = AdminReviewSchema.parse(input);
  const existing = await requireCreative(creativeId);
  if (existing.reviewStatus !== 'pending') {
    throw new AppError(400, `Creative is in status ${existing.reviewStatus}`, 'BAD_REQUEST');
  }

  const updated = await updateCreativeReview(creativeId, {
    reviewStatus: parsed.action === 'approve' ? 'manual_approved' : 'rejected',
    logEntry: {
      at: new Date(),
      by: `admin:${parsed.adminEmail}`,
      action: parsed.action === 'approve' ? 'approved' : 'rejected',
      reason: parsed.reason,
    },
  });

  // Trigger notification for creative review
  try {
    const advertiser = await getAdvertiserById(existing.advertiserId);
    if (advertiser) {
      if (parsed.action === 'approve') {
        await createNotification({
          userEmail: advertiser.ownerEmail,
          role: 'advertiser',
          type: 'success',
          title: 'Auglýsing samþykkt',
          message: `Auglýsingin þín (${existing.width}x${existing.height}) var samþykkt af stjórnanda.`,
          link: '/advertiser/creatives',
        });
      } else {
        await createNotification({
          userEmail: advertiser.ownerEmail,
          role: 'advertiser',
          type: 'error',
          title: 'Auglýsingu hafnað',
          message: `Auglýsingunni þinni (${existing.width}x${existing.height}) var hafnað. Ástæða: ${parsed.reason || 'Ekki tilgreind'}`,
          link: '/advertiser/creatives',
        });
      }
    }
  } catch (err) {
    console.error('Error creating creative review notification:', err);
  }

  // Propagate to active campaigns
  await propagateCreativeChange(creativeId, parsed.action === 'approve');
  return updated;
}

async function allCreativesAutoApproved(ids: string[]): Promise<boolean> {
  for (const id of ids) {
    const snap = await db
      .collection(COLLECTIONS.creatives)
      .doc(id)
      .withConverter(creativeConverter)
      .get();
    if (!snap.exists) return false;
    const c = snap.data();
    if (!c) return false;
    if (c.reviewStatus !== 'auto_approved' && c.reviewStatus !== 'manual_approved') {
      return false;
    }
  }
  return true;
}

export async function propagateCreativeChange(
  creativeId: string,
  approved: boolean,
): Promise<void> {
  const snap = await db
    .collection(COLLECTIONS.campaigns)
    .where('creativeIds', 'array-contains', creativeId)
    .withConverter(campaignConverter)
    .get();
  for (const doc of snap.docs) {
    const cmp = doc.data() as Campaign;
    let modified = false;

    let newStatus = '';
    if (approved) {
      // Never auto-activate a campaign pending the OWNER's agent-purchase
      // approval (pendingReason 'agent_purchase') just because its creative
      // got reviewed — that would let an agent effectively self-activate its
      // own over-the-limit purchase by getting its creative approved (or
      // re-scanned), bypassing the human-in-the-loop gate entirely. Only
      // approveAgentPurchaseCampaign (services/campaigns.ts, owner-only route)
      // may clear pendingReason and activate; it already re-checks creative
      // approval status on the way out, so nothing is lost by waiting.
      if (cmp.status === 'pending_approval' && cmp.pendingReason !== 'agent_purchase') {
        const allCreativesApproved = await allCreativesAutoApproved(cmp.creativeIds);
        if (allCreativesApproved) {
          cmp.status = 'active';
          modified = true;
          newStatus = 'active';
        }
      }
    } else {
      // If this was the only creative, release the campaign's fund hold by
      // completing it. Campaign creation never debits the ledger — only real
      // accrual charges do (see chargeCampaign in services/wallet.ts) — so
      // remainingIsk here is a committed-funds HOLD, not money that was ever
      // taken out of the wallet. Setting status to `completed` alone already
      // excludes it from getAvailableBalance's committed sum
      // (FUND_HOLDING_STATUSES), which is all that's needed to give the
      // advertiser their available balance back. Calling refundCampaign here
      // would append a ledger `refund` credit for money that was never
      // debited, minting funds out of thin air.
      if (cmp.creativeIds.length === 1) {
        cmp.status = 'completed';
        cmp.budget.remainingIsk = 0;
        // Fix 1b (pendingReason lifecycle): the campaign is leaving
        // pending_approval for good here — clear any agent-purchase tag so
        // it doesn't outlive the state it describes (stuck dashboard card,
        // daily reconciliation alert, and — without the guard added to
        // approve/rejectAgentPurchaseCampaign — a resurrection risk).
        delete cmp.pendingReason;
        modified = true;
        newStatus = 'completed';
      }
    }

    if (modified) {
      await db
        .collection(COLLECTIONS.campaigns)
        .doc(cmp.id)
        .withConverter(campaignConverter)
        .set(cmp);

      if (newStatus) {
        try {
          const advertiser = await getAdvertiserById(cmp.advertiserId);
          if (advertiser) {
            if (newStatus === 'active') {
              await createNotification({
                userEmail: advertiser.ownerEmail,
                role: 'advertiser',
                type: 'success',
                title: 'Herferð komin í gang',
                message: `Herferðin þín „${cmp.name}“ er nú virk og byrjuð að birta auglýsingar.`,
                link: `/advertiser/campaigns/${cmp.id}`,
              });
            } else if (newStatus === 'completed') {
              await createNotification({
                userEmail: advertiser.ownerEmail,
                role: 'advertiser',
                type: 'warning',
                title: 'Herferð lokið',
                message: `Herferðinni þinni „${cmp.name}“ var lokið þar sem auglýsingu var hafnað og eftirstöðvar endurgreiddar.`,
                link: `/advertiser/campaigns/${cmp.id}`,
              });
            }
          }
        } catch (err) {
          console.error('Error creating campaign status notification:', err);
        }
      }
    }

    if (isRedisConfigured()) {
      await pushCacheForCampaign(cmp.id);
    }
  }
}
