import "dotenv/config";
import crypto from "node:crypto";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { parse as parseCookie } from "cookie";
import { sql } from "drizzle-orm";
import { appRouter } from "../routers";
import { getDb } from "../db";
import { issueSessionForUser, resolveGoogleAccess } from "./authUsers";
import { createContext } from "./context";
import { getSessionCookieOptions } from "./cookies";
import { ENV, validateEnvironment } from "./env";
import { exchangeGoogleAuthCode, verifyGoogleIdToken } from "./googleAuth";

const GOOGLE_STATE_COOKIE = "google_oauth_state";

async function startServer() {
  const bootAt = Date.now();
  validateEnvironment();

  process.on("unhandledRejection", error => {
    console.error("[Process] Unhandled rejection:", error);
  });
  process.on("uncaughtException", error => {
    console.error("[Process] Uncaught exception:", error);
  });

  const app = express();
  const server = createServer(app);
  const frontendUrls = ENV.frontendUrls;
  const defaultFrontendUrl = ENV.frontendUrl;
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.use((req, res, next) => {
    const requestOrigin = req.headers.origin;
    const isDev = !ENV.isProduction;
    const isLocalDevOrigin =
      typeof requestOrigin === "string" &&
      /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/i.test(requestOrigin);

    const allowOrigin = (() => {
      if (typeof requestOrigin !== "string") return defaultFrontendUrl;
      if (frontendUrls.includes(requestOrigin)) return requestOrigin;
      if (isDev && isLocalDevOrigin) return requestOrigin;
      return null;
    })();

    if (typeof requestOrigin === "string" && !allowOrigin) {
      if (req.method === "OPTIONS") {
        res.status(403).end();
        return;
      }
      res.status(403).json({ error: "cors_origin_not_allowed" });
      return;
    }

    const requestHeaders =
      typeof req.headers["access-control-request-headers"] === "string"
        ? req.headers["access-control-request-headers"]
        : "";
    const allowHeaders = new Set(
      [
        "Content-Type",
        "Authorization",
        "X-Requested-With",
        "X-User-OpenId",
        "x-user-openid",
      ]
        .concat(ENV.corsAllowedHeaders)
        .concat(
          requestHeaders
            .split(",")
            .map(v => v.trim())
            .filter(Boolean)
        )
        .map(v => v.toLowerCase())
    );

    if (allowOrigin) {
      res.setHeader("Access-Control-Allow-Origin", allowOrigin);
    }
    const varyHeader = res.getHeader("Vary");
    const varyValues = new Set(
      String(varyHeader ?? "")
        .split(",")
        .map(v => v.trim())
        .filter(Boolean)
    );
    varyValues.add("Origin");
    res.setHeader("Vary", Array.from(varyValues).join(", "));
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader(
      "Access-Control-Allow-Headers",
      Array.from(allowHeaders).join(", ")
    );
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Max-Age", "600");
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });
  app.get("/api/health", async (_req, res) => {
    const dbStartedAt = Date.now();
    let dbStatus: "up" | "down" | "unconfigured" = "unconfigured";
    let dbLatencyMs: number | null = null;
    let dbError: string | null = null;

    if (process.env.DATABASE_URL) {
      try {
        const db = await getDb();
        if (db) {
          await db.execute(sql`select 1`);
          dbStatus = "up";
        } else {
          dbStatus = "down";
          dbError = "db_not_available";
        }
      } catch (error) {
        dbStatus = "down";
        dbError = error instanceof Error ? error.message : "db_health_check_failed";
      } finally {
        dbLatencyMs = Date.now() - dbStartedAt;
      }
    }

    res.json({
      ok: true,
      ready: dbStatus === "up" || dbStatus === "unconfigured",
      service: "estoque-manager-api",
      timestamp: new Date().toISOString(),
      uptimeMs: Date.now() - bootAt,
      api: {
        status: "up",
      },
      db: {
        status: dbStatus,
        latencyMs: dbLatencyMs,
        error: dbError,
      },
    });
  });

  app.get("/auth/google/start", (req, res) => {
    if (!ENV.googleClientId) {
      res.redirect(`${ENV.frontendUrl}/login?google=not_configured`);
      return;
    }

    const state = crypto.randomBytes(24).toString("hex");
    res.cookie(GOOGLE_STATE_COOKIE, state, {
      ...getSessionCookieOptions(req),
      maxAge: 10 * 60 * 1000,
    });

    const params = new URLSearchParams({
      client_id: ENV.googleClientId,
      redirect_uri: ENV.googleRedirectUri,
      response_type: "code",
      scope: "openid email profile",
      state,
      access_type: "offline",
      prompt: "consent",
    });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  });

  app.get("/auth/google/callback", async (req, res) => {
    const queryError = typeof req.query.error === "string" ? req.query.error : "";
    if (queryError) {
      res.redirect(`${ENV.frontendUrl}/login?google=cancelled`);
      return;
    }

    const state = typeof req.query.state === "string" ? req.query.state : "";
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const cookies = parseCookie(req.header("cookie") ?? "");
    const expectedState = cookies[GOOGLE_STATE_COOKIE];
    res.clearCookie(GOOGLE_STATE_COOKIE, getSessionCookieOptions(req));

    if (!state || !expectedState || state !== expectedState || !code) {
      res.redirect(`${ENV.frontendUrl}/login?google=invalid_state`);
      return;
    }

    try {
      const tokenResponse = await exchangeGoogleAuthCode(code);
      if (!tokenResponse.id_token) {
        throw new Error("Google não retornou id_token.");
      }

      const identity = await verifyGoogleIdToken(tokenResponse.id_token);
      const access = await resolveGoogleAccess(identity);

      if (access.status === "approved" && access.user) {
        await issueSessionForUser(req, res, access.user, { loginMethod: "google" });
        res.redirect(`${ENV.frontendUrl}/`);
        return;
      }

      if (access.status === "pending") {
        res.redirect(`${ENV.frontendUrl}/login?google=pending`);
        return;
      }

      res.redirect(`${ENV.frontendUrl}/login?google=rejected`);
    } catch (error) {
      console.error("[Google OAuth] callback error:", error);
      const message = error instanceof Error ? error.message : "";
      const reason = message.includes("invalid_client") ? "invalid_client" : "error";
      res.redirect(`${ENV.frontendUrl}/login?google=${reason}`);
    }
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("[Express] Unhandled request error:", error);
    if (res.headersSent) return;
    res.status(500).json({ error: "internal_server_error" });
  });

  const port = parseInt(process.env.PORT || "3001");

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
