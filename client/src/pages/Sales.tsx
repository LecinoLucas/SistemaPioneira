import { trpc } from "@/lib/trpc";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import type { KeyboardEvent } from "react";
import type { ChangeEvent, DragEvent } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2, ShoppingCart, Search, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

interface SaleItem {
  productId: number;
  productName: string;
  medida: string;
  quantidade: number;
  estoque: number;
}

interface ImportedDraftItem {
  productId: number | null;
  productName: string;
  medida: string | null;
  quantidade: number;
  valorUnitario: number | null;
  valorTotal: number | null;
  confidence: number;
  sourceLine: string;
}

interface ImportedDraft {
  fileName: string;
  filePath: string;
  fileHash: string;
  documentNumber: string | null;
  parsedAt: string;
  cliente: string | null;
  telefoneCliente: string | null;
  vendedor: string | null;
  dataVenda: string | null;
  formaPagamento: string | null;
  formasPagamentoExtraidas: Array<{
    descricao: string;
    categoria: "instantaneo" | "entrega" | "cartao" | "boleto" | "dinheiro" | "transferencia" | "outros";
    vencimento: string | null;
    valor: number | null;
    documento: string | null;
  }>;
  endereco: string | null;
  total: number | null;
  desconto: number | null;
  subtotal: number | null;
  itens: ImportedDraftItem[];
  warnings: string[];
}

interface DraftReviewState {
  reviewed: boolean;
  approved: boolean;
  reviewNote: string;
  includeByIndex: Record<number, boolean>;
  quantityByIndex: Record<number, number>;
  manualProductByIndex: Record<number, number | null>;
}

const DEFAULT_SELLERS = ["Cleonice", "Luciano", "Vanuza", "Thuanny"];
type PaymentMethodOption = { key: string; label: string; category: string };

const DEFAULT_PAYMENT_METHODS: PaymentMethodOption[] = [
  { key: "PIX", label: "PIX", category: "Instantâneo" },
  { key: "RECEBER_NA_ENTREGA", label: "RECEBER NA ENTREGA", category: "Entrega" },
  { key: "DINHEIRO", label: "DINHEIRO", category: "Dinheiro" },
  { key: "CARTAO_CREDITO", label: "CARTÃO DE CRÉDITO", category: "Cartão" },
  { key: "CARTAO_DEBITO", label: "CARTÃO DE DÉBITO", category: "Cartão" },
  { key: "BOLETO", label: "BOLETO", category: "Boleto" },
  { key: "TRANSFERENCIA", label: "TRANSFERÊNCIA", category: "Transferência" },
  { key: "MULTIPLO", label: "MÚLTIPLO (2+ formas)", category: "Combinado" },
  { key: "OUTROS", label: "OUTROS", category: "Outros" },
] as const;
const PAYMENT_CATEGORY_LABELS: Record<string, string> = {
  instantaneo: "Instantâneo",
  entrega: "Entrega",
  cartao: "Cartão",
  boleto: "Boleto",
  dinheiro: "Dinheiro",
  transferencia: "Transferência",
  outros: "Outros",
};
const PERF_LATENCY_WARNING_MS = 500;
const PERF_LATENCY_CRITICAL_MS = 1200;
const PERF_RENDER_WARNING = 120;
const INITIAL_PRODUCT_PRELIST_LIMIT = 20;
const SEARCH_PRODUCT_LIMIT = 100;
const INITIAL_VISIBLE_ROWS = 20;
const SEARCH_VISIBLE_ROWS = 60;

type DraftQuality = {
  label: "Alta" | "Média" | "Baixa";
  className: string;
};

function resolveDraftQuality(draft: ImportedDraft): DraftQuality {
  const totalItems = draft.itens.length;
  const recognizedItems = draft.itens.filter((item) => item.productId != null).length;
  const avgConfidence = totalItems
    ? draft.itens.reduce((acc, item) => acc + item.confidence, 0) / totalItems
    : 0;
  const warningPenalty = draft.warnings.length > 1 ? 0.15 : draft.warnings.length > 0 ? 0.08 : 0;
  const score = (totalItems ? recognizedItems / totalItems : 0) * 0.65 + avgConfidence * 0.35 - warningPenalty;

  if (score >= 0.8) {
    return { label: "Alta", className: "bg-emerald-100 text-emerald-700 border-emerald-300" };
  }
  if (score >= 0.6) {
    return { label: "Média", className: "bg-amber-100 text-amber-700 border-amber-300" };
  }
  return { label: "Baixa", className: "bg-rose-100 text-rose-700 border-rose-300" };
}

