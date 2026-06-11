import { Hono } from 'hono';
import { requireAdmin, requireAuth } from '../../lib/auth.js';
import type { Env } from '../../lib/auth.js';
import { db } from '../../lib/firebase.js';
import { COLLECTIONS, publisherConverter, advertiserConverter } from '@ada/shared/firestore';
import { updatePublisherStatus, deletePublisher } from '../../services/publishers.js';
import { updateAdvertiserStatus, deleteAdvertiser } from '../../services/advertisers.js';
import { listAllSlots, updateSlotStatus, deleteSlot } from '../../services/slots.js';
import { topUp } from '../../services/wallet.js';
import { deleteCampaign, updateCampaignStatus } from '../../services/campaigns.js';
import { deleteCreativeAdmin } from '../../services/creatives.js';

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

adminEntitiesRoutes.post('/advertisers/:id/topup', async (c) => {
  const id = c.req.param('id');
  const body = (await c.req.json()) as { amountIsk: number };
  if (typeof body.amountIsk !== 'number' || body.amountIsk <= 0) {
    return c.json({ error: 'amountIsk must be a positive number' }, 400);
  }
  const txnId = `admin_grant_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  await topUp(id, body.amountIsk, txnId);
  return c.json({ success: true, txnId });
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

adminEntitiesRoutes.get('/campaigns', async (c) => {
  const snap = await db.collection(COLLECTIONS.campaigns).get();
  return c.json(snap.docs.map((d) => d.data()));
});

adminEntitiesRoutes.get('/creatives', async (c) => {
  const snap = await db.collection(COLLECTIONS.creatives).get();
  return c.json(snap.docs.map((d) => d.data()));
});

adminEntitiesRoutes.get('/ledger', async (c) => {
  const snap = await db.collection(COLLECTIONS.ledger).orderBy('createdAt', 'desc').get();
  return c.json(snap.docs.map((d) => d.data()));
});

adminEntitiesRoutes.post('/campaigns/:id/status', async (c) => {
  const id = c.req.param('id');
  const body = (await c.req.json()) as { status: 'active' | 'paused' };
  if (body.status !== 'active' && body.status !== 'paused') {
    return c.json({ error: 'Invalid status' }, 400);
  }
  const updated = await updateCampaignStatus(id, body.status);
  return c.json(updated);
});

adminEntitiesRoutes.delete('/publishers/:id', async (c) => {
  const id = c.req.param('id');
  await deletePublisher(id);
  return c.json({ success: true });
});

adminEntitiesRoutes.delete('/advertisers/:id', async (c) => {
  const id = c.req.param('id');
  await deleteAdvertiser(id);
  return c.json({ success: true });
});

adminEntitiesRoutes.delete('/slots/:id', async (c) => {
  const id = c.req.param('id');
  await deleteSlot(id);
  return c.json({ success: true });
});

adminEntitiesRoutes.delete('/campaigns/:id', async (c) => {
  const id = c.req.param('id');
  await deleteCampaign(id);
  return c.json({ success: true });
});

adminEntitiesRoutes.delete('/creatives/:id', async (c) => {
  const id = c.req.param('id');
  await deleteCreativeAdmin(id);
  return c.json({ success: true });
});
