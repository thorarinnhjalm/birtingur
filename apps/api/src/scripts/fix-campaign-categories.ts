import { COLLECTIONS } from '@ada/shared/firestore';
import { AD_CATEGORY_SLUGS } from '@ada/shared';
import { db } from '../lib/firebase.js';

/**
 * Repairs campaign docs that are missing `targeting.categories` (left over from before
 * categories were required). With the strict schema they throw on read, so this uses the
 * RAW collection (no converter) to read + patch them.
 *
 * The category to assign defaults to `matur` (what the demo seed used); override with
 * FIX_CATEGORY=<slug>. Only campaigns ALREADY missing/empty categories are touched.
 *
 * SAFETY: requires CONFIRM_FIX=yes.
 *
 *   Emulator:  FIRESTORE_EMULATOR_HOST=localhost:8080 CONFIRM_FIX=yes \
 *                pnpm --filter @ada/api exec tsx src/scripts/fix-campaign-categories.ts
 *   Live demo: GOOGLE_APPLICATION_CREDENTIALS=<svc-account.json> CONFIRM_FIX=yes \
 *                pnpm --filter @ada/api exec tsx src/scripts/fix-campaign-categories.ts
 */

async function fix() {
  if (process.env.CONFIRM_FIX !== 'yes') {
    console.error('Refusing to run without CONFIRM_FIX=yes.');
    process.exit(1);
  }

  const category = process.env.FIX_CATEGORY ?? 'matur';
  if (!AD_CATEGORY_SLUGS.includes(category)) {
    console.error(`FIX_CATEGORY="${category}" is not a valid AD_CATEGORY slug.`);
    process.exit(1);
  }

  // Raw read (no converter) — the strict converter would throw on the broken docs.
  const snap = await db.collection(COLLECTIONS.campaigns).get();
  let fixed = 0;
  for (const doc of snap.docs) {
    const t = doc.data().targeting as { categories?: unknown } | undefined;
    const cats = t?.categories;
    if (!Array.isArray(cats) || cats.length === 0) {
      await doc.ref.set({ targeting: { categories: [category] } }, { merge: true });
      console.log(`Campaign ${doc.id}: set targeting.categories=['${category}']`);
      fixed++;
    }
  }
  console.log(`Done. Campaigns fixed: ${fixed}.`);
}

fix().catch((err) => {
  console.error('Fix failed:', err);
  process.exit(1);
});
