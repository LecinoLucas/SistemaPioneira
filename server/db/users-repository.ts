import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { users } from "../../drizzle/schema";

type DbConnection = ReturnType<typeof drizzle>;

export async function findUserByOpenId(db: DbConnection, openId: string) {
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function listUsersByLoginMethodFromDb(db: DbConnection, loginMethod: string) {
  return await db
    .select()
    .from(users)
    .where(eq(users.loginMethod, loginMethod))
    .orderBy(desc(users.createdAt));
}

export async function listUsersForAdminFromDb(db: DbConnection) {
  return await db.select().from(users).orderBy(desc(users.updatedAt), desc(users.createdAt));
}

export async function findUserById(db: DbConnection, userId: number) {
  const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function setUserLoginMethodByIdInDb(
  db: DbConnection,
  userId: number,
  loginMethod: string
) {
  await db
    .update(users)
    .set({
      loginMethod,
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    })
    .where(eq(users.id, userId));
}

export async function updateUserRoleAndLoginMethodByIdInDb(
  db: DbConnection,
  userId: number,
  data: {
    role?: "admin" | "gerente" | "user";
    loginMethod?: string;
  }
) {
  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
    // Invalidates active sessions immediately when role/access changes.
    // createContext compares sessionVersion with lastSignedIn.
    lastSignedIn: new Date(),
  };

  if (data.role !== undefined) {
    updateData.role = data.role;
  }
  if (data.loginMethod !== undefined) {
    updateData.loginMethod = data.loginMethod;
  }

  await db.update(users).set(updateData).where(eq(users.id, userId));
}
