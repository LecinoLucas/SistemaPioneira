import { trpc } from "@/lib/trpc";
import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useAccessControl } from "@/features/auth/hooks/useAccessControl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Pencil, Trash2, Search, AlertTriangle, FileDown, Undo2, Eye, EyeOff, Archive, ArchiveRestore, RotateCcw } from "lucide-react";
import { downloadFileFromUrl } from "@/lib/download";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const ProductFormDialog = lazy(() => import("@/components/products/ProductFormDialog"));
const preloadProductFormDialog = () => import("@/components/products/ProductFormDialog");
const PRODUCTS_TRASH_STORAGE_KEY = "products-trash-pending-v1";
const PRODUCTS_SORT_RISK_STORAGE_KEY = "products-sort-risk-v1";

type Product = {
  id: number;
  name: string;
  marca: string | null;
  medida: string;
  categoria: string;
  quantidade: number;
  estoqueMinimo: number;
  ativoParaVenda: boolean;
  arquivado: boolean;
  motivoInativacao: string | null;
  motivoArquivamento: string | null;
  statusProduto?: "ATIVO" | "INATIVO" | "ARQUIVADO";
};

type ProductFormData = {
  name: string;
  marca: string;
  medida: string;
  categoria: string;
  quantidade: number;
  estoqueMinimo: number;
};

type DuplicateIdentityMatch = {
  id: number;
  name: string;
  marca: string | null;
  medida: string;
  categoria: string;
  quantidade: number;
  ativoParaVenda: boolean;
  arquivado: boolean;
};

const normalizeIdentityValue = (value?: string | null) =>
  (value ?? "").trim().toLowerCase();

