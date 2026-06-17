import { db } from '../lib/firebase.js';
import { COLLECTIONS } from '@ada/shared/firestore';
import { FLAT_CPM_ISK } from '@ada/shared';

async function seed() {
  console.log('Seeding demo data into Firestore...');

  const now = new Date();

  // 1. Seed Publisher
  const pubRef = db.collection(COLLECTIONS.publishers).doc('pub_demo_id');
  await pubRef.set({
    id: 'pub_demo_id',
    ownerEmail: 'demoa@birtingur.is',
    domain: 'visir.is',
    displayName: 'Vísir.is',
    payoutMethod: {
      type: 'bank',
      iban: 'IS9901234567890123654',
      kennitala: '4701262480',
      accountName: 'Neðri Hóll Hugmyndahús ehf.',
    },
    contentPolicy: {
      blockedCategories: [],
      requireManualApproval: true,
    },
    categories: ['matur'],
    status: 'active',
    createdAt: now,
  });
  console.log('✔ Seeded Publisher: pub_demo_id');

  // 2. Seed Slot
  const slotRef = db.collection(COLLECTIONS.slots).doc('slot_demo_id');
  await slotRef.set({
    id: 'slot_demo_id',
    publisherId: 'pub_demo_id',
    name: 'Forsíða stór banner',
    sizes: [
      { width: 970, height: 250 },
      { width: 300, height: 250 },
    ],
    pricing: {
      mode: 'cpm',
      cpmIsk: FLAT_CPM_ISK,
    },
    placement: {
      pageMatcher: '/',
      position: 'above_fold',
    },
    status: 'active',
  });
  console.log('✔ Seeded Slot: slot_demo_id');

  // 3. Seed Advertiser
  const advRef = db.collection(COLLECTIONS.advertisers).doc('adv_demo_id');
  await advRef.set({
    id: 'adv_demo_id',
    ownerEmail: 'demoa@birtingur.is',
    companyName: 'Gullfoss Ferðaþjónusta ehf.',
    kennitala: '1234567890',
    vatNumber: '159950',
    walletBalanceIsk: 75000,
    status: 'active',
    createdAt: now,
  });
  console.log('✔ Seeded Advertiser: adv_demo_id');

  // 4. Seed Active Creative
  const creativeRef = db.collection(COLLECTIONS.creatives).doc('creative_demo_id');
  await creativeRef.set({
    id: 'creative_demo_id',
    advertiserId: 'adv_demo_id',
    imageUrl: 'https://images.unsplash.com/photo-1587654780291-39c9404d746b?w=970&h=250&fit=crop',
    width: 970,
    height: 250,
    clickUrl: 'https://lego.is',
    reviewStatus: 'manual_approved',
    createdAt: now,
  });

  // 5. Seed Pending Creative for approval queue
  const creativePendingRef = db.collection(COLLECTIONS.creatives).doc('creative_pending_demo');
  await creativePendingRef.set({
    id: 'creative_pending_demo',
    advertiserId: 'adv_demo_id',
    imageUrl: 'https://images.unsplash.com/photo-1566241477600-ac026ad43874?w=970&h=250&fit=crop',
    width: 970,
    height: 250,
    clickUrl: 'https://ikea.is',
    reviewStatus: 'pending',
    createdAt: now,
  });
  console.log('✔ Seeded Creatives');

  // 6. Seed Active Campaign
  const campaignRef = db.collection(COLLECTIONS.campaigns).doc('camp_demo_id');
  await campaignRef.set({
    id: 'camp_demo_id',
    advertiserId: 'adv_demo_id',
    creativeIds: ['creative_demo_id'],
    targeting: {
      categories: ['matur'],
    },
    schedule: {
      startsAt: new Date(now.getTime() - 86400000 * 5),
      endsAt: new Date(now.getTime() + 86400000 * 10),
    },
    budget: {
      mode: 'cpm_capped',
      totalIsk: 150000,
      remainingIsk: 112000,
    },
    status: 'active',
  });
  console.log('✔ Seeded Active Campaign: camp_demo_id');

  // 7. Seed Pending Approval Campaign
  const campaignPendingRef = db.collection(COLLECTIONS.campaigns).doc('camp_pending_demo');
  await campaignPendingRef.set({
    id: 'camp_pending_demo',
    advertiserId: 'adv_demo_id',
    creativeIds: ['creative_pending_demo'],
    targeting: {
      categories: ['matur'],
    },
    schedule: {
      startsAt: now,
      endsAt: new Date(now.getTime() + 86400000 * 30),
    },
    budget: {
      mode: 'cpm_capped',
      totalIsk: 50000,
      remainingIsk: 50000,
    },
    status: 'pending_approval',
  });
  console.log('✔ Seeded Pending Campaign: camp_pending_demo');

  // 8. Seed daily statistics for the publisher for the last 7 days
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const dateStr = d.toISOString().split('T')[0]!; // YYYY-MM-DD
    const dk = dateStr.replace(/-/g, ''); // YYYYMMDD

    // 15k-25k impressions, 200-500 clicks
    const impressions =
      18000 + Math.floor(Math.sin(i * 0.8) * 4000) + Math.floor(Math.random() * 2000);
    const clicks = Math.floor(impressions * (0.015 + Math.random() * 0.01));
    const spendIsk = Math.floor((impressions / 1000) * FLAT_CPM_ISK);

    // Publisher stats subcollection document
    const pubStatsRef = db.doc(`${COLLECTIONS.stats}/publishers/pub_demo_id/${dk}`);
    await pubStatsRef.set({
      impressions,
      clicks,
      spendIsk,
      updatedAt: now,
    });

    // Seed slot-level statistics as well
    const slotStatsRef = db.doc(
      `${COLLECTIONS.stats}/publisher_slots/pub_demo_id_slot_demo_id/${dk}`,
    );
    await slotStatsRef.set({
      impressions: Math.round(impressions * 0.9),
      clicks: Math.round(clicks * 0.9),
      spendIsk: Math.round(spendIsk * 0.9),
      pageviews: Math.round(impressions * 1.5),
      byCampaign: {
        camp_demo_id: {
          impressions: Math.round(impressions * 0.9),
          clicks: Math.round(clicks * 0.9),
        },
      },
      updatedAt: now,
    });

    // Campaign stats daily breakdown
    // Each hourly document for the campaign
    for (let hour = 0; hour < 24; hour++) {
      const hh = hour.toString().padStart(2, '0');
      const hourStr = `${dk}${hh}`;

      const hImpressions = Math.floor(impressions / 24) + Math.floor(Math.random() * 100);
      const hClicks = Math.floor(clicks / 24) + Math.floor(Math.random() * 5);
      const hSpend = Math.floor(spendIsk / 24) + Math.floor(Math.random() * 20);

      const cmpStatsRef = db.doc(`${COLLECTIONS.stats}/campaigns/${campaignRef.id}/${hourStr}`);
      await cmpStatsRef.set({
        impressions: hImpressions,
        clicks: hClicks,
        spendIsk: hSpend,
        byPublisher: {
          pub_demo_id: {
            impressions: hImpressions,
            clicks: hClicks,
            spendIsk: hSpend,
          },
        },
      });
    }
  }
  console.log('✔ Seeded 7-day Hourly Stats for Publisher & Campaign');
  console.log('Firestore seeding completed successfully.');
}

seed().catch((err) => {
  console.error('Fatal error during seeding:', err);
  process.exit(1);
});
