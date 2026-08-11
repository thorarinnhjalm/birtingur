import { describe, it, expect, vi, beforeEach } from 'vitest';

const apiCallMock = vi.fn();
vi.mock('../src/lib/api-client.js', async () => {
  const actual = await vi.importActual<typeof import('../src/lib/api-client.js')>(
    '../src/lib/api-client.js',
  );
  return { ...actual, apiCall: (...args: unknown[]) => apiCallMock(...args) };
});

import { app } from '../src/index.js';
import { ApiClientError } from '../src/lib/api-client.js';

function post(headers: Record<string, string> = {}) {
  return app.request('/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  });
}

describe('/mcp auth failures', () => {
  beforeEach(() => {
    apiCallMock.mockReset();
  });

  it('401s with a bare challenge when no Authorization header is sent', async () => {
    const res = await post();

    expect(res.status).toBe(401);
    const challenge = res.headers.get('WWW-Authenticate');
    expect(challenge).toContain('Bearer');
    expect(challenge).toContain('realm="birtingur-mcp"');
    // Nothing was presented, so nothing is "invalid" yet — RFC 6750 only
    // carries an error code when credentials actually failed.
    expect(challenge).not.toContain('error=');
    expect((await res.json()).message).toMatch(/ak_/);
  });

  it('401s with an invalid_token challenge when the key is rejected', async () => {
    apiCallMock.mockRejectedValue(new ApiClientError(401, 'unauthorized', 'Invalid API key'));

    const res = await post({ Authorization: 'Bearer ak_revoked' });

    expect(res.status).toBe(401);
    const challenge = res.headers.get('WWW-Authenticate');
    expect(challenge).toContain('error="invalid_token"');
    expect(challenge).toContain('error_description=');
    const body = await res.json();
    expect(body.error).toBe('invalid_token');
    expect(body.docs).toContain('birtingur.app');
  });

  it('503s (not 401) when the control-plane API is unreachable', async () => {
    apiCallMock.mockRejectedValue(new ApiClientError(500, 'internal', 'boom'));

    const res = await post({ Authorization: 'Bearer ak_valid' });

    expect(res.status).toBe(503);
    expect(res.headers.get('WWW-Authenticate')).toBeNull();
    expect((await res.json()).error).toBe('upstream_unavailable');
  });
});
