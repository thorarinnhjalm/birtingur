import { Hono } from 'hono';
import { AD_CATEGORY_SLUGS } from '@ada/shared';
import { requireAuth, requireScope, type Env } from '../lib/auth.js';
import {
  getCategoryInventory,
  getCombinedCategoryInventory,
  getCategorySizeForecast,
} from '../services/inventory.js';
import { getAllowedCategories } from '../services/domain-classifier.js';
import { AppError } from '../lib/errors.js';

export const categoriesRouter = new Hono<Env>();
categoriesRouter.use('*', requireAuth);

categoriesRouter.get('/inventory', async (c) => {
  const result = await getCategoryInventory();
  return c.json(result);
});

/**
 * Availability across a SELECTION, deduplicated.
 *
 * A separate route rather than a query parameter on `/inventory`, because the
 * two answer different questions and must not share a response shape:
 * `/inventory` lists what each category could deliver on its own, which is not
 * additive, and a caller that sums those rows counts a publisher once per
 * category it declares. That is what the buy flow did.
 */
categoriesRouter.get('/inventory/combined', async (c) => {
  const raw = c.req.query('categories') ?? '';
  const categories = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const invalid = categories.filter((cat) => !AD_CATEGORY_SLUGS.includes(cat));
  if (invalid.length > 0) {
    throw new AppError(400, `Unknown categories: ${invalid.join(', ')}`, 'BAD_REQUEST');
  }

  // An empty selection is not an error here — the buy flow asks before the
  // advertiser has picked anything — and the service answers with zeroes rather
  // than with the whole network.
  const result = await getCombinedCategoryInventory(categories);
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
