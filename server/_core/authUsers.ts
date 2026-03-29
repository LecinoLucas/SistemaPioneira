import type { Request, Response } from "express";
import * as db from "../db";
import type { User } from "../../drizzle/schema";
import { getSessionCookieOptions } from "./cookies";
import { createSessionToken, SESSION_COOKIE_NAME } from "./session";
import { ENV } from "./env";
import {
  isApprovedLoginMethod,
  isRejectedLoginMethod,
  LOGIN_METHOD_GOOGLE,
  LOGIN_METHOD_GOOGLE_PENDING,
  LOGIN_METHOD_LOCAL,
} from "./userGovernance";

export type AccessStatus = "approved" | "pending" | "rejected";

type AuthUser = Pick<User, "id" | "openId" | "name" | "email" | "role">;

export async function resolveGoogleAccess(identity: {
  sub: string;
  email: string;
  name: string;
}): Promise<{ status: AccessStatus; user?: AuthUser }> {
  const isOwner = Boolean(ENV.ownerOpenId) && identity.sub === ENV.ownerOpenId;
  let user = await db.getUserByOpenId(identity.sub);

  if (!user) {
    await db.upsertUser({
      openId: identity.sub,
      name: identity.name,
      email: identity.email,
      loginMethod: isOwner ? LOGIN_METHOD_GOOGLE : LOGIN_METHOD_GOOGLE_PENDING,
      role: isOwner ? "admin" : "user",
      lastSignedIn: new Date(),
    });
    if (!isOwner) {
      return { status: "pending" };
    }
    user = await db.getUserByOpenId(identity.sub);
  }

  if (isOwner && user && (user.role !== "admin" || user.loginMethod !== LOGIN_METHOD_GOOGLE)) {
    await db.upsertUser({
      openId: identity.sub,
      name: identity.name,
      email: identity.email,
      loginMethod: LOGIN_METHOD_GOOGLE,
      role: "admin",
      lastSignedIn: new Date(),
    });
    user = await db.getUserByOpenId(identity.sub);
  }

  if (!user) return { status: "pending" };

  if (isRejectedLoginMethod(user.loginMethod)) {
    return { status: "rejected" };
  }

  if (!isApprovedLoginMethod(user.loginMethod ?? null)) {
    return { status: "pending" };
  }

  return {
    status: "approved",
    user: {
      id: user.id,
      openId: user.openId,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  };
}

export async function issueSessionForUser(
  req: Request,
  res: Response,
  user: AuthUser,
  options?: { loginMethod?: string }
) {
  const now = new Date();
  await db.upsertUser({
    openId: user.openId,
    name: user.name,
    email: user.email,
    role: user.role,
    loginMethod: options?.loginMethod ?? LOGIN_METHOD_LOCAL,
    lastSignedIn: now,
  });

  let sessionVersion = now.getTime();
  try {
    const persisted = await db.getUserByOpenId(user.openId);
    sessionVersion = new Date(persisted?.lastSignedIn ?? now).getTime();
  } catch {
    // Fail-soft fallback to current timestamp version.
  }

  const token = createSessionToken(
    {
      id: user.id,
      openId: user.openId,
      name: user.name,
      email: user.email,
      role: user.role,
    },
    { sessionVersion }
  );
  res.cookie(SESSION_COOKIE_NAME, token, getSessionCookieOptions(req));
}
