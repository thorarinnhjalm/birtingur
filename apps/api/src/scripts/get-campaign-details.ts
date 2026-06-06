import { db } from '../lib/firebase.js';
import { COLLECTIONS } from '@ada/shared/firestore';

async function getCampaignDetails() {
  console.log('Fetching details for campaigns owned by advertiser: adv_08b3011b0aa6b550cd7f86a6');

  const snap = await db
    .collection(COLLECTIONS.campaigns)
    .where('advertiserId', '==', 'adv_08b3011b0aa6b550cd7f86a6')
    .get();

  if (snap.empty) {
    console.log('No campaigns found.');
    return;
  }

  snap.docs.forEach((doc) => {
    console.log(`\nDocument ID: ${doc.id}`);
    console.log(JSON.stringify(doc.data(), null, 2));
  });
}

getCampaignDetails()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
