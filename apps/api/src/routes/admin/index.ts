import { Hono } from 'hono';
import { adminReviewRoutes } from './review';

export const adminRoutes = new Hono();
adminRoutes.route('/review-queue', adminReviewRoutes);
