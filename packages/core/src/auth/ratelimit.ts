/**
 * @nazareth/core — in-memory sliding-window rate limiter.
 * Single-node friendly; for multi-node deployments put a Redis-backed
 * implementation behind this interface (docs/DEPLOYMENT.md).
 */

interface Window {
  hits: number[];
}

const buckets = new Map<string, Window>();

// Periodic cleanup so the map can't grow unbounded.
setInterval(() => {
  const cutoff = Date.now() - 16 * 60_000;
  for (const [key, w] of buckets) {
    w.hits = w.hits.filter((t) => t > cutoff);
    if (w.hits.length === 0) buckets.delete(key);
  }
}, 10 * 60_000).unref?.();

export function rateLimit(key: string, { max, windowMs }: { max: number; windowMs: number }): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  const bucket = buckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);
  if (bucket.hits.length >= max) {
    const oldest = bucket.hits[bucket.hits.length - max] ?? bucket.hits[0];
    const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    buckets.set(key, bucket);
    return { ok: false, retryAfterSec };
  }
  bucket.hits.push(now);
  buckets.set(key, bucket);
  return { ok: true, retryAfterSec: 0 };
}

/** Login policy: 10 attempts / 15 min per (ip, email) pair. */
export function loginRateLimit(ip: string, email: string) {
  return rateLimit(`login:${ip}:${email.toLowerCase()}`, { max: 10, windowMs: 15 * 60_000 });
}
