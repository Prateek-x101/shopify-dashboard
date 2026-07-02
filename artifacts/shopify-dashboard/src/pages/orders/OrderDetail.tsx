import { useParams, Link } from "wouter";
import {
  useGetOrder,
  getGetOrderQueryKey,
  useGetOrderEvents,
  getGetOrderEventsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PaymentStatusBadge, FulfillmentStatusBadge } from "@/components/orders/StatusBadge";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { ArrowLeft, ExternalLink, MapPin, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WhatsAppChat } from "@/components/orders/WhatsAppChat";
import { EmailChat } from "@/components/orders/EmailChat";

function verbToLabel(verb: string, args: string[]): string {
  const map: Record<string, string> = {
    placed: "Order was placed",
    confirmed: "Order was confirmed",
    paid: "Payment was processed",
    partially_paid: "Payment was partially processed",
    authorized: "Payment was authorized",
    voided: "Payment was voided",
    refunded: "Refund was issued",
    partially_refunded: "Partial refund was issued",
    fulfilled: "Order was fulfilled",
    partially_fulfilled: "Order was partially fulfilled",
    unfulfilled: "Fulfillment was cancelled",
    assigned_to_new_channel: "Order assigned to new channel",
    closed: "Order was closed",
    reopened: "Order was reopened",
    cancelled: "Order was cancelled",
    updated: "Order was updated",
    transaction_processed: "Payment processed",
    transaction_failed: "Payment failed",
    shipped: "Order was shipped",
    delivered: "Order was delivered",
    out_for_delivery: "Order is out for delivery",
    attempted_delivery: "Delivery was attempted",
    ready_for_pickup: "Order is ready for pickup",
    picked_up: "Order was picked up",
    email_sent: "Confirmation email was sent",
    confirmation_email_sent: "Order confirmation email sent",
  };
  if (map[verb]) return map[verb];
  if (args.length > 0) return args.join(", ");
  return verb.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function verbColor(verb: string): string {
  if (["paid", "fulfilled", "delivered", "shipped", "picked_up", "authorized", "transaction_processed"].includes(verb))
    return "bg-green-100 text-green-700 border-green-200";
  if (["cancelled", "voided", "transaction_failed", "refunded", "partially_refunded"].includes(verb))
    return "bg-red-100 text-red-700 border-red-200";
  if (["partially_paid", "partially_fulfilled", "attempted_delivery"].includes(verb))
    return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-blue-100 text-blue-700 border-blue-200";
}

export default function OrderDetail() {
  const { id } = useParams();
  const { data: order, isLoading } = useGetOrder(id || "", {
    query: { enabled: !!id, queryKey: getGetOrderQueryKey(id || "") },
  });
  const { data: eventsData, isLoading: isLoadingEvents } = useGetOrderEvents(id || "", {
    query: { enabled: !!id, queryKey: getGetOrderEventsQueryKey(id || "") },
  });

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-48" />
        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2 space-y-4">
            <div className="h-40 bg-gray-200 rounded" />
            <div className="h-32 bg-gray-200 rounded" />
          </div>
          <div className="space-y-4">
            <div className="h-24 bg-gray-200 rounded" />
            <div className="h-32 bg-gray-200 rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (!order) {
    return <div className="p-8 text-center text-gray-500">Order not found.</div>;
  }

  const unfulfilled = order.line_items?.filter((i) => i.fulfillment_status !== "fulfilled") ?? [];
  const fulfilled = order.line_items?.filter((i) => i.fulfillment_status === "fulfilled") ?? [];
  const itemsCount = order.line_items?.reduce((acc, item) => acc + item.quantity, 0) || 0;
  const customerName = order.customer
    ? `${order.customer.first_name || ""} ${order.customer.last_name || ""}`.trim()
    : "No customer";
  const events = eventsData?.events ?? [];

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/"
          className="p-1.5 hover:bg-gray-100 rounded-md transition-colors text-gray-500 hover:text-gray-900 border border-gray-200 bg-white shadow-sm"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{order.name}</h1>
            <PaymentStatusBadge status={order.financial_status} />
            <FulfillmentStatusBadge status={order.fulfillment_status} />
          </div>
          <div className="text-sm text-gray-500 mt-0.5">
            {formatDateTime(order.created_at)} from {order.channel || "Online Store"}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
        {/* ── Left Column ── */}
        <div className="md:col-span-2 space-y-5">
          {/* Unfulfilled items */}
          {unfulfilled.length > 0 && (
            <Card className="shadow-sm border-gray-200 overflow-hidden">
              <CardHeader className="pb-3 border-b border-gray-100 bg-amber-50/60 flex flex-row items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                    <CardTitle className="text-sm font-semibold text-gray-900">
                      Unfulfilled ({unfulfilled.reduce((s, i) => s + i.quantity, 0)})
                    </CardTitle>
                  </div>
                  <div className="text-xs text-gray-500 mt-1 ml-4">
                    Standard (Prepaid) · 0.0 kg shipping
                  </div>
                </div>
                <Button size="sm" className="bg-[#008060] hover:bg-[#006e52] text-xs">
                  Mark as fulfilled
                </Button>
              </CardHeader>
              <CardContent className="p-0 bg-white">
                <div className="divide-y divide-gray-100">
                  {unfulfilled.map((item) => (
                    <div key={item.id} className="p-4 flex items-center justify-between hover:bg-gray-50/50">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-gray-50 rounded border border-gray-200 flex items-center justify-center overflow-hidden shadow-sm">
                          {item.image_url ? (
                            <img src={item.image_url} alt={item.title} className="w-full h-full object-cover" />
                          ) : (
                            <div className="text-gray-300 text-xs font-medium">IMG</div>
                          )}
                        </div>
                        <div>
                          <div className="font-medium text-gray-900 text-sm">{item.title}</div>
                          {item.variant_title && (
                            <div className="text-xs text-gray-500 mt-0.5">{item.variant_title}</div>
                          )}
                          {item.sku && <div className="text-xs text-gray-400 mt-0.5">SKU: {item.sku}</div>}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-gray-700">
                          {formatCurrency(item.price, order.currency)} × {item.quantity}
                        </div>
                        <div className="text-sm font-medium text-gray-900 mt-0.5">
                          {formatCurrency(
                            (parseFloat(item.price) * item.quantity).toFixed(2),
                            order.currency
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Fulfilled items */}
          {fulfilled.length > 0 && (
            <Card className="shadow-sm border-gray-200 overflow-hidden">
              <CardHeader className="pb-3 border-b border-gray-100 bg-green-50/60">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                  <CardTitle className="text-sm font-semibold text-gray-900">
                    Fulfilled ({fulfilled.reduce((s, i) => s + i.quantity, 0)})
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-0 bg-white">
                <div className="divide-y divide-gray-100">
                  {fulfilled.map((item) => (
                    <div key={item.id} className="p-4 flex items-center justify-between hover:bg-gray-50/50">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-gray-50 rounded border border-gray-200 flex items-center justify-center overflow-hidden shadow-sm">
                          {item.image_url ? (
                            <img src={item.image_url} alt={item.title} className="w-full h-full object-cover" />
                          ) : (
                            <div className="text-gray-300 text-xs font-medium">IMG</div>
                          )}
                        </div>
                        <div>
                          <div className="font-medium text-gray-900 text-sm">{item.title}</div>
                          {item.variant_title && (
                            <div className="text-xs text-gray-500 mt-0.5">{item.variant_title}</div>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-gray-700">
                          {formatCurrency(item.price, order.currency)} × {item.quantity}
                        </div>
                        <div className="text-sm font-medium text-gray-900 mt-0.5">
                          {formatCurrency(
                            (parseFloat(item.price) * item.quantity).toFixed(2),
                            order.currency
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Payment Summary */}
          <Card className="shadow-sm border-gray-200 overflow-hidden">
            <CardHeader className="pb-3 border-b border-gray-100 bg-gray-50/80">
              <CardTitle className="text-sm font-semibold text-gray-900">
                {order.financial_status === "paid" ? "Paid" : "Payment summary"}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-2.5 text-sm bg-white">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal <span className="text-gray-400">· {itemsCount} item{itemsCount !== 1 ? "s" : ""}</span></span>
                <span>{formatCurrency(order.subtotal_price ?? order.total_price, order.currency)}</span>
              </div>
              {order.total_discounts && parseFloat(order.total_discounts) > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>Discount (PrepaidDiscount)</span>
                  <span className="text-green-700">−{formatCurrency(order.total_discounts, order.currency)}</span>
                </div>
              )}
              <div className="flex justify-between text-gray-600">
                <span>Shipping <span className="text-gray-400">· Standard (Prepaid)</span></span>
                <span>
                  {order.total_shipping_price && parseFloat(order.total_shipping_price) > 0
                    ? formatCurrency(order.total_shipping_price, order.currency)
                    : "Free"}
                </span>
              </div>
              <div className="pt-3 border-t border-gray-100 flex justify-between font-semibold text-gray-900">
                <span>Total</span>
                <span>{formatCurrency(order.total_price, order.currency)}</span>
              </div>
              <div className="pt-2.5 border-t border-gray-100 flex justify-between text-gray-600">
                <span>Paid by customer</span>
                <span className="font-medium text-gray-900">{formatCurrency(order.total_price, order.currency)}</span>
              </div>
              {order.payment_gateway && (
                <div className="text-xs text-gray-400">via {order.payment_gateway}</div>
              )}
            </CardContent>
          </Card>

          {/* Timeline */}
          <Card className="shadow-sm border-gray-200 overflow-hidden">
            <CardHeader className="pb-3 border-b border-gray-100 bg-gray-50/80">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-gray-400" />
                <CardTitle className="text-sm font-semibold text-gray-900">Timeline</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-4 bg-white">
              {isLoadingEvents ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex gap-3 animate-pulse">
                      <div className="w-8 h-8 rounded-full bg-gray-200 shrink-0" />
                      <div className="flex-1 space-y-2 pt-1">
                        <div className="h-3 bg-gray-200 rounded w-3/4" />
                        <div className="h-2 bg-gray-100 rounded w-1/3" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : events.length === 0 ? (
                <div className="text-sm text-gray-400 text-center py-4">No timeline events</div>
              ) : (
                <div className="relative">
                  {/* Vertical line */}
                  <div className="absolute left-3.5 top-0 bottom-0 w-px bg-gray-200" />
                  <div className="space-y-0">
                    {events.map((event, idx) => {
                      const label = verbToLabel(event.verb, event.arguments ?? []);
                      const detail = event.message || event.description || event.body || null;
                      const colorClass = verbColor(event.verb);
                      return (
                        <div key={event.id} className="flex gap-4 relative pb-5 last:pb-0">
                          {/* Dot */}
                          <div
                            className={`w-7 h-7 rounded-full border flex items-center justify-center shrink-0 relative z-10 text-xs font-bold ${colorClass}`}
                          >
                            {idx + 1}
                          </div>
                          {/* Content */}
                          <div className="flex-1 pt-0.5">
                            <div className="text-sm font-medium text-gray-900">{label}</div>
                            {detail && (
                              <div className="text-xs text-gray-500 mt-0.5 leading-relaxed">{detail}</div>
                            )}
                            {event.author && (
                              <div className="text-xs text-gray-400 mt-0.5">by {event.author}</div>
                            )}
                            <div className="text-xs text-gray-400 mt-0.5">
                              {formatDateTime(event.created_at)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Right Column ── */}
        <div className="space-y-4">
          {/* Notes */}
          <Card className="shadow-sm border-gray-200">
            <CardHeader className="pb-2 pt-3 px-4 flex flex-row items-center justify-between">
              <CardTitle className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Notes</CardTitle>
            </CardHeader>
            <CardContent className="pb-4 px-4 text-sm text-gray-600">
              {order.note ? (
                <p>{order.note}</p>
              ) : (
                <p className="text-gray-400 italic text-xs">No notes from customer</p>
              )}
            </CardContent>
          </Card>

          {/* WhatsApp Chat */}
          <WhatsAppChat
            customerName={customerName}
            customerPhone={order.customer?.phone ?? order.shipping_address?.phone}
            orderName={order.name}
            orderId={id || ""}
          />

          {/* Email Chat */}
          <EmailChat
            customerName={customerName}
            customerEmail={order.customer?.email}
            orderName={order.name}
            orderId={id || ""}
          />

          {/* Customer */}
          <Card className="shadow-sm border-gray-200">
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Customer</CardTitle>
            </CardHeader>
            <CardContent className="pb-4 px-4 space-y-4 text-sm">
              <div>
                <div className="font-medium text-blue-600 cursor-pointer hover:underline">{customerName}</div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {order.customer?.orders_count || 0} order{order.customer?.orders_count !== 1 ? "s" : ""}
                </div>
              </div>

              {order.customer?.email && (
                <div className="pt-3 border-t border-gray-100">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    Contact information
                  </div>
                  <a
                    href={`mailto:${order.customer.email}`}
                    className="text-blue-600 hover:underline flex items-center gap-1 text-xs break-all"
                  >
                    {order.customer.email}
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                  {order.customer.phone && (
                    <div className="text-xs text-gray-600 mt-1">{order.customer.phone}</div>
                  )}
                </div>
              )}

              {order.shipping_address && (
                <div className="pt-3 border-t border-gray-100">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    Shipping address
                  </div>
                  <div className="text-xs text-gray-700 leading-relaxed space-y-0.5">
                    <div className="font-medium">
                      {order.shipping_address.first_name} {order.shipping_address.last_name}
                    </div>
                    {order.shipping_address.address1 && <div>{order.shipping_address.address1}</div>}
                    <div>
                      {[order.shipping_address.city, order.shipping_address.province, order.shipping_address.zip]
                        .filter(Boolean)
                        .join(", ")}
                    </div>
                    {order.shipping_address.country && <div>{order.shipping_address.country}</div>}
                    {order.shipping_address.phone && (
                      <div className="text-gray-500">{order.shipping_address.phone}</div>
                    )}
                  </div>
                  <a
                    href={`https://maps.google.com/?q=${encodeURIComponent(
                      [
                        order.shipping_address.address1,
                        order.shipping_address.city,
                        order.shipping_address.province,
                        order.shipping_address.country,
                      ]
                        .filter(Boolean)
                        .join(", ")
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 flex items-center gap-1 text-xs text-blue-600 hover:underline"
                  >
                    <MapPin className="w-3 h-3" />
                    View map
                  </a>
                </div>
              )}

              {order.billing_address && (
                <div className="pt-3 border-t border-gray-100">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    Billing address
                  </div>
                  <div className="text-xs text-gray-500">Same as shipping address</div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Sales channel */}
          <Card className="shadow-sm border-gray-200">
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Sales channel
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4 px-4 text-sm">
              <div className="text-blue-600 cursor-pointer hover:underline">
                {order.channel || "Online Store"}
              </div>
              {order.payment_gateway && (
                <div className="text-xs text-gray-400 mt-1">{order.payment_gateway}</div>
              )}
            </CardContent>
          </Card>

          {/* Tags */}
          {order.tags && (
            <Card className="shadow-sm border-gray-200">
              <CardHeader className="pb-2 pt-3 px-4">
                <CardTitle className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tags</CardTitle>
              </CardHeader>
              <CardContent className="pb-4 px-4">
                <div className="flex flex-wrap gap-1.5">
                  {order.tags.split(",").map((tag) => tag.trim()).filter(Boolean).map((tag) => (
                    <span key={tag} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs border border-gray-200">
                      {tag}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
