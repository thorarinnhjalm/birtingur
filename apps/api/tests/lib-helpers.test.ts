import { describe, it, expect } from 'vitest';
import { generateId } from '../src/lib/id';
import { AppError, handleError } from '../src/lib/errors';
import { Hono } from 'hono';

describe('ID Utility', () => {
  it('generates prefixed IDs with the correct format', () => {
    const id = generateId('pub');
    expect(id).toMatch(/^pub_[a-f0-9]{24}$/);
  });

  it('generates unique IDs', () => {
    const id1 = generateId('slot');
    const id2 = generateId('slot');
    expect(id1).not.toBe(id2);
  });
});

describe('Error Handler Middleware', () => {
  const app = new Hono();

  app.get('/app-error', () => {
    throw new AppError(400, 'Invalid parameter value', 'BAD_REQUEST', { field: 'name' });
  });

  app.get('/generic-error', () => {
    throw new Error('Something went wrong internally');
  });

  app.onError(handleError);

  it('handles AppError correctly', async () => {
    const res = await app.request('/app-error');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({
      error: 'BAD_REQUEST',
      message: 'Invalid parameter value',
      details: { field: 'name' },
    });
  });

  it('handles generic Error as Internal Server Error', async () => {
    const res = await app.request('/generic-error');
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({
      error: 'InternalServerError',
      message: 'Something went wrong internally',
    });
  });
});
