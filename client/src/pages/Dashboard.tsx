import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { API_BASE_URL } from "@/const";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Package, TrendingDown, Activity, FileDown, FileSpreadsheet, Server, Database, Timer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";

const DashboardCharts = lazy(() => import("@/components/dashboard/DashboardCharts"));
const LATENCY_WARN_MS = 800;
const LATENCY_WARN_COOLDOWN_MS = 2 * 60 * 1000;

type HealthSnapshot = {
  ok: boolean;
  ready?: boolean;
  timestamp?: string;
  uptimeMs?: number;
  db?: {
    status?: "up" | "down" | "unconfigured";
    latencyMs?: number | null;
  };
};

export default function Dashboard() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const canViewStockAlerts = user?.role === "admin" || user?.role === "gerente";
  const [showReplenishmentModal, setShowReplenishmentModal] = useState(false);
  const [showEncomendasModal, setShowEncomendasModal] = useState(false);
  const [enableInsights, setEnableInsights] = useState(false);
  const [insightsInView, setInsightsInView] = useState(false);
  const [health, setHealth] = useState<HealthSnapshot | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [apiLatencyMs, setApiLatencyMs] = useState<number | null>(null);
  const prevApiDownRef = useRef(false);
  const prevDbDownRef = useRef(false);
  const prevApiHighLatencyRef = useRef(false);
  const prevDbHighLatencyRef = useRef(false);
  const lastApiLatencyWarnAtRef = useRef(0);
  const lastDbLatencyWarnAtRef = useRef(0);
  const insightsAnchorRef = useRef<HTMLDivElement | null>(null);
  
  const queryOptions = { staleTime: 60_000, refetchOnWindowFocus: false };
  const { data: stats, isLoading: statsLoading } = trpc.dashboard.stats.useQuery(undefined, queryOptions);
  const { data: lowStock, isLoading: lowStockLoading } = trpc.products.lowStock.useQuery(undefined, {
    ...queryOptions,
    enabled: canViewStockAlerts,
  });
  const exportQuery = trpc.export.getData.useQuery(undefined, {
    enabled: false,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  // Keep stable dates so query keys don't churn on rerenders
  const { startOfMonth, endOfMonth } = useMemo(() => {
    const now = new Date();
    return {
      startOfMonth: new Date(now.getFullYear(), now.getMonth(), 1),
      endOfMonth: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59),
    };
  }, []);

  const { data: topSelling } = trpc.dashboard.topSelling.useQuery(
    {
      startDate: startOfMonth,
      endDate: endOfMonth,
      limit: 5,
    },
    {
      ...queryOptions,
      enabled: enableInsights,
    }
  );
  
  // Get sales data for charts
  const { data: salesByDate } = trpc.dashboard.salesByDate.useQuery(
    {
      startDate: startOfMonth,
      endDate: endOfMonth,
    },
    {
      ...queryOptions,
      enabled: enableInsights,
    },
  );
  
  const { data: salesByCategory } = trpc.dashboard.salesByCategory.useQuery(
    {
      startDate: startOfMonth,
      endDate: endOfMonth,
    },
    {
      ...queryOptions,
      enabled: enableInsights,
    },
  );
  
  const { data: salesByMedida } = trpc.dashboard.salesByMedida.useQuery(
    {
      startDate: startOfMonth,
      endDate: endOfMonth,
    },
    {
      ...queryOptions,
      enabled: enableInsights,
    },
  );
  
  const { data: replenishmentSuggestions } = trpc.dashboard.replenishmentSuggestions.useQuery(undefined, {
    ...queryOptions,
    enabled: showReplenishmentModal && canViewStockAlerts,
  });
  const { data: negativeStockProducts } = trpc.products.negativeStock.useQuery(undefined, {
    ...queryOptions,
    enabled: canViewStockAlerts && showEncomendasModal,
  });
  
  const handleExportPDF = async () => {
    const data = exportQuery.data ?? (await exportQuery.refetch()).data;
    if (!data) {
      toast.error("Dados não disponíveis para exportação");
      return;
    }
    const { exportToPDF } = await import("@/lib/exportUtils");
    exportToPDF(data);
    toast.success("Relatório PDF exportado com sucesso!");
  };

  const handleExportExcel = async () => {
    const data = exportQuery.data ?? (await exportQuery.refetch()).data;
    if (!data) {
      toast.error("Dados não disponíveis para exportação");
      return;
    }
    const { exportToExcel } = await import("@/lib/exportUtils");
    exportToExcel(data);
    toast.success("Relatório Excel exportado com sucesso!");
  };

  useEffect(() => {
    if (enableInsights) return;
    if (statsLoading || lowStockLoading) return;
    if (!insightsInView) return;
    setEnableInsights(true);
  }, [enableInsights, insightsInView, lowStockLoading, statsLoading]);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") {
      setInsightsInView(true);
      return;
    }
    const anchor = insightsAnchorRef.current;
    if (!anchor) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInsightsInView(true);
            observer.disconnect();
            break;
          }
        }
      },
      { rootMargin: "200px 0px" }
    );

    observer.observe(anchor);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isAdmin) {
      setHealthLoading(false);
      return;
    }

    let active = true;
    let timer: number | undefined;

    const fetchHealth = async () => {
      const startedAt = performance.now();
      try {
        const response = await fetch(`${API_BASE_URL}/api/health`, {
          credentials: "include",
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error(`health_http_${response.status}`);
        }
        const payload = (await response.json()) as HealthSnapshot;
        if (!active) return;
        setHealth(payload);
        setApiLatencyMs(Math.round(performance.now() - startedAt));
        setHealthError(null);
      } catch (error) {
        if (!active) return;
        setHealth(null);
        setApiLatencyMs(Math.round(performance.now() - startedAt));
        setHealthError(error instanceof Error ? error.message : "health_check_failed");
      } finally {
        if (active) setHealthLoading(false);
      }
    };

    void fetchHealth();
    timer = window.setInterval(() => {
      void fetchHealth();
    }, 15_000);

    return () => {
      active = false;
      if (timer) window.clearInterval(timer);
    };
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin || healthLoading) return;

    const apiDown = Boolean(healthError);
    const dbDown = health?.db?.status === "down";

    if (apiDown && !prevApiDownRef.current) {
      toast.error("API fora do ar", {
        description: "O frontend não está conseguindo comunicar com o servidor.",
      });
    }
    if (!apiDown && prevApiDownRef.current) {
      toast.success("API restabelecida");
    }
    prevApiDownRef.current = apiDown;

    if (dbDown && !prevDbDownRef.current) {
      toast.error("Banco de dados indisponível", {
        description: "API online, mas sem acesso ao banco no momento.",
      });
    }
    if (!dbDown && prevDbDownRef.current) {
      toast.success("Banco de dados restabelecido");
    }
    prevDbDownRef.current = dbDown;

    const now = Date.now();
    const apiHighLatency =
      !apiDown && apiLatencyMs != null && apiLatencyMs >= LATENCY_WARN_MS;
    const dbHighLatency =
      !dbDown &&
      health?.db?.latencyMs != null &&
      health.db.latencyMs >= LATENCY_WARN_MS;

    if (
      apiHighLatency &&
      (!prevApiHighLatencyRef.current ||
        now - lastApiLatencyWarnAtRef.current >= LATENCY_WARN_COOLDOWN_MS)
    ) {
      toast.warning("Latência alta na API", {
        description: `Tempo atual: ${apiLatencyMs} ms`,
      });
      lastApiLatencyWarnAtRef.current = now;
    }
    if (!apiHighLatency && prevApiHighLatencyRef.current) {
      toast.success("Latência da API normalizada");
    }
    prevApiHighLatencyRef.current = apiHighLatency;

    if (
      dbHighLatency &&
      (!prevDbHighLatencyRef.current ||
        now - lastDbLatencyWarnAtRef.current >= LATENCY_WARN_COOLDOWN_MS)
    ) {
      toast.warning("Latência alta no banco", {
        description: `Tempo atual: ${health?.db?.latencyMs ?? "-"} ms`,
      });
      lastDbLatencyWarnAtRef.current = now;
    }
    if (!dbHighLatency && prevDbHighLatencyRef.current) {
      toast.success("Latência do banco normalizada");
    }
    prevDbHighLatencyRef.current = dbHighLatency;
  }, [isAdmin, healthLoading, healthError, apiLatencyMs, health?.db?.status, health?.db?.latencyMs]);

  if (statsLoading || (canViewStockAlerts && lowStockLoading)) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground mt-2">Visão geral do seu estoque</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={handleExportPDF} variant="outline" className="gap-2 w-full sm:w-auto">
            <FileDown className="h-4 w-4" />
            Exportar PDF
          </Button>
          <Button onClick={handleExportExcel} variant="outline" className="gap-2 w-full sm:w-auto">
            <FileSpreadsheet className="h-4 w-4" />
            Exportar Excel
          </Button>
        </div>
      </div>

      {isAdmin && (
        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Server className="h-4 w-4" />
              Saúde do Sistema
            </CardTitle>
            <CardDescription>Monitoramento em tempo real da API e banco</CardDescription>
          </CardHeader>
          <CardContent>
            {healthLoading ? (
              <p className="text-sm text-muted-foreground">Verificando saúde do sistema...</p>
            ) : (
              <>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-lg border p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">API</span>
                      <Badge variant={healthError ? "destructive" : "default"}>
                        {healthError ? "offline" : "online"}
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm font-medium flex items-center gap-2">
                      <Timer className="h-4 w-4 text-muted-foreground" />
                      {apiLatencyMs != null ? `${apiLatencyMs} ms` : "-"}
                    </p>
                  </div>

                  <div className="rounded-lg border p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Banco</span>
                      <Badge
                        variant={
                          health?.db?.status === "up"
                            ? "default"
                            : health?.db?.status === "unconfigured"
                              ? "secondary"
                              : "destructive"
                        }
                      >
                        {health?.db?.status ?? "offline"}
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm font-medium flex items-center gap-2">
                      <Database className="h-4 w-4 text-muted-foreground" />
                      {health?.db?.latencyMs != null ? `${health.db.latencyMs} ms` : "-"}
                    </p>
                  </div>

                  <div className="rounded-lg border p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Uptime API</span>
                      <Badge variant={health?.ok ? "default" : "destructive"}>
                        {health?.ok ? "ok" : "erro"}
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm font-medium">
                      {health?.uptimeMs != null
                        ? `${Math.floor(health.uptimeMs / 1000)}s`
                        : "-"}
                    </p>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-5">
        <Card className="border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Produtos</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{stats?.totalProducts || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Produtos cadastrados</p>
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Itens em Estoque</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{stats?.totalItems || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Unidades totais</p>
          </CardContent>
        </Card>

        {canViewStockAlerts && (
          <Card 
            className="border-border shadow-sm border-destructive/50 cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => setShowReplenishmentModal(true)}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Estoque Baixo</CardTitle>
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{stats?.lowStockCount || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">Clique para ver detalhes</p>
            </CardContent>
          </Card>
        )}

        <Card className="border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Movimentações</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{stats?.recentMovements || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Últimas 24 horas</p>
          </CardContent>
        </Card>

        {canViewStockAlerts && (
          <Card 
            className="border-border shadow-sm border-purple-600/50 cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => setShowEncomendasModal(true)}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Encomendas</CardTitle>
              <Package className="h-4 w-4 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">{stats?.negativeStockCount || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">Clique para ver detalhes</p>
            </CardContent>
          </Card>
        )}
      </div>

      {topSelling && topSelling.length > 0 && (
        <Card className="border-border shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <TrendingDown className="h-5 w-5 text-accent" />
              Produtos Mais Vendidos do Mês
            </CardTitle>
            <CardDescription>
              Top 5 produtos com maior saída neste mês
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {topSelling.map((product, index) => (
                <div
                  key={product.productId}
                  className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border border-border"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-accent text-accent-foreground font-bold text-sm">
                      {index + 1}
                    </div>
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">{product.name}</p>
                      <div className="flex gap-2">
                        <Badge variant="outline" className="text-xs">
                          {product.medida}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {product.categoria}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-accent">
                      {product.quantidadeVendida}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      unidades vendidas
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div ref={insightsAnchorRef} />
      {enableInsights ? (
        <Suspense
          fallback={
            <div className="grid gap-6 md:grid-cols-2">
              <Card className="border-border shadow-md">
                <CardHeader>
                  <CardTitle className="text-foreground">Carregando gráficos...</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px] rounded-md bg-muted animate-pulse" />
                </CardContent>
              </Card>
            </div>
          }
        >
          <DashboardCharts
            salesByDate={salesByDate}
            salesByCategory={salesByCategory}
            salesByMedida={salesByMedida}
          />
        </Suspense>
      ) : null}

      {/* Modal de Sugestões de Reposição */}
      <Dialog open={showReplenishmentModal} onOpenChange={setShowReplenishmentModal}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-orange-600" />
              Sugestões de Reposição Automática
            </DialogTitle>
            <DialogDescription>
              Produtos que precisam ser repostos baseado no histórico de vendas
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-4">
            {replenishmentSuggestions && replenishmentSuggestions.length > 0 ? (
              replenishmentSuggestions.map((suggestion) => (
                <div
                  key={suggestion.productId}
                  className="p-4 rounded-lg bg-muted/50 border border-border"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <p className="font-medium text-foreground">{suggestion.name}</p>
                        <Badge 
                          variant={suggestion.prioridade === "alta" ? "destructive" : "default"}
                          className={suggestion.prioridade === "media" ? "bg-orange-600" : ""}
                        >
                          {suggestion.prioridade === "alta" ? "Prioridade Alta" : 
                           suggestion.prioridade === "media" ? "Prioridade Média" : "Prioridade Baixa"}
                        </Badge>
                      </div>
                      <div className="flex gap-2 mb-2">
                        <Badge variant="outline" className="text-xs">
                          {suggestion.medida}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {suggestion.categoria}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">Estoque atual: </span>
                          <span className="font-medium text-foreground">{suggestion.quantidadeAtual}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Média diária: </span>
                          <span className="font-medium text-foreground">{suggestion.mediaDiaria}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Dias restantes: </span>
                          <span className={`font-medium ${
                            suggestion.diasRestantes < 3 ? "text-destructive" :
                            suggestion.diasRestantes < 7 ? "text-orange-600" :
                            "text-foreground"
                          }`}>
                            {suggestion.diasRestantes}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Quantidade sugerida: </span>
                          <span className="font-bold text-accent">{suggestion.quantidadeSugerida}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-center text-muted-foreground py-8">
                Nenhuma sugestão de reposição no momento
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de Encomendas (Estoque Negativo) */}
      <Dialog open={canViewStockAlerts && showEncomendasModal} onOpenChange={setShowEncomendasModal}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-purple-600" />
              Produtos Encomendados (Estoque Negativo)
            </DialogTitle>
            <DialogDescription>
              Produtos vendidos que precisam ser repostos urgentemente
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-4">
            {negativeStockProducts && negativeStockProducts.length > 0 ? (
              negativeStockProducts.map((product) => (
                <div
                  key={product.id}
                  className="p-4 rounded-lg bg-muted/50 border border-destructive/50"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="font-medium text-foreground mb-2">{product.name}</p>
                      <div className="flex gap-2 mb-2">
                        <Badge variant="outline" className="text-xs">
                          {product.medida}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {product.categoria}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {product.marca}
                        </Badge>
                      </div>
                      <div className="text-sm">
                        <span className="text-muted-foreground">Estoque: </span>
                        <span className="font-bold text-destructive">{product.quantidade}</span>
                        <span className="text-muted-foreground ml-2">
                          (Faltam {Math.abs(product.quantidade)} unidades)
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-center text-muted-foreground py-8">
                Nenhum produto com estoque negativo
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
