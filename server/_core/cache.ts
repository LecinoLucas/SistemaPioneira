/**
 * Application-level in-memory cache with TTL and namespace invalidation.
 *
 * Designed to be resilient to backend restarts — data is refetched transparently
 * when the cache is cold or an entry expires. No external dependency required.
 *
 * Usage:
 *   // read-through pattern (recommended)
 *   const brands = await appCache.getOrSet("brands:all", () => db.getAllBrands(), 30_000);
 *
 *   // manual invalidation after a write
 *   appCache.invalidatePrefix("brands:");
 */

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

class AppCache {
  private readonly store = new Map<string, CacheEntry<unknown>>();
  private readonly cleanupTimer: NodeJS.Timeout;
  private hits = 0;
  private misses = 0;

  constructor(cleanupIntervalMs = 60_000) {
    // Cleanup expired entries periodically so memory doesn't grow unbounded.
    this.cleanupTimer = setInterval(() => this.cleanup(), cleanupIntervalMs);
    // Don't keep the Node.js process alive just for cleanup.
    this.cleanupTimer.unref();
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      this.misses++;
      return undefined;
    }
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this.misses++;
      return undefined;
    }
    this.hits++;
    return entry.value as T;
  }

  delete(key: string): boolean {
    return this.store.delete(key);
  }

  /**
   * Removes all entries whose key starts with `prefix`.
   * Returns the number of entries deleted.
   *
   * Example: appCache.invalidatePrefix("dashboard:") clears all dashboard cache.
   */
  invalidatePrefix(prefix: string): number {
    let count = 0;
    this.store.forEach((_entry, key) => {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
        count++;
      }
    });
    return count;
  }

  /**
   * Read-through: returns cached value if valid, otherwise calls `factory`,
   * caches the result, and returns it. Concurrent calls for the same key are
   * NOT deduplicated (simple approach; acceptable for low-traffic internal APIs).
   */
  async getOrSet<T>(key: string, factory: () => Promise<T>, ttlMs: number): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== undefined) return cached;

    const value = await factory();
    this.set(key, value, ttlMs);
    return value;
  }

  /** Removes all expired entries from the store. */
  cleanup(): void {
    const now = Date.now();
    this.store.forEach((entry, key) => {
      if (entry.expiresAt <= now) {
        this.store.delete(key);
      }
    });
  }

  /** Flush all entries (use on logout / critical writes if needed). */
  clear(): void {
    this.store.clear();
  }

  /** Diagnostic stats — exposed via /api/health or system router. */
  stats() {
    const now = Date.now();
    let active = 0;
    let expired = 0;
    this.store.forEach(entry => {
      if (entry.expiresAt > now) active++;
      else expired++;
    });
    return {
      total: this.store.size,
      active,
      expired,
      hits: this.hits,
      misses: this.misses,
      hitRate: this.hits + this.misses > 0
        ? Math.round((this.hits / (this.hits + this.misses)) * 100)
        : 0,
    };
  }
}

export const appCache = new AppCache();

// ─── TTL constants (ms) ────────────────────────────────────────────────────
// Use these in services so TTLs are easy to find and adjust.

export const CACHE_TTL = {
  /** Fast-changing data: sales counts, stock levels. */
  SHORT: 15_000,
  /** Semi-stable data: dashboard aggregates, top-selling lists. */
  MEDIUM: 30_000,
  /** Slow-changing data: brands list, product categories. */
  LONG: 5 * 60_000,
  /** Near-static data: permission templates, system config. */
  VERY_LONG: 10 * 60_000,
} as const;
