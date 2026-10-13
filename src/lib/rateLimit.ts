// Simple in-memory fixed-window rate limiter (single-process deployment).
const buckets = new Map<string, { count: number; resetAt: number }>();

function live(key: string, now: number) {
  const b = buckets.get(key);
  return b && b.resetAt > now ? b : undefined;
}

/** Count one event against `key`. */
export function hit(key: string, windowMs: number): void {
  const now = Date.now();
  const b = live(key, now);
  if (b) {
    b.count++;
    return;
  }
  buckets.set(key, { count: 1, resetAt: now + windowMs });
  if (buckets.size > 10_000) for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
}

/** True once `key` has had `limit` events in its current window. Doesn't count anything itself. */
export function isLimited(key: string, limit: number): boolean {
  return (live(key, Date.now())?.count ?? 0) >= limit;
}

export function clear(key: string): void {
  buckets.delete(key);
}

/** Count one event and say whether it's within the limit. */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  hit(key, windowMs);
  return !isLimited(key, limit + 1);
}
