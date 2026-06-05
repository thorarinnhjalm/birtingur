import { Hono } from 'hono';
import { requireAdmin, requireAuth } from '../../lib/auth.js';
import type { Env } from '../../lib/auth.js';
import { db } from '../../lib/firebase.js';
import { COLLECTIONS, publisherConverter, advertiserConverter } from '@ada/shared/firestore';
import { updatePublisherStatus } from '../../services/publishers.js';
import { updateAdvertiserStatus } from '../../services/advertisers.js';
import { listAllSlots, updateSlotStatus } from '../../services/slots.js';

export const adminEntitiesRoutes = new Hono<Env>();
adminEntitiesRoutes.use('/*', requireAuth, requireAdmin);

adminEntitiesRoutes.get('/publishers', async (c) => {
  const snap = await db.collection(COLLECTIONS.publishers).withConverter(publisherConverter).get();
  return c.json(snap.docs.map((d) => d.data()));
});

adminEntitiesRoutes.get('/advertisers', async (c) => {
  const snap = await db
    .collection(COLLECTIONS.advertisers)
    .withConverter(advertiserConverter)
    .get();
  return c.json(snap.docs.map((d) => d.data()));
});

adminEntitiesRoutes.get('/slots', async (c) => {
  const slots = await listAllSlots();
  return c.json(slots);
});

adminEntitiesRoutes.post('/publishers/:id/status', async (c) => {
  const id = c.req.param('id');
  const body = (await c.req.json()) as { status: 'active' | 'suspended' };
  if (body.status !== 'active' && body.status !== 'suspended') {
    return c.json({ error: 'Invalid status' }, 400);
  }
  const updated = await updatePublisherStatus(id, body.status);
  return c.json(updated);
});

adminEntitiesRoutes.post('/advertisers/:id/status', async (c) => {
  const id = c.req.param('id');
  const body = (await c.req.json()) as { status: 'active' | 'suspended' };
  if (body.status !== 'active' && body.status !== 'suspended') {
    return c.json({ error: 'Invalid status' }, 400);
  }
  const updated = await updateAdvertiserStatus(id, body.status);
  return c.json(updated);
});

adminEntitiesRoutes.post('/slots/:id/status', async (c) => {
  const id = c.req.param('id');
  const body = (await c.req.json()) as { status: 'active' | 'paused' };
  if (body.status !== 'active' && body.status !== 'paused') {
    return c.json({ error: 'Invalid status' }, 400);
  }
  const updated = await updateSlotStatus(id, body.status);
  return c.json(updated);
});
