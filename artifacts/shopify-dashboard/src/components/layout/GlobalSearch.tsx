import { useEffect, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Package, ShoppingCart, MessagesSquare, LayoutDashboard, Settings, Workflow } from "lucide-react";
import { api } from "@/lib/api";
import { orderPath } from "@/lib/order-nav";
import { useStores } from "@/hooks/use-stores";
import { money, phone as fmtPhone, dateShort } from "@/lib/format";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

interface SearchResult {
  orders: { id: number; name: string; customer_name: string | null; phone: string | null; total_price: string; sr_status: string | null; created_at: string; store_id: number }[];
  carts: { id: number; source: string; customer_name: string | null; phone: string | null; total_price: string; status: string; created_at: string }[];
}

const PAGES = [
  { label: "Overview", href: "/overview", icon: LayoutDashboard },
  { label: "Orders", href: "/", icon: Package },
  { label: "Abandoned carts", href: "/abandoned", icon: ShoppingCart },
  { label: "Inbox", href: "/inbox", icon: MessagesSquare },
  { label: "Automations", href: "/automations", icon: Workflow },
  { label: "Settings", href: "/settings", icon: Settings },
];

export function GlobalSearch({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [, navigate] = useLocation();
  const { stores } = useStores();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  const { data } = useQuery({
    queryKey: ["search", debounced],
    queryFn: () => api<SearchResult>(`/search?q=${encodeURIComponent(debounced)}`),
    enabled: debounced.length >= 2,
    placeholderData: keepPreviousData,
  });

  const go = (href: string) => {
    onOpenChange(false);
    navigate(href);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} shouldFilter={debounced.length < 2}>
      {/* filtering is done by the server, so cmdk's own fuzzy filter is turned off */}
      <CommandInput value={q} onValueChange={setQ} placeholder="Search orders, customers, phone, AWB, carts…" />
      <CommandList className="max-h-[420px]">
        {debounced.length >= 2 && <CommandEmpty>No results for “{debounced}”</CommandEmpty>}
        {debounced.length < 2 && (
          <CommandGroup heading="Go to">
            {PAGES.map((p) => (
              <CommandItem key={p.href} value={p.label} onSelect={() => go(p.href)}>
                <p.icon className="mr-2 h-4 w-4" />
                {p.label}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {debounced.length >= 2 && !!data?.orders.length && (
          <CommandGroup heading="Orders">
            {data.orders.map((o) => (
              <CommandItem key={`o${o.id}`} value={`order-${o.id}-${debounced}`} onSelect={() => go(orderPath(o.name, o.store_id, stores.length > 1))}>
                <Package className="mr-2 h-4 w-4 text-muted-foreground" />
                <span className="w-16 font-medium">{o.name}</span>
                <span className="flex-1 truncate">
                  {o.customer_name} <span className="text-muted-foreground">{fmtPhone(o.phone)}</span>
                </span>
                <span className="ml-2 text-xs text-muted-foreground">{o.sr_status ?? dateShort(o.created_at)}</span>
                <span className="ml-3 w-16 text-right text-xs">{money(o.total_price)}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {debounced.length >= 2 && !!data?.carts.length && (
          <CommandGroup heading="Abandoned carts">
            {data.carts.map((c) => (
              <CommandItem key={`c${c.id}`} value={`cart-${c.id}-${debounced}`} onSelect={() => go(`/abandoned/${c.id}`)}>
                <ShoppingCart className="mr-2 h-4 w-4 text-muted-foreground" />
                <span className="flex-1 truncate">
                  {c.customer_name ?? "Guest"} <span className="text-muted-foreground">{fmtPhone(c.phone)}</span>
                </span>
                <span className="ml-2 text-xs capitalize text-muted-foreground">
                  {c.source} · {c.status}
                </span>
                <span className="ml-3 w-16 text-right text-xs">{money(c.total_price)}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
