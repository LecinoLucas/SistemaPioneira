import { useState, useMemo } from "react";
import { Check, ChevronsUpDown, AlertTriangle, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { MappingProduct } from "./SalesImportDialog";
import { buildProductLinkState } from "./product-link-combobox.utils";

type Props = {
  products: MappingProduct[];
  value: number | null;
  onChange: (productId: number | null) => void;
  /** IDs already linked in other rows of the same draft */
  usedProductIds?: Set<number>;
  disabled?: boolean;
  searchSeed?: string;
  testId?: string;
};

export function ProductLinkCombobox({
  products,
  value,
  onChange,
  usedProductIds,
  disabled,
  searchSeed,
  testId,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selectedProduct = useMemo(
    () => (value ? products.find((p) => p.id === value) : null),
    [products, value],
  );

  const isDuplicate = value != null && usedProductIds?.has(value);
  const {
    normalizedSeed,
    effectiveQuery,
    searchableProducts,
    filtered,
    hasSuggestedMatches,
    suggestedProducts,
    fallbackProducts,
  } = useMemo(() => buildProductLinkState({
    products,
    value,
    usedProductIds,
    search,
    searchSeed,
  }), [
    products,
    search,
    searchSeed,
    usedProductIds,
    value,
  ]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          data-testid={testId ? `${testId}-trigger` : undefined}
          className={cn(
            "h-8 w-full justify-between text-xs font-normal px-2",
            !value && "text-muted-foreground",
            isDuplicate && "border-red-400 bg-red-50",
          )}
        >
          <span className="truncate flex-1 text-left">
            {selectedProduct
              ? `${selectedProduct.name} (${selectedProduct.medida})${selectedProduct.marca ? ` — ${selectedProduct.marca}` : ""}`
              : "Buscar produto no estoque..."}
          </span>
          {isDuplicate ? (
            <AlertTriangle className="ml-1 h-3 w-3 shrink-0 text-red-500" />
          ) : (
            <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-full max-w-[92vw] md:max-w-[760px] p-0"
        align="start"
        data-testid={testId ? `${testId}-content` : undefined}
      >
        <Command shouldFilter={false}>
          <CommandInput
            autoFocus
            placeholder="Buscar por nome, medida ou marca..."
            value={search}
            onValueChange={setSearch}
            data-testid={testId ? `${testId}-input` : undefined}
          />
          {!search.trim() && normalizedSeed && (
            <div className="flex items-center gap-2 border-b px-3 py-2 text-[11px] text-muted-foreground">
              <Search className="h-3 w-3 shrink-0" />
              <span className="truncate">Sugestões baseadas no item do PDF</span>
            </div>
          )}
          {search.trim() && !hasSuggestedMatches && (
            <div className="flex items-center gap-2 border-b px-3 py-2 text-[11px] text-muted-foreground">
              <Search className="h-3 w-3 shrink-0" />
              <span className="truncate">Sem sugestão direta. Exibindo todo o estoque para escolha manual.</span>
            </div>
          )}
          <CommandList>
            {searchableProducts.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                Nenhum produto disponível em estoque.
              </div>
            ) : (
              <>
                <CommandGroup heading="Ações">
                  <CommandItem
                    value="acao sem vinculo limpar"
                    onSelect={() => {
                      onChange(null);
                      setOpen(false);
                      setSearch("");
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-3 w-3",
                        value == null ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="text-muted-foreground">Sem vínculo</span>
                  </CommandItem>
                </CommandGroup>

                {effectiveQuery && suggestedProducts.length > 0 && (
                  <>
                    <CommandSeparator />
                    <CommandGroup heading="Melhores sugestões">
                      {suggestedProducts.map(({ product, isUsed, inStock, score }, index) => {
                        const outOfStock = !inStock;
                        return (
                          <CommandItem
                            key={`suggested-${product.id}`}
                            value={`sugestao ${product.id} ${product.name} ${product.medida} ${product.marca ?? ""}`}
                            disabled={isUsed}
                            onSelect={() => {
                              if (isUsed) return;
                              onChange(product.id === value ? null : product.id);
                              setOpen(false);
                              setSearch("");
                            }}
                            className={cn(isUsed && "opacity-50")}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-3 w-3 shrink-0",
                                product.id === value ? "opacity-100" : "opacity-0",
                              )}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1">
                                <span className="truncate block text-xs">
                                  {product.name} ({product.medida})
                                </span>
                                {index === 0 && (
                                  <Badge variant="outline" className="text-[9px] px-1 py-0">
                                    Melhor opcao
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                {product.marca && <span className="truncate">{product.marca}</span>}
                                <span>{Math.round(score * 100)}%</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 ml-1 shrink-0">
                              <Badge
                                variant={outOfStock ? "destructive" : product.quantidade <= 3 ? "outline" : "secondary"}
                                className="text-[9px] px-1 py-0"
                              >
                                {product.quantidade} un.
                              </Badge>
                              {isUsed && (
                                <span className="text-[10px] text-amber-600">
                                  ja usado
                                </span>
                              )}
                            </div>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </>
                )}

                <CommandSeparator />
                <CommandGroup heading={effectiveQuery ? "Todo o estoque" : "Produtos em estoque"}>
                  {(effectiveQuery ? fallbackProducts : filtered).map(({ product, isUsed, inStock, score }) => {
                    const outOfStock = !inStock;
                    return (
                      <CommandItem
                        key={product.id}
                        value={`estoque ${product.id} ${product.name} ${product.medida} ${product.marca ?? ""}`}
                        disabled={isUsed}
                        onSelect={() => {
                          if (isUsed) return;
                          onChange(product.id === value ? null : product.id);
                          setOpen(false);
                          setSearch("");
                        }}
                        className={cn(isUsed && "opacity-50")}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-3 w-3 shrink-0",
                            product.id === value ? "opacity-100" : "opacity-0",
                          )}
                        />
                        <div className="flex-1 min-w-0">
                          <span className="truncate block text-xs">
                            {product.name} ({product.medida})
                          </span>
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            {product.marca && <span className="truncate">{product.marca}</span>}
                            {effectiveQuery && score > 0 && (
                              <span>{Math.round(score * 100)}%</span>
                            )}
                            {effectiveQuery && score === 0 && (
                              <span>manual</span>
                            )}
                          </div>
                          {product.marca && (
                            <span className="sr-only">{product.marca}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 ml-1 shrink-0">
                          <Badge
                            variant={outOfStock ? "destructive" : product.quantidade <= 3 ? "outline" : "secondary"}
                            className="text-[9px] px-1 py-0"
                          >
                            {product.quantidade} un.
                          </Badge>
                          {isUsed && (
                            <span className="text-[10px] text-amber-600">
                              já usado
                            </span>
                          )}
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
