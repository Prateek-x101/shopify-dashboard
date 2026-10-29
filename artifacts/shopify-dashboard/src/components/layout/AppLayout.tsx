import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  MessagesSquare,
  Workflow,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  Store as StoreIcon,
  RefreshCw,
  LogOut,
  ChevronsUpDown,
  Check,
  Search,
  Menu,
} from "lucide-react";
import { api, post } from "@/lib/api";
import { useStores } from "@/hooks/use-stores";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { GlobalSearch } from "./GlobalSearch";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const NAV = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard, match: (l: string) => l.startsWith("/overview") },
  { href: "/", label: "Orders", icon: Package, match: (l: string) => l === "/" || l.startsWith("/orders"), badge: "toShip" as const },
  { href: "/abandoned", label: "Abandoned carts", icon: ShoppingCart, match: (l: string) => l.startsWith("/abandoned") },
  { href: "/inbox", label: "Inbox", icon: MessagesSquare, match: (l: string) => l.startsWith("/inbox"), badge: "unread" as const },
  { href: "/automations", label: "Automations", icon: Workflow, match: (l: string) => l.startsWith("/automations") },
  { href: "/settings", label: "Settings", icon: Settings, match: (l: string) => l.startsWith("/settings") },
];

function useMedia(query: string) {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setMatch(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [query]);
  return match;
}

function readCollapsed() {
  try {
    return localStorage.getItem("dash.sidebar") === "collapsed";
  } catch {
    return false;
  }
}

