import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useEffect, useMemo, useState } from "react";
import SalesReport from "./SalesReport";
import Encomendas from "./Encomendas";
import Rankings from "./Rankings";

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
  const [activeTab, setActiveTab] = useState<ReportTab>(() => getTabFromSearch(window.location.search));

  useEffect(() => {
    const onPopState = () => {
      setActiveTab(getTabFromSearch(window.location.search));
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const title = useMemo(() => {
    if (activeTab === "encomendas") return "Relatórios • Encomendas";
    if (activeTab === "rankings") return "Relatórios • Rankings";
    return "Relatórios • Vendas";
  }, [activeTab]);

  const updateUrl = (tab: ReportTab) => {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Relatórios</h1>
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
          <SalesReport />
        </TabsContent>
        <TabsContent value="encomendas" className="mt-4">
          <Encomendas />
        </TabsContent>
        <TabsContent value="rankings" className="mt-4">
          <Rankings />
        </TabsContent>
      </Tabs>
    </div>
  );
}

