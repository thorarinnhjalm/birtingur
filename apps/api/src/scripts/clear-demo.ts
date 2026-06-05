import { COLLECTIONS } from '@ada/shared/firestore';
import { db } from '../lib/firebase.js';

/**
 * Wipes demo data: all publishers (the "companies"), advertisers, and everything
 * tied to them (campaigns, slots, creatives) plus the derived ledger/payouts/stats,
 * leaving a clean slate.
 *
 * SAFETY: refuses to run unless CONFIRM_CLEAR=yes is set, so it can't wipe a database
 * by accident. This deletes ALL documents in these collections — only run it against a
 * demo/emulator environment you intend to reset.
 *
 *   Emulator:  FIRESTORE_EMULATOR_HOST=localhost:8080 CONFIRM_CLEAR=yes \
 *                pnpm --filter @ada/api exec tsx src/scripts/clear-demo.ts
 *   Live demo: GOOGLE_APPLICATION_CREDENTIALS=<svc-account.json> CONFIRM_CLEAR=yes \
 *                pnpm --filter @ada/api exec tsx src/scripts/clear-demo.ts
 */

const TOP_LEVEL = [
  COLLECTIONS.publishers,
  COLLECTIONS.advertisers,
  COLLECTIONS.campaigns,
  COLLECTIONS.slots,
  COLLECTIONS.creatives,
  COLLECTIONS.ledger,
  COLLECTIONS.payouts,
];

async function deleteCollection(name: string): Promise<number> {
  const snap = await db.collection(name).get();
  let n = 0;
  // Batch in chunks of 400 (Firestore batch limit is 500).
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = db.batch();
    for (const doc of snap.docs.slice(i, i + 400)) batch.delete(doc.ref);
    await batch.commit();
    n += Math.min(400, snap.docs.length - i);
  }
  return n;
}

async function clear() {
  if (process.env.CONFIRM_CLEAR !== 'yes') {
    console.error(
      'Refusing to run without CONFIRM_CLEAR=yes. This permanently deletes all demo data.',
    );
    process.exit(1);
  }

  for (const name of TOP_LEVEL) {
    const n = await deleteCollection(name);
    console.log(`Cleared ${name}: ${n} docs`);
  }

  // stats is nested (stats/publishers/{id}/{date}, stats/{campaignId}/hourly/{...}) —
  // recursiveDelete handles the whole subtree.
  await db.recursiveDelete(db.collection(COLLECTIONS.stats));
  console.log(`Cleared ${COLLECTIONS.stats} (recursive)`);

  console.log('Demo data cleared. Note: Firebase Auth users are not touched by this script.');
}

clear().catch((err) => {
  console.error('Clear failed:', err);
  process.exit(1);
});
