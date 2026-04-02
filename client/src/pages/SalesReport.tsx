import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileDown, FileSpreadsheet, Filter } from "lucide-react";
import { downloadFileFromUrl } from "@/lib/download";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function toStartOfDay(value: string) {
  return value ? new Date(`${value}T00:00:00`) : undefined;
}

function toEndOfDay(value: string) {
  return value ? new Date(`${value}T23:59:59.999`) : undefined;
}

export default function SalesReport() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [vendedor, setVendedor] = useState("Todos");
  const [nomeCliente, setNomeCliente] = useState("");
  const [appliedFilters, setAppliedFilters] = useState({
    startDate: "",
    endDate: "",
    vendedor: "Todos",
    nomeCliente: "",
  });
  const sellersQuery = trpc.catalogo.listSellers.useQuery(undefined, {
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const vendedores = ["Todos", ...(sellersQuery.data ?? []).map((item) => item.nome)];

  const { data: vendas, isLoading } = trpc.vendas.relatorio.useQuery({
    startDate: toStartOfDay(appliedFilters.startDate),
    endDate: toEndOfDay(appliedFilters.endDate),
    vendedor: appliedFilters.vendedor !== "Todos" ? appliedFilters.vendedor : undefined,
    nomeCliente: appliedFilters.nomeCliente || undefined,
  });

  const exportPdfMutation = trpc.vendas.exportarRelatorioPdf.useMutation({
    onSuccess: async (data) => {
      try {
        await downloadFileFromUrl(data.url, {
          fileName: `relatorio-vendas-${new Date().toISOString().split("T")[0]}.pdf`,
        });
        toast.success("Relatório PDF exportado com sucesso!");
      } catch (error) {
        toast.error("Erro ao baixar PDF");
        window.open(data.url, "_blank", "noopener,noreferrer");
      }
    },
    onError: (error) => {
      toast.error("Erro ao exportar PDF: " + error.message);
    },
  });

  const exportExcelMutation = trpc.vendas.exportarRelatorioExcel.useMutation({
    onSuccess: async (data) => {
      try {
        await downloadFileFromUrl(data.url, {
          fileName: `relatorio-vendas-${new Date().toISOString().split("T")[0]}.xlsx`,
        });
        toast.success("Relatório Excel exportado com sucesso!");
      } catch (error) {
        toast.error("Erro ao baixar Excel");
        window.open(data.url, "_blank", "noopener,noreferrer");
      }
    },
    onError: (error) => {
      toast.error("Erro ao exportar Excel: " + error.message);
    },
  });

  const handleFilter = () => {
    setAppliedFilters({
      startDate,
      endDate,
      vendedor,
      nomeCliente,
    });
  };

  const handleExportPdf = () => {
    exportPdfMutation.mutate({
      startDate: toStartOfDay(appliedFilters.startDate),
      endDate: toEndOfDay(appliedFilters.endDate),
      vendedor: appliedFilters.vendedor !== "Todos" ? appliedFilters.vendedor : undefined,
      nomeCliente: appliedFilters.nomeCliente || undefined,
    });
  };

  const handleExportExcel = () => {
    exportExcelMutation.mutate({
      startDate: toStartOfDay(appliedFilters.startDate),
      endDate: toEndOfDay(appliedFilters.endDate),
      vendedor: appliedFilters.vendedor !== "Todos" ? appliedFilters.vendedor : undefined,
      nomeCliente: appliedFilters.nomeCliente || undefined,
    });
  };

  const totalVendas = vendas?.reduce((sum, v) => sum + v.quantidade, 0) || 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Relatório de Vendas</h1>
        <p className="text-muted-foreground mt-2">Visualize e exporte relatórios detalhados de vendas</p>
      </div>

      <Card className="border-border shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filtros
          </CardTitle>
          <CardDescription>Filtre as vendas por período, vendedor ou cliente</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">Data Início</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="endDate">Data Fim</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="vendedor">Vendedor</Label>
              <Select value={vendedor} onValueChange={setVendedor}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {vendedores.map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="nomeCliente">Nome do Cliente</Label>
              <Input
                id="nomeCliente"
                type="text"
                placeholder="Digite o nome..."
                value={nomeCliente}
                onChange={(e) => setNomeCliente(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={handleFilter} className="gap-2 w-full sm:w-auto">
              <Filter className="h-4 w-4" />
              Aplicar Filtros
            </Button>
            <Button onClick={handleExportPdf} variant="outline" className="gap-2 w-full sm:w-auto" disabled={exportPdfMutation.isPending}>
              <FileDown className="h-4 w-4" />
              {exportPdfMutation.isPending ? "Gerando..." : "Exportar PDF"}
            </Button>
            <Button onClick={handleExportExcel} variant="outline" className="gap-2 w-full sm:w-auto" disabled={exportExcelMutation.isPending}>
              <FileSpreadsheet className="h-4 w-4" />
              {exportExcelMutation.isPending ? "Gerando..." : "Exportar Excel"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border shadow-sm">
        <CardHeader>
          <CardTitle>Resultados</CardTitle>
          <CardDescription>
            {vendas?.length || 0} venda(s) encontrada(s) • Total: {totalVendas} unidade(s)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
          ) : vendas && vendas.length > 0 ? (
            <div className="rounded-md border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead>Medida</TableHead>
                    <TableHead>Marca</TableHead>
                    <TableHead>Quantidade</TableHead>
                    <TableHead>Vendedor</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Observações</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vendas.map((venda) => (
                    <TableRow key={venda.id}>
                      <TableCell>{new Date(venda.dataVenda).toLocaleDateString('pt-BR')}</TableCell>
                      <TableCell className="font-medium max-w-[16rem] truncate" title={venda.productName}>
                        {venda.productName}
                      </TableCell>
                      <TableCell>{venda.medida}</TableCell>
                      <TableCell>{venda.marca || "-"}</TableCell>
                      <TableCell>{venda.quantidade}</TableCell>
                      <TableCell>{venda.vendedor || "-"}</TableCell>
                      <TableCell className="max-w-[14rem] truncate" title={venda.nomeCliente || "-"}>
                        {venda.nomeCliente || "-"}
                      </TableCell>
                      <TableCell className="max-w-xs truncate">{venda.observacoes || "-"}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                          venda.status === "concluida" 
                            ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
                            : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"
                        }`}>
                          {venda.status === "concluida" ? "Concluída" : "Cancelada"}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <p>Nenhuma venda encontrada com os filtros aplicados</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
