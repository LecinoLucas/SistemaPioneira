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

const normalizeProductName = (value: string) => value.trim().toLocaleUpperCase("pt-BR");

const LEGACY_PRODUCT_CATEGORY_VALUES = [
  "Colchões",
  "Roupas de Cama",
  "Pillow Top",
  "Travesseiros",
  "Cabeceiras",
  "Box Baú",
  "Box Premium",
  "Box Tradicional",
  "Acessórios",
  "Bicamas",
  "Camas",
] as const;

function normalizeCategoryKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveLegacyProductCategoryValue(value: string) {
  const target = normalizeCategoryKey(value);
  return LEGACY_PRODUCT_CATEGORY_VALUES.find((item) => normalizeCategoryKey(item) === target) ?? value.trim();
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

    return await getLegacyList();
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
      name: normalizeProductName(input.name),
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
      categoria: string;
      quantidade: number;
      estoqueMinimo: number;
    }
  ) {
    try {
      const normalizedBrandInput = input.marca?.trim() || undefined;
      const normalizedInput = {
        ...input,
        name: normalizeProductName(input.name),
        marca: normalizedBrandInput ?? "SEM_MARCA",
        medida: input.medida.trim(),
        categoria: resolveLegacyProductCategoryValue(input.categoria) as typeof input.categoria,
      };

      await this.ensureCatalogBindings({
        marca: normalizedBrandInput,
        medida: normalizedInput.medida,
        categoria: normalizedInput.categoria,
      });
      const created = await db.createProductWithInitialMovement(normalizedInput as never, actor.id);
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

  async createBatch(
    actor: Actor,
    input: {
      name: string;
      marca?: string;
      medidas: string[];
      categoria: string;
      quantidade: number;
      estoqueMinimo: number;
    }
  ) {
    const normalizedName = normalizeProductName(input.name);
    const normalizedBrandInput = input.marca?.trim() || undefined;
    const normalizedMarca = normalizedBrandInput ?? "SEM_MARCA";
    const normalizedCategoria = resolveLegacyProductCategoryValue(input.categoria) as typeof input.categoria;

    await this.ensureCatalogBindings({
      marca: normalizedBrandInput,
      categoria: normalizedCategoria,
    });

    // Validate all medidas upfront
    for (const medida of input.medidas) {
      await this.ensureCatalogBindings({ medida: medida.trim() });
    }

    const results: { medida: string; success: boolean; error?: string }[] = [];

    for (const medida of input.medidas) {
      const trimmedMedida = medida.trim();
      try {
        // Check for duplicates before creating
        const existing = await db.findProductsByCatalogIdentity({
          name: normalizedName,
          medida: trimmedMedida,
          marca: normalizedMarca,
        });
        if (existing.length > 0) {
          results.push({ medida: trimmedMedida, success: false, error: "Produto já cadastrado com esta combinação" });
          continue;
        }

        const created = await db.createProductWithInitialMovement(
          {
            name: normalizedName,
            marca: normalizedMarca,
            medida: trimmedMedida,
            categoria: normalizedCategoria,
            quantidade: input.quantidade,
            estoqueMinimo: input.estoqueMinimo,
          } as never,
          actor.id
        );

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
            batchMode: true,
          },
        });

        results.push({ medida: trimmedMedida, success: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Erro desconhecido";
        results.push({ medida: trimmedMedida, success: false, error: message });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    return { successCount, failCount, results };
  }

  async update(
    actor: Actor,
    input: {
      id: number;
      name?: string;
      marca?: string;
      medida?: string;
      categoria?: string;
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
    if (normalizedUpdates.name !== undefined) normalizedUpdates.name = normalizeProductName(normalizedUpdates.name);
    if (normalizedUpdates.marca !== undefined) normalizedUpdates.marca = normalizedUpdates.marca.trim();
    if (normalizedUpdates.medida !== undefined) normalizedUpdates.medida = normalizedUpdates.medida.trim();
    if (normalizedUpdates.categoria !== undefined) {
      normalizedUpdates.categoria = resolveLegacyProductCategoryValue(normalizedUpdates.categoria) as typeof normalizedUpdates.categoria;
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
      await db.updateProduct(id, normalizedUpdates as never);

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
