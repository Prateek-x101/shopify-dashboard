import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { Settings, Package, ShoppingCart, ChevronLeft, ChevronRight } from "lucide-react";

export function AppLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex h-screen w-full bg-[#f4f6f8] overflow-hidden font-sans text-sm">
      {/* Sidebar */}
      <aside
        className={`${collapsed ? "w-14" : "w-60"} bg-[#1a1a2e] text-white flex flex-col shrink-0 transition-all duration-200 relative`}
      >
        {/* Logo / Store name */}
        <div className={`flex items-center gap-3 border-b border-white/10 ${collapsed ? "p-3 justify-center" : "p-4"}`}>
          <div className="bg-[#008060] p-1.5 rounded shrink-0">
            <ShoppingCart className="w-4 h-4 text-white" />
          </div>
          {!collapsed && (
            <span className="font-semibold text-base truncate">Shopify Admin</span>
          )}
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-2 py-3 space-y-0.5">
          <Link
            href="/"
            data-testid="nav-orders"
            className={`flex items-center gap-3 px-2.5 py-2 rounded-md transition-colors ${
              location === "/" || location.startsWith("/orders")
                ? "bg-white/15 text-white font-medium"
                : "text-gray-300 hover:bg-white/8 hover:text-white"
            } ${collapsed ? "justify-center" : ""}`}
            title={collapsed ? "Orders" : undefined}
          >
            <Package className="w-4 h-4 shrink-0" />
            {!collapsed && <span>Orders</span>}
          </Link>

          <Link
            href="/settings"
            data-testid="nav-settings"
            className={`flex items-center gap-3 px-2.5 py-2 rounded-md transition-colors ${
              location === "/settings"
                ? "bg-white/15 text-white font-medium"
                : "text-gray-300 hover:bg-white/8 hover:text-white"
            } ${collapsed ? "justify-center" : ""}`}
            title={collapsed ? "Settings" : undefined}
          >
            <Settings className="w-4 h-4 shrink-0" />
            {!collapsed && <span>Settings</span>}
          </Link>
        </nav>

        {/* Collapse toggle at bottom */}
        <button
          onClick={() => setCollapsed((c) => !c)}
          data-testid="sidebar-toggle"
          className="flex items-center justify-center gap-2 mx-2 mb-3 px-2.5 py-2 rounded-md text-gray-400 hover:text-white hover:bg-white/8 transition-colors text-xs"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <>
              <ChevronLeft className="w-4 h-4" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto flex flex-col text-gray-800">
        <div className="p-4 md:p-8 max-w-[1200px] w-full mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
