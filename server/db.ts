import { eq, desc, and, like, or, sql, SQL, isNotNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  InsertVenda,
  InsertEncomenda,
  users,
  products,
  InsertProduct,
  movimentacoes,
  InsertMovimentacao,
  vendas,
  historicoPrecos,
  encomendas,
  marcas,
  InsertMarca,
  userPermissions,
  importedSalesLog,
} from "../drizzle/schema";
import { ENV } from './_core/env';
import {
  cancelarVendaInDb,
  createEncomendaInDb,
  createMarcaInDb,
  deleteEncomendaInDb,
  deleteMarcaInDb,
  editarVendaInDb,
  excluirVendaInDb,
  extractRows,
  findUserById,
  findUserByOpenId,
  getAllMarcasFromDb,
  getEncomendasFromDb,
  getMarcaByIdFromDb,
  getRankingProdutosFromDb,
  getRankingVendedoresFromDb,
  getVendasByVendedorFromDb,
  getVendasPaginatedFromDb,
  getVendasRelatorioFromDb,
  isEncomendaStatus,
  listUsersByLoginMethodFromDb,
  listUsersForAdminFromDb,
  listUserPermissionsByUserIdFromDb,
  queryFirstId,
  replaceUserPermissionsFromDb,
  setUserLoginMethodByIdInDb,
  updateEncomendaInDb,
  updateMarcaInDb,
  updateUserRoleAndLoginMethodByIdInDb,
  type UserPermissionRecord,
} from "./db/index";

let _db: ReturnType<typeof drizzle> | null = null;
let _userPermissionsTableEnsured = false;
let _importedSalesTableEnsured = false;
let _salesMetadataColumnsEnsured = false;

// ─── Connection resilience ──────────────────────────────────────────────────

/**
 * Timestamp of the last failed connection attempt.
 * We use a backoff to avoid hammering the DB on repeated failures.
 */
let _lastConnectionFailureAt = 0;
const CONNECTION_RETRY_BACKOFF_MS = 5_000;

export function isConnectionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes("econnrefused") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("epipe") ||
    msg.includes("lost connection") ||
    msg.includes("gone away") ||
    msg.includes("closed state") ||
    msg.includes("connect error")
  );
}

/**
 * Clears the cached connection so the next getDb() call will reconnect.
 * Also exported so the tRPC middleware can trigger a reset on DB errors.
 */
export function resetConnection(reason: string): void {
  if (_db !== null) {
    console.warn(`[Database] Resetting connection: ${reason}`);
    _db = null;
    _userPermissionsTableEnsured = false;
    _importedSalesTableEnsured = false;
    _salesMetadataColumnsEnsured = false;
    _lastConnectionFailureAt = Date.now();
  }
}

