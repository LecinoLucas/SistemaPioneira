import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { vendas } from "../../drizzle/schema";
import { isVendaTipoTransacao } from "./legacy-domain-types";

type DbConnection = ReturnType<typeof drizzle>;

type SalesListProduct = {
  id: number;
  name: string;
  medida: string;
  categoria: string;
};

export async function getVendasPaginatedFromDb(
  db: DbConnection,
  deps: { getProductsByIds: (ids: number[]) => Promise<SalesListProduct[]> },
  page: number,
  limit: number,
  tipoTransacao?: string
) {
  const offset = (page - 1) * limit;
  const conditions: SQL<unknown>[] = [];
  if (tipoTransacao) {
    if (!isVendaTipoTransacao(tipoTransacao)) {
      return { vendas: [], total: 0, totalPages: 0, currentPage: page };
    }
    conditions.push(eq(vendas.tipoTransacao, tipoTransacao));
  }

  const totalResult = conditions.length > 0
    ? await db.select({ count: sql<number>`COUNT(*)` }).from(vendas).where(and(...conditions))
    : await db.select({ count: sql<number>`COUNT(*)` }).from(vendas);
  const total = Number(totalResult[0]?.count || 0);
  const totalPages = Math.ceil(total / limit);

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
  const productsList = await deps.getProductsByIds(productIds);
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
