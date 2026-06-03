import type { Context } from 'hono';

export function getApiKey(c: Context): string {
  const header = c.req.header('Authorization');
  if (!header || !header.startsWith('Bearer ')) {
    throw new Error('Missing bearer token in MCP request');
  }
  return header.slice('Bearer '.length).trim();
}