export async function getDb() {
  // Don't hammer a DB that just failed — respect the backoff window.
  if (!_db && _lastConnectionFailureAt > 0) {
    const elapsed = Date.now() - _lastConnectionFailureAt;
    if (elapsed < CONNECTION_RETRY_BACKOFF_MS) return null;
  }

  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _lastConnectionFailureAt = Date.now();
      _db = null;
    }
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
      telefoneCliente VARCHAR(20) NULL,
      enderecoCliente VARCHAR(255) NULL,
      vendedor VARCHAR(100) NULL,
      formaPagamento VARCHAR(100) NULL,
      dataVenda TIMESTAMP NULL,
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
      KEY idx_imported_sales_cliente (nomeCliente),
      KEY idx_imported_sales_data_venda (dataVenda),
      KEY idx_imported_sales_created (createdAt)
    )
  `);

  _importedSalesTableEnsured = true;
  return db;
}

async function ensureColumn(
  db: ReturnType<typeof drizzle>,
  tableName: string,
  columnName: string,
  addColumnSql: SQL
) {
  const existsResult = await db.execute(sql`
    SELECT COUNT(*) AS count
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ${tableName}
      AND COLUMN_NAME = ${columnName}
  `);
  const existsRows = extractRows(existsResult);
  const exists = Number(existsRows[0]?.count ?? 0) > 0;
  if (!exists) {
    await db.execute(addColumnSql);
  }
}

async function ensureSalesMetadataColumns() {
  const db = await getDb();
  if (!db || _salesMetadataColumnsEnsured) return db;
  await ensureImportedSalesTable();

  await ensureColumn(
    db,
    "vendas",
    "telefoneCliente",
    sql`ALTER TABLE vendas ADD COLUMN telefoneCliente VARCHAR(20) NULL`
  );
  await ensureColumn(
    db,
    "vendas",
    "enderecoCliente",
    sql`ALTER TABLE vendas ADD COLUMN enderecoCliente VARCHAR(255) NULL`
  );
  await ensureColumn(
    db,
    "vendas",
    "formaPagamento",
    sql`ALTER TABLE vendas ADD COLUMN formaPagamento VARCHAR(100) NULL`
  );
  await ensureColumn(
    db,
    "vendas",
    "valorTotal",
    sql`ALTER TABLE vendas ADD COLUMN valorTotal DECIMAL(12,2) NULL`
  );

  await ensureColumn(
    db,
    "imported_sales_log",
    "telefoneCliente",
    sql`ALTER TABLE imported_sales_log ADD COLUMN telefoneCliente VARCHAR(20) NULL`
  );
  await ensureColumn(
    db,
    "imported_sales_log",
    "enderecoCliente",
    sql`ALTER TABLE imported_sales_log ADD COLUMN enderecoCliente VARCHAR(255) NULL`
  );
  await ensureColumn(
    db,
    "imported_sales_log",
    "vendedor",
    sql`ALTER TABLE imported_sales_log ADD COLUMN vendedor VARCHAR(100) NULL`
  );
  await ensureColumn(
    db,
    "imported_sales_log",
    "formaPagamento",
    sql`ALTER TABLE imported_sales_log ADD COLUMN formaPagamento VARCHAR(100) NULL`
  );
  await ensureColumn(
    db,
    "imported_sales_log",
    "dataVenda",
    sql`ALTER TABLE imported_sales_log ADD COLUMN dataVenda TIMESTAMP NULL`
  );

  _salesMetadataColumnsEnsured = true;
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
  return await findUserByOpenId(db, openId);
}

export async function listUsersByLoginMethod(loginMethod: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot list users by loginMethod: database not available");
    return [];
  }
  return await listUsersByLoginMethodFromDb(db, loginMethod);
}

export async function listUsersForAdmin() {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot list users for admin: database not available");
    return [];
  }
  return await listUsersForAdminFromDb(db);
}

export async function getUserById(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  return await findUserById(db, userId);
}

export async function setUserLoginMethodById(userId: number, loginMethod: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot update user loginMethod: database not available");
    return;
  }
  await setUserLoginMethodByIdInDb(db, userId, loginMethod);
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
  await updateUserRoleAndLoginMethodByIdInDb(db, userId, data);
}

export async function listUserPermissionsByUserId(userId: number): Promise<UserPermissionRecord[]> {
  const db = await ensureUserPermissionsTable();
  if (!db) return [];
  return await listUserPermissionsByUserIdFromDb(db, userId);
}

export async function replaceUserPermissions(
  userId: number,
  permissions: UserPermissionRecord[]
): Promise<void> {
  const db = await ensureUserPermissionsTable();
  if (!db) return;
  await replaceUserPermissionsFromDb(db, userId, permissions);
}

export async function findImportedSaleByFileHashOrDocument(
  fileHash: string,
  documentNumber?: string | null
) {
  await ensureSalesMetadataColumns();
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
  telefoneCliente?: string | null;
  enderecoCliente?: string | null;
  vendedor?: string | null;
  formaPagamento?: string | null;
  dataVenda?: Date | null;
  total?: number | null;
  itemsCount: number;
  userId: number | null;
  approvedByUserId?: number | null;
  approvedByEmail?: string | null;
  approvedAt?: Date | null;
  status?: "success" | "failed";
  notes?: string | null;
}) {
  await ensureSalesMetadataColumns();
  const db = await ensureImportedSalesTable();
  if (!db) throw new Error("Database not available");

  await db.insert(importedSalesLog).values({
    fileHash: data.fileHash,
    fileName: data.fileName,
    documentNumber: data.documentNumber ?? null,
    nomeCliente: data.nomeCliente ?? null,
    telefoneCliente: data.telefoneCliente ?? null,
    enderecoCliente: data.enderecoCliente ?? null,
    vendedor: data.vendedor ?? null,
    formaPagamento: data.formaPagamento ?? null,
    dataVenda: data.dataVenda ?? null,
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
  await ensureSalesMetadataColumns();
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
        sql`${importedSalesLog.nomeCliente} LIKE ${`%${search}%`}`,
        sql`${importedSalesLog.telefoneCliente} LIKE ${`%${search}%`}`,
        sql`${importedSalesLog.vendedor} LIKE ${`%${search}%`}`,
        sql`${importedSalesLog.formaPagamento} LIKE ${`%${search}%`}`
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

export async function getAllProducts(
  limit?: number,
  offset?: number,
  onlyActiveForSales?: boolean,
  includeArchived = false
) {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };

  const conditions: SQL[] = [];
  if (onlyActiveForSales) conditions.push(eq(products.ativoParaVenda, true));
  if (!includeArchived) conditions.push(eq(products.arquivado, false));
  const whereClause = conditions.length ? and(...conditions) : undefined;
  
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

export async function getSmartProducts(limit?: number, offset?: number, onlyActiveForSales?: boolean) {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };

  const conditions: SQL[] = [eq(products.arquivado, false)];
  if (onlyActiveForSales) conditions.push(eq(products.ativoParaVenda, true));
  const orderedQuery = db
    .select()
    .from(products)
    .where(and(...conditions))
    .orderBy(products.name);

  const [rows, countResult] = await Promise.all([
    limit !== undefined ? orderedQuery.limit(limit).offset(offset ?? 0) : orderedQuery,
    db
      .select({ count: sql<number>`count(*)` })
      .from(products)
      .where(
        onlyActiveForSales
          ? and(eq(products.ativoParaVenda, true), eq(products.arquivado, false))
          : eq(products.arquivado, false)
      ),
  ]);

  return {
    items: rows,
    total: Number(countResult[0]?.count ?? 0),
  };
}

export async function getProductById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(products).where(eq(products.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function findProductsByCatalogIdentity(input: {
  name: string;
  medida: string;
  marca?: string | null;
  excludeId?: number;
}) {
  const db = await getDb();
  if (!db) return [];

  const normalizedName = input.name.trim().toLowerCase();
  const normalizedMedida = input.medida.trim().toLowerCase();
  const normalizedMarca = (input.marca ?? "").trim().toLowerCase() || "sem_marca";

  if (!normalizedName || !normalizedMedida) return [];

  const conditions: SQL[] = [
    sql`LOWER(TRIM(${products.name})) = ${normalizedName}`,
    sql`LOWER(TRIM(${products.medida})) = ${normalizedMedida}`,
    sql`LOWER(TRIM(COALESCE(${products.marca}, 'SEM_MARCA'))) = ${normalizedMarca}`,
  ];

  if (input.excludeId !== undefined) {
    conditions.push(sql`${products.id} <> ${input.excludeId}`);
  }

  return await db
    .select()
    .from(products)
    .where(and(...conditions))
    .orderBy(desc(products.updatedAt), desc(products.createdAt))
    .limit(10);
}

export async function searchProducts(
  searchTerm?: string,
  medida?: string,
  categoria?: string,
  marca?: string,
  limit?: number,
  offset?: number,
  onlyActiveForSales?: boolean,
  includeArchived = false
) {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };
  
  const conditions = [];
  
  if (searchTerm) {
    conditions.push(like(products.name, `%${searchTerm}%`));
  }
  
  if (medida) {
    const normalizedMedida = medida.trim().toLowerCase();
    conditions.push(sql`LOWER(TRIM(${products.medida})) = ${normalizedMedida}`);
  }
  
  if (categoria) {
    const normalizedCategoria = categoria.trim().toLowerCase();
    conditions.push(sql`LOWER(TRIM(${products.categoria})) = ${normalizedCategoria}`);
  }
  
  if (marca) {
    conditions.push(eq(products.marca, marca));
  }

  if (onlyActiveForSales) {
    conditions.push(eq(products.ativoParaVenda, true));
  }

  if (!includeArchived) {
    conditions.push(eq(products.arquivado, false));
  }
  
  if (conditions.length === 0) {
    return await getAllProducts(limit, offset, onlyActiveForSales, includeArchived);
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

export async function countLegacyProductsDistinctCatalogKey(input?: {
  searchTerm?: string;
  medida?: string;
  categoria?: string;
  marca?: string;
  onlyActiveForSales?: boolean;
  includeArchived?: boolean;
}) {
  const db = await getDb();
  if (!db) return 0;

  const conditions = [];
  const searchTerm = input?.searchTerm?.trim();
  const medida = input?.medida?.trim();
  const categoria = input?.categoria?.trim();
  const marca = input?.marca?.trim();

  if (searchTerm) {
    conditions.push(like(products.name, `%${searchTerm}%`));
  }
  if (medida) {
    const normalizedMedida = medida.trim().toLowerCase();
    conditions.push(sql`LOWER(TRIM(${products.medida})) = ${normalizedMedida}`);
  }
  if (categoria) {
    const normalizedCategoria = categoria.trim().toLowerCase();
    conditions.push(sql`LOWER(TRIM(${products.categoria})) = ${normalizedCategoria}`);
  }
  if (marca) {
    conditions.push(eq(products.marca, marca));
  }
  if (input?.onlyActiveForSales) {
    conditions.push(eq(products.ativoParaVenda, true));
  }
  if (!input?.includeArchived) {
    conditions.push(eq(products.arquivado, false));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const keyExpr = sql`CONCAT(
    LOWER(TRIM(${products.name})),
    '||',
    LOWER(TRIM(COALESCE(${products.marca}, 'SEM_MARCA'))),
    '||',
    LOWER(TRIM(${products.medida})),
    '||',
    LOWER(TRIM(${products.categoria}))
  )`;

  const query = db
    .select({
      count: sql<number>`COUNT(DISTINCT ${keyExpr})`,
    })
    .from(products);

  const rows = whereClause ? await query.where(whereClause) : await query;
  return Number(rows[0]?.count ?? 0);
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

  const inserted = await db.transaction(async (tx) => {
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

  return inserted;
}

export async function updateProduct(id: number, product: Partial<InsertProduct>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const before = await db.select().from(products).where(eq(products.id, id)).limit(1);
  const beforeProduct = before[0];
  await db.update(products).set(product).where(eq(products.id, id));

  if (!beforeProduct) return;
}

export async function deleteProduct(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const beforeDelete = await db.select().from(products).where(eq(products.id, id)).limit(1);
  const deletedSnapshot = beforeDelete[0];

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

  void deletedSnapshot;
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
  await ensureSalesMetadataColumns();
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(vendas).values(venda);
}

export async function getVendaById(id: number) {
  await ensureSalesMetadataColumns();
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
  telefoneCliente?: string;
  enderecoCliente?: string;
  formaPagamento?: string;
  valorTotal?: number;
  observacoes?: string;
  tipoTransacao: "venda" | "troca" | "brinde" | "emprestimo" | "permuta";
  userId: number | null;
  observacaoMovimentacao: string;
}) {
  await ensureSalesMetadataColumns();
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const lowStockAlerts: {
    productId: number;
    name: string;
    medida: string;
    novaQuantidade: number;
    estoqueMinimo: number;
  }[] = [];
  const movementEvents: Array<{
    productId: number;
    quantidade: number;
    beforeQty: number;
    afterQty: number;
  }> = [];

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

      const isSellable =
        product.ativoParaVenda === undefined || product.ativoParaVenda === null
          ? true
          : Number(product.ativoParaVenda as unknown as number) === 1 || product.ativoParaVenda === true;
      if (!isSellable) {
        throw new Error(`O produto "${product.name}" está inativo para novas vendas.`);
      }

      const isArchived =
        product.arquivado === undefined || product.arquivado === null
          ? false
          : Number(product.arquivado as unknown as number) === 1 || product.arquivado === true;
      if (isArchived) {
        throw new Error(`O produto "${product.name}" está arquivado e não pode ser vendido.`);
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
        telefoneCliente: data.telefoneCliente,
        enderecoCliente: data.enderecoCliente,
        formaPagamento: data.formaPagamento,
        valorTotal: data.valorTotal != null ? data.valorTotal.toFixed(2) : null,
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

      movementEvents.push({
        productId: item.productId,
        quantidade: item.quantidade,
        beforeQty: Number(product.quantidade),
        afterQty: Number(novaQuantidade),
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
  await ensureSalesMetadataColumns();
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

  const getLegacyStats = async () => {
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
  };

  return await getLegacyStats();
}

export async function getTopSellingProducts(startDate: Date, endDate: Date, limit: number = 5) {
  await ensureSalesMetadataColumns();
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
  await ensureSalesMetadataColumns();
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
  await ensureSalesMetadataColumns();
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
  await ensureSalesMetadataColumns();
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
  await ensureSalesMetadataColumns();
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
  await ensureSalesMetadataColumns();
  const db = await getDb();
  if (!db) return { vendas: [], total: 0, totalPages: 0, currentPage: page };
  return await getVendasPaginatedFromDb(
    db,
    { getProductsByIds },
    page,
    limit,
    tipoTransacao
  );
}

export async function cancelarVenda(vendaId: number, motivo: string, userId: number) {
  await ensureSalesMetadataColumns();
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const movementEvent = await cancelarVendaInDb(db, vendaId, motivo, userId);

  void movementEvent;
  
  return { success: true };
}

export async function excluirVenda(vendaId: number, userId: number) {
  await ensureSalesMetadataColumns();
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const movementEvent = await excluirVendaInDb(db, vendaId, userId);

  void movementEvent;
  
  return { success: true };
}

export async function getVendasByVendedor(startDate: Date, endDate: Date) {
  await ensureSalesMetadataColumns();
  const db = await getDb();
  if (!db) return [];
  return await getVendasByVendedorFromDb(db, startDate, endDate);
}

export async function getVendasRelatorio(filters: {
  startDate?: Date;
  endDate?: Date;
  vendedor?: string;
  nomeCliente?: string;
}) {
  await ensureSalesMetadataColumns();
  const db = await getDb();
  if (!db) return [];
  return await getVendasRelatorioFromDb(
    db,
    {
      getProductsByIds,
    },
    filters
  );
}

export async function getEncomendasRelatorio(filters: {
  nomeCliente?: string;
}) {
  await ensureSalesMetadataColumns();
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
      const estoqueAtual = product?.quantidade ?? 0;
      if (!product || estoqueAtual >= 0) return null;
      return {
        ...venda,
        productName: product.name,
        medida: product.medida,
        categoria: product.categoria,
        marca: product.marca || null,
        estoqueAtual,
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
  await ensureSalesMetadataColumns();
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const movementEvent = await editarVendaInDb(db, vendaId, updates, userId);

  void movementEvent;
  
  return { success: true };
}

// ============ Ranking Functions ============

export async function getRankingVendedores(filters: {
  startDate?: Date;
  endDate?: Date;
}) {
  const db = await getDb();
  if (!db) return [];
  return await getRankingVendedoresFromDb(db, filters);
}

export async function getRankingProdutos(filters: {
  startDate?: Date;
  endDate?: Date;
}) {
  const db = await getDb();
  if (!db) return [];
  return await getRankingProdutosFromDb(
    db,
    {
      getProductsByIds,
    },
    filters
  );
}

export async function getProductsByIds(ids: number[], includeArchived = true) {
  const db = await getDb();
  if (!db) return [];
  if (ids.length === 0) return [];
  
  const baseCondition = sql`${products.id} IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})`;
  const whereClause = includeArchived ? baseCondition : and(baseCondition, eq(products.arquivado, false));

  return await db
    .select()
    .from(products)
    .where(whereClause)
    .orderBy(products.name);
}

export async function getProductsFiltered(
  filters: { search?: string; medida?: string; categoria?: string; marca?: string },
  includeArchived = false
) {
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

  if (!includeArchived) {
    conditions.push(eq(products.arquivado, false));
  }
  
  if (conditions.length > 0) {
    return await db.select().from(products).where(and(...conditions)).orderBy(products.name);
  }

  return await db.select().from(products).orderBy(products.name);
}

// ========== Encomendas Functions ==========

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
  await createEncomendaInDb(db, data);
  return { success: true };
}

export async function getEncomendas(status?: string, cliente?: string) {
  const db = await getDb();
  if (!db) return [];
  return await getEncomendasFromDb(db, { getProductsByIds }, status, cliente);
}

export async function updateEncomenda(id: number, updates: {
  status?: string;
  dataEntrega?: Date;
  observacoes?: string;
  pedidoFeito?: boolean;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await updateEncomendaInDb(db, id, updates);
  return { success: true };
}

export async function deleteEncomenda(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await deleteEncomendaInDb(db, id);
  return { success: true };
}


// ============ Marcas Functions ============

export async function getAllMarcas() {
  const db = await getDb();
  if (!db) return [];
  return await getAllMarcasFromDb(db);
}

export async function getMarcaById(id: number) {
  const db = await getDb();
  if (!db) return null;
  return await getMarcaByIdFromDb(db, id);
}

export async function createMarca(marca: InsertMarca) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await createMarcaInDb(db, marca);
}

export async function updateMarca(id: number, updates: Partial<InsertMarca>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await updateMarcaInDb(db, id, updates);
  return await getMarcaById(id);
}

export async function deleteMarca(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await deleteMarcaInDb(db, id);
  return { success: true };
}

// ============ Catálogo Functions ============

export type CatalogItem = { id: number; nome: string };
export type CatalogPaymentMethodItem = {
  id: number;
  codigo: string;
  nome: string;
  categoria: string;
};
export type CatalogSellerItem = {
  id: number;
  nome: string;
};
export type CatalogModelItem = {
  id: number;
  nome: string;
  brandId: number;
  productTypeId: number;
  brandNome: string;
  productTypeNome: string;
};

function normalizeCatalogName(value: string) {
  return value.trim();
}

function normalizeCatalogProductTypeName(value: string) {
  return value.trim().toLocaleUpperCase("pt-BR");
}

function normalizeCatalogBrandName(value: string) {
  return value.trim().toLocaleUpperCase("pt-BR");
}

function normalizeCatalogMeasureName(value: string) {
  return value.trim().toLocaleUpperCase("pt-BR");
}

function normalizeCatalogModelName(value: string) {
  return value.trim().toLocaleUpperCase("pt-BR");
}

function normalizeCatalogPaymentMethodName(value: string) {
  return value.trim().toLocaleUpperCase("pt-BR");
}

function normalizeCatalogSellerName(value: string) {
  return value.trim().toLocaleUpperCase("pt-BR");
}

async function ensureCatalogPaymentMethodsTable() {
  const db = await getDb();
  if (!db) return null;

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS catalog_payment_methods (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(80) NOT NULL UNIQUE,
      name VARCHAR(120) NOT NULL,
      category VARCHAR(60) NOT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_catalog_payment_name (name)
    )
  `);

  await db.execute(sql`
    INSERT INTO catalog_payment_methods (code, name, category)
    VALUES
      ('PIX', 'PIX', 'Instantâneo'),
      ('RECEBER_NA_ENTREGA', 'RECEBER NA ENTREGA', 'Entrega'),
      ('DINHEIRO', 'DINHEIRO', 'Dinheiro'),
      ('CARTAO_CREDITO', 'CARTÃO DE CRÉDITO', 'Cartão'),
      ('CARTAO_DEBITO', 'CARTÃO DE DÉBITO', 'Cartão'),
      ('BOLETO', 'BOLETO', 'Boleto'),
      ('TRANSFERENCIA', 'TRANSFERÊNCIA', 'Transferência'),
      ('MULTIPLO', 'MÚLTIPLO (2+ formas)', 'Combinado'),
      ('OUTROS', 'OUTROS', 'Outros')
    ON DUPLICATE KEY UPDATE
      name = VALUES(name),
      category = VALUES(category),
      is_active = 1
  `);

  return db;
}

