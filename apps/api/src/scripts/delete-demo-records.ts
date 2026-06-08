import { db } from '../lib/firebase.js';
import { COLLECTIONS } from '@ada/shared/firestore';

async function deleteDemoRecords() {
  console.log('Starting deletion of only demo records from Firestore...');

  const collections = [
    COLLECTIONS.publishers,
    COLLECTIONS.slots,
    COLLECTIONS.advertisers,
    COLLECTIONS.creatives,
    COLLECTIONS.campaigns,
    COLLECTIONS.ledger,
    COLLECTIONS.payouts,
  ];

  // 1. Delete documents in top-level collections containing 'demo' in their ID
  for (const colName of collections) {
    const snap = await db.collection(colName).get();
    let count = 0;
    const batch = db.batch();

    for (const doc of snap.docs) {
      if (doc.id.includes('demo')) {
        batch.delete(doc.ref);
        count++;
      }
    }

    if (count > 0) {
      await batch.commit();
      console.log(`✔ Deleted ${count} demo documents from ${colName}`);
    }
  }

  // 2. Delete entries in ledger that mention any demo IDs
  const ledgerSnap = await db.collection(COLLECTIONS.ledger).get();
  let ledgerCount = 0;
  const ledgerBatch = db.batch();
  for (const doc of ledgerSnap.docs) {
    const data = doc.data();
    const isDemo =
      (data.campaignId && data.campaignId.includes('demo')) ||
      (data.publisherId && data.publisherId.includes('demo')) ||
      (data.advertiserId && data.advertiserId.includes('demo')) ||
      doc.id.includes('demo');
    if (isDemo) {
      ledgerBatch.delete(doc.ref);
      ledgerCount++;
    }
  }
  if (ledgerCount > 0) {
    await ledgerBatch.commit();
    console.log(`✔ Deleted ${ledgerCount} demo ledger entries`);
  }

  // 3. Delete stats subcollections recursively
  const statsDocPaths = [
    'stats/camp_demo_id', // from old seed path structure
  ];

  const statsCollectionPaths = [
    'stats/publishers/pub_demo_id',
    'stats/publisher_slots/pub_demo_id_slot_demo_id',
    'stats/campaigns/camp_demo_id',
    'stats/campaigns/camp_pending_demo',
    'stats/creatives/creative_demo_id',
    'stats/creatives/creative_pending_demo',
  ];

  for (const p of statsDocPaths) {
    const ref = db.doc(p);
    try {
      await db.recursiveDelete(ref);
      console.log(`✔ Recursively deleted stats document for ${p}`);
    } catch (err) {
      console.warn(`Note: could not recursively delete stats document for ${p}:`, err);
    }
  }

  for (const p of statsCollectionPaths) {
    const ref = db.collection(p);
    try {
      await db.recursiveDelete(ref);
      console.log(`✔ Recursively deleted stats collection for ${p}`);
    } catch (err) {
      console.warn(`Note: could not recursively delete stats collection for ${p}:`, err);
    }
  }

  console.log('Targeted demo data clearance completed successfully!');
}

deleteDemoRecords().catch((err) => {
  console.error('Failed to delete demo records:', err);
  process.exit(1);
});
