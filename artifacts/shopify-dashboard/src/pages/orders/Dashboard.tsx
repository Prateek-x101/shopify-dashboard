import { useListOrders, useGetOrdersSummary, getListOrdersQueryKey, getGetOrdersSummaryQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PaymentStatusBadge, FulfillmentStatusBadge } from "@/components/orders/StatusBadge";
import { formatCurrency, formatDate } from "@/lib/format";
import { Checkbox } from "@/components/ui/checkbox";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Filter, Download, MoreHorizontal, Plus } from "lucide-react";

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { data: summary, isLoading: isLoadingSummary } = useGetOrdersSummary({ query: { queryKey: getGetOrdersSummaryQueryKey() } });
  const { data: ordersResponse, isLoading: isLoadingOrders } = useListOrders({}, { query: { queryKey: getListOrdersQueryKey({}) } });

  const metrics = summary ? [
    { label: "Orders", value: summary.total_orders_today, change: summary.total_orders_change_pct },
    { label: "Items ordered", value: summary.items_ordered_today, change: summary.items_change_pct },
    { label: "Returns", value: summary.returns_today, change: null },
    { label: "Orders fulfilled", value: summary.orders_fulfilled_today, change: null },
    { label: "Orders delivered", value: summary.orders_delivered_today, change: null },
  ] : [];

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
                <TableHead className="font-semibold text-gray-700 text-xs text-right">Items</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingOrders ? (
                 <TableRow><TableCell colSpan={9} className="text-center py-12 text-gray-500">Loading orders...</TableCell></TableRow>
              ) : ordersResponse?.orders?.length ? (
                ordersResponse.orders.map((order) => (
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
                    <TableCell className="py-2.5 text-right text-gray-500">{order.line_items?.reduce((acc, item) => acc + item.quantity, 0) || 0}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow><TableCell colSpan={9} className="text-center py-12 text-gray-500">No orders found.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="p-4 border-t border-gray-200 flex items-center justify-center gap-4 text-sm text-gray-500 bg-white">
          <Button variant="outline" size="sm" disabled>Previous</Button>
          <span>1–50 of {ordersResponse?.orders?.length || 0} orders</span>
          <Button variant="outline" size="sm" disabled={!ordersResponse?.page_info?.has_next_page}>Next</Button>
        </div>
      </Card>
    </div>
  );
}
