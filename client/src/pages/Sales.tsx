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
}

const VENDEDORES = ["Cleonice", "Luciano", "Vanuza", "Thuanny"];
const PERF_LATENCY_WARNING_MS = 500;
const PERF_LATENCY_CRITICAL_MS = 1200;
const PERF_RENDER_WARNING = 120;
const INITIAL_PRODUCT_PRELIST_LIMIT = 20;
const SEARCH_PRODUCT_LIMIT = 100;
const INITIAL_VISIBLE_ROWS = 20;
const SEARCH_VISIBLE_ROWS = 60;

export default function Sales() {
  const isDev = import.meta.env.DEV;
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [saleItems, setSaleItems] = useState<SaleItem[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [quantidade, setQuantidade] = useState(1);
  const [importFolderPath, setImportFolderPath] = useState("");
  const [importedDrafts, setImportedDrafts] = useState<ImportedDraft[]>([]);
  const [processedImports, setProcessedImports] = useState<Record<string, boolean>>({});
  const [draftReviewMap, setDraftReviewMap] = useState<Record<string, DraftReviewState>>({});
  const [batchReviewNote, setBatchReviewNote] = useState("");
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
  const [observacoes, setObservacoes] = useState("");
  const [tipoTransacao, setTipoTransacao] = useState<"venda" | "troca" | "brinde" | "emprestimo" | "permuta">("venda");

  const utils = trpc.useUtils();
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
          draft.itens.forEach((item, index) => {
            if (item.productId != null) {
              includeByIndex[index] = true;
              quantityByIndex[index] = Math.max(1, item.quantidade);
            }
          });
          next[key] = { reviewed: false, approved: false, reviewNote: "", includeByIndex, quantityByIndex };
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
          draft.itens.forEach((item, index) => {
            if (item.productId != null) {
              includeByIndex[index] = true;
              quantityByIndex[index] = Math.max(1, item.quantidade);
            }
          });
          next[key] = { reviewed: false, approved: false, reviewNote: "", includeByIndex, quantityByIndex };
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
    };
  }, []);

  const getDraftReviewState = useCallback(
    (draft: ImportedDraft): DraftReviewState => {
      const key = getDraftKey(draft);
      return draftReviewMap[key] ?? createDefaultDraftReviewState(draft);
    },
    [createDefaultDraftReviewState, draftReviewMap, getDraftKey]
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
        .filter(({ item, index }) => item.productId != null && review.includeByIndex[index] !== false)
        .map(({ item, index }) => ({
          productId: item.productId as number,
          quantidade: Math.max(1, review.quantityByIndex[index] ?? item.quantidade ?? 1),
        }));
    },
    [getDraftReviewState]
  );

  const addImportedItemsToCart = useCallback(async (draft: ImportedDraft) => {
    const review = getDraftReviewState(draft);
    if (!review.approved) {
      toast.warning("Aprovação obrigatória: revise e aprove o arquivo antes de adicionar ao carrinho.");
      return;
    }

    const approvedItems = getApprovedRecognizedItems(draft);
    const importableItems = approvedItems.filter((item) => item.productId && item.quantidade > 0);
    if (importableItems.length === 0) {
      toast.warning("Nenhum item reconhecido para importar neste PDF.");
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

    if (!nomeCliente && draft.cliente) {
      setNomeCliente(draft.cliente);
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
  }, [getApprovedRecognizedItems, getDraftReviewState, nomeCliente, utils.products.getById]);

  const registerImportedDraftNow = useCallback(async (draft: ImportedDraft) => {
    if (!vendedor) {
      toast.error("Selecione um vendedor antes de lançar a venda importada.");
      return;
    }

    const review = getDraftReviewState(draft);
    if (!review.approved) {
      toast.warning("Aprovação obrigatória: revise e aprove o arquivo antes de lançar.");
      return;
    }

    const items = getApprovedRecognizedItems(draft);
    if (items.length === 0) {
      toast.warning("Este arquivo não possui itens reconhecidos para lançamento.");
      return;
    }

    const origem = `Importado de PDF: ${draft.fileName}`;
    const baseObs = draft.endereco ? `Endereço: ${draft.endereco}` : undefined;
    const obs = [origem, baseObs].filter(Boolean).join(" | ");

    await registrarImportadaMutation.mutateAsync({
      items,
      vendedor,
      nomeCliente: draft.cliente ?? undefined,
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
  }, [getApprovedRecognizedItems, getDraftKey, getDraftReviewState, registrarImportadaMutation, tipoTransacao, utils.vendas.importHistory, vendedor]);

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
      return { ...current, approved: !current.approved };
    });
  }, [updateDraftReviewState]);

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
    importedDrafts.forEach((draft) => {
      updateDraftReviewState(draft, (current) => {
        if (!current.reviewed) return current;
        approvedCount += 1;
        return {
          ...current,
          approved: true,
          reviewNote: current.reviewNote || batchReviewNote,
        };
      });
    });

    if (approvedCount === 0) {
      toast.warning("Nenhum arquivo revisado para aprovar.");
      return;
    }
    toast.success(`${approvedCount} arquivo(s) aprovados em lote.`);
  }, [batchReviewNote, importedDrafts, updateDraftReviewState]);

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
    if (!vendedor) {
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

  const handleSubmit = () => {
    if (saleItems.length === 0) {
      toast.error("Adicione pelo menos um produto à venda");
      return;
    }

    if (!vendedor) {
      toast.error("Selecione o vendedor");
      return;
    }

    registrarVendaMutation.mutate({
      items: saleItems.map(item => ({
        productId: item.productId,
        quantidade: item.quantidade,
      })),
      vendedor,
      nomeCliente: nomeCliente || undefined,
      observacoes: observacoes || undefined,
      tipoTransacao,
    });
    setVendedor("");
    setNomeCliente("");
    setObservacoes("");
  };

  const totalItems = saleItems.length;
  const totalUnits = saleItems.reduce((acc, item) => acc + item.quantidade, 0);
  const lowStockItems = saleItems.filter((item) => item.quantidade > item.estoque);
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
      <div>
        <h1 className="text-3xl font-bold text-foreground">Registrar Vendas</h1>
        <p className="text-muted-foreground mt-2">Registre as vendas do dia e atualize o estoque automaticamente</p>
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

      <Card className="border-border shadow-sm">
        <CardHeader>
          <CardTitle>Importar Vendas por PDF</CardTitle>
          <CardDescription>
            Leia automaticamente PDFs da pasta e adicione itens reconhecidos ao carrinho de venda.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
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
                <div className="flex items-center gap-2">
                  <Input
                    value={batchReviewNote}
                    onChange={(event) => setBatchReviewNote(event.target.value)}
                    placeholder="Observação padrão da revisão (lote)"
                    className="h-8 w-64 text-xs"
                  />
                  <Button type="button" size="sm" variant="outline" onClick={markAllDraftsReviewed}>
                    Revisar todos
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={approveAllReviewedDrafts}>
                    Aprovar revisados
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => void addAllImportedToCart()}>
                    Adicionar todos ao carrinho
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void registerAllImportedNow()}
                    disabled={registrarImportadaMutation.isPending}
                  >
                    {registrarImportadaMutation.isPending ? "Lançando..." : "Lançar todos"}
                  </Button>
                </div>
              </div>
              <div className="max-h-72 space-y-2 overflow-auto">
                {importedDrafts.map((draft) => {
                  const recognizedItems = draft.itens
                    .map((item, index) => ({ item, index }))
                    .filter(({ item }) => item.productId != null);
                  const review = getDraftReviewState(draft);
                  const selectedItems = getApprovedRecognizedItems(draft);
                  const done = processedImports[getDraftKey(draft)];
                  return (
                    <div key={getDraftKey(draft)} className="rounded-md border bg-muted/20 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold">{draft.fileName}</p>
                          <p className="text-xs text-muted-foreground">
                            Cliente: {draft.cliente ?? "não identificado"} | Itens reconhecidos: {recognizedItems.length}/{draft.itens.length} | Selecionados: {selectedItems.length}
                          </p>
                          {draft.documentNumber ? (
                            <p className="text-xs text-muted-foreground">Documento: {draft.documentNumber}</p>
                          ) : null}
                          <p className="text-xs text-muted-foreground">
                            Revisado: {review.reviewed ? "sim" : "não"} | Aprovado: {review.approved ? "sim" : "não"}
                          </p>
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
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => markDraftReviewed(draft)}
                          >
                            Marcar revisado
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={review.approved ? "secondary" : "default"}
                            onClick={() => toggleDraftApproved(draft)}
                          >
                            {review.approved ? "Aprovado" : "Aprovar"}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => void addImportedItemsToCart(draft)}
                            disabled={selectedItems.length === 0}
                          >
                            Adicionar ao carrinho
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => void registerImportedDraftNow(draft)}
                            disabled={!review.approved || selectedItems.length === 0 || done || registrarImportadaMutation.isPending}
                          >
                            Lançar agora
                          </Button>
                        </div>
                      </div>
                      {recognizedItems.length > 0 ? (
                        <div className="mt-2 max-h-40 space-y-2 overflow-auto rounded border bg-background/60 p-2">
                          {recognizedItems.map(({ item, index }) => {
                            const included = review.includeByIndex[index] !== false;
                            const qty = review.quantityByIndex[index] ?? item.quantidade;
                            return (
                              <div key={`${getDraftKey(draft)}-${index}`} className="flex items-center gap-2 text-xs">
                                <Checkbox
                                  checked={included}
                                  onCheckedChange={(checked) => toggleDraftItemIncluded(draft, index, Boolean(checked))}
                                />
                                <span className="min-w-0 flex-1 truncate">
                                  {item.productName} {item.medida ? `(${item.medida})` : ""}
                                </span>
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
                      {draft.total != null ? (
                        <p className="mt-1 text-xs text-muted-foreground">Total PDF: R$ {draft.total.toFixed(2)}</p>
                      ) : null}
                      {draft.warnings.length > 0 ? (
                        <p className="mt-1 text-xs text-amber-700">{draft.warnings[0]}</p>
                      ) : null}
                    </div>
                  );
                })}
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
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle>Adicionar Produtos</CardTitle>
            <CardDescription>Selecione os produtos vendidos</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="vendedor">Vendedor Responsável</Label>
              <Select value={vendedor} onValueChange={setVendedor}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o vendedor" />
                </SelectTrigger>
                <SelectContent>
                  {VENDEDORES.map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="nomeCliente">Nome do Cliente (Opcional)</Label>
              <Input
                id="nomeCliente"
                type="text"
                placeholder="Ex: Maria Silva"
                value={nomeCliente}
                onChange={(e) => setNomeCliente(e.target.value)}
              />
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
