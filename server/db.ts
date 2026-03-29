import { eq, desc, and, like, or, sql, SQL, isNotNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  users,
  products,
  InsertProduct,
  movimentacoes,
  InsertMovimentacao,
  vendas,
  InsertVenda,
  historicoPrecos,
  encomendas,
  InsertEncomenda,
  marcas,
  InsertMarca,
  userPermissions,
  importedSalesLog,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;
let _userPermissionsTableEnsured = false;
let _importedSalesTableEnsured = false;
let _productsSalesColumnEnsured = false;

async function ensureProductsSalesColumn(db: ReturnType<typeof drizzle>) {
  if (_productsSalesColumnEnsured) return;

  try {
    await db.execute(
      sql`ALTER TABLE products ADD COLUMN ativoParaVenda TINYINT(1) NOT NULL DEFAULT 1`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    const isDuplicateColumn =
      message.includes("duplicate column") ||
      message.includes("already exists") ||
      message.includes("1060");
    if (!isDuplicateColumn) {
      console.warn("[Database] Failed ensuring products.ativoParaVenda column:", error);
    }
  }

  _productsSalesColumnEnsured = true;
}

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  if (_db && !_productsSalesColumnEnsured) {
    await ensureProductsSalesColumn(_db);
  }
  return _db;
}

async function ensureUserPermissionsTable() {
  const db = await getDb();
  if (!db || _userPermissionsTableEnsured) return db;

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS user_permissions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      userId INT NOT NULL,
      permissionKey VARCHAR(191) NOT NULL,
      allowed TINYINT(1) NOT NULL DEFAULT 1,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_user_permission (userId, permissionKey),
      KEY idx_user_permissions_user (userId),
      KEY idx_user_permissions_key (permissionKey)
    )
  `);

  _userPermissionsTableEnsured = true;
  return db;
}

async function ensureImportedSalesTable() {
  const db = await getDb();
  if (!db || _importedSalesTableEnsured) return db;

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS imported_sales_log (
      id INT AUTO_INCREMENT PRIMARY KEY,
      fileHash VARCHAR(128) NOT NULL,
      fileName VARCHAR(255) NOT NULL,
      documentNumber VARCHAR(100) NULL,
      nomeCliente VARCHAR(200) NULL,
      total DECIMAL(12,2) NULL,
      itemsCount INT NOT NULL DEFAULT 0,
      userId INT NULL,
      approvedByUserId INT NULL,
      approvedByEmail VARCHAR(320) NULL,
      approvedAt TIMESTAMP NULL,
      status ENUM('success','failed') NOT NULL DEFAULT 'success',
      notes TEXT NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_imported_sales_file_hash (fileHash),
      KEY idx_imported_sales_document (documentNumber),
      KEY idx_imported_sales_created (createdAt)
    )
  `);

  _importedSalesTableEnsured = true;
  return db;
}

// ============ User Functions ============

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    if (process.env.NODE_ENV !== "test") {
      console.error("[Database] Failed to upsert user:", error);
    }
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function listUsersByLoginMethod(loginMethod: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot list users by loginMethod: database not available");
    return [];
  }

  return await db
    .select()
    .from(users)
    .where(eq(users.loginMethod, loginMethod as any))
    .orderBy(desc(users.createdAt));
}

export async function listUsersForAdmin() {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot list users for admin: database not available");
    return [];
  }

  return await db.select().from(users).orderBy(desc(users.updatedAt), desc(users.createdAt));
}

export async function getUserById(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function setUserLoginMethodById(userId: number, loginMethod: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot update user loginMethod: database not available");
    return;
  }

  await db
    .update(users)
    .set({
      loginMethod: loginMethod as any,
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    })
    .where(eq(users.id, userId));
}

export async function updateUserRoleAndLoginMethodById(
  userId: number,
  data: {
    role?: "admin" | "gerente" | "user";
    loginMethod?: string;
  }
) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot update user role/loginMethod: database not available");
    return;
  }

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

export type UserPermissionRecord = {
  permissionKey: string;
  allowed: boolean;
};

export async function listUserPermissionsByUserId(userId: number): Promise<UserPermissionRecord[]> {
  const db = await ensureUserPermissionsTable();
  if (!db) return [];

  const rows = await db
    .select({
      permissionKey: userPermissions.permissionKey,
      allowed: userPermissions.allowed,
    })
    .from(userPermissions)
    .where(eq(userPermissions.userId, userId));

  return rows.map((row) => ({
    permissionKey: row.permissionKey,
    allowed: Boolean(row.allowed),
  }));
}

export async function replaceUserPermissions(
  userId: number,
  permissions: UserPermissionRecord[]
): Promise<void> {
  const db = await ensureUserPermissionsTable();
  if (!db) return;

  await db.delete(userPermissions).where(eq(userPermissions.userId, userId));
  if (permissions.length === 0) return;

  const deduped = Array.from(
    permissions.reduce((acc, item) => acc.set(item.permissionKey, item.allowed), new Map<string, boolean>())
  ).map(([permissionKey, allowed]) => ({ permissionKey, allowed }));

  await db.insert(userPermissions).values(
    deduped.map((permission) => ({
      userId,
      permissionKey: permission.permissionKey,
      allowed: permission.allowed,
    }))
  );
}

