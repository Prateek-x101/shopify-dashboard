import { useParams, Link } from "wouter";
import {
  useGetAbandonedCheckouts,
  getGetAbandonedCheckoutsQueryKey
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { ArrowLeft, ExternalLink, MapPin, Copy, Check, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WhatsAppChat } from "@/components/orders/WhatsAppChat";
import { EmailChat } from "@/components/orders/EmailChat";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

export default function AbandonedCheckoutDetail() {
  const { id } = useParams();
  const [copied, setCopied] = useState(false);

  const { data, isLoading } = useGetAbandonedCheckouts({
    query: { queryKey: getGetAbandonedCheckoutsQueryKey() },
  });

  const checkout = data?.checkouts?.find((c) => c.id === id);

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

  if (!checkout) {
    return <div className="p-8 text-center text-gray-500">Abandoned checkout not found.</div>;
  }

  const customerName = checkout.customer
    ? `${checkout.customer.first_name || ""} ${checkout.customer.last_name || ""}`.trim()
    : "Anonymous Customer";

  const totalItems = checkout.line_items?.reduce((acc, item) => acc + item.quantity, 0) || 0;

  const handleCopyLink = () => {
    if (!checkout.abandoned_checkout_url) return;
    navigator.clipboard.writeText(checkout.abandoned_checkout_url);
    setCopied(true);
    toast.success("Recovery link copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/abandoned-checkouts"
          className="p-1.5 hover:bg-gray-100 rounded-md transition-colors text-gray-500 hover:text-gray-900 border border-gray-200 bg-white shadow-sm"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{checkout.name}</h1>
            <Badge
              variant="outline"
              className={
                checkout.source === "shiprocket"
                  ? "bg-orange-50 text-orange-700 border-orange-200"
                  : "bg-blue-50 text-blue-700 border-blue-200"
              }
            >
              {checkout.source === "shiprocket" ? "Shiprocket" : "Shopify"}
            </Badge>
            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
              Abandoned Cart
            </Badge>
          </div>
          <div className="text-sm text-gray-500 mt-0.5">
            {formatDateTime(checkout.created_at)}
          </div>
        </div>
      </div>

      {/* Recovery Banner */}
      {checkout.abandoned_checkout_url && (
        <Card className="border-amber-200 bg-amber-50/50 shadow-sm">
          <CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-0.5">
              <h4 className="text-sm font-semibold text-amber-800">Checkout Recovery Available</h4>
              <p className="text-xs text-amber-700">
                You can copy the recovery link to send manually, or use the email/WhatsApp chats on the right.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyLink}
                className="bg-white border-amber-300 text-amber-800 hover:bg-amber-100/50 text-xs"
              >
                {copied ? <Check className="w-3.5 h-3.5 mr-1.5 text-green-600" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
                Copy Recovery Link
              </Button>
              <a
                href={checkout.abandoned_checkout_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button size="sm" className="bg-[#008060] hover:bg-[#006e52] text-xs">
                  <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Open Checkout Page
                </Button>
              </a>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Layout Columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
        {/* Left Column (Items & Pricing) */}
        <div className="md:col-span-2 space-y-5">
          <Card className="shadow-sm border-gray-200 overflow-hidden">
            <CardHeader className="pb-3 border-b border-gray-100 bg-gray-50/50">
              <CardTitle className="text-sm font-semibold text-gray-900">
                Cart Items ({totalItems})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 bg-white">
              <div className="divide-y divide-gray-100">
                {checkout.line_items?.map((item, idx) => (
                  <div key={idx} className="p-4 flex items-center justify-between hover:bg-gray-50/50">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-gray-50 rounded border border-gray-200 flex items-center justify-center overflow-hidden shadow-sm text-gray-400 text-xs font-semibold">
                        🛒
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
                        {formatCurrency(item.price, checkout.currency)} × {item.quantity}
                      </div>
                      <div className="text-sm font-medium text-gray-900 mt-0.5">
                        {formatCurrency(
                          (parseFloat(item.price) * item.quantity).toFixed(2),
                          checkout.currency
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Summary Summary */}
              <div className="p-4 bg-gray-50/30 border-t border-gray-100 text-sm space-y-2">
                <div className="flex justify-between text-gray-500 text-xs">
                  <span>Subtotal</span>
                  <span>{formatCurrency(checkout.total_price, checkout.currency)}</span>
                </div>
                <div className="flex justify-between font-semibold text-gray-900 border-t border-gray-100 pt-2 text-sm">
                  <span>Total Potential Value</span>
                  <span>{formatCurrency(checkout.total_price, checkout.currency)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column (WhatsApp, Email & Customer Details) */}
        <div className="space-y-5">
          {/* WhatsApp Chat widget */}
          <WhatsAppChat
            customerName={customerName}
            customerPhone={checkout.customer?.phone ?? undefined}
            orderName={checkout.name}
            orderId={checkout.id}
          />

          {/* Email Chat widget */}
          <EmailChat
            customerName={customerName}
            customerEmail={checkout.customer?.email ?? undefined}
            orderName={checkout.name}
            orderId={checkout.id}
          />

          {/* Customer profile */}
          <Card className="shadow-sm border-gray-200">
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Customer Details</CardTitle>
            </CardHeader>
            <CardContent className="pb-4 px-4 space-y-4 text-sm">
              <div>
                <div className="font-semibold text-gray-900">{customerName}</div>
              </div>

              {(checkout.customer?.email || checkout.customer?.phone) && (
                <div className="pt-3 border-t border-gray-100">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    Contact information
                  </div>
                  {checkout.customer.email && (
                    <a
                      href={`mailto:${checkout.customer.email}`}
                      className="text-blue-600 hover:underline flex items-center gap-1 text-xs break-all mb-1"
                    >
                      {checkout.customer.email}
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  )}
                  {checkout.customer.phone && (
                    <div className="text-xs text-gray-700 font-mono mt-1">
                      {checkout.customer.phone}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
