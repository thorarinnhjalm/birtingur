import { Redis } from '@upstash/redis';

let _redis: Redis | null = null;

export function getRedis(): Redis {
  if (_redis) return _redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error('Missing UPSTASH_REDIS_REST_URL / TOKEN');
  }
  _redis = new Redis({ url, token });
  return _redis;
}

/** In-memory shim used by tests; replaces the real client via setRedis(). */
export function setRedis(client: Redis) {
  _redis = client;
}
