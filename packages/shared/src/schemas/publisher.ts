import { z } from 'zod';
import { AD_CATEGORY_SLUGS } from '../constants.js';

/**
 * Icelandic kennitala: 10 digits.
 * (We accept the canonical form without dash; UI may format with dash.)
 */
const KennitalaSchema = z
  .string()
  .transform((val) => val.replace(/[-\s]/g, ''))
  .pipe(z.string().regex(/^\d{10}$/, 'Kennitala must be exactly 10 digits'));

/**
 * IBAN or 12-digit Icelandic bank account number.
 * We strip spaces and hyphens before validating.
 */
const IbanSchema = z
  .string()
  .transform((val) => val.replace(/[-\s]/g, '').toUpperCase())
  .pipe(
    z
      .string()
      .refine(
        (val) => /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(val) || /^\d{12}$/.test(val),
        'Invalid bank format. Please enter a valid 12-digit Icelandic bank account or an IBAN.',
      ),
  );

const DomainSchema = z.string().regex(/^([a-z0-9](-?[a-z0-9])*\.)+[a-z]{2,}$/i, 'Invalid domain');

export const PayoutMethodSchema = z.object({
  type: z.literal('bank'),
  iban: IbanSchema,
  kennitala: KennitalaSchema,
  accountName: z.string().min(1).max(100),
});
export type PayoutMethod = z.infer<typeof PayoutMethodSchema>;

export const ContentPolicySchema = z.object({
  blockedCategories: z.array(z.string()),
  requireManualApproval: z.boolean().default(false),
});
export type ContentPolicy = z.infer<typeof ContentPolicySchema>;

export const PublisherStatusSchema = z.enum(['active', 'suspended']);
export type PublisherStatus = z.infer<typeof PublisherStatusSchema>;

export const PublisherSchema = z.object({
  id: z.string().min(1),
  ownerEmail: z.string().email(),
  domain: DomainSchema,
  displayName: z.string().min(1).max(100),
  payoutMethod: PayoutMethodSchema.optional(),
  contentPolicy: ContentPolicySchema,
  status: PublisherStatusSchema,
  createdAt: z.date(),
  integrationPreference: z.enum(['widget', 'mcp', 'both']).default('widget'),
  estimatedSlotsCount: z.number().int().nonnegative().optional(),
  vatNumber: z.string().optional(),
  categories: z.array(z.enum(AD_CATEGORY_SLUGS as [string, ...string[]])).min(1),
});
export type Publisher = z.infer<typeof PublisherSchema>;

export const SizeSchema = z.object({
  width: z.number().int().positive().max(2000),
  height: z.number().int().positive().max(2000),
});
export type Size = z.infer<typeof SizeSchema>;

export const PricingSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('cpm'),
    cpmIsk: z.number().int().positive(),
  }),
  z.object({
    mode: z.literal('slot'),
    slotPriceIsk: z.number().int().positive(),
    slotPeriodDays: z.number().int().positive(),
  }),
]);
export type Pricing = z.infer<typeof PricingSchema>;

export const PlacementPositionSchema = z.enum(['above_fold', 'in_content', 'sidebar']);

export const PlacementSchema = z.object({
  pageMatcher: z.string().min(1),
  position: PlacementPositionSchema,
});
export type Placement = z.infer<typeof PlacementSchema>;

export const SlotStatusSchema = z.enum(['active', 'paused']);

export const SlotSchema = z.object({
  id: z.string().min(1),
  publisherId: z.string().min(1),
  name: z.string().min(1).max(100),
  sizes: z.array(SizeSchema).min(1),
  pricing: PricingSchema,
  placement: PlacementSchema,
  status: SlotStatusSchema,
  fallbackType: z.enum(['house_ad', 'transparent']).default('house_ad'),
});
export type Slot = z.infer<typeof SlotSchema>;
