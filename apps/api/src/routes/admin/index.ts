import { Hono } from 'hono';
import { adminReviewRoutes } from './review';
import { adminPayoutsRoutes } from './payouts';

export const adminRoutes = new Hono();
adminRoutes.route('/review-queue', adminReviewRoutes);
adminRoutes.route('/payouts', adminPayoutsRoutes);
