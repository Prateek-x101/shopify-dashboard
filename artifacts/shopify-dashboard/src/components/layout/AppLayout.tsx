import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Settings, Package, ShoppingCart } from "lucide-react";

export function AppLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="flex h-screen w-full bg-[#f4f6f8] overflow-hidden font-sans text-sm">
      {/* Sidebar */}
      <aside className="w-60 bg-[#1a1a2e] text-white flex flex-col hidden md:flex shrink-0">
        <div className="p-4 flex items-center gap-3 font-semibold text-base border-b border-white/10 mt-1 mb-2">
          <div className="bg-[#008060] p-1.5 rounded">
            <ShoppingCart className="w-5 h-5 text-white" />
          </div>
          <span>Shopify Admin</span>
        </div>
        <nav className="flex-1 px-3 space-y-1">
          <Link 
            href="/"
            className={`flex items-center gap-3 px-3 py-1.5 rounded-md transition-colors ${location === '/' || location.startsWith('/orders') ? 'bg-white/10 text-white font-medium' : 'text-gray-300 hover:bg-white/5 hover:text-white'}`}
          >
            <Package className="w-4 h-4" />
            <span>Orders</span>
          </Link>
          <Link 
            href="/settings"
            className={`flex items-center gap-3 px-3 py-1.5 rounded-md transition-colors ${location === '/settings' ? 'bg-white/10 text-white font-medium' : 'text-gray-300 hover:bg-white/5 hover:text-white'}`}
          >
            <Settings className="w-4 h-4" />
            <span>Settings</span>
          </Link>
        </nav>
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
