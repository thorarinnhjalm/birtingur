import { z } from 'zod';
import { COLLECTIONS, creativeConverter } from '@ada/shared/firestore';
import { CreativeSchema } from '@ada/shared';
import type { Creative, ReviewStatus } from '@ada/shared';
import { db } from '../lib/firebase';
import { generateId } from '../lib/id';
import { AppError } from '../lib/errors';
import type { AutoScanner } from './auto-scan';

const CreateCreativeInputSchema = z.object({
  imageUrl: z.string().url(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  clickUrl: z
    .string()
    .url()
    .refine((u) => u.startsWith('https://')),
  ocrTextHint: z.string().optional(),
});
export type CreateCreativeInput = z.infer<typeof CreateCreativeInputSchema>;

export async function createCreative(
  advertiserId: string,
  input: CreateCreativeInput,
  scanner: AutoScanner
): Promise<Creative> {
  const parsed = CreateCreativeInputSchema.parse(input);
  const scan = await scanner.scan({
    imageUrl: parsed.imageUrl,
    clickUrl: parsed.clickUrl,
    ocrTextHint: parsed.ocrTextHint,
  });

  let reviewStatus: ReviewStatus;
  if (scan.outcome === 'auto_approved') {
    reviewStatus = 'auto_approved';
  } else if (scan.outcome === 'auto_rejected') {
    reviewStatus = 'rejected';
  } else {
    reviewStatus = 'pending';
  }

  const now = new Date();
  const action =
    reviewStatus === 'auto_approved'
      ? ('approved' as const)
      : reviewStatus === 'rejected'
        ? ('rejected' as const)
        : ('flagged' as const);

  const creative: Creative = CreativeSchema.parse({
    id: generateId('crt'),
    advertiserId,
    imageUrl: parsed.imageUrl,
    width: parsed.width,
    height: parsed.height,
    clickUrl: parsed.clickUrl,
    reviewStatus,
    reviewLog: [
      {
        at: now,
        by: 'auto',
        action,
        reason:
          scan.scanResult.blockedTerms.length > 0
            ? `Blocked terms: ${scan.scanResult.blockedTerms.join(', ')}`
            : undefined,
      },
    ],
    autoScanResult: scan.scanResult,
  });

  await db
    .collection(COLLECTIONS.creatives)
    .doc(creative.id)
    .withConverter(creativeConverter)
    .set(creative);

  return creative;
}

export async function getCreative(id: string): Promise<Creative | null> {
  const snap = await db
    .collection(COLLECTIONS.creatives)
    .doc(id)
    .withConverter(creativeConverter)
    .get();
  return snap.exists ? (snap.data() || null) : null;
}

export async function requireCreative(id: string): Promise<Creative> {
  const c = await getCreative(id);
  if (!c) {
    throw new AppError(404, `Creative ${id} not found`, 'NOT_FOUND');
  }
  return c;
}

export async function listCreativesForAdvertiser(advertiserId: string): Promise<Creative[]> {
  const snap = await db
    .collection(COLLECTIONS.creatives)
    .where('advertiserId', '==', advertiserId)
    .withConverter(creativeConverter)
    .get();
  return snap.docs.map((d) => d.data());
}

export async function updateCreativeReview(
  id: string,
  patch: { reviewStatus: ReviewStatus; logEntry: Creative['reviewLog'][number] }
): Promise<Creative> {
  const existing = await requireCreative(id);
  const next: Creative = CreativeSchema.parse({
    ...existing,
    reviewStatus: patch.reviewStatus,
    reviewLog: [...existing.reviewLog, patch.logEntry],
  });
  await db
    .collection(COLLECTIONS.creatives)
    .doc(id)
    .withConverter(creativeConverter)
    .set(next);
  return next;
}
