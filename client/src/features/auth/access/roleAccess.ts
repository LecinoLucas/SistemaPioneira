export type { UserRole } from "@shared/access-governance";
export {
  ACTION_PERMISSION_CATALOG,
  PERMISSION_TEMPLATES,
  ROUTE_ACCESS,
  SCREEN_CATALOG,
  getAllowedRoles,
  roleCanAccessPath as canAccessPathByRole,
  roleCanPerformAction,
  screenPermissionKey,
  type ActionPermissionKey,
  type PermissionTemplate,
  type PermissionEntry,
  type ScreenPath,
} from "@shared/access-governance";
