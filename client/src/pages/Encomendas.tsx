import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Package, Plus, Edit, Trash2, AlertCircle, Clock, FileText } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";

// Helper function to add business days
function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date);
  let addedDays = 0;
  
  while (addedDays < days) {
    result.setDate(result.getDate() + 1);
    // Skip weekends (0 = Sunday, 6 = Saturday)
    if (result.getDay() !== 0 && result.getDay() !== 6) {
      addedDays++;
    }
  }
  
  return result;
}

// Helper function to calculate business days remaining
function getBusinessDaysRemaining(targetDate: Date): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(targetDate);
  target.setHours(0, 0, 0, 0);
  
  let days = 0;
  const current = new Date(now);
  
  while (current < target) {
    current.setDate(current.getDate() + 1);
    if (current.getDay() !== 0 && current.getDay() !== 6) {
      days++;
    }
  }
  
  return days;
}

// Helper function to get status badge
function getDeadlineBadge(dataEntrega: Date, status: string) {
  if (status === "entregue" || status === "cancelado") {
    return null;
  }
  
  const daysRemaining = getBusinessDaysRemaining(new Date(dataEntrega));
  
  if (daysRemaining < 0) {
    return <Badge variant="destructive" className="ml-2"><AlertCircle className="w-3 h-3 mr-1" />Vencido</Badge>;
  } else if (daysRemaining <= 3) {
    return <Badge variant="outline" className="ml-2 border-yellow-500 text-yellow-700"><Clock className="w-3 h-3 mr-1" />{daysRemaining} dias</Badge>;
  } else {
    return <Badge variant="outline" className="ml-2 border-green-500 text-green-700"><Clock className="w-3 h-3 mr-1" />{daysRemaining} dias</Badge>;
  }
}

