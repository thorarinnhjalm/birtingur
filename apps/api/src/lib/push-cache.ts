import { db } from './firebase.js';
import { getRedis } from './redis.js';
import {
  COLLECTIONS,
  slotConverter,
  publisherConverter,
  campaignConverter,
  creativeConverter,
  advertiserConverter,
} from '@ada/shared/firestore';
import { FREQUENCY_CAP_DEFAULT_PER_DAY, CACHE_TTL_SECONDS } from '@ada/shared';
import type { SlotCacheEntry, CachedCreative, Creative } from '@ada/shared';

const key = (slotId: string) => `slot:${slotId}`;

export async function pushSlotCache(slotId: string): Promise<void> {
  const redis = getRedis();

  // 1. Fetch slot
  const slotDoc = await db
    .collection(COLLECTIONS.slots)
    .doc(slotId)
    .withConverter(slotConverter)
    .get();

  if (!slotDoc.exists) {
    // Delete from Redis if deleted from Firestore
    await redis.del(key(slotId));
    return;
  }

  const slot = slotDoc.data()!;

  // 2. Fetch publisher
  const publisherDoc = await db
    .collection(COLLECTIONS.publishers)
    .doc(slot.publisherId)
    .withConverter(publisherConverter)
    .get();

  if (!publisherDoc.exists) {
    // Delete from Redis if publisher is missing
    await redis.del(key(slotId));
    return;
  }

  const publisher = publisherDoc.data()!;

  // 3. If slot is paused or publisher is suspended, cache with empty activeCreatives
  if (slot.status !== 'active' || publisher.status !== 'active') {
    const entry: SlotCacheEntry = {
      slotId: slot.id,
      publisherId: slot.publisherId,
      sizes: slot.sizes,
      pricing: slot.pricing,
      activeCreatives: [],
      blockedCategories: publisher.contentPolicy.blockedCategories ?? [],
      refreshedAt: Date.now(),
    };
    await redis.set(key(slotId), entry, { ex: CACHE_TTL_SECONDS });
    return;
  }

  // 4. Fetch active campaigns whose categories intersect this publisher's categories
  const campaignsSnapshot = await db
    .collection(COLLECTIONS.campaigns)
    .where('status', '==', 'active')
    .where('targeting.categories', 'array-contains-any', publisher.categories)
    .withConverter(campaignConverter)
    .get();

  const campaigns = campaignsSnapshot.docs.map((doc) => doc.data());

  // Batch fetch advertiser statuses to filter out suspended ones
  const advertiserIds = Array.from(new Set(campaigns.map((c) => c.advertiserId)));
  const advertiserStatusMap = new Map<string, string>();

  if (advertiserIds.length > 0) {
    const advRefs = advertiserIds.map((id) =>
      db.collection(COLLECTIONS.advertisers).doc(id).withConverter(advertiserConverter),
    );
    const advDocs = await db.getAll(...advRefs);
    for (const doc of advDocs) {
      const data = doc.data();
      if (doc.exists && data) {
        advertiserStatusMap.set(doc.id, data.status);
      }
    }
  }

  // Filter campaigns in memory for budget and advertiser status
  const eligibleCampaigns = campaigns.filter((campaign) => {
    // Check if advertiser is active
    if (advertiserStatusMap.get(campaign.advertiserId) !== 'active') return false;

    // Check remaining budget
    if (campaign.budget.remainingIsk <= 0) return false;

    // Dates schedule check (validTo must be in the future, serving path checks validFrom/validTo)
    if (campaign.schedule.endsAt.getTime() <= Date.now()) return false;

    return true;
  });

  for (const campaign of eligibleCampaigns) {
    await redis.set(`budget:${campaign.id}`, campaign.budget.remainingIsk, { ex: CACHE_TTL_SECONDS * 5 });
  }

  // 5. Gather unique creative IDs from the campaigns
  const creativeIds = Array.from(new Set(eligibleCampaigns.flatMap((c) => c.creativeIds)));

  const creativeMap = new Map<string, Creative>();

  if (creativeIds.length > 0) {
    // Batch fetch creative documents
    const refs = creativeIds.map((id) =>
      db.collection(COLLECTIONS.creatives).doc(id).withConverter(creativeConverter),
    );
    const docs = await db.getAll(...refs);
    for (const doc of docs) {
      const data = doc.data() as Creative | undefined;
      if (doc.exists && data) {
        creativeMap.set(doc.id, data);
      }
    }
  }

  // Sort eligible campaigns by priority (slot_purchased first) and remaining budget (descending)
  const sortedCampaigns = [...eligibleCampaigns].sort((a, b) => {
    const aPrio = a.budget.mode === 'slot_purchased' ? 1 : 0;
    const bPrio = b.budget.mode === 'slot_purchased' ? 1 : 0;
    if (aPrio !== bPrio) return bPrio - aPrio;
    return b.budget.remainingIsk - a.budget.remainingIsk;
  });

  const activeCreatives: CachedCreative[] = [];
  const blockedCategories = publisher.contentPolicy.blockedCategories ?? [];
  const seenAdvertisers = new Set<string>();

  // 6. Map to CachedCreative
  for (const campaign of sortedCampaigns) {
    if (seenAdvertisers.has(campaign.advertiserId)) continue;

    for (const cId of campaign.creativeIds) {
      if (seenAdvertisers.has(campaign.advertiserId)) continue;

      const creative = creativeMap.get(cId);
      if (!creative) continue;

      // Must be approved, honoring requireManualApproval policy
      const needsManual = publisher.contentPolicy.requireManualApproval === true;
      if (needsManual) {
        if (creative.reviewStatus !== 'manual_approved') {
          continue;
        }
      } else {
        if (
          creative.reviewStatus !== 'auto_approved' &&
          creative.reviewStatus !== 'manual_approved'
        ) {
          continue;
        }
      }

      // Check size compatibility with the slot
      const matchesSize = slot.sizes.some(
        (size) => size.width === creative.width && size.height === creative.height,
      );
      if (!matchesSize) continue;

      // Check if blocked by category
      if (creative.autoScanResult?.category) {
        if (blockedCategories.includes(creative.autoScanResult.category)) {
          continue;
        }
      }

      activeCreatives.push({
        creativeId: creative.id,
        campaignId: campaign.id,
        imageUrl: creative.imageUrl,
        clickUrl: creative.clickUrl,
        width: creative.width,
        height: creative.height,
        weight: 1, // Default weight is 1
        geoCountries: [],
        geoRegions: [],
        frequencyCapPerDay: FREQUENCY_CAP_DEFAULT_PER_DAY,
        budgetExhausted: campaign.budget.remainingIsk <= 0,
        validFrom: campaign.schedule.startsAt.getTime(),
        validTo: campaign.schedule.endsAt.getTime(),
        priority: campaign.budget.mode === 'slot_purchased' ? 'slot_purchased' : 'cpm',
      });

      seenAdvertisers.add(campaign.advertiserId);
      break; // Only one creative per advertiser
    }
  }

  const entry: SlotCacheEntry = {
    slotId: slot.id,
    publisherId: slot.publisherId,
    sizes: slot.sizes,
    pricing: slot.pricing,
    activeCreatives,
    blockedCategories,
    refreshedAt: Date.now(),
  };

  await redis.set(key(slotId), entry, { ex: CACHE_TTL_SECONDS });
}

export async function pushCacheForCampaign(campaignId: string): Promise<void> {
  const snap = await db
    .collection(COLLECTIONS.campaigns)
    .doc(campaignId)
    .withConverter(campaignConverter)
    .get();
  if (!snap.exists) return;
  const cmp = snap.data()!;

  const redis = getRedis();
  await redis.set(`budget:${cmp.id}`, cmp.budget.remainingIsk, { ex: CACHE_TTL_SECONDS * 5 });

  // Find publishers in any of the campaign's categories
  const pubSnap = await db
    .collection(COLLECTIONS.publishers)
    .where('categories', 'array-contains-any', cmp.targeting.categories)
    .withConverter(publisherConverter)
    .get();
  const publisherIds = pubSnap.docs.map((d) => d.id);
  if (publisherIds.length === 0) return;

  // Refresh every active slot owned by those publishers
  for (const publisherId of publisherIds) {
    const slotSnap = await db
      .collection(COLLECTIONS.slots)
      .where('publisherId', '==', publisherId)
      .withConverter(slotConverter)
      .get();
    for (const slotDoc of slotSnap.docs) {
      await pushSlotCache(slotDoc.id);
    }
  }
}
