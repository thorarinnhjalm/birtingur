import { z } from 'zod';
import { COLLECTIONS, creativeConverter, campaignConverter } from '@ada/shared/firestore';
import type { Creative, Campaign } from '@ada/shared';
import { db } from '../lib/firebase.js';
import { AppError } from '../lib/errors.js';
import { updateCreativeReview, requireCreative } from './creatives.js';
import { pushCacheForCampaign } from '../lib/push-cache.js';
import { refundCampaign } from './wallet.js';

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

async function propagateCreativeChange(creativeId: string, approved: boolean): Promise<void> {
  const snap = await db
    .collection(COLLECTIONS.campaigns)
    .where('creativeIds', 'array-contains', creativeId)
    .withConverter(campaignConverter)
    .get();
  for (const doc of snap.docs) {
    const cmp = doc.data() as Campaign;
    let modified = false;

    if (approved) {
      if (cmp.status === 'pending_approval') {
        const allCreativesApproved = await allCreativesAutoApproved(cmp.creativeIds);
        const allPublishersApproved = Object.values(cmp.perPublisherApproval).every(
          (v) => v === 'approved',
        );
        if (allCreativesApproved && allPublishersApproved) {
          cmp.status = 'active';
          modified = true;
        }
      }
    } else {
      // If this was the only creative, refund remaining budget
      if (cmp.creativeIds.length === 1) {
        cmp.status = 'completed';
        await refundCampaign(cmp.advertiserId, cmp.id, cmp.budget.remainingIsk);
        cmp.budget.remainingIsk = 0;
        modified = true;
      }
    }

    if (modified) {
      await db
        .collection(COLLECTIONS.campaigns)
        .doc(cmp.id)
        .withConverter(campaignConverter)
        .set(cmp);
    }

    if (process.env.UPSTASH_REDIS_REST_URL) {
      await pushCacheForCampaign(cmp.id);
    }
  }
}

export async function listPublisherQueue(
  publisherId: string,
): Promise<Array<{ creative: Creative; campaign: Campaign }>> {
  const snap = await db
    .collection(COLLECTIONS.campaigns)
    .where(`perPublisherApproval.${publisherId}`, '==', 'pending')
    .withConverter(campaignConverter)
    .get();
  const results: Array<{ creative: Creative; campaign: Campaign }> = [];
  for (const doc of snap.docs) {
    const cmp = doc.data() as Campaign;
    for (const creativeId of cmp.creativeIds) {
      const cSnap = await db
        .collection(COLLECTIONS.creatives)
        .doc(creativeId)
        .withConverter(creativeConverter)
        .get();
      if (!cSnap.exists) continue;
      results.push({ creative: cSnap.data() as Creative, campaign: cmp });
    }
  }
  return results;
}

const PublisherReviewSchema = z.object({
  campaignId: z.string(),
  action: z.enum(['approve', 'reject']),
  reason: z.string().max(500).optional(),
});
export type PublisherReviewInput = z.infer<typeof PublisherReviewSchema>;

export async function publisherReview(
  publisherId: string,
  input: PublisherReviewInput,
): Promise<Campaign> {
  const parsed = PublisherReviewSchema.parse(input);
  const docRef = db.collection(COLLECTIONS.campaigns).doc(parsed.campaignId);
  const snap = await docRef.withConverter(campaignConverter).get();
  if (!snap.exists) {
    throw new AppError(404, `Campaign ${parsed.campaignId} not found`, 'NOT_FOUND');
  }
  const cmp = snap.data() as Campaign;
  if (cmp.perPublisherApproval[publisherId] === undefined) {
    throw new AppError(400, 'No pending approval for this publisher', 'BAD_REQUEST');
  }
  cmp.perPublisherApproval[publisherId] = parsed.action === 'approve' ? 'approved' : 'rejected';

  // If all publishers approved → activate; if any rejected and it was the only one → completed with refund
  const values = Object.values(cmp.perPublisherApproval);
  const allPublishersApproved = values.every((v) => v === 'approved');
  const allCreativesApproved = await allCreativesAutoApproved(cmp.creativeIds);

  if (allPublishersApproved && allCreativesApproved) {
    cmp.status = 'active';
  }

  if (parsed.action === 'reject') {
    if (Object.keys(cmp.perPublisherApproval).length === 1) {
      cmp.status = 'completed';
      await refundCampaign(cmp.advertiserId, cmp.id, cmp.budget.remainingIsk);
      cmp.budget.remainingIsk = 0;
    }
  }

  await docRef.withConverter(campaignConverter).set(cmp);
  if (process.env.UPSTASH_REDIS_REST_URL) {
    await pushCacheForCampaign(cmp.id);
  }
  return cmp;
}
