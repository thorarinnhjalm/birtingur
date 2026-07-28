import { COLLECTIONS, generatedPreviewManifestConverter } from '@ada/shared/firestore';
import type { GeneratedPreviewManifest } from '@ada/shared';
import { db } from '../../lib/firebase.js';

/** One manifest doc per advertiser (doc id == advertiserId) — see the schema
 * doc comment in packages/shared/src/schemas/generated-preview.ts for why a
 * later /generate call overwriting an earlier, unconfirmed one is acceptable. */
export async function savePreviewManifest(manifest: GeneratedPreviewManifest): Promise<void> {
  await db
    .collection(COLLECTIONS.generatedPreviews)
    .doc(manifest.advertiserId)
    .withConverter(generatedPreviewManifestConverter)
    .set(manifest);
}

export async function getPreviewManifest(
  advertiserId: string,
): Promise<GeneratedPreviewManifest | null> {
  const snap = await db
    .collection(COLLECTIONS.generatedPreviews)
    .doc(advertiserId)
    .withConverter(generatedPreviewManifestConverter)
    .get();
  return snap.exists ? snap.data() || null : null;
}
