import { db } from '../lib/firebase.js';
import { getRedis, isRedisConfigured } from '../lib/redis.js';
import {
  COLLECTIONS,
  campaignConverter,
  creativeConverter,
  advertiserConverter,
} from '@ada/shared/firestore';
import { SENSITIVE_AD_CATEGORY_SLUGS, publisherNetIsk } from '@ada/shared';
import type { Slot, Publisher, Campaign, Creative, SlotCacheEntry } from '@ada/shared';
import { getSlotStats } from './slot-stats.js';

/**
 * Answers "is this slot actually serving real ads, and if not, why?".
 *
 * Integration feedback that prompted this: a partner agent embedded a slot,
 * saw the Birtingur house ad, and had no way to tell whether the integration
 * was broken or whether nothing simply matched yet. Those two look identical
 * from the outside — both render a house ad — but one needs a code fix and
 * the other needs patience or a different ad size.
 *
 * The diagnosis replays `lib/push-cache.ts`'s eligibility pipeline against
 * Firestore and counts what each filter drops, so the answer names the
 * actual blocker instead of saying "no fill". It reads the same Redis entry
 * the serving hot path reads, and never writes anything.
 */

export type SlotDeliveryStatus =
  | 'serving'
  | 'scheduled'
  | 'slot_paused'
  | 'publisher_inactive'
  | 'no_campaigns_in_categories'
  | 'no_eligible_campaigns'
  | 'no_matching_creatives'
  | 'cache_not_built';

export interface SlotDeliveryDiagnosis {
  slotId: string;
  name: string;
  slotStatus: Slot['status'];
  publisherStatus: Publisher['status'];
  categories: string[];
  sizes: string[];
  fallbackType: 'house_ad' | 'transparent';
  status: SlotDeliveryStatus;
  serving: boolean;
  summary: string;
  reasons: string[];
  nextSteps: string[];
  cache: {
    configured: boolean;
    present: boolean;
    activeCreativeCount: number;
    refreshedAt: string | null;
    ageSeconds: number | null;
  };
  demand: {
    campaignsInCategories: number;
    eligibleCampaigns: number;
    droppedCampaigns: {
      advertiserInactive: number;
      budgetExhausted: number;
      ended: number;
    };
    creatives: {
      considered: number;
      usable: number;
      notApproved: number;
      sizeMismatch: number;
      blockedByContentPolicy: number;
      missing: number;
    };
    /** Sizes advertisers have approved creatives in that this slot doesn't offer. */
    availableSizesNotOnSlot: string[];
    startsAt: string | null;
  };
  /** `earningsIsk` is NET of the platform fee — the publisher's share of what
   * this traffic is worth over the window. (What is actually PAID OUT is the
   * ledger balance on the payouts page; this figure describes the traffic.) It
   * was the gross `spendIsk`, 25% high, under a field literally named
   * earnings. */
  last7Days: { impressions: number; clicks: number; earningsIsk: number };
}

const sizeKey = (s: { width: number; height: number }) => `${s.width}x${s.height}`;

function blockedSensitiveCategories(publisher: Publisher): string[] {
  return (publisher.contentPolicy.blockedCategories ?? []).filter((c) =>
    SENSITIVE_AD_CATEGORY_SLUGS.includes(c),
  );
}

async function readCacheEntry(slotId: string): Promise<SlotCacheEntry | null> {
  if (!isRedisConfigured()) return null;
  try {
    return await getRedis().get<SlotCacheEntry>(`slot:${slotId}`);
  } catch {
    // A diagnosis that itself 500s is useless — report the cache as absent
    // and let the Firestore-derived half of the answer stand on its own.
    return null;
  }
}

