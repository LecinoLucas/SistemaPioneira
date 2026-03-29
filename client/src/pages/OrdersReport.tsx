import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileDown, FileSpreadsheet, Filter, Package } from "lucide-react";
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

export default function OrdersReport() {
  const [nomeCliente, setNomeCliente] = useState("");
  const [appliedNomeCliente, setAppliedNomeCliente] = useState("");

  const { data: encomendas, isLoading } = trpc.vendas.relatorioEncomendas.useQuery({
    nomeCliente: appliedNomeCliente || undefined,
  });

  const exportPdfMutation = trpc.vendas.exportarEncomendasPdf.useMutation({
    onSuccess: async (data) => {
      try {
        await downloadFileFromUrl(data.url, {
          fileName: `relatorio-encomendas-${new Date().toISOString().split("T")[0]}.pdf`,
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

  const exportExcelMutation = trpc.vendas.exportarEncomendasExcel.useMutation({
    onSuccess: async (data) => {
      try {
        await downloadFileFromUrl(data.url, {
          fileName: `relatorio-encomendas-${new Date().toISOString().split("T")[0]}.xlsx`,
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
    setAppliedNomeCliente(nomeCliente);
  };

  const handleExportPdf = () => {
    exportPdfMutation.mutate({
      nomeCliente: appliedNomeCliente || undefined,
    });
  };

  const handleExportExcel = () => {
    exportExcelMutation.mutate({
      nomeCliente: appliedNomeCliente || undefined,
    });
  };

  const totalEncomendas = encomendas?.reduce((sum, e) => sum + Math.abs(e.quantidade), 0) || 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Relatório de Encomendas</h1>
        <p className="text-muted-foreground mt-2">Produtos vendidos com estoque negativo (encomendas pendentes)</p>
      </div>

      <Card className="border-border shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filtros
          </CardTitle>
          <CardDescription>Filtre as encomendas por cliente</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <div className="flex-1 space-y-2">
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

          <div className="flex gap-2">
            <Button onClick={handleFilter} className="gap-2">
              <Filter className="h-4 w-4" />
              Aplicar Filtros
            </Button>
            <Button onClick={handleExportPdf} variant="outline" className="gap-2" disabled={exportPdfMutation.isPending}>
              <FileDown className="h-4 w-4" />
              {exportPdfMutation.isPending ? "Gerando..." : "Exportar PDF"}
            </Button>
            <Button onClick={handleExportExcel} variant="outline" className="gap-2" disabled={exportExcelMutation.isPending}>
              <FileSpreadsheet className="h-4 w-4" />
              {exportExcelMutation.isPending ? "Gerando..." : "Exportar Excel"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Encomendas Pendentes
          </CardTitle>
          <CardDescription>
            {encomendas?.length || 0} encomenda(s) encontrada(s) • Total: {totalEncomendas} unidade(s) a repor
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
          ) : encomendas && encomendas.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data da Venda</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead>Medida</TableHead>
                    <TableHead>Marca</TableHead>
                    <TableHead>Qtd. Vendida</TableHead>
                    <TableHead>Estoque Atual</TableHead>
                    <TableHead>Faltam</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Observações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {encomendas.map((encomenda) => (
                    <TableRow key={encomenda.id}>
                      <TableCell>{new Date(encomenda.dataVenda).toLocaleDateString('pt-BR')}</TableCell>
                      <TableCell className="font-medium">{encomenda.productName}</TableCell>
                      <TableCell>{encomenda.medida}</TableCell>
                      <TableCell>{encomenda.marca || "-"}</TableCell>
                      <TableCell>{encomenda.quantidade}</TableCell>
                      <TableCell>
                        <span className="text-red-600 dark:text-red-400 font-semibold">
                          {encomenda.estoqueAtual}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-red-600 dark:text-red-400 font-semibold">
                          {Math.abs(encomenda.estoqueAtual)} unidade(s)
                        </span>
                      </TableCell>
                      <TableCell>{encomenda.nomeCliente || "-"}</TableCell>
                      <TableCell className="max-w-xs truncate">{encomenda.observacoes || "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhuma encomenda pendente encontrada</p>
              <p className="text-sm mt-2">Todas as vendas possuem estoque disponível</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
