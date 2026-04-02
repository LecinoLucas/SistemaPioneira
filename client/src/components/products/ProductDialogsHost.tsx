import { lazy, Suspense, type Dispatch, type SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import {
  normalizeCatalogBrandInput,
  normalizeCatalogMeasureInput,
  normalizeCatalogTypeInput,
} from "./types";
import type { DuplicateIdentityMatch, Product, ProductFormData } from "./types";

const ProductFormDialog = lazy(() => import("@/components/products/ProductFormDialog"));

export const preloadProductFormDialog = () => import("@/components/products/ProductFormDialog");

const compactDialogClass =
  "bg-card text-card-foreground w-[min(96vw,520px)] max-w-none max-h-[88vh] overflow-y-auto";
const mediumDialogClass =
  "bg-card text-card-foreground w-[min(96vw,640px)] max-w-none max-h-[90vh] overflow-y-auto";
const dialogFooterClass =
  "border-t bg-background/95 px-0 pt-4 supports-[backdrop-filter]:bg-background/80";
const dialogInputClass = "h-9";
const dialogSelectTriggerClass = "h-9";
const dialogHeaderClass = "border-b bg-muted/20 px-0 pb-3";
const dialogTitleClass = "text-base sm:text-lg";
const dialogDescriptionClass = "text-xs sm:text-sm";

type CatalogItem = {
  id: number;
  nome: string;
};

type ProductDialogsHostProps = {
  isCreateOpen: boolean;
  setIsCreateOpen: Dispatch<SetStateAction<boolean>>;
  isEditOpen: boolean;
  setIsEditOpen: Dispatch<SetStateAction<boolean>>;
  isSaleStatusDialogOpen: boolean;
  setIsSaleStatusDialogOpen: Dispatch<SetStateAction<boolean>>;
  isCreateBrandDialogOpen: boolean;
  setIsCreateBrandDialogOpen: Dispatch<SetStateAction<boolean>>;
  isCreateMeasureDialogOpen: boolean;
  setIsCreateMeasureDialogOpen: Dispatch<SetStateAction<boolean>>;
  isCreateTypeDialogOpen: boolean;
  setIsCreateTypeDialogOpen: Dispatch<SetStateAction<boolean>>;
  isCreateModelDialogOpen: boolean;
  setIsCreateModelDialogOpen: Dispatch<SetStateAction<boolean>>;
  isArchiveDialogOpen: boolean;
  setIsArchiveDialogOpen: Dispatch<SetStateAction<boolean>>;
  isDuplicateConfirmOpen: boolean;
  setIsDuplicateConfirmOpen: Dispatch<SetStateAction<boolean>>;
  isDeleteConfirmOpen: boolean;
  setIsDeleteConfirmOpen: Dispatch<SetStateAction<boolean>>;
  createPending: boolean;
  updatePending: boolean;
  createBrandPending: boolean;
  createMeasurePending: boolean;
  createTypePending: boolean;
  createModelPending: boolean;
  toggleSaleStatusPending: boolean;
  archivePending: boolean;
  deletePending: boolean;
  formData: ProductFormData;
  setFormData: Dispatch<SetStateAction<ProductFormData>>;
  medidasCatalogo: string[];
  tiposCatalogo: string[];
  marcasDb?: CatalogItem[];
  tiposDb?: CatalogItem[];
  modelSuggestions: string[];
  editingProduct: Product | null;
  setEditingProduct: Dispatch<SetStateAction<Product | null>>;
  auditJustification: string;
  setAuditJustification: Dispatch<SetStateAction<string>>;
  handleCreate: () => void;
  handleUpdate: () => void;
  handleRequestDeleteCurrentProduct: () => void;
  openCreateBrandDialog: () => void;
  openCreateMeasureDialog: () => void;
  openCreateTypeDialog: () => void;
  openCreateModelDialog: () => void;
  resetForm: () => void;
  saleStatusTarget: Product | null;
  setSaleStatusTarget: Dispatch<SetStateAction<Product | null>>;
  inactivationReason: string;
  setInactivationReason: Dispatch<SetStateAction<string>>;
  confirmInactivation: () => void;
  newBrandName: string;
  setNewBrandName: Dispatch<SetStateAction<string>>;
  newMeasureName: string;
  setNewMeasureName: Dispatch<SetStateAction<string>>;
  newTypeName: string;
  setNewTypeName: Dispatch<SetStateAction<string>>;
  newModelName: string;
  setNewModelName: Dispatch<SetStateAction<string>>;
  newModelBrandId: string;
  setNewModelBrandId: Dispatch<SetStateAction<string>>;
  newModelTypeId: string;
  setNewModelTypeId: Dispatch<SetStateAction<string>>;
  handleCreateBrandFromDialog: () => void;
  handleCreateMeasureFromDialog: () => void;
  handleCreateTypeFromDialog: () => void;
  handleCreateModelFromDialog: () => void;
  archiveTarget: Product | null;
  setArchiveTarget: Dispatch<SetStateAction<Product | null>>;
  archiveReason: string;
  setArchiveReason: Dispatch<SetStateAction<string>>;
  confirmArchive: () => void;
  duplicateReviewType: "exact" | "similar";
  duplicateMatches: DuplicateIdentityMatch[];
  duplicateContextMode: "create" | "update";
  resolveDuplicateConfirmation: (value: boolean) => void;
  pendingDeletionCount: number;
  confirmDelete: () => void;
};

export function ProductDialogsHost({
  isCreateOpen,
  setIsCreateOpen,
  isEditOpen,
  setIsEditOpen,
  isSaleStatusDialogOpen,
  setIsSaleStatusDialogOpen,
  isCreateBrandDialogOpen,
  setIsCreateBrandDialogOpen,
  isCreateMeasureDialogOpen,
  setIsCreateMeasureDialogOpen,
  isCreateTypeDialogOpen,
  setIsCreateTypeDialogOpen,
  isCreateModelDialogOpen,
  setIsCreateModelDialogOpen,
  isArchiveDialogOpen,
  setIsArchiveDialogOpen,
  isDuplicateConfirmOpen,
  setIsDuplicateConfirmOpen,
  isDeleteConfirmOpen,
  setIsDeleteConfirmOpen,
  createPending,
  updatePending,
  createBrandPending,
  createMeasurePending,
  createTypePending,
  createModelPending,
  toggleSaleStatusPending,
  archivePending,
  deletePending,
  formData,
  setFormData,
  medidasCatalogo,
  tiposCatalogo,
  marcasDb,
  tiposDb,
  modelSuggestions,
  editingProduct,
  setEditingProduct,
  auditJustification,
  setAuditJustification,
  handleCreate,
  handleUpdate,
  handleRequestDeleteCurrentProduct,
  openCreateBrandDialog,
  openCreateMeasureDialog,
  openCreateTypeDialog,
  openCreateModelDialog,
  resetForm,
  saleStatusTarget,
  setSaleStatusTarget,
  inactivationReason,
  setInactivationReason,
  confirmInactivation,
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
  handleCreateBrandFromDialog,
  handleCreateMeasureFromDialog,
  handleCreateTypeFromDialog,
  handleCreateModelFromDialog,
  archiveTarget,
  setArchiveTarget,
  archiveReason,
  setArchiveReason,
  confirmArchive,
  duplicateReviewType,
  duplicateMatches,
  duplicateContextMode,
  resolveDuplicateConfirmation,
  pendingDeletionCount,
  confirmDelete,
}: ProductDialogsHostProps) {
  return (
    <>
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
          isSubmitting={createPending}
          formData={formData}
          setFormData={setFormData}
          medidas={medidasCatalogo}
          categorias={tiposCatalogo}
          marcas={marcasDb}
          modelSuggestions={modelSuggestions}
          enableModelSelector
          lockCatalogValues
          onRequestCreateBrand={openCreateBrandDialog}
          onRequestCreateMeasure={openCreateMeasureDialog}
          onRequestCreateType={openCreateTypeDialog}
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
          isSubmitting={updatePending}
          formData={formData}
          setFormData={setFormData}
          medidas={medidasCatalogo}
          categorias={tiposCatalogo}
          marcas={marcasDb}
          modelSuggestions={modelSuggestions}
          enableModelSelector
          lockCatalogValues
          onRequestCreateBrand={openCreateBrandDialog}
          onRequestCreateMeasure={openCreateMeasureDialog}
          onRequestCreateType={openCreateTypeDialog}
          onRequestCreateModel={openCreateModelDialog}
          inputIdPrefix="edit-product"
          showAuditJustification={Boolean(editingProduct?.arquivado || (editingProduct && !editingProduct.ativoParaVenda))}
          auditJustification={auditJustification}
          setAuditJustification={setAuditJustification}
          onDelete={editingProduct ? handleRequestDeleteCurrentProduct : undefined}
          deleteDisabled={deletePending}
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
        <DialogContent className={compactDialogClass}>
          <DialogHeader className={dialogHeaderClass}>
            <DialogTitle className={dialogTitleClass}>Inativar produto para novas vendas</DialogTitle>
            <DialogDescription className={dialogDescriptionClass}>
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
          <DialogFooter className={dialogFooterClass}>
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
            <Button onClick={confirmInactivation} disabled={toggleSaleStatusPending}>
              {toggleSaleStatusPending ? "Salvando..." : "Confirmar inativação"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isCreateBrandDialogOpen}
        onOpenChange={(open) => {
          setIsCreateBrandDialogOpen(open);
        }}
      >
        <DialogContent className={compactDialogClass}>
          <DialogHeader className={dialogHeaderClass}>
            <DialogTitle className={dialogTitleClass}>Cadastrar nova marca</DialogTitle>
            <DialogDescription className={dialogDescriptionClass}>
              Cadastre a marca e já selecione no produto atual.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="new-brand-name">Nome da marca</Label>
            <Input
              id="new-brand-name"
              className={dialogInputClass}
              value={newBrandName}
              onChange={(e) => setNewBrandName(normalizeCatalogBrandInput(e.target.value))}
              placeholder="Ex.: ECOFLEX"
            />
          </div>
          <DialogFooter className={dialogFooterClass}>
            <Button variant="outline" onClick={() => setIsCreateBrandDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateBrandFromDialog} disabled={createBrandPending}>
              {createBrandPending ? "Criando..." : "Criar marca"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isCreateMeasureDialogOpen}
        onOpenChange={(open) => {
          setIsCreateMeasureDialogOpen(open);
        }}
      >
        <DialogContent className={compactDialogClass}>
          <DialogHeader className={dialogHeaderClass}>
            <DialogTitle className={dialogTitleClass}>Cadastrar nova medida</DialogTitle>
            <DialogDescription className={dialogDescriptionClass}>
              Cadastre a medida e já selecione no produto atual.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="new-measure-name">Nome da medida</Label>
            <Input
              id="new-measure-name"
              className={dialogInputClass}
              value={newMeasureName}
              onChange={(e) => setNewMeasureName(normalizeCatalogMeasureInput(e.target.value))}
              placeholder="Ex.: 1.38x1.88"
            />
          </div>
          <DialogFooter className={dialogFooterClass}>
            <Button variant="outline" onClick={() => setIsCreateMeasureDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateMeasureFromDialog} disabled={createMeasurePending}>
              {createMeasurePending ? "Criando..." : "Criar medida"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isCreateTypeDialogOpen}
        onOpenChange={(open) => {
          setIsCreateTypeDialogOpen(open);
        }}
      >
        <DialogContent className={compactDialogClass}>
          <DialogHeader className={dialogHeaderClass}>
            <DialogTitle className={dialogTitleClass}>Cadastrar novo tipo</DialogTitle>
            <DialogDescription className={dialogDescriptionClass}>
              Cadastre o tipo/categoria e já selecione no produto atual.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="new-type-name">Nome do tipo</Label>
            <Input
              id="new-type-name"
              className={dialogInputClass}
              value={newTypeName}
              onChange={(e) => setNewTypeName(normalizeCatalogTypeInput(e.target.value))}
              placeholder="Ex.: Box Baú"
            />
          </div>
          <DialogFooter className={dialogFooterClass}>
            <Button variant="outline" onClick={() => setIsCreateTypeDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateTypeFromDialog} disabled={createTypePending}>
              {createTypePending ? "Criando..." : "Criar tipo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isCreateModelDialogOpen}
        onOpenChange={(open) => {
          setIsCreateModelDialogOpen(open);
        }}
      >
        <DialogContent className={mediumDialogClass}>
          <DialogHeader className={dialogHeaderClass}>
            <DialogTitle className={dialogTitleClass}>Cadastrar novo modelo</DialogTitle>
            <DialogDescription className={dialogDescriptionClass}>
              Crie um novo modelo no catálogo com marca e tipo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="new-model-name">Nome do modelo</Label>
              <Input
                id="new-model-name"
                className={dialogInputClass}
                value={newModelName}
                onChange={(e) => setNewModelName(e.target.value.toLocaleUpperCase("pt-BR"))}
                placeholder="Ex.: Box Baú Elegance"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Marca</Label>
                <Select value={newModelBrandId} onValueChange={setNewModelBrandId}>
                  <SelectTrigger className={dialogSelectTriggerClass}>
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
                <div className="flex items-stretch">
                  <Select value={newModelTypeId} onValueChange={setNewModelTypeId}>
                    <SelectTrigger className="h-9 w-full rounded-r-none">
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
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 shrink-0 rounded-l-none border-l-0"
                    aria-label="Cadastrar tipo"
                    title="Cadastrar tipo"
                    onClick={openCreateTypeDialog}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className={dialogFooterClass}>
            <Button variant="outline" onClick={() => setIsCreateModelDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateModelFromDialog} disabled={createModelPending}>
              {createModelPending ? "Criando..." : "Criar modelo"}
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
        <DialogContent className={compactDialogClass}>
          <DialogHeader className={dialogHeaderClass}>
            <DialogTitle className={dialogTitleClass}>Arquivar produto</DialogTitle>
            <DialogDescription className={dialogDescriptionClass}>
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
          <DialogFooter className={dialogFooterClass}>
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
            <Button onClick={confirmArchive} disabled={archivePending}>
              {archivePending ? "Arquivando..." : "Confirmar arquivamento"}
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
              Tem certeza que deseja excluir definitivamente {pendingDeletionCount} produto(s)?
              <br />
              Você ainda pode desfazer as marcações antes desta confirmação.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={deletePending}>
              {deletePending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