async function ensureCatalogSellersTable() {
  const db = await getDb();
  if (!db) return null;

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS catalog_sellers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL UNIQUE,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await db.execute(sql`
    INSERT INTO catalog_sellers (name)
    VALUES
      ('Cleonice'),
      ('Luciano'),
      ('Vanuza'),
      ('Thuanny')
    ON DUPLICATE KEY UPDATE
      is_active = 1
  `);

  return db;
}

async function listCatalogItems(tableName: "catalog_brands" | "catalog_measures" | "catalog_product_types") {
  const db = await getDb();
  if (!db) return [] as CatalogItem[];

  let query: ReturnType<typeof sql>;
  if (tableName === "catalog_brands") {
    query = sql`SELECT id, name AS nome FROM catalog_brands ORDER BY name ASC`;
  } else if (tableName === "catalog_measures") {
    query = sql`SELECT id, description AS nome FROM catalog_measures ORDER BY description ASC`;
  } else {
    query = sql`SELECT id, name AS nome FROM catalog_product_types ORDER BY name ASC`;
  }

  const result = await db.execute(query);
  const rows = extractRows(result);
  return rows.map((row) => ({ id: Number(row.id), nome: String(row.nome ?? "") }));
}

async function createCatalogItem(
  tableName: "catalog_brands" | "catalog_measures" | "catalog_product_types",
  nome: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const normalized = normalizeCatalogName(nome);
  if (!normalized) throw new Error("Nome é obrigatório");

  if (tableName === "catalog_brands") {
    const normalizedBrand = normalizeCatalogBrandName(nome);
    await db.execute(sql`
      INSERT INTO catalog_brands (name)
      VALUES (${normalizedBrand})
      ON DUPLICATE KEY UPDATE name = VALUES(name)
    `);
    const id = await queryFirstId(db, sql`SELECT id FROM catalog_brands WHERE name = ${normalizedBrand} LIMIT 1`, "id");
    return { id, nome: normalizedBrand };
  }

  if (tableName === "catalog_measures") {
    const normalizedMeasure = normalizeCatalogMeasureName(nome);
    await db.execute(sql`
      INSERT INTO catalog_measures (code, description)
      VALUES (${normalizedMeasure}, ${normalizedMeasure})
      ON DUPLICATE KEY UPDATE description = VALUES(description)
    `);
    const id = await queryFirstId(
      db,
      sql`SELECT id FROM catalog_measures WHERE description = ${normalizedMeasure} LIMIT 1`,
      "id"
    );
    return { id, nome: normalizedMeasure };
  }

  const normalizedType = normalizeCatalogProductTypeName(nome);
  await db.execute(sql`
    INSERT INTO catalog_product_types (code, name)
    VALUES (${normalizedType}, ${normalizedType})
    ON DUPLICATE KEY UPDATE name = VALUES(name)
  `);
  const id = await queryFirstId(
    db,
    sql`SELECT id FROM catalog_product_types WHERE name = ${normalizedType} LIMIT 1`,
    "id"
  );
  return { id, nome: normalizedType };
}

