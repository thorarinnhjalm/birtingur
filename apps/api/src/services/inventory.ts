import { COLLECTIONS, publisherConverter } from '@ada/shared/firestore';
import { AD_CATEGORY_SLUGS } from '@ada/shared';
import { db } from '../lib/firebase.js';

export interface CategoryInventory {
  category: string;
  avgDailyImpressions: number;
}

function lastNDateKeys(n: number): string[] {
  const keys: string[] = [];
  const now = new Date();
  for (let i = 1; i <= n; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    keys.push(d.toISOString().split('T')[0]!.replace(/-/g, ''));
  }
  return keys;
}

export async function getCategoryInventory(): Promise<CategoryInventory[]> {
  const pubSnap = await db
    .collection(COLLECTIONS.publishers)
    .where('status', '==', 'active')
    .withConverter(publisherConverter)
    .get();

  const dateKeys = lastNDateKeys(7);
  const totalByCategory = new Map<string, number>();

  for (const pubDoc of pubSnap.docs) {
    const pub = pubDoc.data();
    let pubTotal = 0;
    for (const dk of dateKeys) {
      const statDoc = await db.doc(`${COLLECTIONS.stats}/publishers/${pub.id}/${dk}`).get();
      pubTotal += (statDoc.data()?.impressions ?? 0) as number;
    }
    const pubAvg = Math.round(pubTotal / dateKeys.length);
    for (const cat of pub.categories) {
      totalByCategory.set(cat, (totalByCategory.get(cat) ?? 0) + pubAvg);
    }
  }

  return AD_CATEGORY_SLUGS.map((category) => ({
    category,
    avgDailyImpressions: totalByCategory.get(category) ?? 0,
  }));
}
