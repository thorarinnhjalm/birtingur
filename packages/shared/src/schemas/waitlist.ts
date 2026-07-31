import { z } from 'zod';

export const WaitlistRoleSchema = z.enum(['advertiser', 'publisher', 'both']);
export type WaitlistRole = z.infer<typeof WaitlistRoleSchema>;

export const CreateWaitlistInputSchema = z.object({
  email: z.string().trim().email('Invalid email address').toLowerCase(),
  role: WaitlistRoleSchema,
  websiteUrl: z.string().trim().url('Invalid website URL').optional().or(z.literal('')),
  category: z.string().trim().optional(),
  country: z.string().trim().max(10).optional(),
});

export type CreateWaitlistInput = z.infer<typeof CreateWaitlistInputSchema>;

export const WaitlistEntrySchema = CreateWaitlistInputSchema.extend({
  id: z.string(),
  createdAt: z.date(),
  ipHash: z.string().optional(),
});

export type WaitlistEntry = z.infer<typeof WaitlistEntrySchema>;
