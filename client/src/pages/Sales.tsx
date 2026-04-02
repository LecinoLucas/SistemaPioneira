import { trpc } from "@/lib/trpc";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import type { KeyboardEvent, ChangeEvent, DragEvent } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { SalesProductPickerCard } from "@/components/sales/SalesProductPickerCard";
import type { SaleFormState, ProductSearchState } from "@/components/sales/SalesProductPickerCard";
import { SalesCartCard } from "@/components/sales/SalesCartCard";
import { SalesImportDialog } from "@/components/sales/SalesImportDialog";
import type { ImportedDraft, DraftReviewState, PaymentMethodOption, MappingProduct } from "@/components/sales/SalesImportDialog";

interface SaleItem {
  productId: number;
  productName: string;
  medida: string;
  quantidade: number;
  estoque: number;
}

const INITIAL_PRODUCT_PRELIST_LIMIT = 20;
const SEARCH_PRODUCT_LIMIT = 100;
const INITIAL_VISIBLE_ROWS = 20;
const SEARCH_VISIBLE_ROWS = 60;

function normalizePaymentName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveKnownPaymentMethod(value: string, methods: PaymentMethodOption[] = []): string | null {
  const normalized = normalizePaymentName(value);
  if (!normalized) return null;

  const direct = methods.find((item) => {
    const label = normalizePaymentName(item.label);
    const key = normalizePaymentName(item.key);
    return label === normalized || key === normalized;
  });
  if (direct) return direct.key;

  const aliases = [
    normalized.includes("receber na entrega") ? "receber na entrega" : null,
    normalized === "pix" ? "pix" : null,
    normalized.includes("credito") ? "credito" : null,
    normalized.includes("debito") ? "debito" : null,
    normalized.includes("boleto") ? "boleto" : null,
    normalized.includes("transferencia") || normalized.includes("ted") ? "transferencia" : null,
    normalized.includes("dinheiro") || normalized.includes("especie") ? "dinheiro" : null,
    normalized.includes("multiplo") || normalized.includes("misto") ? "multiplo" : null,
  ].filter((value): value is string => Boolean(value));

  const semantic = methods.find((item) => {
    const label = normalizePaymentName(item.label);
    const key = normalizePaymentName(item.key);
    return aliases.some((alias) => label.includes(alias) || key.includes(alias));
  });
  return semantic?.key ?? null;
}

function getPaymentLabelByKey(key: string, methods: PaymentMethodOption[] = []): string {
  const found = methods.find((item) => item.key === key);
  return found?.label ?? key;
}

function normalizeSellerName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^\d+\s*[-:]\s*/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isSellerTokenMatch(candidate: string, normalizedSeller: string): boolean {
  if (!candidate || !normalizedSeller) return false;
  if (candidate === normalizedSeller) return true;
  if (candidate.includes(normalizedSeller) || normalizedSeller.includes(candidate)) return true;
  const parts = candidate.split(" ").filter((part) => part.length >= 3);
  return parts.some((part) => normalizedSeller.includes(part));
}

function resolveKnownSeller(value: string, sellers: string[] = []): string | null {
  const normalized = normalizeSellerName(value);
  if (!normalized) return null;
  const exact = sellers.find((item) => normalizeSellerName(item) === normalized);
  if (exact) return exact;
  const fuzzy = sellers.find((item) => isSellerTokenMatch(normalized, normalizeSellerName(item)));
  return fuzzy ?? null;
}

function suggestKnownSeller(value: string, sellers: string[] = []): string | null {
  const normalized = normalizeSellerName(value);
  if (!normalized) return null;
  const starts = sellers.find((item) => normalizeSellerName(item).startsWith(normalized));
  if (starts) return starts;
  const contains = sellers.find((item) => normalizeSellerName(item).includes(normalized));
  return contains ?? null;
}

