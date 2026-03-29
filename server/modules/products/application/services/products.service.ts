import { STOCK_AUDIT_ACTION } from "@shared/stock-governance";
import * as db from "../../../../db";
import { notifyOwner } from "../../../../_core/notification";
import { ENV } from "../../../../_core/env";
import type { ProductCategory } from "../../../../db/legacy-domain-types";
import type { IAuditGateway } from "../../../audit/domain/contracts/audit.gateway";
import { DomainError } from "../../../shared/errors/domain-error";

type Actor = {
  id: number;
  email: string | null;
  role: string;
  openId: string;
  ip?: string;
};

const isLowStock = (quantidade: number, estoqueMinimo: number) =>
  quantidade <= 1 || quantidade <= estoqueMinimo;

type ProductLifecycleStatus = "ATIVO" | "INATIVO" | "ARQUIVADO";

const getProductLifecycleStatus = (product: {
  ativoParaVenda: boolean;
  arquivado?: boolean | null;
}): ProductLifecycleStatus => {
  if (product.arquivado) return "ARQUIVADO";
  return product.ativoParaVenda ? "ATIVO" : "INATIVO";
};

const sanitizeReason = (value?: string | null) => {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
};

const SHADOW_LOG_COOLDOWN_MS = 60_000;
const shadowLogCooldownMap = new Map<string, number>();

function shouldEmitShadowLog(key: string) {
  const now = Date.now();
  const last = shadowLogCooldownMap.get(key) ?? 0;
  if (now - last < SHADOW_LOG_COOLDOWN_MS) return false;
  shadowLogCooldownMap.set(key, now);
  return true;
}

export class ProductsService {
  constructor(private readonly auditGateway: IAuditGateway) {}

  private async ensureCatalogBindings(input: {
    marca?: string;
    medida?: string;
    categoria?: string;
  }) {
    if (input.marca !== undefined) {
      const marca = input.marca.trim();
      if (!marca) {
        throw new DomainError("Marca inválida.", "BAD_REQUEST");
      }
      const brand = await db.findActiveCatalogBrandByName(marca);
      if (!brand) {
        throw new DomainError(
          `Marca "${input.marca}" não está cadastrada no catálogo de categorias.`,
          "BAD_REQUEST"
        );
      }
    }

    if (input.medida !== undefined) {
      const medida = input.medida.trim();
      if (!medida) {
        throw new DomainError("Medida inválida.", "BAD_REQUEST");
      }
      const measure = await db.findActiveCatalogMeasureByName(medida);
      if (!measure) {
        throw new DomainError(
          `Medida "${input.medida}" não está cadastrada no catálogo de categorias.`,
          "BAD_REQUEST"
        );
      }
    }

    if (input.categoria !== undefined) {
      const categoria = input.categoria.trim();
      if (!categoria) {
        throw new DomainError("Categoria inválida.", "BAD_REQUEST");
      }
      const productType = await db.findActiveCatalogProductTypeByName(categoria);
      if (!productType) {
        throw new DomainError(
          `Categoria "${input.categoria}" não está cadastrada no catálogo de categorias.`,
          "BAD_REQUEST"
        );
      }
    }
  }

