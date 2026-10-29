import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { Download, Truck, MessageCircle, AlertTriangle, X, ChevronDown, Loader2, ArrowUp, ArrowDown, Copy, ShieldAlert, Clock, Layers } from "lucide-react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";
import { api, apiUrl, post, qs } from "@/lib/api";
import { money, dateShort, phone as fmtPhone, ago } from "@/lib/format";
import type { OrderRow } from "@/lib/types";
import { useStores } from "@/hooks/use-stores";
import { saveOrderNav, orderPath } from "@/lib/order-nav";
import { rtoRisk } from "@/lib/orders";
import { TabsBar, SearchInput, FilterSelect, Pager, EmptyState, useUrlState } from "@/components/common/ListControls";
import { PaymentBadge, FulfillmentBadge, StoreTag, ProductThumb, Pill } from "@/components/common/Status";
import { ColumnPicker, useColumns, type ColumnDef } from "@/components/common/ColumnPicker";
import { ShipProgressMini } from "@/components/orders/ShipProgress";
import { NextActionButton, type RowAction } from "@/components/orders/NextAction";
import { ConversationCell } from "@/components/orders/ConversationCell";
import { ShipDialog, type ShipTarget } from "@/components/orders/ShipDialog";
import { NdrDialog } from "@/components/orders/NdrDialog";
import { OrderChat } from "@/components/orders/OrderChat";
import { QualityBadge, CustomerHover } from "@/components/orders/Quality";
import { BulkMessageDialog } from "@/components/chat/BulkMessageDialog";
import { ShiprocketResultsDialog, type SrActionResponse } from "./ShiprocketResults";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface ListResponse {
  rows: OrderRow[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<string, number>;
}

const DATE_PRESETS = [
  { value: "", label: "Any date" },
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
];

function presetFrom(p: string) {
  if (!p) return undefined;
  const d = new Date();
  if (p === "today") d.setHours(0, 0, 0, 0);
  else d.setDate(d.getDate() - Number(p.replace("d", "")));
  return d.toISOString();
}

export const SR_ACTIONS = [
  { key: "pickup", label: "Schedule pickup" },
  { key: "label", label: "Download labels" },
  { key: "manifest", label: "Generate manifest" },
  { key: "invoice", label: "Download invoices" },
  { key: "push", label: "Only push to Shiprocket (no AWB)" },
  { key: "cancel", label: "Cancel in Shiprocket", danger: true },
];

/** Every column the table can show; users pick and order them (Columns button). */
const COLUMNS: (ColumnDef & { head: string; align?: "right"; sort?: string; width?: string })[] = [
  { id: "order", label: "Order", head: "Order", defaultVisible: true, locked: true, sort: "created" },
  { id: "customer", label: "Customer", head: "Customer", defaultVisible: true },
  { id: "items", label: "Products", head: "Products", defaultVisible: true },
  { id: "amount", label: "Amount & payment", head: "Amount", defaultVisible: true, align: "right", sort: "total" },
  { id: "quality", label: "Delivery check (score, duplicates, address)", head: "Delivery check", defaultVisible: true },
  { id: "shipping", label: "Shipping progress", head: "Shipping", defaultVisible: true, sort: "updated" },
  { id: "action", label: "Next action", head: "Next step", defaultVisible: true },
  { id: "conversation", label: "WhatsApp / email / complaints", head: "Conversation", defaultVisible: true },
  { id: "location", label: "City & PIN", head: "Location", defaultVisible: false },
  { id: "shopify", label: "Shopify status", head: "Shopify", defaultVisible: false },
  { id: "source", label: "Marketing source", head: "Source", defaultVisible: false },
  { id: "tags", label: "Tags", head: "Tags", defaultVisible: false },
  { id: "updated", label: "Last shipping update", head: "Updated", defaultVisible: false },
];

/** Hours an order has been waiting without an AWB. */
function waitingHours(o: OrderRow) {
  if (o.awb || o.cancelledAt || o.fulfillmentStatus === "fulfilled") return 0;
  return (Date.now() - new Date(o.createdAt).getTime()) / 3600_000;
}

export default function OrdersPage() {
  const qc = useQueryClient();
  const { storeId, storeById, stores } = useStores();
  const [state, setState] = useUrlState({ tab: "all", q: "", payment: "", risk: "", date: "", page: "1", open: "", sort: "created", dir: "desc" });
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkMsg, setBulkMsg] = useState(false);
  const [srResult, setSrResult] = useState<SrActionResponse | null>(null);
  const [shipFor, setShipFor] = useState<ShipTarget | null>(null);
  const [ndrFor, setNdrFor] = useState<OrderRow | null>(null);
  const [chatFor, setChatFor] = useState<{ id: number; channel: "whatsapp" | "email"; n: number } | null>(null);
  const [busyRow, setBusyRow] = useState<number | null>(null);
  const [, navigate] = useLocation();
  const cols = useColumns("dash.orderColumns.v3", COLUMNS);

  const params = { storeId, tab: state.tab, q: state.q, payment: state.payment, risk: state.risk, from: presetFrom(state.date), page: state.page, sort: state.sort, dir: state.dir };
  const { data: meta } = useQuery({ queryKey: ["orders-meta"], queryFn: () => api<{ tabs: { key: string; label: string }[] }>("/orders/meta") });
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["orders", params],
    queryFn: () => api<ListResponse>(`/orders${qs(params)}`),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });
  const { data: stats } = useQuery({
    queryKey: ["orders-stats", storeId],
    queryFn: () => api<Record<string, number | string>>(`/orders/stats${qs({ storeId })}`),
    refetchInterval: 60_000,
  });

  const rows = data?.rows ?? [];
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleAll = () => {
    const next = new Set(selected);
    if (allChecked) rows.forEach((r) => next.delete(r.id));
    else rows.forEach((r) => next.add(r.id));
    setSelected(next);
  };
  const toggle = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["orders"] });
    qc.invalidateQueries({ queryKey: ["orders-stats"] });
  };

  const srAction = useMutation({
    mutationFn: ({ action, ids }: { action: string; ids: number[] }) => post<SrActionResponse>("/orders/shiprocket", { action, orderIds: ids }),
    onSuccess: (r, v) => {
      if (v.ids.length === 1 && !r.files.length) {
        const one = r.results[0];
        one?.ok ? toast.success(`${one.name}: ${one.message}`) : toast.error(`${one?.name}: ${one?.message}`);
      } else setSrResult({ ...r, action: v.action });
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setBusyRow(null),
  });

  const rto = useMemo(() => {
    const d = Number(stats?.delivered30 ?? 0);
    const r = Number(stats?.rto30 ?? 0);
    return d + r > 0 ? Math.round((r / (d + r)) * 100) : 0;
  }, [stats]);

  const multiStore = stores.length > 1;
  const openOrder = (id: number, replace = false) => {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    // Remember this list (without ?open) so the order page can go back / next
    const p = new URLSearchParams(window.location.search);
    p.delete("open");
    const back = `${window.location.pathname}${p.toString() ? `?${p}` : ""}`;
    saveOrderNav(rows.map((r) => orderPath(r.name, r.storeId, multiStore)), back);
    navigate(orderPath(row.name, row.storeId, multiStore), { replace });
  };
  // Old links (/?open=12 from search, inbox, overview) open the full page
  useEffect(() => {
    if (state.open && data) openOrder(Number(state.open), true);
  }, [state.open, data]); // eslint-disable-line react-hooks/exhaustive-deps

  const onRowAction = (o: OrderRow, a: RowAction) => {
    if (a === "ship") setShipFor(o);
    else if (a === "ndr") setNdrFor(o);
    else if (a === "fix-address") openOrder(o.id);
    else {
      setBusyRow(o.id);
      srAction.mutate({ action: a === "label" ? "label" : "pickup", ids: [o.id] });
    }
  };
  const openChat = (o: OrderRow, channel: "whatsapp" | "email") => setChatFor((c) => ({ id: o.id, channel, n: (c?.n ?? 0) + 1 }));

  const exportHref = apiUrl(`/orders-export.csv${qs({ storeId, tab: state.tab, q: state.q, payment: state.payment, risk: state.risk, from: presetFrom(state.date) })}`);
  const sortBy = (col: string) =>
    setState(state.sort === col ? { dir: state.dir === "desc" ? "asc" : "desc", page: "1" } : { sort: col, dir: "desc", page: "1" });
  const visible = cols.visible.map((id) => COLUMNS.find((c) => c.id === id)!).filter(Boolean);

  const cell = (o: OrderRow, id: string): ReactNode => {
    const store = storeById(o.storeId);
    switch (id) {
      case "order": {
        const risk = rtoRisk(o.tags);
        const waiting = waitingHours(o);
        return (
          <>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold">{o.name}</span>
              {o.itemCount > 1 && (
                <span title={`${o.itemCount} items`} className="flex items-center gap-0.5 rounded bg-violet-50 px-1 text-[10px] font-semibold text-violet-700">
                  <Layers className="h-3 w-3" />
                  {o.itemCount}
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground">{dateShort(o.createdAt)}</div>
            <div className="mt-0.5 flex flex-wrap gap-1">
              {(risk === "high" || risk === "very-high") && (
                <Pill className="bg-red-50 text-red-700 ring-red-200" title="Shiprocket RTO prediction">
                  <ShieldAlert className="h-3 w-3" /> RTO risk
                </Pill>
              )}
              {o.addressIssue && !o.awb && (
                <Pill className="bg-amber-50 text-amber-800 ring-amber-200" title={o.addressIssue}>
                  <AlertTriangle className="h-3 w-3" /> Address
                </Pill>
              )}
              {waiting >= 48 && (
                <Pill className={waiting >= 72 ? "bg-red-50 text-red-700 ring-red-200" : "bg-amber-50 text-amber-800 ring-amber-200"} title="Waiting without an AWB">
                  <Clock className="h-3 w-3" /> {Math.floor(waiting / 24)}d
                </Pill>
              )}
            </div>
            {multiStore && <StoreTag name={store?.name} color={store?.color} />}
          </>
        );
      }
      case "customer":
        return (
          <div className="max-w-[200px]">
            <CustomerHover name={o.customerName} phone={o.phone} email={o.email} address={o.shippingAddress}>
              <button onClick={(e) => e.stopPropagation()} className="block max-w-full truncate text-left font-medium decoration-dotted underline-offset-2 hover:underline">
                {o.customerName || "—"}
              </button>
            </CustomerHover>
            {o.phone && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                {fmtPhone(o.phone)}
                <button
                  title="Copy phone"
                  className="opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(o.phone!);
                    toast.success("Phone copied");
                  }}
                >
                  <Copy className="h-3 w-3" />
                </button>
              </div>
            )}
            <div className="truncate text-xs text-muted-foreground">{[o.city, o.state].filter(Boolean).join(", ")}</div>
          </div>
        );
      case "items": {
        const first = o.lineItems[0];
        return first ? (
          <div className="flex max-w-[260px] items-center gap-2">
            <ProductThumb src={first.imageUrl} title={first.title} size={38} />
            <div className="min-w-0">
              <div className="truncate">{first.title}</div>
              <div className="truncate text-xs text-muted-foreground">
                {[first.variantTitle, `×${first.quantity}`].filter(Boolean).join(" · ")}
                {o.lineItems.length > 1 && <span className="ml-1 font-medium text-foreground">+{o.lineItems.length - 1} more</span>}
              </div>
            </div>
          </div>
        ) : null;
      }
      case "amount":
        return (
          <div className="text-right">
            <div className="font-semibold tabular-nums">{money(o.totalPrice)}</div>
            <div className="mt-0.5 flex justify-end">
              <PaymentBadge method={o.paymentMethod} financial={o.financialStatus} />
            </div>
          </div>
        );
      case "shipping":
        return (
          <div>
            <ShipProgressMini o={o} />
            {o.awb && (
              <div className="mt-1 truncate text-[11px] text-muted-foreground">
                {o.courier} · <span className="font-mono">{o.awb}</span>
              </div>
            )}
            {o.shopifyFulfillError && (
              <div className="mt-0.5 truncate text-[11px] text-destructive" title={o.shopifyFulfillError}>
                Shopify not updated
              </div>
            )}
          </div>
        );
      case "quality":
        return <QualityBadge q={o.quality} orderId={o.id} orderPathFor={(n) => orderPath(n, o.storeId, multiStore)} />;
      case "action":
        return <NextActionButton o={o} busy={busyRow === o.id} onAction={(a) => onRowAction(o, a)} />;
      case "conversation":
        return (
          <ConversationCell
            c={o.conversation}
            complaintOpen={o.complaintStatus === "open"}
            lastWaStatus={o.lastWaStatus}
            hasPhone={!!o.phone}
            hasEmail={!!o.email}
            onOpen={(ch) => openChat(o, ch)}
          />
        );
      case "location":
        return (
          <div className="text-xs">
            <div>{o.city ?? "—"}</div>
            <div className="text-muted-foreground">
              {o.state} {o.zip}
            </div>
          </div>
        );
      case "shopify":
        return <FulfillmentBadge status={o.fulfillmentStatus} cancelled={!!o.cancelledAt} />;
      case "source":
        return <span className="text-xs capitalize">{o.source ?? "—"}</span>;
      case "tags":
        return (
          <div className="flex max-w-[220px] flex-wrap gap-1">
            {o.tags
              .split(",")
              .map((t) => t.trim())
              .filter((t) => t && !/^\d+ /.test(t))
              .slice(0, 5)
              .map((t) => (
                <span key={t} className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
                  {t}
                </span>
              ))}
          </div>
        );
      case "updated":
        return <span className="text-xs text-muted-foreground">{o.srUpdatedAt ? ago(o.srUpdatedAt) : "—"}</span>;
      default:
        return null;
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b bg-card px-5 py-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold">Orders</h1>
          <p className="truncate text-xs text-muted-foreground">{storeById(storeId)?.name ?? "All stores"} · Shopify → Shiprocket → customer, in one place</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          <Button variant="outline" size="sm" asChild>
            <a href={exportHref}>
              <Download className="mr-1.5 h-4 w-4" /> <span className="hidden sm:inline">Export</span>
            </a>
          </Button>
        </div>
      </header>

      <div className="flex gap-px overflow-x-auto border-b bg-border [scrollbar-width:none]">
        <Stat label="Today" value={String(stats?.today ?? 0)} sub={`${money(stats?.todayValue as string)} · ${stats?.codToday ?? 0} COD`} />
        <Stat label="To ship" value={String(stats?.pendingShip ?? 0)} sub="No AWB yet" tone={Number(stats?.pendingShip) > 0 ? "primary" : undefined} active={state.tab === "to_ship"} onClick={() => setState({ tab: "to_ship", page: "1" })} />
        <Stat label="Pickup pending" value={String(stats?.toPickup ?? 0)} sub="AWB done" active={state.tab === "to_pickup"} onClick={() => setState({ tab: "to_pickup", page: "1" })} />
        <Stat label="In transit" value={String(stats?.inTransit ?? 0)} active={state.tab === "in_transit"} onClick={() => setState({ tab: "in_transit", page: "1" })} />
        <Stat label="NDR" value={String(stats?.ndr ?? 0)} sub="Delivery failed" tone={Number(stats?.ndr) > 0 ? "warn" : undefined} active={state.tab === "ndr"} onClick={() => setState({ tab: "ndr", page: "1" })} />
        <Stat label="RTO (30d)" value={`${rto}%`} sub={`${stats?.rto30 ?? 0} returned`} tone={rto > 20 ? "bad" : undefined} active={state.tab === "rto"} onClick={() => setState({ tab: "rto", page: "1" })} />
        <Stat label="Complaints" value={String(stats?.complaints ?? 0)} tone={Number(stats?.complaints) > 0 ? "bad" : undefined} active={state.tab === "complaints"} onClick={() => setState({ tab: "complaints", page: "1" })} />
        <Stat label="Customer replied" value={String(stats?.unread ?? 0)} sub="Unread" tone={Number(stats?.unread) > 0 ? "good" : undefined} active={state.tab === "unread"} onClick={() => setState({ tab: "unread", page: "1" })} />
      </div>

      <div className="bg-card">
        <TabsBar tabs={meta?.tabs ?? [{ key: "all", label: "All" }]} value={state.tab} counts={data?.counts} onChange={(tab) => (setState({ tab, page: "1" }), setSelected(new Set()))} />
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
          <SearchInput value={state.q} onChange={(q) => setState({ q, page: "1" })} placeholder="Search order #, name, phone, email, AWB, product…" />
          <Segmented
            value={state.payment}
            onChange={(payment) => setState({ payment, page: "1" })}
            options={[
              { value: "", label: "All" },
              { value: "COD", label: "COD" },
              { value: "Prepaid", label: "Prepaid" },
            ]}
          />
          <button
            onClick={() => setState({ risk: state.risk ? "" : "high", page: "1" })}
            className={cn(
              "flex h-9 items-center gap-1.5 rounded-md border px-2.5 text-[13px]",
              state.risk ? "border-red-300 bg-red-50 text-red-700" : "bg-card text-muted-foreground hover:text-foreground",
            )}
            title="Orders that Shiprocket marks as high RTO risk"
          >
            <ShieldAlert className="h-4 w-4" /> High RTO risk
          </button>
          <FilterSelect value={state.date} onChange={(date) => setState({ date, page: "1" })} options={DATE_PRESETS} />
          <ColumnPicker defs={COLUMNS} cols={cols} />
        </div>
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-y bg-primary/5 px-4 py-2">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <Button size="sm" onClick={() => srAction.mutate({ action: "ship", ids: [...selected] })} disabled={srAction.isPending}>
            {srAction.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Truck className="mr-1.5 h-4 w-4" />}
            Ship selected
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" disabled={srAction.isPending}>
                More Shiprocket <ChevronDown className="ml-1 h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {SR_ACTIONS.map((a) => (
                <div key={a.key}>
                  {a.danger && <DropdownMenuSeparator />}
                  <DropdownMenuItem
                    className={cn(a.danger && "text-destructive")}
                    onClick={() => {
                      if (a.danger && !confirm(`Cancel ${selected.size} orders in Shiprocket?`)) return;
                      srAction.mutate({ action: a.key, ids: [...selected] });
                    }}
                  >
                    {a.label}
                  </DropdownMenuItem>
                </div>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" variant="outline" onClick={() => setBulkMsg(true)}>
            <MessageCircle className="mr-1.5 h-4 w-4" /> Message
          </Button>
          <span className="hidden text-xs text-muted-foreground md:inline">“Ship selected” uses the recommended courier and your default package.</span>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSelected(new Set())}>
            <X className="mr-1 h-4 w-4" /> Clear
          </Button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto">
        {!isLoading && rows.length === 0 ? (
          stores.length === 0 ? (
            <EmptyState
              title="No store connected yet"
              hint="Connect your Shopify store in Settings and your orders will appear here."
              action={
                <Button asChild size="sm">
                  <Link href="/settings/stores">Connect a store</Link>
                </Button>
              }
            />
          ) : (
            <EmptyState
              title={state.tab === "to_ship" ? "Nothing waiting to ship 🎉" : "No orders match these filters"}
              hint="Try another tab or clear the search."
              action={
                <Button size="sm" variant="outline" onClick={() => setState({ tab: "all", q: "", payment: "", risk: "", date: "", page: "1" })}>
                  Clear filters
                </Button>
              }
            />
          )
        ) : (
          <table className="w-full min-w-[1100px] border-separate border-spacing-0 text-[13px]">
            <thead className="sticky top-0 z-10 bg-muted/95 text-left text-[11px] uppercase tracking-wide text-muted-foreground backdrop-blur">
              <tr>
                <th className="w-10 border-b py-2.5 pl-4 pr-2">
                  <Checkbox checked={allChecked} onCheckedChange={toggleAll} aria-label="Select all" />
                </th>
                {visible.map((c) => (
                  <th key={c.id} className={cn("border-b px-2 py-2.5 font-semibold", c.align === "right" && "text-right", c.id === visible[visible.length - 1].id && "pr-4")}>
                    {c.sort ? (
                      <button onClick={() => sortBy(c.sort!)} className={cn("inline-flex items-center gap-1 uppercase hover:text-foreground", c.align === "right" && "flex-row-reverse")}>
                        {c.head}
                        {state.sort === c.sort && (state.dir === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
                      </button>
                    ) : (
                      c.head
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading &&
                Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i} className="bg-card">
                    <td colSpan={visible.length + 1} className="border-b px-4 py-3">
                      <Skeleton className="h-10 w-full" />
                    </td>
                  </tr>
                ))}
              {rows.map((o) => {
                const store = storeById(o.storeId);
                const attention = o.complaintStatus === "open" || (o.conversation?.waUnread ?? 0) + (o.conversation?.emailUnread ?? 0) > 0;
                return (
                  <tr
                    key={o.id}
                    onClick={() => openOrder(o.id)}
                    className={cn(
                      "group cursor-pointer bg-card transition-colors hover:bg-accent/50",
                      selected.has(o.id) && "bg-primary/5 hover:bg-primary/10",
                      o.cancelledAt && "opacity-55",
                    )}
                  >
                    <td
                      className="border-b py-3 pl-4 pr-2 align-top"
                      style={{ boxShadow: attention ? "inset 3px 0 0 #ef4444" : multiStore && store ? `inset 3px 0 0 ${store.color}` : undefined }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Checkbox checked={selected.has(o.id)} onCheckedChange={() => toggle(o.id)} aria-label={`Select ${o.name}`} />
                    </td>
                    {visible.map((c) => (
                      <td key={c.id} className={cn("border-b px-2 py-3 align-top", c.id === visible[visible.length - 1].id && "pr-4")}>
                        {cell(o, c.id)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {data && data.total > 0 && <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => setState({ page: String(p) })} />}

      <ShipDialog order={shipFor} onClose={() => setShipFor(null)} />
      <NdrDialog
        order={ndrFor}
        onClose={() => setNdrFor(null)}
        onMessage={
          ndrFor?.phone
            ? () => {
                const o = ndrFor;
                setNdrFor(null);
                openChat(o, "whatsapp");
              }
            : undefined
        }
      />
      <OrderChat target={chatFor} onClose={() => setChatFor(null)} />
      <BulkMessageDialog open={bulkMsg} onOpenChange={setBulkMsg} ids={[...selected]} kind="order" />
      <ShiprocketResultsDialog result={srResult} onClose={() => setSrResult(null)} />
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "warn" | "bad" | "good" | "primary";
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={cn("min-w-[128px] flex-1 bg-card px-4 py-2.5 text-left transition-colors enabled:hover:bg-accent/50", active && "bg-primary/5 shadow-[inset_0_-2px_0_hsl(var(--primary))]")}
    >
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div
        className={cn(
          "text-xl font-semibold tabular-nums",
          tone === "warn" && "text-amber-600",
          tone === "bad" && "text-red-600",
          tone === "good" && "text-emerald-600",
          tone === "primary" && "text-primary",
        )}
      >
        {value}
      </div>
      {sub && <div className="truncate text-[11px] text-muted-foreground">{sub}</div>}
    </button>
  );
}

function Segmented({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="flex h-9 items-center rounded-md border bg-muted/50 p-0.5 text-[13px]">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn("h-full rounded px-3", value === o.value ? "bg-card font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
