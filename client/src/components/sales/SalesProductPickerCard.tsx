import type { Dispatch, RefObject, SetStateAction } from "react";
import { Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const MAX_PAYMENT_METHODS = 3;

type PaymentMethodOption = { key: string; label: string; category: string };

type SearchProduct = {
  id: number;
  name: string;
  marca: string | null;
  medida: string;
  quantidade: number;
};

export type SaleFormState = {
  sellers: string[];
  vendedor: string;
  setVendedor: Dispatch<SetStateAction<string>>;
  nomeCliente: string;
  setNomeCliente: Dispatch<SetStateAction<string>>;
  telefoneCliente: string;
  setTelefoneCliente: Dispatch<SetStateAction<string>>;
  formasPagamento: string[];
  setFormasPagamento: Dispatch<SetStateAction<string[]>>;
  paymentMethods: PaymentMethodOption[];
  paymentMethodsLoading: boolean;
  enderecoCliente: string;
  setEnderecoCliente: Dispatch<SetStateAction<string>>;
  dataVenda: string;
  setDataVenda: Dispatch<SetStateAction<string>>;
  valorTotalInput: string;
  setValorTotalInput: Dispatch<SetStateAction<string>>;
  tipoTransacao: "venda" | "troca" | "brinde" | "emprestimo" | "permuta";
  setTipoTransacao: Dispatch<SetStateAction<"venda" | "troca" | "brinde" | "emprestimo" | "permuta">>;
};

export type ProductSearchState = {
  searchInputRef: RefObject<HTMLInputElement | null>;
  searchTerm: string;
  setSearchTerm: Dispatch<SetStateAction<string>>;
  handleSearchKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  onlyInStock: boolean;
  setOnlyInStock: Dispatch<SetStateAction<boolean>>;
  selectedProduct?: SearchProduct;
  isLoading: boolean;
  hasProductsLoaded: boolean;
  filteredProducts: SearchProduct[];
  displayedProducts: SearchProduct[];
  isSearchMode: boolean;
  selectedProductId: string;
  setSelectedProductId: Dispatch<SetStateAction<string>>;
  keyboardActiveIndex: number;
  setKeyboardActiveIndex: Dispatch<SetStateAction<number>>;
  getListQuantity: (productId: number) => number;
  updateListQuantity: (productId: number, nextValue: number) => void;
  addItem: (productIdOverride?: number, quantidadeOverride?: number) => void;
  quantidade: number;
  setQuantidade: Dispatch<SetStateAction<number>>;
  selectFirstProductFromSearch: () => void;
};

type SalesProductPickerCardProps = {
  form: SaleFormState;
  search: ProductSearchState;
};

export function SalesProductPickerCard({ form, search }: SalesProductPickerCardProps) {
  const {
    sellers,
    vendedor, setVendedor,
    nomeCliente, setNomeCliente,
    telefoneCliente, setTelefoneCliente,
    formasPagamento, setFormasPagamento,
    paymentMethods, paymentMethodsLoading,
    enderecoCliente, setEnderecoCliente,
    dataVenda, setDataVenda,
    valorTotalInput, setValorTotalInput,
    tipoTransacao, setTipoTransacao,
  } = form;

  const {
    searchInputRef,
    searchTerm, setSearchTerm,
    handleSearchKeyDown,
    onlyInStock, setOnlyInStock,
    selectedProduct,
    isLoading, hasProductsLoaded,
    filteredProducts, displayedProducts, isSearchMode,
    selectedProductId, setSelectedProductId,
    keyboardActiveIndex, setKeyboardActiveIndex,
    getListQuantity, updateListQuantity,
    addItem,
    quantidade, setQuantidade,
    selectFirstProductFromSearch,
  } = search;

  return (
    <Card className="border-border shadow-sm">
      <CardHeader>
        <CardTitle>Adicionar Produtos</CardTitle>
        <CardDescription>Selecione os produtos vendidos</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="vendedor">Vendedor Responsável (Obrigatório)</Label>
          <Select value={vendedor} onValueChange={setVendedor}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione o vendedor" />
            </SelectTrigger>
            <SelectContent>
              {sellers.map((v) => (
                <SelectItem key={v} value={v}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="nomeCliente">Nome do Cliente (Obrigatório)</Label>
          <Input
            id="nomeCliente"
            type="text"
            placeholder="Ex: Maria Silva"
            value={nomeCliente}
            onChange={(e) => setNomeCliente(e.target.value)}
          />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="telefoneCliente">Telefone</Label>
            <Input
              id="telefoneCliente"
              type="text"
              placeholder="Ex: (82) 99999-9999"
              value={telefoneCliente}
              onChange={(e) => setTelefoneCliente(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Forma de Pagamento (Obrigatório)</Label>
            <div className="space-y-2">
              {(formasPagamento.length === 0 ? [""] : formasPagamento).map((key, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Select
                    value={key || "__none"}
                    onValueChange={(v) => {
                      const next = [...formasPagamento];
                      if (v === "__none") {
                        next.splice(idx, 1);
                      } else if (idx < next.length) {
                        next[idx] = v;
                      } else {
                        next.push(v);
                      }
                      setFormasPagamento(next);
                    }}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Selecione a forma de pagamento" />
                    </SelectTrigger>
                    <SelectContent>
                      {paymentMethods.map((method) => (
                        <SelectItem key={method.key} value={method.key}>
                          {method.label} — {method.category}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {formasPagamento.length > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 shrink-0"
                      onClick={() => setFormasPagamento(formasPagamento.filter((_, i) => i !== idx))}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              {formasPagamento.length < MAX_PAYMENT_METHODS && formasPagamento.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => setFormasPagamento([...formasPagamento, ""])}
                >
                  + Adicionar forma de pagamento ({formasPagamento.length}/{MAX_PAYMENT_METHODS})
                </Button>
              )}
            </div>
            {paymentMethodsLoading && (
              <p className="text-xs text-muted-foreground">Carregando catálogo de pagamentos...</p>
            )}
            {!paymentMethodsLoading && paymentMethods.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Cadastre formas de pagamento em Categorias para liberar o lançamento.
              </p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="enderecoCliente">Endereço</Label>
          <Input
            id="enderecoCliente"
            type="text"
            placeholder="Ex: Rua A, 123 - Bairro"
            value={enderecoCliente}
            onChange={(e) => setEnderecoCliente(e.target.value)}
          />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="dataVenda">Data da Venda (Obrigatório)</Label>
            <Input
              id="dataVenda"
              type="date"
              value={dataVenda}
              onChange={(e) => setDataVenda(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="valorTotalInput">Valor Total (R$)</Label>
            <Input
              id="valorTotalInput"
              type="text"
              inputMode="decimal"
              placeholder="Ex: 1299,90"
              value={valorTotalInput}
              onChange={(e) => setValorTotalInput(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="tipoTransacao">Tipo de Transação</Label>
          <Select value={tipoTransacao} onValueChange={(value: any) => setTipoTransacao(value)}>
            <SelectTrigger id="tipoTransacao">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="venda">Venda</SelectItem>
              <SelectItem value="troca">Troca</SelectItem>
              <SelectItem value="brinde">Brinde</SelectItem>
              <SelectItem value="emprestimo">Empréstimo</SelectItem>
              <SelectItem value="permuta">Permuta</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="product">Buscar e Selecionar Produto</Label>
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
              <Input
                id="search"
                type="text"
                placeholder="Digite para buscar produto..."
                ref={searchInputRef}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                className="pl-10"
              />
            </div>
            <div className="flex items-center gap-2 rounded-md border px-3 py-2">
              <Checkbox
                id="onlyInStock"
                checked={onlyInStock}
                onCheckedChange={(checked) => setOnlyInStock(Boolean(checked))}
              />
              <Label htmlFor="onlyInStock" className="text-sm">
                Mostrar apenas produtos com estoque
              </Label>
            </div>

            {selectedProduct ? (
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                Selecionado: <strong>{selectedProduct.name}</strong> ({selectedProduct.medida}) - Estoque: {selectedProduct.quantidade}
              </div>
            ) : null}

            <div className="max-h-56 space-y-2 overflow-auto rounded-md border p-2">
              {isLoading && !hasProductsLoaded ? (
                <div className="py-4 text-center text-sm text-muted-foreground">Carregando produtos...</div>
              ) : isLoading ? (
                <div className="py-4 text-center text-sm text-muted-foreground">Buscando...</div>
              ) : filteredProducts.length === 0 ? (
                <div className="py-4 text-center text-sm text-muted-foreground">
                  {isSearchMode ? `Nenhum produto encontrado para "${searchTerm}"` : "Nenhum produto disponível no momento"}
                </div>
              ) : (
                displayedProducts.map((product, index) => {
                  const isSelected = selectedProductId === product.id.toString();
                  const isKeyboardActive = index === keyboardActiveIndex;
                  return (
                    <label
                      key={product.id}
                      className={`flex cursor-pointer items-center justify-between rounded-md border px-3 py-2 text-sm ${
                        isSelected
                          ? "border-primary bg-primary/5"
                          : isKeyboardActive
                            ? "border-primary/50 bg-primary/5"
                            : "bg-background"
                      }`}
                      onMouseEnter={() => setKeyboardActiveIndex(index)}
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium">{product.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {product.marca ? `${product.marca} - ` : ""}
                          {product.medida} - Estoque: {product.quantidade}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min="1"
                          value={getListQuantity(product.id)}
                          onChange={(e) => {
                            const parsed = Number.parseInt(e.target.value, 10);
                            updateListQuantity(product.id, Number.isNaN(parsed) ? 1 : parsed);
                          }}
                          className="h-8 w-16 text-center text-xs"
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedProductId(product.id.toString());
                            addItem(product.id, getListQuantity(product.id));
                          }}
                        >
                          Add
                        </Button>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => {
                            setSelectedProductId(product.id.toString());
                            setKeyboardActiveIndex(index);
                          }}
                        />
                      </div>
                    </label>
                  );
                })
              )}
            </div>
            {filteredProducts.length > displayedProducts.length ? (
              <div className="text-xs text-muted-foreground">
                Mostrando {displayedProducts.length} de {filteredProducts.length} resultados. Continue digitando para refinar.
              </div>
            ) : null}
            <div className="text-xs text-muted-foreground">
              {isSearchMode
                ? <>Dica: pressione <strong>Enter</strong> para selecionar o primeiro resultado (ou adicionar o selecionado).</>
                : "Top 20 produtos carregados. Digite pelo menos 2 letras para buscar em toda a base."}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="quantidade">Quantidade</Label>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setQuantidade(Math.max(1, quantidade - 1))}
              className="h-10 w-10 shrink-0"
            >
              <span className="text-lg font-bold">-</span>
            </Button>
            <Input
              id="quantidade"
              type="number"
              min="1"
              value={quantidade}
              onChange={(e) => {
                const value = e.target.value;
                if (value === "" || value === "0") {
                  setQuantidade(1);
                } else {
                  const parsed = parseInt(value);
                  if (!isNaN(parsed) && parsed > 0) {
                    setQuantidade(parsed);
                  }
                }
              }}
              className="text-center text-lg font-semibold"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setQuantidade(quantidade + 1)}
              className="h-10 w-10 shrink-0"
            >
              <span className="text-lg font-bold">+</span>
            </Button>
          </div>
        </div>

        <Button onClick={() => addItem()} className="w-full gap-2">
          <Plus className="h-4 w-4" />
          Adicionar à Venda
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={selectFirstProductFromSearch}
          disabled={filteredProducts.length === 0}
          className="w-full"
        >
          Selecionar primeiro resultado
        </Button>
      </CardContent>
    </Card>
  );
}
