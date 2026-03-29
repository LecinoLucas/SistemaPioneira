import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import AppLoading from "@/components/AppLoading";

const SalesReport = lazy(() => import("./SalesReport"));
const Encomendas = lazy(() => import("./Encomendas"));
const Rankings = lazy(() => import("./Rankings"));

type ReportTab = "vendas" | "encomendas" | "rankings";

const VALID_TABS: readonly ReportTab[] = ["vendas", "encomendas", "rankings"] as const;

function getTabFromSearch(search: string): ReportTab {
  const params = new URLSearchParams(search);
  const tab = params.get("tab");
  if (tab && VALID_TABS.includes(tab as ReportTab)) {
    return tab as ReportTab;
  }
  return "vendas";
}

export default function Reports() {
  const [location, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<ReportTab>(() => getTabFromSearch(window.location.search));

  useEffect(() => {
    const queryString = location.includes("?") ? location.slice(location.indexOf("?")) : "";
    setActiveTab(getTabFromSearch(queryString));
  }, [location]);

  const title = useMemo(() => {
    if (activeTab === "encomendas") return "Relatórios • Encomendas";
    if (activeTab === "rankings") return "Relatórios • Rankings";
    return "Relatórios • Vendas";
  }, [activeTab]);

  const updateUrl = (tab: ReportTab) => {
    setLocation(`/relatorio-vendas?tab=${tab}`, { replace: true });
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Relatórios</h1>
        <p className="text-muted-foreground mt-2">{title}</p>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          const next = (VALID_TABS.includes(value as ReportTab) ? value : "vendas") as ReportTab;
          setActiveTab(next);
          updateUrl(next);
        }}
      >
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="vendas">Vendas</TabsTrigger>
          <TabsTrigger value="encomendas">Encomendas</TabsTrigger>
          <TabsTrigger value="rankings">Rankings</TabsTrigger>
        </TabsList>

        <TabsContent value="vendas" className="mt-4">
          <Suspense fallback={<AppLoading message="Carregando relatório de vendas..." />}>
            <SalesReport />
          </Suspense>
        </TabsContent>
        <TabsContent value="encomendas" className="mt-4">
          <Suspense fallback={<AppLoading message="Carregando relatório de encomendas..." />}>
            <Encomendas />
          </Suspense>
        </TabsContent>
        <TabsContent value="rankings" className="mt-4">
          <Suspense fallback={<AppLoading message="Carregando rankings..." />}>
            <Rankings />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
