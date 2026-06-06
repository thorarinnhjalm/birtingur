import { describe, it, expect } from 'vitest';
import { getClientIp } from '../src/lib/ip.js';

describe('getClientIp', () => {
  it('extracts IP from x-real-ip', () => {
    expect(getClientIp({ 'x-real-ip': '1.2.3.4' })).toBe('1.2.3.4');
  });

  it('handles case-insensitive header keys', () => {
    expect(getClientIp({ 'X-Real-IP': '1.2.3.4' })).toBe('1.2.3.4');
    expect(getClientIp({ 'X-Forwarded-For': '5.6.7.8, 9.9.9.9' })).toBe('5.6.7.8');
  });

  it('extracts first IP from x-forwarded-for list', () => {
    expect(getClientIp({ 'x-forwarded-for': '5.6.7.8, 12.34.56.78' })).toBe('5.6.7.8');
  });

  it('prefers x-real-ip over x-forwarded-for', () => {
    expect(
      getClientIp({
        'x-real-ip': '1.2.3.4',
        'x-forwarded-for': '5.6.7.8, 9.9.9.9',
      }),
    ).toBe('1.2.3.4');
  });

  it('falls back to 127.0.0.1 when headers are missing', () => {
    expect(getClientIp({})).toBe('127.0.0.1');
  });
});
