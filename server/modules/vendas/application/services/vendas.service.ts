import { STOCK_AUDIT_ACTION } from "@shared/stock-governance";
import * as db from "../../../../db";
import { notifyOwner } from "../../../../_core/notification";
import type { IAuditGateway } from "../../../audit/domain/contracts/audit.gateway";
import { generateEncomendasRelatorioPDF, generateVendasRelatorioPDF } from "../../../../pdfExportReports";
import { PdfSalesImportService } from "./pdf-sales-import.service";
import { DomainError } from "../../../shared/errors/domain-error";

type Actor = {
  id: number;
  email: string | null;
  role: string;
  openId: string;
  ip?: string;
};

type SaleItemInput = {
  productId: number;
  quantidade: number;
};

function normalizePersonName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^\d+\s*[-:]\s*/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isSellerTokenMatch(candidate: string, normalizedSeller: string) {
  if (!candidate || !normalizedSeller) return false;
  if (candidate === normalizedSeller) return true;
  if (candidate.includes(normalizedSeller) || normalizedSeller.includes(candidate)) return true;

  const parts = candidate.split(" ").filter((part) => part.length >= 3);
  return parts.some((part) => normalizedSeller.includes(part));
}

function normalizePaymentName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveCatalogPaymentMethod(
  value: string,
  methods: Array<{ codigo: string; nome: string }>
) {
  const normalized = normalizePaymentName(value);
  if (!normalized) return null;

  const direct = methods.find((item) => {
    const name = normalizePaymentName(item.nome);
    const code = normalizePaymentName(item.codigo);
    return name === normalized || code === normalized;
  });
  if (direct) return direct.nome;

  const aliases = [
    normalized.includes("receber na entrega") ? "receber na entrega" : null,
    normalized === "pix" ? "pix" : null,
    normalized.includes("credito") ? "credito" : null,
    normalized.includes("debito") ? "debito" : null,
    normalized.includes("boleto") ? "boleto" : null,
    normalized.includes("transferencia") || normalized.includes("ted") ? "transferencia" : null,
    normalized.includes("dinheiro") || normalized.includes("especie") ? "dinheiro" : null,
    normalized.includes("multiplo") || normalized.includes("misto") ? "multiplo" : null,
  ].filter((item): item is string => Boolean(item));

  const semantic = methods.find((item) => {
    const name = normalizePaymentName(item.nome);
    const code = normalizePaymentName(item.codigo);
    return aliases.some((alias) => name.includes(alias) || code.includes(alias));
  });
  return semantic?.nome ?? null;
}

