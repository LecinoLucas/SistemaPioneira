import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowUpCircle, ArrowDownCircle, History as HistoryIcon, ShoppingCart, XCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useState } from "react";
import { toast } from "sonner";

export default function History() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "gerente";
  
  // Movimentações
  const { data: movimentacoes, isLoading: loadingMovimentacoes } = trpc.movimentacoes.list.useQuery(undefined, {
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  // Vendas paginadas
  const [currentPage, setCurrentPage] = useState(1);
  const [filterTipo, setFilterTipo] = useState<string>("todos");
  const { data: vendasData, isLoading: loadingVendas, refetch: refetchVendas } = trpc.vendas.list.useQuery({ 
    page: currentPage, 
    limit: 20,
    tipoTransacao: filterTipo === "todos" ? undefined : filterTipo
  }, {
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
  
  // Cancelamento
  const [cancelingVenda, setCancelingVenda] = useState<any>(null);
  const [motivoCancelamento, setMotivoCancelamento] = useState("");
  
  // Edição
  const [editingVenda, setEditingVenda] = useState<any>(null);
  const [editVendedor, setEditVendedor] = useState("");
  const [editObservacoes, setEditObservacoes] = useState("");
  const [editQuantidade, setEditQuantidade] = useState(0);
  const [editTipoTransacao, setEditTipoTransacao] = useState<"venda" | "troca" | "brinde" | "emprestimo" | "permuta">("venda");
  
  // Exclusão
  const [deletingVenda, setDeletingVenda] = useState<any>(null);
  
  const cancelarMutation = trpc.vendas.cancelar.useMutation({
    onSuccess: () => {
      toast.success("Venda cancelada com sucesso!");
      refetchVendas();
      setCancelingVenda(null);
      setMotivoCancelamento("");
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao cancelar venda");
    },
  });
  
  const excluirMutation = trpc.vendas.excluir.useMutation({
    onSuccess: () => {
      toast.success("Venda excluída com sucesso!");
      refetchVendas();
      setDeletingVenda(null);
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao excluir venda");
    },
  });
  
  const editarMutation = trpc.vendas.editar.useMutation({
    onSuccess: () => {
      toast.success("Venda editada com sucesso!");
      refetchVendas();
      setEditingVenda(null);
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao editar venda");
    },
  });

  const handleCancelar = () => {
    if (!cancelingVenda || !motivoCancelamento.trim()) {
      toast.error("Por favor, informe o motivo do cancelamento");
      return;
    }

    cancelarMutation.mutate({
      vendaId: cancelingVenda.id,
      motivo: motivoCancelamento,
    });
  };
  
  const handleEditar = () => {
    if (!editingVenda) return;
    
    const updates: any = {};
    if (editVendedor !== editingVenda.vendedor) updates.vendedor = editVendedor;
    if (editObservacoes !== (editingVenda.observacoes || "")) updates.observacoes = editObservacoes;
    if (editQuantidade !== editingVenda.quantidade) updates.quantidade = editQuantidade;
    if (editTipoTransacao !== (editingVenda.tipoTransacao || "venda")) updates.tipoTransacao = editTipoTransacao;
    
    if (Object.keys(updates).length === 0) {
      toast.info("Nenhuma alteração foi feita");
      return;
    }
    
    editarMutation.mutate({
      vendaId: editingVenda.id,
      ...updates,
    });
  };
  
  const openEditModal = (venda: any) => {
    setEditingVenda(venda);
    setEditVendedor(venda.vendedor || "");
    setEditObservacoes(venda.observacoes || "");
    setEditQuantidade(venda.quantidade);
    setEditTipoTransacao(venda.tipoTransacao || "venda");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Histórico</h1>
        <p className="text-muted-foreground mt-2">Acompanhe vendas e movimentações de estoque</p>
      </div>

      <Tabs defaultValue="vendas" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="vendas">
            <ShoppingCart className="h-4 w-4 mr-2" />
            Vendas
          </TabsTrigger>
          <TabsTrigger value="movimentacoes">
            <HistoryIcon className="h-4 w-4 mr-2" />
            Movimentações
          </TabsTrigger>
        </TabsList>

        {/* Vendas Tab */}
        <TabsContent value="vendas">
          <Card className="border-border shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5" />
                Histórico de Vendas
              </CardTitle>
              <CardDescription>
                {vendasData ? `Página ${vendasData.currentPage} de ${vendasData.totalPages} (${vendasData.total} vendas)` : "Carregando..."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Filtro por tipo */}
              <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
                <Label htmlFor="filter-tipo">Filtrar por tipo:</Label>
                <Select value={filterTipo} onValueChange={(value) => {
                  setFilterTipo(value);
                  setCurrentPage(1); // Reset to first page when filtering
                }}>
                  <SelectTrigger id="filter-tipo" className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="venda">Venda</SelectItem>
                    <SelectItem value="troca">Troca</SelectItem>
                    <SelectItem value="brinde">Brinde</SelectItem>
                    <SelectItem value="emprestimo">Empréstimo</SelectItem>
                    <SelectItem value="permuta">Permuta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {loadingVendas ? (
                <div className="flex items-center justify-center h-48">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                </div>
              ) : (
                <>
                  <div className="overflow-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data/Hora</TableHead>
                        <TableHead>Produto</TableHead>
                        <TableHead>Quantidade</TableHead>
                        <TableHead>Vendedor</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Status</TableHead>
                        {isAdmin && <TableHead className="text-right">Ações</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {vendasData && vendasData.vendas.length > 0 ? (
                        vendasData.vendas.map((venda) => (
                          <TableRow key={venda.id}>
                            <TableCell className="font-medium">
                              {format(new Date(venda.dataVenda), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                            </TableCell>
                            <TableCell>
                              {venda.productName}
                              <br />
                              <span className="text-xs text-muted-foreground">
                                {venda.productMedida} - {venda.productCategoria}
                              </span>
                            </TableCell>
                            <TableCell>
                              <span className="font-semibold">{venda.quantidade}</span>
                            </TableCell>
                            <TableCell>{venda.vendedor || "-"}</TableCell>
                            <TableCell>
                              <span className="capitalize">{venda.tipoTransacao || "venda"}</span>
                            </TableCell>
                            <TableCell>
                              {venda.status === "concluida" ? (
                                <Badge variant="default" className="bg-green-600">Concluída</Badge>
                              ) : (
                                <Badge variant="destructive">Cancelada</Badge>
                              )}
                            </TableCell>
                            {isAdmin && (
                              <TableCell className="text-right">
                                <div className="flex gap-1 justify-end">
                                  {venda.status === "concluida" && (
                                    <>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => openEditModal(venda)}
                                        title="Editar venda"
                                      >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setCancelingVenda(venda)}
                                        title="Cancelar venda"
                                      >
                                        <XCircle className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setDeletingVenda(venda)}
                                        title="Excluir venda"
                                        className="text-destructive hover:text-destructive"
                                      >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                      </Button>
                                    </>
                                  )}
                                  {venda.status === "cancelada" && venda.motivoCancelamento && (
                                    <span className="text-xs text-muted-foreground">
                                      {venda.motivoCancelamento}
                                    </span>
                                  )}
                                </div>
                              </TableCell>
                            )}
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={isAdmin ? 6 : 5} className="text-center text-muted-foreground py-8">
                            Nenhuma venda registrada
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                  </div>

                  {/* Paginação */}
                  {vendasData && vendasData.totalPages > 1 && (
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm text-muted-foreground">
                        Mostrando {((currentPage - 1) * 20) + 1} a {Math.min(currentPage * 20, vendasData.total)} de {vendasData.total} vendas
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                          disabled={currentPage === 1}
                        >
                          <ChevronLeft className="h-4 w-4 mr-1" />
                          Anterior
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(p => Math.min(vendasData.totalPages, p + 1))}
                          disabled={currentPage === vendasData.totalPages}
                        >
                          Próximo
                          <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Movimentações Tab */}
        <TabsContent value="movimentacoes">
          <Card className="border-border shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HistoryIcon className="h-5 w-5" />
                Movimentações de Estoque
              </CardTitle>
              <CardDescription>
                Últimas {movimentacoes?.length || 0} movimentações registradas
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingMovimentacoes ? (
                <div className="flex items-center justify-center h-48">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                </div>
              ) : (
                <div className="overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data/Hora</TableHead>
                      <TableHead>Produto</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Quantidade</TableHead>
                      <TableHead>Estoque Anterior</TableHead>
                      <TableHead>Estoque Novo</TableHead>
                      <TableHead>Observação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movimentacoes && movimentacoes.length > 0 ? (
                      movimentacoes.map((mov) => (
                        <TableRow key={mov.id}>
                          <TableCell className="font-medium">
                            {format(new Date(mov.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                          </TableCell>
                          <TableCell>
                            {mov.productName ? `${mov.productName}${mov.productMedida ? ` (${mov.productMedida})` : ""}` : `Produto #${mov.productId}`}
                          </TableCell>
                          <TableCell>
                            {mov.tipo === "entrada" ? (
                              <Badge variant="default" className="gap-1 bg-green-600 hover:bg-green-700">
                                <ArrowUpCircle className="h-3 w-3" />
                                Entrada
                              </Badge>
                            ) : (
                              <Badge variant="default" className="gap-1 bg-red-600 hover:bg-red-700">
                                <ArrowDownCircle className="h-3 w-3" />
                                Saída
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className={`font-semibold ${
                              mov.tipo === "entrada" ? "text-green-600" : "text-red-600"
                            }`}>
                              {mov.tipo === "entrada" ? "+" : "-"}{mov.quantidade}
                            </span>
                          </TableCell>
                          <TableCell>{mov.quantidadeAnterior}</TableCell>
                          <TableCell>
                            <span className="font-semibold">{mov.quantidadeNova}</span>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {mov.observacao || "-"}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          Nenhuma movimentação registrada
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog de Edição */}
      <Dialog open={!!editingVenda} onOpenChange={() => setEditingVenda(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Venda</DialogTitle>
            <DialogDescription>
              Altere as informações da venda. O estoque será ajustado automaticamente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {editingVenda && (
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm font-medium">Produto</p>
                <p className="text-sm text-muted-foreground">
                  {editingVenda.productName} ({editingVenda.productMedida})
                </p>
              </div>
            )}
            <div>
              <Label htmlFor="edit-vendedor">Vendedor Responsável</Label>
              <select
                id="edit-vendedor"
                value={editVendedor}
                onChange={(e) => setEditVendedor(e.target.value)}
                className="w-full p-2 border rounded-md"
              >
                <option value="">Selecione um vendedor</option>
                <option value="Cleonice">Cleonice</option>
                <option value="Luciano">Luciano</option>
                <option value="Vanuza">Vanuza</option>
                <option value="Thuanny">Thuanny</option>
              </select>
            </div>
            <div>
              <Label htmlFor="edit-tipoTransacao">Tipo de Transação</Label>
              <Select value={editTipoTransacao} onValueChange={(value: any) => setEditTipoTransacao(value)}>
                <SelectTrigger id="edit-tipoTransacao">
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
            <div>
              <Label htmlFor="edit-quantidade">Quantidade</Label>
              <input
                id="edit-quantidade"
                type="number"
                min="1"
                value={editQuantidade}
                onChange={(e) => setEditQuantidade(parseInt(e.target.value) || 0)}
                className="w-full p-2 border rounded-md"
              />
            </div>
            <div>
              <Label htmlFor="edit-observacoes">Observações</Label>
              <Textarea
                id="edit-observacoes"
                value={editObservacoes}
                onChange={(e) => setEditObservacoes(e.target.value)}
                placeholder="Cores, especificações, nome do cliente, número do pedido..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingVenda(null)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleEditar}
              disabled={editarMutation.isPending || editQuantidade < 1}
            >
              {editarMutation.isPending ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de Cancelamento */}
      <Dialog open={!!cancelingVenda} onOpenChange={() => {
        setCancelingVenda(null);
        setMotivoCancelamento("");
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar Venda</DialogTitle>
            <DialogDescription>
              Esta ação irá restaurar o estoque do produto. Informe o motivo do cancelamento.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {cancelingVenda && (
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm font-medium">Detalhes da Venda</p>
                <p className="text-sm text-muted-foreground">
                  Produto: {cancelingVenda.productName}
                </p>
                <p className="text-sm text-muted-foreground">
                  Quantidade: {cancelingVenda.quantidade}
                </p>
                <p className="text-sm text-muted-foreground">
                  Data: {format(new Date(cancelingVenda.dataVenda), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                </p>
              </div>
            )}
            <div>
              <Label htmlFor="motivo">Motivo do Cancelamento *</Label>
              <Textarea
                id="motivo"
                value={motivoCancelamento}
                onChange={(e) => setMotivoCancelamento(e.target.value)}
                placeholder="Ex: Produto com defeito, cliente desistiu da compra, erro no registro..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setCancelingVenda(null);
              setMotivoCancelamento("");
            }}>
              Voltar
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleCancelar}
              disabled={cancelarMutation.isPending || !motivoCancelamento.trim()}
            >
              {cancelarMutation.isPending ? "Cancelando..." : "Confirmar Cancelamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de Exclusão */}
      <Dialog open={!!deletingVenda} onOpenChange={() => setDeletingVenda(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir Venda</DialogTitle>
            <DialogDescription>
              Esta ação irá excluir permanentemente a venda e restaurar o estoque do produto. Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {deletingVenda && (
              <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                <p className="text-sm font-medium text-destructive">Atenção: Esta ação é irreversível!</p>
                <div className="mt-2 space-y-1">
                  <p className="text-sm text-muted-foreground">
                    Produto: <span className="font-medium">{deletingVenda.productName}</span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Quantidade: <span className="font-medium">{deletingVenda.quantidade}</span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Data: <span className="font-medium">{format(new Date(deletingVenda.dataVenda), "dd/MM/yyyy HH:mm", { locale: ptBR })}</span>
                  </p>
                  {deletingVenda.vendedor && (
                    <p className="text-sm text-muted-foreground">
                      Vendedor: <span className="font-medium">{deletingVenda.vendedor}</span>
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingVenda(null)}>
              Cancelar
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => {
                if (deletingVenda) {
                  excluirMutation.mutate({ vendaId: deletingVenda.id });
                }
              }}
              disabled={excluirMutation.isPending}
            >
              {excluirMutation.isPending ? "Excluindo..." : "Confirmar Exclusão"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