export default function Encomendas() {
  const { user } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [isCustomProduct, setIsCustomProduct] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [productSearch, setProductSearch] = useState("");
  const [clienteFilter, setClienteFilter] = useState("");
  
  // Form states
  const [selectedProductId, setSelectedProductId] = useState<number | undefined>();
  const [customNome, setCustomNome] = useState("");
  const [customMedida, setCustomMedida] = useState("");
  const [quantidade, setQuantidade] = useState(1);
  const [nomeCliente, setNomeCliente] = useState("");
  const [telefoneCliente, setTelefoneCliente] = useState("");
  const [dataCompra, setDataCompra] = useState("");
  const [metodoEntrega, setMetodoEntrega] = useState<"prazo" | "data">("prazo"); // prazo = dias úteis, data = data específica
  const [prazoEntregaDias, setPrazoEntregaDias] = useState(15);
  const [dataEntrega, setDataEntrega] = useState("");
  const [observacoes, setObservacoes] = useState("");
  
  // Edit states
  const [editId, setEditId] = useState<number | null>(null);
  const [editStatus, setEditStatus] = useState("");
  const [editDataEntrega, setEditDataEntrega] = useState("");
  const [editObservacoes, setEditObservacoes] = useState("");
  
  const { data: encomendas, refetch } = trpc.encomendas.list.useQuery({ 
    status: statusFilter === "todos" ? undefined : statusFilter as any,
    cliente: clienteFilter || undefined 
  });
  const productSearchTerm = productSearch.trim();
  const { data: products, isLoading: loadingProducts } = trpc.products.list.useQuery(
    {
      searchTerm: productSearchTerm || undefined,
      page: 1,
      pageSize: 30,
    },
    {
      enabled: showModal && !isCustomProduct,
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      placeholderData: (prev) => prev,
    }
  );
  const filteredProductOptions = useMemo(() => {
    const term = productSearchTerm.toLowerCase();
    return (products?.items ?? []).filter(
      (p) => p.name.toLowerCase().includes(term) || p.medida?.toLowerCase().includes(term)
    );
  }, [productSearchTerm, products?.items]);
  const createMutation = trpc.encomendas.create.useMutation();
  const updateMutation = trpc.encomendas.update.useMutation();
  const deleteMutation = trpc.encomendas.delete.useMutation();
  const exportPdfMutation = trpc.encomendas.exportPdf.useMutation();
  
  const handleExportPdf = async () => {
    try {
      const result = await exportPdfMutation.mutateAsync({
        status: statusFilter === "todos" ? undefined : statusFilter,
        cliente: clienteFilter || undefined,
      });
      
      // Download PDF using fetch to avoid CORS issues
      const response = await fetch(result.url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `encomendas-${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast.success("PDF exportado com sucesso!");
    } catch (error) {
      console.error("Erro ao exportar PDF:", error);
      toast.error("Erro ao exportar PDF");
    }
  };
  
  const handleCreate = async () => {
    if (!nomeCliente) {
      toast.error("Nome do cliente é obrigatório");
      return;
    }
    
    if (!isCustomProduct && !selectedProductId) {
      toast.error("Selecione um produto ou ative 'Produto Personalizado'");
      return;
    }
    
    if (isCustomProduct && (!customNome || !customMedida)) {
      toast.error("Nome e medida são obrigatórios para produtos personalizados");
      return;
    }
    
    try {
      await createMutation.mutateAsync({
        productId: isCustomProduct ? undefined : selectedProductId,
        nomeProduto: isCustomProduct ? customNome : undefined,
        medidaProduto: isCustomProduct ? customMedida : undefined,
        quantidade,
        nomeCliente,
        telefoneCliente: telefoneCliente || undefined,
        dataCompra: dataCompra ? new Date(dataCompra) : undefined,
        prazoEntregaDias: metodoEntrega === "prazo" ? prazoEntregaDias : undefined,
        dataEntrega: metodoEntrega === "data" && dataEntrega ? new Date(dataEntrega) : undefined,
        observacoes: observacoes || undefined,
      });
      
      toast.success("Encomenda criada com sucesso!");
      setShowModal(false);
      resetForm();
      refetch();
    } catch (error: any) {
      toast.error(error.message || "Erro ao criar encomenda");
    }
  };
  
  const handleUpdate = async () => {
    if (!editId) return;
    
    try {
      await updateMutation.mutateAsync({
        id: editId,
        status: editStatus as any,
        dataEntrega: editDataEntrega ? new Date(editDataEntrega) : undefined,
        observacoes: editObservacoes,
      });
      
      toast.success("Encomenda atualizada!");
      setShowEditModal(false);
      refetch();
    } catch (error: any) {
      toast.error(error.message || "Erro ao atualizar encomenda");
    }
  };
  
  const handleDelete = async (id: number) => {
    if (!confirm("Deseja realmente excluir esta encomenda?")) return;
    
    try {
      await deleteMutation.mutateAsync({ id });
      toast.success("Encomenda excluída!");
      refetch();
    } catch (error: any) {
      toast.error(error.message || "Erro ao excluir encomenda");
    }
  };
  
  const openEditModal = (enc: any) => {
    setEditId(enc.id);
    setEditStatus(enc.status);
    setEditDataEntrega(new Date(enc.dataEntrega).toISOString().split('T')[0]);
    setEditObservacoes(enc.observacoes || "");
    setShowEditModal(true);
  };
  
  const resetForm = () => {
    setIsCustomProduct(false);
    setSelectedProductId(undefined);
    setCustomNome("");
    setCustomMedida("");
    setQuantidade(1);
    setNomeCliente("");
    setTelefoneCliente("");
    setDataCompra("");
    setMetodoEntrega("prazo");
    setPrazoEntregaDias(15);
    setDataEntrega("");
    setObservacoes("");
  };
  
  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      pendente: "secondary",
      em_producao: "default",
      pronto: "outline",
      entregue: "default",
      cancelado: "destructive",
    };
    
    const labels: Record<string, string> = {
      pendente: "Pendente",
      em_producao: "Em Produção",
      pronto: "Pronto",
      entregue: "Entregue",
      cancelado: "Cancelado",
    };
    
    return <Badge variant={variants[status]}>{labels[status]}</Badge>;
  };
  
  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Relatório de Encomendas</h1>
          <p className="text-muted-foreground mt-1">Gerencie produtos sob encomenda</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => {
            const defaultDate = addBusinessDays(new Date(), 15);
            setDataEntrega(defaultDate.toISOString().split('T')[0]);
            setShowModal(true);
          }}>
            <Plus className="w-4 h-4 mr-2" />
            Nova Encomenda
          </Button>
          <Button 
            variant="outline" 
            onClick={handleExportPdf}
            disabled={exportPdfMutation.isPending}
          >
            <FileText className="w-4 h-4 mr-2" />
            {exportPdfMutation.isPending ? "Exportando..." : "Exportar PDF"}
          </Button>
        </div>
      </div>
      
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="flex-1">
              <Label>Filtrar por Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="em_producao">Em Produção</SelectItem>
                  <SelectItem value="pronto">Pronto</SelectItem>
                  <SelectItem value="entregue">Entregue</SelectItem>
                  <SelectItem value="cancelado">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Label>Filtrar por Cliente</Label>
              <Input 
                value={clienteFilter} 
                onChange={(e) => setClienteFilter(e.target.value)} 
                placeholder="Digite o nome do cliente..."
              />
            </div>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Encomendas ({encomendas?.length || 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">Produto</th>
                  <th className="text-left p-2">Cliente</th>
                  <th className="text-left p-2">Quantidade</th>
                  <th className="text-left p-2">Data Entrega</th>
                  <th className="text-left p-2">Status</th>
                  <th className="text-left p-2">Pedido Feito</th>
                  <th className="text-left p-2">Ações</th>
                </tr>
              </thead>
              <tbody>
                {encomendas?.map((enc) => (
                  <tr key={enc.id} className="border-b hover:bg-muted/50">
                    <td className="p-2">
                      <div>
                        <div className="font-medium">{enc.produtoNome}</div>
                        <div className="text-sm text-muted-foreground">{enc.produtoMedida}</div>
                        {!enc.productId && <Badge variant="outline" className="mt-1">Personalizado</Badge>}
                      </div>
                    </td>
                    <td className="p-2">
                      <div>
                        <div>{enc.nomeCliente}</div>
                        {enc.telefoneCliente && <div className="text-sm text-muted-foreground">{enc.telefoneCliente}</div>}
                      </div>
                    </td>
                    <td className="p-2">{enc.quantidade}</td>
                    <td className="p-2">
                      <div className="flex items-center">
                        {new Date(enc.dataEntrega).toLocaleDateString('pt-BR')}
                        {getDeadlineBadge(new Date(enc.dataEntrega), enc.status)}
                      </div>
                    </td>
                    <td className="p-2">{getStatusBadge(enc.status)}</td>
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        <input 
                          type="checkbox" 
                          checked={enc.pedidoFeito || false}
                          onChange={async (e) => {
                            try {
                              await updateMutation.mutateAsync({
                                id: enc.id,
                                pedidoFeito: e.target.checked,
                              });
                              toast.success(e.target.checked ? "Pedido marcado como feito!" : "Marcação removida");
                              refetch();
                            } catch (error: any) {
                              toast.error(error.message || "Erro ao atualizar");
                            }
                          }}
                          className="w-4 h-4 cursor-pointer"
                        />
                        {enc.pedidoFeito && <Badge variant="default" className="bg-green-600">Feito</Badge>}
                      </div>
                    </td>
                    <td className="p-2">
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={() => openEditModal(enc)}>
                          <Edit className="w-4 h-4" />
                        </Button>
                        {user?.role === "admin" && (
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(enc.id)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {(!encomendas || encomendas.length === 0) && (
                  <tr>
                    <td colSpan={7} className="text-center p-8 text-muted-foreground">
                      Nenhuma encomenda encontrada
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      
      {/* Create Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nova Encomenda</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Switch checked={isCustomProduct} onCheckedChange={setIsCustomProduct} />
              <Label>Produto Personalizado</Label>
            </div>
            
            {!isCustomProduct ? (
              <div>
                <Label>Buscar Produto</Label>
                <Input 
                  value={productSearch} 
                  onChange={(e) => setProductSearch(e.target.value)} 
                  placeholder="Digite o nome do produto para buscar..."
                  className="mb-2"
                />
                <Label>Produto</Label>
                <Select value={selectedProductId?.toString()} onValueChange={(v) => setSelectedProductId(Number(v))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um produto" />
                  </SelectTrigger>
                  <SelectContent>
                    {loadingProducts ? (
                      <div className="p-2 text-sm text-muted-foreground text-center">Carregando produtos...</div>
                    ) : (
                      filteredProductOptions.map((p) => (
                        <SelectItem key={p.id} value={p.id.toString()}>
                          {p.name} - {p.medida}
                        </SelectItem>
                      ))
                    )}
                    {filteredProductOptions.length === 0 && !loadingProducts && (
                      <div className="p-2 text-sm text-muted-foreground text-center">Nenhum produto encontrado</div>
                    )}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <>
                <div>
                  <Label>Nome do Produto</Label>
                  <Input value={customNome} onChange={(e) => setCustomNome(e.target.value)} placeholder="Ex: Colchão Especial" />
                </div>
                <div>
                  <Label>Medida</Label>
                  <Input value={customMedida} onChange={(e) => setCustomMedida(e.target.value)} placeholder="Ex: Queen" />
                </div>
              </>
            )}
            
            <div>
              <Label>Quantidade</Label>
              <Input type="number" min={1} value={quantidade} onChange={(e) => setQuantidade(Number(e.target.value))} />
            </div>
            
            <div>
              <Label>Nome do Cliente</Label>
              <Input value={nomeCliente} onChange={(e) => setNomeCliente(e.target.value)} />
            </div>
            
            <div>
              <Label>Telefone do Cliente</Label>
              <Input value={telefoneCliente} onChange={(e) => setTelefoneCliente(e.target.value)} placeholder="(00) 00000-0000" />
            </div>
            
            <div>
              <Label>Data da Compra</Label>
              <Input type="date" value={dataCompra} onChange={(e) => setDataCompra(e.target.value)} />
            </div>
            
            <div>
              <Label>Método de Cálculo de Entrega</Label>
              <Select value={metodoEntrega} onValueChange={(v: "prazo" | "data") => setMetodoEntrega(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="prazo">Prazo em dias úteis</SelectItem>
                  <SelectItem value="data">Data específica</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {metodoEntrega === "prazo" && (
              <div>
                <Label>Prazo de Entrega (dias úteis)</Label>
                <Input 
                  type="number" 
                  min="1" 
                  value={prazoEntregaDias} 
                  onChange={(e) => setPrazoEntregaDias(Number(e.target.value))} 
                  placeholder="Ex: 10, 15, 20"
                />
                <p className="text-sm text-muted-foreground mt-1">
                  Data de entrega será calculada automaticamente
                </p>
              </div>
            )}
            
            {metodoEntrega === "data" && (
              <div>
                <Label>Data de Entrega Específica</Label>
                <Input type="date" value={dataEntrega} onChange={(e) => setDataEntrega(e.target.value)} />
              </div>
            )}
            
            <div>
              <Label>Observações</Label>
              <Textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={3} />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancelar</Button>
            <Button onClick={handleCreate}>Criar Encomenda</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Edit Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Encomenda</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>Status</Label>
              <Select value={editStatus} onValueChange={setEditStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="em_producao">Em Produção</SelectItem>
                  <SelectItem value="pronto">Pronto</SelectItem>
                  <SelectItem value="entregue">Entregue</SelectItem>
                  <SelectItem value="cancelado">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label>Data de Entrega</Label>
              <Input type="date" value={editDataEntrega} onChange={(e) => setEditDataEntrega(e.target.value)} />
            </div>
            
            <div>
              <Label>Observações</Label>
              <Textarea value={editObservacoes} onChange={(e) => setEditObservacoes(e.target.value)} rows={3} />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditModal(false)}>Cancelar</Button>
            <Button onClick={handleUpdate}>Salvar Alterações</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
