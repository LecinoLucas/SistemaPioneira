import { Toaster } from "@/components/ui/sonner";
import { API_BASE_URL } from "@/const";
import { TooltipProvider } from "@/components/ui/tooltip";
import { type ScreenPath } from "@/features/auth/access/roleAccess";
import { useAccessControl } from "@/features/auth/hooks/useAccessControl";
import { useAuth } from "@/features/auth/hooks/useAuth";
import NotFound from "@/pages/NotFound";
import {
  lazy,
  Suspense,
  useEffect,
  useState,
  type ComponentType,
  type LazyExoticComponent,
} from "react";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";
import AppLoading from "./components/AppLoading";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Products = lazy(() => import("./pages/Products"));
const Sales = lazy(() => import("./pages/Sales"));
const History = lazy(() => import("./pages/History"));
const PublicSales = lazy(() => import("./pages/PublicSales"));
const Pricing = lazy(() => import("./pages/Pricing"));
const PricesMargins = lazy(() => import("./pages/PricesMargins"));
const Reports = lazy(() => import("./pages/Reports"));
const CatalogoBase = lazy(() => import("./pages/CatalogoBase"));
const Login = lazy(() => import("./pages/Login"));
const PendingUsers = lazy(() => import("./pages/PendingUsers"));
const AuditTrail = lazy(() => import("./pages/AuditTrail"));
const ComponentShowcase = lazy(() => import("./pages/ComponentShowcase"));

type PrivateRouteConfig = {
  path: ScreenPath;
  Component: LazyExoticComponent<ComponentType>;
};

const privateRoutes: PrivateRouteConfig[] = [
  { path: "/", Component: Dashboard },
  { path: "/produtos", Component: Products },
  { path: "/vendas", Component: Sales },
  { path: "/historico", Component: History },
  { path: "/precos", Component: Pricing },
  { path: "/precos-margens", Component: PricesMargins },
  { path: "/relatorio-vendas", Component: Reports },
  { path: "/usuarios-pendentes", Component: PendingUsers },
  { path: "/auditoria", Component: AuditTrail },
  { path: "/componentes", Component: ComponentShowcase },
];

function LegacyReportsRedirect({ tab }: { tab: "encomendas" | "rankings" }) {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation(`/relatorio-vendas?tab=${tab}`);
  }, [setLocation, tab]);

  return <div className="min-h-[30vh] grid place-items-center text-muted-foreground">Redirecionando…</div>;
}

function LegacyCatalogRedirect() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation("/categorias");
  }, [setLocation]);

  return <div className="min-h-[30vh] grid place-items-center text-muted-foreground">Redirecionando…</div>;
}

function RoleGuard({
  path,
  children,
}: {
  path: ScreenPath;
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const { canAccessPath } = useAccessControl();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      const next = encodeURIComponent(location || "/");
      setLocation(`/login?next=${next}`);
      return;
    }
  }, [loading, user, location, setLocation]);

  if (loading) {
    return <AppLoading message="Validando sessão..." />;
  }

  if (!user) {
    return <AppLoading message="Redirecionando para login..." />;
  }

  if (!canAccessPath(path)) {
    return (
      <div className="min-h-screen grid place-items-center text-muted-foreground">
        Acesso negado para esta página.
      </div>
    );
  }

  return <>{children}</>;
}

function preloadAfterIdle() {
  void Promise.all([
    import("./pages/Products"),
    import("./pages/Sales"),
  ]);
}

function Router() {
  useEffect(() => {
    const win = globalThis as unknown as Window & {
      requestIdleCallback?: (cb: IdleRequestCallback, options?: IdleRequestOptions) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    const shouldSkipPreload =
      Boolean(connection?.saveData) ||
      connection?.effectiveType === "slow-2g" ||
      connection?.effectiveType === "2g";

    if (shouldSkipPreload) {
      return;
    }

    if (typeof win.requestIdleCallback === "function") {
      const callbackId = win.requestIdleCallback(preloadAfterIdle, {
        timeout: 3000,
      });
      return () => win.cancelIdleCallback?.(callbackId);
    }

    const timeoutId = globalThis.setTimeout(preloadAfterIdle, 1500);
    return () => globalThis.clearTimeout(timeoutId);
  }, []);

  return (
    <Suspense fallback={<AppLoading />}>
      <Switch>
        {/* Public route - no authentication required */}
        <Route path={"/vendedor"} component={PublicSales} />
        <Route path={"/login"} component={Login} />

        {privateRoutes.map(({ path, Component }) => (
          <Route key={path} path={path}>
            <RoleGuard path={path}>
              <DashboardLayout>
                <Component />
              </DashboardLayout>
            </RoleGuard>
          </Route>
        ))}
        <Route path={"/categorias"}>
          <RoleGuard path={"/marcas"}>
            <DashboardLayout>
              <CatalogoBase />
            </DashboardLayout>
          </RoleGuard>
        </Route>
        <Route path={"/catalogo"}>
          <RoleGuard path={"/marcas"}>
            <DashboardLayout>
              <LegacyCatalogRedirect />
            </DashboardLayout>
          </RoleGuard>
        </Route>
        <Route path={"/marcas"}>
          <RoleGuard path={"/marcas"}>
            <DashboardLayout>
              <LegacyCatalogRedirect />
            </DashboardLayout>
          </RoleGuard>
        </Route>
        <Route path={"/relatorio-encomendas"}>
          <RoleGuard path={"/relatorio-encomendas"}>
            <DashboardLayout>
              <LegacyReportsRedirect tab="encomendas" />
            </DashboardLayout>
          </RoleGuard>
        </Route>
        <Route path={"/rankings"}>
          <RoleGuard path={"/rankings"}>
            <DashboardLayout>
              <LegacyReportsRedirect tab="rankings" />
            </DashboardLayout>
          </RoleGuard>
        </Route>
        <Route path={"/404"} component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function ApiOfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let mounted = true;

    const checkHealth = async () => {
      const controller = new AbortController();
      const timeout = globalThis.setTimeout(() => controller.abort(), 3000);
      try {
        const response = await fetch(`${API_BASE_URL}/api/health`, {
          method: "GET",
          credentials: "include",
          signal: controller.signal,
        });
        if (!mounted) return;
        setOffline(!response.ok);
      } catch {
        if (!mounted) return;
        setOffline(true);
      } finally {
        globalThis.clearTimeout(timeout);
      }
    };

    void checkHealth();
    const interval = globalThis.setInterval(checkHealth, 10_000);
    return () => {
      mounted = false;
      globalThis.clearInterval(interval);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="fixed top-0 inset-x-0 z-[60] bg-amber-500 text-amber-950 shadow-sm">
      <div className="mx-auto max-w-7xl px-4 py-2 text-sm font-medium flex items-center gap-2">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-900 animate-pulse" />
        Servidor indisponível no momento. Tentando reconectar automaticamente...
      </div>
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <ApiOfflineBanner />
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
