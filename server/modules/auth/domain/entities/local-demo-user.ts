import { ENV } from "../../../../_core/env";
import type { UserRole } from "../../../shared/types/user-role";

export type LocalDemoUser = {
  id: number;
  openId: string;
  name: string;
  email: string;
  role: UserRole;
  password: string;
};

/**
 * Demo users for local development.
 *
 * Passwords are read from environment variables so they are never hardcoded
 * in source control. Fallback values exist only as a convenience for first-run
 * local dev and MUST NOT be used in production — production should rely on
 * Google OAuth exclusively.
 */
export const DEMO_USERS: readonly LocalDemoUser[] = [
  {
    id: 1,
    openId: "admin-local",
    name: "Administrador",
    email: "admin@pioneira.local",
    role: "admin",
    password: ENV.demoAdminPassword || "admin123",
  },
  {
    id: 2,
    openId: "gerente-local",
    name: "Gerente",
    email: "gerente@pioneira.local",
    role: "gerente",
    password: ENV.demoGerentePassword || "gerente123",
  },
  {
    id: 3,
    openId: "user-local",
    name: "Usuário",
    email: "usuario@pioneira.local",
    role: "user",
    password: ENV.demoUserPassword || "user123",
  },
] as const;
