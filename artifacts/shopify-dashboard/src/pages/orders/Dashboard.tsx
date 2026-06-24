import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  useListOrders, useGetOrdersSummary,
  getListOrdersQueryKey, getGetOrdersSummaryQueryKey,
  useGetWhatsappStatus, getGetWhatsappStatusQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PaymentStatusBadge, FulfillmentStatusBadge } from "@/components/orders/StatusBadge";
import { formatCurrency, formatDate } from "@/lib/format";
import { Checkbox } from "@/components/ui/checkbox";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Search, Filter, Download, MoreHorizontal, Plus, RefreshCw } from "lucide-react";

/* ── Shiprocket status fetcher ─────────────────────────────── */
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function fetchShiprocketStatuses(orderNames: string[]): Promise<Record<string, { status: string; awb?: string | null; courier?: string | null }>> {
  if (orderNames.length === 0) return {};
  const names = orderNames.map((n) => n.replace(/^#/, "")).join(",");
  const res = await fetch(`${BASE}/api/shiprocket/delivery-statuses?order_names=${encodeURIComponent(names)}`);
  if (!res.ok) return {};
  const data = await res.json() as { statuses: Record<string, { status: string; awb?: string | null; courier?: string | null }> };
  return data.statuses ?? {};
}

/* ── Shiprocket status label + colour ─────────────────────── */
const SR_STATUS_MAP: Record<string, { label: string; classes: string; dot: string }> = {
  DELIVERED:          { label: "Delivered",       classes: "bg-green-50 text-green-800 border-green-200",   dot: "bg-green-500" },
  SHIPPED:            { label: "Shipped",          classes: "bg-blue-50 text-blue-800 border-blue-200",      dot: "bg-blue-500" },
  "OUT FOR DELIVERY": { label: "Out for Delivery", classes: "bg-cyan-50 text-cyan-800 border-cyan-200",      dot: "bg-cyan-500" },
  "IN TRANSIT":       { label: "In Transit",       classes: "bg-indigo-50 text-indigo-800 border-indigo-200",dot: "bg-indigo-500" },
  "PICKUP PENDING":   { label: "Pickup Pending",   classes: "bg-amber-50 text-amber-800 border-amber-200",   dot: "bg-amber-500" },
  "PICKUP QUEUED":    { label: "Pickup Queued",    classes: "bg-amber-50 text-amber-800 border-amber-200",   dot: "bg-amber-400" },
  "PICKUP ERROR":     { label: "Pickup Error",     classes: "bg-red-50 text-red-800 border-red-200",         dot: "bg-red-500" },
  CANCELLED:          { label: "Cancelled",        classes: "bg-red-50 text-red-800 border-red-200",         dot: "bg-red-500" },
  "RTO INITIATED":    { label: "RTO Initiated",    classes: "bg-orange-50 text-orange-800 border-orange-200",dot: "bg-orange-500" },
  "RTO DELIVERED":    { label: "RTO Delivered",    classes: "bg-orange-50 text-orange-800 border-orange-200",dot: "bg-orange-400" },
  LOST:               { label: "Lost",             classes: "bg-red-50 text-red-900 border-red-300",         dot: "bg-red-600" },
  PENDING:            { label: "Pending",          classes: "bg-gray-50 text-gray-600 border-gray-200",      dot: "bg-gray-400" },
  NEW:                { label: "New",              classes: "bg-sky-50 text-sky-700 border-sky-200",         dot: "bg-sky-400" },
  "RETURN PENDING":   { label: "Return Pending",   classes: "bg-orange-50 text-orange-800 border-orange-200",dot: "bg-orange-400" },
  UNDELIVERED:        { label: "Undelivered",      classes: "bg-red-50 text-red-700 border-red-200",         dot: "bg-red-400" },
  NOT_FOUND:          { label: "—",               classes: "bg-gray-50 text-gray-400 border-gray-200",      dot: "bg-gray-300" },
};

function ShiprocketBadge({ status, awb, courier }: { status?: string; awb?: string | null; courier?: string | null }) {
  if (!status) {
    return <span className="text-gray-300 text-xs">—</span>;
  }
  const upper = status.toUpperCase();
  const cfg = SR_STATUS_MAP[upper] ?? { label: status, classes: "bg-gray-50 text-gray-600 border-gray-200", dot: "bg-gray-400" };
  const tooltipParts: string[] = [];
  if (courier) tooltipParts.push(courier);
  if (awb) tooltipParts.push(`AWB: ${awb}`);
  const title = tooltipParts.join(" · ") || undefined;
  return (
    <Badge
      variant="outline"
      title={title}
      className={cn("rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap inline-flex items-center gap-1.5 shadow-sm cursor-default", cfg.classes)}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full", cfg.dot)} />
      {cfg.label}
    </Badge>
  );
}

/* ── WhatsApp icon cell ────────────────────────────────────── */
const WA_SVG = (
  <svg viewBox="0 0 24 24" className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
);

function WhatsAppCell({ connected, onClick }: { connected: boolean; onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      onClick={onClick}
      title={connected ? "Open WhatsApp chat" : "Connect WhatsApp to send messages"}
      className={cn(
        "flex items-center justify-center w-7 h-7 rounded-full transition-all hover:scale-110",
        connected ? "text-[#25d366] hover:bg-[#25d366]/10" : "text-gray-300 hover:bg-gray-100"
      )}
    >
      {WA_SVG}
    </button>
  );
}

/* ── Main Dashboard ────────────────────────────────────────── */
export default function Dashboard() {
  const [, setLocation] = useLocation();
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [prevCursors, setPrevCursors] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);

  const { data: summary, isLoading: isLoadingSummary } = useGetOrdersSummary({
    query: { queryKey: getGetOrdersSummaryQueryKey() },
  });

  const { data: ordersResponse, isLoading: isLoadingOrders } = useListOrders(
    cursor ? { page_info: cursor } : {},
    { query: { queryKey: getListOrdersQueryKey(cursor ? { page_info: cursor } : {}) } }
  );

  const { data: waStatus } = useGetWhatsappStatus({
    query: { queryKey: getGetWhatsappStatusQueryKey() },
  });
  const waConnected = waStatus?.connected === true;

  // Extract order names from current page for Shiprocket lookup
  const orderNames = useMemo(
    () => (ordersResponse?.orders ?? []).map((o) => String(o.name ?? "").replace(/^#/, "")),
    [ordersResponse?.orders]
  );

  const { data: srStatuses, isFetching: isFetchingSR, refetch: refetchSR } = useQuery({
    queryKey: ["shiprocket-statuses", orderNames.join(",")],
    queryFn: () => fetchShiprocketStatuses(orderNames),
    enabled: orderNames.length > 0,
    refetchInterval: 3 * 60 * 1000, // refresh every 3 min
    staleTime: 2 * 60 * 1000,
  });

  const metrics = summary ? [
    { label: "Orders", value: summary.total_orders_today, change: summary.total_orders_change_pct },
    { label: "Items ordered", value: summary.items_ordered_today, change: summary.items_change_pct },
    { label: "Returns", value: summary.returns_today, change: null },
    { label: "Orders fulfilled", value: summary.orders_fulfilled_today, change: null },
    { label: "Orders delivered", value: summary.orders_delivered_today, change: null },
  ] : [];

  const pageInfo = ordersResponse?.page_info;
  const totalOnPage = ordersResponse?.orders?.length || 0;
  const startItem = (currentPage - 1) * 50 + 1;
  const endItem = (currentPage - 1) * 50 + totalOnPage;

  function handleNext() {
    if (!pageInfo?.next_cursor) return;
    setPrevCursors((p) => [...p, cursor ?? ""]);
    setCursor(pageInfo.next_cursor ?? undefined);
    setCurrentPage((p) => p + 1);
  }

  function handlePrev() {
    if (prevCursors.length === 0) return;
    const prev = [...prevCursors];
    const last = prev.pop()!;
    setPrevCursors(prev);
    setCursor(last === "" ? undefined : last);
    setCurrentPage((p) => p - 1);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="bg-white"><Download className="w-4 h-4 mr-2"/> Export</Button>
          <Button variant="outline" size="sm" className="bg-white">More actions <MoreHorizontal className="w-4 h-4 ml-2"/></Button>
          <Button size="sm" className="bg-[#008060] hover:bg-[#006e52]">Create order</Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {isLoadingSummary ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} className="animate-pulse shadow-sm"><CardContent className="h-24 bg-gray-50 rounded-lg"></CardContent></Card>
          ))
        ) : (
          metrics.map((m, i) => (
            <Card key={i} className="shadow-sm border-gray-200">
              <CardContent className="p-4">
                <div className="text-sm font-medium text-gray-600 mb-1">{m.label}</div>
                <div className="flex items-end gap-2">
                  <span className="text-2xl font-semibold text-gray-900">{m.value}</span>
                  {m.change !== null && m.change !== undefined && (
                    <span className={`text-sm mb-0.5 font-medium ${m.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {m.change > 0 ? '↑' : '↓'} {Math.abs(m.change)}%
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Card className="shadow-sm border-gray-200 overflow-hidden">
        <div className="p-2 border-b border-gray-200 flex gap-2 bg-white">
          <Button variant="ghost" size="sm" className="bg-gray-100 text-gray-900 font-medium">All</Button>
          <Button variant="ghost" size="sm" className="text-gray-500 hover:text-gray-900">Unfulfilled</Button>
          <Button variant="ghost" size="sm" className="text-gray-500 hover:text-gray-900">Unpaid</Button>
          <Button variant="ghost" size="sm" className="text-gray-500 hover:text-gray-900">Open</Button>
          <Button variant="ghost" size="sm" className="text-gray-500 hover:text-gray-900">Closed</Button>
          <Button variant="ghost" size="icon" className="text-gray-500 hover:text-gray-900 w-8"><Plus className="w-4 h-4"/></Button>
          <div className="ml-auto flex items-center gap-2 pr-1">
            {isFetchingSR && <span className="text-[11px] text-gray-400 flex items-center gap-1"><RefreshCw className="w-3 h-3 animate-spin" /> Syncing delivery…</span>}
            <button onClick={() => refetchSR()} title="Refresh delivery status" className="text-gray-400 hover:text-gray-600 transition-colors">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="p-3 border-b border-gray-200 flex gap-2 bg-white">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <Input placeholder="Search orders" className="pl-9 h-9 bg-gray-50 border-gray-200 hover:bg-gray-100 focus:bg-white" />
          </div>
          <Button variant="outline" size="sm" className="h-9"><Filter className="w-4 h-4 mr-2"/> Filter</Button>
        </div>

        <div className="bg-white overflow-x-auto">
          <Table>
            <TableHeader className="bg-gray-50 border-b border-gray-200 hover:bg-gray-50">
              <TableRow className="border-none hover:bg-transparent">
                <TableHead className="w-[40px] pl-4"><Checkbox className="border-gray-300 data-[state=checked]:bg-[#008060] data-[state=checked]:border-[#008060]"/></TableHead>
                <TableHead className="font-semibold text-gray-700 text-xs">Order</TableHead>
                <TableHead className="font-semibold text-gray-700 text-xs">Date</TableHead>
                <TableHead className="font-semibold text-gray-700 text-xs">Customer</TableHead>
                <TableHead className="font-semibold text-gray-700 text-xs">Channel</TableHead>
                <TableHead className="font-semibold text-gray-700 text-xs text-right">Total</TableHead>
                <TableHead className="font-semibold text-gray-700 text-xs">Payment status</TableHead>
                <TableHead className="font-semibold text-gray-700 text-xs">Fulfillment status</TableHead>
                <TableHead className="font-semibold text-gray-700 text-xs">
                  <span className="flex items-center gap-1">
                    Delivery status
                    <span className="text-[9px] font-normal text-gray-400 bg-gray-100 px-1 rounded">Shiprocket</span>
                  </span>
                </TableHead>
                <TableHead className="font-semibold text-gray-700 text-xs text-center">WA</TableHead>
                <TableHead className="font-semibold text-gray-700 text-xs text-right">Items</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingOrders ? (
                <TableRow><TableCell colSpan={11} className="text-center py-12 text-gray-500">Loading orders...</TableCell></TableRow>
              ) : ordersResponse?.orders?.length ? (
                ordersResponse.orders.map((order) => {
                  const orderKey = String(order.name ?? "").replace(/^#/, "");
                  const srStatus = srStatuses?.[orderKey];
                  return (
                    <TableRow
                      key={order.id}
                      className="cursor-pointer hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0"
                      onClick={() => setLocation(`/orders/${order.id}`)}
                    >
                      <TableCell className="pl-4 py-2.5" onClick={e => e.stopPropagation()}><Checkbox className="border-gray-300 data-[state=checked]:bg-[#008060] data-[state=checked]:border-[#008060]"/></TableCell>
                      <TableCell className="py-2.5 font-medium text-gray-900">{order.name}</TableCell>
                      <TableCell className="py-2.5 text-gray-500 whitespace-nowrap">{formatDate(order.created_at)}</TableCell>
                      <TableCell className="py-2.5 text-gray-900 font-medium">{order.customer ? `${order.customer.first_name || ''} ${order.customer.last_name || ''}`.trim() || 'No name' : 'No customer'}</TableCell>
                      <TableCell className="py-2.5 text-gray-500">{order.channel || 'Online Store'}</TableCell>
                      <TableCell className="py-2.5 text-right text-gray-900 font-medium">{formatCurrency(order.total_price, order.currency)}</TableCell>
                      <TableCell className="py-2.5"><PaymentStatusBadge status={order.financial_status} /></TableCell>
                      <TableCell className="py-2.5"><FulfillmentStatusBadge status={order.fulfillment_status} /></TableCell>
                      <TableCell className="py-2.5">
                        {isLoadingOrders ? (
                          <span className="text-gray-300 text-xs">—</span>
                        ) : (
                          <ShiprocketBadge status={srStatus?.status} awb={srStatus?.awb} courier={srStatus?.courier} />
                        )}
                      </TableCell>
                      <TableCell className="py-2.5 text-center" onClick={e => e.stopPropagation()}>
                        <WhatsAppCell
                          connected={waConnected}
                          onClick={(e) => { e.stopPropagation(); setLocation(`/orders/${order.id}`); }}
                        />
                      </TableCell>
                      <TableCell className="py-2.5 text-right text-gray-500">{order.line_items?.reduce((acc, item) => acc + item.quantity, 0) || 0}</TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow><TableCell colSpan={11} className="text-center py-12 text-gray-500">No orders found.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="p-4 border-t border-gray-200 flex items-center justify-center gap-4 text-sm text-gray-500 bg-white">
          <Button variant="outline" size="sm" onClick={handlePrev} disabled={currentPage <= 1}>Previous</Button>
          <span>{totalOnPage > 0 ? `${startItem}–${endItem}` : "0"} orders</span>
          <Button variant="outline" size="sm" onClick={handleNext} disabled={!pageInfo?.has_next_page}>Next</Button>
        </div>
      </Card>
    </div>
  );
}