export async function findImportedSaleByFileHashOrDocument(
  fileHash: string,
  documentNumber?: string | null
) {
  const db = await ensureImportedSalesTable();
  if (!db) return undefined;

  const normalizedDoc = documentNumber?.trim();
  const whereClause = normalizedDoc
    ? or(eq(importedSalesLog.fileHash, fileHash), eq(importedSalesLog.documentNumber, normalizedDoc))
    : eq(importedSalesLog.fileHash, fileHash);

  const result = await db
    .select()
    .from(importedSalesLog)
    .where(whereClause)
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function createImportedSaleLog(data: {
  fileHash: string;
  fileName: string;
  documentNumber?: string | null;
  nomeCliente?: string | null;
  total?: number | null;
  itemsCount: number;
  userId: number | null;
  approvedByUserId?: number | null;
  approvedByEmail?: string | null;
  approvedAt?: Date | null;
  status?: "success" | "failed";
  notes?: string | null;
}) {
  const db = await ensureImportedSalesTable();
  if (!db) throw new Error("Database not available");

  await db.insert(importedSalesLog).values({
    fileHash: data.fileHash,
    fileName: data.fileName,
    documentNumber: data.documentNumber ?? null,
    nomeCliente: data.nomeCliente ?? null,
    total: data.total != null ? data.total.toFixed(2) : null,
    itemsCount: data.itemsCount,
    userId: data.userId,
    approvedByUserId: data.approvedByUserId ?? null,
    approvedByEmail: data.approvedByEmail ?? null,
    approvedAt: data.approvedAt ?? null,
    status: data.status ?? "success",
    notes: data.notes ?? null,
  });
}

export async function listImportedSalesLogs(input?: {
  page?: number;
  pageSize?: number;
  search?: string;
}) {
  const db = await ensureImportedSalesTable();
  if (!db) {
    return { items: [], total: 0, totalPages: 0 };
  }

  const page = Math.max(1, input?.page ?? 1);
  const pageSize = Math.max(1, Math.min(input?.pageSize ?? 20, 100));
  const offset = (page - 1) * pageSize;
  const search = input?.search?.trim();

  const conditions: SQL[] = [];
  if (search) {
    conditions.push(
      or(
        sql`${importedSalesLog.fileName} LIKE ${`%${search}%`}`,
        sql`${importedSalesLog.documentNumber} LIKE ${`%${search}%`}`,
        sql`${importedSalesLog.nomeCliente} LIKE ${`%${search}%`}`
      ) as SQL
    );
  }

  const countRows = conditions.length
    ? await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(importedSalesLog)
        .where(and(...conditions))
    : await db.select({ count: sql<number>`COUNT(*)` }).from(importedSalesLog);
  const total = Number(countRows[0]?.count ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const items = conditions.length
    ? await db
        .select()
        .from(importedSalesLog)
        .where(and(...conditions))
        .orderBy(desc(importedSalesLog.createdAt))
        .limit(pageSize)
        .offset(offset)
    : await db
        .select()
        .from(importedSalesLog)
        .orderBy(desc(importedSalesLog.createdAt))
        .limit(pageSize)
        .offset(offset);

  return { items, total, totalPages };
}

// ============ Product Functions ============

export async function getAllProducts(limit?: number, offset?: number, onlyActiveForSales?: boolean) {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };

  const whereClause = onlyActiveForSales ? eq(products.ativoParaVenda, true) : undefined;
  
  const [items, countResult] = await Promise.all([
    whereClause
      ? limit !== undefined
        ? db.select().from(products).where(whereClause).orderBy(products.name).limit(limit).offset(offset ?? 0)
        : db.select().from(products).where(whereClause).orderBy(products.name)
      : limit !== undefined
        ? db.select().from(products).orderBy(products.name).limit(limit).offset(offset ?? 0)
        : db.select().from(products).orderBy(products.name),
    whereClause
      ? db.select({ count: sql<number>`count(*)` }).from(products).where(whereClause)
      : db.select({ count: sql<number>`count(*)` }).from(products),
  ]);
  
  return { items, total: Number(countResult[0]?.count ?? 0) };
}

/**
 * Returns products ranked by recent sales relevance to improve product picker UX.
 * Ranking priority:
 * 1) weighted sold quantity in last 30 days (x3)
 * 2) sold quantity in last 90 days (x1)
 * 3) most recently sold
 * 4) alphabetical fallback
 */
export async function getSmartProducts(limit?: number, offset?: number, onlyActiveForSales?: boolean) {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };

  const salesAgg = db
    .select({
      productId: vendas.productId,
      score: sql<number>`
        COALESCE(
          SUM(
            CASE
              WHEN ${vendas.dataVenda} >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN ${vendas.quantidade} * 3
              WHEN ${vendas.dataVenda} >= DATE_SUB(NOW(), INTERVAL 90 DAY) THEN ${vendas.quantidade}
              ELSE 0
            END
          ),
          0
        )
      `.as("score"),
      lastSoldAt: sql<Date | null>`MAX(${vendas.dataVenda})`.as("lastSoldAt"),
    })
    .from(vendas)
    .where(eq(vendas.status, "concluida"))
    .groupBy(vendas.productId)
    .as("sales_agg");

  const queryBase = db
    .select({
      product: products,
      salesScore: sql<number>`COALESCE(${salesAgg.score}, 0)`,
      lastSoldAt: salesAgg.lastSoldAt,
    })
    .from(products)
    .leftJoin(salesAgg, eq(products.id, salesAgg.productId));

  const query = onlyActiveForSales
    ? queryBase.where(eq(products.ativoParaVenda, true))
    : queryBase;

  const orderedQuery = query
    .orderBy(
      desc(sql`COALESCE(${salesAgg.score}, 0)`),
      desc(sql`COALESCE(${salesAgg.lastSoldAt}, '1970-01-01 00:00:00')`),
      products.name
    );

  const [rows, countResult] = await Promise.all([
    limit !== undefined ? orderedQuery.limit(limit).offset(offset ?? 0) : orderedQuery,
    onlyActiveForSales
      ? db.select({ count: sql<number>`count(*)` }).from(products).where(eq(products.ativoParaVenda, true))
      : db.select({ count: sql<number>`count(*)` }).from(products),
  ]);

  return {
    items: rows.map((row) => row.product),
    total: Number(countResult[0]?.count ?? 0),
  };
}

