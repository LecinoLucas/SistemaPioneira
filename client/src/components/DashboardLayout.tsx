import { SCREEN_CATALOG, type ScreenPath } from "@shared/access-governance";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useAccessControl } from "@/features/auth/hooks/useAccessControl";
import { BrandLogo } from "@/components/BrandLogo";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/useMobile";
import { LayoutDashboard, LogOut, PanelLeft, Package, ShoppingCart, History, DollarSign, FileText, PackageX, TrendingUp, Tag, UserCheck, ShieldCheck, Blocks } from "lucide-react";
import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';

const iconByPath: Record<ScreenPath, typeof LayoutDashboard> = {
  "/": LayoutDashboard,
  "/vendas": ShoppingCart,
  "/historico": History,
  "/produtos": Package,
  "/precos": DollarSign,
  "/relatorio-vendas": FileText,
  "/relatorio-encomendas": PackageX,
  "/rankings": TrendingUp,
  "/precos-margens": DollarSign,
  "/marcas": Tag,
  "/usuarios-pendentes": UserCheck,
  "/auditoria": ShieldCheck,
  "/componentes": Blocks,
};

const getMenuItems = (canAccessPath: (path: ScreenPath) => boolean) =>
  SCREEN_CATALOG
    .filter((screen) => canAccessPath(screen.path))
    .filter((screen) => !["/relatorio-encomendas", "/rankings"].includes(screen.path))
    .map((screen) => ({
      icon: iconByPath[screen.path],
      label: screen.path === "/relatorio-vendas" ? "Relatórios" : screen.label,
      path: screen.path,
    }));

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;

function clampSidebarWidth(width: number) {
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, width));
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [, setLocation] = useLocation();
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    try {
      const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
      if (!saved) return DEFAULT_WIDTH;
      const parsed = Number(saved);
      if (Number.isNaN(parsed)) return DEFAULT_WIDTH;
      return clampSidebarWidth(parsed);
    } catch {
      return DEFAULT_WIDTH;
    }
  });
  const { loading, user, logout } = useAuth();
  const { canAccessPath } = useAccessControl();

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
    } catch {
      // Ignore write errors (private mode / blocked storage)
    }
  }, [sidebarWidth]);

  useEffect(() => {
    if (!loading && !user) {
      if (window.location.pathname !== "/login") {
        setLocation("/login");
      }
    }
  }, [loading, user, setLocation]);

  if (loading) {
    return <DashboardLayoutSkeleton />
  }

  if (!user) {
    return null;
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <DashboardLayoutContent
        setSidebarWidth={setSidebarWidth}
        user={user}
        logout={logout}
        canAccessPath={canAccessPath}
      >
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
  user: NonNullable<ReturnType<typeof useAuth>["user"]>;
  logout: ReturnType<typeof useAuth>["logout"];
  canAccessPath: (path: ScreenPath) => boolean;
};

function DashboardLayoutContent({
  children,
  setSidebarWidth,
  user,
  logout,
  canAccessPath,
}: DashboardLayoutContentProps) {
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const menuItems = useMemo(() => getMenuItems(canAccessPath), [canAccessPath]);
  const activeMenuItem = useMemo(() => menuItems.find(item => item.path === location), [menuItems, location]);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (isCollapsed) {
      setIsResizing(false);
    }
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = clampSidebarWidth(e.clientX - sidebarLeft);
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          className="border-r-0"
          disableTransition={isResizing}
        >
          <SidebarHeader className="h-16 justify-center">
            <div className="flex items-center gap-3 px-2 transition-all w-full">
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center hover:bg-accent rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4 text-muted-foreground" />
              </button>
              {!isCollapsed ? (
                <div className="flex items-center gap-3 min-w-0">
                  <BrandLogo className="h-12 w-auto object-contain shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <span className="text-lg font-bold leading-tight">ESTOQUE</span>
                    <span className="text-xs text-muted-foreground leading-tight">Pioneira Colchões</span>
                  </div>
                </div>
              ) : null}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0">
            <SidebarMenu className="px-2 py-1">
              {menuItems.map(item => {
                const isActive = location === item.path;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setLocation(item.path)}
                      tooltip={item.label}
                      className={`h-10 transition-all font-normal`}
                    >
                      <item.icon
                        className={`h-4 w-4 ${isActive ? "text-primary" : ""}`}
                      />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter className="p-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-accent/50 transition-colors w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-9 w-9 border shrink-0">
                    <AvatarFallback className="text-xs font-medium">
                      {user?.name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-medium truncate leading-none">
                      {user?.name || "-"}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <p className="text-xs text-muted-foreground truncate">
                        {user?.email || "-"}
                      </p>
                      {(user?.role === "admin" || user?.role === "gerente") && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent text-accent-foreground font-medium">
                          {user?.role === "admin" ? "Admin" : "Gerente"}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsResizing(true);
          }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset>
        {isMobile && (
          <div className="flex border-b h-14 items-center justify-between bg-background/95 px-2 backdrop-blur supports-[backdrop-filter]:backdrop-blur sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-9 w-9 rounded-lg bg-background" />
              <div className="flex items-center gap-3">
                <div className="flex flex-col gap-1">
                  <span className="tracking-tight text-foreground">
                    {activeMenuItem?.label ?? "Menu"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
        <main className="flex-1 p-4">{children}</main>
      </SidebarInset>
    </>
  );
}
