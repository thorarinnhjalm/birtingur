import { COLLECTIONS, slotConverter } from '@ada/shared/firestore';
import { db } from '../lib/firebase.js';
import { pushSlotCache } from '../lib/push-cache.js';

export async function refreshAllActiveSlotCaches(): Promise<number> {
  const snap = await db
    .collection(COLLECTIONS.slots)
    .where('status', '==', 'active')
    .withConverter(slotConverter)
    .get();
  let n = 0;
  for (const doc of snap.docs) {
    // Isolate failures: one bad slot/publisher/campaign doc (e.g. a record that fails
    // strict schema parsing) must not abort the whole refresh and let every cache expire.
    try {
      await pushSlotCache(doc.id);
      n++;
    } catch (err) {
      console.error(`refreshAllActiveSlotCaches: skipping slot ${doc.id} after error:`, err);
    }
  }
  return n;
}
