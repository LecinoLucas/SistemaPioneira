import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Calendar } from "lucide-react";
import { Input } from "@/components/ui/input";


export default function Rankings() {
  const [periodo, setPeriodo] = useState<"mes" | "30dias" | "personalizado">("mes");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");

  // Calculate date range based on period
  const dateRange = useMemo(() => {
    const now = new Date();
    let startDate: Date;
    let endDate: Date = now;

    if (periodo === "mes") {
      // Current month
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (periodo === "30dias") {
      // Last 30 days
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    } else {
      // Custom period
      if (!dataInicio || !dataFim) return undefined;
      startDate = new Date(dataInicio);
      endDate = new Date(dataFim);
    }

    return { startDate, endDate };
  }, [periodo, dataInicio, dataFim]);

  const { data: rankingVendedores, isLoading: loadingVendedores } = trpc.vendas.rankingVendedores.useQuery(
    dateRange || { startDate: undefined, endDate: undefined },
    { enabled: !!dateRange }
  );

  const { data: rankingProdutos, isLoading: loadingProdutos } = trpc.vendas.rankingProdutos.useQuery(
    dateRange || { startDate: undefined, endDate: undefined },
    { enabled: !!dateRange }
  );

  const maxQuantidadeVendedor = useMemo(() => {
    if (!rankingVendedores || rankingVendedores.length === 0) return 0;
    return Math.max(...rankingVendedores.map(v => v.quantidadeTotal));
  }, [rankingVendedores]);

  const maxQuantidadeProduto = useMemo(() => {
    if (!rankingProdutos || rankingProdutos.length === 0) return 0;
    return Math.max(...rankingProdutos.map(p => p.quantidadeTotal));
  }, [rankingProdutos]);

  return (
    <div className="container py-6 space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">Rankings</h1>
        <p className="text-muted-foreground">Análise de desempenho de vendedores e produtos</p>
      </div>

      {/* Filtros de Período */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Período de Análise
          </CardTitle>
          <CardDescription>Selecione o período para visualizar os rankings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button
              variant={periodo === "mes" ? "default" : "outline"}
              onClick={() => setPeriodo("mes")}
            >
              Mês Atual
            </Button>
            <Button
              variant={periodo === "30dias" ? "default" : "outline"}
              onClick={() => setPeriodo("30dias")}
            >
              Últimos 30 Dias
            </Button>
            <Button
              variant={periodo === "personalizado" ? "default" : "outline"}
              onClick={() => setPeriodo("personalizado")}
            >
              Personalizado
            </Button>
          </div>

          {periodo === "personalizado" && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="dataInicio">Data Início</Label>
                <Input
                  id="dataInicio"
                  type="date"
                  value={dataInicio}
                  onChange={(e) => setDataInicio(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dataFim">Data Fim</Label>
                <Input
                  id="dataFim"
                  type="date"
                  value={dataFim}
                  onChange={(e) => setDataFim(e.target.value)}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Ranking de Vendedores */}
      <Card>
        <CardHeader>
          <CardTitle>🏆 Ranking de Vendedores</CardTitle>
          <CardDescription>
            Desempenho dos vendedores no período selecionado
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingVendedores ? (
            <div className="text-center py-8 text-muted-foreground">Carregando...</div>
          ) : !rankingVendedores || rankingVendedores.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhuma venda encontrada no período selecionado
            </div>
          ) : (
            <div className="space-y-4">
              {rankingVendedores.map((vendedor) => (
                <div key={vendedor.vendedor} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`
                        flex items-center justify-center w-8 h-8 rounded-full font-bold
                        ${vendedor.posicao === 1 ? "bg-yellow-500 text-yellow-950" : ""}
                        ${vendedor.posicao === 2 ? "bg-gray-400 text-gray-900" : ""}
                        ${vendedor.posicao === 3 ? "bg-orange-600 text-orange-50" : ""}
                        ${vendedor.posicao > 3 ? "bg-muted text-muted-foreground" : ""}
                      `}>
                        {vendedor.posicao}
                      </div>
                      <div>
                        <p className="font-semibold">{vendedor.vendedor}</p>
                        <p className="text-sm text-muted-foreground">
                          {vendedor.totalVendas} vendas
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold">{vendedor.quantidadeTotal}</p>
                      <p className="text-sm text-muted-foreground">unidades</p>
                    </div>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        vendedor.posicao === 1 ? "bg-yellow-500" :
                        vendedor.posicao === 2 ? "bg-gray-400" :
                        vendedor.posicao === 3 ? "bg-orange-600" :
                        "bg-primary"
                      }`}
                      style={{ width: `${(vendedor.quantidadeTotal / maxQuantidadeVendedor) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Ranking de Produtos */}
      <Card>
        <CardHeader>
          <CardTitle>📦 Ranking de Produtos Mais Vendidos</CardTitle>
          <CardDescription>
            Top 20 produtos com maior saída no período
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingProdutos ? (
            <div className="text-center py-8 text-muted-foreground">Carregando...</div>
          ) : !rankingProdutos || rankingProdutos.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhuma venda encontrada no período selecionado
            </div>
          ) : (
            <div className="space-y-3">
              {rankingProdutos.map((produto) => (
                <div key={produto.productId} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className={`
                        flex items-center justify-center w-7 h-7 rounded-full font-bold text-sm shrink-0
                        ${produto.posicao === 1 ? "bg-yellow-500 text-yellow-950" : ""}
                        ${produto.posicao === 2 ? "bg-gray-400 text-gray-900" : ""}
                        ${produto.posicao === 3 ? "bg-orange-600 text-orange-50" : ""}
                        ${produto.posicao > 3 ? "bg-muted text-muted-foreground" : ""}
                      `}>
                        {produto.posicao}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold truncate">{produto.nome}</p>
                        <p className="text-sm text-muted-foreground">
                          {produto.marca} • {produto.medida} • {produto.categoria}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-4">
                      <p className="text-xl font-bold">{produto.quantidadeTotal}</p>
                      <p className="text-xs text-muted-foreground">{produto.totalVendas} vendas</p>
                    </div>
                  </div>
                  <div className="w-full bg-muted rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all ${
                        produto.posicao === 1 ? "bg-yellow-500" :
                        produto.posicao === 2 ? "bg-gray-400" :
                        produto.posicao === 3 ? "bg-orange-600" :
                        "bg-primary"
                      }`}
                      style={{ width: `${(produto.quantidadeTotal / maxQuantidadeProduto) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