async function updateCatalogItem(
  tableName: "catalog_brands" | "catalog_measures" | "catalog_product_types",
  id: number,
  nome: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const normalized = normalizeCatalogName(nome);
  if (!normalized) throw new Error("Nome é obrigatório");

  if (tableName === "catalog_brands") {
    const normalizedBrand = normalizeCatalogBrandName(nome);
    await db.execute(sql`UPDATE catalog_brands SET name = ${normalizedBrand} WHERE id = ${id}`);
    return { id, nome: normalizedBrand };
  }

  if (tableName === "catalog_measures") {
    const normalizedMeasure = normalizeCatalogMeasureName(nome);
    await db.execute(sql`UPDATE catalog_measures SET description = ${normalizedMeasure}, code = ${normalizedMeasure} WHERE id = ${id}`);
    return { id, nome: normalizedMeasure };
  }

  const normalizedType = normalizeCatalogProductTypeName(nome);
  await db.execute(sql`UPDATE catalog_product_types SET name = ${normalizedType}, code = ${normalizedType} WHERE id = ${id}`);
  return { id, nome: normalizedType };
}

async function deleteCatalogItem(
  tableName: "catalog_brands" | "catalog_measures" | "catalog_product_types",
  id: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const getCount = async (query: ReturnType<typeof sql>, field = "count") => {
    const result = await db.execute(query);
    const rows = extractRows(result);
    return Number(rows[0]?.[field] ?? 0);
  };

  if (tableName === "catalog_brands") {
    const brandResult = await db.execute(sql`SELECT name FROM catalog_brands WHERE id = ${id} LIMIT 1`);
    const brandRows = extractRows(brandResult);
    const brandName = String(brandRows[0]?.name ?? "").trim();
    const productsUsing = brandName
      ? await getCount(
          sql`
            SELECT COUNT(*) AS count
            FROM products
            WHERE COALESCE(arquivado, 0) = 0
              AND TRIM(COALESCE(NULLIF(marca, ''), 'SEM_MARCA')) = ${brandName}
          `
        )
      : 0;
    if (productsUsing > 0) {
      throw new Error(`Não é possível excluir: esta marca está vinculada a ${productsUsing} produto(s).`);
    }

    const modelsUsing = await getCount(sql`SELECT COUNT(*) AS count FROM catalog_models WHERE brand_id = ${id}`);
    if (modelsUsing > 0) {
      throw new Error(`Não é possível excluir: esta marca está vinculada a ${modelsUsing} modelo(s) do catálogo.`);
    }

    await db.execute(sql`DELETE FROM catalog_brands WHERE id = ${id}`);
  } else if (tableName === "catalog_measures") {
    const measureResult = await db.execute(sql`SELECT description FROM catalog_measures WHERE id = ${id} LIMIT 1`);
    const measureRows = extractRows(measureResult);
    const measureName = String(measureRows[0]?.description ?? "").trim();
    const productsUsing = measureName
      ? await getCount(
          sql`
            SELECT COUNT(*) AS count
            FROM products
            WHERE COALESCE(arquivado, 0) = 0
              AND LOWER(TRIM(medida)) = ${measureName.toLowerCase()}
          `
        )
      : 0;
    if (productsUsing > 0) {
      throw new Error(`Não é possível excluir: esta medida está vinculada a ${productsUsing} produto(s).`);
    }

    await db.execute(sql`DELETE FROM catalog_measures WHERE id = ${id}`);
  } else {
    const productTypeResult = await db.execute(sql`SELECT name FROM catalog_product_types WHERE id = ${id} LIMIT 1`);
    const productTypeRows = extractRows(productTypeResult);
    const productTypeName = String(productTypeRows[0]?.name ?? "").trim();
    const productsUsing = productTypeName
      ? await getCount(
          sql`
            SELECT COUNT(*) AS count
            FROM products
            WHERE COALESCE(arquivado, 0) = 0
              AND TRIM(categoria) = ${productTypeName}
          `
        )
      : 0;
    if (productsUsing > 0) {
      throw new Error(`Não é possível excluir: este tipo está vinculado a ${productsUsing} produto(s).`);
    }

    const modelsUsing = await getCount(
      sql`SELECT COUNT(*) AS count FROM catalog_models WHERE product_type_id = ${id}`
    );
    if (modelsUsing > 0) {
      throw new Error(`Não é possível excluir: este tipo está vinculado a ${modelsUsing} modelo(s) do catálogo.`);
    }

    await db.execute(sql`DELETE FROM catalog_product_types WHERE id = ${id}`);
  }

  return { success: true };
}

