import { STOCK_AUDIT_ACTION } from "@shared/stock-governance";
import * as db from "../../../../db";
import { notifyOwner } from "../../../../_core/notification";
import type { IAuditGateway } from "../../../audit/domain/contracts/audit.gateway";
import { DomainError } from "../../../shared/errors/domain-error";

type Actor = {
  id: number;
  email: string | null;
  role: string;
  openId: string;
  ip?: string;
};

export class ProductsService {
  constructor(private readonly auditGateway: IAuditGateway) {}

  async list(input?: {
    searchTerm?: string;
    medida?: string;
    categoria?: string;
    marca?: string;
    onlyActiveForSales?: boolean;
    page?: number;
    pageSize?: number;
  }) {
    const page = input?.page ?? 1;
    const pageSize = Math.min(input?.pageSize ?? 25, 100);
    const offset = (page - 1) * pageSize;

    if (!input || (!input.searchTerm && !input.medida && !input.categoria && !input.marca)) {
      try {
        return await db.getSmartProducts(pageSize, offset, input?.onlyActiveForSales);
      } catch (error) {
        console.warn("[ProductsService.list] getSmartProducts falhou, usando fallback getAllProducts.", error);
        return await db.getAllProducts(pageSize, offset, input?.onlyActiveForSales);
      }
    }

    return await db.searchProducts(
      input.searchTerm,
      input.medida,
      input.categoria,
      input.marca,
      pageSize,
      offset,
      input.onlyActiveForSales
    );
  }

  async getBrands() {
    return await db.getAllBrands();
  }

  async getById(id: number) {
    return await db.getProductById(id);
  }

  async create(
    actor: Actor,
    input: {
      name: string;
      marca?: string;
      medida: string;
      categoria:
        | "Colchões"
        | "Roupas de Cama"
        | "Pillow Top"
        | "Travesseiros"
        | "Cabeceiras"
        | "Box Baú"
        | "Box Premium"
        | "Box Tradicional"
        | "Acessórios"
        | "Bicamas"
        | "Camas";
      quantidade: number;
      estoqueMinimo: number;
    }
  ) {
    try {
      const created = await db.createProductWithInitialMovement(input, actor.id);
      await this.auditGateway.write({
        action: STOCK_AUDIT_ACTION.PRODUCT_CREATED,
        actor,
        target: {
          productId: created.id,
          name: created.name,
          medida: created.medida,
        },
        metadata: {
          estoqueInicial: created.quantidade,
          estoqueMinimo: created.estoqueMinimo,
        },
      });
      return { success: true } as const;
    } catch (error) {
      await this.auditGateway.write({
        action: STOCK_AUDIT_ACTION.PRODUCT_CREATED,
        status: "failed",
        actor,
        metadata: {
          error: error instanceof Error ? error.message : "unknown_error",
          input,
        },
      });
      throw error;
    }
  }

