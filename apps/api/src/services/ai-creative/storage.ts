import { randomUUID } from 'node:crypto';
import { storage } from '../../lib/firebase.js';

export interface CreativeUploader {
  upload(params: { advertiserId: string; filename: string; pngBuffer: Buffer }): Promise<string>;
}

/**
 * Uploads generated PNGs via the (previously unused) firebase-admin `storage`
 * handle to the FLAT path `creatives/{advertiserId}/{filename}` — flat
 * because `firebase/storage.rules`' public-read rule
 * (`match /creatives/{advertiserId}/{filename}`) matches exactly one path
 * segment after advertiserId; a `generated/` subfolder would add a second
 * segment and silently fall through to the deny-all rule, making the image
 * unreadable by publisher pages. Admin SDK writes bypass the rules'
 * `allow write` clause entirely (rules only gate client SDK access), so the
 * 2 MB/content-type constraints in storage.rules are enforced here in code
 * instead (implicitly: renderSvgToPng only ever produces PNGs at IAB sizes,
 * which are well under 2 MB).
 *
 * URL shape matches what the dashboard's client-side `getDownloadURL()`
 * produces (`https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{path}
 * ?alt=media&token={uuid}`) by setting the same `firebaseStorageDownloadTokens`
 * metadata field the client SDK relies on, rather than `file.publicUrl()`
 * (`storage.googleapis.com/...`, a different host) or a signed URL (expires).
 * Serving/rendering code treats both creative sources identically since
 * they're both just `imageUrl` strings pointing at a public, non-expiring URL.
 */
export class FirebaseCreativeUploader implements CreativeUploader {
  async upload({
    advertiserId,
    filename,
    pngBuffer,
  }: {
    advertiserId: string;
    filename: string;
    pngBuffer: Buffer;
  }): Promise<string> {
    const bucket = storage.bucket();
    const path = `creatives/${advertiserId}/${filename}`;
    const file = bucket.file(path);
    const token = randomUUID();
    await file.save(pngBuffer, {
      contentType: 'image/png',
      metadata: {
        contentType: 'image/png',
        metadata: { firebaseStorageDownloadTokens: token },
      },
    });
    const encodedPath = encodeURIComponent(path);
    return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${token}`;
  }
}

/**
 * In-memory stub — never touches Firebase Storage at all. Used whenever we
 * detect we're in emulator/test mode without a storage emulator explicitly
 * configured (see chooseCreativeUploader below), since `pnpm test:api` only
 * starts the Firestore emulator (CLAUDE.md) — a real `FirebaseCreativeUploader`
 * call there would try to hit production GCS with fake test credentials and
 * fail. Returns a syntactically valid, deterministic https URL so downstream
 * Zod URL validation and the generated_previews manifest still round-trip
 * correctly in tests.
 */
export class StubCreativeUploader implements CreativeUploader {
  async upload({
    advertiserId,
    filename,
  }: {
    advertiserId: string;
    filename: string;
  }): Promise<string> {
    return `https://storage.example.test/creatives/${advertiserId}/${filename}`;
  }
}

/**
 * Picks the real uploader unless we're clearly in a Firestore-emulator-only
 * environment (local emulator suite / `pnpm test:api`) with no storage
 * emulator configured. To exercise real Storage-emulator uploads locally,
 * run the full `pnpm emulator` (which starts storage on 9199 per its
 * firebase.json config) and set FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199
 * — firebase-admin's Storage client honors that env var natively.
 */
export function chooseCreativeUploader(): CreativeUploader {
  if (process.env.FIRESTORE_EMULATOR_HOST && !process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
    return new StubCreativeUploader();
  }
  return new FirebaseCreativeUploader();
}
