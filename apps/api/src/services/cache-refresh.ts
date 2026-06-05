import { COLLECTIONS, slotConverter } from '@ada/shared/firestore';
import { db } from '../lib/firebase.js';
import { pushSlotCache } from '../lib/push-cache.js';

export async function refreshAllActiveSlotCaches(): Promise<number> {
  const snap = await db.collection(COLLECTIONS.slots)
    .where('status', '==', 'active')
    .withConverter(slotConverter)
    .get();
  let n = 0;
  for (const doc of snap.docs) {
    await pushSlotCache(doc.id);
    n++;
  }
  return n;
}
