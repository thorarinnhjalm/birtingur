import { z } from 'zod';
import { GEO_REGIONS } from '../constants';

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
  slotIds: z.array(z.string().min(1)).min(1),
  geoCountries: z.array(z.string().length(2)).optional(),
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

export const PerPublisherApprovalSchema = z.enum([
  'pending',
  'approved',
  'rejected',
]);

export const CampaignSchema = z.object({
  id: z.string().min(1),
  advertiserId: z.string().min(1),
  creativeIds: z.array(z.string().min(1)).min(1),
  targeting: TargetingSchema,
  schedule: ScheduleSchema,
  budget: BudgetSchema,
  status: CampaignStatusSchema,
  perPublisherApproval: z.record(z.string(), PerPublisherApprovalSchema),
});
export type Campaign = z.infer<typeof CampaignSchema>;
