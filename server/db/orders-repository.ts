import { and, desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { encomendas, type InsertEncomenda } from "../../drizzle/schema";
import { isEncomendaStatus } from "./legacy-domain-types";

type DbConnection = ReturnType<typeof drizzle>;

type OrderProduct = {
  id: number;
  name: string;
  medida: string;
};

type CreateEncomendaInput = {
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
};

function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date);
  let addedDays = 0;

  while (addedDays < days) {
    result.setDate(result.getDate() + 1);
    if (result.getDay() !== 0 && result.getDay() !== 6) {
      addedDays++;
    }
  }

  return result;
}

export async function createEncomendaInDb(db: DbConnection, data: CreateEncomendaInput) {
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
}

export async function getEncomendasFromDb(
  db: DbConnection,
  deps: { getProductsByIds: (ids: number[]) => Promise<OrderProduct[]> },
  status?: string,
  cliente?: string
) {
  const conditions = [];
  if (status && status !== "todos") {
    if (!isEncomendaStatus(status)) {
      return [];
    }
    conditions.push(eq(encomendas.status, status));
  }
  if (cliente) {
    conditions.push(sql`${encomendas.nomeCliente} LIKE ${`%${cliente}%`}`);
  }

  const result =
    conditions.length > 0
      ? await db.select().from(encomendas).where(and(...conditions)).orderBy(desc(encomendas.dataEntrega))
      : await db.select().from(encomendas).orderBy(desc(encomendas.dataEntrega));

  const productIds = Array.from(
    new Set(result.map((enc) => enc.productId).filter((id): id is number => typeof id === "number"))
  );
  const productsList = await deps.getProductsByIds(productIds);
  const productsMap = new Map(productsList.map((product) => [product.id, product]));

  return result.map((enc) => {
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
}

export async function updateEncomendaInDb(
  db: DbConnection,
  id: number,
  updates: {
    status?: string;
    dataEntrega?: Date;
    observacoes?: string;
    pedidoFeito?: boolean;
  }
) {
  const updateData: Partial<InsertEncomenda> = {};
  if (updates.status && isEncomendaStatus(updates.status)) updateData.status = updates.status;
  if (updates.dataEntrega) updateData.dataEntrega = updates.dataEntrega;
  if (updates.observacoes !== undefined) updateData.observacoes = updates.observacoes;
  if (updates.pedidoFeito !== undefined) updateData.pedidoFeito = updates.pedidoFeito;
  await db.update(encomendas).set(updateData).where(eq(encomendas.id, id));
}

export async function deleteEncomendaInDb(db: DbConnection, id: number) {
  await db.delete(encomendas).where(eq(encomendas.id, id));
}