export function AppLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const isMobile = useMedia("(max-width: 767px)");
  const isNarrow = useMedia("(max-width: 1279px)");
  const [userCollapsed, setUserCollapsed] = useState(readCollapsed);
  const [drawer, setDrawer] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  // Laptop widths get the icon rail automatically so the tables keep their room
  const collapsed = isMobile ? false : isNarrow || userCollapsed;

  useEffect(() => setDrawer(false), [location]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const { stores, storeId, setStoreId, storeById } = useStores();
  const qc = useQueryClient();
  const current = storeById(storeId);

  const { data: stats } = useQuery({
    queryKey: ["orders-stats", storeId],
    queryFn: () => api<{ unread: number; pendingShip: number }>(`/orders/stats${storeId ? `?storeId=${storeId}` : ""}`),
    refetchInterval: 30_000,
  });
  const { data: inbox } = useQuery({
    queryKey: ["inbox-unread"],
    queryFn: () => api<{ unread: number }[]>("/inbox?unread=1"),
    refetchInterval: 20_000,
  });
  const badges = {
    unread: (inbox ?? []).reduce((s, r) => s + Number(r.unread || 0), 0),
    toShip: stats?.pendingShip ?? 0,
  };

  const sync = useMutation({
    mutationFn: () => post("/system/sync"),
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success("Synced with Shopify, Shiprocket and email");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = () => {
    const next = !userCollapsed;
    setUserCollapsed(next);
    try {
      localStorage.setItem("dash.sidebar", next ? "collapsed" : "open");
    } catch {
      /* ignore */
    }
  };

  const logout = async () => {
    await post("/auth/logout");
    qc.clear();
    window.location.reload();
  };

  const sidebar = (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200",
        collapsed ? "w-[60px]" : "w-60",
      )}
    >
      <div className="border-b border-white/10 p-2">
        <Popover>
          <PopoverTrigger asChild>
            <button className={cn("flex w-full items-center gap-2.5 rounded-md p-2 text-left hover:bg-white/10", collapsed && "justify-center")}>
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white"
                style={{ background: current?.color ?? "#008060" }}
              >
                {current ? current.name[0] : <StoreIcon className="h-4 w-4" />}
              </span>
              {!collapsed && (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{current?.name ?? "All stores"}</span>
                    <span className="block truncate text-[11px] text-white/50">
                      {stores.length} store{stores.length === 1 ? "" : "s"} connected
                    </span>
                  </span>
                  <ChevronsUpDown className="h-4 w-4 text-white/50" />
                </>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-60 p-1">
            {[{ id: null as number | null, name: "All stores", color: "#64748b" }, ...stores].map((s) => (
              <button
                key={s.id ?? "all"}
                onClick={() => {
                  setStoreId(s.id);
                  qc.invalidateQueries();
                }}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                <span className="flex-1 truncate">{s.name}</span>
                {storeId === s.id && <Check className="h-4 w-4" />}
              </button>
            ))}
            <Link href="/settings/stores" className="mt-1 block rounded border-t px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent">
              + Connect a store
            </Link>
          </PopoverContent>
        </Popover>
      </div>

      <div className="p-2 pb-0">
        <SideItem collapsed={collapsed} label="Search" onClick={() => setSearchOpen(true)}>
          <Search className="h-[18px] w-[18px] shrink-0" />
          {!collapsed && (
            <>
              <span className="flex-1 text-left">Search</span>
              <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-sans text-[10px] text-white/60">Ctrl K</kbd>
            </>
          )}
        </SideItem>
      </div>

      <nav className="flex-1 space-y-0.5 p-2">
        {NAV.map((item) => {
          const active = item.match(location);
          const Icon = item.icon;
          const count = item.badge ? badges[item.badge] : 0;
          const link = (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex items-center gap-3 rounded-md px-2.5 py-2 transition-colors",
                active ? "bg-white/15 font-medium text-white" : "text-white/70 hover:bg-white/10 hover:text-white",
                collapsed && "justify-center px-0",
              )}
            >
              {active && !collapsed && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-emerald-400" />}
              <Icon className="h-[18px] w-[18px] shrink-0" />
              {!collapsed && <span className="flex-1">{item.label}</span>}
              {count > 0 &&
                (collapsed ? (
                  <span className={cn("absolute right-2 top-1.5 h-2 w-2 rounded-full", item.badge === "unread" ? "bg-emerald-400" : "bg-amber-400")} />
                ) : (
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
                      item.badge === "unread" ? "bg-emerald-500 text-white" : "bg-white/15 text-white/80",
                    )}
                    title={item.badge === "toShip" ? "Orders waiting to ship" : "Unread replies"}
                  >
                    {count}
                  </span>
                ))}
            </Link>
          );
          return collapsed ? (
            <Tooltip key={item.href}>
              <TooltipTrigger asChild>{link}</TooltipTrigger>
              <TooltipContent side="right">
                {item.label}
                {count > 0 && ` (${count})`}
              </TooltipContent>
            </Tooltip>
          ) : (
            link
          );
        })}
      </nav>

      <div className={cn("space-y-0.5 border-t border-white/10 p-2", collapsed && "flex flex-col items-center")}>
        <SideItem collapsed={collapsed} label={sync.isPending ? "Syncing…" : "Sync now"} onClick={() => sync.mutate()} small>
          <RefreshCw className={cn("h-4 w-4 shrink-0", sync.isPending && "animate-spin")} />
          {!collapsed && <span>{sync.isPending ? "Syncing…" : "Sync now"}</span>}
        </SideItem>
        <SideItem collapsed={collapsed} label="Log out" onClick={logout} small>
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Log out</span>}
        </SideItem>
        {!isMobile && !isNarrow && (
          <SideItem collapsed={collapsed} label={collapsed ? "Expand" : "Collapse"} onClick={toggle} small>
            {collapsed ? <PanelLeftOpen className="h-4 w-4 shrink-0" /> : <PanelLeftClose className="h-4 w-4 shrink-0" />}
            {!collapsed && <span>Collapse</span>}
          </SideItem>
        )}
      </div>
    </aside>
  );

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-background text-sm">
      {isMobile ? (
        <>
          {drawer && <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setDrawer(false)} />}
          <div className={cn("fixed inset-y-0 left-0 z-50 transition-transform", drawer ? "translate-x-0" : "-translate-x-full")}>{sidebar}</div>
        </>
      ) : (
        sidebar
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        {isMobile && (
          <div className="flex items-center gap-2 border-b bg-sidebar px-3 py-2 text-white">
            <button onClick={() => setDrawer(true)} className="rounded p-1 hover:bg-white/10" aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </button>
            <span className="flex-1 truncate font-semibold">{current?.name ?? "All stores"}</span>
            <button onClick={() => setSearchOpen(true)} className="rounded p-1 hover:bg-white/10" aria-label="Search">
              <Search className="h-5 w-5" />
            </button>
          </div>
        )}
        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}

function SideItem({ collapsed, label, onClick, children, small }: { collapsed: boolean; label: string; onClick: () => void; children: ReactNode; small?: boolean }) {
  const btn = (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-md px-2.5 text-white/60 hover:bg-white/10 hover:text-white",
        small ? "py-1.5 text-[13px]" : "py-2 text-white/70",
        collapsed && "w-auto justify-center px-2",
      )}
    >
      {children}
    </button>
  );
  return collapsed ? (
    <Tooltip>
      <TooltipTrigger asChild>{btn}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  ) : (
    btn
  );
}
