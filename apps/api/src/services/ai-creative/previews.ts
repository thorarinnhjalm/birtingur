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

/**
 * MINOR-6 (adversarial review): field-level update of ONLY `logo`, used by
 * the `/generate/logo` POST/DELETE routes instead of their previous
 * read-spread-write of the whole manifest. That read-modify-write pattern
 * had a race: if a render (`renderCreativeVariant` -> `savePreviewManifest`,
 * a full-document `.set()`) landed between this route's read and its write,
 * the render's later save would silently resurrect the manifest state from
 * BEFORE the logo change — the logo edit is lost with no error to anyone.
 * `.update({ logo })` only touches that one field, so this write can no
 * longer clobber a concurrent render's OTHER fields (images, status, etc.) —
 * the direction that mattered for the original bug report. This does NOT
 * close the reverse direction: `savePreviewManifest` still does a
 * whole-document `.set()`, so a render that started before this logo update
 * and finishes after it will still overwrite `logo` back to whatever it read
 * at render-start, silently discarding a mid-render logo change. Closing
 * that fully would need render's own save to also become field-scoped (or
 * the two paths to share a transaction) — out of scope here; the dashboard's
 * `logoBusy` guard (CreativeGenerator.tsx) is the current mitigation, by
 * disabling the logo controls while a render is in flight.
 *
 * Existence is checked explicitly first (rather than relying on `.update()`
 * throwing on a missing doc) so the 404-when-no-manifest contract the two
 * routes already have stays a plain, catchable "return null" — no need for
 * callers to inspect Firestore error codes. Returns the freshly-read
 * manifest (typed via the converter) so callers can return it directly, or
 * null if no manifest exists for this advertiser.
 */
export async function updatePreviewManifestLogo(
  advertiserId: string,
  logo: GeneratedPreviewManifest['logo'],
): Promise<GeneratedPreviewManifest | null> {
  // Untyped ref for the update — `withConverter`'s UpdateData typing expects
  // the ON-THE-WIRE document shape for partial updates, not the domain type,
  // so a raw path ref (per the fix note: `db.doc(...)`) keeps this simple.
  const rawRef = db.doc(`${COLLECTIONS.generatedPreviews}/${advertiserId}`);
  const typedRef = db
    .collection(COLLECTIONS.generatedPreviews)
    .doc(advertiserId)
    .withConverter(generatedPreviewManifestConverter);

  const existing = await typedRef.get();
  if (!existing.exists) return null;

  await rawRef.update({ logo });

  const updated = await typedRef.get();
  return updated.exists ? updated.data() || null : null;
}
