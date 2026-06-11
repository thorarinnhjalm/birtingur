import { db } from '../lib/firebase.js';
import { COLLECTIONS, creativeConverter } from '@ada/shared/firestore';
import { GeminiAutoScanner } from '../services/auto-scan/gemini.js';

/**
 * Backfill: re-scan creatives that lack autoScanResult.sensitiveCategories.
 * Required before fail-closed blocking goes live — a blocking publisher shows no
 * unscanned creatives at all. Deliberately does NOT touch reviewStatus: this run
 * only adds sensitive flags, it must not retroactively reject live creatives.
 * Uses the stub scanner automatically when GEMINI_API_KEY is unset (local/emulator).
 */
async function rescanCreatives() {
  const scanner = new GeminiAutoScanner();
  const snap = await db.collection(COLLECTIONS.creatives).withConverter(creativeConverter).get();

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const doc of snap.docs) {
    const creative = doc.data();
    if (creative.autoScanResult?.sensitiveCategories) {
      skipped++;
      continue;
    }
    try {
      const scan = await scanner.scan({
        imageUrl: creative.imageUrl,
        clickUrl: creative.clickUrl,
        ocrTextHint: creative.ocrTextHint,
      });
      await doc.ref.update({ autoScanResult: scan.scanResult });
      updated++;
      console.log(`rescanned ${creative.id}: [${scan.scanResult.sensitiveCategories?.join(', ')}]`);
    } catch (err) {
      failed++;
      console.warn(`rescan failed for ${creative.id}:`, err);
    }
  }

  console.log(`Rescan complete: ${updated} updated, ${skipped} skipped, ${failed} failed.`);
  if (failed > 0) process.exitCode = 1;
}

rescanCreatives()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
