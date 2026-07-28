import { Hono } from 'hono';
import { AD_CATEGORY_SLUGS } from '@ada/shared';
import { requireAuth, requireScope, type Env } from '../lib/auth.js';
import { getCategoryInventory, getCategorySizeForecast } from '../services/inventory.js';
import { getAllowedCategories } from '../services/domain-classifier.js';
import { AppError } from '../lib/errors.js';

export const categoriesRouter = new Hono<Env>();
categoriesRouter.use('*', requireAuth);

categoriesRouter.get('/inventory', async (c) => {
  const result = await getCategoryInventory();
  return c.json(result);
});

categoriesRouter.get('/content', async (c) => {
  const result = await getAllowedCategories();
  return c.json(result);
});

// Creative wizard's "Stærðir" step (creative-wizard, 2026-07-27 plan) —
// advertiser-only (ID token or advertiser-scoped `ak_` key; read-only, so no
// rejectApiKeyMutation needed), same scope gate as the creatives router.
categoriesRouter.get('/sizes', requireScope('advertiser'), async (c) => {
  const raw = c.req.query('categories') ?? '';
  const categories = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (categories.length === 0) {
    throw new AppError(400, 'categories query parameter is required', 'BAD_REQUEST');
  }

  const invalid = categories.filter((cat) => !AD_CATEGORY_SLUGS.includes(cat));
  if (invalid.length > 0) {
    throw new AppError(400, `Unknown categories: ${invalid.join(', ')}`, 'BAD_REQUEST');
  }

  const sizes = await getCategorySizeForecast(categories);
  return c.json({ sizes });
});

export default categoriesRouter;