export async function getAllCatalogBrands() {
  return listCatalogItems("catalog_brands");
}

export async function createCatalogBrand(input: { nome: string }) {
  return createCatalogItem("catalog_brands", input.nome);
}

export async function updateCatalogBrand(id: number, input: { nome: string }) {
  return updateCatalogItem("catalog_brands", id, input.nome);
}

export async function deleteCatalogBrand(id: number) {
  return deleteCatalogItem("catalog_brands", id);
}

export async function getAllCatalogMeasures() {
  return listCatalogItems("catalog_measures");
}

export async function createCatalogMeasure(input: { nome: string }) {
  return createCatalogItem("catalog_measures", input.nome);
}

export async function updateCatalogMeasure(id: number, input: { nome: string }) {
  return updateCatalogItem("catalog_measures", id, input.nome);
}

export async function deleteCatalogMeasure(id: number) {
  return deleteCatalogItem("catalog_measures", id);
}

export async function getAllCatalogProductTypes() {
  return listCatalogItems("catalog_product_types");
}

export async function createCatalogProductType(input: { nome: string }) {
  return createCatalogItem("catalog_product_types", input.nome);
}

export async function updateCatalogProductType(id: number, input: { nome: string }) {
  return updateCatalogItem("catalog_product_types", id, input.nome);
}