const normalizeNameForSimilarity = (name: string) =>
  normalizeIdentityValue(name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const buildBigrams = (value: string) => {
  const padded = ` ${value} `;
  const grams: string[] = [];
  for (let i = 0; i < padded.length - 1; i += 1) {
    grams.push(padded.slice(i, i + 2));
  }
  return grams;
};

const diceSimilarity = (a: string, b: string) => {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const aBigrams = buildBigrams(a);
  const bBigrams = buildBigrams(b);
  if (!aBigrams.length || !bBigrams.length) return 0;

  const bCounts = new Map<string, number>();
  for (const gram of bBigrams) {
    bCounts.set(gram, (bCounts.get(gram) ?? 0) + 1);
  }

  let intersection = 0;
  for (const gram of aBigrams) {
    const count = bCounts.get(gram) ?? 0;
    if (count > 0) {
      intersection += 1;
      bCounts.set(gram, count - 1);
    }
  }

  return (2 * intersection) / (aBigrams.length + bBigrams.length);
};

export default function Products() {
  const { user } = useAuth();
  const { canPerform } = useAccessControl();
  const isAdmin = canPerform("action:products.pricing");
  const canManageProducts = canPerform("action:products.manage");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isCreateModelDialogOpen, setIsCreateModelDialogOpen] = useState(false);
  const [isDuplicateConfirmOpen, setIsDuplicateConfirmOpen] = useState(false);
  const [isActionMode, setIsActionMode] = useState(false);
  const [duplicateMatches, setDuplicateMatches] = useState<DuplicateIdentityMatch[]>([]);
  const [duplicateContextMode, setDuplicateContextMode] = useState<"create" | "update">("create");
  const [duplicateReviewType, setDuplicateReviewType] = useState<"exact" | "similar">("exact");
  const duplicateDecisionResolverRef = useRef<((value: boolean) => void) | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [pendingDeletionIds, setPendingDeletionIds] = useState<Set<number>>(() => {
    try {
      const raw = localStorage.getItem(PRODUCTS_TRASH_STORAGE_KEY);
      if (!raw) return new Set<number>();
      const parsed = JSON.parse(raw) as { ids?: number[] };
      return new Set((parsed.ids ?? []).filter((id) => Number.isFinite(id)));
    } catch {
      return new Set<number>();
    }
  });
  const [pendingDeletionSnapshot, setPendingDeletionSnapshot] = useState<Record<number, Product>>(() => {
    try {
      const raw = localStorage.getItem(PRODUCTS_TRASH_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as { snapshot?: Record<number, Product> };
      return parsed.snapshot ?? {};
    } catch {
      return {};
    }
  });
  const [lastDeleteSummary, setLastDeleteSummary] = useState<{ successCount: number; failCount: number } | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [filterMedida, setFilterMedida] = useState("all");
  const [filterCategoria, setFilterCategoria] = useState("all");
  const [filterMarca, setFilterMarca] = useState("all");
  const [filterSaleStatus, setFilterSaleStatus] = useState<"all" | "active" | "inactive">("all");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [sortByStockRisk, setSortByStockRisk] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem(PRODUCTS_SORT_RISK_STORAGE_KEY);
      return raw === "1";
    } catch {
      return false;
    }
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [togglingProductId, setTogglingProductId] = useState<number | null>(null);
  const [saleStatusTarget, setSaleStatusTarget] = useState<Product | null>(null);
  const [isSaleStatusDialogOpen, setIsSaleStatusDialogOpen] = useState(false);
  const [inactivationReason, setInactivationReason] = useState("");
  const [archiveTarget, setArchiveTarget] = useState<Product | null>(null);
  const [isArchiveDialogOpen, setIsArchiveDialogOpen] = useState(false);
  const [archiveReason, setArchiveReason] = useState("");
  const [pageSize, setPageSize] = useState(25);
  const [newModelName, setNewModelName] = useState("");
  const [newModelBrandId, setNewModelBrandId] = useState("");
  const [newModelTypeId, setNewModelTypeId] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Debounce search term to prevent excessive queries
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchTerm, filterMedida, filterCategoria, filterMarca, filterSaleStatus, includeArchived, pageSize]);

  useEffect(() => {
    if (!canManageProducts) return;
    const timeoutId = window.setTimeout(() => {
      void preloadProductFormDialog();
    }, 900);
    return () => window.clearTimeout(timeoutId);
  }, [canManageProducts]);

  useEffect(() => {
    if (canManageProducts) return;
    setIsActionMode(false);
    setSelectedIds(new Set());
  }, [canManageProducts]);

  useEffect(() => {
    try {
      const payload = {
        ids: Array.from(pendingDeletionIds),
        snapshot: pendingDeletionSnapshot,
      };
      localStorage.setItem(PRODUCTS_TRASH_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore localStorage failures (private mode / storage blocked)
    }
  }, [pendingDeletionIds, pendingDeletionSnapshot]);

  useEffect(() => {
    try {
      localStorage.setItem(PRODUCTS_SORT_RISK_STORAGE_KEY, sortByStockRisk ? "1" : "0");
    } catch {
      // Ignore localStorage failures (private mode / storage blocked)
    }
  }, [sortByStockRisk]);

  useEffect(() => {
    const onGlobalKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/") return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    };

    window.addEventListener("keydown", onGlobalKeyDown);
    return () => window.removeEventListener("keydown", onGlobalKeyDown);
  }, []);

  // Memoize query params to prevent infinite re-renders
  const queryParams = useMemo(() => ({
    searchTerm: debouncedSearchTerm || undefined,
    medida: filterMedida === "all" ? undefined : filterMedida || undefined,
    categoria: filterCategoria === "all" ? undefined : filterCategoria || undefined,
    marca: filterMarca === "all" ? undefined : filterMarca || undefined,
    includeArchived,
    page: currentPage,
    pageSize,
  }), [debouncedSearchTerm, filterMedida, filterCategoria, filterMarca, includeArchived, currentPage, pageSize]);

  const [formData, setFormData] = useState<ProductFormData>({
    name: "",
    marca: "",
    medida: "",
    categoria: "",
    quantidade: 0,
    estoqueMinimo: 1,
  });
  const [auditJustification, setAuditJustification] = useState("");

  const utils = trpc.useUtils();
  const { data: products, isLoading, isFetching, error: productsError } = trpc.products.list.useQuery(queryParams, {
    placeholderData: (prev) => prev,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const { data: marcasDb } = trpc.catalogo.list.useQuery(undefined, {
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
  const { data: medidasDb } = trpc.catalogo.listMeasures.useQuery(undefined, {
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
  const { data: tiposDb } = trpc.catalogo.listTypes.useQuery(undefined, {
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
  const { data: modelosDb } = trpc.catalogo.listModels.useQuery(undefined, {
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
  const medidasCatalogo = useMemo(() => (medidasDb ?? []).map((item) => item.nome), [medidasDb]);
  const tiposCatalogo = useMemo(() => (tiposDb ?? []).map((item) => item.nome), [tiposDb]);
  const marcasCatalogo = useMemo(() => (marcasDb ?? []).map((item) => item.nome), [marcasDb]);
  const modelSuggestions = useMemo(() => {
    const brandMap = new Map((marcasDb ?? []).map((item) => [item.id, item.nome]));
    const typeMap = new Map((tiposDb ?? []).map((item) => [item.id, item.nome]));
    const sourceItems = modelosDb ?? [];
    const normalizedModels = new Set<string>();
    for (const item of sourceItems) {
      const modelBrand = brandMap.get(item.brandId) ?? "";
      const modelType = typeMap.get(item.productTypeId) ?? "";
      if (formData.categoria && modelType !== formData.categoria) continue;
      if (formData.marca && modelBrand !== formData.marca) continue;
      const name = item.nome?.trim();
      if (name) normalizedModels.add(name);
    }
    return Array.from(normalizedModels).sort((a, b) => a.localeCompare(b));
  }, [formData.categoria, formData.marca, marcasDb, modelosDb, tiposDb]);

  const createMutation = trpc.products.create.useMutation({
    onSuccess: () => {
      utils.products.list.invalidate();
      utils.dashboard.stats.invalidate();
      utils.products.lowStock.invalidate();
      setIsCreateOpen(false);
      resetForm();
      toast.success("Produto criado com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao criar produto: " + error.message);
    },
  });

  const updateMutation = trpc.products.update.useMutation({
    onSuccess: () => {
      utils.products.list.invalidate();
      utils.dashboard.stats.invalidate();
      utils.products.lowStock.invalidate();
      setIsEditOpen(false);
      setEditingProduct(null);
      setAuditJustification("");
      toast.success("Produto atualizado com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao atualizar produto: " + error.message);
    },
  });
  const createModelMutation = trpc.catalogo.createModel.useMutation({
    onSuccess: async () => {
      await utils.catalogo.listModels.invalidate();
      toast.success("Modelo criado com sucesso.");
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao criar modelo.");
    },
  });
  const duplicateIdentityMutation = trpc.products.checkDuplicateIdentity.useMutation();
  const toggleSaleStatusMutation = trpc.products.update.useMutation({
    onSuccess: (_, variables) => {
      utils.products.list.invalidate();
      utils.dashboard.stats.invalidate();
      utils.products.lowStock.invalidate();
      const turnedOn = variables.ativoParaVenda === true;
      toast.success(turnedOn ? "Produto ativado para novas vendas." : "Produto inativado para novas vendas.");
    },
    onError: (error) => {
      toast.error("Erro ao atualizar status de venda: " + error.message);
    },
    onSettled: () => {
      setTogglingProductId(null);
    },
  });
  const archiveMutation = trpc.products.archive.useMutation({
    onSuccess: () => {
      utils.products.list.invalidate();
      utils.dashboard.stats.invalidate();
      utils.products.lowStock.invalidate();
      setIsArchiveDialogOpen(false);
      setArchiveTarget(null);
      setArchiveReason("");
      toast.success("Produto arquivado com sucesso.");
    },
    onError: (error) => {
      toast.error("Erro ao arquivar produto: " + error.message);
    },
  });
  const unarchiveMutation = trpc.products.unarchive.useMutation({
    onSuccess: () => {
      utils.products.list.invalidate();
      utils.dashboard.stats.invalidate();
      utils.products.lowStock.invalidate();
      toast.success("Produto desarquivado.");
    },
    onError: (error) => {
      toast.error("Erro ao desarquivar produto: " + error.message);
    },
  });

  const deleteBatchMutation = trpc.products.deleteBatch.useMutation();

  const exportPDFMutation = trpc.products.exportPDF.useMutation({
    onSuccess: async (data) => {
      try {
        await downloadFileFromUrl(data.url, {
          fileName: `produtos-${Date.now()}.pdf`,
        });
        toast.success("PDF baixado com sucesso!");
      } catch (error) {
        toast.error("Erro ao baixar PDF");
        // Fallback: abrir em nova aba
        window.open(data.url, "_blank", "noopener,noreferrer");
      }
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao gerar PDF");
    },
  });

  const handleExportPDF = () => {
    exportPDFMutation.mutate({ 
      search: debouncedSearchTerm,
      medida: filterMedida === 'all' ? undefined : filterMedida,
      categoria: filterCategoria === 'all' ? undefined : filterCategoria,
      marca: filterMarca === 'all' ? undefined : filterMarca
    });
  };

  const clearFilters = useCallback(() => {
    setSearchTerm("");
    setDebouncedSearchTerm("");
    setFilterMedida("all");
    setFilterCategoria("all");
    setFilterMarca("all");
    setFilterSaleStatus("all");
    setIncludeArchived(false);
    setCurrentPage(1);
  }, []);

  const handleToggleActionMode = useCallback(() => {
    setIsActionMode((prev) => {
      const next = !prev;
      if (!next) {
        setSelectedIds(new Set());
      }
      return next;
    });
  }, []);

  const resetForm = () => {
    setFormData({
      name: "",
      marca: "",
      medida: "",
      categoria: "",
      quantidade: 0,
      estoqueMinimo: 1,
    });
  };

  const requestDuplicateConfirmation = useCallback(
    (matches: DuplicateIdentityMatch[], mode: "create" | "update", reviewType: "exact" | "similar") =>
      new Promise<boolean>((resolve) => {
        duplicateDecisionResolverRef.current = resolve;
        setDuplicateMatches(matches);
        setDuplicateContextMode(mode);
        setDuplicateReviewType(reviewType);
        setIsDuplicateConfirmOpen(true);
      }),
    []
  );

  const resolveDuplicateConfirmation = useCallback((decision: boolean) => {
    setIsDuplicateConfirmOpen(false);
    setDuplicateMatches([]);
    const resolver = duplicateDecisionResolverRef.current;
    duplicateDecisionResolverRef.current = null;
    resolver?.(decision);
  }, []);

  useEffect(() => {
    return () => {
      const resolver = duplicateDecisionResolverRef.current;
      duplicateDecisionResolverRef.current = null;
      resolver?.(false);
    };
  }, []);

  const confirmDuplicateIdentityIfNeeded = useCallback(
    async (payload: { name: string; medida: string; marca?: string; excludeId?: number; mode: "create" | "update" }) => {
      const result = await duplicateIdentityMutation.mutateAsync(payload);
      if (result.exists) {
        return await requestDuplicateConfirmation(
          (result.matches ?? []).slice(0, 10) as DuplicateIdentityMatch[],
          payload.mode,
          "exact"
        );
      }

      const sourceItems = (products?.items ?? []) as Product[];
      const targetName = normalizeNameForSimilarity(payload.name);
      const targetMarca = normalizeIdentityValue(payload.marca);
      const targetMedida = normalizeIdentityValue(payload.medida);
      const similarCandidates = sourceItems
        .filter((item) => item.id !== payload.excludeId)
        .filter((item) => normalizeIdentityValue(item.medida) === targetMedida)
        .filter((item) => normalizeIdentityValue(item.marca) === targetMarca)
        .map((item) => {
          const score = diceSimilarity(targetName, normalizeNameForSimilarity(item.name));
          return { item, score };
        })
        .filter(({ item, score }) => {
          const normalizedItemName = normalizeNameForSimilarity(item.name);
          const hasContainment =
            targetName.length >= 4 &&
            normalizedItemName.length >= 4 &&
            (targetName.includes(normalizedItemName) || normalizedItemName.includes(targetName));
          return score >= 0.72 || hasContainment;
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 10)
        .map(({ item }) => item as DuplicateIdentityMatch);

      if (similarCandidates.length === 0) return true;

      return await requestDuplicateConfirmation(similarCandidates, payload.mode, "similar");
    },
    [duplicateIdentityMutation, products?.items, requestDuplicateConfirmation]
  );

  const handleCreate = useCallback(async () => {
    if (!formData.name || !formData.medida || !formData.categoria) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    if (!medidasCatalogo.includes(formData.medida)) {
      toast.error("Selecione uma medida válida do catálogo.");
      return;
    }
    if (!tiposCatalogo.includes(formData.categoria)) {
      toast.error("Selecione um tipo/categoria válido do catálogo.");
      return;
    }
    if (formData.marca && !marcasCatalogo.includes(formData.marca)) {
      toast.error("Selecione uma marca válida do catálogo.");
      return;
    }
    const canProceed = await confirmDuplicateIdentityIfNeeded({
      name: formData.name,
      medida: formData.medida,
      marca: formData.marca || undefined,
      mode: "create",
    });
    if (!canProceed) {
      toast.info("Cadastro cancelado para revisão.");
      return;
    }
    createMutation.mutate(formData as never);
  }, [confirmDuplicateIdentityIfNeeded, createMutation, formData, marcasCatalogo, medidasCatalogo, tiposCatalogo]);

  const openCreateModelDialog = useCallback(() => {
    const selectedBrand = (marcasDb ?? []).find((item) => item.nome === formData.marca);
    const selectedType = (tiposDb ?? []).find((item) => item.nome === formData.categoria);
    setNewModelName(formData.name ?? "");
    setNewModelBrandId(selectedBrand ? String(selectedBrand.id) : "");
    setNewModelTypeId(selectedType ? String(selectedType.id) : "");
    setIsCreateModelDialogOpen(true);
  }, [formData.categoria, formData.marca, formData.name, marcasDb, tiposDb]);

  const handleCreateModelFromDialog = useCallback(async () => {
    const nome = newModelName.trim();
    if (!nome) {
      toast.error("Informe o nome do modelo.");
      return;
    }
    if (!newModelBrandId || !newModelTypeId) {
      toast.error("Selecione marca e tipo para o modelo.");
      return;
    }

    await createModelMutation.mutateAsync({
      nome,
      brandId: Number(newModelBrandId),
      productTypeId: Number(newModelTypeId),
    });

    const selectedBrandName = (marcasDb ?? []).find((item) => item.id === Number(newModelBrandId))?.nome ?? "";
    const selectedTypeName = (tiposDb ?? []).find((item) => item.id === Number(newModelTypeId))?.nome ?? "";

    setFormData((prev) => ({
      ...prev,
      name: nome,
      marca: selectedBrandName || prev.marca,
      categoria: selectedTypeName || prev.categoria,
    }));
    setIsCreateModelDialogOpen(false);
  }, [createModelMutation, marcasDb, newModelBrandId, newModelName, newModelTypeId, tiposDb]);

  const handleEdit = useCallback((product: Product) => {
    setEditingProduct(product);
    setAuditJustification("");
    setFormData({
      name: product.name,
      marca: product.marca || "",
      medida: product.medida,
      categoria: product.categoria,
      quantidade: product.quantidade,
      estoqueMinimo: product.estoqueMinimo,
    });
    setIsEditOpen(true);
  }, []);

  const handleUpdate = useCallback(async () => {
    if (!editingProduct) return;
    if (!medidasCatalogo.includes(formData.medida)) {
      toast.error("Selecione uma medida válida cadastrada em Categorias.");
      return;
    }
    if (!tiposCatalogo.includes(formData.categoria)) {
      toast.error("Selecione um tipo/categoria válido cadastrado em Categorias.");
      return;
    }
    if (formData.marca && !marcasCatalogo.includes(formData.marca)) {
      toast.error("Selecione uma marca válida cadastrada em Categorias.");
      return;
    }
    const canProceed = await confirmDuplicateIdentityIfNeeded({
      name: formData.name,
      medida: formData.medida,
      marca: formData.marca || undefined,
      excludeId: editingProduct.id,
      mode: "update",
    });
    if (!canProceed) {
      toast.info("Alteração cancelada para revisão.");
      return;
    }
    const payload: Record<string, unknown> = {
      id: editingProduct.id,
    };

    if (formData.name !== editingProduct.name) payload.name = formData.name;
    if ((formData.marca || null) !== (editingProduct.marca || null)) payload.marca = formData.marca;
    if (formData.medida !== editingProduct.medida) payload.medida = formData.medida;
    if (formData.categoria !== editingProduct.categoria) payload.categoria = formData.categoria;
    if (formData.quantidade !== editingProduct.quantidade) payload.quantidade = formData.quantidade;
    if (formData.estoqueMinimo !== editingProduct.estoqueMinimo) payload.estoqueMinimo = formData.estoqueMinimo;

    const isGoverned = editingProduct.arquivado || !editingProduct.ativoParaVenda;
    const hasStockChange = payload.quantidade !== undefined || payload.estoqueMinimo !== undefined;
    if (isGoverned && hasStockChange) {
      const reason = auditJustification.trim();
      if (!reason) {
        toast.warning("Informe a justificativa da alteração para produto inativo/arquivado.");
        return;
      }
      payload.auditJustification = reason;
    } else if (auditJustification.trim()) {
      payload.auditJustification = auditJustification.trim();
    }

    if (Object.keys(payload).length === 1) {
      toast.info("Nenhuma alteração detectada.");
      return;
    }

    updateMutation.mutate(payload as never);
  }, [auditJustification, confirmDuplicateIdentityIfNeeded, editingProduct, formData, marcasCatalogo, medidasCatalogo, tiposCatalogo, updateMutation]);

  const handleToggleSaleStatus = useCallback(
    (product: Product) => {
      if (product.arquivado) {
        toast.warning("Desarquive o produto antes de alterar o status de venda.");
        return;
      }
      if (product.ativoParaVenda) {
        setSaleStatusTarget(product);
        setInactivationReason(product.motivoInativacao ?? "");
        setIsSaleStatusDialogOpen(true);
        return;
      }
      setTogglingProductId(product.id);
      toggleSaleStatusMutation.mutate({
        id: product.id,
        ativoParaVenda: true,
        motivoInativacao: null,
      });
    },
    [toggleSaleStatusMutation]
  );

  const confirmInactivation = useCallback(() => {
    if (!saleStatusTarget) return;
    const reason = inactivationReason.trim();
    if (!reason) {
      toast.warning("Informe o motivo da inativação.");
      return;
    }
    setTogglingProductId(saleStatusTarget.id);
    toggleSaleStatusMutation.mutate({
      id: saleStatusTarget.id,
      ativoParaVenda: false,
      motivoInativacao: reason,
    });
    setIsSaleStatusDialogOpen(false);
    setSaleStatusTarget(null);
    setInactivationReason("");
  }, [inactivationReason, saleStatusTarget, toggleSaleStatusMutation]);

  const handleArchive = useCallback((product: Product) => {
    setArchiveTarget(product);
    setArchiveReason(product.motivoArquivamento ?? "");
    setIsArchiveDialogOpen(true);
  }, []);

  const confirmArchive = useCallback(() => {
    if (!archiveTarget) return;
    const reason = archiveReason.trim();
    if (!reason) {
      toast.warning("Informe o motivo do arquivamento.");
      return;
    }
    archiveMutation.mutate({
      id: archiveTarget.id,
      motivoArquivamento: reason,
    });
  }, [archiveMutation, archiveReason, archiveTarget]);

  const handleUnarchive = useCallback((product: Product) => {
    unarchiveMutation.mutate({
      id: product.id,
      reativarParaVenda: false,
    });
  }, [unarchiveMutation]);

  const loadedItems = useMemo(() => products?.items ?? [], [products?.items]);
  const loadedItemsById = useMemo(() => {
    const map = new Map<number, Product>();
    for (const item of loadedItems) map.set(item.id, item);
    return map;
  }, [loadedItems]);
  const visibleItems = useMemo(
    () =>
      loadedItems.filter((product) => {
        if (pendingDeletionIds.has(product.id)) return false;
        if (filterSaleStatus === "active") return product.ativoParaVenda && !product.arquivado;
        if (filterSaleStatus === "inactive") return !product.ativoParaVenda && !product.arquivado;
        return true;
      }),
    [filterSaleStatus, loadedItems, pendingDeletionIds]
  );
  const sortedVisibleItems = useMemo(() => {
    if (!sortByStockRisk) return visibleItems;

    const riskWeight = (product: Product) => {
      if (product.quantidade < 0) return 0; // negativo/encomenda (mais crítico)
      if (product.quantidade <= 1) return 1; // crítico
      if (product.quantidade <= product.estoqueMinimo) return 2; // baixo
      return 3; // normal
    };

    return [...visibleItems].sort((a, b) => {
      const weightDiff = riskWeight(a) - riskWeight(b);
      if (weightDiff !== 0) return weightDiff;
      if (a.quantidade !== b.quantidade) return a.quantidade - b.quantidade;
      return a.name.localeCompare(b.name);
    });
  }, [sortByStockRisk, visibleItems]);
  const pendingDeletionItems = useMemo(() => {
    return Array.from(pendingDeletionIds)
      .map((id) => pendingDeletionSnapshot[id] ?? loadedItemsById.get(id))
      .filter((item): item is Product => Boolean(item))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [loadedItemsById, pendingDeletionIds, pendingDeletionSnapshot]);
  const stockSummary = useMemo(() => {
    let negative = 0;
    let critical = 0;
    let low = 0;
    for (const product of visibleItems) {
      if (product.quantidade < 0) {
        negative += 1;
        continue;
      }
      if (product.quantidade <= 1) {
        critical += 1;
        continue;
      }
      if (product.quantidade <= product.estoqueMinimo) {
        low += 1;
      }
    }
    return { negative, critical, low };
  }, [visibleItems]);
  const saleStatusCounts = useMemo(() => {
    let active = 0;
    let inactive = 0;
    let archived = 0;
    for (const product of loadedItems) {
      if (pendingDeletionIds.has(product.id)) continue;
      if (product.arquivado) {
        archived += 1;
      } else if (product.ativoParaVenda) {
        active += 1;
      } else {
        inactive += 1;
      }
    }
    return { active, inactive, archived };
  }, [loadedItems, pendingDeletionIds]);
  const allVisibleSelected = useMemo(
    () => sortedVisibleItems.length > 0 && sortedVisibleItems.every((product) => selectedIds.has(product.id)),
    [sortedVisibleItems, selectedIds]
  );

  const toggleSelectProduct = useCallback((productId: number, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(productId);
      else next.delete(productId);
      return next;
    });
  }, []);

  const toggleSelectAllVisible = useCallback((checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const product of visibleItems) {
        if (checked) next.add(product.id);
        else next.delete(product.id);
      }
      return next;
    });
  }, [visibleItems]);

  const markSelectedForDeletion = useCallback(() => {
    if (selectedIds.size === 0) {
      toast.warning("Selecione ao menos um produto para excluir.");
      return;
    }
    setPendingDeletionIds((prev) => {
      const next = new Set(prev);
      selectedIds.forEach((id) => next.add(id));
      return next;
    });
    setPendingDeletionSnapshot((prev) => {
      const next = { ...prev };
      selectedIds.forEach((id) => {
        const product = loadedItemsById.get(id);
        if (product) next[id] = product;
      });
      return next;
    });
    setSelectedIds(new Set());
    toast.info("Produtos marcados para exclusão. Você ainda pode desfazer antes de confirmar.");
  }, [loadedItemsById, selectedIds]);

  const markSingleForDeletion = useCallback((id: number) => {
    setPendingDeletionIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setPendingDeletionSnapshot((prev) => {
      const product = loadedItemsById.get(id);
      if (!product) return prev;
      return { ...prev, [id]: product };
    });
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    toast.info("Produto marcado para exclusão. Confirme para excluir definitivamente.");
  }, [loadedItemsById]);

  const restorePendingDeletion = useCallback((id: number) => {
    setPendingDeletionIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setPendingDeletionSnapshot((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const undoPendingDeletions = useCallback(() => {
    if (pendingDeletionIds.size === 0) return;
    setPendingDeletionIds(new Set());
    setPendingDeletionSnapshot({});
    setLastDeleteSummary(null);
    toast.success("Exclusão desfeita. Nenhum produto foi removido.");
  }, [pendingDeletionIds.size]);

  const openDeleteConfirm = useCallback(() => {
    if (pendingDeletionIds.size === 0) {
      toast.warning("Nenhum produto marcado para exclusão.");
      return;
    }
    setIsDeleteConfirmOpen(true);
  }, [pendingDeletionIds.size]);

  const confirmDelete = useCallback(async () => {
    const ids = Array.from(pendingDeletionIds);
    if (ids.length === 0) return;

    try {
      const result = await deleteBatchMutation.mutateAsync({ ids });
      const successCount = result.successCount;
      const failCount = result.failCount;
      const failedIdSet = new Set((result.failures ?? []).map((failure) => failure.id));

      await Promise.all([
        utils.products.list.invalidate(),
        utils.dashboard.stats.invalidate(),
        utils.products.lowStock.invalidate(),
      ]);

      if (successCount > 0) {
        toast.success(`${successCount} produto(s) excluído(s) com sucesso.`);
      }
      if (failCount > 0) {
        const reasons = (result.failures ?? [])
          .slice(0, 3)
          .map((failure) => `#${failure.id}: ${failure.message}`)
          .join(" | ");
        toast.error(
          reasons
            ? `${failCount} produto(s) não puderam ser excluídos. ${reasons}`
            : `${failCount} produto(s) não puderam ser excluídos.`
        );
      }
      setLastDeleteSummary({ successCount, failCount });

      // Keep only failed items in temporary trash for easy retry/review.
      if (failCount > 0) {
        setPendingDeletionIds((prev) => {
          const next = new Set<number>();
          prev.forEach((id) => {
            if (failedIdSet.has(id)) next.add(id);
          });
          return next;
        });
        setPendingDeletionSnapshot((prev) => {
          const next: Record<number, Product> = {};
          Object.entries(prev).forEach(([rawId, item]) => {
            const id = Number(rawId);
            if (failedIdSet.has(id)) next[id] = item;
          });
          return next;
        });
      } else {
        setPendingDeletionIds(new Set());
        setPendingDeletionSnapshot({});
      }
    } catch (error) {
      toast.error("Erro ao excluir produtos.");
    } finally {
      setSelectedIds(new Set());
      setIsDeleteConfirmOpen(false);
    }
  }, [deleteBatchMutation, pendingDeletionIds, utils.dashboard.stats, utils.products.list, utils.products.lowStock]);

  if (isLoading && !products) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Produtos</h1>
          <p className="text-muted-foreground mt-2">
            {canManageProducts ? "Gerencie seu catálogo de produtos" : "Visualize o catálogo de produtos (somente leitura)"}
          </p>
        </div>
        {canManageProducts && (
          <Button
            className="gap-2 w-full sm:w-auto min-h-10"
            onMouseEnter={() => {
              void preloadProductFormDialog();
            }}
            onFocus={() => {
              void preloadProductFormDialog();
            }}
            onClick={() => setIsCreateOpen(true)}
          >
            <Plus className="h-4 w-4" />
            Novo Produto
          </Button>
        )}
      </div>

      {productsError && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="pt-6">
            <p className="text-sm text-destructive font-medium">
              {isAdmin
                ? "Não foi possível carregar os produtos."
                : "Servidor fora do ar."}
            </p>
            {isAdmin && (
              <p className="text-xs text-muted-foreground mt-1">
                Verifique se o backend correto está ativo na porta 3001 e se o banco está acessível.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="border-border shadow-sm">
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
          <CardDescription>Busque e filtre produtos</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="search">Buscar por nome</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  id="search"
                  placeholder="Digite o nome..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => {
                    // Prevent default behavior for all keys except navigation keys
                    if (!['Tab', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
                      e.stopPropagation();
                    }
                  }}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="filterMedida">Filtrar por medida</Label>
              <Select value={filterMedida} onValueChange={setFilterMedida}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {medidasCatalogo.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="filterCategoria">Filtrar por categoria</Label>
              <Select value={filterCategoria} onValueChange={setFilterCategoria}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {tiposCatalogo.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="filterMarca">Filtrar por marca</Label>
              <Select value={filterMarca} onValueChange={setFilterMarca}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {marcasDb?.map((marca) => (
                    <SelectItem key={marca.id} value={marca.nome}>{marca.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <Label>Visualização de status</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={filterSaleStatus === "all" ? "default" : "outline"}
                size="sm"
                className="min-h-10"
                onClick={() => setFilterSaleStatus("all")}
              >
                Todos ({saleStatusCounts.active + saleStatusCounts.inactive})
              </Button>
              <Button
                variant={filterSaleStatus === "active" ? "default" : "outline"}
                size="sm"
                className="gap-2 min-h-10"
                onClick={() => setFilterSaleStatus("active")}
              >
                <Eye className="h-4 w-4" />
                Ativos ({saleStatusCounts.active})
              </Button>
              <Button
                variant={filterSaleStatus === "inactive" ? "default" : "outline"}
                size="sm"
                className="gap-2 min-h-10"
                onClick={() => setFilterSaleStatus("inactive")}
              >
                <EyeOff className="h-4 w-4" />
                Inativos ({saleStatusCounts.inactive})
              </Button>
              <Button
                variant={includeArchived ? "default" : "outline"}
                size="sm"
                className="gap-2 min-h-10"
                onClick={() => setIncludeArchived((prev) => !prev)}
              >
                <Archive className="h-4 w-4" />
                {includeArchived ? "Ocultar arquivados" : "Mostrar arquivados"} ({saleStatusCounts.archived})
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="gap-2 min-h-10"
                onClick={clearFilters}
              >
                <RotateCcw className="h-4 w-4" />
                Limpar filtros
              </Button>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <Label htmlFor="pageSize">Itens por página</Label>
            <div className="max-w-[220px]">
              <Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value))}>
                <SelectTrigger id="pageSize">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">25 por página</SelectItem>
                  <SelectItem value="50">50 por página</SelectItem>
                  <SelectItem value="100">100 por página</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {canManageProducts && isActionMode && pendingDeletionIds.size > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Lixeira Temporária
              {lastDeleteSummary && (
                <>
                  <Badge variant="secondary">{lastDeleteSummary.successCount} excluído(s)</Badge>
                  {lastDeleteSummary.failCount > 0 && (
                    <Badge variant="destructive">{lastDeleteSummary.failCount} bloqueado(s)</Badge>
                  )}
                </>
              )}
            </CardTitle>
            <CardDescription>
              Itens marcados para exclusão. Você pode restaurar antes da confirmação final.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="max-h-56 space-y-2 overflow-auto rounded-md border bg-background/80 p-2">
              {pendingDeletionItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{item.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {item.marca ? `${item.marca} - ` : ""}
                      {item.medida} - {item.categoria}
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => restorePendingDeletion(item.id)}>
                    Restaurar
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={undoPendingDeletions}>
                <Undo2 className="h-4 w-4 mr-2" />
                Restaurar todos
              </Button>
              <Button variant="destructive" onClick={openDeleteConfirm}>
                <Trash2 className="h-4 w-4 mr-2" />
                Confirmar exclusão definitiva
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-border shadow-sm">
        <CardHeader>
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                Lista de Produtos
                {isFetching && (
                  <span className="inline-block w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                )}
              </CardTitle>
              <CardDescription>
                {visibleItems.length} exibido(s) de {products?.total || 0} encontrado(s)
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
              {canManageProducts && (
                <Button
                  variant={isActionMode ? "default" : "outline"}
                  className="min-h-10"
                  onClick={handleToggleActionMode}
                >
                  {isActionMode ? "Encerrar ação" : "Assumir ação"}
                </Button>
              )}
              <Button
                variant={sortByStockRisk ? "default" : "outline"}
                className="min-h-10"
                onClick={() => setSortByStockRisk((prev) => !prev)}
                title="Ordenar por risco de estoque"
              >
                {sortByStockRisk ? "Risco: ON" : "Risco: OFF"}
              </Button>
              {canManageProducts && isActionMode && pendingDeletionIds.size > 0 && (
                <>
                  <Badge variant="destructive">{pendingDeletionIds.size} marcado(s)</Badge>
                  <Button variant="outline" onClick={undoPendingDeletions}>
                    <Undo2 className="h-4 w-4 mr-2" />
                    Desfazer marcações
                  </Button>
                  <Button variant="destructive" onClick={openDeleteConfirm}>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Excluir definitivamente
                  </Button>
                </>
              )}
              {user?.role === 'admin' && (
                <Button
                  variant="outline"
                  onClick={handleExportPDF}
                  disabled={exportPDFMutation.isPending}
                >
                  <FileDown className="h-4 w-4 mr-2" />
                  {exportPDFMutation.isPending ? "Gerando..." : "Exportar PDF"}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {canManageProducts && isActionMode && selectedIds.size > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-amber-400/40 bg-amber-500/10 px-3 py-2">
              <span className="text-sm">
                {selectedIds.size} produto(s) selecionado(s) para possível exclusão.
              </span>
                <Button variant="destructive" size="sm" onClick={markSelectedForDeletion}>
                  Marcar para exclusão
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                  Limpar seleção
              </Button>
            </div>
          )}
          <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="destructive">Crítico (≤1): {stockSummary.critical}</Badge>
            <Badge className="bg-orange-600 hover:bg-orange-600 text-white">Baixo (≤ mín.): {stockSummary.low}</Badge>
            <Badge className="bg-purple-700 hover:bg-purple-700 text-white">Negativo: {stockSummary.negative}</Badge>
            {includeArchived && (
              <Badge variant="secondary">Arquivados: {saleStatusCounts.archived}</Badge>
            )}
          </div>
          <div className="overflow-auto max-h-[68vh] rounded-md border touch-pan-y">
            <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                {canManageProducts && isActionMode && (
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allVisibleSelected}
                      onCheckedChange={(checked) => toggleSelectAllVisible(Boolean(checked))}
                      aria-label="Selecionar todos os produtos visíveis"
                    />
                  </TableHead>
                )}
                <TableHead>Quantidade</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Medida</TableHead>
                <TableHead>Marca</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleItems.length > 0 ? (
                sortedVisibleItems.map((product) => (
                  <ProductTableRow
                    key={product.id}
                    product={product}
                    canManageProducts={canManageProducts}
                    isActionMode={isActionMode}
                    isSelected={selectedIds.has(product.id)}
                    onSelect={toggleSelectProduct}
                    onEdit={handleEdit}
                    onDelete={markSingleForDeletion}
                    onToggleSaleStatus={handleToggleSaleStatus}
                    onArchive={handleArchive}
                    onUnarchive={handleUnarchive}
                    toggleLoading={togglingProductId === product.id && toggleSaleStatusMutation.isPending}
                  />
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={canManageProducts && isActionMode ? 6 : 5} className="text-center text-muted-foreground py-8">
                    {pendingDeletionIds.size > 0
                      ? "Todos os produtos desta página estão na Lixeira Temporária."
                      : "Nenhum produto encontrado"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          </div>

          {/* Pagination Controls */}
          {products && products.total > pageSize && (
            <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Mostrando {((currentPage - 1) * pageSize) + 1}–{Math.min(currentPage * pageSize, products.total)} de {products.total} produtos
              </p>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full sm:w-auto"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  Anterior
                </Button>
                <span className="text-sm font-medium px-2">
                  Página {currentPage} de {Math.ceil(products.total / pageSize)}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full sm:w-auto"
                  onClick={() => setCurrentPage(p => Math.min(Math.ceil(products.total / pageSize), p + 1))}
                  disabled={currentPage >= Math.ceil(products.total / pageSize)}
                >
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Suspense fallback={null}>
        <ProductFormDialog
          open={isCreateOpen}
          onOpenChange={(open) => {
            setIsCreateOpen(open);
            if (!open) {
              resetForm();
              setAuditJustification("");
            }
          }}
          title="Criar Novo Produto"
          description="Adicione um novo produto ao estoque"
          submitLabel="Criar Produto"
          isSubmitting={createMutation.isPending}
          formData={formData}
          setFormData={setFormData}
          medidas={medidasCatalogo}
          categorias={tiposCatalogo}
          marcas={marcasDb}
          modelSuggestions={modelSuggestions}
          enableModelSelector
          lockCatalogValues
          onRequestCreateModel={openCreateModelDialog}
          inputIdPrefix="create-product"
          onSubmit={handleCreate}
          onCancel={() => {
            setIsCreateOpen(false);
            resetForm();
            setAuditJustification("");
          }}
        />
      </Suspense>

      <Suspense fallback={null}>
        <ProductFormDialog
          open={isEditOpen}
          onOpenChange={(open) => {
            setIsEditOpen(open);
            if (!open) {
              setEditingProduct(null);
              setAuditJustification("");
            }
          }}
          title="Editar Produto"
          description="Atualize as informações do produto"
          submitLabel="Salvar Alterações"
          isSubmitting={updateMutation.isPending}
          formData={formData}
          setFormData={setFormData}
          medidas={medidasCatalogo}
          categorias={tiposCatalogo}
          marcas={marcasDb}
          modelSuggestions={modelSuggestions}
          enableModelSelector
          lockCatalogValues
          onRequestCreateModel={openCreateModelDialog}
          inputIdPrefix="edit-product"
          showAuditJustification={Boolean(editingProduct?.arquivado || (editingProduct && !editingProduct.ativoParaVenda))}
          auditJustification={auditJustification}
          setAuditJustification={setAuditJustification}
          onSubmit={handleUpdate}
          onCancel={() => {
            setIsEditOpen(false);
            setEditingProduct(null);
            setAuditJustification("");
          }}
        />
      </Suspense>

      <Dialog
        open={isSaleStatusDialogOpen}
        onOpenChange={(open) => {
          setIsSaleStatusDialogOpen(open);
          if (!open) {
            setSaleStatusTarget(null);
            setInactivationReason("");
          }
        }}
      >
        <DialogContent className="bg-card text-card-foreground">
          <DialogHeader>
            <DialogTitle>Inativar produto para novas vendas</DialogTitle>
            <DialogDescription>
              {saleStatusTarget
                ? `Informe o motivo da inativação de "${saleStatusTarget.name}".`
                : "Informe o motivo da inativação."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="inactivationReason">Motivo</Label>
            <Textarea
              id="inactivationReason"
              value={inactivationReason}
              onChange={(e) => setInactivationReason(e.target.value)}
              placeholder="Ex.: produto descontinuado, falta de fornecedor, revisão de catálogo..."
              rows={4}
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground">{inactivationReason.length}/500</p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsSaleStatusDialogOpen(false);
                setSaleStatusTarget(null);
                setInactivationReason("");
              }}
            >
              Cancelar
            </Button>
            <Button onClick={confirmInactivation} disabled={toggleSaleStatusMutation.isPending}>
              {toggleSaleStatusMutation.isPending ? "Salvando..." : "Confirmar inativação"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isCreateModelDialogOpen}
        onOpenChange={(open) => {
          setIsCreateModelDialogOpen(open);
          if (!open) return;
        }}
      >
        <DialogContent className="bg-card text-card-foreground">
          <DialogHeader>
            <DialogTitle>Cadastrar novo modelo</DialogTitle>
            <DialogDescription>
              Crie um novo modelo no catálogo com marca e tipo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="new-model-name">Nome do modelo</Label>
              <Input
                id="new-model-name"
                value={newModelName}
                onChange={(e) => setNewModelName(e.target.value)}
                placeholder="Ex.: Box Baú Elegance"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Marca</Label>
                <Select value={newModelBrandId} onValueChange={setNewModelBrandId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a marca" />
                  </SelectTrigger>
                  <SelectContent>
                    {(marcasDb ?? []).map((item) => (
                      <SelectItem key={item.id} value={String(item.id)}>
                        {item.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={newModelTypeId} onValueChange={setNewModelTypeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {(tiposDb ?? []).map((item) => (
                      <SelectItem key={item.id} value={String(item.id)}>
                        {item.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateModelDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateModelFromDialog} disabled={createModelMutation.isPending}>
              {createModelMutation.isPending ? "Criando..." : "Criar modelo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isArchiveDialogOpen}
        onOpenChange={(open) => {
          setIsArchiveDialogOpen(open);
          if (!open) {
            setArchiveTarget(null);
            setArchiveReason("");
          }
        }}
      >
        <DialogContent className="bg-card text-card-foreground">
          <DialogHeader>
            <DialogTitle>Arquivar produto</DialogTitle>
            <DialogDescription>
              {archiveTarget
                ? `Informe o motivo do arquivamento de "${archiveTarget.name}".`
                : "Informe o motivo do arquivamento."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="archiveReason">Motivo do arquivamento</Label>
            <Textarea
              id="archiveReason"
              value={archiveReason}
              onChange={(e) => setArchiveReason(e.target.value)}
              placeholder="Ex.: produto fora de linha, substituído, catálogo encerrado..."
              rows={4}
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground">{archiveReason.length}/500</p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsArchiveDialogOpen(false);
                setArchiveTarget(null);
                setArchiveReason("");
              }}
            >
              Cancelar
            </Button>
            <Button onClick={confirmArchive} disabled={archiveMutation.isPending}>
              {archiveMutation.isPending ? "Arquivando..." : "Confirmar arquivamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={isDuplicateConfirmOpen}
        onOpenChange={(open) => {
          if (open) {
            setIsDuplicateConfirmOpen(true);
            return;
          }
          resolveDuplicateConfirmation(false);
        }}
      >
        <AlertDialogContent className="bg-card text-card-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {duplicateReviewType === "exact"
                ? "Produto já cadastrado"
                : "Produto com nome muito parecido"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {duplicateReviewType === "exact" ? (
                <>
                  Encontramos produto(s) com o mesmo <strong>Nome + Marca + Medida</strong>.
                  <br />
                  Se for realmente outro item, você pode continuar.
                </>
              ) : (
                <>
                  Encontramos produto(s) com <strong>nome muito semelhante</strong> para a mesma marca e medida.
                  <br />
                  Revise para evitar duplicidade por variação de escrita.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-56 overflow-auto rounded-md border bg-background/70 p-2 space-y-2 text-sm">
            {duplicateMatches.map((item) => {
              const status = item.arquivado ? "arquivado" : item.ativoParaVenda ? "ativo" : "inativo";
              return (
                <div key={item.id} className="rounded border px-3 py-2">
                  <div className="font-medium">
                    #{item.id} - {item.name}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {(item.marca ?? "SEM_MARCA")} • {item.medida} • {item.categoria} • estoque {item.quantidade} • {status}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            {duplicateContextMode === "create"
              ? "Deseja cadastrar mesmo assim? (Não vamos bloquear.)"
              : "Deseja salvar a atualização mesmo assim? (Não vamos bloquear.)"}
          </p>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => resolveDuplicateConfirmation(false)}>Revisar</AlertDialogCancel>
            <AlertDialogAction onClick={() => resolveDuplicateConfirmation(true)}>
              {duplicateContextMode === "create" ? "Cadastrar mesmo assim" : "Salvar mesmo assim"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <AlertDialogContent className="bg-card text-card-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir definitivamente {pendingDeletionIds.size} produto(s)?
              <br />
              Você ainda pode desfazer as marcações antes desta confirmação.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={deleteBatchMutation.isPending}>
              {deleteBatchMutation.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

type ProductTableRowProps = {
  product: Product;
  canManageProducts: boolean;
  isActionMode: boolean;
  isSelected: boolean;
  onSelect: (id: number, checked: boolean) => void;
  onEdit: (product: Product) => void;
  onDelete: (id: number) => void;
  onToggleSaleStatus: (product: Product) => void;
  onArchive: (product: Product) => void;
  onUnarchive: (product: Product) => void;
  toggleLoading: boolean;
};

const ProductTableRow = memo(function ProductTableRow({
  product,
  canManageProducts,
  isActionMode,
  isSelected,
  onSelect,
  onEdit,
  onDelete,
  onToggleSaleStatus,
  onArchive,
  onUnarchive,
  toggleLoading,
}: ProductTableRowProps) {
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  return (
    <>
      <TableRow>
        {canManageProducts && isActionMode && (
          <TableCell>
            <Checkbox
              checked={isSelected}
              onCheckedChange={(checked) => onSelect(product.id, Boolean(checked))}
              aria-label={`Selecionar produto ${product.name}`}
            />
          </TableCell>
        )}
        <TableCell>
          {product.quantidade < 0 ? (
            <div className="flex items-center gap-2">
              <Badge className="bg-purple-700 hover:bg-purple-700 text-white text-sm px-2.5 py-1">
                {product.quantidade}
              </Badge>
              <span className="text-xs text-purple-700 font-medium">{Math.abs(product.quantidade)} encomenda(s)</span>
            </div>
          ) : product.quantidade <= 1 ? (
            <Badge variant="destructive" className="text-sm px-2.5 py-1">
              {product.quantidade}
            </Badge>
          ) : product.quantidade <= product.estoqueMinimo ? (
            <Badge className="bg-orange-600 hover:bg-orange-600 text-white text-sm px-2.5 py-1">
              {product.quantidade}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-sm px-2.5 py-1 font-semibold">
              {product.quantidade}
            </Badge>
          )}
        </TableCell>
        <TableCell className="font-medium max-w-[38vw] sm:max-w-[26rem] truncate" title={product.name}>
          {product.name}
        </TableCell>
        <TableCell>
          <span className="text-sm">{product.medida}</span>
        </TableCell>
        <TableCell>
          <span className="text-sm text-muted-foreground">{product.marca || "-"}</span>
        </TableCell>
        <TableCell className="text-right">
          <Button variant="outline" size="sm" onClick={() => setIsDetailsOpen(true)}>
            Detalhes
          </Button>
        </TableCell>
      </TableRow>

      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="bg-card text-card-foreground sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{product.name}</DialogTitle>
            <DialogDescription>Detalhes completos do produto</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div><span className="text-muted-foreground">Marca:</span> {product.marca || "-"}</div>
            <div><span className="text-muted-foreground">Medida:</span> {product.medida}</div>
            <div><span className="text-muted-foreground">Categoria:</span> {product.categoria}</div>
            <div>
              <span className="text-muted-foreground">Status:</span>{" "}
              {product.arquivado ? "Arquivado" : product.ativoParaVenda ? "Ativo" : "Inativo"}
            </div>
            <div><span className="text-muted-foreground">Quantidade:</span> {product.quantidade}</div>
            <div><span className="text-muted-foreground">Estoque mínimo:</span> {product.estoqueMinimo}</div>
            {!product.ativoParaVenda && !product.arquivado && (
              <div className="sm:col-span-2">
                <span className="text-muted-foreground">Motivo da inativação:</span>{" "}
                {product.motivoInativacao || "Sem motivo informado"}
              </div>
            )}
            {product.arquivado && (
              <div className="sm:col-span-2">
                <span className="text-muted-foreground">Motivo do arquivamento:</span>{" "}
                {product.motivoArquivamento || "Sem motivo informado"}
              </div>
            )}
          </div>
          <DialogFooter>
            {canManageProducts && (
              <>
                <Button
                  variant="outline"
                  onClick={() => onToggleSaleStatus(product)}
                  disabled={toggleLoading || product.arquivado}
                  title={product.ativoParaVenda ? "Inativar para novas vendas" : "Ativar para novas vendas"}
                >
                  {product.ativoParaVenda ? "Inativar venda" : "Ativar venda"}
                </Button>
                {product.arquivado ? (
                  <Button variant="outline" onClick={() => onUnarchive(product)}>
                    <ArchiveRestore className="h-4 w-4 mr-2" />
                    Desarquivar
                  </Button>
                ) : (
                  <Button variant="outline" onClick={() => onArchive(product)}>
                    <Archive className="h-4 w-4 mr-2" />
                    Arquivar catálogo
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsDetailsOpen(false);
                    onEdit(product);
                  }}
                >
                  Editar
                </Button>
                {isActionMode ? (
                  <Button
                    variant="destructive"
                    onClick={() => {
                      setIsDetailsOpen(false);
                      onDelete(product.id);
                    }}
                  >
                    Excluir
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Ative "Assumir ação" para excluir
                  </span>
                )}
              </>
            )}
            <Button variant="secondary" onClick={() => setIsDetailsOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
});
