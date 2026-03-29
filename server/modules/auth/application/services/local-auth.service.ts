import { AUTH_AUDIT_ACTION } from "@shared/auth-governance";
import type { TrpcContext } from "../../../../_core/context";
import { issueSessionForUser } from "../../../../_core/authUsers";
import { getSessionCookieOptions } from "../../../../_core/cookies";
import { SESSION_COOKIE_NAME } from "../../../../_core/session";
import { LOGIN_METHOD_LOCAL } from "../../../../_core/userGovernance";
import type { IAuditGateway } from "../../../audit/domain/contracts/audit.gateway";
import type { IUserRepository } from "../../../users/domain/contracts/user.repository";
import { DomainError } from "../../../shared/errors/domain-error";
import { DEMO_USERS } from "../../domain/entities/local-demo-user";

const LOGIN_ATTEMPT_WINDOW_MS = 1000 * 60 * 10; // 10 min
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_BLOCK_MS = 1000 * 60 * 15; // 15 min

/**
 * Serviço de autenticação local.
 * Concentra regras de tentativas, bloqueio e emissão de sessão.
 */
export class LocalAuthService {
  private readonly loginAttempts = new Map<
    string,
    { count: number; firstAttemptAt: number; blockedUntil?: number }
  >();

  constructor(
    private readonly userRepository: IUserRepository,
    private readonly auditGateway: IAuditGateway
  ) {}

  async login(ctx: TrpcContext, input: { email: string; password: string }) {
    const clientKey =
      (ctx.req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
      ctx.req.ip ||
      "unknown";

    const now = Date.now();
    const attempts = this.loginAttempts.get(clientKey);
    if (attempts?.blockedUntil && attempts.blockedUntil > now) {
      await this.auditGateway.write({
        action: AUTH_AUDIT_ACTION.LOGIN_BLOCKED,
        status: "blocked",
        actor: { ip: clientKey },
        metadata: { reason: "too_many_attempts" },
      });
      throw new DomainError("Muitas tentativas de login. Tente novamente em alguns minutos.", "TOO_MANY_REQUESTS");
    }

    const account = DEMO_USERS.find(
      (entry) => entry.email.toLowerCase() === input.email.trim().toLowerCase()
    );

    if (!account || account.password !== input.password) {
      if (!attempts || now - attempts.firstAttemptAt > LOGIN_ATTEMPT_WINDOW_MS) {
        this.loginAttempts.set(clientKey, { count: 1, firstAttemptAt: now });
      } else {
        const nextCount = attempts.count + 1;
        this.loginAttempts.set(clientKey, {
          count: nextCount,
          firstAttemptAt: attempts.firstAttemptAt,
          blockedUntil: nextCount >= LOGIN_MAX_ATTEMPTS ? now + LOGIN_BLOCK_MS : undefined,
        });
      }

      await this.auditGateway.write({
        action: AUTH_AUDIT_ACTION.LOGIN_FAILED,
        status: "failed",
        actor: { ip: clientKey, email: input.email },
      });

      throw new DomainError("Credenciais inválidas.", "UNAUTHORIZED");
    }

    this.loginAttempts.delete(clientKey);

    await this.bumpSessionVersionSafe({
      openId: account.openId,
      name: account.name,
      email: account.email,
      role: account.role,
    });

    await issueSessionForUser(
      ctx.req,
      ctx.res,
      {
        id: account.id,
        openId: account.openId,
        name: account.name,
        email: account.email,
        role: account.role,
      },
      { loginMethod: LOGIN_METHOD_LOCAL }
    );

    await this.auditGateway.write({
      action: AUTH_AUDIT_ACTION.LOGIN_SUCCESS,
      actor: {
        id: account.id,
        email: account.email,
        role: account.role,
        openId: account.openId,
        ip: clientKey,
      },
    });

    return {
      success: true,
      user: {
        id: account.id,
        openId: account.openId,
        name: account.name,
        email: account.email,
        role: account.role,
      },
    } as const;
  }

  async logout(ctx: TrpcContext) {
    if (ctx.user?.openId) {
      await this.bumpSessionVersionSafe({
        openId: ctx.user.openId,
        name: ctx.user.name,
        email: ctx.user.email,
        role: ctx.user.role,
      });
    }

    ctx.res.clearCookie(SESSION_COOKIE_NAME, getSessionCookieOptions(ctx.req));

    await this.auditGateway.write({
      action: AUTH_AUDIT_ACTION.LOGOUT,
      actor: {
        id: ctx.user?.id,
        email: ctx.user?.email,
        role: ctx.user?.role,
        openId: ctx.user?.openId,
        ip: ctx.req.ip,
      },
    });

    return { success: true } as const;
  }

  async logoutAll(ctx: TrpcContext) {
    if (!ctx.user) throw new DomainError("Usuário não autenticado.", "UNAUTHORIZED");

    await this.bumpSessionVersionSafe({
      openId: ctx.user.openId,
      name: ctx.user.name,
      email: ctx.user.email,
      role: ctx.user.role,
    });

    ctx.res.clearCookie(SESSION_COOKIE_NAME, getSessionCookieOptions(ctx.req));

    await this.auditGateway.write({
      action: AUTH_AUDIT_ACTION.LOGOUT_ALL,
      actor: {
        id: ctx.user.id,
        email: ctx.user.email,
        role: ctx.user.role,
        openId: ctx.user.openId,
        ip: ctx.req.ip,
      },
    });

    return { success: true } as const;
  }

  private async bumpSessionVersionSafe(user: {
    openId: string;
    name: string | null;
    email: string | null;
    role: "admin" | "gerente" | "user";
  }) {
    try {
      await this.userRepository.upsert({
        openId: user.openId,
        name: user.name,
        email: user.email,
        loginMethod: LOGIN_METHOD_LOCAL,
        role: user.role,
        lastSignedIn: new Date(),
      });
    } catch (error) {
      if (process.env.NODE_ENV !== "test") {
        console.warn("[Auth] Não foi possível atualizar versão global de sessão:", error);
      }
    }
  }
}
