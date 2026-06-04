import { handle } from 'hono/vercel';
import app from '../dist/src/index.js';

export const config = { runtime: 'nodejs' };

export default handle(app);
