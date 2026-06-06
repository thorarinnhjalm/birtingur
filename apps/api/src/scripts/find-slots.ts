import { db } from '../lib/firebase.js';
import { COLLECTIONS } from '@ada/shared/firestore';

async function findSlots() {
  console.log('Fetching active slots and publishers to match campaign...');

  // 1. Get all active slots
  const slotsSnap = await db.collection(COLLECTIONS.slots).where('status', '==', 'active').get();
  if (slotsSnap.empty) {
    console.log('No active slots found in database.');
    return;
  }

  // 2. Get all publishers to check their categories
  const pubsSnap = await db
    .collection(COLLECTIONS.publishers)
    .where('status', '==', 'active')
    .get();
  const publishers = new Map(pubsSnap.docs.map((doc) => [doc.id, doc.data()]));

  console.log('\n=== MATCHING SLOTS FOR CAMPAIGN (728x90, category: matur) ===');
  let matchCount = 0;

  slotsSnap.docs.forEach((doc) => {
    const slot = doc.data();
    const pub = publishers.get(slot.publisherId);

    if (!pub) {
      console.log(`- Slot: ${slot.name} (${slot.id}) - Publisher is suspended or missing.`);
      return;
    }

    // Check size compatibility: creative is 728x90
    const hasCorrectSize = slot.sizes?.some((s: any) => s.width === 728 && s.height === 90);

    // Check category compatibility: publisher must support "matur"
    // Note: If publisher.categories includes "matur" OR is empty/allows anything, it's a match.
    // Also check contentPolicy block list.
    const hasCategory = pub.categories?.includes('matur');
    const isCategoryBlocked = pub.contentPolicy?.blockedCategories?.includes('matur');

    const isMatch = hasCorrectSize && hasCategory && !isCategoryBlocked;

    console.log(`- Slot: "${slot.name}" (ID: ${slot.id})`);
    console.log(`  Publisher: "${pub.displayName}" (Domain: ${pub.domain})`);
    console.log(
      `  Sizes: ${JSON.stringify(slot.sizes)} (Size match: ${hasCorrectSize ? 'YES' : 'NO'})`,
    );
    console.log(
      `  Publisher Categories: ${JSON.stringify(pub.categories)} (Matur category match: ${hasCategory ? 'YES' : 'NO'})`,
    );
    console.log(
      `  Blocked Categories: ${JSON.stringify(pub.contentPolicy?.blockedCategories)} (Blocked: ${isCategoryBlocked ? 'YES' : 'NO'})`,
    );
    console.log(`  => ELIGIBLE: ${isMatch ? '★ YES ★' : '❌ NO'}\n`);

    if (isMatch) matchCount++;
  });

  console.log(`Total matching slots found: ${matchCount}`);
}

findSlots()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error finding slots:', err);
    process.exit(1);
  });
