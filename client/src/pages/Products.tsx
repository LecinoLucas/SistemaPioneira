import { trpc } from "@/lib/trpc";
import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useState } from "react";
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
import { Plus, Pencil, Trash2, Search, AlertTriangle, FileDown, Undo2, Eye, EyeOff } from "lucide-react";
import { downloadFileFromUrl } from "@/lib/download";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const ProductFormDialog = lazy(() => import("@/components/products/ProductFormDialog"));
const preloadProductFormDialog = () => import("@/components/products/ProductFormDialog");
const PRODUCTS_TRASH_STORAGE_KEY = "products-trash-pending-v1";

type Product = {
  id: number;
  name: string;
  marca: string | null;
  medida: string;
  categoria: string;
  quantidade: number;
  estoqueMinimo: number;
  ativoParaVenda: boolean;
};

type ProductFormData = {
  name: string;
  marca: string;
  medida: string;
  categoria: string;
  quantidade: number;
  estoqueMinimo: number;
};

const MEDIDAS = [
  "Solteiro",
  "Solteirão",
  "Casal",
  "Queen",
  "King",
  "Super King",
  "50x70",
  "45x65",
  "70x130",
  "70x150",
  "60x130",
  "30x50",
  "Medida Especial"
];
const CATEGORIAS = [
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
  "Camas"
];

