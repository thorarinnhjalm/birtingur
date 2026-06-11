import { z } from 'zod';

export const NotificationTypeSchema = z.enum(['info', 'warning', 'success', 'error']);
export type NotificationType = z.infer<typeof NotificationTypeSchema>;

export const NotificationRoleSchema = z.enum(['advertiser', 'publisher', 'admin']);
export type NotificationRole = z.infer<typeof NotificationRoleSchema>;

export const NotificationSchema = z.object({
  id: z.string().min(1),
  userEmail: z.string().min(1), // Targeted owner's email, or 'admin' for system admins
  role: NotificationRoleSchema,
  type: NotificationTypeSchema,
  title: z.string().min(1),
  message: z.string().min(1),
  read: z.boolean().default(false),
  createdAt: z.date(),
  link: z.string().optional(),
});

export type Notification = z.infer<typeof NotificationSchema>;
