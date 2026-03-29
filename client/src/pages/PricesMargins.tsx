import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DollarSign, TrendingUp, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function PricesMargins() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [precoCusto, setPrecoCusto] = useState("");
  const [precoVenda, setPrecoVenda] = useState("");

  const { data: products, isLoading, refetch } = trpc.products.list.useQuery({ page: 1, pageSize: 100 });
  const updatePrice = trpc.products.updatePrice.useMutation({
    onSuccess: () => {
      toast.success("Preço atualizado com sucesso!");
      refetch();
      setEditingProduct(null);
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao atualizar preço");
    },
  });

  if (!isAdmin) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardHeader>
            <CardTitle>Acesso Negado</CardTitle>
            <CardDescription>
              Apenas administradores podem acessar esta página.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const handleEditPrice = (product: any) => {
    setEditingProduct(product);
    setPrecoCusto(product.precoCusto || "");
    setPrecoVenda(product.precoVenda || "");
  };

  const handleSavePrice = () => {
    if (!editingProduct) return;

    updatePrice.mutate({
      id: editingProduct.id,
      precoCusto: precoCusto ? parseFloat(precoCusto) : null,
      precoVenda: precoVenda ? parseFloat(precoVenda) : null,
    });
  };

  const calculateMargin = (custo?: string | null, venda?: string | null) => {
    if (!custo || !venda) return null;
    const custoNum = parseFloat(custo);
    const vendaNum = parseFloat(venda);
    if (custoNum === 0) return null;
    return ((vendaNum - custoNum) / custoNum * 100).toFixed(2);
  };

  const productsWithPrices = products?.items?.filter(p => p.precoCusto || p.precoVenda) || [];
  const productsWithoutPrices = products?.items?.filter(p => !p.precoCusto && !p.precoVenda) || [];

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">Preços e Margens</h1>
        <p className="text-muted-foreground">
          Gerencie os preços de custo e venda dos produtos
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Produtos com Preço
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{productsWithPrices.length}</div>
            <p className="text-xs text-muted-foreground">
              de {products?.total || 0} produtos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Sem Preço
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{productsWithoutPrices.length}</div>
            <p className="text-xs text-muted-foreground">
              produtos pendentes
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Margem Média
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {productsWithPrices.length > 0
                ? (
                    productsWithPrices
                      .map(p => parseFloat(calculateMargin(p.precoCusto, p.precoVenda) || "0"))
                      .reduce((a, b) => a + b, 0) / productsWithPrices.length
                  ).toFixed(2)
                : "0"}%
            </div>
            <p className="text-xs text-muted-foreground">
              dos produtos com preço
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Products Table */}
      <Card>
        <CardHeader>
          <CardTitle>Lista de Produtos</CardTitle>
          <CardDescription>
            Clique no ícone de edição para atualizar os preços
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p>Carregando...</p>
          ) : (
            <div className="overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead>Medida</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead className="text-right">Preço Custo</TableHead>
                  <TableHead className="text-right">Preço Venda</TableHead>
                  <TableHead className="text-right">Margem</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products?.items?.map((product) => {
                  const margin = calculateMargin(product.precoCusto, product.precoVenda);
                  return (
                    <TableRow key={product.id}>
                      <TableCell className="font-medium">{product.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{product.medida}</Badge>
                      </TableCell>
                      <TableCell>{product.categoria}</TableCell>
                      <TableCell className="text-right">
                        {product.precoCusto ? `R$ ${parseFloat(product.precoCusto).toFixed(2)}` : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {product.precoVenda ? `R$ ${parseFloat(product.precoVenda).toFixed(2)}` : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {margin ? (
                          <Badge variant={parseFloat(margin) > 30 ? "default" : "secondary"}>
                            {margin}%
                          </Badge>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEditPrice(product)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Price Dialog */}
      <Dialog open={!!editingProduct} onOpenChange={() => setEditingProduct(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Preços</DialogTitle>
            <DialogDescription>
              Atualize os preços de custo e venda do produto
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Produto</Label>
              <p className="text-sm font-medium">{editingProduct?.name}</p>
              <p className="text-xs text-muted-foreground">
                {editingProduct?.medida} - {editingProduct?.categoria}
              </p>
            </div>
            <div>
              <Label htmlFor="precoCusto">Preço de Custo (R$)</Label>
              <Input
                id="precoCusto"
                type="number"
                step="0.01"
                value={precoCusto}
                onChange={(e) => setPrecoCusto(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div>
              <Label htmlFor="precoVenda">Preço de Venda (R$)</Label>
              <Input
                id="precoVenda"
                type="number"
                step="0.01"
                value={precoVenda}
                onChange={(e) => setPrecoVenda(e.target.value)}
                placeholder="0.00"
              />
            </div>
            {precoCusto && precoVenda && (
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm font-medium">Margem de Lucro</p>
                <p className="text-2xl font-bold">
                  {calculateMargin(precoCusto, precoVenda)}%
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingProduct(null)}>
              Cancelar
            </Button>
            <Button onClick={handleSavePrice} disabled={updatePrice.isPending}>
              {updatePrice.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
