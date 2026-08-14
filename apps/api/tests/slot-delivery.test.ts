import { describe, it, expect, beforeEach } from 'vitest';
import {
  COLLECTIONS,
  campaignConverter,
  creativeConverter,
  advertiserConverter,
  publisherConverter,
} from '@ada/shared/firestore';
import type { Campaign, Creative, Publisher, Advertiser, Slot } from '@ada/shared';
import { publisherNetIsk } from '@ada/shared';
import { db } from '../src/lib/firebase';
import { clearFirestoreEmulator } from './helpers/emulator';
import { createSlot, updateSlot } from '../src/services/slots';
import { diagnoseSlotDelivery } from '../src/services/slot-delivery';

const PUB_ID = 'pub_matur';
const ADV_ID = 'adv_1';

async function writePublisher(overrides: Partial<Publisher> = {}): Promise<Publisher> {
  const publisher = {
    id: PUB_ID,
    ownerEmail: 'ritstjori@matarbloggid.is',
    domain: 'matarbloggid.is',
    displayName: 'Matarbloggið',
    categories: ['matur'],
    status: 'active',
    payoutMethod: {
      type: 'bank',
      iban: '012315012345',
      kennitala: '1234567890',
      accountName: 'Matarbloggið ehf',
    },
    contentPolicy: { blockedCategories: [] },
    createdAt: new Date(),
    ...overrides,
  } as Publisher;
  await db
    .collection(COLLECTIONS.publishers)
    .doc(publisher.id)
    .withConverter(publisherConverter)
    .set(publisher);
  return publisher;
}

async function writeAdvertiser(status: Advertiser['status'] = 'active') {
  await db
    .collection(COLLECTIONS.advertisers)
    .doc(ADV_ID)
    .withConverter(advertiserConverter)
    .set({
      id: ADV_ID,
      ownerEmail: 'adv@example.is',
      companyName: 'Bakarí',
      kennitala: '1234567890',
      vatNumber: '1234567890',
      walletBalanceIsk: 100_000,
      status,
      createdAt: new Date(),
    } as Advertiser);
}

async function writeCreative(id: string, overrides: Partial<Creative> = {}) {
  await db
    .collection(COLLECTIONS.creatives)
    .doc(id)
    .withConverter(creativeConverter)
    .set({
      id,
      advertiserId: ADV_ID,
      imageUrl: 'https://cdn.example.is/a.png',
      width: 300,
      height: 250,
      clickUrl: 'https://bakari.is',
      reviewStatus: 'auto_approved',
      reviewLog: [],
      ...overrides,
    } as Creative);
}

async function writeCampaign(id: string, creativeIds: string[], overrides: Partial<Campaign> = {}) {
  await db
    .collection(COLLECTIONS.campaigns)
    .doc(id)
    .withConverter(campaignConverter)
    .set({
      id,
      advertiserId: ADV_ID,
      creativeIds,
      targeting: { categories: ['matur'] },
      schedule: {
        startsAt: new Date(Date.now() - 1000),
        endsAt: new Date(Date.now() + 86_400_000),
      },
      budget: { mode: 'cpm_capped', totalIsk: 50_000, remainingIsk: 50_000 },
      status: 'active',
      ...overrides,
    } as Campaign);
}

function makeSlot(): Promise<Slot> {
  return createSlot({
    publisherId: PUB_ID,
    name: 'Forsíða',
    sizes: [{ width: 300, height: 250 }],
    placement: { pageMatcher: '*', position: 'in_content' },
  });
}

