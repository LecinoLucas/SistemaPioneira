import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { CatalogItemsPanel, type CatalogPanelItem, type CatalogViewMode } from "@/components/catalog/CatalogItemsPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Tag, Ruler, Shapes, Box, CreditCard, UserRound } from "lucide-react";
import { toast } from "sonner";
import {
  normalizeCatalogBrandInput,
  normalizeCatalogMeasureInput,
  normalizeCatalogModelInput,
  normalizeCatalogPaymentInput,
  normalizeCatalogSellerInput,
  normalizeCatalogTypeInput,
} from "@/components/products/types";

type CatalogTab = "brands" | "measures" | "types" | "models" | "payments" | "sellers";

type PaymentCategoryOption = {
  value: string;
  label: string;
  helper: string;
  suggestedName?: string;
};

const CATALOG_VIEW_MODE_STORAGE_KEY = "catalog-base-view-mode";

const PAYMENT_CATEGORY_OPTIONS: PaymentCategoryOption[] = [
  {
    value: "Instantâneo",
    label: "Instantâneo",
    suggestedName: "PIX",
    helper: "Use para pagamentos imediatos, como PIX.",
  },
  {
    value: "Entrega",
    label: "Entrega",
    suggestedName: "Receber na Entrega",
    helper: "Use para cobranças concluídas na entrega.",
  },
  {
    value: "Cartão",
    label: "Cartão",
    helper: "Aqui faz sentido ter variações reais, como Crédito, Débito, Crédito 3x ou Crédito 6x.",
  },
  {
    value: "Boleto",
    label: "Boleto",
    suggestedName: "Boleto",
    helper: "Use um cadastro simples quando não houver variação relevante.",
  },
  {
    value: "Dinheiro",
    label: "Dinheiro",
    suggestedName: "Dinheiro",
    helper: "Para dinheiro, normalmente basta um único cadastro.",
  },
  {
    value: "Transferência",
    label: "Transferência",
    suggestedName: "Transferência",
    helper: "Use para TED, DOC ou transferência bancária.",
  },
  {
    value: "Combinado",
    label: "Combinado",
    suggestedName: "Múltiplo (2+ formas)",
    helper: "Use quando a venda mistura duas ou mais formas de pagamento.",
  },
  {
    value: "Outros",
    label: "Outros",
    helper: "Só crie uma variação nova quando ela realmente precisar aparecer separada nas vendas.",
  },
] as const;

function getPaymentCategoryConfig(category: string) {
  return PAYMENT_CATEGORY_OPTIONS.find((option) => option.value === category) ?? null;
}

const TAB_CONFIG: Record<CatalogTab, { label: string; icon: typeof Tag; singular: string; plural: string }> = {
  brands: { label: "Marcas", icon: Tag, singular: "Marca", plural: "Marcas" },
  measures: { label: "Medidas", icon: Ruler, singular: "Medida", plural: "Medidas" },
  types: { label: "Tipos", icon: Shapes, singular: "Tipo", plural: "Tipos" },
  models: { label: "Modelos", icon: Box, singular: "Modelo", plural: "Modelos" },
  payments: { label: "Pagamentos", icon: CreditCard, singular: "Forma de Pagamento", plural: "Formas de Pagamento" },
  sellers: { label: "Vendedores", icon: UserRound, singular: "Vendedor", plural: "Vendedores" },
};

function normalizeCatalogEntryName(tab: CatalogTab, value: string) {
  const trimmed = value.trim();
  if (tab === "brands") return normalizeCatalogBrandInput(trimmed);
  if (tab === "measures") return normalizeCatalogMeasureInput(trimmed);
  if (tab === "types") return normalizeCatalogTypeInput(trimmed);
  if (tab === "models") return normalizeCatalogModelInput(trimmed);
  if (tab === "payments") return normalizeCatalogPaymentInput(trimmed);
  if (tab === "sellers") return normalizeCatalogSellerInput(trimmed);
  return trimmed;
}

