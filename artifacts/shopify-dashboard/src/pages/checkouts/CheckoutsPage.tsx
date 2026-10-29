import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { saveCartNav } from "@/lib/cart-nav";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { MessageCircle, X, Loader2, Link2 } from "lucide-react";
import { toast } from "sonner";
import { api, qs } from "@/lib/api";
import { money, dateShort, phone as fmtPhone, ago } from "@/lib/format";
import type { CheckoutRow } from "@/lib/types";
import { useStores } from "@/hooks/use-stores";
import { TabsBar, SearchInput, FilterSelect, Pager, EmptyState, useUrlState } from "@/components/common/ListControls";
import { CartStatus, SourceBadge, StoreTag, ProductThumb } from "@/components/common/Status";
import { BulkMessageDialog } from "@/components/chat/BulkMessageDialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

interface ListResponse {
  rows: CheckoutRow[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<string, number>;
  stats: { value: string; recoveredValue: string };
}

export default function CheckoutsPage() {
  const { storeId, storeById } = useStores();
  const [state, setState] = useUrlState({ tab: "abandoned", q: "", source: "", page: "1", open: "" });
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulk, setBulk] = useState(false);

  const params = { storeId, tab: state.tab, q: state.q, source: state.source, page: state.page };
  const { data: meta } = useQuery({ queryKey: ["checkouts-meta"], queryFn: () => api<{ tabs: { key: string; label: string }[] }>("/checkouts/meta") });
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["checkouts", params],
    queryFn: () => api<ListResponse>(`/checkouts${qs(params)}`),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
  const rows = data?.rows ?? [];
  const [, navigate] = useLocation();
  const openCart = (id: number, replace = false) => {
    const p = new URLSearchParams(window.location.search);
    p.delete("open");
    saveCartNav(rows.map((r) => r.id), `${window.location.pathname}${p.toString() ? `?${p}` : ""}`);
    navigate(`/abandoned/${id}`, { replace });
  };
  // Old links (/abandoned?open=12) now open the full page
  useEffect(() => {
    if (state.open && data) openCart(Number(state.open), true);
  }, [state.open, data]); // eslint-disable-line react-hooks/exhaustive-deps
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggle = (id: number) => {
    const n = new Set(selected);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setSelected(n);
  };
  const counts = data?.counts ?? {};
  const recoveryRate = counts.all ? Math.round(((counts.recovered ?? 0) / counts.all) * 100) : 0;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b bg-card px-5 py-3">
        <div>
          <h1 className="text-lg font-semibold">Abandoned carts</h1>
          <p className="text-xs text-muted-foreground">Shopify + Fastrr checkout · {storeById(storeId)?.name ?? "All stores"}</p>
        </div>
        {isFetching && <Loader2 className="ml-auto h-4 w-4 animate-spin text-muted-foreground" />}
      </header>

      <div className="grid grid-cols-2 gap-px border-b bg-border lg:grid-cols-4">
        <Stat label="Open carts" value={String(counts.abandoned ?? 0)} sub={`${money(data?.stats.value)} at stake`} />
        <Stat label="Messaged" value={String(counts.in_sequence ?? 0)} sub={`${counts.not_messaged ?? 0} not messaged yet`} />
        <Stat label="Replied" value={String(counts.replied ?? 0)} />
        <Stat label="Recovered" value={String(counts.recovered ?? 0)} sub={`${recoveryRate}% · ${money(data?.stats.recoveredValue)}`} good />
      </div>

