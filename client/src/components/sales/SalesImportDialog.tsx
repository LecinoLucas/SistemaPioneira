import { useMemo } from "react";
import type { ChangeEvent, DragEvent, Dispatch, RefObject, SetStateAction } from "react";
import { X, UploadCloud, AlertTriangle, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ProductLinkCombobox } from "./ProductLinkCombobox";

export type PaymentMethodOption = { key: string; label: string; category: string };

export type ImportedDraftItem = {
  productId: number | null;
  productName: string;
  medida: string | null;
  quantidade: number;
  valorUnitario: number | null;
  valorTotal: number | null;
  confidence: number;
  sourceLine: string;
};

export type ImportedDraft = {
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
  validationWarnings: string[];
  validationErrors: string[];
};

export type DraftReviewState = {
  includeByIndex: Record<number, boolean>;
  quantityByIndex: Record<number, number>;
  manualProductByIndex: Record<number, number | null>;
  clienteOverride: string;
  vendedorKey: string;
  pagamentoKeys: string[];
  /** Raw payment strings from the PDF that could not be matched to any registered method */
  unresolvedPagamentos: string[];
};

export type MappingProduct = { id: number; name: string; medida: string; marca: string | null; quantidade: number };

function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

function summarizeBlockingError(messages: string[]): string {
  if (messages.some((message) => /padr[aã]o homologado/i.test(message))) {
    return "PDF fora do padrão homologado";
  }
  return messages[0] ?? "Importação bloqueada";
}

function normalizeImportLookupValue(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreImportStockMatch(product: MappingProduct, query: string): number {
  if (!query) return 0;

  const hay = normalizeImportLookupValue(`${product.name} ${product.medida} ${product.marca ?? ""}`);
  if (!hay) return 0;
  if (hay.includes(query)) return 1;

  const queryTokens = query.split(" ").filter(Boolean);
  if (queryTokens.length === 0) return 0;

  const hayTokens = hay.split(" ").filter(Boolean);
  let hits = 0;
  for (const token of queryTokens) {
    const hasMatch = hayTokens.some((hayToken) => hayToken.includes(token) || token.includes(hayToken));
    if (hasMatch) hits += 1;
  }

  return hits / queryTokens.length;
}

type SalesImportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Upload
  isDragOver: boolean;
  setIsDragOver: Dispatch<SetStateAction<boolean>>;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onFilesSelected: (event: ChangeEvent<HTMLInputElement>) => void;
  manualFileInputRef: RefObject<HTMLInputElement | null>;
  isProcessing: boolean;
  // Draft data
  importedDrafts: ImportedDraft[];
  setImportedDrafts: Dispatch<SetStateAction<ImportedDraft[]>>;
  pendingImportCount: number;
  processedImports: Record<string, boolean>;
  setProcessedImports: Dispatch<SetStateAction<Record<string, boolean>>>;
  setDraftReviewMap: Dispatch<SetStateAction<Record<string, DraftReviewState>>>;
  // Draft operations
  getDraftKey: (draft: ImportedDraft) => string;
  getDraftState: (draft: ImportedDraft) => DraftReviewState;
  getMissingMappingsCount: (draft: ImportedDraft) => number;
  getApprovedItems: (draft: ImportedDraft) => { productId: number; quantidade: number }[];
  updateDraftState: (draft: ImportedDraft, updater: (current: DraftReviewState) => DraftReviewState) => void;
  registerDraftNow: (draft: ImportedDraft) => Promise<void>;
  isRegistering: boolean;
  // Catalog
  sellers: string[];
  paymentMethods: PaymentMethodOption[];
  mappingProducts: MappingProduct[];
};

