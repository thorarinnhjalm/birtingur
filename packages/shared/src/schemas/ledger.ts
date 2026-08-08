import { z } from 'zod';

export const LedgerPartyTypeSchema = z.enum(['advertiser', 'publisher', 'platform']);

export const LedgerPartySchema = z.object({
  type: LedgerPartyTypeSchema,
  id: z.string().min(1),
});
export type LedgerParty = z.infer<typeof LedgerPartySchema>;

export const LedgerTypeSchema = z.enum([
  'topup',
  'campaign_charge',
  'publisher_credit',
  'payout',
  'refund',
  'platform_fee',
]);
export type LedgerEntryType = z.infer<typeof LedgerTypeSchema>;

export const LedgerEntrySchema = z
  .object({
    id: z.string().min(1),
    party: LedgerPartySchema,
    type: LedgerTypeSchema,
    amountIsk: z
      .number()
      .int()
      .refine((n) => n !== 0, {
        message: 'amountIsk must not be zero',
      }),
    relatedId: z.string().min(1),
    createdAt: z.date(),
  })
  .refine(
    (e) => {
      // Topups, publisher credits, refunds, platform fees must be positive.
      // Campaign charges and payouts must be negative.
      const positive = ['topup', 'publisher_credit', 'refund', 'platform_fee'];
      const negative = ['campaign_charge', 'payout'];
      if (positive.includes(e.type)) return e.amountIsk > 0;
      if (negative.includes(e.type)) return e.amountIsk < 0;
      return true;
    },
    { message: 'amountIsk sign does not match entry type' },
  );
export type LedgerEntry = z.infer<typeof LedgerEntrySchema>;

export const PayoutStatusSchema = z.enum(['pending', 'processing', 'completed']);

export const PayoutSchema = z
  .object({
    id: z.string().min(1),
    publisherId: z.string().min(1),
    periodStart: z.date(),
    periodEnd: z.date(),
    grossIsk: z.number().int().nonnegative(),
    platformFeeIsk: z.number().int().nonnegative(),
    netIsk: z.number().int().nonnegative(),
    vatIsk: z.number().int().nonnegative().default(0),
    /** Review breakdown (2026-08-08 design): how much of netIsk arose in the run's own period vs was carried forward from earlier months. Optional — docs predating the carry-forward fix lack them. */
    currentPeriodIsk: z.number().int().nonnegative().optional(),
    carriedForwardIsk: z.number().int().nonnegative().optional(),
    status: PayoutStatusSchema,
    bankReference: z.string(),
  })
  .refine((p) => p.periodEnd > p.periodStart, {
    message: 'periodEnd must be after periodStart',
  })
  .refine((p) => p.grossIsk === p.platformFeeIsk + p.netIsk, {
    message: 'grossIsk must equal platformFeeIsk + netIsk',
  });
export type Payout = z.infer<typeof PayoutSchema>;