      <div className="bg-card">
        <TabsBar tabs={meta?.tabs ?? []} value={state.tab} counts={counts} onChange={(tab) => (setState({ tab, page: "1" }), setSelected(new Set()))} />
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
          <SearchInput value={state.q} onChange={(q) => setState({ q, page: "1" })} placeholder="Search name, phone, email, product, cart id…" />
          <FilterSelect
            value={state.source}
            onChange={(source) => setState({ source, page: "1" })}
            options={[{ value: "", label: "Shopify + Fastrr" }, { value: "shopify", label: "Shopify checkout" }, { value: "fastrr", label: "Fastrr checkout" }]}
          />
        </div>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-2 border-y bg-primary/5 px-4 py-2">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <Button size="sm" onClick={() => setBulk(true)}>
            <MessageCircle className="mr-1.5 h-4 w-4" /> Send recovery message
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            <X className="mr-1 h-4 w-4" /> Clear
          </Button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto">
        {!isLoading && rows.length === 0 ? (
          <EmptyState title="No carts here" hint="Shopify carts sync automatically. For Fastrr carts, add the webhook URL from Settings → System in your Shiprocket Checkout panel." />
        ) : (
          <table className="w-full min-w-[1000px] border-separate border-spacing-0 text-[13px]">
            <thead className="sticky top-0 z-10 bg-muted/95 text-left text-xs text-muted-foreground backdrop-blur">
              <tr>
                <th className="w-10 border-b px-4 py-2">
                  <Checkbox
                    checked={allChecked}
                    onCheckedChange={() => {
                      const n = new Set(selected);
                      rows.forEach((r) => (allChecked ? n.delete(r.id) : n.add(r.id)));
                      setSelected(n);
                    }}
                  />
                </th>
                <th className="border-b px-2 py-2 font-medium">Cart</th>
                <th className="border-b px-2 py-2 font-medium">Customer</th>
                <th className="border-b px-2 py-2 font-medium">Products</th>
                <th className="border-b px-2 py-2 text-right font-medium">Value</th>
                <th className="border-b px-2 py-2 font-medium">Recovery</th>
                <th className="border-b px-2 py-2 font-medium">Status</th>
                <th className="border-b px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const store = storeById(c.storeId);
                const first = c.lineItems[0];
                return (
                  <tr
                    key={c.id}
                    onClick={() => openCart(c.id)}
                    className={cn("cursor-pointer bg-card hover:bg-accent/60", selected.has(c.id) && "bg-primary/5")}
                  >
                    <td className="border-b px-4 py-2" onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggle(c.id)} />
                    </td>
                    <td className="border-b px-2 py-2 align-top">
                      <div className="flex items-center gap-1.5">
                        <SourceBadge source={c.source} />
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{dateShort(c.createdAt)}</div>
                      {!storeId && <StoreTag name={store?.name} color={store?.color} />}
                    </td>
                    <td className="max-w-[200px] border-b px-2 py-2 align-top">
                      <div className="truncate font-medium">{c.customerName || "—"}</div>
                      <div className="text-xs text-muted-foreground">{c.phone ? fmtPhone(c.phone) : <span className="text-amber-600">No phone</span>}</div>
                      <div className="truncate text-xs text-muted-foreground">{c.email}</div>
                    </td>
                    <td className="max-w-[280px] border-b px-2 py-2 align-top">
                      {first && (
                        <div className="flex items-center gap-2">
                          <ProductThumb src={first.imageUrl} title={first.title} size={34} />
                          <div className="min-w-0">
                            <div className="truncate">{first.title}</div>
                            <div className="truncate text-xs text-muted-foreground">
                              {first.variantTitle}
                              {c.lineItems.length > 1 && <span className="ml-1 font-medium text-foreground">+{c.lineItems.length - 1} more</span>}
                            </div>
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="border-b px-2 py-2 text-right align-top font-medium tabular-nums">{money(c.totalPrice)}</td>
                    <td className="border-b px-2 py-2 align-top">
                      {c.sentSteps.length === 0 ? (
                        <span className="text-xs text-muted-foreground">Not messaged</span>
                      ) : (
                        <div className="space-y-0.5">
                          <div className="flex flex-wrap gap-1">
                            {c.sentSteps.map((s, i) => (
                              <span key={i} className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-700">
                                ✓ {s}
                              </span>
                            ))}
                          </div>
                          {c.lastSentAt && <div className="text-[11px] text-muted-foreground">last {ago(c.lastSentAt)}</div>}
                        </div>
                      )}
                    </td>
                    <td className="border-b px-2 py-2 align-top">
                      <div className="flex items-center gap-1.5">
                        <CartStatus status={c.status} />
                        {c.unreadCount > 0 && <span className="rounded-full bg-emerald-500 px-1.5 text-[11px] font-semibold text-white">{c.unreadCount}</span>}
                      </div>
                      {c.stage && <div className="mt-0.5 text-[11px] text-muted-foreground">{c.stage.replace(/_/g, " ").toLowerCase()}</div>}
                    </td>
                    <td className="border-b px-2 py-2 align-top" onClick={(e) => e.stopPropagation()}>
                      {c.checkoutUrl && (
                        <button
                          title="Copy recovery link"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            navigator.clipboard.writeText(c.checkoutUrl!);
                            toast.success("Recovery link copied");
                          }}
                        >
                          <Link2 className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {data && data.total > 0 && <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => setState({ page: String(p) })} />}

      <BulkMessageDialog open={bulk} onOpenChange={setBulk} ids={[...selected]} kind="checkout" />
    </div>
  );
}

function Stat({ label, value, sub, good }: { label: string; value: string; sub?: string; good?: boolean }) {
  return (
    <div className="bg-card px-4 py-2.5">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("text-xl font-semibold tabular-nums", good && "text-emerald-600")}>{value}</div>
      {sub && <div className="truncate text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