export async function deleteCatalogProductType(id: number) {
  return deleteCatalogItem("catalog_product_types", id);
}

export async function getAllCatalogModels() {
  const db = await getDb();
  if (!db) return [] as CatalogModelItem[];

  const result = await db.execute(sql`
    SELECT
      cm.id,
      cm.name AS nome,
      cm.brand_id AS brandId,
      cm.product_type_id AS productTypeId,
      cb.name AS brandNome,
      cpt.name AS productTypeNome
    FROM catalog_models cm
    INNER JOIN catalog_brands cb ON cb.id = cm.brand_id
    INNER JOIN catalog_product_types cpt ON cpt.id = cm.product_type_id
    ORDER BY cb.name ASC, cpt.name ASC, cm.name ASC
  `);
  const rows = extractRows(result);
  return rows.map((row) => ({
    id: Number(row.id),
    nome: String(row.nome ?? ""),
    brandId: Number(row.brandId),
    productTypeId: Number(row.productTypeId),
    brandNome: String(row.brandNome ?? ""),
    productTypeNome: String(row.productTypeNome ?? ""),
  }));
}

export async function createCatalogModel(input: {
  nome: string;
  brandId: number;
  productTypeId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const normalized = normalizeCatalogModelName(input.nome);
  if (!normalized) throw new Error("Nome é obrigatório");

  await db.execute(sql`
    INSERT INTO catalog_models (brand_id, product_type_id, name, code)
    VALUES (${input.brandId}, ${input.productTypeId}, ${normalized}, NULL)
    ON DUPLICATE KEY UPDATE name = VALUES(name), is_active = 1
  `);

  const id = await queryFirstId(
    db,
    sql`
      SELECT id FROM catalog_models
      WHERE brand_id = ${input.brandId}
        AND product_type_id = ${input.productTypeId}
        AND name = ${normalized}
      LIMIT 1
    `,
    "id"
  );

  if (!id) throw new Error("Não foi possível criar o modelo.");
  return { id, nome: normalized };
}

export async function updateCatalogModel(
  id: number,
  input: { nome: string; brandId: number; productTypeId: number }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const normalized = normalizeCatalogModelName(input.nome);
  if (!normalized) throw new Error("Nome é obrigatório");

  await db.execute(sql`
    UPDATE catalog_models
    SET
      name = ${normalized},
      brand_id = ${input.brandId},
      product_type_id = ${input.productTypeId},
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ${id}
  `);

  return { id, nome: normalized };
}

export async function deleteCatalogModel(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.execute(sql`
    SELECT COUNT(*) AS count
    FROM catalog_models cm
    INNER JOIN catalog_brands cb ON cb.id = cm.brand_id
    INNER JOIN catalog_product_types cpt ON cpt.id = cm.product_type_id
    INNER JOIN products p
      ON TRIM(p.name) = cm.name
     AND TRIM(COALESCE(NULLIF(p.marca, ''), 'SEM_MARCA')) = cb.name
     AND TRIM(p.categoria) = cpt.name
    WHERE cm.id = ${id}
      AND COALESCE(p.arquivado, 0) = 0
  `);
  const rows = extractRows(result);
  const productsUsing = Number(rows[0]?.count ?? 0);
  if (productsUsing > 0) {
    throw new Error(`Não é possível excluir: este modelo está vinculado a ${productsUsing} produto(s).`);
  }

  await db.execute(sql`DELETE FROM catalog_models WHERE id = ${id}`);
  return { success: true };
}

export async function syncCatalogFromLegacyProducts() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 1) Marcas
  await db.execute(sql`
    INSERT INTO catalog_brands (name)
    SELECT DISTINCT TRIM(COALESCE(NULLIF(marca, ''), 'SEM_MARCA')) AS nome
    FROM products
    WHERE TRIM(COALESCE(marca, '')) <> '' OR marca IS NULL
    ON DUPLICATE KEY UPDATE
      name = VALUES(name),
      is_active = 1
  `);

  // 2) Medidas
  await db.execute(sql`
    INSERT INTO catalog_measures (code, description)
    SELECT DISTINCT TRIM(medida) AS code, TRIM(medida) AS description
    FROM products
    WHERE TRIM(COALESCE(medida, '')) <> ''
    ON DUPLICATE KEY UPDATE
      description = VALUES(description),
      is_active = 1
  `);

  // 3) Tipos
  await db.execute(sql`
    INSERT INTO catalog_product_types (code, name)
    SELECT DISTINCT TRIM(categoria) AS code, TRIM(categoria) AS name
    FROM products
    WHERE TRIM(COALESCE(categoria, '')) <> ''
    ON DUPLICATE KEY UPDATE
      name = VALUES(name),
      is_active = 1
  `);

  // 4) Modelos (nome do produto + marca + tipo)
  await db.execute(sql`
    INSERT INTO catalog_models (brand_id, product_type_id, name, code)
    SELECT
      cb.id AS brand_id,
      cpt.id AS product_type_id,
      TRIM(p.name) AS name,
      NULL AS code
    FROM products p
    INNER JOIN catalog_brands cb
      ON cb.name = TRIM(COALESCE(NULLIF(p.marca, ''), 'SEM_MARCA'))
    INNER JOIN catalog_product_types cpt
      ON cpt.name = TRIM(p.categoria)
    WHERE TRIM(COALESCE(p.name, '')) <> ''
    GROUP BY cb.id, cpt.id, TRIM(p.name)
    ON DUPLICATE KEY UPDATE
      name = VALUES(name),
      is_active = 1
  `);

  const countsResult = await db.execute(sql`
    SELECT
      (SELECT COUNT(*) FROM catalog_brands) AS brandsCount,
      (SELECT COUNT(*) FROM catalog_measures) AS measuresCount,
      (SELECT COUNT(*) FROM catalog_product_types) AS typesCount,
      (SELECT COUNT(*) FROM catalog_models) AS modelsCount
  `);
  const rows = extractRows(countsResult);
  const row = rows[0] ?? {};

  return {
    brandsCount: Number(row.brandsCount ?? 0),
    measuresCount: Number(row.measuresCount ?? 0),
    typesCount: Number(row.typesCount ?? 0),
    modelsCount: Number(row.modelsCount ?? 0),
  };
}

