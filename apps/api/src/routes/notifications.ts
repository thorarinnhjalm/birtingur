import { Hono } from 'hono';
import { requireAuth, type Env } from '../lib/auth.js';
import { AppError } from '../lib/errors.js';
import {
  listNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from '../services/notifications.js';

export const notificationsRouter = new Hono<Env>();

// All endpoints require authentication
notificationsRouter.use('*', requireAuth);

// GET /v1/notifications?role=advertiser|publisher|admin
notificationsRouter.get('/', async (c) => {
  const user = c.get('user');
  const role = c.req.query('role');

  if (role !== 'advertiser' && role !== 'publisher' && role !== 'admin') {
    throw new AppError(400, 'Invalid role parameter', 'BAD_REQUEST');
  }

  // If role is admin, require admin status on the user token
  if (role === 'admin') {
    if (!user.admin) {
      throw new AppError(403, 'Admin access required', 'FORBIDDEN');
    }
    const notifications = await listNotifications('admin', 'admin');
    return c.json(notifications);
  }

  const notifications = await listNotifications(user.email, role);
  return c.json(notifications);
});

// PATCH /v1/notifications/:id/read
notificationsRouter.patch('/:id/read', async (c) => {
  const id = c.req.param('id');
  await markNotificationAsRead(id);
  return c.json({ ok: true });
});

// POST /v1/notifications/read-all
notificationsRouter.post('/read-all', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const role = body.role;

  if (role !== 'advertiser' && role !== 'publisher' && role !== 'admin') {
    throw new AppError(400, 'Invalid role parameter', 'BAD_REQUEST');
  }

  if (role === 'admin') {
    if (!user.admin) {
      throw new AppError(403, 'Admin access required', 'FORBIDDEN');
    }
    await markAllNotificationsAsRead('admin', 'admin');
    return c.json({ ok: true });
  }

  await markAllNotificationsAsRead(user.email, role);
  return c.json({ ok: true });
});

export default notificationsRouter;
