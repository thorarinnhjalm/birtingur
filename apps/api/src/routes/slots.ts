import { Hono } from 'hono';
import { requireAuth, requireScope, type Env } from '../lib/auth.js';
import { getPublishersByOwnerEmail, getPublisherById } from '../services/publishers.js';
import {
  createSlot,
  getSlot,
  listSlotsForPublisher,
  updateSlot,
  getSnippetForSlot,
} from '../services/slots.js';
import { getSlotStats } from '../services/slot-stats.js';
import { diagnoseSlotDelivery } from '../services/slot-delivery.js';
import { AppError } from '../lib/errors.js';

export const slotsRouter = new Hono<Env>();

slotsRouter.use('*', requireAuth);
slotsRouter.use('*', requireScope('publisher'));

async function verifySlotOwnership(slotId: string, email: string) {
  const slot = await getSlot(slotId);
  if (!slot) return null;
  const publishers = await getPublishersByOwnerEmail(email);
  const hasOwnership = publishers.some((p) => p.id === slot.publisherId);
  if (!hasOwnership) return null;
  return slot;
}

slotsRouter.post('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  let publisherId = body.publisherId;

  const publishers = await getPublishersByOwnerEmail(user.email);

  if (!publisherId) {
    // Fallback to the first owned publisher to maintain backward compatibility
    const firstPub = publishers[0];
    if (firstPub) {
      publisherId = firstPub.id;
    } else {
      throw new AppError(404, 'Publisher profile not found', 'NOT_FOUND');
    }
  }

  const hasOwnership = publishers.some((p) => p.id === publisherId);
  if (!hasOwnership) {
    throw new AppError(403, 'Forbidden: You do not own this publisher', 'FORBIDDEN');
  }

  const slot = await createSlot({
    publisherId,
    name: body.name,
    sizes: body.sizes,
    pricing: body.pricing,
    placement: body.placement,
  });

  return c.json(slot, 201);
});

slotsRouter.get('/', async (c) => {
  const user = c.get('user');
  const publishers = await getPublishersByOwnerEmail(user.email);
  const publisherIds = publishers.map((p) => p.id);

  const allSlots = [];
  for (const pubId of publisherIds) {
    const slots = await listSlotsForPublisher(pubId);
    allSlots.push(...slots);
  }

  // Fetch stats for all slots in parallel
  const enrichedSlots = await Promise.all(
    allSlots.map(async (slot) => {
      try {
        const stats = await getSlotStats(slot.publisherId, slot.id, 30);
        return {
          ...slot,
          stats: {
            impressions: stats.impressions,
            clicks: stats.clicks,
            spendIsk: stats.spendIsk,
            pageviews: stats.pageviews,
          },
        };
      } catch (err) {
        console.error(`Failed to fetch stats for slot ${slot.id}:`, err);
        return {
          ...slot,
          stats: {
            impressions: 0,
            clicks: 0,
            spendIsk: 0,
            pageviews: 0,
          },
        };
      }
    }),
  );

  return c.json(enrichedSlots);
});

slotsRouter.get('/:id/stats', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const slot = await verifySlotOwnership(id, user.email);
  if (!slot) {
    throw new AppError(404, `Slot with ID ${id} not found`, 'NOT_FOUND');
  }
  const timeframe = c.req.query('timeframe') === '30' ? 30 : 7;
  const stats = await getSlotStats(slot.publisherId, id, timeframe);
  return c.json(stats);
});

// Read-only: replays the serving eligibility pipeline and reports why the
// slot is (or isn't) filling. Registered before '/:id' so the literal path
// wins over the parameter match.
slotsRouter.get('/:id/delivery', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const slot = await verifySlotOwnership(id, user.email);
  if (!slot) {
    throw new AppError(404, `Slot with ID ${id} not found`, 'NOT_FOUND');
  }
  const publisher = await getPublisherById(slot.publisherId);
  if (!publisher) {
    throw new AppError(404, `Publisher for slot ${id} not found`, 'NOT_FOUND');
  }
  const diagnosis = await diagnoseSlotDelivery(slot, publisher);
  return c.json(diagnosis);
});

slotsRouter.get('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const slot = await verifySlotOwnership(id, user.email);
  if (!slot) {
    throw new AppError(404, `Slot with ID ${id} not found`, 'NOT_FOUND');
  }
  return c.json(slot);
});

slotsRouter.patch('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const slot = await verifySlotOwnership(id, user.email);
  if (!slot) {
    throw new AppError(404, `Slot with ID ${id} not found`, 'NOT_FOUND');
  }
  const body = await c.req.json();
  const updated = await updateSlot(id, body);
  return c.json(updated);
});

slotsRouter.get('/:id/snippet', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const slot = await verifySlotOwnership(id, user.email);
  if (!slot) {
    throw new AppError(404, `Slot with ID ${id} not found`, 'NOT_FOUND');
  }

  const queryWidth = c.req.query('width');
  const queryHeight = c.req.query('height');

  const width = queryWidth ? parseInt(queryWidth, 10) : undefined;
  const height = queryHeight ? parseInt(queryHeight, 10) : undefined;

  const snippet = await getSnippetForSlot(id, { width, height });
  return c.json({ snippet });
});
