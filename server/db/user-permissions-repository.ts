import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { extractRows } from "./sql-helpers";

type DbConnection = ReturnType<typeof drizzle>;

export type UserPermissionRecord = {
  permissionKey: string;
  allowed: boolean;
};

export async function listUserPermissionsByUserIdFromDb(
  db: DbConnection,
  userId: number
): Promise<UserPermissionRecord[]> {
  const result = await db.execute(sql`
    SELECT permissionKey, allowed
    FROM user_permissions
    WHERE userId = ${userId}
  `);
  const rows = extractRows(result);

  return rows.map((row) => ({
    permissionKey: String(row.permissionKey ?? ""),
    allowed: Boolean(row.allowed),
  }));
}

export async function replaceUserPermissionsFromDb(
  db: DbConnection,
  userId: number,
  permissions: UserPermissionRecord[]
): Promise<void> {
  await db.execute(sql`DELETE FROM user_permissions WHERE userId = ${userId}`);
  if (permissions.length === 0) return;

  const deduped = Array.from(
    permissions.reduce((acc, item) => acc.set(item.permissionKey, item.allowed), new Map<string, boolean>())
  ).map(([permissionKey, allowed]) => ({ permissionKey, allowed }));

  for (const permission of deduped) {
    await db.execute(sql`
      INSERT INTO user_permissions (userId, permissionKey, allowed)
      VALUES (${userId}, ${permission.permissionKey}, ${permission.allowed ? 1 : 0})
      ON DUPLICATE KEY UPDATE
        allowed = VALUES(allowed),
        updatedAt = CURRENT_TIMESTAMP
    `);
  }
}