  async list(input?: {
    searchTerm?: string;
    medida?: string;
    categoria?: string;
    marca?: string;
    onlyActiveForSales?: boolean;
    includeArchived?: boolean;
    page?: number;
    pageSize?: number;
  }) {
    const page = input?.page ?? 1;
    const pageSize = Math.min(input?.pageSize ?? 25, 100);
    const offset = (page - 1) * pageSize;
    const getLegacyList = async () => {
      if (!input || (!input.searchTerm && !input.medida && !input.categoria && !input.marca)) {
        try {
          const base = await db.getSmartProducts(pageSize, offset, input?.onlyActiveForSales);
          return {
            ...base,
            items: base.items
              .filter((item) => (input?.includeArchived ? true : !item.arquivado))
              .map((item) => ({
                ...item,
                statusProduto: getProductLifecycleStatus(item),
              })),
          };
        } catch (error) {
          console.warn("[ProductsService.list] getSmartProducts falhou, usando fallback getAllProducts.", error);
          const base = await db.getAllProducts(
            pageSize,
            offset,
            input?.onlyActiveForSales,
            input?.includeArchived
          );
          return {
            ...base,
            items: base.items.map((item) => ({
              ...item,
              statusProduto: getProductLifecycleStatus(item),
            })),
          };
        }
      }

      const base = await db.searchProducts(
        input.searchTerm,
        input.medida,
        input.categoria,
        input.marca,
        pageSize,
        offset,
        input.onlyActiveForSales,
        input.includeArchived
      );
      return {
        ...base,
        items: base.items.map((item) => ({
          ...item,
          statusProduto: getProductLifecycleStatus(item),
        })),
      };
    };

    const readMode = ENV.stockV2ReadMode;
    if (readMode === "legacy") {
      return await getLegacyList();
    }

    const v2 = await db.listProductsV2ReadModel({
      searchTerm: input?.searchTerm,
      medida: input?.medida,
      categoria: input?.categoria,
      marca: input?.marca,
      onlyActiveForSales: input?.onlyActiveForSales,
      includeArchived: input?.includeArchived,
      page,
      pageSize,
    });

    if (readMode === "shadow") {
      const legacy = await getLegacyList();
      const legacyDistinctCatalogKeyTotal = await db.countLegacyProductsDistinctCatalogKey({
        searchTerm: input?.searchTerm,
        medida: input?.medida,
        categoria: input?.categoria,
        marca: input?.marca,
        onlyActiveForSales: input?.onlyActiveForSales,
        includeArchived: input?.includeArchived,
      });
      const hasTotalDrift = legacy.total !== v2.total;
      const hasPageDrift = legacy.items.length !== v2.items.length;
      const hasStructuralTotalDrift = legacyDistinctCatalogKeyTotal !== v2.total;
      const likelyLegacyDuplicatesCollapsed =
        !hasStructuralTotalDrift && legacy.total !== legacyDistinctCatalogKeyTotal;
      const shadowLogKey = JSON.stringify({
        searchTerm: input?.searchTerm ?? null,
        medida: input?.medida ?? null,
        categoria: input?.categoria ?? null,
        marca: input?.marca ?? null,
        onlyActiveForSales: input?.onlyActiveForSales ?? false,
        includeArchived: input?.includeArchived ?? false,
        page,
        pageSize,
      });

      if ((hasPageDrift || hasStructuralTotalDrift) && shouldEmitShadowLog(`drift:${shadowLogKey}`)) {
        console.warn("[Products.list][Shadow] Divergência legado x V2", {
          filters: input ?? {},
          legacyTotal: legacy.total,
          legacyDistinctCatalogKeyTotal,
          v2Total: v2.total,
          legacyPageCount: legacy.items.length,
          v2PageCount: v2.items.length,
          likelyLegacyDuplicatesCollapsed,
        });
      } else if (
        hasTotalDrift &&
        likelyLegacyDuplicatesCollapsed &&
        shouldEmitShadowLog(`expected:${shadowLogKey}`)
      ) {
        console.info("[Products.list][Shadow] Diferença esperada por duplicidade no legado", {
          filters: input ?? {},
          legacyTotal: legacy.total,
          legacyDistinctCatalogKeyTotal,
          v2Total: v2.total,
        });
      }
      return legacy;
    }

    // v2 mode: only use V2 if all rows are safely mapped to legacy IDs.
    const missingLegacyMapping = v2.items.some((item) => item.id == null);
    if (missingLegacyMapping) {
      console.warn("[Products.list][V2] IDs legado ausentes em parte dos itens. Fallback para legado.");
      return await getLegacyList();
    }

    return {
      total: v2.total,
      items: v2.items.map((item) => ({
        id: Number(item.id),
        name: item.name,
        marca: item.marca,
        medida: item.medida,
        categoria: item.categoria as ProductCategory,
        quantidade: item.quantidade,
        estoqueMinimo: item.estoqueMinimo,
        ativoParaVenda: item.ativoParaVenda,
        arquivado: item.arquivado,
        motivoInativacao: item.motivoInativacao,
        motivoArquivamento: item.motivoArquivamento,
        precoCusto: item.precoCusto,
        precoVenda: item.precoVenda,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        statusProduto: getProductLifecycleStatus(item),
      })),
    };
  }

  async getBrands() {
    return await db.getAllBrands();
  }

  async getById(id: number) {
    const product = await db.getProductById(id);
    if (!product) return undefined;
    return {
      ...product,
      statusProduto: getProductLifecycleStatus(product),
    };
  }

