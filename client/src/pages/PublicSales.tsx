import { trpc } from "@/lib/trpc";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { BrandLogo } from "@/components/BrandLogo";
import { ShoppingCart, Package, Search, Trash2, Check } from "lucide-react";
import { toast } from "sonner";

interface CartItem {
  productId: number;
  name: string;
  medida: string;
  categoria: string;
  quantidade: number;
  quantidadeDisponivel: number;
}

type PaymentMethodOption = { key: string; label: string; category: string };

const DEFAULT_PAYMENT_METHODS: PaymentMethodOption[] = [
  { key: "PIX", label: "PIX", category: "Instantâneo" },
  { key: "RECEBER_NA_ENTREGA", label: "RECEBER NA ENTREGA", category: "Entrega" },
  { key: "DINHEIRO", label: "DINHEIRO", category: "Dinheiro" },
  { key: "CARTAO_CREDITO", label: "CARTÃO DE CRÉDITO", category: "Cartão" },
  { key: "CARTAO_DEBITO", label: "CARTÃO DE DÉBITO", category: "Cartão" },
  { key: "BOLETO", label: "BOLETO", category: "Boleto" },
  { key: "TRANSFERENCIA", label: "TRANSFERÊNCIA", category: "Transferência" },
  { key: "MULTIPLO", label: "MÚLTIPLO (2+ formas)", category: "Combinado" },
  { key: "OUTROS", label: "OUTROS", category: "Outros" },
];

