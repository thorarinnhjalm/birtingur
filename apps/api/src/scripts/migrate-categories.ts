import { COLLECTIONS } from '@ada/shared/firestore';
import { AD_CATEGORY_SLUGS } from '@ada/shared';
import { db } from '../lib/firebase.js';
import { scrapeAndClassifyDomain } from '../services/domain-classifier.js';

// Maps a domain-classifier content category → an AD_CATEGORY slug. Mirrors mapCategory in
// apps/dashboard/src/pages/publisher/Onboarding.tsx (canonical). Unmapped/invalid → fallback.
const FALLBACK_CATEGORY = 'afthreying_menning';
const CLASSIFIER_TO_AD: Record<string, string> = {
  news: 'afthreying_menning',
  lifestyle: 'tiska_fegurd',
  tech: 'taekni',
  sports: 'ithrottir',
  finance: 'fjarmal_vidskipti',
  entertainment: 'afthreying_menning',
  gambling: FALLBACK_CATEGORY, // no ad-category for gambling; operator should review
  other: FALLBACK_CATEGORY,
};

function toAdCategory(classifierCategory: string): string {
  const mapped = CLASSIFIER_TO_AD[classifierCategory] ?? classifierCategory;
  return AD_CATEGORY_SLUGS.includes(mapped) ? mapped : FALLBACK_CATEGORY;
}

// Backfills `categories` for any publisher/campaign doc missing it.
// Publishers: classify the domain (best-effort) and map to an AD category; fall back on failure.
// Campaigns: skip + log (a campaign with no category is invalid and must be fixed by hand).
async function migrate() {
  const pubSnap = await db.collection(COLLECTIONS.publishers).get();
  let pubFixed = 0;
  for (const doc of pubSnap.docs) {
    const data = doc.data();
    if (!Array.isArray(data.categories) || data.categories.length === 0) {
      let adCategory = FALLBACK_CATEGORY;
      const domain = typeof data.domain === 'string' ? data.domain : '';
      if (domain) {
        try {
          const { category } = await scrapeAndClassifyDomain(domain);
          adCategory = toAdCategory(category);
        } catch (err) {
          console.warn(`Publisher ${doc.id} (${domain}): classify failed, using fallback:`, err);
        }
      }
      await doc.ref.update({ categories: [adCategory] });
      console.warn(
        `Publisher ${doc.id} (${domain}): backfilled categories=['${adCategory}'] — REVIEW in dashboard`,
      );
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
