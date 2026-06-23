import { useParams, Link } from "wouter";
import { useGetOrder, getGetOrderQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PaymentStatusBadge, FulfillmentStatusBadge } from "@/components/orders/StatusBadge";
import { formatCurrency, formatDate } from "@/lib/format";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function OrderDetail() {
  const { id } = useParams();
  const { data: order, isLoading } = useGetOrder(id || "", { query: { enabled: !!id, queryKey: getGetOrderQueryKey(id || "") } });

  if (isLoading) {
    return <div className="p-8 text-center text-gray-500">Loading order details...</div>;
  }

  if (!order) {
    return <div className="p-8 text-center text-gray-500">Order not found.</div>;
  }

  const itemsCount = order.line_items?.reduce((acc, item) => acc + item.quantity, 0) || 0;
  const customerName = order.customer ? `${order.customer.first_name || ''} ${order.customer.last_name || ''}`.trim() : 'No customer';

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/" className="p-1.5 hover:bg-gray-100 rounded-md transition-colors text-gray-500 hover:text-gray-900 border border-gray-200 bg-white shadow-sm">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex flex-col">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{order.name}</h1>
            <PaymentStatusBadge status={order.financial_status} />
            <FulfillmentStatusBadge status={order.fulfillment_status} />
          </div>
          <div className="text-sm text-gray-500 mt-1">
            {formatDate(order.created_at)} from {order.channel || 'Online Store'}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
        {/* Left Column */}
        <div className="md:col-span-2 space-y-6">
          {/* Fulfillment Card */}
          <Card className="shadow-sm border-gray-200 overflow-hidden">
            <CardHeader className="pb-3 border-b border-gray-100 bg-gray-50/80 flex flex-row items-center justify-between">
              <CardTitle className="text-base font-semibold text-gray-900">Unfulfilled ({itemsCount})</CardTitle>
              <Button size="sm" className="bg-[#008060] hover:bg-[#006e52]">Mark as fulfilled</Button>
            </CardHeader>
            <CardContent className="p-0 bg-white">
              <div className="divide-y divide-gray-100">
                {order.line_items?.map((item) => (
                  <div key={item.id} className="p-4 flex items-center justify-between hover:bg-gray-50/50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-white rounded border border-gray-200 flex items-center justify-center overflow-hidden shadow-sm">
                        {item.image_url ? (
                          <img src={item.image_url} alt={item.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="text-gray-400 text-xs">No img</div>
                        )}
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">{item.title}</div>
                        {item.variant_title && <div className="text-sm text-gray-500 mt-0.5">{item.variant_title}</div>}
                        {item.sku && <div className="text-xs text-gray-400 mt-1">SKU: {item.sku}</div>}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium text-gray-900">{formatCurrency(item.price, order.currency)}</div>
                      <div className="text-sm text-gray-500 mt-0.5">x {item.quantity}</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Payment Card */}
          <Card className="shadow-sm border-gray-200 overflow-hidden">
            <CardHeader className="pb-3 border-b border-gray-100 bg-gray-50/80">
              <CardTitle className="text-base font-semibold text-gray-900">Paid</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3 text-sm bg-white">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal</span>
                <span>{order.subtotal_price ? formatCurrency(order.subtotal_price, order.currency) : formatCurrency(order.total_price, order.currency)}</span>
              </div>
              {order.total_discounts && parseFloat(order.total_discounts) > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>Discount</span>
                  <span>-{formatCurrency(order.total_discounts, order.currency)}</span>
                </div>
              )}
              <div className="flex justify-between text-gray-600">
                <span>Shipping</span>
                <span>{order.total_shipping_price ? formatCurrency(order.total_shipping_price, order.currency) : 'Free'}</span>
              </div>
              <div className="pt-3 border-t border-gray-100 flex justify-between font-medium text-gray-900">
                <span>Total</span>
                <span>{formatCurrency(order.total_price, order.currency)}</span>
              </div>
              <div className="pt-3 border-t border-gray-100 flex justify-between text-gray-600">
                <span>Paid by customer</span>
                <span>{formatCurrency(order.total_price, order.currency)}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Notes Card */}
          <Card className="shadow-sm border-gray-200">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-semibold text-gray-900">Notes</CardTitle>
            </CardHeader>
            <CardContent className="pb-4 text-sm text-gray-600">
              {order.note ? <p>{order.note}</p> : <p className="text-gray-400">No notes from customer</p>}
            </CardContent>
          </Card>

          {/* Customer Card */}
          <Card className="shadow-sm border-gray-200">
            <CardHeader className="pb-2 pt-4 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold text-gray-900">Customer</CardTitle>
            </CardHeader>
            <CardContent className="pb-4 space-y-4 text-sm">
              <div>
                <Link href="#" className="font-medium text-blue-600 hover:underline">{customerName}</Link>
                <div className="text-gray-500 mt-0.5">{order.customer?.orders_count || 0} orders</div>
              </div>
              
              {order.customer?.email && (
                <div className="pt-4 border-t border-gray-100">
                  <div className="font-medium text-gray-900 mb-1">Contact information</div>
                  <a href={`mailto:${order.customer.email}`} className="text-blue-600 hover:underline flex items-center gap-1.5 break-all">
                    {order.customer.email}
                    <ExternalLink className="w-3 h-3 flex-shrink-0" />
                  </a>
                </div>
              )}
              
              {order.shipping_address && (
                <div className="pt-4 border-t border-gray-100">
                  <div className="font-medium text-gray-900 mb-1">Shipping address</div>
                  <div className="text-gray-600 space-y-0.5">
                    <div>{order.shipping_address.first_name} {order.shipping_address.last_name}</div>
                    <div>{order.shipping_address.address1}</div>
                    <div>{order.shipping_address.city}, {order.shipping_address.province} {order.shipping_address.zip}</div>
                    <div>{order.shipping_address.country}</div>
                    {order.shipping_address.phone && <div>{order.shipping_address.phone}</div>}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          
          {/* Channel Card */}
          <Card className="shadow-sm border-gray-200">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-semibold text-gray-900">Sales channel</CardTitle>
            </CardHeader>
            <CardContent className="pb-4 text-sm">
              <div className="text-blue-600 hover:underline cursor-pointer">{order.channel || 'Online Store'}</div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
