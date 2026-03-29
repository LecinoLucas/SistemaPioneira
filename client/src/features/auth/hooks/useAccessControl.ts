import {
  roleCanAccessPath,
  roleCanPerformAction,
  screenPermissionKey,
  type ActionPermissionKey,
  type PermissionEntry,
  type ScreenPath,
} from "@shared/access-governance";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useMemo } from "react";

function mapPermissions(entries: PermissionEntry[] | undefined) {
  const map = new Map<string, boolean>();
  for (const entry of entries ?? []) {
    map.set(entry.permissionKey, entry.allowed);
  }
  return map;
}

export function useAccessControl() {
  const { user, isAuthenticated } = useAuth();
  const myPermissionsQuery = trpc.auth.myPermissions.useQuery(undefined, {
    enabled: isAuthenticated,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const isPermissionsProcedureMissing = String(myPermissionsQuery.error?.message ?? "").includes(
    'No procedure found on path "auth.myPermissions"'
  );

  const permissionMap = useMemo(
    () => mapPermissions((myPermissionsQuery.data as PermissionEntry[] | undefined) ?? []),
    [myPermissionsQuery.data]
  );

  const canAccessPath = (path: ScreenPath) => {
    const roleAllowed = roleCanAccessPath(user?.role, path);
    const explicit = permissionMap.get(screenPermissionKey(path));
    if (explicit === false) return false;
    return roleAllowed;
  };

  const canPerform = (permissionKey: ActionPermissionKey) => {
    const roleAllowed = roleCanPerformAction(user?.role, permissionKey);
    const explicit = permissionMap.get(permissionKey);
    if (explicit === false) return false;
    return roleAllowed;
  };

  return {
    permissions: myPermissionsQuery.data ?? [],
    isLoadingPermissions: myPermissionsQuery.isLoading,
    isPermissionsProcedureMissing,
    canAccessPath,
    canPerform,
  };
}
