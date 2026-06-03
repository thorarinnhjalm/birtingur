import { COLLECTIONS, slotConverter } from '@ada/shared/firestore';
import type { Slot } from '@ada/shared/types';
import { db } from '../lib/firebase';

export interface SearchFilters {
  width?: number;
  height?: number;
  maxCpm?: number;
  publisherDomain?: string;
}

export async function searchSlots(f: SearchFilters): Promise<Slot[]> {
  const q = db.collection(COLLECTIONS.slots).where('status', '==', 'active');
  const snap = await q.withConverter(slotConverter).get();

  return snap.docs
    .map((d) => d.data())
    .filter((s) => {
      if (f.width !== undefined && !s.sizes.some((sz) => sz.width === f.width)) {
        return false;
      }
      if (f.height !== undefined && !s.sizes.some((sz) => sz.height === f.height)) {
        return false;
      }
      if (f.maxCpm !== undefined) {
        if (s.pricing.mode !== 'cpm') return false;
        if (s.pricing.cpmIsk > f.maxCpm) return false;
      }
      return true;
    });
}
