import Redis from "ioredis";

/**
 * Redis client, lazily created and reused.
 *
 * When REDIS_URL is unset the client is null and every cache operation turns
 * into a no-op, so the application runs without Redis at the cost of hitting
 * the database more often.
 */

let redis: Redis | null = null;

function createRedisClient(): Redis | null {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    console.warn(
      "[Redis] REDIS_URL is not set. Cache is disabled (pass-through mode).",
    );
    return null;
  }

  const client = new Redis(redisUrl, {
    retryStrategy(times) {
      if (times > 10) {
        console.error(
          "[Redis] Max retry attempts reached. Giving up reconnection.",
        );
        return null;
      }
      // Exponential backoff, capped at 2s.
      return Math.min(times * 50, 2000);
    },
    connectTimeout: 5000,
    commandTimeout: 3000,
    // Queue commands issued before the connection settles, so a burst at
    // startup does not fail.
    enableOfflineQueue: true,
    maxRetriesPerRequest: 1,
  });

  client.on("connect", () => {
    console.info("[Redis] Connected successfully.");
  });

  client.on("error", (err) => {
    console.error("[Redis] Connection error:", err.message);
  });

  client.on("close", () => {
    console.info("[Redis] Connection closed.");
  });

  return client;
}

export function getRedis(): Redis | null {
  if (redis === null && process.env.REDIS_URL) {
    redis = createRedisClient();
  }
  return redis;
}

/** For tests and graceful shutdown. */
export async function disconnectRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}