export async function getAllCatalogPaymentMethods() {
  const db = await ensureCatalogPaymentMethodsTable();
  if (!db) return [] as CatalogPaymentMethodItem[];

  const result = await db.execute(sql`
    SELECT id, code AS codigo, name AS nome, category AS categoria
    FROM catalog_payment_methods
    WHERE is_active = 1
    ORDER BY name ASC
  `);
  const rows = extractRows(result);
  return rows.map((row) => ({
    id: Number(row.id),
    codigo: String(row.codigo ?? ""),
    nome: String(row.nome ?? ""),
    categoria: String(row.categoria ?? ""),
  }));
}

export async function findActiveCatalogPaymentMethodByNameOrCode(
  value: string
): Promise<CatalogPaymentMethodItem | null> {
  const db = await ensureCatalogPaymentMethodsTable();
  if (!db) return null;

  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;

  const result = await db.execute(sql`
    SELECT id, code AS codigo, name AS nome, category AS categoria
    FROM catalog_payment_methods
    WHERE is_active = 1
      AND (
        LOWER(TRIM(name)) = ${normalized}
        OR LOWER(TRIM(code)) = ${normalized}
      )
    LIMIT 1
  `);
  const rows = extractRows(result);
  if (!rows.length) return null;

  const row = rows[0]!;
  return {
    id: Number(row.id),
    codigo: String(row.codigo ?? ""),
    nome: String(row.nome ?? ""),
    categoria: String(row.categoria ?? ""),
  };
}

