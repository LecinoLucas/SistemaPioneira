import { trpc } from "@/lib/trpc";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useAccessControl } from "@/features/auth/hooks/useAccessControl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, Search, Layers } from "lucide-react";
import { downloadFileFromUrl } from "@/lib/download";
import { toast } from "sonner";
import { ProductDialogsHost, preloadProductFormDialog } from "@/components/products/ProductDialogsHost";
import BatchProductDialog from "@/components/products/BatchProductDialog";
import { ProductFiltersPanel } from "@/components/products/ProductFiltersPanel";
import { ProductListToolbar } from "@/components/products/ProductListToolbar";
import { ProductSelectionSummary } from "@/components/products/ProductSelectionSummary";
import { ProductTableCard } from "@/components/products/ProductTableCard";
import { ProductTemporaryTrash } from "@/components/products/ProductTemporaryTrash";
import { useProductActions } from "@/components/products/useProductActions";
import { useProductListingState } from "@/components/products/useProductListingState";
import type { DuplicateIdentityMatch, Product, ProductFormData } from "@/components/products/types";

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
  const [isBatchOpen, setIsBatchOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isCreateBrandDialogOpen, setIsCreateBrandDialogOpen] = useState(false);
  const [isCreateMeasureDialogOpen, setIsCreateMeasureDialogOpen] = useState(false);
  const [isCreateTypeDialogOpen, setIsCreateTypeDialogOpen] = useState(false);
  const [isCreateModelDialogOpen, setIsCreateModelDialogOpen] = useState(false);
  const [isDuplicateConfirmOpen, setIsDuplicateConfirmOpen] = useState(false);
  const [duplicateMatches, setDuplicateMatches] = useState<DuplicateIdentityMatch[]>([]);
  const [duplicateContextMode, setDuplicateContextMode] = useState<"create" | "update">("create");
  const [duplicateReviewType, setDuplicateReviewType] = useState<"exact" | "similar">("exact");
  const duplicateDecisionResolverRef = useRef<((value: boolean) => void) | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [togglingProductId, setTogglingProductId] = useState<number | null>(null);
  const [saleStatusTarget, setSaleStatusTarget] = useState<Product | null>(null);
  const [isSaleStatusDialogOpen, setIsSaleStatusDialogOpen] = useState(false);
  const [inactivationReason, setInactivationReason] = useState("");
  const [archiveTarget, setArchiveTarget] = useState<Product | null>(null);
  const [isArchiveDialogOpen, setIsArchiveDialogOpen] = useState(false);
  const [archiveReason, setArchiveReason] = useState("");
  const [newBrandName, setNewBrandName] = useState("");
  const [newMeasureName, setNewMeasureName] = useState("");
  const [newTypeName, setNewTypeName] = useState("");
  const [newModelName, setNewModelName] = useState("");
  const [newModelBrandId, setNewModelBrandId] = useState("");
  const [newModelTypeId, setNewModelTypeId] = useState("");

  const {
    isDeleteConfirmOpen,
    setIsDeleteConfirmOpen,
    isActionMode,
    handleToggleActionMode,
    selectedIds,
    setSelectedIds,
    pendingDeletionIds,
    setPendingDeletionIds,
    pendingDeletionSnapshot,
    setPendingDeletionSnapshot,
    lastDeleteSummary,
    setLastDeleteSummary,
    searchTerm,
    setSearchTerm,
    filterMedida,
    setFilterMedida,
    filterCategoria,
    setFilterCategoria,
    filterMarca,
    setFilterMarca,
    filterSaleStatus,
    setFilterSaleStatus,
    debouncedSearchTerm,
    includeArchived,
    setIncludeArchived,
    sortByStockRisk,
    setSortByStockRisk,
    viewMode,
    setViewMode,
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    searchInputRef,
    queryParams,
    clearFilters,
    restorePendingDeletion,
    undoPendingDeletions,
    openDeleteConfirm,
  } = useProductListingState({ canManageProducts });

  useEffect(() => {
    if (!canManageProducts) return;
    const timeoutId = window.setTimeout(() => {
      void preloadProductFormDialog();
    }, 900);
    return () => window.clearTimeout(timeoutId);
  }, [canManageProducts]);

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

  useEffect(() => {
    if (filterMedida !== "all" && !medidasCatalogo.includes(filterMedida)) {
      setFilterMedida("all");
    }
  }, [filterMedida, medidasCatalogo, setFilterMedida]);

  useEffect(() => {
    if (filterCategoria !== "all" && !tiposCatalogo.includes(filterCategoria)) {
      setFilterCategoria("all");
    }
  }, [filterCategoria, setFilterCategoria, tiposCatalogo]);

  useEffect(() => {
    if (filterMarca !== "all" && !marcasCatalogo.includes(filterMarca)) {
      setFilterMarca("all");
    }
  }, [filterMarca, marcasCatalogo, setFilterMarca]);

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

  const {
    createMutation,
    updateMutation,
    createBrandMutation,
    createMeasureMutation,
    createTypeMutation,
    createModelMutation,
    toggleSaleStatusMutation,
    archiveMutation,
    deleteBatchMutation,
    exportPDFMutation,
    resetForm,
    handleExportPDF,
    handleCreate,
    openCreateBrandDialog,
    openCreateMeasureDialog,
    openCreateTypeDialog,
    openCreateModelDialog,
    handleCreateBrandFromDialog,
    handleCreateMeasureFromDialog,
    handleCreateTypeFromDialog,
    handleCreateModelFromDialog,
    handleEdit,
    handleUpdate,
    handleRequestDeleteCurrentProduct,
    handleToggleSaleStatus,
    confirmInactivation,
    handleArchive,
    confirmArchive,
    handleUnarchive,
    confirmDelete,
  } = useProductActions({
    formData,
    setFormData,
    auditJustification,
    setAuditJustification,
    editingProduct,
    setEditingProduct,
    setIsCreateOpen,
    setIsEditOpen,
    setIsCreateBrandDialogOpen,
    setIsCreateMeasureDialogOpen,
    setIsCreateTypeDialogOpen,
    setIsCreateModelDialogOpen,
    setIsArchiveDialogOpen,
    setArchiveTarget,
    archiveTarget,
    archiveReason,
    setArchiveReason,
    setSaleStatusTarget,
    saleStatusTarget,
    inactivationReason,
    setInactivationReason,
    setIsSaleStatusDialogOpen,
    setTogglingProductId,
    marcasDb,
    tiposDb,
    medidasCatalogo,
    tiposCatalogo,
    marcasCatalogo,
    productsItems: (products?.items ?? []) as Product[],
    requestDuplicateConfirmation,
    newBrandName,
    setNewBrandName,
    newMeasureName,
    setNewMeasureName,
    newTypeName,
    setNewTypeName,
    newModelName,
    setNewModelName,
    newModelBrandId,
    setNewModelBrandId,
    newModelTypeId,
    setNewModelTypeId,
    debouncedSearchTerm,
    filterMedida,
    filterCategoria,
    filterMarca,
    pendingDeletionIds,
    setPendingDeletionIds,
    pendingDeletionSnapshot,
    setPendingDeletionSnapshot,
    setLastDeleteSummary,
    setSelectedIds,
    setIsDeleteConfirmOpen,
  });

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
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              className="gap-2 w-full sm:w-auto min-h-10"
              onClick={() => setIsBatchOpen(true)}
            >
              <Layers className="h-4 w-4" />
              Criar em Lote
            </Button>
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
          </div>
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

      <ProductFiltersPanel
        searchInputRef={searchInputRef}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        filterMedida={filterMedida}
        setFilterMedida={setFilterMedida}
        filterCategoria={filterCategoria}
        setFilterCategoria={setFilterCategoria}
        filterMarca={filterMarca}
        setFilterMarca={setFilterMarca}
        medidasCatalogo={medidasCatalogo}
        tiposCatalogo={tiposCatalogo}
        marcasDb={marcasDb}
        filterSaleStatus={filterSaleStatus}
        setFilterSaleStatus={setFilterSaleStatus}
        includeArchived={includeArchived}
        setIncludeArchived={setIncludeArchived}
        clearFilters={clearFilters}
        saleStatusCounts={saleStatusCounts}
        pageSize={pageSize}
        setPageSize={setPageSize}
      />

      <ProductTemporaryTrash
        canManageProducts={canManageProducts}
        isActionMode={isActionMode}
        pendingDeletionCount={pendingDeletionIds.size}
        lastDeleteSummary={lastDeleteSummary}
        pendingDeletionItems={pendingDeletionItems}
        restorePendingDeletion={restorePendingDeletion}
        undoPendingDeletions={undoPendingDeletions}
        openDeleteConfirm={openDeleteConfirm}
      />

      <ProductTableCard
        header={(
          <ProductListToolbar
            isFetching={isFetching}
            visibleCount={visibleItems.length}
            totalCount={products?.total || 0}
            canManageProducts={canManageProducts}
            isActionMode={isActionMode}
            handleToggleActionMode={handleToggleActionMode}
            sortByStockRisk={sortByStockRisk}
            setSortByStockRisk={setSortByStockRisk}
            viewMode={viewMode}
            setViewMode={setViewMode}
            pendingDeletionCount={pendingDeletionIds.size}
            undoPendingDeletions={undoPendingDeletions}
            openDeleteConfirm={openDeleteConfirm}
            isAdmin={user?.role === "admin"}
            handleExportPDF={handleExportPDF}
            exportPending={exportPDFMutation.isPending}
          />
        )}
        summary={(
          <ProductSelectionSummary
            canManageProducts={canManageProducts}
            isActionMode={isActionMode}
            selectedCount={selectedIds.size}
            markSelectedForDeletion={markSelectedForDeletion}
            clearSelection={() => setSelectedIds(new Set())}
            stockSummary={stockSummary}
            includeArchived={includeArchived}
            archivedCount={saleStatusCounts.archived}
          />
        )}
        canManageProducts={canManageProducts}
        isActionMode={isActionMode}
        viewMode={viewMode}
        allVisibleSelected={allVisibleSelected}
        toggleSelectAllVisible={toggleSelectAllVisible}
        visibleItems={visibleItems}
        sortedVisibleItems={sortedVisibleItems}
        selectedIds={selectedIds}
        toggleSelectProduct={toggleSelectProduct}
        handleEdit={handleEdit}
        markSingleForDeletion={markSingleForDeletion}
        handleToggleSaleStatus={handleToggleSaleStatus}
        handleArchive={handleArchive}
        handleUnarchive={handleUnarchive}
        togglingProductId={togglingProductId}
        toggleSaleStatusPending={toggleSaleStatusMutation.isPending}
        pendingDeletionCount={pendingDeletionIds.size}
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        pageSize={pageSize}
        totalProducts={products?.total || 0}
      />

      <ProductDialogsHost
        isCreateOpen={isCreateOpen}
        setIsCreateOpen={setIsCreateOpen}
        isEditOpen={isEditOpen}
        setIsEditOpen={setIsEditOpen}
        isSaleStatusDialogOpen={isSaleStatusDialogOpen}
        setIsSaleStatusDialogOpen={setIsSaleStatusDialogOpen}
        isCreateBrandDialogOpen={isCreateBrandDialogOpen}
        setIsCreateBrandDialogOpen={setIsCreateBrandDialogOpen}
        isCreateMeasureDialogOpen={isCreateMeasureDialogOpen}
        setIsCreateMeasureDialogOpen={setIsCreateMeasureDialogOpen}
        isCreateTypeDialogOpen={isCreateTypeDialogOpen}
        setIsCreateTypeDialogOpen={setIsCreateTypeDialogOpen}
        isCreateModelDialogOpen={isCreateModelDialogOpen}
        setIsCreateModelDialogOpen={setIsCreateModelDialogOpen}
        isArchiveDialogOpen={isArchiveDialogOpen}
        setIsArchiveDialogOpen={setIsArchiveDialogOpen}
        isDuplicateConfirmOpen={isDuplicateConfirmOpen}
        setIsDuplicateConfirmOpen={setIsDuplicateConfirmOpen}
        isDeleteConfirmOpen={isDeleteConfirmOpen}
        setIsDeleteConfirmOpen={setIsDeleteConfirmOpen}
        createPending={createMutation.isPending}
        updatePending={updateMutation.isPending}
        createBrandPending={createBrandMutation.isPending}
        createMeasurePending={createMeasureMutation.isPending}
        createTypePending={createTypeMutation.isPending}
        createModelPending={createModelMutation.isPending}
        toggleSaleStatusPending={toggleSaleStatusMutation.isPending}
        archivePending={archiveMutation.isPending}
        deletePending={deleteBatchMutation.isPending}
        formData={formData}
        setFormData={setFormData}
        medidasCatalogo={medidasCatalogo}
        tiposCatalogo={tiposCatalogo}
        marcasDb={marcasDb}
        tiposDb={tiposDb}
        modelSuggestions={modelSuggestions}
        editingProduct={editingProduct}
        setEditingProduct={setEditingProduct}
        auditJustification={auditJustification}
        setAuditJustification={setAuditJustification}
        handleCreate={handleCreate}
        handleUpdate={handleUpdate}
        handleRequestDeleteCurrentProduct={handleRequestDeleteCurrentProduct}
        openCreateBrandDialog={openCreateBrandDialog}
        openCreateMeasureDialog={openCreateMeasureDialog}
        openCreateTypeDialog={openCreateTypeDialog}
        openCreateModelDialog={openCreateModelDialog}
        resetForm={resetForm}
        saleStatusTarget={saleStatusTarget}
        setSaleStatusTarget={setSaleStatusTarget}
        inactivationReason={inactivationReason}
        setInactivationReason={setInactivationReason}
        confirmInactivation={confirmInactivation}
        newBrandName={newBrandName}
        setNewBrandName={setNewBrandName}
        newMeasureName={newMeasureName}
        setNewMeasureName={setNewMeasureName}
        newTypeName={newTypeName}
        setNewTypeName={setNewTypeName}
        newModelName={newModelName}
        setNewModelName={setNewModelName}
        newModelBrandId={newModelBrandId}
        setNewModelBrandId={setNewModelBrandId}
        newModelTypeId={newModelTypeId}
        setNewModelTypeId={setNewModelTypeId}
        handleCreateBrandFromDialog={handleCreateBrandFromDialog}
        handleCreateMeasureFromDialog={handleCreateMeasureFromDialog}
        handleCreateTypeFromDialog={handleCreateTypeFromDialog}
        handleCreateModelFromDialog={handleCreateModelFromDialog}
        archiveTarget={archiveTarget}
        setArchiveTarget={setArchiveTarget}
        archiveReason={archiveReason}
        setArchiveReason={setArchiveReason}
        confirmArchive={confirmArchive}
        duplicateReviewType={duplicateReviewType}
        duplicateMatches={duplicateMatches}
        duplicateContextMode={duplicateContextMode}
        resolveDuplicateConfirmation={resolveDuplicateConfirmation}
        pendingDeletionCount={pendingDeletionIds.size}
        confirmDelete={confirmDelete}
      />

      <BatchProductDialog
        open={isBatchOpen}
        onOpenChange={setIsBatchOpen}
        marcasDb={marcasDb}
        medidasCatalogo={medidasCatalogo}
        tiposCatalogo={tiposCatalogo}
        tiposDb={tiposDb}
        modelosDb={modelosDb}
      />
    </div>
  );
}
