import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { type InsertVenda, movimentacoes, products, vendas } from "../../drizzle/schema";

type DbConnection = ReturnType<typeof drizzle>;

export async function cancelarVendaInDb(
  db: DbConnection,
  vendaId: number,
  motivo: string,
  userId: number
) {
  return await db.transaction(async (tx) => {
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

    return {
      productId: vendaData.productId,
      quantidade: vendaData.quantidade,
      beforeQty: Number(product.quantidade),
      afterQty: Number(novaQuantidade),
    };
  });
}

export async function excluirVendaInDb(
  db: DbConnection,
  vendaId: number,
  userId: number
) {
  return await db.transaction(async (tx) => {
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

      const event = {
        productId: vendaData.productId,
        quantidade: vendaData.quantidade,
        beforeQty: Number(product.quantidade),
        afterQty: Number(novaQuantidade),
      };
      await tx.delete(vendas).where(eq(vendas.id, vendaId));
      return event;
    }

    await tx.delete(vendas).where(eq(vendas.id, vendaId));
    return null;
  });
}

export async function editarVendaInDb(
  db: DbConnection,
  vendaId: number,
  updates: {
    vendedor?: string;
    observacoes?: string;
    quantidade?: number;
    tipoTransacao?: "venda" | "troca" | "brinde" | "emprestimo" | "permuta";
  },
  userId: number
) {
  return await db.transaction(async (tx) => {
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

      const event: {
        productId: number;
        quantity: number;
        beforeQty: number;
        afterQty: number;
        movementType: "IN" | "OUT";
      } = {
        productId: venda.productId,
        quantity: Math.abs(diferenca),
        beforeQty: Number(product.quantidade),
        afterQty: Number(novaQuantidadeEstoque),
        movementType: diferenca > 0 ? "OUT" : "IN",
      };
      const updateData: Partial<InsertVenda> = {};
      if (updates.vendedor !== undefined) updateData.vendedor = updates.vendedor;
      if (updates.observacoes !== undefined) updateData.observacoes = updates.observacoes;
      if (updates.quantidade !== undefined) updateData.quantidade = updates.quantidade;
      if (updates.tipoTransacao !== undefined) updateData.tipoTransacao = updates.tipoTransacao;

      if (Object.keys(updateData).length > 0) {
        await tx.update(vendas).set(updateData).where(eq(vendas.id, vendaId));
      }

      return event;
    }

    const updateData: Partial<InsertVenda> = {};
    if (updates.vendedor !== undefined) updateData.vendedor = updates.vendedor;
    if (updates.observacoes !== undefined) updateData.observacoes = updates.observacoes;
    if (updates.quantidade !== undefined) updateData.quantidade = updates.quantidade;
    if (updates.tipoTransacao !== undefined) updateData.tipoTransacao = updates.tipoTransacao;

    if (Object.keys(updateData).length > 0) {
      await tx.update(vendas).set(updateData).where(eq(vendas.id, vendaId));
    }
    return null;
  });
}
