import { describe, it, expect, vi } from 'vitest';

describe('crypto SIGNING_SECRET enforcement', () => {
  it('throws in production if SIGNING_SECRET is missing', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalSigningSecret = process.env.SIGNING_SECRET;

    process.env.NODE_ENV = 'production';
    delete process.env.SIGNING_SECRET;

    vi.resetModules();

    try {
      await import('../src/lib/crypto.js');
      throw new Error('Should have thrown when SIGNING_SECRET is missing in production');
    } catch (err: any) {
      expect(err.message).toContain('SIGNING_SECRET is required in production');
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
      process.env.SIGNING_SECRET = originalSigningSecret;
      vi.resetModules();
    }
  });

  it('does not throw in production if SIGNING_SECRET is provided', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalSigningSecret = process.env.SIGNING_SECRET;

    process.env.NODE_ENV = 'production';
    process.env.SIGNING_SECRET = 'test-prod-secret';

    vi.resetModules();

    try {
      const { createSignature } = await import('../src/lib/crypto.js');
      expect(createSignature).toBeDefined();
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
      process.env.SIGNING_SECRET = originalSigningSecret;
      vi.resetModules();
    }
  });
});
