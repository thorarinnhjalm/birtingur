import { z } from 'zod';
import { GEO_REGIONS, AD_CATEGORY_SLUGS } from '../constants.js';

export const ScheduleSchema = z
  .object({
    startsAt: z.date(),
    endsAt: z.date(),
  })
  .refine((s) => s.endsAt > s.startsAt, {
    message: 'endsAt must be after startsAt',
  });
export type Schedule = z.infer<typeof ScheduleSchema>;

export const GeoRegionSchema = z.enum(GEO_REGIONS);

export const TargetingSchema = z.object({
  categories: z.array(z.enum(AD_CATEGORY_SLUGS as [string, ...string[]])).min(1),
  geoRegions: z.array(GeoRegionSchema).optional(),
});
export type Targeting = z.infer<typeof TargetingSchema>;

export const BudgetSchema = z
  .object({
    mode: z.enum(['cpm_capped', 'slot_purchased']),
    totalIsk: z.number().int().positive(),
    remainingIsk: z.number().int().min(0),
  })
  .refine((b) => b.remainingIsk <= b.totalIsk, {
    message: 'remainingIsk cannot exceed totalIsk',
  });
export type Budget = z.infer<typeof BudgetSchema>;

export const CampaignStatusSchema = z.enum([
  'draft',
  'pending_approval',
  'active',
  'paused',
  'completed',
]);
export type CampaignStatus = z.infer<typeof CampaignStatusSchema>;

export const CampaignSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120).optional(),
  advertiserId: z.string().min(1),
  creativeIds: z.array(z.string().min(1)).min(1),
  targeting: TargetingSchema,
  schedule: ScheduleSchema,
  budget: BudgetSchema,
  status: CampaignStatusSchema,
});
export type Campaign = z.infer<typeof CampaignSchema>;