export async function diagnoseSlotDelivery(
  slot: Slot,
  publisher: Publisher,
): Promise<SlotDeliveryDiagnosis> {
  const slotSizes = new Set(slot.sizes.map(sizeKey));
  const blockedCategories = blockedSensitiveCategories(publisher);
  const now = Date.now();

  const [cacheEntry, stats] = await Promise.all([
    readCacheEntry(slot.id),
    getSlotStats(publisher.id, slot.id, 7),
  ]);

  const demand = {
    campaignsInCategories: 0,
    eligibleCampaigns: 0,
    droppedCampaigns: { advertiserInactive: 0, budgetExhausted: 0, ended: 0 },
    creatives: {
      considered: 0,
      usable: 0,
      notApproved: 0,
      sizeMismatch: 0,
      blockedByContentPolicy: 0,
      missing: 0,
    },
    availableSizesNotOnSlot: [] as string[],
    startsAt: null as string | null,
  };

  // A publisher with no categories matches no campaign, and Firestore rejects
  // an empty array-contains-any anyway.
  if (publisher.categories.length > 0) {
    const snapshot = await db
      .collection(COLLECTIONS.campaigns)
      .where('status', '==', 'active')
      .where('targeting.categories', 'array-contains-any', publisher.categories)
      .withConverter(campaignConverter)
      .get();
    const campaigns = snapshot.docs.map((d) => d.data());
    demand.campaignsInCategories = campaigns.length;

    const advertiserStatus = new Map<string, string>();
    const advertiserIds = Array.from(new Set(campaigns.map((c) => c.advertiserId)));
    if (advertiserIds.length > 0) {
      const docs = await db.getAll(
        ...advertiserIds.map((id) =>
          db.collection(COLLECTIONS.advertisers).doc(id).withConverter(advertiserConverter),
        ),
      );
      for (const doc of docs) {
        const data = doc.data();
        if (doc.exists && data) advertiserStatus.set(doc.id, data.status);
      }
    }

    const eligible: Campaign[] = [];
    for (const campaign of campaigns) {
      if (advertiserStatus.get(campaign.advertiserId) !== 'active') {
        demand.droppedCampaigns.advertiserInactive++;
      } else if (campaign.budget.remainingIsk <= 0) {
        demand.droppedCampaigns.budgetExhausted++;
      } else if (campaign.schedule.endsAt.getTime() <= now) {
        demand.droppedCampaigns.ended++;
      } else {
        eligible.push(campaign);
      }
    }
    demand.eligibleCampaigns = eligible.length;

    const creativeIds = Array.from(new Set(eligible.flatMap((c) => c.creativeIds)));
    const creatives = new Map<string, Creative>();
    if (creativeIds.length > 0) {
      const docs = await db.getAll(
        ...creativeIds.map((id) =>
          db.collection(COLLECTIONS.creatives).doc(id).withConverter(creativeConverter),
        ),
      );
      for (const doc of docs) {
        const data = doc.data() as Creative | undefined;
        if (doc.exists && data) creatives.set(doc.id, data);
      }
    }

    const needsManual = publisher.contentPolicy.requireManualApproval === true;
    const approvedElsewhereSizes = new Set<string>();
    let earliestStart: number | null = null;

    for (const campaign of eligible) {
      for (const id of campaign.creativeIds) {
        demand.creatives.considered++;
        const creative = creatives.get(id);
        if (!creative) {
          demand.creatives.missing++;
          continue;
        }

        const approved = needsManual
          ? creative.reviewStatus === 'manual_approved'
          : creative.reviewStatus === 'auto_approved' ||
            creative.reviewStatus === 'manual_approved';
        if (!approved) {
          demand.creatives.notApproved++;
          continue;
        }

        if (blockedCategories.length > 0) {
          const flags = creative.autoScanResult?.sensitiveCategories;
          if (!flags || flags.some((f) => blockedCategories.includes(f))) {
            demand.creatives.blockedByContentPolicy++;
            continue;
          }
        }

        if (!slotSizes.has(sizeKey(creative))) {
          demand.creatives.sizeMismatch++;
          // Approved and otherwise servable — it just isn't a size this slot
          // offers, which is the one blocker the publisher can fix directly.
          approvedElsewhereSizes.add(sizeKey(creative));
          continue;
        }

        demand.creatives.usable++;
        const startsAt = campaign.schedule.startsAt.getTime();
        if (earliestStart === null || startsAt < earliestStart) earliestStart = startsAt;
      }
    }

    demand.availableSizesNotOnSlot = Array.from(approvedElsewhereSizes).sort();
    if (earliestStart !== null && earliestStart > now) {
      demand.startsAt = new Date(earliestStart).toISOString();
    }
  }

  const cacheAgeSeconds = cacheEntry ? Math.round((now - cacheEntry.refreshedAt) / 1000) : null;

  const { status, summary, reasons, nextSteps } = classify({
    slot,
    publisher,
    cacheEntry,
    demand,
    impressions: stats.impressions,
  });

  return {
    slotId: slot.id,
    name: slot.name,
    slotStatus: slot.status,
    publisherStatus: publisher.status,
    categories: publisher.categories,
    sizes: slot.sizes.map(sizeKey),
    fallbackType: slot.fallbackType ?? 'house_ad',
    status,
    serving: status === 'serving',
    summary,
    reasons,
    nextSteps,
    cache: {
      configured: isRedisConfigured(),
      present: cacheEntry !== null,
      activeCreativeCount: cacheEntry?.activeCreatives.length ?? 0,
      refreshedAt: cacheEntry ? new Date(cacheEntry.refreshedAt).toISOString() : null,
      ageSeconds: cacheAgeSeconds,
    },
    demand,
    last7Days: {
      impressions: stats.impressions,
      clicks: stats.clicks,
      earningsIsk: publisherNetIsk(stats.spendIsk),
    },
  };
}

