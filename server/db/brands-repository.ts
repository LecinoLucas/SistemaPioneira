import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { type InsertMarca, marcas, products } from "../../drizzle/schema";

type DbConnection = ReturnType<typeof drizzle>;

export async function getAllMarcasFromDb(db: DbConnection) {
  return await db.select().from(marcas).orderBy(marcas.nome);
}

export async function getMarcaByIdFromDb(db: DbConnection, id: number) {
  const result = await db.select().from(marcas).where(eq(marcas.id, id)).limit(1);
  return result[0] || null;
}

export async function createMarcaInDb(db: DbConnection, marca: InsertMarca) {
  return await db.insert(marcas).values(marca);
}

export async function updateMarcaInDb(db: DbConnection, id: number, updates: Partial<InsertMarca>) {
  await db.update(marcas).set(updates).where(eq(marcas.id, id));
}

export async function deleteMarcaInDb(db: DbConnection, id: number) {
  const marca = await getMarcaByIdFromDb(db, id);
  const productsWithMarca = await db
    .select()
    .from(products)
    .where(eq(products.marca, marca?.nome || ""))
    .limit(1);

  if (productsWithMarca.length > 0) {
    throw new Error("Não é possível excluir marca em uso por produtos");
  }

  await db.delete(marcas).where(eq(marcas.id, id));
}