export function SalesImportDialog({
  open,
  onOpenChange,
  isDragOver,
  setIsDragOver,
  onDrop,
  onFilesSelected,
  manualFileInputRef,
  isProcessing,
  importedDrafts,
  setImportedDrafts,
  pendingImportCount,
  processedImports,
  setProcessedImports,
  setDraftReviewMap,
  getDraftKey,
  getDraftState,
  getMissingMappingsCount,
  getApprovedItems,
  updateDraftState,
  registerDraftNow,
  isRegistering,
  sellers,
  paymentMethods,
  mappingProducts,
}: SalesImportDialogProps) {
  const reviewSummary = useMemo(() => {
    let blocked = 0;
    let ready = 0;
    let needsReview = 0;

    for (const draft of importedDrafts) {
      const done = processedImports[getDraftKey(draft)];
      if (done) continue;

      const state = getDraftState(draft);
      const missing = getMissingMappingsCount(draft);
      const approvedItems = getApprovedItems(draft);
      const hasBlockingErrors = (draft.validationErrors?.length ?? 0) > 0;
      const hasReviewWarnings = (draft.validationWarnings?.length ?? 0) > 0 || (draft.warnings?.length ?? 0) > 0;
      const missingRequiredFields =
        !state.clienteOverride.trim() ||
        !state.vendedorKey ||
        state.pagamentoKeys.filter((key) => key.trim()).length === 0;

      if (hasBlockingErrors) {
        blocked += 1;
      } else if (missing === 0 && approvedItems.length > 0 && !missingRequiredFields && !hasReviewWarnings) {
        ready += 1;
      } else {
        needsReview += 1;
      }
    }

    return { blocked, ready, needsReview };
  }, [
    getApprovedItems,
    getDraftKey,
    getDraftState,
    getMissingMappingsCount,
    importedDrafts,
    processedImports,
  ]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[min(98.5vw,1920px)] max-w-none max-h-[88vh] overflow-hidden p-0"
        onInteractOutside={(event) => event.preventDefault()}
        data-testid="sales-import-dialog"
      >
        <div className="max-h-[88vh] overflow-y-auto p-6">
          <DialogHeader className="mb-4">
            <DialogTitle>Importar venda por PDF</DialogTitle>
            <DialogDescription>
              Suba o PDF, revise as sugestões automáticas, valide conflitos e só então lance a venda.
            </DialogDescription>
          </DialogHeader>

          {/* Upload zone */}
          <div
            data-testid="sales-import-dropzone"
            className={`rounded-lg border-2 border-dashed p-6 transition-colors cursor-pointer ${
              isDragOver ? "border-primary bg-primary/5" : "border-border bg-muted/10"
            }`}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true); }}
            onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(false); }}
            onDrop={(e) => void onDrop(e)}
            onClick={() => manualFileInputRef.current?.click()}
          >
            <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
              <UploadCloud className="h-8 w-8" />
              <span className="font-medium">
                {isProcessing ? "Processando..." : "Clique ou arraste PDF(s) aqui"}
              </span>
              <span className="text-xs">Suporta múltiplos arquivos</span>
            </div>
          </div>
          <input
            ref={manualFileInputRef}
            data-testid="sales-import-file-input"
            type="file"
            accept=".pdf,application/pdf"
            multiple
            className="hidden"
            onChange={onFilesSelected}
          />

          {/* Draft list */}
          {importedDrafts.length > 0 && (
            <div className="mt-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    {importedDrafts.length} arquivo(s) • {pendingImportCount} pendente(s)
                  </p>
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <Badge variant="secondary">Prontos: {reviewSummary.ready}</Badge>
                    <Badge variant="outline">Revisar: {reviewSummary.needsReview}</Badge>
                    <Badge variant="destructive">Bloqueados: {reviewSummary.blocked}</Badge>
                  </div>
                </div>
                {importedDrafts.every((d) => processedImports[getDraftKey(d)]) && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setImportedDrafts([]);
                      setProcessedImports({});
                      setDraftReviewMap({});
                    }}
                  >
                    Limpar tudo
                  </Button>
                )}
              </div>

              {importedDrafts.map((draft) => {
                const key = getDraftKey(draft);
                const state = getDraftState(draft);
                const done = processedImports[key];
                const missing = getMissingMappingsCount(draft);
                const approvedItems = getApprovedItems(draft);
                const validationErrors = draft.validationErrors ?? [];
                const validationWarnings = draft.validationWarnings ?? [];
                const parserWarnings = draft.warnings ?? [];
                const hasBlockingErrors = validationErrors.length > 0;
                const outOfStockLinked = approvedItems
                  .map((item) => mappingProducts.find((product) => product.id === item.productId))
                  .filter((product): product is MappingProduct => Boolean(product))
                  .filter((product) => product.quantidade <= 0);

                // Detect duplicate product IDs across included items
                const linkedIds = draft.itens
                  .map((item, idx) => {
                    if (state.includeByIndex[idx] === false) return null;
                    return state.manualProductByIndex[idx] ?? item.productId ?? null;
                  })
                  .filter((id): id is number => id != null);
                const uniqueLinkedIds = new Set(linkedIds);
                const hasDuplicateProducts = uniqueLinkedIds.size < linkedIds.length;
                const missingRequiredFields =
                  !state.clienteOverride.trim() ||
                  !state.vendedorKey ||
                  state.pagamentoKeys.filter((k) => k.trim()).length === 0;
                const needsReview =
                  !done &&
                  !hasBlockingErrors &&
                  (
                    missing > 0 ||
                    hasDuplicateProducts ||
                    outOfStockLinked.length > 0 ||
                    missingRequiredFields ||
                    validationWarnings.length > 0 ||
                    parserWarnings.length > 0
                  );

                const canLaunch =
                  !done &&
                  !hasBlockingErrors &&
                  state.clienteOverride.trim() &&
                  state.vendedorKey &&
                  state.pagamentoKeys.filter((k) => k.trim()).length > 0 &&
                  missing === 0 &&
                  approvedItems.length > 0 &&
                  !hasDuplicateProducts &&
                  outOfStockLinked.length === 0;

                return (
                  <div
                    key={key}
                    className={`rounded-lg border p-4 space-y-3 ${
                      done
                        ? "bg-emerald-50 border-emerald-200"
                        : hasBlockingErrors
                          ? "border-red-200 bg-red-50/60"
                          : needsReview
                            ? "border-amber-200 bg-amber-50/40"
                            : "bg-background"
                    }`}
                  >
                    {/* Draft header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{draft.fileName}</p>
                        <p className="text-xs text-muted-foreground">
                          {draft.dataVenda
                            ? `Data PDF: ${new Date(draft.dataVenda).toLocaleDateString("pt-BR")}`
                            : "Data PDF não identificada"}
                          {draft.total != null && ` • Total: R$ ${draft.total.toFixed(2)}`}
                          {draft.documentNumber && ` • Doc ${draft.documentNumber}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {parserWarnings.length > 0 && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span
                                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-500"
                                aria-label="Informações da leitura do PDF"
                              >
                                <Info className="h-4 w-4" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="left" sideOffset={8} className="max-w-sm space-y-1">
                              {parserWarnings.map((message, index) => (
                                <p key={`${key}-parser-tooltip-${index}`}>{message}</p>
                              ))}
                            </TooltipContent>
                          </Tooltip>
                        )}
                        {done ? (
                          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300">
                            Lançado
                          </Badge>
                        ) : hasBlockingErrors ? (
                          <Badge variant="destructive">Bloqueado</Badge>
                        ) : needsReview ? (
                          <Badge variant="outline">Revisar</Badge>
                        ) : (
                          <Badge variant="secondary">Pronto</Badge>
                        )}
                        {!done && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            onClick={() => {
                              setImportedDrafts((prev) => prev.filter((d) => getDraftKey(d) !== key));
                              setDraftReviewMap((prev) => {
                                const next = { ...prev };
                                delete next[key];
                                return next;
                              });
                            }}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {validationErrors.length > 0 && (
                      <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        <span className="font-medium">{summarizeBlockingError(validationErrors)}</span>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span
                              className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-red-200 bg-white/70 text-red-600"
                              aria-label="Detalhes do bloqueio"
                            >
                              <Info className="h-3.5 w-3.5" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" sideOffset={8} className="max-w-md space-y-1">
                            {validationErrors.map((message, index) => (
                              <p key={`${key}-error-${index}`}>{message}</p>
                            ))}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    )}

                    {validationWarnings.length > 0 && (
                      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        {validationWarnings.map((message, index) => (
                          <p key={`${key}-validation-${index}`}>{message}</p>
                        ))}
                      </div>
                    )}

                    {/* Editable fields */}
                    {!done && (
                      <div className="space-y-2">
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Cliente</Label>
                            <Input
                              className="h-8 text-xs"
                              placeholder="Nome do cliente"
                              value={state.clienteOverride}
                              onChange={(e) =>
                                updateDraftState(draft, (s) => ({
                                  ...s,
                                  clienteOverride: e.target.value,
                                }))
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Vendedor</Label>
                            <Select
                              value={state.vendedorKey || "__none"}
                              onValueChange={(v) =>
                                updateDraftState(draft, (s) => ({
                                  ...s,
                                  vendedorKey: v === "__none" ? "" : v,
                                }))
                              }
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Selecionar" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none">— Selecionar —</SelectItem>
                                {sellers.map((s) => (
                                  <SelectItem key={s} value={s}>
                                    {s}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs">Formas de Pagamento (até 3)</Label>
                          <div className="space-y-1">
                            {(state.pagamentoKeys.length === 0 ? [""] : state.pagamentoKeys).map((pKey, pIdx) => (
                              <div key={pIdx} className="flex items-center gap-1">
                                <Select
                                  value={pKey || "__none"}
                                  onValueChange={(v) =>
                                    updateDraftState(draft, (s) => {
                                      const next = [...s.pagamentoKeys];
                                      if (v === "__none") {
                                        next.splice(pIdx, 1);
                                      } else if (pIdx < next.length) {
                                        next[pIdx] = v;
                                      } else {
                                        next.push(v);
                                      }
                                      return { ...s, pagamentoKeys: next };
                                    })
                                  }
                                >
                                  <SelectTrigger className="h-8 text-xs flex-1">
                                    <SelectValue placeholder="Selecionar" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="__none">— Selecionar —</SelectItem>
                                    {paymentMethods.map((m) => (
                                      <SelectItem key={m.key} value={m.key}>
                                        {m.label} — {m.category}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                {state.pagamentoKeys.length > 0 && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 shrink-0"
                                    onClick={() =>
                                      updateDraftState(draft, (s) => ({
                                        ...s,
                                        pagamentoKeys: s.pagamentoKeys.filter((_, i) => i !== pIdx),
                                      }))
                                    }
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                            ))}
                            {state.pagamentoKeys.length < 3 && state.pagamentoKeys.length > 0 && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="w-full text-xs h-7"
                                onClick={() =>
                                  updateDraftState(draft, (s) => ({
                                    ...s,
                                    pagamentoKeys: [...s.pagamentoKeys, ""],
                                  }))
                                }
                              >
                                + Adicionar forma ({state.pagamentoKeys.length}/3)
                              </Button>
                            )}
                            {state.unresolvedPagamentos.length > 0 && (
                              <div className="flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2 text-xs text-amber-900">
                                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                                <div className="space-y-0.5">
                                  <p className="font-medium">Forma(s) de pagamento do PDF não reconhecida(s):</p>
                                  <ul className="list-disc list-inside space-y-0.5">
                                    {state.unresolvedPagamentos.map((raw, i) => (
                                      <li key={i} className="italic">"{raw}"</li>
                                    ))}
                                  </ul>
                                  <p>
                                    Selecione uma forma equivalente acima ou{" "}
                                    <a
                                      href="/categorias"
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="font-semibold underline underline-offset-2 hover:text-amber-800"
                                    >
                                      acesse Categorias
                                    </a>{" "}
                                    para cadastrar antes de lançar.
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Items */}
                    {draft.itens.length > 0 && !done && (
                      <DraftItemsGrid
                        draft={draft}
                        draftKey={key}
                        state={state}
                        mappingProducts={mappingProducts}
                        updateDraftState={updateDraftState}
                      />
                    )}

                    {/* Footer */}
                    {!done && (
                      <div className="space-y-1.5 pt-1">
                        {hasDuplicateProducts && (
                          <div className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 rounded px-2 py-1">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                            <span>Produtos duplicados — cada item deve vincular a um produto diferente.</span>
                          </div>
                        )}
                        {outOfStockLinked.length > 0 && (
                          <div className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 rounded px-2 py-1">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                            <span>
                              Produtos vinculados sem estoque: {outOfStockLinked
                                .map((product) => `${product.name} (${product.medida})`)
                                .join(", ")}.
                            </span>
                          </div>
                        )}
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs text-muted-foreground">
                            {approvedItems.length} de {draft.itens.length} item(ns) vinculado(s)
                            {missing > 0 && (
                              <span className="text-amber-700 font-medium"> • {missing} pendente(s)</span>
                            )}
                            {hasBlockingErrors && (
                              <span className="text-red-700 font-medium"> • bloqueado</span>
                            )}
                          </p>
                          <Button
                            type="button"
                            size="sm"
                            disabled={!canLaunch || isRegistering}
                            onClick={() => void registerDraftNow(draft)}
                          >
                            {isRegistering ? "Lançando..." : "Lançar venda"}
                          </Button>
                        </div>
                      </div>
                    )}

                    {done && (
                      <p className="text-xs text-emerald-700 font-medium">Venda registrada com sucesso.</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Extracted items grid with searchable combobox + duplicate detection       */
/* ────────────────────────────────────────────────────────────────────────── */

function DraftItemsGrid({
  draft,
  draftKey,
  state,
  mappingProducts,
  updateDraftState,
}: {
  draft: ImportedDraft;
  draftKey: string;
  state: DraftReviewState;
  mappingProducts: MappingProduct[];
  updateDraftState: SalesImportDialogProps["updateDraftState"];
}) {
  // Collect product IDs currently used in OTHER rows so the combobox can flag them
  const usedProductIdsByRow = useMemo(() => {
    const map = new Map<number, Set<number>>();
    const allMapped: { index: number; productId: number }[] = [];

    draft.itens.forEach((item, index) => {
      if (state.includeByIndex[index] === false) return;
      const pid = state.manualProductByIndex[index] ?? item.productId ?? null;
      if (pid != null) allMapped.push({ index, productId: pid });
    });

    // For each row, build a set of product IDs used by OTHER rows
    draft.itens.forEach((_, rowIndex) => {
      const others = new Set<number>();
      for (const entry of allMapped) {
        if (entry.index !== rowIndex) others.add(entry.productId);
      }
      map.set(rowIndex, others);
    });

    return map;
  }, [draft.itens, state.includeByIndex, state.manualProductByIndex]);

  return (
    <div className="rounded border bg-muted/30 overflow-hidden">
      <div className="overflow-x-auto">
      <div className="min-w-0 md:min-w-[1280px]">
      <div className="grid grid-cols-1 md:grid-cols-[auto,minmax(360px,1.25fr),minmax(520px,1fr),80px] gap-3 px-4 py-2 text-[11px] font-medium text-muted-foreground border-b">
          <span />
          <span>Item do PDF</span>
          <span>Produto no estoque</span>
          <span className="text-center">Qtd</span>
        </div>
      </div>
      <div className="max-h-[34rem] overflow-auto">
        {draft.itens.map((item, index) => {
          const included = state.includeByIndex[index] !== false;
          const qty = state.quantityByIndex[index] ?? item.quantidade;
          const mappedId = state.manualProductByIndex[index] ?? item.productId ?? null;
          const isUnlinked = mappedId == null && included;
          const isManualLink = state.manualProductByIndex[index] != null;
          const isAutoLink = !isManualLink && item.productId != null;
          const seedQuery = normalizeImportLookupValue(item.sourceLine || item.productName);
          const stockMatchCount = mappingProducts.filter((product) => {
            if (product.quantidade <= 0) return false;
            return scoreImportStockMatch(product, seedQuery) > 0;
          }).length;
          const hasNoStockSuggestion = included && mappedId == null && stockMatchCount === 0;
          const sourceLabel = item.sourceLine && item.sourceLine !== item.productName
            ? item.sourceLine
            : null;

          return (
            <div
              key={`${draftKey}-${index}`}
              data-testid={`sales-import-row-${index}`}
              className={`min-w-0 md:min-w-[1280px] grid grid-cols-1 md:grid-cols-[auto,minmax(360px,1.25fr),minmax(520px,1fr),80px] gap-3 px-4 py-3 items-center text-xs border-b last:border-b-0 ${
                isUnlinked ? "bg-amber-50/80" : "bg-background/60"
              }`}
            >
              <Checkbox
                checked={included}
                onCheckedChange={(checked) =>
                  updateDraftState(draft, (s) => ({
                    ...s,
                    includeByIndex: { ...s.includeByIndex, [index]: Boolean(checked) },
                  }))
                }
              />
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="truncate font-medium">
                    {item.productName}
                    {item.medida ? ` (${item.medida})` : ""}
                  </p>
                  {isAutoLink && (
                    <Badge variant="secondary" className="text-[10px]">
                      Auto {formatConfidence(item.confidence)}
                    </Badge>
                  )}
                  {isManualLink && (
                    <Badge variant="outline" className="text-[10px]">
                      Manual
                    </Badge>
                  )}
                  {isUnlinked && (
                    <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700">
                      Revisar
                    </Badge>
                  )}
                  {included && mappedId == null && stockMatchCount > 0 && (
                    <Badge variant="outline" className="text-[10px]">
                      {stockMatchCount} sugest{stockMatchCount === 1 ? "ão" : "ões"}
                    </Badge>
                  )}
                  {hasNoStockSuggestion && (
                    <Badge variant="destructive" className="text-[10px]">
                      Sem estoque compatível
                    </Badge>
                  )}
                </div>
                {sourceLabel && (
                  <p className="truncate text-[10px] text-muted-foreground">
                    Linha do PDF: {sourceLabel}
                  </p>
                )}
                {isUnlinked && (
                  <p className="text-[10px] text-amber-700">
                    Sem vínculo automático. Use a busca ao lado para encontrar o item correto.
                  </p>
                )}
                {hasNoStockSuggestion && (
                  <p className="text-[10px] text-red-700">
                    Nenhum produto com estoque foi encontrado para esse item. Revise o nome extraído do PDF ou reponha estoque.
                  </p>
                )}
              </div>
              <ProductLinkCombobox
                products={mappingProducts}
                value={mappedId}
                onChange={(newId) =>
                  updateDraftState(draft, (s) => ({
                    ...s,
                    manualProductByIndex: {
                      ...s.manualProductByIndex,
                      [index]: newId,
                    },
                    includeByIndex: {
                      ...s.includeByIndex,
                      [index]: newId != null,
                    },
                  }))
                }
                usedProductIds={usedProductIdsByRow.get(index)}
                disabled={!included}
                searchSeed={item.sourceLine || item.productName}
                testId={`sales-import-row-${index}-link`}
              />
              <Input
                type="number"
                min={1}
                value={qty}
                disabled={!included}
                className="h-8 text-center text-xs"
                onChange={(e) => {
                  const parsed = Number.parseInt(e.target.value, 10);
                  updateDraftState(draft, (s) => ({
                    ...s,
                    quantityByIndex: {
                      ...s.quantityByIndex,
                      [index]: Number.isNaN(parsed) ? 1 : Math.max(1, parsed),
                    },
                  }));
                }}
              />
            </div>
          );
        })}
      </div>
      </div>
    </div>
  );
}
