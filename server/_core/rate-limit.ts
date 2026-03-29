/**
 * In-memory rate-limit store.
 *
 * Extracted from trpc.ts so it can be imported independently (e.g. for tests,
 * admin endpoints, and future replacement with a Redis-backed store).
 *
 * Architecture note: the store lives in-process. On restart, buckets reset to
 * zero — this is acceptable for the current single-instance deployment.
 * To support multiple instances, replace `RateLimitStore` with a Redis adapter
 * that implements the same interface.
 */

import type { TrpcContext } from "./context";
import { TRPCError } from "@trpc/server";

// ─── Types ─────────────────────────────────────────────────────────────────

export type RateLimitBy = "ip" | "user" | "user_or_ip";

export type RateLimitConfig = {
  scope: string;
  max: number;
  windowMs: number;
  by?: RateLimitBy;
  message?: string;
};

export type RateLimitSnapshotItem = {
  scope: string;
  identity: string;
  count: number;
  resetInSeconds: number;
};

type Bucket = { count: number; resetAt: number };

// ─── In-memory store ────────────────────────────────────────────────────────

const buckets = new Map<string, Bucket>();

/** Remove all expired entries — called before every check to keep memory lean. */
function pruneExpired(now: number): void {
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

function resolveIdentity(ctx: TrpcContext, by: RateLimitBy): string {
  const userId = ctx.user?.id ? `user:${ctx.user.id}` : "";
  const ip = `ip:${(ctx.req.ip ?? "unknown").trim()}`;
  if (by === "user") return userId || "user:anonymous";
  if (by === "ip") return ip;
  return userId || ip;
}

function sendHeaders(
  ctx: TrpcContext,
  limit: number,
  remaining: number,
  resetAt: number,
  retryAfter?: number
): void {
  const res = ctx.res as { setHeader?: (name: string, value: string) => void };
  if (typeof res?.setHeader !== "function") return;
  const resetSec = Math.max(0, Math.ceil((resetAt - Date.now()) / 1000));
  res.setHeader("X-RateLimit-Limit", String(limit));
  res.setHeader("X-RateLimit-Remaining", String(Math.max(0, remaining)));
  res.setHeader("X-RateLimit-Reset", String(resetSec));
  if (retryAfter !== undefined) {
    res.setHeader("Retry-After", String(Math.max(1, retryAfter)));
  }
}

// ─── Core check function ────────────────────────────────────────────────────

/**
 * Checks the rate-limit for a given context and config.
 * Throws TRPCError(TOO_MANY_REQUESTS) if the limit is exceeded.
 * Returns the remaining count on success.
 */
export function checkRateLimit(ctx: TrpcContext, config: RateLimitConfig): number {
  const now = Date.now();
  pruneExpired(now);

  const identity = resolveIdentity(ctx, config.by ?? "user_or_ip");
  const key = `${config.scope}:${identity}`;
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    const bucket: Bucket = { count: 1, resetAt: now + config.windowMs };
    buckets.set(key, bucket);
    sendHeaders(ctx, config.max, config.max - 1, bucket.resetAt);
    return config.max - 1;
  }

  if (current.count >= config.max) {
    const retryAfter = Math.ceil((current.resetAt - now) / 1000);
    sendHeaders(ctx, config.max, 0, current.resetAt, retryAfter);
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: config.message ?? "Muitas requisições. Tente novamente em instantes.",
    });
  }

  current.count += 1;
  buckets.set(key, current);
  sendHeaders(ctx, config.max, config.max - current.count, current.resetAt);
  return config.max - current.count;
}

// ─── Admin utilities ────────────────────────────────────────────────────────

export function getRateLimitSnapshot(options?: {
  scopePrefix?: string;
  limit?: number;
}): RateLimitSnapshotItem[] {
  const now = Date.now();
  pruneExpired(now);

  const cap = Math.max(1, Math.min(options?.limit ?? 100, 500));
  const prefix = options?.scopePrefix?.trim();

  const items: RateLimitSnapshotItem[] = [];
  for (const [key, bucket] of buckets.entries()) {
    const sep = key.indexOf(":");
    if (sep <= 0) continue;
    const scope = key.slice(0, sep);
    const identity = key.slice(sep + 1);
    if (prefix && !scope.startsWith(prefix)) continue;
    items.push({
      scope,
      identity,
      count: bucket.count,
      resetInSeconds: Math.max(0, Math.ceil((bucket.resetAt - now) / 1000)),
    });
  }

  return items
    .sort((a, b) => b.count - a.count || a.resetInSeconds - b.resetInSeconds)
    .slice(0, cap);
}

export function clearRateLimitBuckets(options?: {
  scopePrefix?: string;
  identityContains?: string;
  maxDelete?: number;
}): number {
  const now = Date.now();
  pruneExpired(now);

  const prefix = options?.scopePrefix?.trim();
  const term = options?.identityContains?.trim().toLowerCase();
  const max = Math.max(1, Math.min(options?.maxDelete ?? 500, 5000));

  let deleted = 0;
  for (const key of buckets.keys()) {
    if (deleted >= max) break;
    const sep = key.indexOf(":");
    if (sep <= 0) continue;
    const scope = key.slice(0, sep);
    const identity = key.slice(sep + 1);
    if (prefix && !scope.startsWith(prefix)) continue;
    if (term && !identity.toLowerCase().includes(term)) continue;
    buckets.delete(key);
    deleted++;
  }
  return deleted;
}
