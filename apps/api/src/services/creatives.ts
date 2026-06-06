import { z } from 'zod';
import { COLLECTIONS, creativeConverter } from '@ada/shared/firestore';
import { CreativeSchema } from '@ada/shared';
import type { Creative, ReviewStatus } from '@ada/shared';
import { db } from '../lib/firebase.js';
import { generateId } from '../lib/id.js';
import { AppError } from '../lib/errors.js';
import type { AutoScanner } from './auto-scan/index.js';

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
  scanner: AutoScanner,
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
    ocrTextHint: parsed.ocrTextHint,
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
  return snap.exists ? snap.data() || null : null;
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
  patch: { reviewStatus: ReviewStatus; logEntry: Creative['reviewLog'][number] },
): Promise<Creative> {
  const existing = await requireCreative(id);
  const next: Creative = CreativeSchema.parse({
    ...existing,
    reviewStatus: patch.reviewStatus,
    reviewLog: [...existing.reviewLog, patch.logEntry],
  });
  await db.collection(COLLECTIONS.creatives).doc(id).withConverter(creativeConverter).set(next);
  return next;
}

const UpdateCreativeInputSchema = z.object({
  clickUrl: z
    .string()
    .url()
    .refine((u) => u.startsWith('https://')),
  ocrTextHint: z.string().optional(),
});
export type UpdateCreativeInput = z.infer<typeof UpdateCreativeInputSchema>;

export async function updateCreative(
  id: string,
  advertiserId: string,
  input: UpdateCreativeInput,
  scanner: AutoScanner,
): Promise<Creative> {
  const parsed = UpdateCreativeInputSchema.parse(input);
  const existing = await requireCreative(id);

  if (existing.advertiserId !== advertiserId) {
    throw new AppError(403, 'Forbidden', 'FORBIDDEN');
  }

  const scan = await scanner.scan({
    imageUrl: existing.imageUrl,
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

  const updated: Creative = CreativeSchema.parse({
    ...existing,
    clickUrl: parsed.clickUrl,
    ocrTextHint: parsed.ocrTextHint,
    reviewStatus,
    reviewLog: [
      ...existing.reviewLog,
      {
        at: now,
        by: 'auto',
        action,
        reason:
          scan.scanResult.blockedTerms.length > 0
            ? `Edit auto-scan: Blocked terms: ${scan.scanResult.blockedTerms.join(', ')}`
            : 'Edit auto-scan re-run',
      },
    ],
    autoScanResult: scan.scanResult,
  });

  await db.collection(COLLECTIONS.creatives).doc(id).withConverter(creativeConverter).set(updated);

  // Propagate to active campaigns
  const { propagateCreativeChange } = await import('./approvals.js');
  await propagateCreativeChange(id, reviewStatus === 'auto_approved');

  return updated;
}

export async function deleteCreative(id: string, advertiserId: string): Promise<void> {
  const existing = await requireCreative(id);

  if (existing.advertiserId !== advertiserId) {
    throw new AppError(403, 'Forbidden', 'FORBIDDEN');
  }

  // Check if used by campaigns that are active, paused, or pending_approval
  const campaignsSnap = await db
    .collection(COLLECTIONS.campaigns)
    .where('creativeIds', 'array-contains', id)
    .get();

  const inUse = campaignsSnap.docs.some((doc) => {
    const status = doc.data().status;
    return ['active', 'pending_approval', 'paused'].includes(status);
  });

  if (inUse) {
    throw new AppError(
      400,
      'Ekki er hægt að eyða auglýsingu sem er í notkun í virkri herferð, herferð í yfirferð eða í pásu.',
      'BAD_REQUEST',
    );
  }

  // Delete from Firestore
  await db.collection(COLLECTIONS.creatives).doc(id).delete();
}
