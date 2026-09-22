import { APP_SLUG } from "@/lib/constants/app";
import { getRedis } from "./redis";

/**
 * Cache utilities backed by Redis.
 *
 * Two rules hold throughout: a cache failure is logged and swallowed, never
 * thrown, and a cache miss is indistinguishable from Redis being absent. That
 * is what lets the application keep serving when Redis is down.
 */

/** Namespaces keys so several apps can share one Redis instance. */
export const KEY_PREFIX = `${APP_SLUG}:`;

export const DEFAULT_TTL = {
  /** Matches Better Auth's cookie cache window. */
  SESSION: 300,
  MEMBER: 300,
  /** Slow-moving reference data. */
  MASTER: 3600,
  /** List endpoints, kept short because the underlying rows change often. */
  LIST: 300,
} as const;

export const CacheKey = {
  session: (token: string) => `${KEY_PREFIX}session:token:${token}`,
  member: (userId: string, organizationId: string) =>
    `${KEY_PREFIX}member:${userId}:${organizationId}`,
  memberMe: (userId: string, organizationId: string) =>
    `${KEY_PREFIX}member-me:${userId}:${organizationId}`,
  companiesList: (organizationId: string, filterHash: string) =>
    `${KEY_PREFIX}companies:list:${organizationId}:${filterHash}`,
  companiesCount: (organizationId: string, filterHash: string) =>
    `${KEY_PREFIX}companies:count:${organizationId}:${filterHash}`,
  tagsList: (organizationId: string, filterHash: string) =>
    `${KEY_PREFIX}tags:list:${organizationId}:${filterHash}`,
  tagsCount: (organizationId: string, filterHash: string) =>
    `${KEY_PREFIX}tags:count:${organizationId}:${filterHash}`,
} as const;

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const redis = getRedis();
    if (!redis) return null;

    const data = await redis.get(key);
    if (!data) return null;

    return JSON.parse(data) as T;
  } catch (error) {
    console.warn(`[Cache] GET failed for key=${key}:`, error);
    return null;
  }
}

export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds: number,
): Promise<void> {
  try {
    const redis = getRedis();
    if (!redis) return;

    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch (error) {
    console.warn(`[Cache] SET failed for key=${key}:`, error);
  }
}

export async function cacheDel(...keys: string[]): Promise<void> {
  try {
    const redis = getRedis();
    if (!redis || keys.length === 0) return;

    await redis.del(...keys);
  } catch (error) {
    console.warn("[Cache] DEL failed:", error);
  }
}

/**
 * Delete every key matching a glob pattern.
 *
 * Uses SCAN rather than KEYS: KEYS blocks the server for the length of the
 * keyspace, which is fine locally and a production incident at scale.
 */
export async function cacheDelByPattern(pattern: string): Promise<void> {
  try {
    const redis = getRedis();
    if (!redis) return;

    let cursor = "0";
    do {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        "MATCH",
        pattern,
        "COUNT",
        100,
      );
      cursor = nextCursor;
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } while (cursor !== "0");
  } catch (error) {
    console.warn(
      `[Cache] DEL by pattern failed for pattern=${pattern}:`,
      error,
    );
  }
}

/** Read through the cache, falling back to `fetcher` and storing the result. */
export async function cacheAside<T>(opts: {
  key: string;
  fetcher: () => Promise<T>;
  ttl: number;
}): Promise<T> {
  const cached = await cacheGet<T>(opts.key);
  if (cached !== null) {
    return cached;
  }

  const data = await opts.fetcher();

  // Storing null or undefined would make a miss look like a hit on the next
  // read, so empty results are simply not cached.
  if (data !== undefined && data !== null) {
    await cacheSet(opts.key, data, opts.ttl);
  }

  return data;
}

/**
 * Reduce a set of filter values to a short, stable string for use in a cache
 * key. Normalizing first means `{a: 1, b: [2, 1]}` and `{b: [1, 2], a: 1}`
 * produce the same key instead of two entries for one query.
 */
export function hashFilter(obj: Record<string, unknown>): string {
  const normalized: Record<string, unknown> = {};
  const sortedKeys = Object.keys(obj).sort();

  for (const key of sortedKeys) {
    const value = obj[key];
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      normalized[key] = [...value].sort();
    } else {
      normalized[key] = value;
    }
  }

  return djb2Hash(JSON.stringify(normalized));
}

/** djb2, chosen for being cheap. Collisions only cost a redundant query. */
function djb2Hash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(16).padStart(6, "0").slice(-6);
}
