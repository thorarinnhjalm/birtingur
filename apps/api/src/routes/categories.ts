import { Hono } from 'hono';
import { requireAuth, type Env } from '../lib/auth.js';
import { getCategoryInventory } from '../services/inventory.js';

export const categoriesRouter = new Hono<Env>();
categoriesRouter.use('*', requireAuth);

categoriesRouter.get('/inventory', async (c) => {
  const result = await getCategoryInventory();
  return c.json(result);
});

export default categoriesRouter;