export default function Products() {
  const { user } = useAuth();
  const { canPerform } = useAccessControl();
  const isAdmin = canPerform("action:products.pricing");
  const canManageProducts = canPerform("action:products.manage");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
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
  const [currentPage, setCurrentPage] = useState(1);
  const [togglingProductId, setTogglingProductId] = useState<number | null>(null);
  const PAGE_SIZE = 25;

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
  }, [debouncedSearchTerm, filterMedida, filterCategoria, filterMarca, filterSaleStatus]);

  useEffect(() => {
    if (!canManageProducts) return;
    const timeoutId = window.setTimeout(() => {
      void preloadProductFormDialog();
    }, 900);
    return () => window.clearTimeout(timeoutId);
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

  // Memoize query params to prevent infinite re-renders
  const queryParams = useMemo(() => ({
    searchTerm: debouncedSearchTerm || undefined,
    medida: filterMedida === "all" ? undefined : filterMedida || undefined,
    categoria: filterCategoria === "all" ? undefined : filterCategoria || undefined,
    marca: filterMarca === "all" ? undefined : filterMarca || undefined,
    page: currentPage,
    pageSize: PAGE_SIZE,
  }), [debouncedSearchTerm, filterMedida, filterCategoria, filterMarca, currentPage]);

  const [formData, setFormData] = useState<ProductFormData>({
    name: "",
    marca: "",
    medida: "",
    categoria: "",
    quantidade: 0,
    estoqueMinimo: 1,
  });

  const utils = trpc.useUtils();
  const { data: products, isLoading, isFetching, error: productsError } = trpc.products.list.useQuery(queryParams, {
    placeholderData: (prev) => prev,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const { data: marcasDb } = trpc.marcas.list.useQuery(undefined, {
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

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
      toast.success("Produto atualizado com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao atualizar produto: " + error.message);
    },
  });
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

  const handleCreate = useCallback(() => {
    if (!formData.name || !formData.medida || !formData.categoria) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    createMutation.mutate(formData as never);
  }, [createMutation, formData]);

  const handleEdit = useCallback((product: Product) => {
    setEditingProduct(product);
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

  const handleUpdate = useCallback(() => {
    if (!editingProduct) return;
    updateMutation.mutate({
      id: editingProduct.id,
      ...formData,
    } as never);
  }, [editingProduct, formData, updateMutation]);

  const handleToggleSaleStatus = useCallback(
    (product: Product) => {
      setTogglingProductId(product.id);
      toggleSaleStatusMutation.mutate({
        id: product.id,
        ativoParaVenda: !product.ativoParaVenda,
      });
    },
    [toggleSaleStatusMutation]
  );

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
        if (filterSaleStatus === "active") return product.ativoParaVenda;
        if (filterSaleStatus === "inactive") return !product.ativoParaVenda;
        return true;
      }),
    [filterSaleStatus, loadedItems, pendingDeletionIds]
  );
  const pendingDeletionItems = useMemo(() => {
    return Array.from(pendingDeletionIds)
      .map((id) => pendingDeletionSnapshot[id] ?? loadedItemsById.get(id))
      .filter((item): item is Product => Boolean(item))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [loadedItemsById, pendingDeletionIds, pendingDeletionSnapshot]);
  const allVisibleSelected = useMemo(
    () => visibleItems.length > 0 && visibleItems.every((product) => selectedIds.has(product.id)),
    [visibleItems, selectedIds]
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Produtos</h1>
          <p className="text-muted-foreground mt-2">
            {canManageProducts ? "Gerencie seu catálogo de produtos" : "Visualize o catálogo de produtos (somente leitura)"}
          </p>
        </div>
        {canManageProducts && (
          <Button
            className="gap-2"
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
          <div className="grid gap-4 md:grid-cols-5">
            <div className="space-y-2">
              <Label htmlFor="search">Buscar por nome</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
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
                  {MEDIDAS.map((m) => (
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
                  {CATEGORIAS.map((c) => (
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
            <div className="space-y-2">
              <Label htmlFor="filterSaleStatus">Status de venda</Label>
              <Select
                value={filterSaleStatus}
                onValueChange={(value) => setFilterSaleStatus(value as "all" | "active" | "inactive")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="active">Ativos</SelectItem>
                  <SelectItem value="inactive">Inativos</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {canManageProducts && pendingDeletionIds.size > 0 && (
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
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                Lista de Produtos
                {isFetching && (
                  <span className="inline-block w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                )}
              </CardTitle>
              <CardDescription>
                {products?.total || 0} produto(s) encontrado(s)
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {canManageProducts && pendingDeletionIds.size > 0 && (
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
          {canManageProducts && selectedIds.size > 0 && (
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
          <Table>
            <TableHeader>
              <TableRow>
                {canManageProducts && (
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allVisibleSelected}
                      onCheckedChange={(checked) => toggleSelectAllVisible(Boolean(checked))}
                      aria-label="Selecionar todos os produtos visíveis"
                    />
                  </TableHead>
                )}
                <TableHead>Nome</TableHead>
                <TableHead>Marca</TableHead>
                <TableHead>Medida</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Venda</TableHead>
                <TableHead>Quantidade</TableHead>
                {canManageProducts && <TableHead>Estoque Mín.</TableHead>}
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleItems.length > 0 ? (
                visibleItems.map((product) => (
                  <ProductTableRow
                    key={product.id}
                    product={product}
                    canManageProducts={canManageProducts}
                    isSelected={selectedIds.has(product.id)}
                    onSelect={toggleSelectProduct}
                    onEdit={handleEdit}
                    onDelete={markSingleForDeletion}
                    onToggleSaleStatus={handleToggleSaleStatus}
                    toggleLoading={togglingProductId === product.id && toggleSaleStatusMutation.isPending}
                  />
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={canManageProducts ? 10 : 8} className="text-center text-muted-foreground py-8">
                    {pendingDeletionIds.size > 0
                      ? "Todos os produtos desta página estão na Lixeira Temporária."
                      : "Nenhum produto encontrado"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {/* Pagination Controls */}
          {products && products.total > PAGE_SIZE && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
              <p className="text-sm text-muted-foreground">
                Mostrando {((currentPage - 1) * PAGE_SIZE) + 1}–{Math.min(currentPage * PAGE_SIZE, products.total)} de {products.total} produtos
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  Anterior
                </Button>
                <span className="text-sm font-medium px-2">
                  Página {currentPage} de {Math.ceil(products.total / PAGE_SIZE)}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(Math.ceil(products.total / PAGE_SIZE), p + 1))}
                  disabled={currentPage >= Math.ceil(products.total / PAGE_SIZE)}
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
            if (!open) resetForm();
          }}
          title="Criar Novo Produto"
          description="Adicione um novo produto ao estoque"
          submitLabel="Criar Produto"
          isSubmitting={createMutation.isPending}
          formData={formData}
          setFormData={setFormData}
          medidas={MEDIDAS}
          categorias={CATEGORIAS}
          marcas={marcasDb}
          inputIdPrefix="create-product"
          onSubmit={handleCreate}
          onCancel={() => {
            setIsCreateOpen(false);
            resetForm();
          }}
        />
      </Suspense>

      <Suspense fallback={null}>
        <ProductFormDialog
          open={isEditOpen}
          onOpenChange={(open) => {
            setIsEditOpen(open);
            if (!open) setEditingProduct(null);
          }}
          title="Editar Produto"
          description="Atualize as informações do produto"
          submitLabel="Salvar Alterações"
          isSubmitting={updateMutation.isPending}
          formData={formData}
          setFormData={setFormData}
          medidas={MEDIDAS}
          categorias={CATEGORIAS}
          marcas={marcasDb}
          inputIdPrefix="edit-product"
          onSubmit={handleUpdate}
          onCancel={() => {
            setIsEditOpen(false);
            setEditingProduct(null);
          }}
        />
      </Suspense>

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
  isSelected: boolean;
  onSelect: (id: number, checked: boolean) => void;
  onEdit: (product: Product) => void;
  onDelete: (id: number) => void;
  onToggleSaleStatus: (product: Product) => void;
  toggleLoading: boolean;
};

const ProductTableRow = memo(function ProductTableRow({
  product,
  canManageProducts,
  isSelected,
  onSelect,
  onEdit,
  onDelete,
  onToggleSaleStatus,
  toggleLoading,
}: ProductTableRowProps) {
  return (
    <TableRow>
      {canManageProducts && (
        <TableCell>
          <Checkbox
            checked={isSelected}
            onCheckedChange={(checked) => onSelect(product.id, Boolean(checked))}
            aria-label={`Selecionar produto ${product.name}`}
          />
        </TableCell>
      )}
      <TableCell className="font-medium">{product.name}</TableCell>
      <TableCell>
        <span className="text-sm text-muted-foreground">{product.marca || "-"}</span>
      </TableCell>
      <TableCell>
        <Badge variant="outline">{product.medida}</Badge>
      </TableCell>
      <TableCell>
        <Badge variant="secondary">{product.categoria}</Badge>
      </TableCell>
      <TableCell>
        {product.ativoParaVenda ? (
          <Badge className="bg-emerald-600 hover:bg-emerald-600">Ativo</Badge>
        ) : (
          <Badge variant="destructive">Inativo</Badge>
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <span
            className={`font-semibold ${
              product.quantidade < 0
                ? "text-purple-600"
                : product.quantidade <= 1
                  ? "text-destructive"
                  : product.quantidade <= product.estoqueMinimo
                    ? "text-orange-500"
                    : "text-foreground"
            }`}
          >
            {product.quantidade}
          </span>
          {product.quantidade < 0 && (
            <Badge variant="destructive" className="text-xs bg-purple-600">
              {Math.abs(product.quantidade)} encomendadas
            </Badge>
          )}
          {canManageProducts && product.quantidade >= 0 && product.quantidade <= product.estoqueMinimo && (
            <AlertTriangle className="h-4 w-4 text-destructive" />
          )}
        </div>
      </TableCell>
      {canManageProducts && <TableCell>{product.estoqueMinimo}</TableCell>}
      <TableCell className="text-right">
        {canManageProducts ? (
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onToggleSaleStatus(product)}
              disabled={toggleLoading}
              title={product.ativoParaVenda ? "Inativar para novas vendas" : "Ativar para novas vendas"}
            >
              {product.ativoParaVenda ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
            <Button variant="outline" size="sm" onClick={() => onEdit(product)}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => onDelete(product.id)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">Somente leitura</span>
        )}
      </TableCell>
    </TableRow>
  );
});