  async checkDuplicateIdentity(input: {
    name: string;
    medida: string;
    marca?: string;
    excludeId?: number;
  }) {
    const matches = await db.findProductsByCatalogIdentity({
      name: input.name,
      medida: input.medida,
      marca: input.marca ?? null,
      excludeId: input.excludeId,
    });

    return {
      exists: matches.length > 0,
      total: matches.length,
      matches: matches.map((item) => ({
        id: item.id,
        name: item.name,
        marca: item.marca,
        medida: item.medida,
        categoria: item.categoria,
        quantidade: item.quantidade,
        ativoParaVenda: item.ativoParaVenda,
        arquivado: item.arquivado,
      })),
    };
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
      const normalizedInput = {
        ...input,
        marca: input.marca?.trim() ? input.marca.trim() : "SEM_MARCA",
        medida: input.medida.trim(),
        categoria: input.categoria.trim() as typeof input.categoria,
      };

      await this.ensureCatalogBindings({
        marca: normalizedInput.marca,
        medida: normalizedInput.medida,
        categoria: normalizedInput.categoria,
      });
      const created = await db.createProductWithInitialMovement(normalizedInput, actor.id);
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
          input: {
            ...input,
            marca: input.marca?.trim() ? input.marca.trim() : "SEM_MARCA",
          },
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
      arquivado?: boolean;
      motivoInativacao?: string | null;
      motivoArquivamento?: string | null;
      statusProduto?: ProductLifecycleStatus;
      auditJustification?: string;
    }
  ) {
    const { id, statusProduto, auditJustification, ...updates } = input;
    const normalizedUpdates = { ...updates };
    if (normalizedUpdates.marca !== undefined) normalizedUpdates.marca = normalizedUpdates.marca.trim();
    if (normalizedUpdates.medida !== undefined) normalizedUpdates.medida = normalizedUpdates.medida.trim();
    if (normalizedUpdates.categoria !== undefined) {
      normalizedUpdates.categoria = normalizedUpdates.categoria.trim() as typeof normalizedUpdates.categoria;
    }

    const currentProduct = await db.getProductById(id);
    if (!currentProduct) throw new DomainError("Produto não encontrado.", "NOT_FOUND");

    // Status explícito unifica e separa regras entre inativação e arquivamento.
    if (statusProduto) {
      if (statusProduto === "ATIVO") {
        normalizedUpdates.ativoParaVenda = true;
        normalizedUpdates.arquivado = false;
        normalizedUpdates.motivoInativacao = null;
        normalizedUpdates.motivoArquivamento = null;
      }
      if (statusProduto === "INATIVO") {
        normalizedUpdates.ativoParaVenda = false;
        normalizedUpdates.arquivado = false;
      }
      if (statusProduto === "ARQUIVADO") {
        normalizedUpdates.ativoParaVenda = false;
        normalizedUpdates.arquivado = true;
      }
    }

    const normalizedInactivationReason = sanitizeReason(normalizedUpdates.motivoInativacao);
    const normalizedArchiveReason = sanitizeReason(normalizedUpdates.motivoArquivamento);

    const isGoingInactive = normalizedUpdates.ativoParaVenda === false && normalizedUpdates.arquivado !== true;
    if (isGoingInactive && !normalizedInactivationReason) {
      throw new DomainError("Informe o motivo da inativação do produto.", "BAD_REQUEST");
    }

    const isGoingArchived = normalizedUpdates.arquivado === true;
    if (isGoingArchived && !normalizedArchiveReason) {
      throw new DomainError("Informe o motivo do arquivamento do produto.", "BAD_REQUEST");
    }

    if (normalizedUpdates.ativoParaVenda === true && normalizedUpdates.arquivado !== true) {
      normalizedUpdates.motivoInativacao = null;
    } else {
      normalizedUpdates.motivoInativacao = normalizedInactivationReason;
    }

    if (normalizedUpdates.arquivado === false) {
      normalizedUpdates.motivoArquivamento = null;
    } else if (normalizedUpdates.arquivado === true) {
      normalizedUpdates.motivoArquivamento = normalizedArchiveReason;
    } else if (normalizedUpdates.motivoArquivamento !== undefined) {
      normalizedUpdates.motivoArquivamento = normalizedArchiveReason;
    }

    const isGovernedProduct = currentProduct.arquivado || !currentProduct.ativoParaVenda;
    const hasSensitiveStockChange =
      normalizedUpdates.quantidade !== undefined || normalizedUpdates.estoqueMinimo !== undefined;
    const normalizedJustification = sanitizeReason(auditJustification);
    if (isGovernedProduct && hasSensitiveStockChange && !normalizedJustification) {
      throw new DomainError(
        "Produto inativo/arquivado exige justificativa para alterar estoque.",
        "BAD_REQUEST"
      );
    }

    try {
      await this.ensureCatalogBindings({
        marca: normalizedUpdates.marca,
        medida: normalizedUpdates.medida,
        categoria: normalizedUpdates.categoria,
      });
      await db.updateProduct(id, normalizedUpdates);

      if (normalizedUpdates.quantidade !== undefined && normalizedUpdates.quantidade !== currentProduct.quantidade) {
        const tipo = normalizedUpdates.quantidade > currentProduct.quantidade ? "entrada" : "saida";
        const quantidadeDiff = Math.abs(normalizedUpdates.quantidade - currentProduct.quantidade);

        await db.createMovimentacao({
          productId: id,
          tipo,
          quantidade: quantidadeDiff,
          quantidadeAnterior: currentProduct.quantidade,
          quantidadeNova: normalizedUpdates.quantidade,
          observacao: normalizedJustification
            ? `Ajuste manual de estoque. Justificativa: ${normalizedJustification}`
            : "Ajuste manual de estoque",
          userId: actor.id,
        });
      }

      const nextQuantidade = normalizedUpdates.quantidade ?? currentProduct.quantidade;
      const nextEstoqueMinimo = normalizedUpdates.estoqueMinimo ?? currentProduct.estoqueMinimo;
      const shouldEvaluateLowStockAlert =
        normalizedUpdates.quantidade !== undefined || normalizedUpdates.estoqueMinimo !== undefined;

      if (shouldEvaluateLowStockAlert && isLowStock(nextQuantidade, nextEstoqueMinimo)) {
        await notifyOwner({
          title: "⚠️ Estoque Baixo",
          content: `O produto "${currentProduct.name}" (${currentProduct.medida}) está com apenas ${nextQuantidade} unidade(s) em estoque.`,
        });
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
          updates: normalizedUpdates,
          statusAnterior: getProductLifecycleStatus(currentProduct),
          statusNovo: updatedProduct ? getProductLifecycleStatus(updatedProduct) : null,
          justificativaAuditoria: normalizedJustification,
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
          attemptedUpdates: normalizedUpdates,
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
    const currentProduct = await db.getProductById(input.id);
    if (!currentProduct) throw new DomainError("Produto não encontrado.", "NOT_FOUND");

    if (currentProduct.arquivado || !currentProduct.ativoParaVenda) {
      throw new DomainError(
        "Produto inativo/arquivado não pode ter preço alterado por este endpoint sem justificativa.",
        "BAD_REQUEST"
      );
    }

    await db.updateProductPrice(input.id, input.precoCusto, input.precoVenda, actorId);
    return { success: true } as const;
  }

  async updatePriceWithJustification(input: {
    actor: Actor;
    id: number;
    precoCusto: number | null;
    precoVenda: number | null;
    auditJustification?: string;
  }) {
    const currentProduct = await db.getProductById(input.id);
    if (!currentProduct) throw new DomainError("Produto não encontrado.", "NOT_FOUND");

    const normalizedJustification = sanitizeReason(input.auditJustification);
    if ((currentProduct.arquivado || !currentProduct.ativoParaVenda) && !normalizedJustification) {
      throw new DomainError(
        "Produto inativo/arquivado exige justificativa para alterar preço.",
        "BAD_REQUEST"
      );
    }

    await db.updateProductPrice(input.id, input.precoCusto, input.precoVenda, input.actor.id);

    await this.auditGateway.write({
      action: STOCK_AUDIT_ACTION.PRODUCT_UPDATED,
      actor: input.actor,
      target: {
        productId: currentProduct.id,
        name: currentProduct.name,
        medida: currentProduct.medida,
      },
      metadata: {
        campo: "preco",
        before: {
          precoCusto: currentProduct.precoCusto,
          precoVenda: currentProduct.precoVenda,
        },
        after: {
          precoCusto: input.precoCusto,
          precoVenda: input.precoVenda,
        },
        justificativaAuditoria: normalizedJustification,
      },
    });

    return { success: true } as const;
  }

  async archive(actor: Actor, input: { id: number; motivoArquivamento: string }) {
    const reason = sanitizeReason(input.motivoArquivamento);
    if (!reason) throw new DomainError("Informe o motivo do arquivamento.", "BAD_REQUEST");
    return this.update(actor, {
      id: input.id,
      statusProduto: "ARQUIVADO",
      motivoArquivamento: reason,
      auditJustification: reason,
    });
  }

  async unarchive(actor: Actor, input: { id: number; reativarParaVenda?: boolean }) {
    return this.update(actor, {
      id: input.id,
      statusProduto: input.reativarParaVenda ? "ATIVO" : "INATIVO",
      motivoInativacao: input.reativarParaVenda ? null : "Desarquivado para revisão interna",
      motivoArquivamento: null,
      auditJustification: "Desarquivamento autorizado",
    });
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
