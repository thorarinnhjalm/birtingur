import { z } from 'zod';

export const PublisherStatsBreakdownSchema = z.object({
  impressions: z.number().int().nonnegative(),
  clicks: z.number().int().nonnegative(),
  spendIsk: z.number().int().nonnegative(),
  pageviews: z.number().int().nonnegative().optional(),
});
export type PublisherStatsBreakdown = z.infer<typeof PublisherStatsBreakdownSchema>;

export const HourlyStatsSchema = z.object({
  impressions: z.number().int().nonnegative(),
  clicks: z.number().int().nonnegative(),
  spendIsk: z.number().int().nonnegative(),
  byPublisher: z.record(z.string(), PublisherStatsBreakdownSchema),
});
export type HourlyStats = z.infer<typeof HourlyStatsSchema>;
