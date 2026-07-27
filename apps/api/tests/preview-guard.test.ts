import { describe, it, expect } from 'vitest';
import { previewCronBlockReason } from '../src/lib/preview-guard';

describe('previewCronBlockReason', () => {
  it('returns null in production', () => {
    expect(previewCronBlockReason({ VERCEL_ENV: 'production' })).toBeNull();
  });

  it('blocks preview deploys without the opt-in flag', () => {
    const reason = previewCronBlockReason({ VERCEL_ENV: 'preview' });
    expect(reason).toBeTypeOf('string');
    expect(reason).toMatch(/preview/i);
  });

  it('allows preview deploys when ALLOW_PREVIEW_CRONS is exactly "true"', () => {
    expect(
      previewCronBlockReason({ VERCEL_ENV: 'preview', ALLOW_PREVIEW_CRONS: 'true' }),
    ).toBeNull();
  });

  it('still blocks when ALLOW_PREVIEW_CRONS is set to a truthy-looking non-"true" value', () => {
    expect(previewCronBlockReason({ VERCEL_ENV: 'preview', ALLOW_PREVIEW_CRONS: '1' })).toBeTypeOf(
      'string',
    );
  });

  it('returns null when VERCEL_ENV is undefined (local dev)', () => {
    expect(previewCronBlockReason({})).toBeNull();
  });
});
