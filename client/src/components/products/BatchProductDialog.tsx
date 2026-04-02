import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CatalogFieldControl, catalogFieldStyles } from "@/components/products/CatalogFieldControl";
import {
  normalizeCatalogBrandInput,
  normalizeCatalogMeasureInput,
  normalizeCatalogTypeInput,
  resolveCatalogTypeValue,
} from "@/components/products/types";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Layers, CheckCircle2, Plus, XCircle } from "lucide-react";

const dialogSurfaceClass = "bg-card text-card-foreground";
const stickyFooterClass = "shrink-0 border-t bg-background/95 px-5 py-4 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:justify-end";

type CatalogItem = { id: number; nome: string };
type CatalogModelItem = {
  id: number;
  nome: string;
  brandId: number;
  productTypeId: number;
  brandNome: string;
  productTypeNome: string;
};

type BatchProductDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  marcasDb?: CatalogItem[];
  medidasCatalogo: string[];
  tiposCatalogo: string[];
  tiposDb?: CatalogItem[];
  modelosDb?: CatalogModelItem[];
};

export default function BatchProductDialog({
  open,
  onOpenChange,
  marcasDb,
  medidasCatalogo,
  tiposCatalogo,
  tiposDb,
  modelosDb,
}: BatchProductDialogProps) {
  const [name, setName] = useState("");
  const [marca, setMarca] = useState("");
  const [categoria, setCategoria] = useState("");
  const [selectedMedidas, setSelectedMedidas] = useState<Set<string>>(new Set());
  const [quantidade, setQuantidade] = useState(0);
  const [estoqueMinimo, setEstoqueMinimo] = useState(1);
  const [nameMode, setNameMode] = useState<"select" | "manual">("select");
  const [isCreateBrandDialogOpen, setIsCreateBrandDialogOpen] = useState(false);
  const [isCreateModelDialogOpen, setIsCreateModelDialogOpen] = useState(false);
  const [isCreateTypeDialogOpen, setIsCreateTypeDialogOpen] = useState(false);
  const [isCreateMeasureDialogOpen, setIsCreateMeasureDialogOpen] = useState(false);
  const [newBrandName, setNewBrandName] = useState("");
  const [newCatalogModelName, setNewCatalogModelName] = useState("");
  const [newCatalogModelBrandId, setNewCatalogModelBrandId] = useState("");
  const [newCatalogModelTypeId, setNewCatalogModelTypeId] = useState("");
  const [newTypeName, setNewTypeName] = useState("");
  const [newMeasureName, setNewMeasureName] = useState("");
  const [result, setResult] = useState<{
    successCount: number;
    failCount: number;
    results: { medida: string; success: boolean; error?: string }[];
  } | null>(null);

  const utils = trpc.useUtils();

  const createBatchMutation = trpc.products.createBatch.useMutation({
    onSuccess: (data) => {
      setResult(data);
      utils.products.list.invalidate();
      utils.dashboard.stats.invalidate();
      utils.products.lowStock.invalidate();
      if (data.successCount > 0 && data.failCount === 0) {
        toast.success(`${data.successCount} produto(s) criado(s) com sucesso!`);
      } else if (data.successCount > 0) {
        toast.success(`${data.successCount} criado(s), ${data.failCount} com erro.`);
      } else {
        toast.error("Nenhum produto foi criado.");
      }
    },
    onError: (error) => {
      toast.error("Erro ao criar produtos em lote: " + error.message);
    },
  });

  const createBrandMutation = trpc.catalogo.create.useMutation({
    onSuccess: async () => {
      await utils.catalogo.list.invalidate();
      toast.success("Marca criada com sucesso.");
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao criar marca.");
    },
  });

  const createTypeMutation = trpc.catalogo.createType.useMutation({
    onSuccess: async () => {
      await utils.catalogo.listTypes.invalidate();
      toast.success("Tipo criado com sucesso.");
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao criar tipo.");
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

  const createMeasureMutation = trpc.catalogo.createMeasure.useMutation({
    onSuccess: async () => {
      await utils.catalogo.listMeasures.invalidate();
      toast.success("Medida criada com sucesso.");
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao criar medida.");
    },
  });

  const resetForm = useCallback(() => {
    setName("");
    setMarca("");
    setCategoria("");
    setSelectedMedidas(new Set());
    setQuantidade(0);
    setEstoqueMinimo(1);
    setNameMode("select");
    setIsCreateBrandDialogOpen(false);
    setIsCreateModelDialogOpen(false);
    setIsCreateTypeDialogOpen(false);
    setIsCreateMeasureDialogOpen(false);
    setNewBrandName("");
    setNewCatalogModelName("");
    setNewCatalogModelBrandId("");
    setNewCatalogModelTypeId("");
    setNewTypeName("");
    setNewMeasureName("");
    setResult(null);
  }, []);

  useEffect(() => {
    if (!open) return;
    resetForm();
  }, [open, resetForm]);

  // Filter model suggestions based on selected marca + categoria
  const modelSuggestions = useMemo(() => {
    const brandMap = new Map((marcasDb ?? []).map((i) => [i.id, i.nome]));
    const typeMap = new Map((tiposDb ?? []).map((i) => [i.id, i.nome]));
    const models = new Set<string>();
    for (const item of modelosDb ?? []) {
      const modelBrand = brandMap.get(item.brandId) ?? "";
      const modelType = typeMap.get(item.productTypeId) ?? "";
      if (categoria && modelType !== categoria) continue;
      if (marca && modelBrand !== marca) continue;
      const n = item.nome?.trim();
      if (n) models.add(n);
    }
    return Array.from(models).sort((a, b) => a.localeCompare(b));
  }, [marca, categoria, marcasDb, modelosDb, tiposDb]);

  // When selecting a model, auto-fill marca + categoria from the model
  const handleSelectModel = useCallback(
    (modelName: string) => {
      setName(modelName);
      const model = (modelosDb ?? []).find((m) => m.nome === modelName);
      if (!model) return;
      if (!marca) {
        const brand = (marcasDb ?? []).find((b) => b.id === model.brandId);
        if (brand) setMarca(brand.nome);
      }
      if (!categoria) {
        const type = (tiposDb ?? []).find((t) => t.id === model.productTypeId);
        if (type) setCategoria(type.nome);
      }
    },
    [marca, categoria, marcasDb, modelosDb, tiposDb]
  );

  const toggleMedida = useCallback((medida: string) => {
    setSelectedMedidas((prev) => {
      const next = new Set(prev);
      if (next.has(medida)) next.delete(medida);
      else next.add(medida);
      return next;
    });
  }, []);

  const toggleAllMedidas = useCallback(() => {
    setSelectedMedidas((prev) => {
      if (prev.size === medidasCatalogo.length) return new Set();
      return new Set(medidasCatalogo);
    });
  }, [medidasCatalogo]);

  const handleSubmit = useCallback(() => {
    if (!name.trim()) {
      toast.error("Informe o nome do produto.");
      return;
    }
    if (!categoria) {
      toast.error("Selecione uma categoria.");
      return;
    }
    if (selectedMedidas.size === 0) {
      toast.error("Selecione ao menos uma medida.");
      return;
    }
    createBatchMutation.mutate({
      name: name.trim(),
      marca: marca || undefined,
      categoria: categoria as never,
      medidas: Array.from(selectedMedidas),
      quantidade,
      estoqueMinimo,
    });
  }, [name, marca, categoria, selectedMedidas, quantidade, estoqueMinimo, createBatchMutation]);

  const handleCreateBrandFromDialog = useCallback(async () => {
    const nome = newBrandName.trim();
    if (!nome) {
      toast.error("Informe o nome da marca.");
      return;
    }
    await createBrandMutation.mutateAsync({ nome });
    setMarca(nome);
    setIsCreateBrandDialogOpen(false);
  }, [createBrandMutation, newBrandName]);

  const handleCreateModelFromDialog = useCallback(async () => {
    const nome = newCatalogModelName.trim();
    if (!nome) {
      toast.error("Informe o nome do modelo.");
      return;
    }
    if (!newCatalogModelBrandId || !newCatalogModelTypeId) {
      toast.error("Selecione marca e tipo para o modelo.");
      return;
    }

    await createModelMutation.mutateAsync({
      nome,
      brandId: Number(newCatalogModelBrandId),
      productTypeId: Number(newCatalogModelTypeId),
    });

    const selectedBrandName = (marcasDb ?? []).find((item) => item.id === Number(newCatalogModelBrandId))?.nome ?? "";
    const selectedTypeName = (tiposDb ?? []).find((item) => item.id === Number(newCatalogModelTypeId))?.nome ?? "";

    setName(nome);
    if (selectedBrandName) setMarca(selectedBrandName);
    if (selectedTypeName) setCategoria(selectedTypeName);
    setIsCreateModelDialogOpen(false);
  }, [createModelMutation, marcasDb, newCatalogModelBrandId, newCatalogModelName, newCatalogModelTypeId, tiposDb]);

  const handleCreateTypeFromDialog = useCallback(async () => {
    const nome = normalizeCatalogTypeInput(newTypeName.trim());
    if (!nome) {
      toast.error("Informe o nome do tipo.");
      return;
    }
    await createTypeMutation.mutateAsync({ nome });
    setCategoria(resolveCatalogTypeValue(nome, tiposCatalogo));
    setIsCreateTypeDialogOpen(false);
  }, [createTypeMutation, newTypeName, tiposCatalogo]);

  const handleCreateMeasureFromDialog = useCallback(async () => {
    const nome = newMeasureName.trim();
    if (!nome) {
      toast.error("Informe o nome da medida.");
      return;
    }
    await createMeasureMutation.mutateAsync({ nome });
    setSelectedMedidas((prev) => new Set(prev).add(nome));
    setIsCreateMeasureDialogOpen(false);
  }, [createMeasureMutation, newMeasureName]);

  const marcasNomes = useMemo(() => (marcasDb ?? []).map((m) => m.nome), [marcasDb]);
  const canRender = marcasNomes.length > 0 && medidasCatalogo.length > 0 && tiposCatalogo.length > 0;

  // After results, show summary view
  if (result) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className={cn(dialogSurfaceClass, "w-[min(96vw,720px)] max-w-none max-h-[90vh] overflow-hidden p-0")}>
          <div className="flex max-h-[90vh] flex-col">
            <div className="overflow-y-auto px-5 pt-5 pb-4">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Layers className="h-5 w-5" />
                  Resultado do Cadastro em Lote
                </DialogTitle>
                <DialogDescription>
                  {name} — {marca || "SEM MARCA"} — {categoria}
                </DialogDescription>
              </DialogHeader>
              <div className="mt-4 space-y-2">
                <div className="flex gap-3 text-sm">
                  <span className="text-green-600 font-medium">
                    {result.successCount} criado(s)
                  </span>
                  {result.failCount > 0 && (
                    <span className="text-red-600 font-medium">
                      {result.failCount} com erro
                    </span>
                  )}
                </div>
                <div className="max-h-[50vh] overflow-auto rounded-md border bg-background/70 p-2 space-y-1">
                  {result.results.map((r) => (
                    <div
                      key={r.medida}
                      className="flex items-center gap-2 rounded px-2 py-1.5 text-sm"
                    >
                      {r.success ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                      )}
                      <span className="font-medium">{r.medida}</span>
                      {r.error && (
                        <span className="ml-auto text-xs text-muted-foreground">
                          {r.error}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter className={stickyFooterClass}>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Fechar
              </Button>
              <Button onClick={resetForm}>Novo lote</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className={cn(dialogSurfaceClass, "w-[min(96vw,720px)] max-w-none max-h-[90vh] overflow-hidden p-0")}>
          <div className="flex max-h-[90vh] flex-col">
            <div className="overflow-y-auto px-5 pt-5 pb-4">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Layers className="h-5 w-5" />
                  Cadastro em Lote por Modelo
                </DialogTitle>
                <DialogDescription>
                  Selecione um modelo e crie um produto para cada medida de uma só vez.
                </DialogDescription>
              </DialogHeader>
              <div className="mt-4 space-y-4">
          {/* Marca */}
          <CatalogFieldControl
            label="Marca"
            actionLabel="Cadastrar marca"
            onAction={() => {
              setNewBrandName(marca);
              setIsCreateBrandDialogOpen(true);
            }}
          >
            <Select
              value={marca || "__none__"}
              onValueChange={(v) => {
                setMarca(v === "__none__" ? "" : v);
                setName("");
              }}
            >
              <SelectTrigger className={catalogFieldStyles.selectTrigger(true)}>
                <SelectValue placeholder="Selecione uma marca" />
              </SelectTrigger>
              <SelectContent>
                {marcasNomes.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CatalogFieldControl>

          {/* Categoria */}
          <CatalogFieldControl
            label="Categoria"
            actionLabel="Cadastrar categoria"
            onAction={() => {
              setNewTypeName(categoria);
              setIsCreateTypeDialogOpen(true);
            }}
          >
            <Select
              value={categoria}
              onValueChange={(v) => {
                setCategoria(v);
                setName("");
              }}
            >
              <SelectTrigger className={catalogFieldStyles.selectTrigger(true)}>
                <SelectValue placeholder="Selecione uma categoria" />
              </SelectTrigger>
              <SelectContent>
                {tiposCatalogo.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CatalogFieldControl>

          {/* Nome do Produto / Modelo */}
          <CatalogFieldControl
            label="Modelo / Nome do Produto"
            actionLabel="Cadastrar modelo"
            onAction={() => {
              const selectedBrand = (marcasDb ?? []).find((item) => item.nome === marca);
              const selectedType = (tiposDb ?? []).find((item) => item.nome === categoria);
              setNewCatalogModelName(name);
              setNewCatalogModelBrandId(selectedBrand ? String(selectedBrand.id) : "");
              setNewCatalogModelTypeId(selectedType ? String(selectedType.id) : "");
              setIsCreateModelDialogOpen(true);
            }}
            helper={
              nameMode === "select" && modelSuggestions.length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  {modelSuggestions.length} modelo(s) encontrado(s) no catálogo.
                </p>
              ) : modelSuggestions.length > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={catalogFieldStyles.helperButton}
                  onClick={() => setNameMode("select")}
                >
                  Escolher modelo do catálogo
                </Button>
              ) : null
            }
          >
            {nameMode === "select" && modelSuggestions.length > 0 ? (
              <Select
                value={
                  name && modelSuggestions.includes(name) ? name : ""
                }
                onValueChange={(v) => {
                  if (v === "__manual__") {
                    setNameMode("manual");
                    setName("");
                    return;
                  }
                  handleSelectModel(v);
                }}
              >
                <SelectTrigger className={catalogFieldStyles.selectTrigger(true)}>
                  <SelectValue placeholder="Selecione um modelo do catálogo" />
                </SelectTrigger>
                <SelectContent>
                  {modelSuggestions.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                  <SelectItem value="__manual__">
                    Digitar nome manualmente
                  </SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Input
                className={catalogFieldStyles.input(true)}
                value={name}
                onChange={(e) => setName(e.target.value.toLocaleUpperCase("pt-BR"))}
                placeholder="Ex: LUSH, BOX BAÚ ELEGANCE..."
              />
            )}
          </CatalogFieldControl>

          {/* Multi-select Medidas */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Medidas</Label>
              <div className="flex items-center gap-1 rounded-md border bg-background/70 p-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label="Cadastrar medida"
                  onClick={() => {
                    setNewMeasureName("");
                    setIsCreateMeasureDialogOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-xs h-auto px-1"
                  onClick={toggleAllMedidas}
                >
                  {selectedMedidas.size === medidasCatalogo.length
                    ? "Desmarcar todas"
                    : "Selecionar todas"}
                </Button>
              </div>
            </div>
            <div className="max-h-[32vh] overflow-auto rounded-md border bg-background/70 p-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
              {medidasCatalogo.map((medida) => (
                <label
                  key={medida}
                  className="flex items-center gap-2 rounded px-2 py-1.5 cursor-pointer hover:bg-accent/50 transition-colors"
                >
                  <Checkbox
                    checked={selectedMedidas.has(medida)}
                    onCheckedChange={() => toggleMedida(medida)}
                  />
                  <span className="text-sm">{medida}</span>
                </label>
              ))}
            </div>
            {selectedMedidas.size > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                <Badge variant="secondary" className="text-xs">
                  {selectedMedidas.size} medida(s) selecionada(s)
                </Badge>
              </div>
            )}
          </div>

          {/* Quantidade e Estoque Mínimo */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Quantidade Inicial</Label>
              <Input
                type="number"
                min="0"
                value={quantidade}
                onChange={(e) =>
                  setQuantidade(Number.parseInt(e.target.value, 10) || 0)
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Estoque Mínimo</Label>
              <Input
                type="number"
                min="0"
                value={estoqueMinimo}
                onChange={(e) =>
                  setEstoqueMinimo(Number.parseInt(e.target.value, 10) || 1)
                }
              />
            </div>
          </div>

          {!canRender && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
              <p className="text-xs text-amber-900 dark:text-amber-200">
                Categorias incompletas. Cadastre marcas, medidas e tipos na tela
                de Categorias para continuar.
              </p>
            </div>
          )}

          {/* Preview */}
          {name && categoria && selectedMedidas.size > 0 && (
            <div className="rounded-md border bg-muted/30 p-3 space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                Serão criados {selectedMedidas.size} produto(s):
              </p>
              <div className="max-h-28 overflow-auto space-y-0.5">
                {Array.from(selectedMedidas)
                  .sort()
                  .map((m) => (
                    <p key={m} className="text-xs">
                      {name} — {marca || "SEM MARCA"} — {m} — {categoria}
                    </p>
                  ))}
              </div>
            </div>
          )}
              </div>
            </div>
            <DialogFooter className={stickyFooterClass}>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={createBatchMutation.isPending || !canRender}
              >
                {createBatchMutation.isPending
                  ? "Criando..."
                  : `Criar ${selectedMedidas.size} Produto(s)`}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isCreateBrandDialogOpen} onOpenChange={setIsCreateBrandDialogOpen}>
        <DialogContent className={dialogSurfaceClass}>
          <DialogHeader>
            <DialogTitle>Cadastrar marca</DialogTitle>
            <DialogDescription>Crie a marca e continue no lote.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="batch-new-brand-name">Nome da marca</Label>
            <Input
              id="batch-new-brand-name"
              value={newBrandName}
              onChange={(e) => setNewBrandName(normalizeCatalogBrandInput(e.target.value))}
              placeholder="Ex.: ECOFLEX"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateBrandDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateBrandFromDialog} disabled={createBrandMutation.isPending}>
              {createBrandMutation.isPending ? "Criando..." : "Criar marca"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isCreateModelDialogOpen} onOpenChange={setIsCreateModelDialogOpen}>
        <DialogContent className={dialogSurfaceClass}>
          <DialogHeader>
            <DialogTitle>Cadastrar modelo</DialogTitle>
            <DialogDescription>Crie o modelo e continue no lote.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="batch-new-model-name">Nome do modelo</Label>
              <Input
                id="batch-new-model-name"
                value={newCatalogModelName}
                onChange={(e) => setNewCatalogModelName(e.target.value.toLocaleUpperCase("pt-BR"))}
                placeholder="Ex.: LUSH"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Marca</Label>
                <Select value={newCatalogModelBrandId} onValueChange={setNewCatalogModelBrandId}>
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
                <Select value={newCatalogModelTypeId} onValueChange={setNewCatalogModelTypeId}>
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

      <Dialog open={isCreateTypeDialogOpen} onOpenChange={setIsCreateTypeDialogOpen}>
        <DialogContent className={dialogSurfaceClass}>
          <DialogHeader>
            <DialogTitle>Cadastrar tipo</DialogTitle>
            <DialogDescription>Crie o tipo e continue no lote.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="batch-new-type-name">Nome do tipo</Label>
            <Input
              id="batch-new-type-name"
              value={newTypeName}
              onChange={(e) => setNewTypeName(normalizeCatalogTypeInput(e.target.value))}
              placeholder="Ex.: Box Baú"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateTypeDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateTypeFromDialog} disabled={createTypeMutation.isPending}>
              {createTypeMutation.isPending ? "Criando..." : "Criar tipo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isCreateMeasureDialogOpen} onOpenChange={setIsCreateMeasureDialogOpen}>
        <DialogContent className={dialogSurfaceClass}>
          <DialogHeader>
            <DialogTitle>Cadastrar medida</DialogTitle>
            <DialogDescription>Crie a medida e já deixe ela selecionada no lote.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="batch-new-measure-name">Nome da medida</Label>
            <Input
              id="batch-new-measure-name"
              value={newMeasureName}
              onChange={(e) => setNewMeasureName(normalizeCatalogMeasureInput(e.target.value))}
              placeholder="Ex.: 1.38x1.88"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateMeasureDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateMeasureFromDialog} disabled={createMeasureMutation.isPending}>
              {createMeasureMutation.isPending ? "Criando..." : "Criar medida"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