export default function CatalogoBasePage() {
  const [tab, setTab] = useState<CatalogTab>("brands");
  const [viewMode, setViewMode] = useState<CatalogViewMode>(() => {
    if (typeof window === "undefined") return "cards";
    return localStorage.getItem(CATALOG_VIEW_MODE_STORAGE_KEY) === "list" ? "list" : "cards";
  });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [nome, setNome] = useState("");
  const [editNome, setEditNome] = useState("");
  const [modelBrandId, setModelBrandId] = useState<string>("");
  const [modelTypeId, setModelTypeId] = useState<string>("");
  const [editModelBrandId, setEditModelBrandId] = useState<string>("");
  const [editModelTypeId, setEditModelTypeId] = useState<string>("");
  const [paymentCategory, setPaymentCategory] = useState("");
  const [editPaymentCategory, setEditPaymentCategory] = useState("");
  const [search, setSearch] = useState("");

  const brandsQuery = trpc.catalogo.list.useQuery();
  const measuresQuery = trpc.catalogo.listMeasures.useQuery();
  const typesQuery = trpc.catalogo.listTypes.useQuery();
  const modelsQuery = trpc.catalogo.listModels.useQuery();
  const paymentMethodsQuery = trpc.catalogo.listPaymentMethods.useQuery();
  const sellersQuery = trpc.catalogo.listSellers.useQuery();

  const createBrand = trpc.catalogo.create.useMutation();
  const updateBrand = trpc.catalogo.update.useMutation();
  const deleteBrand = trpc.catalogo.delete.useMutation();

  const createMeasure = trpc.catalogo.createMeasure.useMutation();
  const updateMeasure = trpc.catalogo.updateMeasure.useMutation();
  const deleteMeasure = trpc.catalogo.deleteMeasure.useMutation();

  const createType = trpc.catalogo.createType.useMutation();
  const updateType = trpc.catalogo.updateType.useMutation();
  const deleteType = trpc.catalogo.deleteType.useMutation();
  const createModel = trpc.catalogo.createModel.useMutation();
  const updateModel = trpc.catalogo.updateModel.useMutation();
  const deleteModel = trpc.catalogo.deleteModel.useMutation();
  const createPaymentMethod = trpc.catalogo.createPaymentMethod.useMutation();
  const updatePaymentMethod = trpc.catalogo.updatePaymentMethod.useMutation();
  const deletePaymentMethod = trpc.catalogo.deletePaymentMethod.useMutation();
  const createSeller = trpc.catalogo.createSeller.useMutation();
  const updateSeller = trpc.catalogo.updateSeller.useMutation();
  const deleteSeller = trpc.catalogo.deleteSeller.useMutation();
  const syncFromProducts = trpc.catalogo.syncFromProducts.useMutation();

  const activeConfig = TAB_CONFIG[tab];
  const rawItems: CatalogPanelItem[] = useMemo(() => {
    if (tab === "brands") return brandsQuery.data ?? [];
    if (tab === "measures") return measuresQuery.data ?? [];
    if (tab === "types") return typesQuery.data ?? [];
    if (tab === "models") {
      return (modelsQuery.data ?? []).map((item) => ({
        id: item.id,
        nome: item.nome,
        brandId: item.brandId,
        productTypeId: item.productTypeId,
        subtitle: `${item.brandNome} • ${item.productTypeNome}`,
      }));
    }
    if (tab === "sellers") return sellersQuery.data ?? [];
    return (paymentMethodsQuery.data ?? []).map((item) => ({
      id: item.id,
      nome: item.nome,
      codigo: item.codigo,
      categoria: item.categoria,
      subtitle: item.categoria,
    }));
  }, [tab, brandsQuery.data, measuresQuery.data, typesQuery.data, modelsQuery.data, paymentMethodsQuery.data, sellersQuery.data]);

  const items = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rawItems;
    return rawItems.filter(
      (item) =>
        item.nome.toLowerCase().includes(term) ||
        item.subtitle?.toLowerCase().includes(term)
    );
  }, [rawItems, search]);

  const refetchActive = async () => {
    if (tab === "brands") await brandsQuery.refetch();
    else if (tab === "measures") await measuresQuery.refetch();
    else if (tab === "types") await typesQuery.refetch();
    else if (tab === "models") await modelsQuery.refetch();
    else if (tab === "sellers") await sellersQuery.refetch();
    else await paymentMethodsQuery.refetch();
  };

  const resetCreateModal = () => {
    setNome("");
    setModelBrandId("");
    setModelTypeId("");
    setPaymentCategory("");
    setShowCreateModal(false);
  };

  const resetEditModal = () => {
    setEditId(null);
    setEditNome("");
    setEditModelBrandId("");
    setEditModelTypeId("");
    setEditPaymentCategory("");
    setShowEditModal(false);
  };

  const paymentCreateHelper = paymentCategory
    ? getPaymentCategoryConfig(paymentCategory)?.helper ?? "Código interno será gerado automaticamente."
    : "Escolha a categoria e use o nome só quando houver uma variação real da forma de pagamento.";

  const paymentEditHelper = editPaymentCategory
    ? getPaymentCategoryConfig(editPaymentCategory)?.helper ?? "Código interno será preservado automaticamente."
    : "Escolha a categoria e use o nome só quando houver uma variação real da forma de pagamento.";

  const handleCreate = async () => {
    const normalized = normalizeCatalogEntryName(tab, nome);
    if (!normalized) {
      toast.error(`Nome de ${activeConfig.singular.toLowerCase()} é obrigatório`);
      return;
    }
    try {
      if (tab === "brands") await createBrand.mutateAsync({ nome: normalized });
      else if (tab === "measures") await createMeasure.mutateAsync({ nome: normalized });
      else if (tab === "types") await createType.mutateAsync({ nome: normalized });
      else if (tab === "models") {
        if (!modelBrandId || !modelTypeId) {
          toast.error("Selecione marca e tipo para o modelo.");
          return;
        }
        await createModel.mutateAsync({
          nome: normalized,
          brandId: Number(modelBrandId),
          productTypeId: Number(modelTypeId),
        });
      } else if (tab === "payments") {
        if (!paymentCategory.trim()) {
          toast.error("Informe a categoria para a forma de pagamento.");
          return;
        }
        await createPaymentMethod.mutateAsync({
          nome: normalized,
          categoria: paymentCategory.trim(),
        });
      } else {
        await createSeller.mutateAsync({ nome: normalized });
      }

      toast.success(`${activeConfig.singular} criada com sucesso!`);
      resetCreateModal();
      await refetchActive();
    } catch (error: any) {
      toast.error(error?.message || `Erro ao criar ${activeConfig.singular.toLowerCase()}`);
    }
  };

  const openEditModal = (item: CatalogPanelItem) => {
    setEditId(item.id);
    setEditNome(item.nome);
    setEditModelBrandId(item.brandId ? String(item.brandId) : "");
    setEditModelTypeId(item.productTypeId ? String(item.productTypeId) : "");
    setEditPaymentCategory(item.categoria ?? "");
    setShowEditModal(true);
  };

  const handleUpdate = async () => {
    const normalized = normalizeCatalogEntryName(tab, editNome);
    if (!editId || !normalized) {
      toast.error(`Nome de ${activeConfig.singular.toLowerCase()} é obrigatório`);
      return;
    }
    try {
      if (tab === "brands") await updateBrand.mutateAsync({ id: editId, nome: normalized });
      else if (tab === "measures") await updateMeasure.mutateAsync({ id: editId, nome: normalized });
      else if (tab === "types") await updateType.mutateAsync({ id: editId, nome: normalized });
      else if (tab === "models") {
        if (!editModelBrandId || !editModelTypeId) {
          toast.error("Selecione marca e tipo para o modelo.");
          return;
        }
        await updateModel.mutateAsync({
          id: editId,
          nome: normalized,
          brandId: Number(editModelBrandId),
          productTypeId: Number(editModelTypeId),
        });
      } else if (tab === "payments") {
        if (!editPaymentCategory.trim()) {
          toast.error("Informe a categoria para a forma de pagamento.");
          return;
        }
        await updatePaymentMethod.mutateAsync({
          id: editId,
          nome: normalized,
          categoria: editPaymentCategory.trim(),
        });
      } else {
        await updateSeller.mutateAsync({ id: editId, nome: normalized });
      }

      toast.success(`${activeConfig.singular} atualizada com sucesso!`);
      resetEditModal();
      await refetchActive();
    } catch (error: any) {
      toast.error(error?.message || `Erro ao atualizar ${activeConfig.singular.toLowerCase()}`);
    }
  };

  const handleDelete = async (item: CatalogPanelItem) => {
    const ok = confirm(`Deseja realmente excluir "${item.nome}"?`);
    if (!ok) return;
    try {
      if (tab === "brands") await deleteBrand.mutateAsync({ id: item.id });
      else if (tab === "measures") await deleteMeasure.mutateAsync({ id: item.id });
      else if (tab === "types") await deleteType.mutateAsync({ id: item.id });
      else if (tab === "models") await deleteModel.mutateAsync({ id: item.id });
      else if (tab === "payments") await deletePaymentMethod.mutateAsync({ id: item.id });
      else await deleteSeller.mutateAsync({ id: item.id });

      toast.success(`${activeConfig.singular} excluída com sucesso!`);
      await refetchActive();
    } catch (error: any) {
      toast.error(error?.message || `Erro ao excluir ${activeConfig.singular.toLowerCase()}`);
    }
  };

  const handleSyncFromProducts = async () => {
    try {
      const result = await syncFromProducts.mutateAsync();
      toast.success(
        `Sincronização concluída. Marcas: ${result.brandsCount}, Medidas: ${result.measuresCount}, Tipos: ${result.typesCount}, Modelos: ${result.modelsCount}.`
      );
      await Promise.all([
        brandsQuery.refetch(),
        measuresQuery.refetch(),
        typesQuery.refetch(),
        modelsQuery.refetch(),
      ]);
    } catch (error: any) {
      toast.error(error?.message || "Erro ao sincronizar categorias do estoque.");
    }
  };

  const activeLoading =
    brandsQuery.isLoading ||
    measuresQuery.isLoading ||
    typesQuery.isLoading ||
    modelsQuery.isLoading ||
    paymentMethodsQuery.isLoading ||
    sellersQuery.isLoading ||
    createBrand.isPending ||
    updateBrand.isPending ||
    deleteBrand.isPending ||
    createMeasure.isPending ||
    updateMeasure.isPending ||
    deleteMeasure.isPending ||
    createType.isPending ||
    updateType.isPending ||
    deleteType.isPending ||
    createModel.isPending ||
    updateModel.isPending ||
    deleteModel.isPending ||
    createPaymentMethod.isPending ||
    updatePaymentMethod.isPending ||
    deletePaymentMethod.isPending ||
    createSeller.isPending ||
    updateSeller.isPending ||
    deleteSeller.isPending ||
    syncFromProducts.isPending;

  useEffect(() => {
    localStorage.setItem(CATALOG_VIEW_MODE_STORAGE_KEY, viewMode);
  }, [viewMode]);

  const Icon = activeConfig.icon;

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Categorias</h1>
          <p className="text-muted-foreground mt-1">
            Gerencie em um só painel as {TAB_CONFIG.brands.plural.toLowerCase()}, {TAB_CONFIG.measures.plural.toLowerCase()}, {TAB_CONFIG.types.plural.toLowerCase()}, {TAB_CONFIG.models.plural.toLowerCase()}, {TAB_CONFIG.payments.plural.toLowerCase()} e {TAB_CONFIG.sellers.plural.toLowerCase()} do sistema.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button className="w-full sm:w-auto" variant="outline" onClick={handleSyncFromProducts} disabled={syncFromProducts.isPending}>
            {syncFromProducts.isPending ? "Sincronizando..." : "Importar do estoque"}
          </Button>
          <Button className="w-full sm:w-auto" onClick={() => setShowCreateModal(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Nova {activeConfig.singular}
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(value) => setTab(value as CatalogTab)}>
        <TabsList className="grid w-full max-w-3xl grid-cols-6">
          <TabsTrigger className="px-2 text-[11px] sm:text-sm" value="brands">Marcas</TabsTrigger>
          <TabsTrigger className="px-2 text-[11px] sm:text-sm" value="measures">Medidas</TabsTrigger>
          <TabsTrigger className="px-2 text-[11px] sm:text-sm" value="types">Tipos</TabsTrigger>
          <TabsTrigger className="px-2 text-[11px] sm:text-sm" value="models">Modelos</TabsTrigger>
          <TabsTrigger className="px-2 text-[11px] sm:text-sm" value="payments">Pagamentos</TabsTrigger>
          <TabsTrigger className="px-2 text-[11px] sm:text-sm" value="sellers">Vendedores</TabsTrigger>
        </TabsList>
      </Tabs>

      <CatalogItemsPanel
        icon={Icon}
        title={activeConfig.plural}
        count={items.length}
        search={search}
        onSearchChange={setSearch}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        activeLoading={activeLoading}
        items={items}
        emptyMessage={`Nenhum item encontrado em ${activeConfig.plural.toLowerCase()}.`}
        onEdit={openEditModal}
        onDelete={handleDelete}
      />

      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova {activeConfig.singular}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="catalog-create-name">Nome</Label>
            <Input
              id="catalog-create-name"
              value={nome}
              onChange={(e) => setNome(normalizeCatalogEntryName(tab, e.target.value))}
              placeholder={tab === "payments" ? "Ex: Dinheiro, PIX, Cartão de Crédito 3x" : `Digite o nome da ${activeConfig.singular.toLowerCase()}`}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
              }}
            />
            {tab === "payments" ? (
              <p className="text-xs text-muted-foreground">
                {paymentCreateHelper}
              </p>
            ) : null}
          </div>
          {tab === "models" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Marca</Label>
                <Select value={modelBrandId} onValueChange={setModelBrandId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a marca" />
                  </SelectTrigger>
                  <SelectContent>
                    {(brandsQuery.data ?? []).map((item) => (
                      <SelectItem key={item.id} value={String(item.id)}>
                        {item.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={modelTypeId} onValueChange={setModelTypeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {(typesQuery.data ?? []).map((item) => (
                      <SelectItem key={item.id} value={String(item.id)}>
                        {item.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}
          {tab === "payments" ? (
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Select
                value={paymentCategory}
                onValueChange={(value) => {
                  setPaymentCategory(value);
                  const suggestedName = getPaymentCategoryConfig(value)?.suggestedName;
                  if (suggestedName && !nome.trim()) {
                    setNome(suggestedName);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a categoria" />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_CATEGORY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                O código interno será gerado automaticamente. Para dinheiro, um cadastro basta. Para cartão, crie só as variações reais.
              </p>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={resetCreateModal}>
              Cancelar
            </Button>
            <Button onClick={handleCreate}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar {activeConfig.singular}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="catalog-edit-name">Nome</Label>
            <Input
              id="catalog-edit-name"
              value={editNome}
              onChange={(e) => setEditNome(normalizeCatalogEntryName(tab, e.target.value))}
              placeholder={tab === "payments" ? "Ex: Dinheiro, PIX, Cartão de Crédito 3x" : `Digite o nome da ${activeConfig.singular.toLowerCase()}`}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleUpdate();
              }}
            />
            {tab === "payments" ? (
              <p className="text-xs text-muted-foreground">
                {paymentEditHelper}
              </p>
            ) : null}
          </div>
          {tab === "models" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Marca</Label>
                <Select value={editModelBrandId} onValueChange={setEditModelBrandId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a marca" />
                  </SelectTrigger>
                  <SelectContent>
                    {(brandsQuery.data ?? []).map((item) => (
                      <SelectItem key={item.id} value={String(item.id)}>
                        {item.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={editModelTypeId} onValueChange={setEditModelTypeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {(typesQuery.data ?? []).map((item) => (
                      <SelectItem key={item.id} value={String(item.id)}>
                        {item.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}
          {tab === "payments" ? (
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Select
                value={editPaymentCategory}
                onValueChange={(value) => {
                  setEditPaymentCategory(value);
                  const suggestedName = getPaymentCategoryConfig(value)?.suggestedName;
                  if (suggestedName && !editNome.trim()) {
                    setEditNome(suggestedName);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a categoria" />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_CATEGORY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                O código interno existente será preservado. Ajuste o nome só quando a forma realmente precisar aparecer separada.
              </p>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={resetEditModal}>
              Cancelar
            </Button>
            <Button onClick={handleUpdate}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