function normalizePaymentMethodLookup(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toPaymentMethodCodePart(value: string): string {
  return value
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

function buildCatalogPaymentMethodCode(nome: string, categoria: string): string {
  const normalizedName = normalizePaymentMethodLookup(nome);
  const normalizedCategory = normalizePaymentMethodLookup(categoria);

  if (!normalizedName) return "PAGAMENTO";
  if (normalizedName === "pix") return "PIX";
  if (normalizedName.includes("receber na entrega")) return "RECEBER_NA_ENTREGA";
  if (normalizedName.includes("boleto")) return "BOLETO";
  if (normalizedName.includes("transferencia") || normalizedName.includes("ted") || normalizedName.includes("doc")) {
    return "TRANSFERENCIA";
  }
  if (normalizedName.includes("dinheiro") || normalizedName.includes("especie")) return "DINHEIRO";
  if (normalizedName.includes("multiplo") || normalizedName.includes("misto") || normalizedName.includes("combinado")) {
    return "MULTIPLO";
  }

  if (normalizedName.includes("cartao") && normalizedName.includes("credito")) {
    const suffix = toPaymentMethodCodePart(
      normalizedName
        .replace(/\bcartao\b/g, " ")
        .replace(/\bde\b/g, " ")
        .replace(/\bcredito\b/g, " ")
        .trim()
    );
    return suffix ? `CARTAO_CREDITO_${suffix}` : "CARTAO_CREDITO";
  }

  if (normalizedName.includes("cartao") && normalizedName.includes("debito")) {
    const suffix = toPaymentMethodCodePart(
      normalizedName
        .replace(/\bcartao\b/g, " ")
        .replace(/\bde\b/g, " ")
        .replace(/\bdebito\b/g, " ")
        .trim()
    );
    return suffix ? `CARTAO_DEBITO_${suffix}` : "CARTAO_DEBITO";
  }

  const categoryCode = toPaymentMethodCodePart(normalizedCategory);
  const nameCode = toPaymentMethodCodePart(nome);
  if (!categoryCode) return nameCode || "PAGAMENTO";
  if (!nameCode || nameCode === categoryCode) return categoryCode;

  const mergedTokens = Array.from(
    new Set(`${categoryCode}_${nameCode}`.split("_").filter(Boolean))
  );
  return mergedTokens.join("_").slice(0, 80) || "PAGAMENTO";
}

export async function createCatalogPaymentMethod(input: { codigo?: string; nome: string; categoria: string }) {
  const db = await ensureCatalogPaymentMethodsTable();
  if (!db) throw new Error("Database not available");

  const nome = normalizeCatalogPaymentMethodName(input.nome);
  const categoria = input.categoria.trim();
  const codigo = (input.codigo?.trim().toUpperCase() || buildCatalogPaymentMethodCode(nome, categoria)).slice(0, 80);
  if (!codigo || !nome || !categoria) throw new Error("Nome e categoria são obrigatórios.");

  const existing = await findActiveCatalogPaymentMethodByNameOrCode(nome);
  if (existing) {
    throw new Error("Já existe uma forma de pagamento cadastrada com esse nome ou código.");
  }

  await db.execute(sql`
    INSERT INTO catalog_payment_methods (code, name, category)
    VALUES (${codigo}, ${nome}, ${categoria})
    ON DUPLICATE KEY UPDATE
      name = VALUES(name),
      category = VALUES(category),
      is_active = 1
  `);

  const id = await queryFirstId(
    db,
    sql`SELECT id FROM catalog_payment_methods WHERE code = ${codigo} LIMIT 1`,
    "id"
  );
  return { id, codigo, nome, categoria };
}

export async function updateCatalogPaymentMethod(
  id: number,
  input: { codigo?: string; nome: string; categoria: string }
) {
  const db = await ensureCatalogPaymentMethodsTable();
  if (!db) throw new Error("Database not available");

  const nome = normalizeCatalogPaymentMethodName(input.nome);
  const categoria = input.categoria.trim();
  if (!nome || !categoria) throw new Error("Nome e categoria são obrigatórios.");

  const existing = await findActiveCatalogPaymentMethodByNameOrCode(nome);
  if (existing && existing.id !== id) {
    throw new Error("Já existe uma forma de pagamento cadastrada com esse nome ou código.");
  }

  const codigo = input.codigo?.trim().toUpperCase();
  if (codigo) {
    await db.execute(sql`
      UPDATE catalog_payment_methods
      SET code = ${codigo}, name = ${nome}, category = ${categoria}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
    `);
  } else {
    await db.execute(sql`
      UPDATE catalog_payment_methods
      SET name = ${nome}, category = ${categoria}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
    `);
  }

  const currentResult = await db.execute(sql`
    SELECT code AS codigo
    FROM catalog_payment_methods
    WHERE id = ${id}
    LIMIT 1
  `);
  const currentRows = extractRows(currentResult);
  const currentRow = currentRows[0];

  return { id, codigo: String(currentRow?.codigo ?? codigo ?? ""), nome, categoria };
}

export async function deleteCatalogPaymentMethod(id: number) {
  const db = await ensureCatalogPaymentMethodsTable();
  if (!db) throw new Error("Database not available");

  await db.execute(sql`
    UPDATE catalog_payment_methods
    SET is_active = 0, updated_at = CURRENT_TIMESTAMP
    WHERE id = ${id}
  `);
  return { success: true };
}

export async function getAllCatalogSellers() {
  const db = await ensureCatalogSellersTable();
  if (!db) return [] as CatalogSellerItem[];

  const result = await db.execute(sql`
    SELECT id, name AS nome
    FROM catalog_sellers
    WHERE is_active = 1
    ORDER BY name ASC
  `);
  const rows = extractRows(result);
  return rows.map((row) => ({
    id: Number(row.id),
    nome: String(row.nome ?? ""),
  }));
}

export async function findActiveCatalogBrandByName(value: string): Promise<CatalogItem | null> {
  const db = await getDb();
  if (!db) return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  const result = await db.execute(sql`
    SELECT id, name AS nome
    FROM catalog_brands
    WHERE is_active = 1
      AND LOWER(TRIM(name)) = ${normalized}
    LIMIT 1
  `);
  const rows = extractRows(result);
  if (!rows.length) return null;
  return { id: Number(rows[0]!.id), nome: String(rows[0]!.nome ?? "") };
}

export async function findActiveCatalogMeasureByName(value: string): Promise<CatalogItem | null> {
  const db = await getDb();
  if (!db) return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  const result = await db.execute(sql`
    SELECT id, description AS nome
    FROM catalog_measures
    WHERE is_active = 1
      AND (
        LOWER(TRIM(description)) = ${normalized}
        OR LOWER(TRIM(code)) = ${normalized}
      )
    LIMIT 1
  `);
  const rows = extractRows(result);
  if (!rows.length) return null;
  return { id: Number(rows[0]!.id), nome: String(rows[0]!.nome ?? "") };
}

export async function findActiveCatalogProductTypeByName(value: string): Promise<CatalogItem | null> {
  const db = await getDb();
  if (!db) return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  const result = await db.execute(sql`
    SELECT id, name AS nome
    FROM catalog_product_types
    WHERE is_active = 1
      AND (
        LOWER(TRIM(name)) = ${normalized}
        OR LOWER(TRIM(code)) = ${normalized}
      )
    LIMIT 1
  `);
  const rows = extractRows(result);
  if (!rows.length) return null;
  return { id: Number(rows[0]!.id), nome: String(rows[0]!.nome ?? "") };
}

export async function createCatalogSeller(input: { nome: string }) {
  const db = await ensureCatalogSellersTable();
  if (!db) throw new Error("Database not available");

  const nome = normalizeCatalogSellerName(input.nome);
  if (!nome) throw new Error("Nome é obrigatório.");

  await db.execute(sql`
    INSERT INTO catalog_sellers (name)
    VALUES (${nome})
    ON DUPLICATE KEY UPDATE
      is_active = 1
  `);

  const id = await queryFirstId(
    db,
    sql`SELECT id FROM catalog_sellers WHERE name = ${nome} LIMIT 1`,
    "id"
  );
  return { id, nome };
}

export async function updateCatalogSeller(id: number, input: { nome: string }) {
  const db = await ensureCatalogSellersTable();
  if (!db) throw new Error("Database not available");

  const nome = normalizeCatalogSellerName(input.nome);
  if (!nome) throw new Error("Nome é obrigatório.");

  await db.execute(sql`
    UPDATE catalog_sellers
    SET name = ${nome}, updated_at = CURRENT_TIMESTAMP
    WHERE id = ${id}
  `);

  return { id, nome };
}

export async function deleteCatalogSeller(id: number) {
  const db = await ensureCatalogSellersTable();
  if (!db) throw new Error("Database not available");

  await db.execute(sql`
    UPDATE catalog_sellers
    SET is_active = 0, updated_at = CURRENT_TIMESTAMP
    WHERE id = ${id}
  `);
  return { success: true };
}
