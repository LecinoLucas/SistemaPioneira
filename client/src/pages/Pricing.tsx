import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useAccessControl } from "@/features/auth/hooks/useAccessControl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { DollarSign, TrendingUp, Pencil, History } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

export default function Pricing() {
  const PAGE_SIZE = 25;
  const { user } = useAuth();
  const { canPerform } = useAccessControl();
  const canManagePricing = canPerform("action:products.pricing");
  const [, setLocation] = useLocation();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [precoCusto, setPrecoCusto] = useState("");
  const [precoVenda, setPrecoVenda] = useState("");

  // Redirect if not admin
  useEffect(() => {
    if (user && !canManagePricing) {
      setLocation("/");
    }
  }, [user, canManagePricing, setLocation]);

  if (user && !canManagePricing) {
    return null;
  }

  const { data: products, isLoading, refetch } = trpc.products.list.useQuery(
    { page: currentPage, pageSize: PAGE_SIZE },
    {
      placeholderData: (prev) => prev,
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    }
  );
  const totalProducts = products?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalProducts / PAGE_SIZE));

  const updatePriceMutation = trpc.products.updatePrice.useMutation({
    onSuccess: () => {
      toast.success("Preços atualizados com sucesso!");
      setIsEditOpen(false);
      refetch();
    },
    onError: (error: any) => {
      toast.error(`Erro ao atualizar preços: ${error.message}`);
    },
  });

  const handleEdit = (product: any) => {
    setEditingProduct(product);
    setPrecoCusto(product.precoCusto || "");
    setPrecoVenda(product.precoVenda || "");
    setIsEditOpen(true);
  };

  const handleUpdate = () => {
    if (!editingProduct) return;

    const precoCustoNum = precoCusto ? parseFloat(precoCusto) : null;
    const precoVendaNum = precoVenda ? parseFloat(precoVenda) : null;

    if (precoCustoNum !== null && precoCustoNum < 0) {
      toast.error("Preço de custo não pode ser negativo");
      return;
    }

    if (precoVendaNum !== null && precoVendaNum < 0) {
      toast.error("Preço de venda não pode ser negativo");
      return;
    }

    updatePriceMutation.mutate({
      id: editingProduct.id,
      precoCusto: precoCustoNum,
      precoVenda: precoVendaNum,
    });
  };

  const calculateMargin = (custo: string | null, venda: string | null) => {
    if (!custo || !venda) return null;
    const custoNum = parseFloat(custo);
    const vendaNum = parseFloat(venda);
    if (custoNum === 0) return null;
    const margin = ((vendaNum - custoNum) / custoNum) * 100;
    return margin.toFixed(2);
  };

  if (isLoading && !products) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Preços e Margens</h1>
        <p className="text-muted-foreground mt-2">Gerencie preços de custo, venda e margens de lucro</p>
        <div className="mt-2 p-3 rounded-lg bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800">
          <p className="text-sm text-orange-800 dark:text-orange-200 flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            <strong>Acesso Restrito:</strong> Esta página é visível apenas para administradores
          </p>
        </div>
      </div>

      <Card className="border-border shadow-sm">
        <CardHeader>
          <CardTitle>Tabela de Preços</CardTitle>
          <CardDescription>
            Visualize e edite preços de custo, venda e margem de lucro
            {products ? ` - Página ${currentPage} de ${totalPages}` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
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
              {products && products.items && products.items.length > 0 ? (
                products.items.map((product) => {
                  const margin = calculateMargin(product.precoCusto, product.precoVenda);
                  return (
                    <TableRow key={product.id}>
                      <TableCell className="font-medium">{product.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{product.medida}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{product.categoria}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {product.precoCusto ? `R$ ${parseFloat(product.precoCusto).toFixed(2)}` : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {product.precoVenda ? `R$ ${parseFloat(product.precoVenda).toFixed(2)}` : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {margin ? (
                          <Badge 
                            variant={parseFloat(margin) >= 30 ? "default" : parseFloat(margin) >= 15 ? "secondary" : "destructive"}
                            className="gap-1"
                          >
                            <TrendingUp className="h-3 w-3" />
                            {margin}%
                          </Badge>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(product)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    Nenhum produto encontrado
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          </div>
          {products && totalPages > 1 ? (
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Mostrando {((currentPage - 1) * PAGE_SIZE) + 1}
                -
                {Math.min(currentPage * PAGE_SIZE, totalProducts)}
                {" "}de {totalProducts} produtos
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                >
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                >
                  Próxima
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Edit Price Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="bg-card text-card-foreground">
          <DialogHeader>
            <DialogTitle>Editar Preços</DialogTitle>
            <DialogDescription>
              Atualize os preços de custo e venda para {editingProduct?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="precoCusto">Preço de Custo (R$)</Label>
              <Input
                id="precoCusto"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={precoCusto}
                onChange={(e) => setPrecoCusto(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="precoVenda">Preço de Venda (R$)</Label>
              <Input
                id="precoVenda"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={precoVenda}
                onChange={(e) => setPrecoVenda(e.target.value)}
              />
            </div>
            {precoCusto && precoVenda && (
              <div className="p-3 rounded-lg bg-muted">
                <p className="text-sm text-muted-foreground mb-1">Margem de Lucro Estimada:</p>
                <p className="text-2xl font-bold text-accent">
                  {calculateMargin(precoCusto, precoVenda)}%
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleUpdate} disabled={updatePriceMutation.isPending}>
              {updatePriceMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
