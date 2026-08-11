/**
 * Errors that decide the HTTP status of a `/mcp` request.
 *
 * Until these existed, a bad `ak_` key produced a *successful* MCP session
 * with zero tools registered: `createMcpServer` caught the 401 from
 * `/v1/api-keys/me` and carried on. Clients showed "connected" with an empty
 * tool list and no error anywhere, which is close to the worst possible
 * signal — the caller can't tell a revoked key from a key with no
 * permissions from a server outage. Auth failures now surface as 401 with a
 * `WWW-Authenticate` challenge, and upstream failures as 503.
 */
export class McpAuthError extends Error {
  constructor(
    message: string,
    /** RFC 6750 `error` code echoed in the WWW-Authenticate challenge. */
    public readonly oauthError: 'invalid_token' | 'insufficient_scope' = 'invalid_token',
  ) {
    super(message);
    this.name = 'McpAuthError';
  }
}

/** The control-plane API was unreachable or errored — not the caller's fault. */
export class UpstreamUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UpstreamUnavailableError';
  }
}
