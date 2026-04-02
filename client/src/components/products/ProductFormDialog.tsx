import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CatalogFieldControl, catalogFieldStyles } from "@/components/products/CatalogFieldControl";
import { Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const productFormDialogClass =
  "bg-card text-card-foreground w-[min(96vw,760px)] max-w-none max-h-[90vh] overflow-hidden p-0";
const productFormBodyClass = "max-h-[calc(90vh-9rem)] overflow-y-auto px-5 py-4 sm:px-6";
const productFormHeaderClass = "border-b bg-muted/20 px-5 py-4 text-left sm:px-6";
const productFormFooterClass =
  "border-t bg-background/95 px-5 py-4 shadow-[0_-8px_24px_rgba(15,23,42,0.06)] supports-[backdrop-filter]:bg-background/80 sm:px-6";
const dialogFieldClass = "h-9";

function normalizeProductNameInput(value: string) {
  return value.toLocaleUpperCase("pt-BR");
}

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
  onRequestCreateBrand?: () => void;
  onRequestCreateMeasure?: () => void;
  onRequestCreateType?: () => void;
  inputIdPrefix: string;
  showAuditJustification?: boolean;
  auditJustification?: string;
  setAuditJustification?: (value: string) => void;
  onDelete?: () => void;
  deleteLabel?: string;
  deleteDisabled?: boolean;
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
  onRequestCreateBrand,
  onRequestCreateMeasure,
  onRequestCreateType,
  inputIdPrefix,
  showAuditJustification = false,
  auditJustification = "",
  setAuditJustification,
  onDelete,
  deleteLabel = "Excluir produto",
  deleteDisabled = false,
  onSubmit,
  onCancel,
}: ProductFormDialogProps) {
  const marcasNomes = useMemo(() => (marcas ?? []).map((marca) => marca.nome), [marcas]);
  const canRenderCatalogSelectors = marcasNomes.length > 0 && medidas.length > 0 && categorias.length > 0;
  const hasModelAction = Boolean(onRequestCreateModel);
  const hasBrandAction = Boolean(onRequestCreateBrand);
  const hasMeasureAction = Boolean(onRequestCreateMeasure);
  const hasTypeAction = Boolean(onRequestCreateType);
  const [modelInputMode, setModelInputMode] = useState<"select" | "manual">(
    enableModelSelector && modelSuggestions.length > 0 ? "select" : "manual"
  );

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={productFormDialogClass}>
        <DialogHeader className={productFormHeaderClass}>
          <DialogTitle className="text-base sm:text-lg">{title}</DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">{description}</DialogDescription>
        </DialogHeader>
        <div className={productFormBodyClass}>
          <div className="space-y-5">
          <CatalogFieldControl
            label="Nome do Produto"
            htmlFor={`${inputIdPrefix}-name`}
            actionLabel="Cadastrar modelo"
            onAction={onRequestCreateModel}
            helper={
              enableModelSelector && modelSuggestions.length > 0 && modelInputMode === "select" ? (
                <p className="text-xs text-muted-foreground">
                  Modelos sugeridos com base no catálogo atual ({modelSuggestions.length}).
                </p>
              ) : enableModelSelector && modelSuggestions.length > 0 ? (
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={catalogFieldStyles.helperButton}
                    onClick={() => setModelInputMode("select")}
                  >
                    Escolher modelo já cadastrado
                  </Button>
                </div>
              ) : null
            }
          >
            {enableModelSelector && modelInputMode === "select" && modelSuggestions.length > 0 ? (
              <Select
                value={formData.name && modelSuggestions.includes(formData.name) ? formData.name : undefined}
                onValueChange={(value) => {
                  setFormData({ ...formData, name: normalizeProductNameInput(value) });
                }}
              >
                <SelectTrigger
                  id={`${inputIdPrefix}-name`}
                  className={catalogFieldStyles.selectTrigger(hasModelAction)}
                >
                  <SelectValue placeholder="Selecione um modelo" />
                </SelectTrigger>
                <SelectContent>
                  {modelSuggestions.map((model) => (
                    <SelectItem key={model} value={model}>
                      {model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                id={`${inputIdPrefix}-name`}
                className={catalogFieldStyles.input(hasModelAction)}
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: normalizeProductNameInput(e.target.value) })
                }
                placeholder="Ex: AMX BRAVISSIMO"
              />
            )}
          </CatalogFieldControl>
          <CatalogFieldControl
            label="Marca"
            htmlFor={`${inputIdPrefix}-marca`}
            actionLabel="Cadastrar marca"
            onAction={onRequestCreateBrand}
          >
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
              <SelectTrigger
                id={`${inputIdPrefix}-marca`}
                className={catalogFieldStyles.selectTrigger(hasBrandAction)}
              >
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
          </CatalogFieldControl>
          <div className="grid gap-4 sm:grid-cols-2">
            <CatalogFieldControl
              label="Medida"
              htmlFor={`${inputIdPrefix}-medida`}
              actionLabel="Cadastrar medida"
              onAction={onRequestCreateMeasure}
            >
              <Select
                value={formData.medida}
                disabled={lockCatalogValues && medidas.length === 0}
                onValueChange={(value) => setFormData({ ...formData, medida: value })}
              >
                <SelectTrigger
                  id={`${inputIdPrefix}-medida`}
                  className={catalogFieldStyles.selectTrigger(hasMeasureAction)}
                >
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
            </CatalogFieldControl>
            <CatalogFieldControl
              label="Categoria"
              htmlFor={`${inputIdPrefix}-categoria`}
              actionLabel="Cadastrar tipo"
              onAction={onRequestCreateType}
            >
              <Select
                value={formData.categoria}
                disabled={lockCatalogValues && categorias.length === 0}
                onValueChange={(value) => setFormData({ ...formData, categoria: value })}
              >
                <SelectTrigger
                  id={`${inputIdPrefix}-categoria`}
                  className={catalogFieldStyles.selectTrigger(hasTypeAction)}
                >
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
            </CatalogFieldControl>
          </div>
          {lockCatalogValues && !canRenderCatalogSelectors && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
              <p className="text-xs text-amber-900 dark:text-amber-200">
                Categorias incompletas. Cadastre marcas, medidas e tipos na tela de Categorias para continuar.
              </p>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`${inputIdPrefix}-quantidade`}>Quantidade</Label>
              <Input
                id={`${inputIdPrefix}-quantidade`}
                className={dialogFieldClass}
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
                className={dialogFieldClass}
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
        </div>
        <DialogFooter className={productFormFooterClass}>
          {onDelete ? (
            <Button
              type="button"
              variant="destructive"
              className="mr-auto gap-2"
              onClick={onDelete}
              disabled={deleteDisabled}
            >
              <Trash2 className="h-4 w-4" />
              {deleteLabel}
            </Button>
          ) : null}
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