export async function getProductById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(products).where(eq(products.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function searchProducts(
  searchTerm?: string,
  medida?: string,
  categoria?: string,
  marca?: string,
  limit?: number,
  offset?: number,
  onlyActiveForSales?: boolean
) {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };
  
  const conditions = [];
  
  if (searchTerm) {
    conditions.push(like(products.name, `%${searchTerm}%`));
  }
  
  if (medida) {
    conditions.push(eq(products.medida, medida as any));
  }
  
  if (categoria) {
    conditions.push(eq(products.categoria, categoria as any));
  }
  
  if (marca) {
    conditions.push(eq(products.marca, marca));
  }

  if (onlyActiveForSales) {
    conditions.push(eq(products.ativoParaVenda, true));
  }
  
  if (conditions.length === 0) {
    return await getAllProducts(limit, offset, onlyActiveForSales);
  }
  
  const whereClause = and(...conditions);
  
  const [items, countResult] = await Promise.all([
    limit !== undefined
      ? db.select().from(products).where(whereClause).orderBy(products.name).limit(limit).offset(offset ?? 0)
      : db.select().from(products).where(whereClause).orderBy(products.name),
    db.select({ count: sql<number>`count(*)` }).from(products).where(whereClause),
  ]);
  
  return { items, total: Number(countResult[0]?.count ?? 0) };
}

export async function getAllBrands() {
  const db = await getDb();
  if (!db) return [];
  
  const result = await db.selectDistinct({ marca: products.marca }).from(products).where(isNotNull(products.marca)).orderBy(products.marca);
  return result.map(r => r.marca).filter(Boolean) as string[];
}

export async function getLowStockProducts() {
  const db = await getDb();
  if (!db) return [];
  
  return await db.select().from(products).where(
    or(
      sql`${products.quantidade} <= 1`,
      sql`${products.quantidade} <= ${products.estoqueMinimo}`
    )
  ).orderBy(products.quantidade);
}

export async function createProduct(product: InsertProduct) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const [result] = await db.insert(products).values(product).$returningId();
  if (!result) throw new Error("Failed to create product");
  
  // Get the inserted product
  const [inserted] = await db.select().from(products).where(eq(products.id, result.id));
  if (!inserted) throw new Error("Failed to retrieve inserted product");
  return inserted;
}

export async function createProductWithInitialMovement(
  product: InsertProduct,
  userId: number | null
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.transaction(async (tx) => {
    const [result] = await tx.insert(products).values(product).$returningId();
    if (!result) throw new Error("Failed to create product");

    const [inserted] = await tx
      .select()
      .from(products)
      .where(eq(products.id, result.id))
      .limit(1);
    if (!inserted) throw new Error("Failed to retrieve inserted product");

    if (inserted.quantidade > 0) {
      await tx.insert(movimentacoes).values({
        productId: inserted.id,
        tipo: "entrada",
        quantidade: inserted.quantidade,
        quantidadeAnterior: 0,
        quantidadeNova: inserted.quantidade,
        observacao: "Estoque inicial",
        userId,
      });
    }

    return inserted;
  });
}

export async function updateProduct(id: number, product: Partial<InsertProduct>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(products).set(product).where(eq(products.id, id));
}

export async function deleteProduct(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.transaction(async (tx) => {
    const [vendaRelacionada] = await tx
      .select({ id: vendas.id })
      .from(vendas)
      .where(eq(vendas.productId, id))
      .limit(1);

    if (vendaRelacionada) {
      throw new Error("Não é possível excluir produto com vendas relacionadas");
    }

    const [encomendaRelacionada] = await tx
      .select({ id: encomendas.id })
      .from(encomendas)
      .where(eq(encomendas.productId, id))
      .limit(1);

    if (encomendaRelacionada) {
      throw new Error("Não é possível excluir produto com encomendas relacionadas");
    }

    // Safe cleanup for entities that only reference product history/metadata.
    // Sales and orders remain protected by guards above.
    await tx.delete(movimentacoes).where(eq(movimentacoes.productId, id));
    await tx.delete(historicoPrecos).where(eq(historicoPrecos.productId, id));

    await tx.delete(products).where(eq(products.id, id));
  });
}

// ============ Movimentação Functions ============

export async function createMovimentacao(movimentacao: InsertMovimentacao) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(movimentacoes).values(movimentacao);
}

export async function getMovimentacoesByProduct(
  productId: number,
  limit = 100,
  offset = 0
) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(movimentacoes)
    .where(eq(movimentacoes.productId, productId))
    .orderBy(desc(movimentacoes.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function getAllMovimentacoes(limit = 100, offset = 0) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select({
      id: movimentacoes.id,
      productId: movimentacoes.productId,
      tipo: movimentacoes.tipo,
      quantidade: movimentacoes.quantidade,
      quantidadeAnterior: movimentacoes.quantidadeAnterior,
      quantidadeNova: movimentacoes.quantidadeNova,
      observacao: movimentacoes.observacao,
      createdAt: movimentacoes.createdAt,
      productName: products.name,
      productMedida: products.medida,
    })
    .from(movimentacoes)
    .leftJoin(products, eq(movimentacoes.productId, products.id))
    .orderBy(desc(movimentacoes.createdAt))
    .limit(limit)
    .offset(offset);
}

// ============ Venda Functions ============

export async function createVenda(venda: InsertVenda) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(vendas).values(venda);
}