  async update(
    actor: Actor,
    input: {
      id: number;
      name?: string;
      marca?: string;
      medida?: string;
      categoria?:
        | "Colchões"
        | "Roupas de Cama"
        | "Pillow Top"
        | "Travesseiros"
        | "Cabeceiras"
        | "Box Baú"
        | "Box Premium"
        | "Box Tradicional"
        | "Acessórios"
        | "Bicamas"
        | "Camas";
      quantidade?: number;
      estoqueMinimo?: number;
      ativoParaVenda?: boolean;
    }
  ) {
    const { id, ...updates } = input;

    const currentProduct = await db.getProductById(id);
    if (!currentProduct) throw new DomainError("Produto não encontrado.", "NOT_FOUND");

    try {
      await db.updateProduct(id, updates);

      if (updates.quantidade !== undefined && updates.quantidade !== currentProduct.quantidade) {
        const tipo = updates.quantidade > currentProduct.quantidade ? "entrada" : "saida";
        const quantidadeDiff = Math.abs(updates.quantidade - currentProduct.quantidade);

        await db.createMovimentacao({
          productId: id,
          tipo,
          quantidade: quantidadeDiff,
          quantidadeAnterior: currentProduct.quantidade,
          quantidadeNova: updates.quantidade,
          observacao: "Ajuste manual de estoque",
          userId: actor.id,
        });

        if (updates.quantidade <= 1 || updates.quantidade <= (updates.estoqueMinimo ?? currentProduct.estoqueMinimo)) {
          await notifyOwner({
            title: "⚠️ Estoque Baixo",
            content: `O produto "${currentProduct.name}" (${currentProduct.medida}) está com apenas ${updates.quantidade} unidade(s) em estoque.`,
          });
        }
      }

      const updatedProduct = await db.getProductById(id);
      await this.auditGateway.write({
        action: STOCK_AUDIT_ACTION.PRODUCT_UPDATED,
        actor,
        target: {
          productId: id,
          name: currentProduct.name,
          medida: currentProduct.medida,
        },
        metadata: {
          before: {
            quantidade: currentProduct.quantidade,
            estoqueMinimo: currentProduct.estoqueMinimo,
            precoCusto: currentProduct.precoCusto,
            precoVenda: currentProduct.precoVenda,
          },
          after: updatedProduct
            ? {
                quantidade: updatedProduct.quantidade,
                estoqueMinimo: updatedProduct.estoqueMinimo,
                precoCusto: updatedProduct.precoCusto,
                precoVenda: updatedProduct.precoVenda,
              }
            : null,
          updates,
        },
      });

      return { success: true } as const;
    } catch (error) {
      await this.auditGateway.write({
        action: STOCK_AUDIT_ACTION.PRODUCT_UPDATED,
        status: "failed",
        actor,
        target: { productId: id, name: currentProduct.name, medida: currentProduct.medida },
        metadata: {
          error: error instanceof Error ? error.message : "unknown_error",
          attemptedUpdates: updates,
        },
      });
      throw error;
    }
  }

  async delete(actor: Actor, id: number) {
    const currentProduct = await db.getProductById(id);

    try {
      await db.deleteProduct(id);
      await this.auditGateway.write({
        action: STOCK_AUDIT_ACTION.PRODUCT_DELETED,
        actor,
        target: {
          productId: id,
          name: currentProduct?.name ?? null,
          medida: currentProduct?.medida ?? null,
        },
        metadata: {
          previousStock: currentProduct?.quantidade ?? null,
        },
      });
      return { success: true } as const;
    } catch (error) {
      await this.auditGateway.write({
        action: STOCK_AUDIT_ACTION.PRODUCT_DELETED,
        status: "failed",
        actor,
        target: {
          productId: id,
          name: currentProduct?.name ?? null,
          medida: currentProduct?.medida ?? null,
        },
        metadata: {
          error: error instanceof Error ? error.message : "unknown_error",
        },
      });
      throw error;
    }
  }

  async deleteBatch(actor: Actor, ids: number[]) {
    const uniqueIds = Array.from(new Set(ids.filter((id) => Number.isFinite(id) && id > 0)));
    if (uniqueIds.length === 0) {
      throw new DomainError("Nenhum produto válido informado para exclusão.", "BAD_REQUEST");
    }

    let successCount = 0;
    let failCount = 0;
    const failures: Array<{ id: number; message: string }> = [];

    for (const id of uniqueIds) {
      try {
        await this.delete(actor, id);
        successCount += 1;
      } catch (error) {
        failCount += 1;
        failures.push({
          id,
          message: error instanceof Error ? error.message : "Falha ao excluir produto",
        });
      }
    }

    return {
      success: failCount === 0,
      successCount,
      failCount,
      deletedIds: uniqueIds.filter((id) => !failures.some((failure) => failure.id === id)),
      failures,
    } as const;
  }

  async lowStock() {
    return await db.getLowStockProducts();
  }

  async negativeStock() {
    return await db.getNegativeStockProducts();
  }

  async updatePrice(actorId: number, input: { id: number; precoCusto: number | null; precoVenda: number | null }) {
    await db.updateProductPrice(input.id, input.precoCusto, input.precoVenda, actorId);
    return { success: true } as const;
  }

  async priceHistory(productId: number) {
    return await db.getPriceHistory(productId);
  }

  async exportPdf(input: { search?: string; medida?: string; categoria?: string; marca?: string }) {
    const { generateProductsPDF } = await import("../../../../pdfExport");
    const products = await db.getProductsFiltered(input);
    return await generateProductsPDF(products);
  }
}
