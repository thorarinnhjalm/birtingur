import { COLLECTIONS } from '@ada/shared/firestore';
import { db } from '../lib/firebase.js';

// Backfills a default category for any publisher/campaign doc missing `categories`.
// Publishers: best-effort 'taekni' placeholder (operator should review in dashboard).
// Campaigns: skip + log (a campaign with no category is invalid and must be fixed by hand).
async function migrate() {
  const pubSnap = await db.collection(COLLECTIONS.publishers).get();
  let pubFixed = 0;
  for (const doc of pubSnap.docs) {
    const data = doc.data();
    if (!Array.isArray(data.categories) || data.categories.length === 0) {
      await doc.ref.update({ categories: ['taekni'] });
      console.warn(`Publisher ${doc.id}: backfilled categories=['taekni'] — REVIEW in dashboard`);
      pubFixed++;
    }
  }
  const cmpSnap = await db.collection(COLLECTIONS.campaigns).get();
  let cmpBad = 0;
  for (const doc of cmpSnap.docs) {
    const data = doc.data();
    const t = data.targeting;
    if (!t || !Array.isArray(t.categories) || t.categories.length === 0) {
      console.error(`Campaign ${doc.id}: INVALID — no targeting.categories, needs manual fix`);
      cmpBad++;
    }
  }
  console.log(`Done. Publishers backfilled: ${pubFixed}. Invalid campaigns: ${cmpBad}.`);
}

migrate().catch((e) => {
  console.error(e);
  process.exit(1);
});
