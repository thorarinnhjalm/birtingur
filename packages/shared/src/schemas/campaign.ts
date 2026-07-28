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
    // Nonnegative, not strictly positive: a fresh campaign always creates
    // with totalIsk > 0 (enforced separately by the create-input schema in
    // services/campaigns.ts), but a rejected agent-purchase campaign is
    // explicitly zeroed on both totalIsk and remainingIsk — it never served,
    // so 0 is the provably-correct "spent" state (see
    // rejectAgentPurchaseCampaign) and removes it from monthly-cap sums that
    // read budget.totalIsk.
    totalIsk: z.number().int().min(0),
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

// Origin of a campaign create call. `apiKeyId` is only present for the
// `mcp`/`api` channels (an `ak_` key was used); `idempotencyKey` lets an
// agent retry a create safely (see services/campaigns.ts createCampaign) —
// a replay with the same key returns the original campaign instead of
// buying twice.
export const CreatedViaSchema = z.object({
  channel: z.enum(['dashboard', 'api', 'mcp']),
  apiKeyId: z.string().optional(),
  idempotencyKey: z.string().optional(),
});
export type CreatedVia = z.infer<typeof CreatedViaSchema>;

// Distinguishes WHY a campaign is pending_approval: the normal reason is
// unapproved creatives (no tag needed — see allCreativesAutoApproved), the
// agent-purchase reason is an autoApproveLimitIsk threshold on an API key
// with purchase.enabled (see services/campaigns.ts). Only the owner
// approve/reject endpoints act on 'agent_purchase'.
export const PendingReasonSchema = z.enum(['agent_purchase']);
export type PendingReason = z.infer<typeof PendingReasonSchema>;

export const CampaignSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120).optional(),
  advertiserId: z.string().min(1),
  creativeIds: z.array(z.string().min(1)).min(1),
  targeting: TargetingSchema,
  schedule: ScheduleSchema,
  budget: BudgetSchema,
  status: CampaignStatusSchema,
  // Optional for backward compat with campaigns written before this field
  // existed. Used to derive month-to-date agent spend (see
  // sumMonthToDateAgentSpend in services/campaigns.ts) — campaigns without it
  // simply don't count toward any key's monthly cap.
  createdAt: z.date().optional(),
  createdVia: CreatedViaSchema.optional(),
  pendingReason: PendingReasonSchema.optional(),
});
export type Campaign = z.infer<typeof CampaignSchema>;