export function splitCombinedPaymentMethods(value: string) {
  return value
    .split(/\s+\+\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export class VendasService {
  private readonly pdfImportService = new PdfSalesImportService();

  constructor(private readonly auditGateway: IAuditGateway) {}

  private async validateImportedDrafts<T extends {
    fileHash: string;
    fileName: string;
    documentNumber: string | null;
    cliente: string | null;
    dataVenda: string | null;
    itens: Array<{
      productId: number | null;
      medida: string | null;
      confidence: number;
    }>;
    warnings: string[];
    validationWarnings: string[];
    validationErrors: string[];
  }>(drafts: T[]): Promise<T[]> {
    const fileHashCounts = new Map<string, number>();
    const documentCounts = new Map<string, number>();

    for (const draft of drafts) {
      fileHashCounts.set(draft.fileHash, (fileHashCounts.get(draft.fileHash) ?? 0) + 1);
      const documentKey = draft.documentNumber?.trim();
      if (documentKey) {
        documentCounts.set(documentKey, (documentCounts.get(documentKey) ?? 0) + 1);
      }
    }

    await Promise.all(
      drafts.map(async (draft) => {
        draft.validationWarnings = [];
        draft.validationErrors = [];

        const duplicateHistory = await db.findImportedSaleByFileHashOrDocument(
          draft.fileHash,
          draft.documentNumber
        );

        if (duplicateHistory) {
          draft.validationErrors.push(
            `Importação bloqueada: este arquivo já foi lançado antes (${duplicateHistory.fileName}${duplicateHistory.documentNumber ? `, doc ${duplicateHistory.documentNumber}` : ""}).`
          );
        }

        if ((fileHashCounts.get(draft.fileHash) ?? 0) > 1) {
          draft.validationErrors.push("Importação bloqueada: o mesmo arquivo apareceu mais de uma vez neste lote.");
        }

        const documentKey = draft.documentNumber?.trim();
        if (documentKey && (documentCounts.get(documentKey) ?? 0) > 1) {
          draft.validationErrors.push(
            `Importação bloqueada: o documento ${documentKey} apareceu mais de uma vez neste lote.`
          );
        }

        if (draft.itens.length === 0) {
          draft.validationErrors.push("Nenhum item de venda foi encontrado no PDF.");
          return;
        }

        const duplicatedProductIds = new Map<number, number[]>();
        draft.itens.forEach((item, index) => {
          if (item.productId == null) return;
          const current = duplicatedProductIds.get(item.productId) ?? [];
          current.push(index);
          duplicatedProductIds.set(item.productId, current);
        });

        let autoMatchDuplicatesResolved = false;
        duplicatedProductIds.forEach((indexes) => {
          if (indexes.length < 2) return;
          autoMatchDuplicatesResolved = true;
          for (const index of indexes) {
            draft.itens[index] = {
              ...draft.itens[index],
              productId: null,
              medida: null,
            };
          }
        });

        if (autoMatchDuplicatesResolved) {
          draft.validationWarnings.push(
            "Foram encontrados vínculos automáticos duplicados no mesmo PDF. Esses itens foram liberados para revisão manual."
          );
        }

        const autoLinkedCount = draft.itens.filter((item) => item.productId != null).length;
        const reviewCount = draft.itens.filter((item) => item.productId == null).length;
        const lowConfidenceCount = draft.itens.filter(
          (item) => item.productId != null && item.confidence < 0.9
        ).length;

        if (autoLinkedCount === 0) {
          draft.validationWarnings.push(
            "Nenhum item foi vinculado automaticamente. Revise manualmente os produtos do PDF."
          );
        } else if (reviewCount > 0) {
          draft.validationWarnings.push(
            `${reviewCount} item(ns) precisam de revisão manual antes do lançamento.`
          );
        }

        if (lowConfidenceCount > 0) {
          draft.validationWarnings.push(
            `${lowConfidenceCount} item(ns) foram vinculados com confiança média. Revise antes de lançar.`
          );
        }

        if (!draft.cliente?.trim()) {
          draft.validationWarnings.push("Cliente não foi confirmado automaticamente.");
        }

        if (!draft.dataVenda) {
          draft.validationWarnings.push("Data da venda não foi identificada automaticamente.");
        }
      })
    );

    return drafts;
  }

  async getProductsLiteForImport() {
    const mapLegacy = (items: Array<{ id: number; name: string; medida: string; marca: string | null; quantidade: number }>) =>
      items.map((product) => ({
        id: product.id,
        name: product.name,
        medida: product.medida,
        marca: product.marca,
        quantidade: product.quantidade,
      }));

    // Importação deve reconhecer o máximo de itens possível, mesmo se o produto estiver inativo para venda.
    const legacyActiveAndInactive = await db.getAllProducts(undefined, undefined, false, false);
    const legacyLite = mapLegacy(legacyActiveAndInactive.items);
    if (legacyLite.length > 0) return legacyLite;

    const legacyIncludingArchived = await db.getAllProducts(undefined, undefined, false, true);
    const legacyArchivedLite = mapLegacy(legacyIncludingArchived.items);
    if (legacyArchivedLite.length > 0) return legacyArchivedLite;
    return legacyLite;
  }

  private async resolveSellerOrThrow(vendedor?: string) {
    if (!vendedor?.trim()) return undefined;
    const sellers = await db.getAllCatalogSellers();
    if (!sellers.length) {
      throw new DomainError(
        `Nenhum vendedor está cadastrado no catálogo. Cadastre os vendedores antes de lançar a venda.`,
        "BAD_REQUEST"
      );
    }

    const normalizedInput = normalizePersonName(vendedor);
    const exact = sellers.find((item) => normalizePersonName(item.nome) === normalizedInput);
    if (exact) return exact.nome;

    const fuzzy = sellers.find((item) => isSellerTokenMatch(normalizedInput, normalizePersonName(item.nome)));
    if (fuzzy) return fuzzy.nome;

    throw new DomainError(
      `Vendedor "${vendedor}" não está cadastrado no catálogo de vendedores.`,
      "BAD_REQUEST"
    );
  }

  private async resolvePaymentMethodOrThrow(formaPagamento?: string) {
    if (!formaPagamento?.trim()) {
      throw new DomainError(
        "Informe a forma de pagamento da venda usando um item cadastrado no catálogo.",
        "BAD_REQUEST"
      );
    }
    const paymentParts = splitCombinedPaymentMethods(formaPagamento);
    if (paymentParts.length === 0) {
      throw new DomainError(
        "Informe a forma de pagamento da venda usando um item cadastrado no catálogo.",
        "BAD_REQUEST"
      );
    }
    const paymentMethods = await db.getAllCatalogPaymentMethods();
    if (!paymentMethods.length) {
      throw new DomainError(
        "Nenhuma forma de pagamento está cadastrada no catálogo. Cadastre as formas de pagamento antes de lançar a venda.",
        "BAD_REQUEST"
      );
    }
    const resolvedParts: string[] = [];
    for (const part of paymentParts) {
      const resolvedName =
        resolveCatalogPaymentMethod(part, paymentMethods) ??
        (await db.findActiveCatalogPaymentMethodByNameOrCode(part))?.nome ??
        null;
      if (!resolvedName) {
        throw new DomainError(
          `Forma de pagamento "${part}" não está cadastrada no catálogo de categorias.`,
          "BAD_REQUEST"
        );
      }
      resolvedParts.push(resolvedName);
    }
    return Array.from(new Set(resolvedParts)).join(" + ");
  }

  async importFromFolder(input: { folderPath?: string; maxFiles?: number }) {
    const productsLite = await this.getProductsLiteForImport();

    const drafts = await this.validateImportedDrafts(
      await this.pdfImportService.parseFolder(input, productsLite)
    );
    if (productsLite.length === 0) {
      for (const draft of drafts) {
        draft.warnings.push("Catálogo de produtos vazio para vinculação automática. Verifique o modo de leitura do estoque.");
      }
    }
    return {
      folderPath: input.folderPath ?? null,
      totalFiles: drafts.length,
      drafts,
    };
  }

  async importFromUploadedFiles(input: {
    files: Array<{ fileName: string; fileBase64: string }>;
  }) {
    if (!input.files.length) {
      return { totalFiles: 0, drafts: [] as const };
    }

    const productsLite = await this.getProductsLiteForImport();

    const drafts = await this.validateImportedDrafts(
      await this.pdfImportService.parseUploadedFiles(input.files, productsLite)
    );
    if (productsLite.length === 0) {
      for (const draft of drafts) {
        draft.warnings.push("Catálogo de produtos vazio para vinculação automática. Verifique o modo de leitura do estoque.");
      }
    }
    return {
      totalFiles: drafts.length,
      drafts,
    };
  }

  async importHistory(input?: { page?: number; pageSize?: number; search?: string }) {
    return await db.listImportedSalesLogs(input);
  }

  async registrarImportada(actor: Actor, input: {
    items: SaleItemInput[];
    vendedor?: string;
    nomeCliente?: string;
    telefoneCliente?: string;
    enderecoCliente?: string;
    formaPagamento?: string;
    dataVenda?: Date;
    valorTotal?: number;
    observacoes?: string;
    tipoTransacao: "venda" | "troca" | "brinde" | "emprestimo" | "permuta";
    importMeta: {
      fileHash: string;
      fileName: string;
      documentNumber?: string | null;
      total?: number | null;
      reviewNote?: string;
    };
  }) {
    const productIds = input.items.map((item) => item.productId);
    if (new Set(productIds).size !== productIds.length) {
      throw new DomainError(
        "Produtos duplicados detectados nesta importação. Cada item do PDF deve apontar para um produto diferente.",
        "BAD_REQUEST"
      );
    }

    const linkedProducts = await db.getProductsByIds(productIds);
    const outOfStockProducts = linkedProducts.filter((product) => product.quantidade <= 0);
    if (outOfStockProducts.length > 0) {
      throw new DomainError(
        `Importação bloqueada: produto(s) sem estoque no momento do lançamento: ${outOfStockProducts
          .map((product) => `${product.name} (${product.medida})`)
          .join(", ")}.`,
        "BAD_REQUEST"
      );
    }

    const duplicate = await db.findImportedSaleByFileHashOrDocument(
      input.importMeta.fileHash,
      input.importMeta.documentNumber
    );

    if (duplicate) {
      throw new Error(
        `Este arquivo já foi importado anteriormente (${duplicate.fileName}${duplicate.documentNumber ? `, doc ${duplicate.documentNumber}` : ""}).`
      );
    }

    const resolvedSeller = await this.resolveSellerOrThrow(input.vendedor);
    const resolvedPaymentMethod = await this.resolvePaymentMethodOrThrow(input.formaPagamento);

    const result = await this.registrar(actor, {
      items: input.items,
      vendedor: resolvedSeller,
      nomeCliente: input.nomeCliente,
      telefoneCliente: input.telefoneCliente,
      enderecoCliente: input.enderecoCliente,
      formaPagamento: resolvedPaymentMethod,
      dataVenda: input.dataVenda,
      valorTotal: input.valorTotal,
      observacoes: input.observacoes,
      tipoTransacao: input.tipoTransacao,
    });

    await db.createImportedSaleLog({
      fileHash: input.importMeta.fileHash,
      fileName: input.importMeta.fileName,
      documentNumber: input.importMeta.documentNumber ?? null,
      nomeCliente: input.nomeCliente ?? null,
      telefoneCliente: input.telefoneCliente ?? null,
      enderecoCliente: input.enderecoCliente ?? null,
      vendedor: resolvedSeller ?? null,
      formaPagamento: resolvedPaymentMethod ?? null,
      dataVenda: input.dataVenda ?? null,
      total: input.importMeta.total ?? null,
      itemsCount: input.items.length,
      userId: actor.id,
      approvedByUserId: actor.id,
      approvedByEmail: actor.email ?? actor.openId,
      approvedAt: new Date(),
      status: "success",
      notes: input.importMeta.reviewNote?.trim() || null,
    });

    return result;
  }

  async registerPublic(input: {
    items: SaleItemInput[];
    nomeCliente?: string;
    telefoneCliente?: string;
    enderecoCliente?: string;
    formaPagamento?: string;
    valorTotal?: number;
    observacoes?: string;
    tipoTransacao: "venda" | "troca" | "brinde" | "emprestimo" | "permuta";
  }, ip?: string) {
    const resolvedPaymentMethod = await this.resolvePaymentMethodOrThrow(input.formaPagamento);
    const dataVenda = new Date();
    const beforeProducts = await db.getProductsByIds(input.items.map((item) => item.productId));
    const beforeMap = new Map(beforeProducts.map((product) => [product.id, product]));

    try {
      const lowStockAlerts = await db.registrarVendasAtomico({
        items: input.items,
        dataVenda,
        nomeCliente: input.nomeCliente,
        telefoneCliente: input.telefoneCliente,
        enderecoCliente: input.enderecoCliente,
        formaPagamento: resolvedPaymentMethod,
        valorTotal: input.valorTotal,
        observacoes: input.observacoes,
        tipoTransacao: input.tipoTransacao,
        userId: null,
        observacaoMovimentacao: "Venda registrada (pública)",
      });

      for (const alert of lowStockAlerts) {
        await notifyOwner({
          title: "Alerta de Estoque Baixo",
          content: `O produto "${alert.name}" (${alert.medida}) está com apenas ${alert.novaQuantidade} unidade(s) em estoque.`,
        });
      }

      const afterProducts = await db.getProductsByIds(input.items.map((item) => item.productId));
      const afterMap = new Map(afterProducts.map((product) => [product.id, product]));

      await this.auditGateway.write({
        action: STOCK_AUDIT_ACTION.SALE_REGISTERED_PUBLIC,
        actor: { ip },
        metadata: {
          tipoTransacao: input.tipoTransacao,
          nomeCliente: input.nomeCliente ?? null,
          itens: input.items.map((item) => {
            const before = beforeMap.get(item.productId);
            const after = afterMap.get(item.productId);
            return {
              productId: item.productId,
              quantidadeVendida: item.quantidade,
              estoqueAntes: before?.quantidade ?? null,
              estoqueDepois: after?.quantidade ?? null,
            };
          }),
        },
      });

      return { success: true } as const;
    } catch (error) {
      await this.auditGateway.write({
        action: STOCK_AUDIT_ACTION.SALE_REGISTERED_PUBLIC,
        status: "failed",
        actor: { ip },
        metadata: {
          error: error instanceof Error ? error.message : "unknown_error",
          tipoTransacao: input.tipoTransacao,
          nomeCliente: input.nomeCliente ?? null,
          itens: input.items,
        },
      });
      throw error;
    }
  }

  async registrar(actor: Actor, input: {
    items: SaleItemInput[];
    vendedor?: string;
    nomeCliente?: string;
    telefoneCliente?: string;
    enderecoCliente?: string;
    formaPagamento?: string;
    valorTotal?: number;
    dataVenda?: Date;
    observacoes?: string;
    tipoTransacao: "venda" | "troca" | "brinde" | "emprestimo" | "permuta";
  }) {
    const resolvedSeller = await this.resolveSellerOrThrow(input.vendedor);
    const resolvedPaymentMethod = await this.resolvePaymentMethodOrThrow(input.formaPagamento);
    const dataVenda = input.dataVenda || new Date();
    const beforeProducts = await db.getProductsByIds(input.items.map((item) => item.productId));
    const beforeMap = new Map(beforeProducts.map((product) => [product.id, product]));

    try {
      const lowStockAlerts = await db.registrarVendasAtomico({
        items: input.items,
        dataVenda,
        vendedor: resolvedSeller,
        nomeCliente: input.nomeCliente,
        telefoneCliente: input.telefoneCliente,
        enderecoCliente: input.enderecoCliente,
        formaPagamento: resolvedPaymentMethod,
        valorTotal: input.valorTotal,
        observacoes: input.observacoes,
        tipoTransacao: input.tipoTransacao,
        userId: actor.id,
        observacaoMovimentacao: "Venda registrada",
      });

      for (const alert of lowStockAlerts) {
        await notifyOwner({
          title: "⚠️ Estoque Baixo Após Venda",
          content: `O produto "${alert.name}" (${alert.medida}) está com apenas ${alert.novaQuantidade} unidade(s) em estoque após a venda.`,
        });
      }

      const afterProducts = await db.getProductsByIds(input.items.map((item) => item.productId));
      const afterMap = new Map(afterProducts.map((product) => [product.id, product]));

      await this.auditGateway.write({
        action: STOCK_AUDIT_ACTION.SALE_REGISTERED,
        actor,
        metadata: {
          tipoTransacao: input.tipoTransacao,
          nomeCliente: input.nomeCliente ?? null,
          telefoneCliente: input.telefoneCliente ?? null,
          enderecoCliente: input.enderecoCliente ?? null,
          vendedor: resolvedSeller ?? null,
          formaPagamento: resolvedPaymentMethod ?? null,
          valorTotal: input.valorTotal ?? null,
          itens: input.items.map((item) => {
            const before = beforeMap.get(item.productId);
            const after = afterMap.get(item.productId);
            return {
              productId: item.productId,
              quantidadeVendida: item.quantidade,
              estoqueAntes: before?.quantidade ?? null,
              estoqueDepois: after?.quantidade ?? null,
            };
          }),
        },
      });

      return { success: true } as const;
    } catch (error) {
      await this.auditGateway.write({
        action: STOCK_AUDIT_ACTION.SALE_REGISTERED,
        status: "failed",
        actor,
        metadata: {
          error: error instanceof Error ? error.message : "unknown_error",
          tipoTransacao: input.tipoTransacao,
          nomeCliente: input.nomeCliente ?? null,
          telefoneCliente: input.telefoneCliente ?? null,
          enderecoCliente: input.enderecoCliente ?? null,
          vendedor: resolvedSeller ?? null,
          formaPagamento: resolvedPaymentMethod ?? null,
          valorTotal: input.valorTotal ?? null,
          itens: input.items,
        },
      });
      throw error;
    }
  }

  async getByDateRange(input: { startDate: Date; endDate: Date }) {
    return await db.getVendasByDate(input.startDate, input.endDate);
  }

  async list(input: { page: number; limit: number; tipoTransacao?: string }) {
    return await db.getVendasPaginated(input.page, input.limit, input.tipoTransacao);
  }

  async cancelar(actor: Actor, input: { vendaId: number; motivo: string }) {
    const vendaAntes = await db.getVendaById(input.vendaId);
    const produtoAntes = vendaAntes ? await db.getProductById(vendaAntes.productId) : undefined;

    try {
      const result = await db.cancelarVenda(input.vendaId, input.motivo, actor.id);
      const vendaDepois = await db.getVendaById(input.vendaId);
      const produtoDepois = vendaAntes ? await db.getProductById(vendaAntes.productId) : undefined;

      await this.auditGateway.write({
        action: STOCK_AUDIT_ACTION.SALE_CANCELLED,
        actor,
        target: { vendaId: input.vendaId, productId: vendaAntes?.productId ?? null },
        metadata: {
          motivo: input.motivo,
          estoqueAntes: produtoAntes?.quantidade ?? null,
          estoqueDepois: produtoDepois?.quantidade ?? null,
          statusAntes: vendaAntes?.status ?? null,
          statusDepois: vendaDepois?.status ?? null,
          quantidadeVenda: vendaAntes?.quantidade ?? null,
        },
      });

      return result;
    } catch (error) {
      await this.auditGateway.write({
        action: STOCK_AUDIT_ACTION.SALE_CANCELLED,
        status: "failed",
        actor,
        target: { vendaId: input.vendaId },
        metadata: { motivo: input.motivo, error: error instanceof Error ? error.message : "unknown_error" },
      });
      throw error;
    }
  }

  async editar(actor: Actor, input: {
    vendaId: number;
    vendedor?: string;
    observacoes?: string;
    quantidade?: number;
    tipoTransacao?: "venda" | "troca" | "brinde" | "emprestimo" | "permuta";
  }) {
    const resolvedSeller = input.vendedor !== undefined
      ? await this.resolveSellerOrThrow(input.vendedor)
      : undefined;
    const updates = {
      ...input,
      vendedor: resolvedSeller,
    };
    const vendaAntes = await db.getVendaById(input.vendaId);
    const produtoAntes = vendaAntes ? await db.getProductById(vendaAntes.productId) : undefined;

    try {
      const result = await db.editarVenda(input.vendaId, updates, actor.id);
      const vendaDepois = await db.getVendaById(input.vendaId);
      const produtoDepois = vendaAntes ? await db.getProductById(vendaAntes.productId) : undefined;

      await this.auditGateway.write({
        action: STOCK_AUDIT_ACTION.SALE_EDITED,
        actor,
        target: { vendaId: input.vendaId, productId: vendaAntes?.productId ?? null },
        metadata: {
          updates: input,
          estoqueAntes: produtoAntes?.quantidade ?? null,
          estoqueDepois: produtoDepois?.quantidade ?? null,
          quantidadeVendaAntes: vendaAntes?.quantidade ?? null,
          quantidadeVendaDepois: vendaDepois?.quantidade ?? null,
        },
      });

      return result;
    } catch (error) {
      await this.auditGateway.write({
        action: STOCK_AUDIT_ACTION.SALE_EDITED,
        status: "failed",
        actor,
        target: { vendaId: input.vendaId },
        metadata: { updates: input, error: error instanceof Error ? error.message : "unknown_error" },
      });
      throw error;
    }
  }

  async byVendedor(input: { startDate: Date; endDate: Date }) {
    return await db.getVendasByVendedor(input.startDate, input.endDate);
  }

  async relatorio(input: {
    startDate?: Date;
    endDate?: Date;
    vendedor?: string;
    nomeCliente?: string;
  }) {
    return await db.getVendasRelatorio(input);
  }

  async exportarRelatorioPdf(input: {
    startDate?: Date;
    endDate?: Date;
    vendedor?: string;
    nomeCliente?: string;
  }) {
    const vendas = await db.getVendasRelatorio(input);
    return await generateVendasRelatorioPDF(vendas);
  }

  async exportarRelatorioExcel(input: {
    startDate?: Date;
    endDate?: Date;
    vendedor?: string;
    nomeCliente?: string;
  }) {
    const { generateVendasExcel } = await import("../../../../excelExport");
    const vendas = await db.getVendasRelatorio(input);
    return await generateVendasExcel(vendas);
  }

  async relatorioEncomendas(input: { nomeCliente?: string }) {
    return await db.getEncomendasRelatorio(input);
  }

  async exportarEncomendasPdf(input: { nomeCliente?: string }) {
    const encomendas = await db.getEncomendasRelatorio(input);
    return await generateEncomendasRelatorioPDF(encomendas);
  }

  async exportarEncomendasExcel(input: { nomeCliente?: string }) {
    const { generateEncomendasExcel } = await import("../../../../excelExport");
    const encomendas = await db.getEncomendasRelatorio(input);
    return await generateEncomendasExcel(encomendas);
  }

  async excluir(actor: Actor, input: { vendaId: number }) {
    const vendaAntes = await db.getVendaById(input.vendaId);
    const produtoAntes = vendaAntes ? await db.getProductById(vendaAntes.productId) : undefined;

    try {
      await db.excluirVenda(input.vendaId, actor.id);
      const produtoDepois = vendaAntes ? await db.getProductById(vendaAntes.productId) : undefined;

      await this.auditGateway.write({
        action: STOCK_AUDIT_ACTION.SALE_DELETED,
        actor,
        target: { vendaId: input.vendaId, productId: vendaAntes?.productId ?? null },
        metadata: {
          quantidadeVenda: vendaAntes?.quantidade ?? null,
          estoqueAntes: produtoAntes?.quantidade ?? null,
          estoqueDepois: produtoDepois?.quantidade ?? null,
        },
      });

      return { success: true } as const;
    } catch (error) {
      await this.auditGateway.write({
        action: STOCK_AUDIT_ACTION.SALE_DELETED,
        status: "failed",
        actor,
        target: { vendaId: input.vendaId },
        metadata: { error: error instanceof Error ? error.message : "unknown_error" },
      });
      throw error;
    }
  }

  async rankingVendedores(input: { startDate?: Date; endDate?: Date }) {
    return await db.getRankingVendedores(input);
  }

  async rankingProdutos(input: { startDate?: Date; endDate?: Date }) {
    return await db.getRankingProdutos(input);
  }
}