export default function PublicSales() {
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [selectedMedida, setSelectedMedida] = useState<string>("all");
  const [selectedCategoria, setSelectedCategoria] = useState<string>("all");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [tipoTransacao, setTipoTransacao] = useState<"venda" | "troca" | "brinde" | "emprestimo" | "permuta">("venda");
  const [formaPagamento, setFormaPagamento] = useState("");
  const [visibleCount, setVisibleCount] = useState(20);

  const paymentMethodsQuery = trpc.catalogo.listPaymentMethods.useQuery(undefined, {
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const paymentMethods = useMemo<PaymentMethodOption[]>(() => {
    const fromCatalog = (paymentMethodsQuery.data ?? [])
      .filter((item) => item.codigo?.trim() && item.nome?.trim())
      .map((item) => ({
        key: item.codigo.trim().toUpperCase(),
        label: item.nome.trim(),
        category: item.categoria?.trim() || "Outros",
      }));
    return fromCatalog.length > 0 ? fromCatalog : DEFAULT_PAYMENT_METHODS;
  }, [paymentMethodsQuery.data]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearchTerm(searchTerm), 300);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    setVisibleCount(20);
  }, [debouncedSearchTerm, selectedMedida, selectedCategoria]);

  const { data: products, isLoading, error: productsError, refetch } = trpc.products.list.useQuery({
    searchTerm: debouncedSearchTerm || undefined,
    medida: selectedMedida !== "all" ? selectedMedida : undefined,
    categoria: selectedCategoria !== "all" ? selectedCategoria : undefined,
    page: 1,
    pageSize: 40,
  }, {
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  });

  const visibleProducts = useMemo(
    () => (products?.items ?? []).slice(0, visibleCount),
    [products?.items, visibleCount]
  );

  const registerSaleMutation = trpc.vendas.registerPublic.useMutation({
    onSuccess: () => {
      toast.success("Venda registrada com sucesso!");
      setCart([]);
      refetch();
    },
    onError: (error: any) => {
      toast.error(`Erro ao registrar venda: ${error.message}`);
    },
  });

  const addToCart = (product: any) => {
    const existingItem = cart.find(item => item.productId === product.id);
    
    if (existingItem) {
      // Permitir venda mesmo com estoque insuficiente (encomenda)
      if (existingItem.quantidade >= product.quantidade && product.quantidade > 0) {
        toast.warning(`Atenção: Estoque atual é ${product.quantidade}. Vendas adicionais serão registradas como encomenda.`, {
          duration: 4000,
        });
      }
      setCart(cart.map(item =>
        item.productId === product.id
          ? { ...item, quantidade: item.quantidade + 1 }
          : item
      ));
    } else {
      // Alertar se produto está sem estoque
      if (product.quantidade <= 0) {
        toast.warning(`Atenção: Produto sem estoque. Esta venda será registrada como encomenda.`, {
          duration: 4000,
        });
      }
      setCart([...cart, {
        productId: product.id,
        name: product.name,
        medida: product.medida,
        categoria: product.categoria,
        quantidade: 1,
        quantidadeDisponivel: product.quantidade,
      }]);
    }
    toast.success(`${product.name} adicionado ao carrinho`);
  };

  const removeFromCart = (productId: number) => {
    setCart(cart.filter(item => item.productId !== productId));
  };

  const updateCartQuantity = (productId: number, quantidade: number) => {
    const item = cart.find(i => i.productId === productId);
    if (!item) return;

    if (quantidade <= 0) {
      removeFromCart(productId);
      return;
    }

    // Permitir venda mesmo com estoque insuficiente (encomenda)
    if (quantidade > item.quantidadeDisponivel && item.quantidadeDisponivel > 0) {
      toast.warning(`Atenção: Estoque atual é ${item.quantidadeDisponivel}. Vendas adicionais serão registradas como encomenda.`, {
        duration: 4000,
      });
    }

    setCart(cart.map(item =>
      item.productId === productId
        ? { ...item, quantidade }
        : item
    ));
  };

  const handleFinalizeSale = () => {
    if (cart.length === 0) {
      toast.error("Carrinho vazio");
      return;
    }
    if (!formaPagamento) {
      toast.error("Selecione a forma de pagamento");
      return;
    }

    registerSaleMutation.mutate({
      items: cart.map(item => ({
        productId: item.productId,
        quantidade: item.quantidade,
      })),
      formaPagamento,
      tipoTransacao,
    });
  };

  const totalItems = cart.reduce((sum, item) => sum + item.quantidade, 0);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-card border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <BrandLogo className="h-16 w-auto object-contain" />
              <div>
                <h1 className="text-2xl font-bold text-foreground">Estoque Pioneira Colchões</h1>
                <p className="text-sm text-muted-foreground">Registre suas vendas rapidamente</p>
              </div>
            </div>
            <div className="relative">
              <Button
                variant="default"
                className="gap-2"
                onClick={() => document.getElementById("cart-section")?.scrollIntoView({ behavior: "smooth" })}
              >
                <ShoppingCart className="h-5 w-5" />
                Carrinho
                {totalItems > 0 && (
                  <Badge variant="secondary" className="ml-1">
                    {totalItems}
                  </Badge>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {productsError && (
          <Card className="mb-6 border-destructive/30 bg-destructive/5">
            <CardContent className="pt-6">
              <p className="text-sm text-destructive font-medium">
                Servidor fora do ar.
              </p>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-8 lg:grid-cols-3">
          {/* Products Section */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="border-border shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Search className="h-5 w-5" />
                  Buscar Produtos
                </CardTitle>
                <CardDescription>Encontre os produtos disponíveis em estoque</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <Label>Buscar por nome</Label>
                    <Input
                      placeholder="Nome do produto..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Medida</Label>
                    <Select value={selectedMedida} onValueChange={setSelectedMedida}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas</SelectItem>
                        <SelectItem value="Solteiro">Solteiro</SelectItem>
                        <SelectItem value="Solteirão">Solteirão</SelectItem>
                        <SelectItem value="Casal">Casal</SelectItem>
                        <SelectItem value="Queen">Queen</SelectItem>
                        <SelectItem value="King">King</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Categoria</Label>
                    <Select value={selectedCategoria} onValueChange={setSelectedCategoria}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas</SelectItem>
                        <SelectItem value="Colchões">Colchões</SelectItem>
                        <SelectItem value="Roupas de Cama">Roupas de Cama</SelectItem>
                        <SelectItem value="Pillow Top">Pillow Top</SelectItem>
                        <SelectItem value="Travesseiros">Travesseiros</SelectItem>
                        <SelectItem value="Cabeceiras">Cabeceiras</SelectItem>
                        <SelectItem value="Box Baú">Box Baú</SelectItem>
                        <SelectItem value="Box Premium">Box Premium</SelectItem>
                        <SelectItem value="Box Tradicional">Box Tradicional</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Products Grid */}
            {isLoading ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">Carregando produtos...</p>
              </div>
            ) : products && products.items && products.items.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2">
                {visibleProducts.map((product) => (
                  <Card key={product.id} className="border-border shadow-sm hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-semibold text-foreground">{product.name}</h3>
                          <div className="flex gap-2 mt-2">
                            <Badge variant="outline" className="text-xs">
                              {product.medida}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {product.categoria}
                            </Badge>
                          </div>
                          <div className="mt-3 flex items-center gap-2">
                            <Package className="h-4 w-4 text-muted-foreground" />
                            <span className={`text-sm font-medium ${
                              product.quantidade < 0 ? "text-purple-600" :
                              product.quantidade <= 1 ? "text-destructive" :
                              product.quantidade <= product.estoqueMinimo ? "text-orange-600" :
                              "text-foreground"
                            }`}>
                              {product.quantidade < 0 ? `${Math.abs(product.quantidade)} encomendadas` : `${product.quantidade} em estoque`}
                            </span>
                          </div>
                        </div>
                        <Button
                          onClick={() => addToCart(product)}
                          size="sm"
                          className="ml-2"
                        >
                          <ShoppingCart className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {products.items.length > visibleCount && (
                  <div className="md:col-span-2 flex justify-center pt-2">
                    <Button
                      variant="outline"
                      onClick={() => setVisibleCount((prev) => prev + 20)}
                    >
                      Carregar mais produtos
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <Card className="border-border shadow-sm">
                <CardContent className="py-12 text-center">
                  <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">Nenhum produto encontrado</p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Cart Section */}
          <div className="lg:col-span-1">
            <div id="cart-section" className="sticky top-4">
              <Card className="border-border shadow-md">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ShoppingCart className="h-5 w-5" />
                    Carrinho de Vendas
                  </CardTitle>
                  <CardDescription>
                    {cart.length === 0 ? "Carrinho vazio" : `${totalItems} ${totalItems === 1 ? "item" : "itens"}`}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {cart.length === 0 ? (
                    <div className="text-center py-8">
                      <ShoppingCart className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                      <p className="text-sm text-muted-foreground">
                        Adicione produtos ao carrinho para registrar uma venda
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-3 max-h-[400px] overflow-y-auto">
                        {cart.map((item) => (
                          <div key={item.productId} className="p-3 rounded-lg bg-muted/50 border border-border">
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm text-foreground truncate">{item.name}</p>
                                <p className="text-xs text-muted-foreground">{item.medida}</p>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => removeFromCart(item.productId)}
                                className="h-6 w-6 p-0 ml-2"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => updateCartQuantity(item.productId, item.quantidade - 1)}
                                className="h-7 w-7 p-0"
                              >
                                -
                              </Button>
                              <Input
                                type="number"
                                value={item.quantidade}
                                onChange={(e) => updateCartQuantity(item.productId, parseInt(e.target.value) || 0)}
                                className="h-7 w-16 text-center"
                                min="1"
                                max={item.quantidadeDisponivel}
                              />
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => updateCartQuantity(item.productId, item.quantidade + 1)}
                                className="h-7 w-7 p-0"
                                disabled={item.quantidade >= item.quantidadeDisponivel}
                              >
                                +
                              </Button>
                              <span className="text-xs text-muted-foreground ml-auto">
                                Disp: {item.quantidadeDisponivel}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="formaPagamento">Forma de Pagamento</Label>
                        <Select value={formaPagamento} onValueChange={setFormaPagamento}>
                          <SelectTrigger id="formaPagamento">
                            <SelectValue placeholder="Selecione a forma de pagamento" />
                          </SelectTrigger>
                          <SelectContent>
                            {paymentMethods.map((item) => (
                              <SelectItem key={item.key} value={item.key}>
                                {item.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
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
                      <Button
                        onClick={handleFinalizeSale}
                        disabled={registerSaleMutation.isPending || !formaPagamento}
                        className="w-full gap-2"
                        size="lg"
                      >
                        <Check className="h-5 w-5" />
                        {registerSaleMutation.isPending ? "Processando..." : "Finalizar Venda"}
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
