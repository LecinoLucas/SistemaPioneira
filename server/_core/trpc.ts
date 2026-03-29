import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from "@shared/const";
import { roleCanPerformAction, type ActionPermissionKey } from "@shared/access-governance";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { listUserPermissionsByUserId, resetConnection, isConnectionError } from "../db";
import {
  checkRateLimit,
  getRateLimitSnapshot,
  clearRateLimitBuckets,
  type RateLimitConfig,
  type RateLimitSnapshotItem,
} from "./rate-limit";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;

// Re-export types so callers don't need to import from two places.
export type { RateLimitConfig, RateLimitSnapshotItem };
export { getRateLimitSnapshot, clearRateLimitBuckets };

// ─── Error guard ────────────────────────────────────────────────────────────

const errorGuardMiddleware = t.middleware(async opts => {
  const { path, type, ctx, next } = opts;
  try {
    return await next();
  } catch (error) {
    const actor = ctx.user
      ? { userId: ctx.user.id, email: ctx.user.email, role: ctx.user.role }
      : { userId: null };
    console.error(`[tRPC] ${type} ${path} failed`, { actor, ip: ctx.req.ip, error });

    // If the error is a DB connection issue, reset the cached connection so
    // the next request triggers a fresh reconnect instead of reusing a dead pool.
    if (isConnectionError(error)) {
      resetConnection(error instanceof Error ? error.message : "connection error in tRPC");
    }

    throw error;
  }
});

export const publicProcedure = t.procedure.use(errorGuardMiddleware);

// ─── Rate limiting ──────────────────────────────────────────────────────────

export function withRateLimit(config: RateLimitConfig) {
  return t.middleware(async opts => {
    checkRateLimit(opts.ctx, config);
    return opts.next();
  });
}

// ─── Auth procedures ────────────────────────────────────────────────────────

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({ ctx: { ...ctx, user: ctx.user as NonNullable<TrpcContext["user"]> } });
});

export const protectedProcedure = t.procedure.use(errorGuardMiddleware).use(requireUser);

type UserRole = "admin" | "gerente" | "user";

function withRoles(roles: readonly UserRole[], message = "Acesso negado.") {
  return protectedProcedure.use(
    t.middleware(async opts => {
      const { ctx, next } = opts;
      if (!ctx.user || !roles.includes(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message });
      }
      return next({ ctx: { ...ctx, user: ctx.user as NonNullable<TrpcContext["user"]> } });
    })
  );
}

export const adminProcedure = withRoles(["admin"], NOT_ADMIN_ERR_MSG);
export const managerOrAdminProcedure = withRoles(
  ["admin", "gerente"],
  "Acesso negado: apenas administradores e gerentes."
);

// ─── Action permission ──────────────────────────────────────────────────────

export function withActionPermission(permissionKey: ActionPermissionKey) {
  return t.middleware(async opts => {
    const { ctx, next } = opts;
    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    }

    const userPermissions = await listUserPermissionsByUserId(ctx.user.id);
    const explicit = userPermissions.find(p => p.permissionKey === permissionKey);
    if (explicit?.allowed === true) {
      return next();
    }

    if (!roleCanPerformAction(ctx.user.role, permissionKey)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Ação não permitida para este perfil." });
    }

    if (explicit?.allowed === false) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Ação bloqueada nas permissões individuais deste usuário.",
      });
    }

    return next();
  });
}