export async function getVendaById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(vendas).where(eq(vendas.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function registrarVendasAtomico(data: {
  items: { productId: number; quantidade: number }[];
  dataVenda: Date;
  vendedor?: string;
  nomeCliente?: string;
  observacoes?: string;
  tipoTransacao: "venda" | "troca" | "brinde" | "emprestimo" | "permuta";
  userId: number | null;
  observacaoMovimentacao: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const lowStockAlerts: {
    productId: number;
    name: string;
    medida: string;
    novaQuantidade: number;
    estoqueMinimo: number;
  }[] = [];

  await db.transaction(async (tx) => {
    for (const item of data.items) {
      const [product] = await tx
        .select()
        .from(products)
        .where(eq(products.id, item.productId))
        .limit(1);

      if (!product) {
        throw new Error(`Product ${item.productId} not found`);
      }

      if (!product.ativoParaVenda) {
        throw new Error(`O produto "${product.name}" está inativo para novas vendas.`);
      }

      const novaQuantidade = product.quantidade - item.quantidade;

      await tx
        .update(products)
        .set({ quantidade: novaQuantidade })
        .where(eq(products.id, item.productId));

      await tx.insert(vendas).values({
        productId: item.productId,
        quantidade: item.quantidade,
        dataVenda: data.dataVenda,
        vendedor: data.vendedor,
        nomeCliente: data.nomeCliente,
        observacoes: data.observacoes,
        tipoTransacao: data.tipoTransacao,
        userId: data.userId,
      });

      await tx.insert(movimentacoes).values({
        productId: item.productId,
        tipo: "saida",
        quantidade: item.quantidade,
        quantidadeAnterior: product.quantidade,
        quantidadeNova: novaQuantidade,
        observacao: data.observacaoMovimentacao,
        userId: data.userId,
      });

      if (novaQuantidade <= 1 || novaQuantidade <= product.estoqueMinimo) {
        lowStockAlerts.push({
          productId: product.id,
          name: product.name,
          medida: product.medida,
          novaQuantidade,
          estoqueMinimo: product.estoqueMinimo,
        });
      }
    }
  });

  return lowStockAlerts;
}

export async function getVendasByDate(startDate: Date, endDate: Date) {
  const db = await getDb();
  if (!db) return [];
  
  return await db.select().from(vendas).where(
    and(
      sql`${vendas.dataVenda} >= ${startDate}`,
      sql`${vendas.dataVenda} <= ${endDate}`
    )
  ).orderBy(desc(vendas.dataVenda));
}

export async function getDashboardStats() {
  const db = await getDb();
  if (!db) return {
    totalProducts: 0,
    lowStockCount: 0,
    totalItems: 0,
    recentMovements: 0,
    negativeStockCount: 0
  };
  
  const [productsStats] = await db
    .select({
      totalProducts: sql<number>`COUNT(*)`,
      totalItems: sql<number>`COALESCE(SUM(${products.quantidade}), 0)`,
      lowStockCount: sql<number>`COALESCE(SUM(CASE WHEN ${products.quantidade} <= 1 OR ${products.quantidade} <= ${products.estoqueMinimo} THEN 1 ELSE 0 END), 0)`,
      negativeStockCount: sql<number>`COALESCE(SUM(CASE WHEN ${products.quantidade} < 0 THEN 1 ELSE 0 END), 0)`,
    })
    .from(products);

  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentMovementsResult = await db.select({ count: sql<number>`COUNT(*)` })
    .from(movimentacoes)
    .where(sql`${movimentacoes.createdAt} >= ${twentyFourHoursAgo}`);
  const recentMovements = Number(recentMovementsResult[0]?.count || 0);
  
  return {
    totalProducts: Number(productsStats?.totalProducts ?? 0),
    lowStockCount: Number(productsStats?.lowStockCount ?? 0),
    totalItems: Number(productsStats?.totalItems ?? 0),
    recentMovements,
    negativeStockCount: Number(productsStats?.negativeStockCount ?? 0)
  };
}

export async function getTopSellingProducts(startDate: Date, endDate: Date, limit: number = 5) {
  const db = await getDb();
  if (!db) return [];
  
  const vendasPeriodo = await db.select().from(vendas).where(
    and(
      sql`${vendas.dataVenda} >= ${startDate}`,
      sql`${vendas.dataVenda} <= ${endDate}`
    )
  );
  
  // Aggregate sales by product
  const salesByProduct = new Map<number, number>();
  for (const venda of vendasPeriodo) {
    const current = salesByProduct.get(venda.productId) || 0;
    salesByProduct.set(venda.productId, current + venda.quantidade);
  }
  
  const productIds = Array.from(salesByProduct.keys());
  const productsList = await getProductsByIds(productIds);
  const productsMap = new Map(productsList.map((product) => [product.id, product]));
  const topProducts = productIds
    .map((productId) => {
      const product = productsMap.get(productId);
      if (!product) return null;
      return {
        productId,
        name: product.name,
        medida: product.medida,
        categoria: product.categoria,
        quantidadeVendida: salesByProduct.get(productId) ?? 0,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
  
  return topProducts.sort((a, b) => b.quantidadeVendida - a.quantidadeVendida).slice(0, limit);
}

export async function getSalesByDateRange(startDate: Date, endDate: Date) {
  const db = await getDb();
  if (!db) return [];
  
  const vendasPeriodo = await db.select().from(vendas).where(
    and(
      sql`${vendas.dataVenda} >= ${startDate}`,
      sql`${vendas.dataVenda} <= ${endDate}`
    )
  ).orderBy(vendas.dataVenda);
  
  // Group by date
  const salesByDate = new Map<string, number>();
  for (const venda of vendasPeriodo) {
    const dateKey = venda.dataVenda.toISOString().split('T')[0];
    const current = salesByDate.get(dateKey) || 0;
    salesByDate.set(dateKey, current + venda.quantidade);
  }
  
  return Array.from(salesByDate.entries()).map(([date, quantidade]) => ({
    date,
    quantidade,
  }));
}

export async function getSalesByCategory(startDate: Date, endDate: Date) {
  const db = await getDb();
  if (!db) return [];
  
  const vendasPeriodo = await db.select().from(vendas).where(
    and(
      sql`${vendas.dataVenda} >= ${startDate}`,
      sql`${vendas.dataVenda} <= ${endDate}`
    )
  );
  
  const productIds = Array.from(new Set(vendasPeriodo.map((venda) => venda.productId)));
  const productsList = await getProductsByIds(productIds);
  const productsMap = new Map(productsList.map((product) => [product.id, product]));

  const salesByCategory = new Map<string, number>();
  for (const venda of vendasPeriodo) {
    const product = productsMap.get(venda.productId);
    if (product) {
      const current = salesByCategory.get(product.categoria) || 0;
      salesByCategory.set(product.categoria, current + venda.quantidade);
    }
  }
  
  return Array.from(salesByCategory.entries()).map(([categoria, quantidade]) => ({
    categoria,
    quantidade,
  }));
}

export async function getSalesByMedida(startDate: Date, endDate: Date) {
  const db = await getDb();
  if (!db) return [];
  
  const vendasPeriodo = await db.select().from(vendas).where(
    and(
      sql`${vendas.dataVenda} >= ${startDate}`,
      sql`${vendas.dataVenda} <= ${endDate}`
    )
  );
  
  const productIds = Array.from(new Set(vendasPeriodo.map((venda) => venda.productId)));
  const productsList = await getProductsByIds(productIds);
  const productsMap = new Map(productsList.map((product) => [product.id, product]));

  const salesByMedida = new Map<string, number>();
  for (const venda of vendasPeriodo) {
    const product = productsMap.get(venda.productId);
    if (product) {
      const current = salesByMedida.get(product.medida) || 0;
      salesByMedida.set(product.medida, current + venda.quantidade);
    }
  }
  
  return Array.from(salesByMedida.entries()).map(([medida, quantidade]) => ({
    medida,
    quantidade,
  }));
}

export async function getReplenishmentSuggestions() {
  const db = await getDb();
  if (!db) return [];
  
  // Get current month date range
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  
  // Get sales for current month
  const vendasMes = await db.select().from(vendas).where(
    and(
      sql`${vendas.dataVenda} >= ${startOfMonth}`,
      sql`${vendas.dataVenda} <= ${endOfMonth}`
    )
  );
  
  // Calculate average daily sales per product
  const daysInMonth = Math.ceil((endOfMonth.getTime() - startOfMonth.getTime()) / (1000 * 60 * 60 * 24));
  const salesByProduct = new Map<number, number>();
  
  for (const venda of vendasMes) {
    const current = salesByProduct.get(venda.productId) || 0;
    salesByProduct.set(venda.productId, current + venda.quantidade);
  }
  
  // Get all products and calculate suggestions
  const allProductsResult = await getAllProducts();
  const suggestions = [];
  
  for (const product of allProductsResult.items) {
    const totalSold = salesByProduct.get(product.id) || 0;
    const avgDailySales = totalSold / daysInMonth;
    const daysUntilStockout = avgDailySales > 0 ? product.quantidade / avgDailySales : 999;
    
    // Suggest replenishment if:
    // 1. Stock is below minimum OR
    // 2. Will run out in less than 7 days based on current sales rate
    if (product.quantidade <= product.estoqueMinimo || daysUntilStockout < 7) {
      // Calculate suggested order quantity (enough for 30 days based on average)
      const suggestedQuantity = Math.ceil(avgDailySales * 30);
      
      suggestions.push({
        productId: product.id,
        name: product.name,
        medida: product.medida,
        categoria: product.categoria,
        quantidadeAtual: product.quantidade,
        estoqueMinimo: product.estoqueMinimo,
        mediaDiaria: Math.round(avgDailySales * 10) / 10,
        diasRestantes: Math.round(daysUntilStockout),
        quantidadeSugerida: Math.max(suggestedQuantity, product.estoqueMinimo * 2),
        prioridade: product.quantidade <= 1 ? "alta" : 
                    product.quantidade <= product.estoqueMinimo ? "media" : "baixa",
      });
    }
  }
  
  // Sort by priority (alta > media > baixa) and then by dias restantes
  return suggestions.sort((a, b) => {
    const priorityOrder = { alta: 0, media: 1, baixa: 2 };
    const priorityDiff = priorityOrder[a.prioridade as keyof typeof priorityOrder] - 
                        priorityOrder[b.prioridade as keyof typeof priorityOrder];
    if (priorityDiff !== 0) return priorityDiff;
    return a.diasRestantes - b.diasRestantes;
  });
}

export async function updateProductPrice(id: number, precoCusto: number | null, precoVenda: number | null, userId: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.transaction(async (tx) => {
    const [product] = await tx.select().from(products).where(eq(products.id, id)).limit(1);
    if (!product) throw new Error("Product not found");

    await tx
      .update(products)
      .set({
        precoCusto: precoCusto !== null ? precoCusto.toString() : null,
        precoVenda: precoVenda !== null ? precoVenda.toString() : null,
      })
      .where(eq(products.id, id));

    if (
      product.precoCusto !== (precoCusto?.toString() ?? null) ||
      product.precoVenda !== (precoVenda?.toString() ?? null)
    ) {
      await tx.insert(historicoPrecos).values({
        productId: id,
        precoCustoAnterior: product.precoCusto,
        precoCustoNovo: precoCusto !== null ? precoCusto.toString() : null,
        precoVendaAnterior: product.precoVenda,
        precoVendaNovo: precoVenda !== null ? precoVenda.toString() : null,
        userId,
      });
    }
  });
}

export async function getPriceHistory(productId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return await db.select().from(historicoPrecos)
    .where(eq(historicoPrecos.productId, productId))
    .orderBy(sql`${historicoPrecos.createdAt} DESC`);
}

export async function getVendasPaginated(page: number, limit: number, tipoTransacao?: string) {
  const db = await getDb();
  if (!db) return { vendas: [], total: 0, totalPages: 0 };
  
  const offset = (page - 1) * limit;
  
  // Build where conditions
  const conditions: any[] = [];
  if (tipoTransacao) {
    conditions.push(eq(vendas.tipoTransacao, tipoTransacao as any));
  }
  
  // Get total count
  const totalResult = conditions.length > 0
    ? await db.select({ count: sql<number>`COUNT(*)` }).from(vendas).where(and(...conditions))
    : await db.select({ count: sql<number>`COUNT(*)` }).from(vendas);
  const total = Number(totalResult[0]?.count || 0);
  const totalPages = Math.ceil(total / limit);
  
  // Get paginated vendas with product details
  const vendasList = conditions.length > 0
    ? await db.select().from(vendas)
        .where(and(...conditions))
        .orderBy(desc(vendas.dataVenda))
        .limit(limit)
        .offset(offset)
    : await db.select().from(vendas)
        .orderBy(desc(vendas.dataVenda))
        .limit(limit)
        .offset(offset);
  
  const productIds = Array.from(new Set(vendasList.map((venda) => venda.productId)));
  const productsList = await getProductsByIds(productIds);
  const productsMap = new Map(productsList.map((product) => [product.id, product]));

  const enrichedVendas = vendasList.map((venda) => {
    const product = productsMap.get(venda.productId);
    return {
      ...venda,
      productName: product?.name || "Produto não encontrado",
      productMedida: product?.medida || "",
      productCategoria: product?.categoria || "",
    };
  });
  
  return {
    vendas: enrichedVendas,
    total,
    totalPages,
    currentPage: page,
  };
}

export async function cancelarVenda(vendaId: number, motivo: string, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.transaction(async (tx) => {
    const [vendaData] = await tx.select().from(vendas).where(eq(vendas.id, vendaId)).limit(1);
    if (!vendaData) {
      throw new Error("Venda não encontrada");
    }

    if (vendaData.status === "cancelada") {
      throw new Error("Venda já está cancelada");
    }

    const [product] = await tx
      .select()
      .from(products)
      .where(eq(products.id, vendaData.productId))
      .limit(1);

    if (!product) {
      throw new Error("Produto não encontrado");
    }

    const novaQuantidade = product.quantidade + vendaData.quantidade;

    await tx
      .update(products)
      .set({ quantidade: novaQuantidade })
      .where(eq(products.id, vendaData.productId));

    await tx
      .update(vendas)
      .set({
        status: "cancelada",
        motivoCancelamento: motivo,
      })
      .where(eq(vendas.id, vendaId));

    await tx.insert(movimentacoes).values({
      productId: vendaData.productId,
      tipo: "entrada",
      quantidade: vendaData.quantidade,
      quantidadeAnterior: product.quantidade,
      quantidadeNova: novaQuantidade,
      observacao: `Cancelamento de venda #${vendaId}: ${motivo}`,
      userId,
    });
  });
  
  return { success: true };
}

export async function excluirVenda(vendaId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.transaction(async (tx) => {
    const [vendaData] = await tx.select().from(vendas).where(eq(vendas.id, vendaId)).limit(1);
    if (!vendaData) {
      throw new Error("Venda não encontrada");
    }

    const [product] = await tx
      .select()
      .from(products)
      .where(eq(products.id, vendaData.productId))
      .limit(1);

    if (product) {
      const novaQuantidade = product.quantidade + vendaData.quantidade;
      await tx
        .update(products)
        .set({ quantidade: novaQuantidade })
        .where(eq(products.id, vendaData.productId));

      await tx.insert(movimentacoes).values({
        productId: vendaData.productId,
        tipo: "entrada",
        quantidade: vendaData.quantidade,
        quantidadeAnterior: product.quantidade,
        quantidadeNova: novaQuantidade,
        observacao: `Exclusão de venda #${vendaId}`,
        userId,
      });
    }

    await tx.delete(vendas).where(eq(vendas.id, vendaId));
  });
  
  return { success: true };
}

export async function getVendasByVendedor(startDate: Date, endDate: Date) {
  const db = await getDb();
  if (!db) return [];
  
  const vendasPeriodo = await db.select().from(vendas).where(
    and(
      sql`${vendas.dataVenda} >= ${startDate}`,
      sql`${vendas.dataVenda} <= ${endDate}`,
      eq(vendas.status, "concluida")
    )
  );
  
  // Group by vendedor
  const salesByVendedor = new Map<string, { quantidade: number; vendas: number }>();
  
  for (const venda of vendasPeriodo) {
    const vendedorName = venda.vendedor || "Não informado";
    const current = salesByVendedor.get(vendedorName) || { quantidade: 0, vendas: 0 };
    salesByVendedor.set(vendedorName, {
      quantidade: current.quantidade + venda.quantidade,
      vendas: current.vendas + 1,
    });
  }
  
  return Array.from(salesByVendedor.entries()).map(([vendedor, stats]) => ({
    vendedor,
    quantidadeVendida: stats.quantidade,
    totalVendas: stats.vendas,
  })).sort((a, b) => b.quantidadeVendida - a.quantidadeVendida);
}

export async function getVendasRelatorio(filters: {
  startDate?: Date;
  endDate?: Date;
  vendedor?: string;
  nomeCliente?: string;
}) {
  const db = await getDb();
  if (!db) return [];
  
  const conditions = [];
  
  if (filters.startDate) {
    conditions.push(sql`${vendas.dataVenda} >= ${filters.startDate}`);
  }
  
  if (filters.endDate) {
    conditions.push(sql`${vendas.dataVenda} <= ${filters.endDate}`);
  }
  
  if (filters.vendedor) {
    conditions.push(eq(vendas.vendedor, filters.vendedor));
  }
  
  if (filters.nomeCliente) {
    conditions.push(sql`${vendas.nomeCliente} LIKE ${`%${filters.nomeCliente}%`}`);
  }
  
  const vendasList = await db.select().from(vendas)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(vendas.dataVenda));
  
  const productIds = Array.from(new Set(vendasList.map((venda) => venda.productId)));
  const productsList = await getProductsByIds(productIds);
  const productsMap = new Map(productsList.map((product) => [product.id, product]));

  const enrichedVendas = vendasList.map((venda) => {
    const product = productsMap.get(venda.productId);
    return {
      ...venda,
      productName: product?.name || "Produto não encontrado",
      medida: product?.medida || "",
      categoria: product?.categoria || "",
      marca: product?.marca || null,
    };
  });
  
  return enrichedVendas;
}

export async function getEncomendasRelatorio(filters: {
  nomeCliente?: string;
}) {
  const db = await getDb();
  if (!db) return [];
  
  // Get all sales with negative stock products
  const conditions = [eq(vendas.status, "concluida")];
  
  if (filters.nomeCliente) {
    conditions.push(sql`${vendas.nomeCliente} LIKE ${`%${filters.nomeCliente}%`}`);
  }
  
  const vendasList = await db.select().from(vendas)
    .where(and(...conditions))
    .orderBy(desc(vendas.dataVenda));
  
  const productIds = Array.from(new Set(vendasList.map((venda) => venda.productId)));
  const productsList = await getProductsByIds(productIds);
  const productsMap = new Map(productsList.map((product) => [product.id, product]));

  return vendasList
    .map((venda) => {
      const product = productsMap.get(venda.productId);
      if (!product || product.quantidade >= 0) return null;
      return {
        ...venda,
        productName: product.name,
        medida: product.medida,
        categoria: product.categoria,
        marca: product.marca || null,
        estoqueAtual: product.quantidade,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

export async function getNegativeStockProducts() {
  const db = await getDb();
  if (!db) return [];
  
  const result = await db
    .select()
    .from(products)
    .where(sql`${products.quantidade} < 0`)
    .orderBy(products.quantidade);
  
  return result;
}


export async function editarVenda(
  vendaId: number,
  updates: {
    vendedor?: string;
    observacoes?: string;
    quantidade?: number;
    tipoTransacao?: "venda" | "troca" | "brinde" | "emprestimo" | "permuta";
  },
  userId: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  await db.transaction(async (tx) => {
    const [venda] = await tx.select().from(vendas).where(eq(vendas.id, vendaId)).limit(1);
    if (!venda) {
      throw new Error("Venda não encontrada");
    }

    if (venda.status === "cancelada") {
      throw new Error("Não é possível editar uma venda cancelada");
    }

    if (updates.quantidade && updates.quantidade !== venda.quantidade) {
      const [product] = await tx
        .select()
        .from(products)
        .where(eq(products.id, venda.productId))
        .limit(1);
      if (!product) {
        throw new Error("Produto não encontrado");
      }

      const diferenca = updates.quantidade - venda.quantidade;
      const novaQuantidadeEstoque = product.quantidade - diferenca;

      await tx
        .update(products)
        .set({ quantidade: novaQuantidadeEstoque })
        .where(eq(products.id, venda.productId));

      await tx.insert(movimentacoes).values({
        productId: venda.productId,
        tipo: diferenca > 0 ? "saida" : "entrada",
        quantidade: Math.abs(diferenca),
        quantidadeAnterior: product.quantidade,
        quantidadeNova: novaQuantidadeEstoque,
        observacao: `Ajuste por edição de venda #${vendaId}`,
        userId,
      });
    }

    const updateData: any = {};
    if (updates.vendedor !== undefined) updateData.vendedor = updates.vendedor;
    if (updates.observacoes !== undefined) updateData.observacoes = updates.observacoes;
    if (updates.quantidade !== undefined) updateData.quantidade = updates.quantidade;
    if (updates.tipoTransacao !== undefined) updateData.tipoTransacao = updates.tipoTransacao;

    if (Object.keys(updateData).length > 0) {
      await tx.update(vendas).set(updateData).where(eq(vendas.id, vendaId));
    }
  });
  
  return { success: true };
}

// ============ Ranking Functions ============

export async function getRankingVendedores(filters: {
  startDate?: Date;
  endDate?: Date;
}) {
  const db = await getDb();
  if (!db) return [];
  
  const conditions: SQL[] = [
    eq(vendas.status, "concluida"),
  ];
  
  if (filters.startDate) {
    conditions.push(sql`${vendas.dataVenda} >= ${filters.startDate}`);
  }
  
  if (filters.endDate) {
    conditions.push(sql`${vendas.dataVenda} <= ${filters.endDate}`);
  }
  
  const result = await db
    .select({
      vendedor: vendas.vendedor,
      totalVendas: sql<number>`COUNT(*)`,
      quantidadeTotal: sql<number>`SUM(${vendas.quantidade})`,
    })
    .from(vendas)
    .where(and(...conditions))
    .groupBy(vendas.vendedor)
    .orderBy(sql`SUM(${vendas.quantidade}) DESC`);
  
  return result.map((row, index) => ({
    posicao: index + 1,
    vendedor: row.vendedor,
    totalVendas: Number(row.totalVendas),
    quantidadeTotal: Number(row.quantidadeTotal),
  }));
}

export async function getRankingProdutos(filters: {
  startDate?: Date;
  endDate?: Date;
}) {
  const db = await getDb();
  if (!db) return [];
  
  const conditions: SQL[] = [
    eq(vendas.status, "concluida"),
  ];
  
  if (filters.startDate) {
    conditions.push(sql`${vendas.dataVenda} >= ${filters.startDate}`);
  }
  
  if (filters.endDate) {
    conditions.push(sql`${vendas.dataVenda} <= ${filters.endDate}`);
  }
  
  const result = await db
    .select({
      productId: vendas.productId,
      quantidadeTotal: sql<number>`SUM(${vendas.quantidade})`,
      totalVendas: sql<number>`COUNT(*)`,
    })
    .from(vendas)
    .where(and(...conditions))
    .groupBy(vendas.productId)
    .orderBy(sql`SUM(${vendas.quantidade}) DESC`)
    .limit(20);
  
  const productsList = await getProductsByIds(result.map((row) => row.productId));
  const productsMap = new Map(productsList.map((product) => [product.id, product]));

  const enrichedResult = result.map((row) => {
    const product = productsMap.get(row.productId);
    return {
      productId: row.productId,
      nome: product?.name || "Produto não encontrado",
      marca: product?.marca || "-",
      medida: product?.medida || "-",
      categoria: product?.categoria || "-",
      quantidadeTotal: Number(row.quantidadeTotal),
      totalVendas: Number(row.totalVendas),
    };
  });
  
  return enrichedResult.map((row, index) => ({
    posicao: index + 1,
    ...row,
  }));
}

export async function getProductsByIds(ids: number[]) {
  const db = await getDb();
  if (!db) return [];
  if (ids.length === 0) return [];
  
  return await db
    .select()
    .from(products)
    .where(sql`${products.id} IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})`)
    .orderBy(products.name);
}

export async function getProductsFiltered(filters: { search?: string; medida?: string; categoria?: string; marca?: string }) {
  const db = await getDb();
  if (!db) return [];
  
  const conditions = [];
  if (filters.search) {
    conditions.push(sql`LOWER(${products.name}) LIKE LOWER(${`%${filters.search}%`})`);
  }
  if (filters.medida) {
    conditions.push(eq(products.medida, filters.medida));
  }
  if (filters.categoria) {
    conditions.push(sql`${products.categoria} = ${filters.categoria}`);
  }
  if (filters.marca) {
    conditions.push(eq(products.marca, filters.marca));
  }
  
  if (conditions.length > 0) {
    return await db.select().from(products).where(and(...conditions)).orderBy(products.name);
  }
  
  return await db.select().from(products).orderBy(products.name);
}

// ========== Encomendas Functions ==========

// Helper function to add business days
function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date);
  let addedDays = 0;
  
  while (addedDays < days) {
    result.setDate(result.getDate() + 1);
    // Skip weekends (0 = Sunday, 6 = Saturday)
    if (result.getDay() !== 0 && result.getDay() !== 6) {
      addedDays++;
    }
  }
  
  return result;
}

export async function createEncomenda(data: {
  productId?: number;
  nomeProduto?: string;
  medidaProduto?: string;
  quantidade: number;
  nomeCliente: string;
  telefoneCliente?: string;
  dataCompra?: Date;
  prazoEntregaDias?: number;
  dataEntrega?: Date;
  observacoes?: string;
  vendedor?: string;
  userId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Calculate dataEntrega based on priority: dataEntrega > prazoEntregaDias > default 15 days
  let finalDataEntrega = data.dataEntrega;
  if (!finalDataEntrega) {
    const baseDate = data.dataCompra || new Date();
    const diasUteis = data.prazoEntregaDias || 15;
    finalDataEntrega = addBusinessDays(baseDate, diasUteis);
  }

  await db.insert(encomendas).values({
    productId: data.productId || null,
    nomeProduto: data.nomeProduto || null,
    medidaProduto: data.medidaProduto || null,
    quantidade: data.quantidade,
    nomeCliente: data.nomeCliente,
    telefoneCliente: data.telefoneCliente || null,
    dataCompra: data.dataCompra || null,
    prazoEntregaDias: data.prazoEntregaDias || null,
    dataEntrega: finalDataEntrega,
    observacoes: data.observacoes || null,
    vendedor: data.vendedor || null,
    userId: data.userId,
  });

  return { success: true };
}

export async function getEncomendas(status?: string, cliente?: string) {
  const db = await getDb();
  if (!db) return [];

  let result;
  
  const conditions = [];
  if (status && status !== "todos") {
    conditions.push(eq(encomendas.status, status as any));
  }
  if (cliente) {
    conditions.push(sql`${encomendas.nomeCliente} LIKE ${`%${cliente}%`}`);
  }
  
  if (conditions.length > 0) {
    result = await db.select().from(encomendas)
      .where(and(...conditions))
      .orderBy(desc(encomendas.dataEntrega));
  } else {
    result = await db.select().from(encomendas)
      .orderBy(desc(encomendas.dataEntrega));
  }
  
  const productIds = Array.from(
    new Set(result.map((enc) => enc.productId).filter((id): id is number => typeof id === "number"))
  );
  const productsList = await getProductsByIds(productIds);
  const productsMap = new Map(productsList.map((product) => [product.id, product]));

  const encomendasWithProducts = result.map((enc) => {
    if (enc.productId) {
      const product = productsMap.get(enc.productId);
      return {
        ...enc,
        produtoNome: product?.name || null,
        produtoMedida: product?.medida || null,
      };
    }
    return {
      ...enc,
      produtoNome: enc.nomeProduto,
      produtoMedida: enc.medidaProduto,
    };
  });

  return encomendasWithProducts;
}

export async function updateEncomenda(id: number, updates: {
  status?: string;
  dataEntrega?: Date;
  observacoes?: string;
  pedidoFeito?: boolean;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const updateData: any = {};
  if (updates.status) updateData.status = updates.status;
  if (updates.dataEntrega) updateData.dataEntrega = updates.dataEntrega;
  if (updates.observacoes !== undefined) updateData.observacoes = updates.observacoes;
  if (updates.pedidoFeito !== undefined) updateData.pedidoFeito = updates.pedidoFeito;

  await db.update(encomendas).set(updateData).where(eq(encomendas.id, id));
  
  return { success: true };
}

export async function deleteEncomenda(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(encomendas).where(eq(encomendas.id, id));
  
  return { success: true };
}


// ============ Marcas Functions ============

export async function getAllMarcas() {
  const db = await getDb();
  if (!db) return [];
  
  return await db.select().from(marcas).orderBy(marcas.nome);
}

export async function getMarcaById(id: number) {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.select().from(marcas).where(eq(marcas.id, id)).limit(1);
  return result[0] || null;
}

export async function createMarca(marca: InsertMarca) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(marcas).values(marca);
  return result;
}

export async function updateMarca(id: number, updates: Partial<InsertMarca>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(marcas).set(updates).where(eq(marcas.id, id));
  return await getMarcaById(id);
}

export async function deleteMarca(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Check if marca is in use
  const productsWithMarca = await db.select().from(products).where(eq(products.marca, (await getMarcaById(id))?.nome || "")).limit(1);
  if (productsWithMarca.length > 0) {
    throw new Error("Não é possível excluir marca em uso por produtos");
  }
  
  await db.delete(marcas).where(eq(marcas.id, id));
  return { success: true };
}
