import { Hono } from 'hono';
import { requireAuth, type Env } from '../lib/auth.js';
import { getPublisherByOwnerEmail } from '../services/publishers.js';
import {
  createSlot,
  getSlot,
  listSlotsForPublisher,
  updateSlot,
  getSnippetForSlot,
} from '../services/slots.js';
import { AppError } from '../lib/errors.js';

export const slotsRouter = new Hono<Env>();

slotsRouter.use('*', requireAuth);

slotsRouter.post('/', async (c) => {
  const user = c.get('user');
  const publisher = await getPublisherByOwnerEmail(user.email);
  if (!publisher) {
    throw new AppError(404, 'Publisher profile not found', 'NOT_FOUND');
  }

  const body = await c.req.json();
  const slot = await createSlot({
    publisherId: publisher.id,
    name: body.name,
    sizes: body.sizes,
    pricing: body.pricing,
    placement: body.placement,
  });

  return c.json(slot, 201);
});

slotsRouter.get('/', async (c) => {
  const user = c.get('user');
  const publisher = await getPublisherByOwnerEmail(user.email);
  if (!publisher) {
    throw new AppError(404, 'Publisher profile not found', 'NOT_FOUND');
  }

  const slots = await listSlotsForPublisher(publisher.id);
  return c.json(slots);
});

slotsRouter.patch('/:id', async (c) => {
  const user = c.get('user');
  const publisher = await getPublisherByOwnerEmail(user.email);
  if (!publisher) {
    throw new AppError(404, 'Publisher profile not found', 'NOT_FOUND');
  }

  const id = c.req.param('id');
  const slot = await getSlot(id);
  if (!slot || slot.publisherId !== publisher.id) {
    throw new AppError(404, `Slot with ID ${id} not found`, 'NOT_FOUND');
  }

  const body = await c.req.json();
  const updated = await updateSlot(id, body);
  return c.json(updated);
});

slotsRouter.get('/:id/snippet', async (c) => {
  const user = c.get('user');
  const publisher = await getPublisherByOwnerEmail(user.email);
  if (!publisher) {
    throw new AppError(404, 'Publisher profile not found', 'NOT_FOUND');
  }

  const id = c.req.param('id');
  const slot = await getSlot(id);
  if (!slot || slot.publisherId !== publisher.id) {
    throw new AppError(404, `Slot with ID ${id} not found`, 'NOT_FOUND');
  }

  const queryWidth = c.req.query('width');
  const queryHeight = c.req.query('height');

  const width = queryWidth ? parseInt(queryWidth, 10) : undefined;
  const height = queryHeight ? parseInt(queryHeight, 10) : undefined;

  const snippet = await getSnippetForSlot(id, { width, height });
  return c.json({ snippet });
});
