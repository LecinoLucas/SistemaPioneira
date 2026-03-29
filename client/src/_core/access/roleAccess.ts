/** Compat layer para migração de arquitetura */
export {
  ROUTE_ACCESS,
  canAccessPathByRole as canAccessPath,
  getAllowedRoles,
  type UserRole,
} from "@/features/auth/access/roleAccess";
