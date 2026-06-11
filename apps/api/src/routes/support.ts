import { Hono } from 'hono';
import { requireAuth, type Env } from '../lib/auth.js';
import {
  createSupportMessage,
  listSupportMessages,
  updateMessageStatus,
} from '../services/support.js';
import { AppError } from '../lib/errors.js';
import { z } from 'zod';

export const supportRouter = new Hono<Env>();

const CreatePublicMessageSchema = z.object({
  senderEmail: z.string().email(),
  senderName: z.string().min(1).max(100).optional(),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(2000),
});

// POST /v1/support/public-messages — anyone (unauthenticated)
supportRouter.post('/public-messages', async (c) => {
  const raw = await c.req.json();
  const parsed = CreatePublicMessageSchema.parse(raw);

  const msg = await createSupportMessage({
    senderEmail: parsed.senderEmail,
    senderName: parsed.senderName || undefined,
    role: 'unknown',
    subject: parsed.subject,
    body: parsed.body,
  });

  return c.json(msg, 201);
});

supportRouter.use('*', requireAuth);

const CreateMessageSchema = z.object({
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(2000),
  role: z.enum(['advertiser', 'publisher', 'unknown']).default('unknown'),
});

// POST /v1/support/messages — any authenticated user
supportRouter.post('/messages', async (c) => {
  const user = c.get('user');
  const raw = await c.req.json();
  const parsed = CreateMessageSchema.parse(raw);

  const msg = await createSupportMessage({
    senderEmail: user.email,
    senderName: undefined,
    role: parsed.role,
    subject: parsed.subject,
    body: parsed.body,
  });

  return c.json(msg, 201);
});

// GET /v1/support/messages — admin only
supportRouter.get('/messages', async (c) => {
  const user = c.get('user');
  if (!user.admin) {
    throw new AppError(403, 'Admin access required', 'FORBIDDEN');
  }
  const messages = await listSupportMessages();
  return c.json(messages);
});

// PATCH /v1/support/messages/:id — admin only
supportRouter.patch('/messages/:id', async (c) => {
  const user = c.get('user');
  if (!user.admin) {
    throw new AppError(403, 'Admin access required', 'FORBIDDEN');
  }
  const id = c.req.param('id');
  const { status } = await c.req.json();
  if (status !== 'read' && status !== 'resolved') {
    throw new AppError(400, 'Status must be "read" or "resolved"', 'BAD_REQUEST');
  }
  await updateMessageStatus(id, status);
  return c.json({ ok: true });
});