function classify(input: {
  slot: Slot;
  publisher: Publisher;
  cacheEntry: SlotCacheEntry | null;
  demand: SlotDeliveryDiagnosis['demand'];
  impressions: number;
}): {
  status: SlotDeliveryStatus;
  summary: string;
  reasons: string[];
  nextSteps: string[];
} {
  const { slot, publisher, cacheEntry, demand, impressions } = input;
  const fallback =
    (slot.fallbackType ?? 'house_ad') === 'house_ad'
      ? 'húsauglýsing Birtings'
      : 'gagnsætt pláss (ekkert sýnilegt)';

  if (slot.status !== 'active') {
    return {
      status: 'slot_paused',
      summary: `Plássið er í pásu og birtir því ${fallback}.`,
      reasons: ['Staða plássins er "paused".'],
      nextSteps: ['Settu plássið í "active" með update_slot til að hefja birtingar á ný.'],
    };
  }

  if (publisher.status !== 'active') {
    return {
      status: 'publisher_inactive',
      summary: `Útgefandinn er ekki virkur, svo öll pláss hans birta ${fallback}.`,
      reasons: [`Staða útgefanda er "${publisher.status}".`],
      nextSteps: ['Hafðu samband við Birting til að fá stöðuna leiðrétta.'],
    };
  }

  if (isRedisConfigured() && !cacheEntry) {
    return {
      status: 'cache_not_built',
      summary: `Plássið er ekki komið í birtingarskrána og birtir ${fallback} þangað til.`,
      reasons: [
        'Engin skyndiminnisfærsla fannst fyrir plássið. Hún er endurbyggð sjálfkrafa á 10 mínútna fresti.',
      ],
      nextSteps: ['Bíddu í allt að 10 mínútur og keyrðu þetta tól aftur.'],
    };
  }

  if (demand.creatives.usable > 0 && demand.startsAt) {
    return {
      status: 'scheduled',
      summary: `Herferð er tilbúin en byrjar ekki fyrr en ${demand.startsAt.slice(0, 10)}. Fram að því birtist ${fallback}.`,
      reasons: [`Fyrsta herferðin sem passar hefst ${demand.startsAt.slice(0, 10)}.`],
      nextSteps: ['Engra aðgerða er þörf. Birtingar hefjast sjálfkrafa á upphafsdegi.'],
    };
  }

  // The Redis entry is what serving actually reads, so it decides when it
  // exists. With Redis unconfigured (local dev) there is nothing to read and
  // the Firestore replay is the only evidence available.
  const cacheSaysServing = cacheEntry
    ? cacheEntry.activeCreatives.length > 0
    : !isRedisConfigured();
  const serving = cacheSaysServing && demand.creatives.usable > 0;
  if (serving) {
    return {
      status: 'serving',
      summary:
        impressions > 0
          ? `Plássið birtir alvöru auglýsingar. ${impressions.toLocaleString('is-IS')} birtingar síðustu 7 daga.`
          : 'Plássið birtir alvöru auglýsingar. Engar birtingar hafa mælst enn, sem er eðlilegt á nýju plássi með litla umferð.',
      reasons: [
        cacheEntry
          ? `${cacheEntry.activeCreatives.length} auglýsing(ar) eru virkar á plássinu núna.`
          : `${demand.creatives.usable} auglýsing(ar) uppfylla skilyrði plássins.`,
      ],
      nextSteps:
        impressions > 0
          ? []
          : [
              'Ef engar birtingar mælast eftir sólarhring af umferð, athugaðu hvort innfellingarkóðinn sé á síðunni og hvort auglýsingablokkari sé virkur.',
            ],
    };
  }

  const reasons: string[] = [];
  const nextSteps: string[] = [];

  if (demand.campaignsInCategories === 0) {
    reasons.push(
      `Engin virk herferð er í flokkunum þínum (${publisher.categories.join(', ')}). Þetta er eðlilegt ástand, ekki bilun.`,
    );
    nextSteps.push(
      'Ekkert er að plássinu. Það byrjar að birta um leið og auglýsandi kaupir í þínum flokki.',
    );
    if (publisher.categories.length === 1) {
      nextSteps.push(
        'Ef vefurinn þinn á heima í fleiri flokkum getur það aukið eftirspurn að bæta þeim við.',
      );
    }
    return {
      status: 'no_campaigns_in_categories',
      summary: `Engin herferð er í boði fyrir flokkana þína, svo plássið birtir ${fallback}.`,
      reasons,
      nextSteps,
    };
  }

  if (demand.eligibleCampaigns === 0) {
    const d = demand.droppedCampaigns;
    if (d.budgetExhausted > 0)
      reasons.push(`${d.budgetExhausted} herferð(ir) hafa klárað fjárhag.`);
    if (d.ended > 0) reasons.push(`${d.ended} herferð(ir) eru útrunnar.`);
    if (d.advertiserInactive > 0)
      reasons.push(`${d.advertiserInactive} herferð(ir) tilheyra óvirkum auglýsanda.`);
    return {
      status: 'no_eligible_campaigns',
      summary: `Herferðir eru til í þínum flokkum en engin þeirra getur birst núna, svo plássið birtir ${fallback}.`,
      reasons,
      nextSteps: [
        'Ekkert er að plássinu. Bíddu eftir næstu herferð eða nýrri fjármögnun þeirra sem fyrir eru.',
      ],
    };
  }

  const c = demand.creatives;
  if (c.sizeMismatch > 0) {
    reasons.push(
      `${c.sizeMismatch} samþykkt auglýsing(ar) passa ekki við stærðirnar sem plássið býður (${input.slot.sizes.map(sizeKey).join(', ')}).`,
    );
    if (demand.availableSizesNotOnSlot.length > 0) {
      nextSteps.push(
        `Bættu við stærð sem eftirspurn er eftir: ${demand.availableSizesNotOnSlot.join(', ')}. Notaðu update_slot og list_ad_sizes.`,
      );
    }
  }
  if (c.notApproved > 0) {
    reasons.push(`${c.notApproved} auglýsing(ar) bíða enn samþykktar.`);
    if (publisher.contentPolicy.requireManualApproval) {
      nextSteps.push(
        'Þú ert með handvirka samþykkt kveikta, svo þær bíða þín. Notaðu list_pending_approvals.',
      );
    }
  }
  if (c.blockedByContentPolicy > 0) {
    reasons.push(
      `${c.blockedByContentPolicy} auglýsing(ar) eru útilokaðar af efnisstefnu þinni (${(publisher.contentPolicy.blockedCategories ?? []).join(', ')}).`,
    );
    nextSteps.push('Þú getur rýmkað efnisstefnuna með set_content_policy ef þú vilt.');
  }
  if (c.missing > 0) {
    reasons.push(`${c.missing} auglýsing(ar) vantar í kerfið og voru hunsaðar.`);
  }
  if (reasons.length === 0) {
    reasons.push('Herferðir eru virkar en engin auglýsing þeirra komst í gegn fyrir þetta pláss.');
  }

  return {
    status: 'no_matching_creatives',
    summary: `${demand.eligibleCampaigns} herferð(ir) eru virkar í þínum flokkum en engin auglýsing passar við plássið, svo það birtir ${fallback}.`,
    reasons,
    nextSteps,
  };
}
