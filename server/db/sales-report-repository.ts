import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { vendas } from "../../drizzle/schema";

type DbConnection = ReturnType<typeof drizzle>;

type SalesProduct = {
  id: number;
  name: string;
  marca: string | null;
  medida: string;
  categoria: string;
  quantidade: number;
};

type V2OverlayProduct = {
  legacyId: number;
  name: string;
  marca: string | null;
  medida: string;
  categoria: string;
  onHand: number | null;
};

export async function getVendasByVendedorFromDb(
  db: DbConnection,
  startDate: Date,
  endDate: Date
) {
  const vendasPeriodo = await db.select().from(vendas).where(
    and(
      sql`${vendas.dataVenda} >= ${startDate}`,
      sql`${vendas.dataVenda} <= ${endDate}`,
      eq(vendas.status, "concluida")
    )
  );

  const salesByVendedor = new Map<string, { quantidade: number; vendas: number }>();
  for (const venda of vendasPeriodo) {
    const vendedorName = venda.vendedor || "Não informado";
    const current = salesByVendedor.get(vendedorName) || { quantidade: 0, vendas: 0 };
    salesByVendedor.set(vendedorName, {
      quantidade: current.quantidade + venda.quantidade,
      vendas: current.vendas + 1,
    });
  }

  return Array.from(salesByVendedor.entries())
    .map(([vendedor, stats]) => ({
      vendedor,
      quantidadeVendida: stats.quantidade,
      totalVendas: stats.vendas,
    }))
    .sort((a, b) => b.quantidadeVendida - a.quantidadeVendida);
}

export async function getVendasRelatorioFromDb(
  db: DbConnection,
  deps: {
    getProductsByIds: (ids: number[]) => Promise<SalesProduct[]>;
    getV2OverlayProductsByLegacyIds: (
      dbConn: DbConnection,
      legacyIds: number[]
    ) => Promise<Map<number, V2OverlayProduct>>;
    readMode: string;
  },
  filters: {
    startDate?: Date;
    endDate?: Date;
    vendedor?: string;
    nomeCliente?: string;
  }
) {
  const conditions: SQL<unknown>[] = [];
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

  const vendasList = await db
    .select()
    .from(vendas)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(vendas.dataVenda));

  const productIds = Array.from(new Set(vendasList.map((venda) => venda.productId)));
  const productsList = await deps.getProductsByIds(productIds);
  const productsMap = new Map(productsList.map((product) => [product.id, product]));
  const overlayMap =
    deps.readMode === "legacy"
      ? new Map<number, V2OverlayProduct>()
      : await deps.getV2OverlayProductsByLegacyIds(db, productIds);
  if (deps.readMode === "shadow" && overlayMap.size !== productIds.length) {
    console.warn("[VendasRelatorio][Shadow] Divergência de mapeamento legado->V2", {
      productIds: productIds.length,
      mapped: overlayMap.size,
    });
  }

  return vendasList.map((venda) => {
    const product = productsMap.get(venda.productId);
    const overlay = overlayMap.get(venda.productId);
    return {
      ...venda,
      productName: overlay?.name || product?.name || "Produto não encontrado",
      medida: overlay?.medida || product?.medida || "",
      categoria: overlay?.categoria || product?.categoria || "",
      marca: overlay?.marca || product?.marca || null,
    };
  });
}

export async function getRankingVendedoresFromDb(
  db: DbConnection,
  filters: { startDate?: Date; endDate?: Date }
) {
  const conditions: SQL[] = [eq(vendas.status, "concluida")];
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

export async function getRankingProdutosFromDb(
  db: DbConnection,
  deps: {
    getProductsByIds: (ids: number[]) => Promise<SalesProduct[]>;
    getV2OverlayProductsByLegacyIds: (
      dbConn: DbConnection,
      legacyIds: number[]
    ) => Promise<Map<number, V2OverlayProduct>>;
    readMode: string;
  },
  filters: { startDate?: Date; endDate?: Date }
) {
  const conditions: SQL[] = [eq(vendas.status, "concluida")];
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

  const productsList = await deps.getProductsByIds(result.map((row) => row.productId));
  const productsMap = new Map(productsList.map((product) => [product.id, product]));
  const overlayMap =
    deps.readMode === "legacy"
      ? new Map<number, V2OverlayProduct>()
      : await deps.getV2OverlayProductsByLegacyIds(
          db,
          result.map((row) => row.productId)
        );
  if (deps.readMode === "shadow" && overlayMap.size !== result.length) {
    console.warn("[RankingProdutos][Shadow] Divergência de mapeamento legado->V2", {
      productIds: result.length,
      mapped: overlayMap.size,
    });
  }

  const enrichedResult = result.map((row) => {
    const product = productsMap.get(row.productId);
    const overlay = overlayMap.get(row.productId);
    return {
      productId: row.productId,
      nome: overlay?.name || product?.name || "Produto não encontrado",
      marca: overlay?.marca || product?.marca || "-",
      medida: overlay?.medida || product?.medida || "-",
      categoria: overlay?.categoria || product?.categoria || "-",
      quantidadeTotal: Number(row.quantidadeTotal),
      totalVendas: Number(row.totalVendas),
    };
  });

  return enrichedResult.map((row, index) => ({
    posicao: index + 1,
    ...row,
  }));
}