function parseCurrencyInput(value: string): number | undefined {
  const normalized = value.replace(/\./g, "").replace(",", ".").trim();
  if (!normalized) return undefined;
  const parsed = Number.parseFloat(normalized);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function getTodayDateInputValue(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseImportedSaleDate(value?: string | null): Date | undefined {
  if (!value) return undefined;

  const datePart = value.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
  if (datePart) {
    return new Date(`${datePart}T12:00:00`);
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export default function Sales() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  // ── Manual sale form state ───────────────────────────────────────────────
  const [saleItems, setSaleItems] = useState<SaleItem[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [quantidade, setQuantidade] = useState(1);
  const [vendedor, setVendedor] = useState("");
  const [nomeCliente, setNomeCliente] = useState("");
  const [telefoneCliente, setTelefoneCliente] = useState("");
  const [enderecoCliente, setEnderecoCliente] = useState("");
  const [formasPagamento, setFormasPagamento] = useState<string[]>([]);
  const [dataVenda, setDataVenda] = useState(() => getTodayDateInputValue());
  const [valorTotalInput, setValorTotalInput] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [tipoTransacao, setTipoTransacao] = useState<"venda" | "troca" | "brinde" | "emprestimo" | "permuta">("venda");
  const [onlyInStock, setOnlyInStock] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [listQuantities, setListQuantities] = useState<Record<number, number>>({});
  const [keyboardActiveIndex, setKeyboardActiveIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // ── Import state ─────────────────────────────────────────────────────────
  const [isImportPanelOpen, setIsImportPanelOpen] = useState(false);
  const [importedDrafts, setImportedDrafts] = useState<ImportedDraft[]>([]);
  const [processedImports, setProcessedImports] = useState<Record<string, boolean>>({});
  const [draftReviewMap, setDraftReviewMap] = useState<Record<string, DraftReviewState>>({});
  const [isDragOver, setIsDragOver] = useState(false);
  const manualFileInputRef = useRef<HTMLInputElement | null>(null);

  // Refs for stable callbacks
  const sellersRef = useRef<string[]>([]);
  const paymentMethodsRef = useRef<PaymentMethodOption[]>([]);

  // ── Debounce search ───────────────────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const normalizedSearch = debouncedSearch.trim();
  const isSearchMode = normalizedSearch.length >= 2;

  // ── tRPC ──────────────────────────────────────────────────────────────────
  const utils = trpc.useUtils();

  const paymentMethodsQuery = trpc.catalogo.listPaymentMethods.useQuery(undefined, {
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const sellersQuery = trpc.catalogo.listSellers.useQuery(undefined, {
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const paymentMethods = useMemo<PaymentMethodOption[]>(() => {
    return (paymentMethodsQuery.data ?? [])
      .filter((item) => item.codigo?.trim() && item.nome?.trim())
      .map((item) => ({
        key: item.codigo.trim().toUpperCase(),
        label: item.nome.trim(),
        category: item.categoria?.trim() || "Outros",
      }));
  }, [paymentMethodsQuery.data]);

  const paymentMethodsLoading = paymentMethodsQuery.isLoading;

  const sellers = useMemo<string[]>(() => {
    return (sellersQuery.data ?? [])
      .map((item) => item.nome?.trim())
      .filter((item): item is string => Boolean(item));
  }, [sellersQuery.data]);

  // Keep refs in sync
  useEffect(() => { sellersRef.current = sellers; }, [sellers]);
  useEffect(() => { paymentMethodsRef.current = paymentMethods; }, [paymentMethods]);

  const {
    data: products,
    isLoading,
    error: productsError,
  } = trpc.products.list.useQuery(
    {
      searchTerm: isSearchMode ? normalizedSearch : undefined,
      onlyActiveForSales: true,
      page: 1,
      pageSize: isSearchMode ? SEARCH_PRODUCT_LIMIT : INITIAL_PRODUCT_PRELIST_LIMIT,
    },
    {
      enabled: true,
      placeholderData: (prev) => prev,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    }
  );

  const productsForMappingQuery = trpc.vendas.getProductsLiteForImport.useQuery(
    undefined,
    { staleTime: 60_000, refetchOnWindowFocus: false }
  );
  const mappingProducts = productsForMappingQuery.data ?? [];
  const mappingProductById = useMemo(() => {
    const map = new Map<number, (typeof mappingProducts)[number]>();
    for (const product of mappingProducts) map.set(product.id, product);
    return map;
  }, [mappingProducts]);

  const registrarVendaMutation = trpc.vendas.registrar.useMutation({
    onSuccess: () => {
      utils.products.list.invalidate();
      utils.dashboard.stats.invalidate();
      utils.products.lowStock.invalidate();
      utils.movimentacoes.list.invalidate();
      setSaleItems([]);
      toast.success("Venda registrada com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao registrar venda: " + error.message);
    },
  });

  const importFromUploadedFilesMutation = trpc.vendas.importFromUploadedFiles.useMutation({
    onSuccess: (payload) => {
      const incoming = (payload?.drafts ?? []) as ImportedDraft[];
      setImportedDrafts((prev) => {
        const map = new Map<string, ImportedDraft>();
        for (const draft of prev) map.set(draft.fileHash, draft);
        for (const draft of incoming) map.set(draft.fileHash, draft);
        return Array.from(map.values());
      });
      setDraftReviewMap((prev) => {
        const next = { ...prev };
        const currentSellers = sellersRef.current;
        const currentMethods = paymentMethodsRef.current;
        for (const draft of incoming) {
          const key = draft.fileHash || draft.filePath;
          if (next[key]) continue;
          next[key] = buildDraftState(draft, currentSellers, currentMethods);
        }
        return next;
      });
      if (incoming.length > 0) {
        toast.success(`${incoming.length} arquivo(s) processado(s). Vincule os itens e lance.`);
      }
    },
    onError: (error) => {
      toast.error(`Erro ao ler PDF: ${error.message}`);
    },
  });

  const registrarImportadaMutation = trpc.vendas.registrarImportada.useMutation({
    onSuccess: () => {
      utils.products.list.invalidate();
      utils.dashboard.stats.invalidate();
      utils.products.lowStock.invalidate();
      utils.movimentacoes.list.invalidate();
      utils.vendas.list.invalidate();
      utils.vendas.relatorio.invalidate();
      utils.vendas.byVendedor.invalidate();
      utils.vendas.rankingProdutos.invalidate();
      utils.vendas.rankingVendedores.invalidate();
      utils.vendas.importHistory.invalidate();
      toast.success("Venda importada registrada com sucesso!");
    },
    onError: (error) => {
      toast.error(`Erro ao registrar venda importada: ${error.message}`);
    },
  });

  // ── Draft helpers ─────────────────────────────────────────────────────────
  function buildDraftState(
    draft: ImportedDraft,
    currentSellers: string[],
    currentMethods: PaymentMethodOption[]
  ): DraftReviewState {
    const includeByIndex: Record<number, boolean> = {};
    const quantityByIndex: Record<number, number> = {};
    const manualProductByIndex: Record<number, number | null> = {};

    draft.itens.forEach((item, index) => {
      includeByIndex[index] = item.productId != null;
      quantityByIndex[index] = Math.max(1, item.quantidade);
      manualProductByIndex[index] = null;
    });

    const vendedorKey = draft.vendedor
      ? (resolveKnownSeller(draft.vendedor, currentSellers) ?? "")
      : "";

    const extracted = (draft.formasPagamentoExtraidas ?? []).map((e) => ({
      raw: e.descricao,
      key: resolveKnownPaymentMethod(e.descricao, currentMethods),
    }));
    const extractedKeys = extracted.filter((e): e is typeof e & { key: string } => Boolean(e.key)).map((e) => e.key);
    const unresolvedFromExtracted = extracted.filter((e) => !e.key).map((e) => e.raw);

    const fallbackRaw = draft.formaPagamento ?? "";
    const fallbackKey = resolveKnownPaymentMethod(fallbackRaw, currentMethods);

    const pagamentoKeys =
      extractedKeys.length > 0
        ? extractedKeys
        : fallbackKey
          ? [fallbackKey]
          : [];

    // Unresolved = strings from PDF that couldn't be matched to any registered method
    const unresolvedPagamentos =
      extractedKeys.length > 0
        ? unresolvedFromExtracted
        : !fallbackKey && fallbackRaw.trim()
          ? [fallbackRaw]
          : [];

    return {
      includeByIndex,
      quantityByIndex,
      manualProductByIndex,
      clienteOverride: draft.cliente ?? "",
      vendedorKey,
      pagamentoKeys,
      unresolvedPagamentos,
    };
  }

  const getDraftKey = useCallback((draft: ImportedDraft) => draft.fileHash || draft.filePath, []);

  const getDraftState = useCallback(
    (draft: ImportedDraft): DraftReviewState => {
      const key = getDraftKey(draft);
      return (
        draftReviewMap[key] ??
        buildDraftState(draft, sellersRef.current, paymentMethodsRef.current)
      );
    },
    [draftReviewMap, getDraftKey]
  );

  const updateDraftState = useCallback(
    (draft: ImportedDraft, updater: (current: DraftReviewState) => DraftReviewState) => {
      const key = getDraftKey(draft);
      setDraftReviewMap((prev) => {
        const current =
          prev[key] ?? buildDraftState(draft, sellersRef.current, paymentMethodsRef.current);
        return { ...prev, [key]: updater(current) };
      });
    },
    [getDraftKey]
  );

  const getMissingMappingsCount = useCallback(
    (draft: ImportedDraft) => {
      const state = getDraftState(draft);
      return draft.itens.filter((item, index) => {
        const included = state.includeByIndex[index] !== false;
        if (!included) return false;
        const productId = state.manualProductByIndex[index] ?? item.productId ?? null;
        return productId == null;
      }).length;
    },
    [getDraftState]
  );

  const getApprovedItems = useCallback(
    (draft: ImportedDraft) => {
      const state = getDraftState(draft);
      return draft.itens
        .map((item, index) => {
          const included = state.includeByIndex[index] !== false;
          if (!included) return null;
          const productId = state.manualProductByIndex[index] ?? item.productId ?? null;
          if (!productId) return null;
          return {
            productId,
            quantidade: Math.max(1, state.quantityByIndex[index] ?? item.quantidade ?? 1),
          };
        })
        .filter((item): item is { productId: number; quantidade: number } => item !== null);
    },
    [getDraftState]
  );

  const registerDraftNow = useCallback(
    async (draft: ImportedDraft) => {
      if ((draft.validationErrors?.length ?? 0) > 0) {
        toast.error(draft.validationErrors[0]);
        return;
      }

      const state = getDraftState(draft);

      if (!state.clienteOverride.trim()) {
        toast.error("Informe o nome do cliente.");
        return;
      }
      if (!state.vendedorKey) {
        toast.error("Selecione o vendedor.");
        return;
      }
      const filledPagamentos = state.pagamentoKeys.filter((k) => k.trim());
      if (filledPagamentos.length === 0) {
        toast.error("Selecione pelo menos uma forma de pagamento.");
        return;
      }

      const missing = getMissingMappingsCount(draft);
      if (missing > 0) {
        toast.error(`Vincule ${missing} item(ns) ao estoque antes de lançar.`);
        return;
      }

      const items = getApprovedItems(draft);
      if (items.length === 0) {
        toast.error("Nenhum item vinculado para lançar.");
        return;
      }

      const outOfStockLinked = items
        .map((item) => mappingProductById.get(item.productId))
        .filter((product): product is NonNullable<typeof product> => Boolean(product))
        .filter((product) => product.quantidade <= 0);
      if (outOfStockLinked.length > 0) {
        toast.error(
          `Existem produtos sem estoque vinculados: ${outOfStockLinked
            .map((product) => `${product.name} (${product.medida})`)
            .join(", ")}.`
        );
        return;
      }

      // Check for duplicate product IDs
      const productIds = items.map((i) => i.productId);
      const uniqueIds = new Set(productIds);
      if (uniqueIds.size < productIds.length) {
        toast.error("Existem produtos duplicados vinculados. Cada item deve apontar para um produto diferente.");
        return;
      }

      const formaPagamentoFinal = filledPagamentos
        .map((k) => getPaymentLabelByKey(k, paymentMethodsRef.current))
        .join(" + ");

      await registrarImportadaMutation.mutateAsync({
        items,
        vendedor: state.vendedorKey,
        nomeCliente: state.clienteOverride.trim(),
        formaPagamento: formaPagamentoFinal,
        dataVenda: parseImportedSaleDate(draft.dataVenda),
        telefoneCliente: draft.telefoneCliente ?? undefined,
        enderecoCliente: draft.endereco ?? undefined,
        valorTotal: draft.total ?? undefined,
        observacoes: `Importado de PDF: ${draft.fileName}`,
        tipoTransacao: "venda",
        importMeta: {
          fileHash: draft.fileHash,
          fileName: draft.fileName,
          documentNumber: draft.documentNumber,
          total: draft.total,
        },
      });

      setProcessedImports((prev) => ({ ...prev, [getDraftKey(draft)]: true }));
      utils.vendas.importHistory.invalidate();
    },
    [
      getDraftState,
      getMissingMappingsCount,
      getApprovedItems,
      registrarImportadaMutation,
      getDraftKey,
      mappingProductById,
      utils.vendas.importHistory,
    ]
  );

  // ── File upload ───────────────────────────────────────────────────────────
  const fileToBase64 = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== "string") {
          reject(new Error("Falha ao ler arquivo"));
          return;
        }
        const base64 = result.includes(",") ? result.split(",")[1] : result;
        resolve(base64);
      };
      reader.onerror = () => reject(new Error("Falha ao ler arquivo"));
      reader.readAsDataURL(file);
    });
  }, []);

  const processFiles = useCallback(
    async (files: File[]) => {
      const pdfs = files.filter(
        (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")
      );
      if (!pdfs.length) {
        toast.warning("Selecione arquivos PDF.");
        return;
      }
      try {
        const payloadFiles = await Promise.all(
          pdfs.map(async (file) => ({
            fileName: file.name,
            fileBase64: await fileToBase64(file),
          }))
        );
        await importFromUploadedFilesMutation.mutateAsync({ files: payloadFiles });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Falha ao processar arquivos");
      }
    },
    [fileToBase64, importFromUploadedFilesMutation]
  );

  const onFilesSelected = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      await processFiles(files);
      event.target.value = "";
    },
    [processFiles]
  );

  const onDrop = useCallback(
    async (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragOver(false);
      await processFiles(Array.from(event.dataTransfer.files ?? []));
    },
    [processFiles]
  );

  // ── Manual sale form ──────────────────────────────────────────────────────
  const searchedProducts = useMemo(() => products?.items ?? [], [products?.items]);
  const productById = useMemo(() => {
    const map = new Map<number, (typeof searchedProducts)[number]>();
    for (const product of searchedProducts) map.set(product.id, product);
    return map;
  }, [searchedProducts]);

  const filteredProducts = useMemo(
    () => (onlyInStock ? searchedProducts.filter((p) => p.quantidade > 0) : searchedProducts),
    [onlyInStock, searchedProducts]
  );

  const displayedProducts = useMemo(
    () => filteredProducts.slice(0, isSearchMode ? SEARCH_VISIBLE_ROWS : INITIAL_VISIBLE_ROWS),
    [filteredProducts, isSearchMode]
  );

  useEffect(() => {
    if (displayedProducts.length === 0) {
      setKeyboardActiveIndex(0);
      return;
    }
    setKeyboardActiveIndex((prev) => Math.min(prev, displayedProducts.length - 1));
  }, [displayedProducts]);

  const selectedProduct = useMemo(
    () => filteredProducts.find((p) => p.id.toString() === selectedProductId),
    [filteredProducts, selectedProductId]
  );

  const addItem = useCallback(
    (productIdOverride?: number, quantidadeOverride?: number) => {
      const targetProductId = productIdOverride ?? Number.parseInt(selectedProductId, 10);
      if (!targetProductId) {
        toast.error("Selecione um produto");
        return;
      }
      const quantidadeToAdd = Math.max(1, quantidadeOverride ?? quantidade);
      const product = productById.get(targetProductId);
      if (!product) return;

      const existingItem = saleItems.find((item) => item.productId === product.id);
      const nextQuantity = existingItem ? existingItem.quantidade + quantidadeToAdd : quantidadeToAdd;

      if (tipoTransacao === "venda" && nextQuantity > product.quantidade) {
        toast.error(`Estoque insuficiente para "${product.name}". Disponível: ${product.quantidade}`);
        return;
      }

      if (existingItem) {
        setSaleItems(
          saleItems.map((item) =>
            item.productId === product.id
              ? { ...item, quantidade: item.quantidade + quantidadeToAdd }
              : item
          )
        );
      } else {
        setSaleItems([
          ...saleItems,
          {
            productId: product.id,
            productName: product.name,
            medida: product.medida,
            quantidade: quantidadeToAdd,
            estoque: product.quantidade,
          },
        ]);
      }
      setSelectedProductId("");
      setQuantidade(1);
    },
    [productById, quantidade, saleItems, selectedProductId, tipoTransacao]
  );

  const updateListQuantity = useCallback((productId: number, nextValue: number) => {
    setListQuantities((prev) => ({ ...prev, [productId]: Math.max(1, nextValue) }));
  }, []);

  const getListQuantity = useCallback(
    (productId: number) => Math.max(1, listQuantities[productId] ?? 1),
    [listQuantities]
  );

  const selectFirstProductFromSearch = useCallback(() => {
    if (filteredProducts.length === 0) return;
    setSelectedProductId(filteredProducts[0].id.toString());
  }, [filteredProducts]);

  const clearProductSearch = useCallback(() => {
    setSearchTerm("");
    setSelectedProductId("");
    setKeyboardActiveIndex(0);
  }, []);

  useEffect(() => {
    const onGlobalShortcut = (event: globalThis.KeyboardEvent) => {
      const isFocusShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k";
      if (isFocusShortcut) {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (event.key === "Escape" && document.activeElement === searchInputRef.current) {
        event.preventDefault();
        clearProductSearch();
      }
    };
    window.addEventListener("keydown", onGlobalShortcut);
    return () => window.removeEventListener("keydown", onGlobalShortcut);
  }, [clearProductSearch]);

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      clearProductSearch();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (displayedProducts.length === 0) return;
      const nextIndex = Math.min(keyboardActiveIndex + 1, displayedProducts.length - 1);
      setKeyboardActiveIndex(nextIndex);
      setSelectedProductId(displayedProducts[nextIndex].id.toString());
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (displayedProducts.length === 0) return;
      const nextIndex = Math.max(keyboardActiveIndex - 1, 0);
      setKeyboardActiveIndex(nextIndex);
      setSelectedProductId(displayedProducts[nextIndex].id.toString());
      return;
    }
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (selectedProductId) {
      addItem();
      return;
    }
    const highlighted = displayedProducts[keyboardActiveIndex] ?? filteredProducts[0];
    if (highlighted) {
      setSelectedProductId(highlighted.id.toString());
      toast.info(`Produto selecionado: ${highlighted.name}`);
    }
  };

  const removeItem = useCallback(
    (productId: number) => {
      setSaleItems(saleItems.filter((item) => item.productId !== productId));
    },
    [saleItems]
  );

  const updateSaleItemQuantity = useCallback(
    (productId: number, nextQuantity: number) => {
      if (nextQuantity <= 0) {
        removeItem(productId);
        return;
      }
      const target = saleItems.find((item) => item.productId === productId);
      if (!target) return;
      if (tipoTransacao === "venda" && nextQuantity > target.estoque) {
        toast.error(`Estoque insuficiente para "${target.productName}". Disponível: ${target.estoque}`);
        return;
      }
      setSaleItems((prev) =>
        prev.map((item) =>
          item.productId === productId ? { ...item, quantidade: nextQuantity } : item
        )
      );
    },
    [removeItem, saleItems, tipoTransacao]
  );

  const clearSaleItems = useCallback(() => {
    setSaleItems([]);
    toast.info("Carrinho limpo.");
  }, []);

  const handleSubmit = () => {
    if (saleItems.length === 0) {
      toast.error("Adicione pelo menos um produto à venda");
      return;
    }
    if (!vendedor) {
      toast.error("Selecione o vendedor");
      return;
    }
    const resolvedSeller = resolveKnownSeller(vendedor, sellers);
    if (!resolvedSeller) {
      const suggestion = suggestKnownSeller(vendedor, sellers);
      toast.error(
        suggestion
          ? `Vendedor "${vendedor}" não cadastrado. Sugestão: "${suggestion}".`
          : `Vendedor "${vendedor}" não cadastrado.`
      );
      return;
    }
    if (!nomeCliente.trim()) {
      toast.error("Informe o nome do cliente para confirmar a venda.");
      return;
    }
    if (paymentMethods.length === 0) {
      toast.error("Cadastre ao menos uma forma de pagamento em Categorias antes de lançar a venda.");
      return;
    }
    const filledFormas = formasPagamento.filter((k) => k.trim());
    if (filledFormas.length === 0) {
      toast.error("Informe pelo menos uma forma de pagamento.");
      return;
    }
    const resolvedPaymentKeys = filledFormas
      .map((k) => resolveKnownPaymentMethod(k, paymentMethods))
      .filter((k): k is string => Boolean(k));
    if (resolvedPaymentKeys.length === 0) {
      toast.error("Forma de pagamento inválida. Selecione uma opção cadastrada.");
      return;
    }
    if (!dataVenda) {
      toast.error("Informe a data da venda para confirmar.");
      return;
    }
    const formaPagamentoFinal = resolvedPaymentKeys
      .map((k) => getPaymentLabelByKey(k, paymentMethods))
      .join(" + ");
    registrarVendaMutation.mutate({
      items: saleItems.map((item) => ({
        productId: item.productId,
        quantidade: item.quantidade,
      })),
      vendedor: resolvedSeller,
      nomeCliente: nomeCliente || undefined,
      telefoneCliente: telefoneCliente || undefined,
      enderecoCliente: enderecoCliente || undefined,
      formaPagamento: formaPagamentoFinal,
      dataVenda: dataVenda ? new Date(`${dataVenda}T12:00:00`) : undefined,
      valorTotal: parseCurrencyInput(valorTotalInput),
      observacoes: observacoes || undefined,
      tipoTransacao,
    });
    setVendedor("");
    setNomeCliente("");
    setTelefoneCliente("");
    setEnderecoCliente("");
    setFormasPagamento([]);
    setDataVenda(getTodayDateInputValue());
    setValorTotalInput("");
    setObservacoes("");
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const totalItems = saleItems.length;
  const totalUnits = saleItems.reduce((acc, item) => acc + item.quantidade, 0);
  const lowStockItems = saleItems.filter((item) => item.quantidade > item.estoque);
  const pendingImportCount = importedDrafts.filter((d) => !processedImports[getDraftKey(d)]).length;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Registrar Vendas</h1>
          <p className="text-muted-foreground mt-2">
            Registre as vendas do dia e atualize o estoque automaticamente
          </p>
        </div>
        <Button
          type="button"
          variant={pendingImportCount > 0 ? "default" : "outline"}
          className="w-full sm:w-auto gap-2"
          data-testid="sales-import-open"
          onClick={() => setIsImportPanelOpen(true)}
        >
          <UploadCloud className="h-4 w-4" />
          Importar PDF
          {pendingImportCount > 0 && (
            <Badge variant="secondary" className="ml-1">
              {pendingImportCount}
            </Badge>
          )}
        </Button>
      </div>

      {/* Error state */}
      {productsError && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="pt-6">
            <p className="text-sm text-destructive font-medium">
              {isAdmin
                ? "Não foi possível carregar os produtos. Confira o backend e a conexão com o banco."
                : "Servidor fora do ar."}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Import dialog */}
      <SalesImportDialog
        open={isImportPanelOpen}
        onOpenChange={setIsImportPanelOpen}
        isDragOver={isDragOver}
        setIsDragOver={setIsDragOver}
        onDrop={onDrop}
        onFilesSelected={onFilesSelected}
        manualFileInputRef={manualFileInputRef}
        isProcessing={importFromUploadedFilesMutation.isPending}
        importedDrafts={importedDrafts}
        setImportedDrafts={setImportedDrafts}
        pendingImportCount={pendingImportCount}
        processedImports={processedImports}
        setProcessedImports={setProcessedImports}
        setDraftReviewMap={setDraftReviewMap}
        getDraftKey={getDraftKey}
        getDraftState={getDraftState}
        getMissingMappingsCount={getMissingMappingsCount}
        getApprovedItems={getApprovedItems}
        updateDraftState={updateDraftState}
        registerDraftNow={registerDraftNow}
        isRegistering={registrarImportadaMutation.isPending}
        sellers={sellers}
        paymentMethods={paymentMethods}
        mappingProducts={mappingProducts}
      />

      {/* Manual sale form */}
      <div className="grid gap-6 lg:grid-cols-2">
        <SalesProductPickerCard
          form={{
            sellers,
            vendedor, setVendedor,
            nomeCliente, setNomeCliente,
            telefoneCliente, setTelefoneCliente,
            formasPagamento, setFormasPagamento,
            paymentMethods, paymentMethodsLoading,
            enderecoCliente, setEnderecoCliente,
            dataVenda, setDataVenda,
            valorTotalInput, setValorTotalInput,
            tipoTransacao, setTipoTransacao,
          } satisfies SaleFormState}
          search={{
            searchInputRef,
            searchTerm, setSearchTerm,
            handleSearchKeyDown,
            onlyInStock, setOnlyInStock,
            selectedProduct,
            isLoading,
            hasProductsLoaded: Boolean(products),
            filteredProducts, displayedProducts, isSearchMode,
            selectedProductId, setSelectedProductId,
            keyboardActiveIndex, setKeyboardActiveIndex,
            getListQuantity, updateListQuantity,
            addItem,
            quantidade, setQuantidade,
            selectFirstProductFromSearch,
          } satisfies ProductSearchState}
        />

        <SalesCartCard
          saleItems={saleItems}
          totalItems={totalItems}
          totalUnits={totalUnits}
          lowStockItemsCount={lowStockItems.length}
          updateSaleItemQuantity={updateSaleItemQuantity}
          removeItem={removeItem}
          observacoes={observacoes}
          setObservacoes={setObservacoes}
          handleSubmit={handleSubmit}
          submitPending={registrarVendaMutation.isPending}
          vendedor={vendedor}
          clearSaleItems={clearSaleItems}
        />
      </div>
    </div>
  );
}
