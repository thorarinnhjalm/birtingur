import { COLLECTIONS, publisherConverter, campaignConverter } from '@ada/shared/firestore';
import { AD_CATEGORY_SLUGS, FLAT_CPM_ISK } from '@ada/shared';
import { db } from '../lib/firebase.js';

export interface CategoryInventory {
  category: string;
  avgDailyImpressions: number;
  committedDailyImpressions: number;
  availableDailyImpressions: number;
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

  // Committed: daily allowance of cpm_capped campaigns that are live or awaiting approval
  // (approval can land any moment and spend starts immediately), in impressions, per
  // category. Budget is spread over the actual flight window — a future startsAt must not
  // dilute the daily commitment with pre-flight days.
  const COMMITTED_STATUSES = ['active', 'pending_approval'] as const;
  const cmpSnap = await db
    .collection(COLLECTIONS.campaigns)
    .where('status', 'in', COMMITTED_STATUSES)
    .withConverter(campaignConverter)
    .get();
  const committedByCategory = new Map<string, number>();
  const now = Date.now();
  const perImpression = Math.round(FLAT_CPM_ISK / 1000);
  for (const doc of cmpSnap.docs) {
    const cmp = doc.data();
    // Redundant with the query filter; kept so the logic is self-contained for
    // unit-test mocks that ignore .where().
    if (!(COMMITTED_STATUSES as readonly string[]).includes(cmp.status)) continue;
    if (cmp.budget.mode !== 'cpm_capped') continue;
    if (cmp.schedule.endsAt.getTime() <= now) continue;
    const flightStartMs = Math.max(now, cmp.schedule.startsAt.getTime());
    const daysLeft = Math.max(
      1,
      Math.ceil((cmp.schedule.endsAt.getTime() - flightStartMs) / 86_400_000),
    );
    const dailyBudgetIsk = Math.max(perImpression, Math.round(cmp.budget.remainingIsk / daysLeft));
    const dailyImpressions = Math.round((dailyBudgetIsk / FLAT_CPM_ISK) * 1000);
    for (const cat of cmp.targeting.categories) {
      committedByCategory.set(cat, (committedByCategory.get(cat) ?? 0) + dailyImpressions);
    }
  }

  return AD_CATEGORY_SLUGS.map((category) => {
    const gross = totalByCategory.get(category) ?? 0;
    const committed = committedByCategory.get(category) ?? 0;
    return {
      category,
      avgDailyImpressions: gross,
      committedDailyImpressions: committed,
      availableDailyImpressions: Math.max(0, gross - committed),
    };
  });
}
