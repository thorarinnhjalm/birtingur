import { z } from 'zod';

const KennitalaSchema = z.string().regex(/^\d{10}$/);

export const AdvertiserStatusSchema = z.enum(['active', 'suspended']);
export type AdvertiserStatus = z.infer<typeof AdvertiserStatusSchema>;

export const AdvertiserSchema = z.object({
  id: z.string().min(1),
  ownerEmail: z.string().email(),
  companyName: z.string().min(1).max(200),
  kennitala: KennitalaSchema,
  vatNumber: z.string().min(1).max(20),
  walletBalanceIsk: z.number().int().min(0),
  status: AdvertiserStatusSchema,
  createdAt: z.date(),
});
export type Advertiser = z.infer<typeof AdvertiserSchema>;

export const AutoScanResultSchema = z.object({
  nsfwScore: z.number().min(0).max(1),
  blockedTerms: z.array(z.string()),
  category: z.string().min(1),
  confidence: z.number().min(0).max(1),
});
export type AutoScanResult = z.infer<typeof AutoScanResultSchema>;

export const ReviewStatusSchema = z.enum([
  'pending',
  'auto_approved',
  'manual_approved',
  'rejected',
]);
export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;

export const ReviewLogEntrySchema = z.object({
  at: z.date(),
  by: z.string().min(1), // "auto" | userId | "admin:<email>"
  action: z.enum(['approved', 'rejected', 'flagged', 'appealed']),
  reason: z.string().optional(),
});
export type ReviewLogEntry = z.infer<typeof ReviewLogEntrySchema>;

export const CreativeSchema = z
  .object({
    id: z.string().min(1),
    advertiserId: z.string().min(1),
    imageUrl: z.string().url(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    clickUrl: z
      .string()
      .url()
      .refine((u) => u.startsWith('https://'), {
        message: 'Click URL must use https://',
      }),
    reviewStatus: ReviewStatusSchema,
    reviewLog: z.array(ReviewLogEntrySchema),
    autoScanResult: AutoScanResultSchema.optional(),
  })
  .refine((c) => c.reviewStatus !== 'rejected' || c.reviewLog.length > 0, {
    message: 'Rejected creative must have at least one review log entry',
  });
export type Creative = z.infer<typeof CreativeSchema>;
