import { z } from 'zod';

export const WidgetKeyTypeSchema = z.enum(['publisher', 'campaign']);
export type WidgetKeyType = z.infer<typeof WidgetKeyTypeSchema>;

export const WidgetKeySchema = z.object({
  id: z.string().min(1),
  ownerEmail: z.string().email(),
  hash: z.string().min(1),
  type: WidgetKeyTypeSchema,
  targetId: z.string().min(1),
  createdAt: z.date(),
  lastUsedAt: z.date().optional(),
  revoked: z.boolean(),
});
export type WidgetKey = z.infer<typeof WidgetKeySchema>;