function parseCurrencyInput(value: string): number | undefined {
  const normalized = value.replace(/\./g, "").replace(",", ".").trim();
  if (!normalized) return undefined;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
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

function resolveKnownPaymentMethod(value: string, methods: PaymentMethodOption[] = DEFAULT_PAYMENT_METHODS): string | null {
  const normalized = normalizePaymentName(value);
  if (!normalized) return null;

  if (normalized.includes("receber na entrega")) return "RECEBER_NA_ENTREGA";
  if (normalized === "pix") return "PIX";
  if (normalized.includes("credito")) return "CARTAO_CREDITO";
  if (normalized.includes("debito")) return "CARTAO_DEBITO";
  if (normalized.includes("boleto")) return "BOLETO";
  if (normalized.includes("transferencia") || normalized.includes("ted")) return "TRANSFERENCIA";
  if (normalized.includes("dinheiro") || normalized.includes("especie")) return "DINHEIRO";
  if (normalized.includes("multiplo") || normalized.includes("misto")) return "MULTIPLO";

  const fallback = methods.find((item) => normalizePaymentName(item.label) === normalized);
  return fallback?.key ?? null;
}

function getPaymentLabelByKey(key: string, methods: PaymentMethodOption[] = DEFAULT_PAYMENT_METHODS): string {
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

function resolveKnownSeller(value: string, sellers: string[] = DEFAULT_SELLERS): string | null {
  const normalized = normalizeSellerName(value);
  if (!normalized) return null;
  const exact = sellers.find((item) => normalizeSellerName(item) === normalized);
  if (exact) return exact;
  const fuzzy = sellers.find((item) => isSellerTokenMatch(normalized, normalizeSellerName(item)));
  if (fuzzy) return fuzzy;
  return null;
}

function suggestKnownSeller(value: string, sellers: string[] = DEFAULT_SELLERS): string | null {
  const normalized = normalizeSellerName(value);
  if (!normalized) return null;
  const starts = sellers.find((item) => normalizeSellerName(item).startsWith(normalized));
  if (starts) return starts;
  const contains = sellers.find((item) => normalizeSellerName(item).includes(normalized));
  return contains ?? null;
}

export default function Sales() {
  const isDev = import.meta.env.DEV;
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [saleItems, setSaleItems] = useState<SaleItem[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [quantidade, setQuantidade] = useState(1);
  const [importFolderPath, setImportFolderPath] = useState("");
  const [importClientName, setImportClientName] = useState("");
  const [isImportPanelOpen, setIsImportPanelOpen] = useState(false);
  const [importedDrafts, setImportedDrafts] = useState<ImportedDraft[]>([]);
  const [processedImports, setProcessedImports] = useState<Record<string, boolean>>({});
  const [draftReviewMap, setDraftReviewMap] = useState<Record<string, DraftReviewState>>({});
  const [batchReviewNote, setBatchReviewNote] = useState("");
  const [importQualityFilter, setImportQualityFilter] = useState<"all" | "high" | "medium" | "low" | "pending">("all");
  const [historySearch, setHistorySearch] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const manualFileInputRef = useRef<HTMLInputElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [onlyInStock, setOnlyInStock] = useState(true);
  const [listQuantities, setListQuantities] = useState<Record<number, number>>({});
  const normalizedSearch = debouncedSearch.trim();
  const isSearchMode = normalizedSearch.length >= 2;
  const [keyboardActiveIndex, setKeyboardActiveIndex] = useState(0);
  const renderCountRef = useRef(0);
  const queryStartAtRef = useRef<number | null>(null);
  const [lastQueryMs, setLastQueryMs] = useState<number | null>(null);
  renderCountRef.current += 1;

  // Debounce: só dispara a query após 300ms sem digitar
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    if (normalizedSearch.length < 2) return;
    queryStartAtRef.current = performance.now();
  }, [normalizedSearch]);
  const [vendedor, setVendedor] = useState("");
  const [nomeCliente, setNomeCliente] = useState("");
  const [telefoneCliente, setTelefoneCliente] = useState("");
  const [enderecoCliente, setEnderecoCliente] = useState("");
  const [formaPagamento, setFormaPagamento] = useState("");
  const [dataVenda, setDataVenda] = useState("");
  const [valorTotalInput, setValorTotalInput] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [tipoTransacao, setTipoTransacao] = useState<"venda" | "troca" | "brinde" | "emprestimo" | "permuta">("venda");

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
    const fromCatalog = (paymentMethodsQuery.data ?? [])
      .filter((item) => item.codigo?.trim() && item.nome?.trim())
      .map((item) => ({
        key: item.codigo.trim().toUpperCase(),
        label: item.nome.trim(),
        category: item.categoria?.trim() || "Outros",
      }));
    return fromCatalog.length > 0 ? fromCatalog : [...DEFAULT_PAYMENT_METHODS];
  }, [paymentMethodsQuery.data]);
  const paymentMethodsLoading = paymentMethodsQuery.isLoading;
  const sellers = useMemo<string[]>(
    () => {
      const fromCatalog = (sellersQuery.data ?? [])
        .map((item) => item.nome?.trim())
        .filter((item): item is string => Boolean(item));
      return fromCatalog.length > 0 ? fromCatalog : [...DEFAULT_SELLERS];
    },
    [sellersQuery.data]
  );
  // Busca no backend: retorna uma lista curta e performática para seleção rápida
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
  const productsForMappingQuery = trpc.products.list.useQuery(
    {
      page: 1,
      pageSize: 500,
      includeArchived: false,
    },
    {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    }
  );

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

  const importFromFolderMutation = trpc.vendas.importFromFolder.useMutation({
    onSuccess: (payload) => {
      const drafts = (payload?.drafts ?? []) as ImportedDraft[];
      setImportedDrafts(drafts);
      setProcessedImports({});
      setDraftReviewMap(() => {
        const next: Record<string, DraftReviewState> = {};
        for (const draft of drafts) {
          const key = draft.fileHash || draft.filePath;
          const includeByIndex: Record<number, boolean> = {};
          const quantityByIndex: Record<number, number> = {};
          const manualProductByIndex: Record<number, number | null> = {};
          draft.itens.forEach((item, index) => {
            if (item.productId != null) {
              includeByIndex[index] = true;
              quantityByIndex[index] = Math.max(1, item.quantidade);
              manualProductByIndex[index] = null;
            }
          });
          next[key] = { reviewed: false, approved: false, reviewNote: "", includeByIndex, quantityByIndex, manualProductByIndex };
        }
        return next;
      });
      setHistoryPage(1);
      toast.success(`Importação concluída: ${payload?.totalFiles ?? 0} arquivo(s) analisado(s).`);
      utils.vendas.importHistory.invalidate();
    },
    onError: (error) => {
      toast.error(`Erro ao importar PDFs: ${error.message}`);
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
        for (const draft of incoming) {
          const key = draft.fileHash || draft.filePath;
          if (next[key]) continue;
          const includeByIndex: Record<number, boolean> = {};
          const quantityByIndex: Record<number, number> = {};
          const manualProductByIndex: Record<number, number | null> = {};
          draft.itens.forEach((item, index) => {
            if (item.productId != null) {
              includeByIndex[index] = true;
              quantityByIndex[index] = Math.max(1, item.quantidade);
              manualProductByIndex[index] = null;
            }
          });
          next[key] = { reviewed: false, approved: false, reviewNote: "", includeByIndex, quantityByIndex, manualProductByIndex };
        }
        return next;
      });
      toast.success(`Arquivo(s) selecionado(s): ${payload?.totalFiles ?? 0} processado(s).`);
    },
    onError: (error) => {
      toast.error(`Erro na importação manual: ${error.message}`);
    },
  });

  const registrarImportadaMutation = trpc.vendas.registrarImportada.useMutation({
    onSuccess: () => {
      utils.products.list.invalidate();
      utils.dashboard.stats.invalidate();
      utils.products.lowStock.invalidate();
      utils.movimentacoes.list.invalidate();
      toast.success("Venda importada registrada com sucesso!");
    },
    onError: (error) => {
      toast.error(`Erro ao registrar venda importada: ${error.message}`);
    },
  });

  const importHistoryQuery = trpc.vendas.importHistory.useQuery(
    {
      page: historyPage,
      pageSize: 8,
      search: historySearch.trim() || undefined,
    },
    {
      staleTime: 10_000,
      refetchOnWindowFocus: false,
    }
  );

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

  const processManualFiles = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      const pdfs = files.filter((file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));
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

        await importFromUploadedFilesMutation.mutateAsync({
          files: payloadFiles,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Falha ao processar arquivos";
        toast.error(message);
      }
    },
    [fileToBase64, importFromUploadedFilesMutation]
  );

  const onManualFilesSelected = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      await processManualFiles(files);
      event.target.value = "";
    },
    [processManualFiles]
  );

  const onDropManualFiles = useCallback(
    async (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragOver(false);
      const files = Array.from(event.dataTransfer.files ?? []);
      await processManualFiles(files);
    },
    [processManualFiles]
  );

  const searchedProducts = useMemo(() => products?.items ?? [], [products?.items]);
  const productById = useMemo(() => {
    const map = new Map<number, (typeof searchedProducts)[number]>();
    for (const product of searchedProducts) {
      map.set(product.id, product);
    }
    return map;
  }, [searchedProducts]);

  const filteredProducts = useMemo(
    () => (onlyInStock ? searchedProducts.filter((product) => product.quantidade > 0) : searchedProducts),
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
    () => filteredProducts.find((product) => product.id.toString() === selectedProductId),
    [filteredProducts, selectedProductId]
  );

  useEffect(() => {
    if (isLoading) return;
    if (queryStartAtRef.current === null) return;
    const elapsed = Math.round(performance.now() - queryStartAtRef.current);
    setLastQueryMs(elapsed);
    queryStartAtRef.current = null;
  }, [isLoading, products]);

  const addItem = useCallback((productIdOverride?: number, quantidadeOverride?: number) => {
    const targetProductId = productIdOverride ?? Number.parseInt(selectedProductId, 10);
    if (!targetProductId) {
      toast.error("Selecione um produto");
      return;
    }

    const quantidadeToAdd = Math.max(1, quantidadeOverride ?? quantidade);
    const product = productById.get(targetProductId);
    if (!product) return;

    // Check if product already in cart
    const existingItem = saleItems.find((item) => item.productId === product.id);
    const nextQuantity = existingItem ? existingItem.quantidade + quantidadeToAdd : quantidadeToAdd;

    // Para venda comum, não deixa ultrapassar estoque disponível.
    // Para outros tipos de transação, permite seguir.
    if (tipoTransacao === "venda" && nextQuantity > product.quantidade) {
      toast.error(`Estoque insuficiente para "${product.name}". Disponível: ${product.quantidade}`);
      return;
    }

    if (existingItem) {
      // Update quantity
      setSaleItems(saleItems.map((item) =>
        item.productId === product.id
          ? { ...item, quantidade: item.quantidade + quantidadeToAdd }
          : item
      ));
    } else {
      // Add new item
      setSaleItems([...saleItems, {
        productId: product.id,
        productName: product.name,
        medida: product.medida,
        quantidade: quantidadeToAdd,
        estoque: product.quantidade,
      }]);
    }

    setSelectedProductId("");
    setQuantidade(1);
  }, [productById, quantidade, saleItems, selectedProductId, tipoTransacao]);

  const updateListQuantity = useCallback((productId: number, nextValue: number) => {
    setListQuantities((prev) => ({
      ...prev,
      [productId]: Math.max(1, nextValue),
    }));
  }, []);

  const getListQuantity = useCallback((productId: number) => {
    return Math.max(1, listQuantities[productId] ?? 1);
  }, [listQuantities]);

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

    // Enter no campo de busca: se já existe produto selecionado, adiciona.
    // Caso contrário, seleciona automaticamente o primeiro resultado.
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

  const removeItem = useCallback((productId: number) => {
    setSaleItems(saleItems.filter(item => item.productId !== productId));
  }, [saleItems]);

  const getDraftKey = useCallback((draft: ImportedDraft) => draft.fileHash || draft.filePath, []);

  const createDefaultDraftReviewState = useCallback((draft: ImportedDraft): DraftReviewState => {
    const includeByIndex: Record<number, boolean> = {};
    const quantityByIndex: Record<number, number> = {};

    draft.itens.forEach((item, index) => {
      if (item.productId != null) {
        includeByIndex[index] = true;
        quantityByIndex[index] = Math.max(1, item.quantidade);
      }
    });

    return {
      reviewed: false,
      approved: false,
      reviewNote: "",
      includeByIndex,
      quantityByIndex,
      manualProductByIndex: {},
    };
  }, []);

  const getDraftReviewState = useCallback(
    (draft: ImportedDraft): DraftReviewState => {
      const key = getDraftKey(draft);
      return draftReviewMap[key] ?? createDefaultDraftReviewState(draft);
    },
    [createDefaultDraftReviewState, draftReviewMap, getDraftKey]
  );

  const getDraftMappedProductId = useCallback(
    (draft: ImportedDraft, index: number) => {
      const review = getDraftReviewState(draft);
      if (Object.prototype.hasOwnProperty.call(review.manualProductByIndex, index)) {
        return review.manualProductByIndex[index] ?? null;
      }
      return draft.itens[index]?.productId ?? null;
    },
    [getDraftReviewState]
  );

  const getDraftMissingMappingsCount = useCallback(
    (draft: ImportedDraft) =>
      draft.itens.reduce((total, item, index) => {
        if ((item.quantidade ?? 0) <= 0) return total;
        return getDraftMappedProductId(draft, index) == null ? total + 1 : total;
      }, 0),
    [getDraftMappedProductId]
  );

  const updateDraftReviewState = useCallback(
    (draft: ImportedDraft, updater: (current: DraftReviewState) => DraftReviewState) => {
      const key = getDraftKey(draft);
      setDraftReviewMap((prev) => {
        const current = prev[key] ?? createDefaultDraftReviewState(draft);
        return { ...prev, [key]: updater(current) };
      });
    },
    [createDefaultDraftReviewState, getDraftKey]
  );

  const getApprovedRecognizedItems = useCallback(
    (draft: ImportedDraft) => {
      const review = getDraftReviewState(draft);
      return draft.itens
        .map((item, index) => ({ item, index }))
        .filter(({ item, index }) => {
          const manualMapped =
            Object.prototype.hasOwnProperty.call(review.manualProductByIndex, index)
              ? review.manualProductByIndex[index]
              : undefined;
          const mappedProductId = manualMapped !== undefined ? manualMapped : (item.productId ?? null);
          return mappedProductId != null && review.includeByIndex[index] !== false;
        })
        .map(({ item, index }) => ({
          productId: (
            Object.prototype.hasOwnProperty.call(review.manualProductByIndex, index)
              ? review.manualProductByIndex[index]
              : item.productId
          ) as number,
          quantidade: Math.max(1, review.quantityByIndex[index] ?? item.quantidade ?? 1),
        }));
    },
    [getDraftReviewState]
  );

  const applyDraftHeaderData = useCallback((draft: ImportedDraft) => {
    const resolvedClient = draft.cliente || importClientName.trim() || "";
    if (resolvedClient) setNomeCliente(resolvedClient);
    if (draft.telefoneCliente) setTelefoneCliente(draft.telefoneCliente);
    if (draft.endereco) setEnderecoCliente(draft.endereco);
    if (draft.dataVenda) setDataVenda(draft.dataVenda.slice(0, 10));

    const sellerFromDraft = draft.vendedor ? resolveKnownSeller(draft.vendedor, sellers) : null;
    if (sellerFromDraft) setVendedor(sellerFromDraft);

    const extractedPaymentKeys = (draft.formasPagamentoExtraidas ?? [])
      .map((entry) => resolveKnownPaymentMethod(entry.descricao, paymentMethods))
      .filter((entry): entry is string => Boolean(entry));
    const candidatePayment =
      extractedPaymentKeys.length > 1
        ? "MULTIPLO"
        : extractedPaymentKeys[0] ?? resolveKnownPaymentMethod(draft.formaPagamento ?? "", paymentMethods);
    if (candidatePayment) {
      setFormaPagamento(candidatePayment);
    }

    if (draft.total != null) {
      setValorTotalInput(draft.total.toFixed(2));
    }

    const summary = [
      `Origem PDF: ${draft.fileName}`,
      draft.documentNumber ? `Documento: ${draft.documentNumber}` : null,
    ]
      .filter(Boolean)
      .join(" | ");
    setObservacoes((prev) => (prev ? `${prev} | ${summary}` : summary));
    toast.success(`Dados do PDF "${draft.fileName}" aplicados no formulário.`);
  }, [importClientName, paymentMethods, sellers]);

  const addImportedItemsToCart = useCallback(async (draft: ImportedDraft) => {
    const review = getDraftReviewState(draft);
    if (!review.approved) {
      toast.warning("Aprovação obrigatória: revise e aprove o arquivo antes de adicionar ao carrinho.");
      return;
    }
    const missingMappingsCount = getDraftMissingMappingsCount(draft);
    if (missingMappingsCount > 0) {
      toast.warning(`Vincule ${missingMappingsCount} item(ns) do PDF a produtos existentes antes de seguir.`);
      return;
    }

    const approvedItems = getApprovedRecognizedItems(draft);
    const importableItems = approvedItems.filter((item) => item.productId && item.quantidade > 0);
    if (importableItems.length === 0) {
      applyDraftHeaderData(draft);
      toast.warning("Nenhum item reconhecido para carrinho. Dados principais do PDF foram aplicados no formulário.");
      return;
    }

    const loadedProducts = await Promise.all(
      importableItems.map(async (item) => {
        if (!item.productId) return null;
        try {
          const product = await utils.products.getById.fetch({ id: item.productId });
          if (!product) return null;
          return { product, qtd: item.quantidade };
        } catch {
          return null;
        }
      })
    );

    const valid: Array<{ product: { id: number; name: string; medida: string; quantidade: number }; qtd: number }> = [];
    for (const entry of loadedProducts) {
      if (!entry?.product?.id) continue;
      valid.push({
        product: {
          id: entry.product.id,
          name: entry.product.name,
          medida: entry.product.medida,
          quantidade: entry.product.quantidade,
        },
        qtd: entry.qtd,
      });
    }

    if (valid.length === 0) {
      toast.warning("Produtos reconhecidos não foram encontrados no banco.");
      return;
    }

    setSaleItems((prev) => {
      const next = [...prev];
      for (const entry of valid) {
        const current = next.find((saleItem) => saleItem.productId === entry.product.id);
        if (current) {
          current.quantidade += entry.qtd;
        } else {
          next.push({
            productId: entry.product.id,
            productName: entry.product.name,
            medida: entry.product.medida,
            quantidade: entry.qtd,
            estoque: entry.product.quantidade,
          });
        }
      }
      return next;
    });

    if (!nomeCliente) {
      const resolvedClient = draft.cliente || importClientName.trim() || "";
      if (resolvedClient) {
        setNomeCliente(resolvedClient);
      }
    }
    if (!telefoneCliente && draft.telefoneCliente) {
      setTelefoneCliente(draft.telefoneCliente);
    }
    if (!enderecoCliente && draft.endereco) {
      setEnderecoCliente(draft.endereco);
    }
    if (!formaPagamento) {
      if ((draft.formasPagamentoExtraidas?.length ?? 0) > 1) {
        setFormaPagamento("MULTIPLO");
      } else if (draft.formasPagamentoExtraidas?.length === 1) {
        const known = resolveKnownPaymentMethod(draft.formasPagamentoExtraidas[0].descricao, paymentMethods);
        if (known) {
          setFormaPagamento(known);
        }
      } else if (draft.formaPagamento) {
        const known = resolveKnownPaymentMethod(draft.formaPagamento, paymentMethods);
        if (known) {
          setFormaPagamento(known);
        }
      }
    }
    if (!dataVenda && draft.dataVenda) {
      setDataVenda(draft.dataVenda.slice(0, 10));
    }
    if (!vendedor && draft.vendedor) {
      const knownFromDraft = resolveKnownSeller(draft.vendedor, sellers);
      if (knownFromDraft) {
        setVendedor(knownFromDraft);
      }
    }
    if (!valorTotalInput && draft.total != null) {
      setValorTotalInput(draft.total.toFixed(2));
    }
    if (draft.endereco || draft.total != null) {
      const summary = [
        draft.endereco ? `Endereço: ${draft.endereco}` : null,
        draft.total != null ? `Total PDF: R$ ${draft.total.toFixed(2)}` : null,
      ]
        .filter(Boolean)
        .join(" | ");
      if (summary) {
        setObservacoes((prev) => (prev ? `${prev} | ${summary}` : summary));
      }
    }

    toast.success(`Itens do arquivo "${draft.fileName}" adicionados ao carrinho.`);
  }, [
    applyDraftHeaderData,
    dataVenda,
    enderecoCliente,
    formaPagamento,
    getApprovedRecognizedItems,
    getDraftMissingMappingsCount,
    getDraftReviewState,
    importClientName,
    nomeCliente,
    telefoneCliente,
    utils.products.getById,
    valorTotalInput,
    vendedor,
  ]);

  const registerImportedDraftNow = useCallback(async (draft: ImportedDraft) => {
    const sellerFromDraftOrForm = draft.vendedor ?? vendedor;
    if (!sellerFromDraftOrForm) {
      toast.error("Selecione um vendedor antes de lançar a venda importada.");
      return;
    }
    const resolvedSeller = resolveKnownSeller(sellerFromDraftOrForm, sellers);
    if (!resolvedSeller) {
      const suggestion = suggestKnownSeller(sellerFromDraftOrForm, sellers);
      toast.error(
        suggestion
          ? `Vendedor "${sellerFromDraftOrForm}" não cadastrado. Sugestão: "${suggestion}".`
          : `Vendedor "${sellerFromDraftOrForm}" não cadastrado.`
      );
      return;
    }

    const review = getDraftReviewState(draft);
    if (!review.approved) {
      toast.warning("Aprovação obrigatória: revise e aprove o arquivo antes de lançar.");
      return;
    }
    const missingMappingsCount = getDraftMissingMappingsCount(draft);
    if (missingMappingsCount > 0) {
      toast.warning(`Vincule ${missingMappingsCount} item(ns) do PDF a produtos existentes antes de lançar.`);
      return;
    }

    const items = getApprovedRecognizedItems(draft);
    if (items.length === 0) {
      toast.warning("Este arquivo não possui itens reconhecidos para lançamento.");
      return;
    }

    const resolvedClient = draft.cliente ?? (importClientName.trim() || undefined);
    if (!resolvedClient) {
      toast.error("Informe o nome do cliente antes de lançar a venda importada.");
      return;
    }
    const extractedPaymentKeys = (draft.formasPagamentoExtraidas ?? [])
      .map((entry) => resolveKnownPaymentMethod(entry.descricao, paymentMethods))
      .filter((entry): entry is string => Boolean(entry));
    const hasUnknownExtractedPayment = (draft.formasPagamentoExtraidas ?? []).some(
      (entry) => !resolveKnownPaymentMethod(entry.descricao, paymentMethods)
    );

    const candidatePayment =
      extractedPaymentKeys.length > 1
        ? "MULTIPLO"
        : extractedPaymentKeys[0] ?? resolveKnownPaymentMethod(draft.formaPagamento ?? "", paymentMethods) ?? formaPagamento;

    const resolvedPaymentKey = resolveKnownPaymentMethod(candidatePayment, paymentMethods);
    if (!resolvedPaymentKey) {
      toast.error("Informe a forma de pagamento antes de lançar a venda importada.");
      return;
    }
    if (hasUnknownExtractedPayment) {
      toast.warning(
        "PDF com forma(s) de pagamento fora do catálogo. Revise e confirme a forma principal antes de lançar."
      );
    }

    const origem = `Importado de PDF: ${draft.fileName}`;
    const baseObs = draft.endereco ? `Endereço: ${draft.endereco}` : undefined;
    const obs = [origem, baseObs].filter(Boolean).join(" | ");

    await registrarImportadaMutation.mutateAsync({
      items,
      vendedor: resolvedSeller,
      nomeCliente: resolvedClient,
      telefoneCliente: draft.telefoneCliente ?? (telefoneCliente.trim() || undefined),
      enderecoCliente: draft.endereco ?? (enderecoCliente.trim() || undefined),
      formaPagamento: getPaymentLabelByKey(resolvedPaymentKey, paymentMethods),
      dataVenda: draft.dataVenda ? new Date(draft.dataVenda) : (dataVenda ? new Date(`${dataVenda}T12:00:00`) : undefined),
      valorTotal:
        draft.total ??
        parseCurrencyInput(valorTotalInput),
      observacoes: obs || undefined,
      tipoTransacao,
      importMeta: {
        fileHash: draft.fileHash,
        fileName: draft.fileName,
        documentNumber: draft.documentNumber,
        total: draft.total,
        reviewNote: review.reviewNote?.trim() || undefined,
      },
    });

    setProcessedImports((prev) => ({ ...prev, [getDraftKey(draft)]: true }));
    utils.vendas.importHistory.invalidate();
  }, [
    dataVenda,
    enderecoCliente,
    formaPagamento,
    getApprovedRecognizedItems,
    getDraftKey,
    getDraftMissingMappingsCount,
    getDraftReviewState,
    importClientName,
    registrarImportadaMutation,
    telefoneCliente,
    tipoTransacao,
    utils.vendas.importHistory,
    valorTotalInput,
    vendedor,
  ]);

  const markDraftReviewed = useCallback((draft: ImportedDraft) => {
    updateDraftReviewState(draft, (current) => ({ ...current, reviewed: true }));
    toast.success(`Arquivo "${draft.fileName}" marcado como revisado.`);
  }, [updateDraftReviewState]);

  const toggleDraftApproved = useCallback((draft: ImportedDraft) => {
    updateDraftReviewState(draft, (current) => {
      if (!current.reviewed && !current.approved) {
        toast.warning("Marque como revisado antes de aprovar.");
        return current;
      }
      const missingMappingsCount = getDraftMissingMappingsCount(draft);
      if (!current.approved && missingMappingsCount > 0) {
        toast.warning(`Vincule ${missingMappingsCount} item(ns) a produtos existentes antes de aprovar.`);
        return current;
      }
      if (!current.approved && getApprovedRecognizedItems(draft).length === 0) {
        toast.warning("Selecione ao menos um item vinculado para aprovar o arquivo.");
        return current;
      }
      return { ...current, approved: !current.approved };
    });
  }, [getApprovedRecognizedItems, getDraftMissingMappingsCount, updateDraftReviewState]);

  const toggleDraftItemIncluded = useCallback((draft: ImportedDraft, index: number, include: boolean) => {
    updateDraftReviewState(draft, (current) => ({
      ...current,
      includeByIndex: { ...current.includeByIndex, [index]: include },
      approved: false,
    }));
  }, [updateDraftReviewState]);

  const updateDraftItemQuantity = useCallback((draft: ImportedDraft, index: number, quantidadeNova: number) => {
    updateDraftReviewState(draft, (current) => ({
      ...current,
      quantityByIndex: { ...current.quantityByIndex, [index]: Math.max(1, quantidadeNova) },
      approved: false,
    }));
  }, [updateDraftReviewState]);

  const updateDraftManualProduct = useCallback((draft: ImportedDraft, index: number, productId: number | null) => {
    updateDraftReviewState(draft, (current) => ({
      ...current,
      manualProductByIndex: { ...current.manualProductByIndex, [index]: productId },
      includeByIndex: { ...current.includeByIndex, [index]: productId != null },
      approved: false,
    }));
  }, [updateDraftReviewState]);

  const updateDraftReviewNote = useCallback((draft: ImportedDraft, note: string) => {
    updateDraftReviewState(draft, (current) => ({
      ...current,
      reviewNote: note,
      approved: false,
    }));
  }, [updateDraftReviewState]);

  const markAllDraftsReviewed = useCallback(() => {
    if (!importedDrafts.length) {
      toast.info("Não há arquivos importados para revisar.");
      return;
    }

    importedDrafts.forEach((draft) => {
      updateDraftReviewState(draft, (current) => ({
        ...current,
        reviewed: true,
        reviewNote: current.reviewNote || batchReviewNote,
      }));
    });
    toast.success("Todos os arquivos foram marcados como revisados.");
  }, [batchReviewNote, importedDrafts, updateDraftReviewState]);

  const approveAllReviewedDrafts = useCallback(() => {
    if (!importedDrafts.length) {
      toast.info("Não há arquivos importados para aprovar.");
      return;
    }

    let approvedCount = 0;
    let skippedCount = 0;
    importedDrafts.forEach((draft) => {
      updateDraftReviewState(draft, (current) => {
        if (!current.reviewed) return current;
        if (getDraftMissingMappingsCount(draft) > 0 || getApprovedRecognizedItems(draft).length === 0) {
          skippedCount += 1;
          return current;
        }
        approvedCount += 1;
        return {
          ...current,
          approved: true,
          reviewNote: current.reviewNote || batchReviewNote,
        };
      });
    });

    if (approvedCount === 0) {
      toast.warning("Nenhum arquivo revisado e totalmente vinculado para aprovar.");
      return;
    }
    toast.success(`${approvedCount} arquivo(s) aprovados em lote.`);
    if (skippedCount > 0) {
      toast.warning(`${skippedCount} arquivo(s) ficaram pendentes por falta de vínculo de produto.`);
    }
  }, [batchReviewNote, getApprovedRecognizedItems, getDraftMissingMappingsCount, importedDrafts, updateDraftReviewState]);

  const addAllImportedToCart = useCallback(async () => {
    let successCount = 0;
    for (const draft of importedDrafts) {
      if (processedImports[getDraftKey(draft)]) continue;
      const recognized = getApprovedRecognizedItems(draft);
      if (recognized.length === 0) continue;
      await addImportedItemsToCart(draft);
      successCount += 1;
    }
    if (successCount === 0) {
      toast.info("Nenhum arquivo com itens reconhecidos disponível para adicionar.");
    }
  }, [addImportedItemsToCart, getApprovedRecognizedItems, getDraftKey, importedDrafts, processedImports]);

  const registerAllImportedNow = useCallback(async () => {
    const hasSellerInBatch = importedDrafts.some((draft) => Boolean(draft.vendedor));
    if (!vendedor && !hasSellerInBatch) {
      toast.error("Selecione um vendedor antes do lançamento em lote.");
      return;
    }

    let successCount = 0;
    let failCount = 0;
    for (const draft of importedDrafts) {
      if (processedImports[getDraftKey(draft)]) continue;
      const recognized = getApprovedRecognizedItems(draft);
      if (recognized.length === 0) continue;
      try {
        await registerImportedDraftNow(draft);
        successCount += 1;
      } catch {
        failCount += 1;
      }
    }

    if (successCount > 0) {
      toast.success(`Lançamento em lote concluído. ${successCount} arquivo(s) registrado(s).`);
      utils.vendas.importHistory.invalidate();
    }
    if (failCount > 0) {
      toast.warning(`${failCount} arquivo(s) falharam no lançamento. Revise os itens e tente novamente.`);
    }
    if (successCount === 0 && failCount === 0) {
      toast.info("Nenhum arquivo pronto para lançamento em lote.");
    }
  }, [getApprovedRecognizedItems, getDraftKey, importedDrafts, processedImports, registerImportedDraftNow, utils.vendas.importHistory, vendedor]);

  const updateSaleItemQuantity = useCallback((productId: number, nextQuantity: number) => {
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
  }, [removeItem, saleItems, tipoTransacao]);

  const clearSaleItems = useCallback(() => {
    setSaleItems([]);
    toast.info("Carrinho de venda limpo.");
  }, []);

  const clearImportedBatch = useCallback(() => {
    setImportedDrafts([]);
    setProcessedImports({});
    setDraftReviewMap({});
    setBatchReviewNote("");
    toast.info("Lote de importação limpo.");
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
    if (!formaPagamento.trim()) {
      toast.error("Informe a forma de pagamento para confirmar a venda.");
      return;
    }
    const resolvedPaymentKey = resolveKnownPaymentMethod(formaPagamento, paymentMethods);
    if (!resolvedPaymentKey) {
      toast.error("Forma de pagamento inválida. Selecione uma opção cadastrada.");
      return;
    }
    if (!dataVenda) {
      toast.error("Informe a data da venda para confirmar.");
      return;
    }

    registrarVendaMutation.mutate({
      items: saleItems.map(item => ({
        productId: item.productId,
        quantidade: item.quantidade,
      })),
      vendedor: resolvedSeller,
      nomeCliente: nomeCliente || undefined,
      telefoneCliente: telefoneCliente || undefined,
      enderecoCliente: enderecoCliente || undefined,
      formaPagamento: getPaymentLabelByKey(resolvedPaymentKey, paymentMethods),
      dataVenda: dataVenda ? new Date(`${dataVenda}T12:00:00`) : undefined,
      valorTotal: parseCurrencyInput(valorTotalInput),
      observacoes: observacoes || undefined,
      tipoTransacao,
    });
    setVendedor("");
    setNomeCliente("");
    setTelefoneCliente("");
    setEnderecoCliente("");
    setFormaPagamento("");
    setDataVenda("");
    setValorTotalInput("");
    setObservacoes("");
  };

  const totalItems = saleItems.length;
  const totalUnits = saleItems.reduce((acc, item) => acc + item.quantidade, 0);
  const importedCount = importedDrafts.length;
  const reviewedImportedCount = importedDrafts.filter((draft) => getDraftReviewState(draft).reviewed).length;
  const approvedImportedCount = importedDrafts.filter((draft) => getDraftReviewState(draft).approved).length;
  const draftsWithRecognizedItemsCount = importedDrafts.filter((draft) =>
    draft.itens.some((item) => item.productId != null)
  ).length;
  const draftsReadyToLaunchCount = importedDrafts.filter((draft) => {
    const review = getDraftReviewState(draft);
    const hasSelectedItems = getApprovedRecognizedItems(draft).length > 0;
    const missingMappingsCount = getDraftMissingMappingsCount(draft);
    return review.approved && hasSelectedItems && missingMappingsCount === 0 && !processedImports[getDraftKey(draft)];
  }).length;
  const filteredImportedDrafts = importedDrafts.filter((draft) => {
    if (importQualityFilter === "all") return true;
    if (importQualityFilter === "pending") {
      const review = getDraftReviewState(draft);
      const hasSelectedItems = getApprovedRecognizedItems(draft).length > 0;
      const missingMappingsCount = getDraftMissingMappingsCount(draft);
      return !review.reviewed || !review.approved || !hasSelectedItems || missingMappingsCount > 0 || draft.warnings.length > 0;
    }
    const quality = resolveDraftQuality(draft).label;
    if (importQualityFilter === "high") return quality === "Alta";
    if (importQualityFilter === "medium") return quality === "Média";
    return quality === "Baixa";
  });
  const processedImportedCount = importedDrafts.filter((draft) => processedImports[getDraftKey(draft)]).length;
  const pendingImportedCount = Math.max(0, importedCount - processedImportedCount);
  const hasCatalogEmptyWarning = importedDrafts.some((draft) =>
    draft.warnings.some((warning) => warning.toLowerCase().includes("catálogo de produtos vazio"))
  );
  const lowStockItems = saleItems.filter((item) => item.quantidade > item.estoque);
  const mappingProducts = productsForMappingQuery.data?.items ?? [];
  const latencyLevel =
    lastQueryMs == null
      ? "ok"
      : lastQueryMs >= PERF_LATENCY_CRITICAL_MS
      ? "critical"
      : lastQueryMs >= PERF_LATENCY_WARNING_MS
      ? "warning"
      : "ok";
  const renderLevel = renderCountRef.current >= PERF_RENDER_WARNING ? "warning" : "ok";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Registrar Vendas</h1>
          <p className="text-muted-foreground mt-2">Registre as vendas do dia e atualize o estoque automaticamente</p>
        </div>
        <Button
          type="button"
          variant={pendingImportedCount > 0 ? "default" : "outline"}
          className="w-full sm:w-auto gap-2"
          onClick={() => setIsImportPanelOpen(true)}
        >
          <UploadCloud className="h-4 w-4" />
          Importar PDF
          {pendingImportedCount > 0 ? (
            <Badge variant="secondary" className="ml-1">{pendingImportedCount}</Badge>
          ) : null}
        </Button>
      </div>

      {productsError && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="pt-6">
            <p className="text-sm text-destructive font-medium">
              {isAdmin
                ? "Não foi possível carregar os produtos para venda."
                : "Servidor fora do ar."}
            </p>
            {isAdmin && (
              <p className="text-xs text-muted-foreground mt-1">
                Confira backend em `http://localhost:3001` e conexão com o banco.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {isDev ? (
        <Card
          className={`border ${
            latencyLevel === "critical"
              ? "border-red-300 bg-red-50"
              : latencyLevel === "warning" || renderLevel === "warning"
              ? "border-amber-300 bg-amber-50"
              : "border-border/60 bg-muted/20"
          }`}
        >
          <CardContent className="pt-4">
            <div className="grid gap-2 text-xs md:grid-cols-4">
              <div>
                <span className="text-muted-foreground">Renders:</span>{" "}
                <strong>{renderCountRef.current}</strong>
              </div>
              <div>
                <span className="text-muted-foreground">Latência busca:</span>{" "}
                <strong>{lastQueryMs != null ? `${lastQueryMs}ms` : "n/a"}</strong>
              </div>
              <div>
                <span className="text-muted-foreground">Resultados backend:</span>{" "}
                <strong>{searchedProducts.length}</strong>
              </div>
              <div>
                <span className="text-muted-foreground">Resultados renderizados:</span>{" "}
                <strong>{displayedProducts.length}</strong>
              </div>
            </div>
            {(latencyLevel !== "ok" || renderLevel !== "ok") && (
              <div className="mt-2 text-xs">
                {latencyLevel === "critical" ? (
                  <span className="font-medium text-red-700">
                    Alerta crítico: busca lenta (&gt;= {PERF_LATENCY_CRITICAL_MS}ms). Refine filtro ou revise backend.
                  </span>
                ) : latencyLevel === "warning" ? (
                  <span className="font-medium text-amber-700">
                    Atenção: latência de busca acima de {PERF_LATENCY_WARNING_MS}ms.
                  </span>
                ) : null}
                {renderLevel === "warning" ? (
                  <span className="ml-2 font-medium text-amber-700">
                    Muitos renders ({renderCountRef.current}). Monitore possível re-render desnecessário.
                  </span>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Dialog open={isImportPanelOpen} onOpenChange={setIsImportPanelOpen}>
        <DialogContent className="w-[min(96vw,1100px)] max-w-none max-h-[90vh] overflow-hidden p-0">
          <div className="max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Importar Vendas por PDF</DialogTitle>
            <DialogDescription>
              Leia automaticamente PDFs da pasta e adicione itens reconhecidos ao carrinho de venda.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pb-28">
          {hasCatalogEmptyWarning ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
              Não há produtos cadastrados no banco atual para vinculação automática. A importação de cabeçalho (cliente, vendedor, pagamento, data, telefone e endereço) continua funcionando.
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-2 rounded-md border bg-muted/20 p-3 text-xs sm:grid-cols-4">
            <div className="rounded border bg-background px-2 py-1">
              <div className="text-muted-foreground">Etapa 1 • Upload</div>
              <div className="font-semibold">{importedCount > 0 ? `${importedCount} arquivo(s)` : "Aguardando"}</div>
            </div>
            <div className="rounded border bg-background px-2 py-1">
              <div className="text-muted-foreground">Etapa 2 • Revisão</div>
              <div className="font-semibold">{reviewedImportedCount}/{importedCount || 0}</div>
            </div>
            <div className="rounded border bg-background px-2 py-1">
              <div className="text-muted-foreground">Etapa 3 • Aprovação</div>
              <div className="font-semibold">{approvedImportedCount}/{importedCount || 0}</div>
            </div>
            <div className="rounded border bg-background px-2 py-1">
              <div className="text-muted-foreground">Etapa 4 • Pronto p/ lançar</div>
              <div className="font-semibold">{draftsReadyToLaunchCount}</div>
            </div>
          </div>
          <div className="rounded-md border bg-muted/20 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-muted-foreground">
                Lote atual: <strong>{importedCount}</strong> arquivo(s) • pendentes: <strong>{pendingImportedCount}</strong> • lançados: <strong>{processedImportedCount}</strong>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (!importClientName.trim()) {
                      toast.warning("Informe um nome no cliente padrão para aplicar.");
                      return;
                    }
                    setNomeCliente(importClientName.trim());
                    toast.success("Cliente padrão aplicado ao formulário de venda.");
                  }}
                >
                  Aplicar cliente padrão
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={clearImportedBatch}
                  disabled={importedCount === 0}
                >
                  Limpar lote
                </Button>
              </div>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="importClientName">Nome do Cliente (padrão da importação)</Label>
              <Input
                id="importClientName"
                type="text"
                placeholder="Ex: Maria da Silva"
                value={importClientName}
                onChange={(event) => setImportClientName(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Usado quando o PDF não identificar o cliente.
              </p>
            </div>
          </div>
          <Tabs defaultValue="folder" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="folder">Automática por Pasta</TabsTrigger>
              <TabsTrigger value="manual">Manual por Arquivo</TabsTrigger>
            </TabsList>
            <TabsContent value="folder" className="mt-3">
              <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                <Input
                  placeholder="Pasta dos PDFs (opcional, usa SALES_IMPORT_DIR se vazio)"
                  value={importFolderPath}
                  onChange={(event) => setImportFolderPath(event.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="w-full md:w-auto"
                  disabled={importFromFolderMutation.isPending}
                  onClick={() => {
                    importFromFolderMutation.mutate({
                      folderPath: importFolderPath.trim() || undefined,
                      maxFiles: 30,
                    });
                  }}
                >
                  {importFromFolderMutation.isPending ? "Importando..." : "Ler Pasta"}
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Ideal para processamento em lote de muitos PDFs de uma vez.
              </p>
            </TabsContent>
            <TabsContent value="manual" className="mt-3">
              <div
                className={`rounded-lg border-2 border-dashed p-4 transition-colors ${
                  isDragOver ? "border-primary bg-primary/5" : "border-border bg-muted/10"
                }`}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setIsDragOver(true);
                }}
                onDragLeave={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setIsDragOver(false);
                }}
                onDrop={(event) => {
                  void onDropManualFiles(event);
                }}
              >
                <div className="mb-3 flex items-center gap-2 text-sm">
                  <UploadCloud className="h-4 w-4" />
                  Arraste e solte PDF(s) aqui
                </div>
                <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={() => manualFileInputRef.current?.click()}
                  disabled={importFromUploadedFilesMutation.isPending}
                >
                  {importFromUploadedFilesMutation.isPending ? "Lendo arquivo..." : "Selecionar arquivo(s) PDF"}
                </Button>
                <span className="text-xs text-muted-foreground">
                  Selecione um ou mais PDFs avulsos sem depender de pasta fixa.
                </span>
                </div>
              </div>
            </TabsContent>
          </Tabs>
          <input
            ref={manualFileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            multiple
            className="hidden"
            onChange={onManualFilesSelected}
          />

          {importedDrafts.length > 0 ? (
            <div className="space-y-2 rounded-md border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">Arquivos processados: {importedDrafts.length}</p>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={importQualityFilter} onValueChange={(value: "all" | "high" | "medium" | "low" | "pending") => setImportQualityFilter(value)}>
                    <SelectTrigger className="h-8 w-full sm:w-[210px] text-xs">
                      <SelectValue placeholder="Filtrar qualidade" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Qualidade: todas</SelectItem>
                      <SelectItem value="pending">Pendências de revisão</SelectItem>
                      <SelectItem value="high">Qualidade: alta</SelectItem>
                      <SelectItem value="medium">Qualidade: média</SelectItem>
                      <SelectItem value="low">Qualidade: baixa</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    value={batchReviewNote}
                    onChange={(event) => setBatchReviewNote(event.target.value)}
                    placeholder="Observação padrão da revisão (lote)"
                    className="h-8 w-full sm:w-64 md:w-72 text-xs"
                  />
                  <Button type="button" size="sm" className="w-full sm:w-auto" variant="outline" onClick={markAllDraftsReviewed}>
                    Revisar todos
                  </Button>
                  <Button type="button" size="sm" className="w-full sm:w-auto" variant="outline" onClick={approveAllReviewedDrafts}>
                    Aprovar revisados
                  </Button>
                  <Button type="button" size="sm" className="w-full sm:w-auto" variant="outline" onClick={() => void addAllImportedToCart()}>
                    Adicionar todos ao carrinho
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="w-full sm:w-auto"
                    onClick={() => void registerAllImportedNow()}
                    disabled={registrarImportadaMutation.isPending}
                  >
                    {registrarImportadaMutation.isPending ? "Lançando..." : "Lançar todos"}
                  </Button>
                </div>
              </div>
              <div className="max-h-72 space-y-2 overflow-auto">
                {filteredImportedDrafts.map((draft) => {
                  const recognizedItems = draft.itens
                    .map((item, index) => ({ item, index }))
                    .filter(({ item, index }) => getDraftMappedProductId(draft, index) != null);
                  const unresolvedItems = draft.itens
                    .map((item, index) => ({ item, index }))
                    .filter(({ item, index }) => item.quantidade > 0 && getDraftMappedProductId(draft, index) == null);
                  const review = getDraftReviewState(draft);
                  const selectedItems = getApprovedRecognizedItems(draft);
                  const missingMappingsCount = getDraftMissingMappingsCount(draft);
                  const done = processedImports[getDraftKey(draft)];
                  const quality = resolveDraftQuality(draft);
                  const parsedSeller = draft.vendedor ?? "";
                  const knownSeller = parsedSeller ? resolveKnownSeller(parsedSeller, sellers) : null;
                  const sellerSuggestion = parsedSeller && !knownSeller ? suggestKnownSeller(parsedSeller, sellers) : null;
                  return (
                    <div key={getDraftKey(draft)} className="rounded-md border bg-muted/20 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold">{draft.fileName}</p>
                            <Badge variant="outline" className={quality.className}>
                              Qualidade: {quality.label}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Cliente: {draft.cliente ?? (importClientName.trim() || "não identificado")} | Itens vinculados: {recognizedItems.length}/{draft.itens.length} | Selecionados: {selectedItems.length}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Telefone: {draft.telefoneCliente ?? "n/a"} | Vendedor: {draft.vendedor ?? "n/a"} | Pagamento: {draft.formaPagamento ?? "n/a"}
                          </p>
                          {(draft.formasPagamentoExtraidas?.length ?? 0) > 0 ? (
                            <div className="mt-1 space-y-1">
                              {draft.formasPagamentoExtraidas.map((entry, idx) => {
                                const known = resolveKnownPaymentMethod(entry.descricao, paymentMethods);
                                return (
                                  <p
                                    key={`${getDraftKey(draft)}-pay-${idx}`}
                                    className={`text-[11px] ${known ? "text-muted-foreground" : "text-amber-700 font-medium"}`}
                                  >
                                    Pagamento {idx + 1}: {entry.descricao} [{PAYMENT_CATEGORY_LABELS[entry.categoria]}]
                                    {entry.valor != null ? ` - R$ ${entry.valor.toFixed(2)}` : ""}
                                    {entry.vencimento ? ` - venc. ${new Date(entry.vencimento).toLocaleDateString("pt-BR")}` : ""}
                                    {!known ? " - fora do catálogo" : ""}
                                  </p>
                                );
                              })}
                            </div>
                          ) : null}
                          {parsedSeller && !knownSeller ? (
                            <p className="text-xs font-medium text-amber-700">
                              Vendedor do PDF não cadastrado: "{parsedSeller}"
                              {sellerSuggestion ? ` (sugestão: ${sellerSuggestion})` : ""}.
                            </p>
                          ) : null}
                          <p className="text-xs text-muted-foreground">
                            Data: {draft.dataVenda ? new Date(draft.dataVenda).toLocaleDateString("pt-BR") : "n/a"} | Endereço: {draft.endereco ?? "n/a"}
                          </p>
                          {draft.documentNumber ? (
                            <p className="text-xs text-muted-foreground">Documento: {draft.documentNumber}</p>
                          ) : null}
                          <p className="text-xs text-muted-foreground">
                            Revisado: {review.reviewed ? "sim" : "não"} | Aprovado: {review.approved ? "sim" : "não"}
                          </p>
                          {missingMappingsCount > 0 ? (
                            <p className="text-xs font-medium text-amber-700">
                              Pendência: faltam {missingMappingsCount} vínculo(s) com produto para permitir a baixa no estoque.
                            </p>
                          ) : (
                            <p className="text-xs font-medium text-emerald-700">
                              Todos os itens do PDF já estão vinculados a produtos existentes.
                            </p>
                          )}
                          <Input
                            value={review.reviewNote}
                            onChange={(event) => updateDraftReviewNote(draft, event.target.value)}
                            placeholder="Observação da revisão (opcional)"
                            className="mt-1 h-8 w-full max-w-xs text-xs"
                          />
                          {done ? (
                            <p className="text-xs text-emerald-700 font-medium">Arquivo já lançado</p>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            className="w-full sm:w-auto"
                            variant="outline"
                            onClick={() => markDraftReviewed(draft)}
                          >
                            Marcar revisado
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            className="w-full sm:w-auto"
                            variant={review.approved ? "secondary" : "default"}
                            onClick={() => toggleDraftApproved(draft)}
                          >
                            {review.approved ? "Aprovado" : "Aprovar"}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            className="w-full sm:w-auto"
                            variant="outline"
                            onClick={() => applyDraftHeaderData(draft)}
                          >
                            Aplicar dados
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            className="w-full sm:w-auto"
                            variant="outline"
                            onClick={() => void addImportedItemsToCart(draft)}
                            disabled={selectedItems.length === 0}
                          >
                            Adicionar ao carrinho
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            className="w-full sm:w-auto"
                            onClick={() => void registerImportedDraftNow(draft)}
                            disabled={!review.approved || selectedItems.length === 0 || done || registrarImportadaMutation.isPending}
                          >
                            Lançar agora
                          </Button>
                        </div>
                      </div>
                      {draft.itens.length > 0 ? (
                        <div className="mt-2 max-h-40 space-y-2 overflow-auto rounded border bg-background/60 p-2">
                          {draft.itens.map((item, index) => {
                            const included = review.includeByIndex[index] !== false;
                            const qty = review.quantityByIndex[index] ?? item.quantidade;
                            const mappedProductId = getDraftMappedProductId(draft, index);
                            return (
                              <div key={`${getDraftKey(draft)}-${index}`} className="grid gap-2 rounded border bg-background/80 p-2 text-xs sm:grid-cols-[auto,minmax(0,1fr),minmax(220px,280px),72px] sm:items-center">
                                <Checkbox
                                  checked={included}
                                  onCheckedChange={(checked) => toggleDraftItemIncluded(draft, index, Boolean(checked))}
                                />
                                <div className="min-w-0">
                                  <p className="truncate font-medium">
                                    {item.productName} {item.medida ? `(${item.medida})` : ""}
                                  </p>
                                  <p className="truncate text-[11px] text-muted-foreground">{item.sourceLine}</p>
                                </div>
                                <Select
                                  value={mappedProductId ? String(mappedProductId) : "__none"}
                                  onValueChange={(value) =>
                                    updateDraftManualProduct(draft, index, value === "__none" ? null : Number(value))
                                  }
                                >
                                  <SelectTrigger className="h-8 text-xs">
                                    <SelectValue placeholder="Vincular produto do estoque" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="__none">Sem vínculo</SelectItem>
                                    {mappingProducts.map((product) => (
                                      <SelectItem key={`${getDraftKey(draft)}-linked-map-${index}-${product.id}`} value={String(product.id)}>
                                        {product.name} ({product.medida})
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Input
                                  type="number"
                                  min={1}
                                  value={qty}
                                  className="h-7 w-16 text-center"
                                  onChange={(event) => {
                                    const parsed = Number.parseInt(event.target.value, 10);
                                    updateDraftItemQuantity(draft, index, Number.isNaN(parsed) ? 1 : parsed);
                                  }}
                                />
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
                      {unresolvedItems.length > 0 ? (
                        <div className="mt-2 max-h-44 space-y-2 overflow-auto rounded border border-amber-300 bg-amber-50/60 p-2">
                          <p className="text-xs font-medium text-amber-800">
                            Itens pendentes de vínculo: selecione o produto correto para dar retirada no estoque
                          </p>
                          {unresolvedItems.map(({ item, index }) => {
                            const manualProductId = review.manualProductByIndex[index] ?? null;
                            const qty = review.quantityByIndex[index] ?? item.quantidade;
                            return (
                              <div key={`${getDraftKey(draft)}-unresolved-${index}`} className="space-y-1 rounded border bg-background/80 p-2">
                                <p className="text-[11px] text-muted-foreground">{item.sourceLine}</p>
                                <div className="grid gap-2 sm:grid-cols-[1fr_72px]">
                                  <Select
                                    value={manualProductId ? String(manualProductId) : "__none"}
                                    onValueChange={(value) =>
                                      updateDraftManualProduct(draft, index, value === "__none" ? null : Number(value))
                                    }
                                  >
                                    <SelectTrigger className="h-8 text-xs">
                                      <SelectValue placeholder="Selecione o produto para vincular" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="__none">Sem vínculo</SelectItem>
                                      {mappingProducts.map((product) => (
                                        <SelectItem key={`${getDraftKey(draft)}-map-${index}-${product.id}`} value={String(product.id)}>
                                          {product.name} ({product.medida})
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <Input
                                    type="number"
                                    min={1}
                                    value={qty}
                                    className="h-8 text-center text-xs"
                                    onChange={(event) => {
                                      const parsed = Number.parseInt(event.target.value, 10);
                                      updateDraftItemQuantity(draft, index, Number.isNaN(parsed) ? 1 : parsed);
                                    }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                          {mappingProducts.length === 0 ? (
                            <p className="text-[11px] text-amber-800">
                              Sem produtos disponíveis para vínculo manual neste ambiente.
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                      {draft.total != null ? (
                        <p className="mt-1 text-xs text-muted-foreground">Total PDF: R$ {draft.total.toFixed(2)}</p>
                      ) : null}
                      {draft.warnings.length > 0 ? (
                        <p className="mt-1 text-xs text-amber-700">{draft.warnings[0]}</p>
                      ) : null}
                    </div>
                  );
                })}
                {filteredImportedDrafts.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhum arquivo para o filtro selecionado.</p>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="space-y-2 rounded-md border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">Histórico de importações</p>
              <Input
                className="max-w-xs"
                placeholder="Buscar arquivo, doc ou cliente..."
                value={historySearch}
                onChange={(event) => {
                  setHistorySearch(event.target.value);
                  setHistoryPage(1);
                }}
              />
            </div>
            {importHistoryQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Carregando histórico...</p>
            ) : (importHistoryQuery.data?.items?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma importação registrada ainda.</p>
            ) : (
              <div className="space-y-2">
                {importHistoryQuery.data?.items.map((row: any) => (
                  <div key={row.id} className="rounded-md border bg-muted/20 p-3">
                    <p className="text-sm font-medium">{row.fileName}</p>
                    <p className="text-xs text-muted-foreground">
                      Cliente: {row.nomeCliente ?? "n/a"} | Documento: {row.documentNumber ?? "n/a"} | Itens: {row.itemsCount}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Telefone: {row.telefoneCliente ?? "n/a"} | Vendedor: {row.vendedor ?? "n/a"} | Pagamento: {row.formaPagamento ?? "n/a"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Total: {row.total != null ? `R$ ${Number(row.total).toFixed(2)}` : "n/a"} | Status: {row.status}
                    </p>
                    {(row.approvedByEmail || row.approvedAt) ? (
                      <p className="text-xs text-muted-foreground">
                        Aprovado por: {row.approvedByEmail ?? "n/a"}{" "}
                        {row.approvedAt ? `em ${new Date(row.approvedAt).toLocaleString("pt-BR")}` : ""}
                      </p>
                    ) : null}
                    {row.notes ? <p className="text-xs text-muted-foreground">Obs revisão: {row.notes}</p> : null}
                    <p className="text-xs text-muted-foreground">
                      Em: {new Date(row.createdAt).toLocaleString("pt-BR")}
                    </p>
                  </div>
                ))}
                <div className="flex items-center justify-end gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setHistoryPage((prev) => Math.max(1, prev - 1))}
                    disabled={historyPage <= 1}
                  >
                    Anterior
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Página {historyPage} de {importHistoryQuery.data?.totalPages ?? 1}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setHistoryPage((prev) =>
                        Math.min(importHistoryQuery.data?.totalPages ?? 1, prev + 1)
                      )
                    }
                    disabled={historyPage >= (importHistoryQuery.data?.totalPages ?? 1)}
                  >
                    Próxima
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="sticky bottom-0 z-20 -mx-4 mt-2 border-t bg-background/95 px-4 py-3 shadow-[0_-8px_20px_rgba(0,0,0,0.08)] backdrop-blur sm:-mx-6 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-muted-foreground">
                Reconhecidos: <strong>{draftsWithRecognizedItemsCount}</strong> • Revisados: <strong>{reviewedImportedCount}</strong> • Aprovados: <strong>{approvedImportedCount}</strong> • Prontos: <strong>{draftsReadyToLaunchCount}</strong>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" variant="outline" onClick={markAllDraftsReviewed}>
                  Revisar todos
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={approveAllReviewedDrafts}>
                  Aprovar revisados
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => void addAllImportedToCart()}>
                  Carrinho (lote)
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void registerAllImportedNow()}
                  disabled={registrarImportadaMutation.isPending || draftsReadyToLaunchCount === 0}
                >
                  {registrarImportadaMutation.isPending ? "Lançando..." : "Lançar lote"}
                </Button>
              </div>
            </div>
          </div>
          </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle>Adicionar Produtos</CardTitle>
            <CardDescription>Selecione os produtos vendidos</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="vendedor">Vendedor Responsável (Obrigatório)</Label>
              <Select value={vendedor} onValueChange={setVendedor}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o vendedor" />
                </SelectTrigger>
                <SelectContent>
                  {sellers.map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="nomeCliente">Nome do Cliente (Obrigatório)</Label>
              <Input
                id="nomeCliente"
                type="text"
                placeholder="Ex: Maria Silva"
                value={nomeCliente}
                onChange={(e) => setNomeCliente(e.target.value)}
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="telefoneCliente">Telefone</Label>
                <Input
                  id="telefoneCliente"
                  type="text"
                  placeholder="Ex: (82) 99999-9999"
                  value={telefoneCliente}
                  onChange={(e) => setTelefoneCliente(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="formaPagamento">Forma de Pagamento (Obrigatório)</Label>
                <Select value={formaPagamento} onValueChange={setFormaPagamento}>
                  <SelectTrigger id="formaPagamento">
                    <SelectValue placeholder="Selecione a forma de pagamento" />
                  </SelectTrigger>
                  <SelectContent>
                    {paymentMethods.map((method) => (
                      <SelectItem key={method.key} value={method.key}>
                        {method.label} - {method.category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {paymentMethodsLoading
                    ? "Carregando catálogo de pagamentos..."
                    : "Catálogo obrigatório para manter consistência e relatórios por categoria."}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="enderecoCliente">Endereço</Label>
              <Input
                id="enderecoCliente"
                type="text"
                placeholder="Ex: Rua A, 123 - Bairro"
                value={enderecoCliente}
                onChange={(e) => setEnderecoCliente(e.target.value)}
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="dataVenda">Data da Venda (Obrigatório)</Label>
                <Input
                  id="dataVenda"
                  type="date"
                  value={dataVenda}
                  onChange={(e) => setDataVenda(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="valorTotalInput">Valor Total (R$)</Label>
                <Input
                  id="valorTotalInput"
                  type="text"
                  inputMode="decimal"
                  placeholder="Ex: 1299,90"
                  value={valorTotalInput}
                  onChange={(e) => setValorTotalInput(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tipoTransacao">Tipo de Transação</Label>
              <Select value={tipoTransacao} onValueChange={(value: any) => setTipoTransacao(value)}>
                <SelectTrigger id="tipoTransacao">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="venda">Venda</SelectItem>
                  <SelectItem value="troca">Troca</SelectItem>
                  <SelectItem value="brinde">Brinde</SelectItem>
                  <SelectItem value="emprestimo">Empréstimo</SelectItem>
                  <SelectItem value="permuta">Permuta</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="product">Buscar e Selecionar Produto</Label>
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
                  <Input
                    id="search"
                    type="text"
                    placeholder="Digite para buscar produto..."
                    ref={searchInputRef}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    className="pl-10"
                  />
                </div>
                <div className="flex items-center gap-2 rounded-md border px-3 py-2">
                  <Checkbox
                    id="onlyInStock"
                    checked={onlyInStock}
                    onCheckedChange={(checked) => setOnlyInStock(Boolean(checked))}
                  />
                  <Label htmlFor="onlyInStock" className="text-sm">
                    Mostrar apenas produtos com estoque
                  </Label>
                </div>

                {selectedProduct ? (
                  <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                    Selecionado: <strong>{selectedProduct.name}</strong> ({selectedProduct.medida}) - Estoque: {selectedProduct.quantidade}
                  </div>
                ) : null}

                <div className="max-h-56 space-y-2 overflow-auto rounded-md border p-2">
                  {isLoading && !products ? (
                    <div className="py-4 text-center text-sm text-muted-foreground">
                      Carregando produtos...
                    </div>
                  ) : isLoading ? (
                    <div className="py-4 text-center text-sm text-muted-foreground">
                      Buscando...
                    </div>
                  ) : filteredProducts.length === 0 ? (
                    <div className="py-4 text-center text-sm text-muted-foreground">
                      {isSearchMode
                        ? `Nenhum produto encontrado para "${searchTerm}"`
                        : "Nenhum produto disponível no momento"}
                    </div>
                  ) : (
                    displayedProducts.map((product, index) => {
                      const isSelected = selectedProductId === product.id.toString();
                      const isKeyboardActive = index === keyboardActiveIndex;
                      return (
                        <label
                          key={product.id}
                          className={`flex cursor-pointer items-center justify-between rounded-md border px-3 py-2 text-sm ${
                            isSelected
                              ? "border-primary bg-primary/5"
                              : isKeyboardActive
                                ? "border-primary/50 bg-primary/5"
                                : "bg-background"
                          }`}
                          onMouseEnter={() => setKeyboardActiveIndex(index)}
                        >
                          <div className="min-w-0">
                            <div className="truncate font-medium">{product.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {product.marca ? `${product.marca} - ` : ""}
                              {product.medida} - Estoque: {product.quantidade}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              min="1"
                              value={getListQuantity(product.id)}
                              onChange={(e) => {
                                const parsed = Number.parseInt(e.target.value, 10);
                                updateListQuantity(product.id, Number.isNaN(parsed) ? 1 : parsed);
                              }}
                              className="h-8 w-16 text-center text-xs"
                            />
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedProductId(product.id.toString());
                                addItem(product.id, getListQuantity(product.id));
                              }}
                            >
                              Add
                            </Button>
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => {
                                setSelectedProductId(product.id.toString());
                                setKeyboardActiveIndex(index);
                              }}
                            />
                          </div>
                        </label>
                      );
                    })
                  )}
                </div>
                {filteredProducts.length > displayedProducts.length ? (
                  <div className="text-xs text-muted-foreground">
                    Mostrando {displayedProducts.length} de {filteredProducts.length} resultados. Continue digitando para refinar.
                  </div>
                ) : null}
                <div className="text-xs text-muted-foreground">
                  {isSearchMode
                    ? <>Dica: pressione <strong>Enter</strong> para selecionar o primeiro resultado (ou adicionar o selecionado).</>
                    : "Top 20 produtos carregados. Digite pelo menos 2 letras para buscar em toda a base."}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="quantidade">Quantidade</Label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setQuantidade(Math.max(1, quantidade - 1))}
                  className="h-10 w-10 shrink-0"
                >
                  <span className="text-lg font-bold">-</span>
                </Button>
                <Input
                  id="quantidade"
                  type="number"
                  min="1"
                  value={quantidade}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '' || value === '0') {
                      setQuantidade(1);
                    } else {
                      const parsed = parseInt(value);
                      if (!isNaN(parsed) && parsed > 0) {
                        setQuantidade(parsed);
                      }
                    }
                  }}
                  className="text-center text-lg font-semibold"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setQuantidade(quantidade + 1)}
                  className="h-10 w-10 shrink-0"
                >
                  <span className="text-lg font-bold">+</span>
                </Button>
              </div>
            </div>

            <Button onClick={() => addItem()} className="w-full gap-2">
              <Plus className="h-4 w-4" />
              Adicionar à Venda
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={selectFirstProductFromSearch}
              disabled={filteredProducts.length === 0}
              className="w-full"
            >
              Selecionar primeiro resultado
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              Itens da Venda
            </CardTitle>
            <CardDescription>
              {saleItems.length} item(ns) adicionado(s)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 grid gap-2 md:grid-cols-3">
              <div className="rounded-md border bg-muted/20 p-2">
                <div className="text-xs text-muted-foreground">Produtos no carrinho</div>
                <div className="text-lg font-semibold">{totalItems}</div>
              </div>
              <div className="rounded-md border bg-muted/20 p-2">
                <div className="text-xs text-muted-foreground">Unidades totais</div>
                <div className="text-lg font-semibold">{totalUnits}</div>
              </div>
              <div className="rounded-md border bg-muted/20 p-2">
                <div className="text-xs text-muted-foreground">Alertas de estoque</div>
                <div className="text-lg font-semibold">{lowStockItems.length}</div>
              </div>
            </div>

            {lowStockItems.length > 0 ? (
              <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                Há itens acima do estoque disponível no carrinho.
              </div>
            ) : null}

            {saleItems.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <ShoppingCart className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhum item adicionado</p>
              </div>
            ) : (
              <div className="space-y-3">
                {saleItems.map((item) => (
                  <div
                    key={item.productId}
                    className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border border-border"
                  >
                    <div className="space-y-1 flex-1">
                      <p className="font-medium text-foreground">{item.productName}</p>
                      <div className="flex gap-2">
                        <Badge variant="outline" className="text-xs">
                          {item.medida}
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                          Qtd: {item.quantidade}
                        </Badge>
                        <Badge
                          variant={item.quantidade > item.estoque ? "destructive" : "outline"}
                          className="text-xs"
                        >
                          Estoque: {item.estoque}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => updateSaleItemQuantity(item.productId, item.quantidade - 1)}
                      >
                        -
                      </Button>
                      <Input
                        type="number"
                        min={1}
                        value={item.quantidade}
                        onChange={(e) => {
                          const parsed = Number.parseInt(e.target.value, 10);
                          updateSaleItemQuantity(item.productId, Number.isNaN(parsed) ? 1 : parsed);
                        }}
                        className="h-8 w-16 text-center text-xs"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => updateSaleItemQuantity(item.productId, item.quantidade + 1)}
                      >
                        +
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeItem(item.productId)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}

                <div className="space-y-3 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="observacoes">Observações (Opcional)</Label>
                    <Input
                      id="observacoes"
                      type="text"
                      placeholder="Ex: Cor, especificações, nome do cliente, número do pedido..."
                      value={observacoes}
                      onChange={(e) => setObservacoes(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Use este campo para registrar detalhes importantes, especialmente para produtos sem estoque
                    </p>
                  </div>
                  <Button
                    onClick={handleSubmit}
                    disabled={registrarVendaMutation.isPending || !vendedor || saleItems.length === 0}
                    className="w-full"
                    size="lg"
                  >
                    {registrarVendaMutation.isPending ? "Processando..." : "Confirmar Venda"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={clearSaleItems}
                    disabled={saleItems.length === 0 || registrarVendaMutation.isPending}
                    className="w-full"
                  >
                    Limpar Carrinho
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
