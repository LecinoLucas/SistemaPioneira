import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useEffect, useMemo, useState } from "react";

type ProductFormData = {
  name: string;
  marca: string;
  medida: string;
  categoria: string;
  quantidade: number;
  estoqueMinimo: number;
};

type Marca = {
  id: number;
  nome: string;
};

type ProductFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  submitLabel: string;
  isSubmitting: boolean;
  formData: ProductFormData;
  setFormData: (value: ProductFormData) => void;
  medidas: string[];
  categorias: string[];
  marcas?: Marca[];
  modelSuggestions?: string[];
  enableModelSelector?: boolean;
  lockCatalogValues?: boolean;
  onRequestCreateModel?: () => void;
  inputIdPrefix: string;
  showAuditJustification?: boolean;
  auditJustification?: string;
  setAuditJustification?: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
};

export default function ProductFormDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  isSubmitting,
  formData,
  setFormData,
  medidas,
  categorias,
  marcas,
  modelSuggestions = [],
  enableModelSelector = false,
  lockCatalogValues = false,
  onRequestCreateModel,
  inputIdPrefix,
  showAuditJustification = false,
  auditJustification = "",
  setAuditJustification,
  onSubmit,
  onCancel,
}: ProductFormDialogProps) {
  const marcasNomes = useMemo(() => (marcas ?? []).map((marca) => marca.nome), [marcas]);
  const canRenderCatalogSelectors = marcasNomes.length > 0 && medidas.length > 0 && categorias.length > 0;
  const [modelInputMode, setModelInputMode] = useState<"select" | "manual">(
    enableModelSelector && modelSuggestions.length > 0 ? "select" : "manual"
  );

  const [formMode, setFormMode] = useState<"classic" | "v2">(() => {
    try {
      const saved = localStorage.getItem("products-form-mode-v2");
      return saved === "classic" ? "classic" : "v2";
    } catch {
      return "v2";
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("products-form-mode-v2", formMode);
    } catch {
      // noop
    }
  }, [formMode]);

  useEffect(() => {
    if (!enableModelSelector) return;
    if (modelSuggestions.length === 0) {
      setModelInputMode("manual");
      return;
    }
    if (!formData.name) {
      setModelInputMode("select");
      return;
    }
    if (modelSuggestions.includes(formData.name)) {
      setModelInputMode("select");
      return;
    }
    setModelInputMode("manual");
  }, [enableModelSelector, formData.name, modelSuggestions]);

  const catalogKeyPreview = useMemo(() => {
    const marca = formData.marca?.trim() || "SEM_MARCA";
    const medida = formData.medida?.trim() || "medida";
    const tipo = formData.categoria?.trim() || "tipo";
    const modelo = formData.name?.trim() || "modelo";
    return `${marca} • ${medida} • ${tipo} • ${modelo}`;
  }, [formData.categoria, formData.marca, formData.medida, formData.name]);

  const isV2Mode = formMode === "v2";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card text-card-foreground">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/30 p-2">
            <div className="flex items-center gap-2">
              <Badge variant={isV2Mode ? "default" : "secondary"}>
                {isV2Mode ? "Cadastro V2" : "Cadastro Clássico"}
              </Badge>
              <p className="text-xs text-muted-foreground">
                {isV2Mode
                  ? "Cadastro guiado por catálogo (marca, medida, tipo e modelo)."
                  : "Cadastro tradicional compatível com o legado."}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                size="sm"
                variant={isV2Mode ? "default" : "ghost"}
                onClick={() => setFormMode("v2")}
              >
                V2
              </Button>
              <Button
                type="button"
                size="sm"
                variant={!isV2Mode ? "default" : "ghost"}
                onClick={() => setFormMode("classic")}
              >
                Clássico
              </Button>
            </div>
          </div>

          {isV2Mode && (
            <div className="rounded-md border border-blue-500/20 bg-blue-500/5 p-3">
              <p className="text-xs font-medium text-blue-800 dark:text-blue-300">
                Chave de catálogo (V2)
              </p>
              <p className="text-xs text-muted-foreground mt-1 break-words">{catalogKeyPreview}</p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor={`${inputIdPrefix}-name`}>
              {isV2Mode ? "Modelo / Linha do Produto" : "Nome do Produto"}
            </Label>
            {enableModelSelector && modelInputMode === "select" && modelSuggestions.length > 0 ? (
              <>
                <Select
                  value={formData.name && modelSuggestions.includes(formData.name) ? formData.name : "__new__"}
                  onValueChange={(value) => {
                    if (value === "__new__") {
                      if (onRequestCreateModel) {
                        onRequestCreateModel();
                      } else {
                        setModelInputMode("manual");
                        setFormData({ ...formData, name: "" });
                      }
                      return;
                    }
                    setFormData({ ...formData, name: value });
                  }}
                >
                  <SelectTrigger id={`${inputIdPrefix}-name`}>
                    <SelectValue placeholder="Selecione um modelo" />
                  </SelectTrigger>
                  <SelectContent>
                    {modelSuggestions.map((model) => (
                      <SelectItem key={model} value={model}>
                        {model}
                      </SelectItem>
                    ))}
                    <SelectItem value="__new__">+ Cadastrar novo modelo</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Modelos sugeridos com base no catálogo atual ({modelSuggestions.length}).
                </p>
              </>
            ) : (
              <>
                <Input
                  id={`${inputIdPrefix}-name`}
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder={isV2Mode ? "Ex: BRAVÍSSIMO" : "Ex: AMX BRAVISSIMO"}
                />
                {enableModelSelector && modelSuggestions.length > 0 && (
                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="px-0 text-xs h-auto"
                      onClick={() => setModelInputMode("select")}
                    >
                      Escolher modelo já cadastrado
                    </Button>
                    {onRequestCreateModel && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="px-0 text-xs h-auto"
                        onClick={onRequestCreateModel}
                      >
                        + Cadastrar novo modelo
                      </Button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${inputIdPrefix}-marca`}>Marca</Label>
            <Select
              value={formData.marca || "__none__"}
              disabled={lockCatalogValues && marcasNomes.length === 0}
              onValueChange={(value) =>
                setFormData({
                  ...formData,
                  marca: value === "__none__" ? "" : value,
                })
              }
            >
              <SelectTrigger id={`${inputIdPrefix}-marca`}>
                <SelectValue placeholder="Selecione uma marca" />
              </SelectTrigger>
              <SelectContent>
                {!lockCatalogValues && <SelectItem value="__none__">Sem marca</SelectItem>}
                {marcasNomes.map((marca) => (
                  <SelectItem key={marca} value={marca}>
                    {marca}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor={`${inputIdPrefix}-medida`}>Medida</Label>
              <Select
                value={formData.medida}
                disabled={lockCatalogValues && medidas.length === 0}
                onValueChange={(value) => setFormData({ ...formData, medida: value })}
              >
                <SelectTrigger id={`${inputIdPrefix}-medida`}>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {medidas.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${inputIdPrefix}-categoria`}>
                {isV2Mode ? "Tipo de Produto" : "Categoria"}
              </Label>
              <Select
                value={formData.categoria}
                disabled={lockCatalogValues && categorias.length === 0}
                onValueChange={(value) => setFormData({ ...formData, categoria: value })}
              >
                <SelectTrigger id={`${inputIdPrefix}-categoria`}>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {categorias.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {lockCatalogValues && !canRenderCatalogSelectors && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
              <p className="text-xs text-amber-900 dark:text-amber-200">
                Categorias incompletas. Cadastre marcas, medidas e tipos na tela de Categorias para continuar.
              </p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor={`${inputIdPrefix}-quantidade`}>Quantidade</Label>
              <Input
                id={`${inputIdPrefix}-quantidade`}
                type="number"
                min="0"
                value={formData.quantidade}
                onChange={(e) => setFormData({ ...formData, quantidade: Number.parseInt(e.target.value, 10) || 0 })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${inputIdPrefix}-estoque-minimo`}>Estoque Mínimo</Label>
              <Input
                id={`${inputIdPrefix}-estoque-minimo`}
                type="number"
                min="0"
                value={formData.estoqueMinimo}
                onChange={(e) => setFormData({ ...formData, estoqueMinimo: Number.parseInt(e.target.value, 10) || 1 })}
              />
            </div>
          </div>
          {showAuditJustification && (
            <div className="space-y-2">
              <Label htmlFor={`${inputIdPrefix}-audit-justification`}>
                Justificativa da alteração
              </Label>
              <Textarea
                id={`${inputIdPrefix}-audit-justification`}
                value={auditJustification}
                onChange={(e) => setAuditJustification?.(e.target.value)}
                placeholder="Explique o motivo da alteração para rastreabilidade e auditoria."
                rows={3}
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground">{auditJustification.length}/500</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button onClick={onSubmit} disabled={isSubmitting}>
            {isSubmitting ? "Salvando..." : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
