import crypto from "node:crypto";
import type { User } from "../../drizzle/schema";
import { ENV } from "./env";

export const SESSION_COOKIE_NAME = "estoque_session";
export const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12h
export const SESSION_ABSOLUTE_TTL_MS = 1000 * 60 * 60 * 24; // 24h
const SESSION_ROTATE_WINDOW_MS = 1000 * 60 * 60 * 2; // 2h
const DEV_FALLBACK_SECRET = "dev-change-this-session-secret";

export type SessionPayload = {
  id: number;
  openId: string;
  name: string;
  email: string;
  role: "admin" | "gerente" | "user";
  iat: number;
  exp: number;
  maxExp: number;
  sessionVersion: number;
};

export type SessionUser = Pick<User, "id" | "openId" | "name" | "email" | "role">;

function getSessionSecret() {
  if (ENV.cookieSecret) return ENV.cookieSecret;
  if (ENV.isProduction) {
    throw new Error("JWT_SECRET não configurado em produção.");
  }
  return DEV_FALLBACK_SECRET;
}

function sign(value: string) {
  return crypto
    .createHmac("sha256", getSessionSecret())
    .update(value)
    .digest("base64url");
}

export function createSessionToken(
  user: SessionUser,
  options?: { maxExp?: number; sessionVersion?: number }
) {
  const now = Date.now();
  const absoluteExp = options?.maxExp ?? now + SESSION_ABSOLUTE_TTL_MS;
  const payload: SessionPayload = {
    id: user.id,
    openId: user.openId,
    name: user.name ?? "Usuário",
    email: user.email ?? "",
    role: user.role,
    iat: now,
    maxExp: absoluteExp,
    exp: Math.min(now + SESSION_TTL_MS, absoluteExp),
    // Millisecond precision to avoid session-version collisions in same second.
    sessionVersion: options?.sessionVersion ?? now,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function readSessionToken(token: string): SessionPayload | null {
  const [encodedPayload, encodedSignature] = token.split(".");
  if (!encodedPayload || !encodedSignature) return null;

  const expected = sign(encodedPayload);
  const expectedBuf = Buffer.from(expected);
  const signatureBuf = Buffer.from(encodedSignature);
  if (
    expectedBuf.length !== signatureBuf.length ||
    !crypto.timingSafeEqual(expectedBuf, signatureBuf)
  ) {
    return null;
  }

  let payload: SessionPayload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as SessionPayload;
  } catch {
    return null;
  }

  if (
    typeof payload.id !== "number" ||
    !payload.openId ||
    !payload.role ||
    typeof payload.sessionVersion !== "number" ||
    typeof payload.maxExp !== "number" ||
    typeof payload.exp !== "number" ||
    payload.exp > payload.maxExp ||
    Date.now() > payload.maxExp ||
    Date.now() > payload.exp
  ) {
    return null;
  }

  return payload;
}

export function shouldRotateSession(payload: SessionPayload, now = Date.now()) {
  if (now >= payload.maxExp) return false;
  if (payload.exp >= payload.maxExp) return false;
  return payload.exp - now <= SESSION_ROTATE_WINDOW_MS;
}

export function sessionPayloadToUser(payload: SessionPayload): SessionUser {
  return {
    id: payload.id,
    openId: payload.openId,
    name: payload.name,
    email: payload.email,
    role: payload.role,
  };
}