describe('diagnoseSlotDelivery', () => {
  beforeEach(async () => {
    await clearFirestoreEmulator();
  });

  // The case that prompted this tool: the publisher sees a house ad and
  // cannot tell "broken" from "nothing to show yet".
  it('reports an empty market as a normal state, not a fault', async () => {
    const publisher = await writePublisher();
    const slot = await makeSlot();

    const d = await diagnoseSlotDelivery(slot, publisher);

    expect(d.status).toBe('no_campaigns_in_categories');
    expect(d.serving).toBe(false);
    expect(d.demand.campaignsInCategories).toBe(0);
    expect(d.reasons.join(' ')).toContain('eðlilegt');
    expect(d.nextSteps.join(' ')).toContain('Ekkert er að plássinu');
  });

  it('reports serving when an eligible campaign has a matching approved creative', async () => {
    const publisher = await writePublisher();
    const slot = await makeSlot();
    await writeAdvertiser();
    await writeCreative('cre_a');
    await writeCampaign('cmp_a', ['cre_a']);

    const d = await diagnoseSlotDelivery(slot, publisher);

    expect(d.status).toBe('serving');
    expect(d.serving).toBe(true);
    expect(d.demand.creatives.usable).toBe(1);
  });

  // The most actionable failure: demand exists, the slot just doesn't offer
  // the size it comes in.
  it('names the size mismatch and suggests the size to add', async () => {
    const publisher = await writePublisher();
    const slot = await makeSlot(); // 300x250 only
    await writeAdvertiser();
    await writeCreative('cre_wide', { width: 728, height: 90 });
    await writeCampaign('cmp_a', ['cre_wide']);

    const d = await diagnoseSlotDelivery(slot, publisher);

    expect(d.status).toBe('no_matching_creatives');
    expect(d.demand.creatives.sizeMismatch).toBe(1);
    expect(d.demand.availableSizesNotOnSlot).toEqual(['728x90']);
    expect(d.nextSteps.join(' ')).toContain('728x90');
  });

  it('distinguishes an exhausted budget from an empty market', async () => {
    const publisher = await writePublisher();
    const slot = await makeSlot();
    await writeAdvertiser();
    await writeCreative('cre_a');
    await writeCampaign('cmp_a', ['cre_a'], {
      budget: { mode: 'cpm_capped', totalIsk: 50_000, remainingIsk: 0 },
    });

    const d = await diagnoseSlotDelivery(slot, publisher);

    expect(d.status).toBe('no_eligible_campaigns');
    expect(d.demand.campaignsInCategories).toBe(1);
    expect(d.demand.eligibleCampaigns).toBe(0);
    expect(d.demand.droppedCampaigns.budgetExhausted).toBe(1);
  });

  it('reports a future-dated campaign as scheduled rather than broken', async () => {
    const publisher = await writePublisher();
    const slot = await makeSlot();
    await writeAdvertiser();
    await writeCreative('cre_a');
    await writeCampaign('cmp_a', ['cre_a'], {
      schedule: {
        startsAt: new Date(Date.now() + 7 * 86_400_000),
        endsAt: new Date(Date.now() + 30 * 86_400_000),
      },
    });

    const d = await diagnoseSlotDelivery(slot, publisher);

    expect(d.status).toBe('scheduled');
    expect(d.demand.startsAt).not.toBeNull();
    expect(d.nextSteps.join(' ')).toContain('Engra aðgerða');
  });

  it('reports a paused slot before looking at demand at all', async () => {
    const publisher = await writePublisher();
    const created = await makeSlot();
    const slot = await updateSlot(created.id, { status: 'paused' });
    await writeAdvertiser();
    await writeCreative('cre_a');
    await writeCampaign('cmp_a', ['cre_a']);

    const d = await diagnoseSlotDelivery(slot, publisher);

    expect(d.status).toBe('slot_paused');
    expect(d.nextSteps.join(' ')).toContain('update_slot');
  });

  it('reports an inactive publisher', async () => {
    const publisher = await writePublisher({ status: 'suspended' });
    const slot = await makeSlot();

    const d = await diagnoseSlotDelivery(slot, publisher);

    expect(d.status).toBe('publisher_inactive');
  });

  it('counts creatives still awaiting approval separately from size mismatches', async () => {
    const publisher = await writePublisher();
    const slot = await makeSlot();
    await writeAdvertiser();
    await writeCreative('cre_pending', { reviewStatus: 'pending' });
    await writeCampaign('cmp_a', ['cre_pending']);

    const d = await diagnoseSlotDelivery(slot, publisher);

    expect(d.status).toBe('no_matching_creatives');
    expect(d.demand.creatives.notApproved).toBe(1);
    expect(d.demand.creatives.sizeMismatch).toBe(0);
  });

  // Fail-closed brand safety: a blocking publisher hides creatives that carry
  // no sensitive-flag data at all, which is easy to mistake for "no demand".
  it('attributes a content-policy block to the policy, not to missing demand', async () => {
    const publisher = await writePublisher({
      contentPolicy: { blockedCategories: ['afengi'] },
    } as Partial<Publisher>);
    const slot = await makeSlot();
    await writeAdvertiser();
    await writeCreative('cre_a', {
      autoScanResult: {
        nsfwScore: 0,
        blockedTerms: [],
        category: 'matur',
        confidence: 0.9,
        sensitiveCategories: ['afengi'],
      },
    } as Partial<Creative>);
    await writeCampaign('cmp_a', ['cre_a']);

    const d = await diagnoseSlotDelivery(slot, publisher);

    expect(d.status).toBe('no_matching_creatives');
    expect(d.demand.creatives.blockedByContentPolicy).toBe(1);
    expect(d.nextSteps.join(' ')).toContain('set_content_policy');
  });

  it('drops campaigns whose advertiser is suspended', async () => {
    const publisher = await writePublisher();
    const slot = await makeSlot();
    await writeAdvertiser('suspended');
    await writeCreative('cre_a');
    await writeCampaign('cmp_a', ['cre_a']);

    const d = await diagnoseSlotDelivery(slot, publisher);

    expect(d.status).toBe('no_eligible_campaigns');
    expect(d.demand.droppedCampaigns.advertiserInactive).toBe(1);
  });

  it('never mutates state: the diagnosis is read-only', async () => {
    const publisher = await writePublisher();
    const slot = await makeSlot();
    await writeAdvertiser();
    await writeCreative('cre_a');
    await writeCampaign('cmp_a', ['cre_a']);

    const before = (await db.collection(COLLECTIONS.campaigns).doc('cmp_a').get()).data();
    await diagnoseSlotDelivery(slot, publisher);
    const after = (await db.collection(COLLECTIONS.campaigns).doc('cmp_a').get()).data();

    expect(after).toEqual(before);
  });

  /**
   * `last7Days.earningsIsk` is the number an agent relays to a publisher as
   * "you earned X". It was `stats.spendIsk` — the GROSS, what the advertiser
   * pays — under a field literally named earnings, so every agent answer
   * overstated the publisher's take by 25%.
   */
  it('reports last-7-day earnings net of the platform fee, not gross', async () => {
    const publisher = await writePublisher();
    const slot = await makeSlot();

    const now = new Date();
    const dk = now.toISOString().split('T')[0]!.replace(/-/g, '');
    await db.doc(`${COLLECTIONS.stats}/publisher_slots/${publisher.id}_${slot.id}/${dk}`).set({
      impressions: 10_000,
      clicks: 20,
      spendIsk: 5500,
      pageviews: 12_000,
    });

    const d = await diagnoseSlotDelivery(slot, publisher);

    expect(d.last7Days.impressions).toBe(10_000);
    // 4.400, what the publisher is paid — not the 5.500 the advertiser paid.
    expect(d.last7Days.earningsIsk).toBe(publisherNetIsk(5500));
    expect(d.last7Days.earningsIsk).not.toBe(5500);
  });
});
