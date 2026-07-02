import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  useGetAbandonedCheckouts,
  getGetAbandonedCheckoutsQueryKey
} from "@workspace/api-client-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Search,
  Copy,
  ExternalLink,
  ShoppingCart,
  Mail,
  Smartphone,
  Calendar,
  Layers,
  Sparkles,
  Link2,
} from "lucide-react";

export default function AbandonedCheckouts() {
  const [searchTerm, setSearchTerm] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"all" | "shopify" | "shiprocket">("all");

  const { data, isLoading, error } = useGetAbandonedCheckouts({
    query: {
      queryKey: getGetAbandonedCheckoutsQueryKey(),
      refetchInterval: 10000, // Refresh checkouts list every 10 seconds
    }
  });

  const checkouts = data?.checkouts ?? [];

  // Filtering
  const filteredCheckouts = checkouts.filter((c) => {
    const customer = c.customer;
    const name = `${customer?.first_name ?? ""} ${customer?.last_name ?? ""}`.toLowerCase();
    const email = (customer?.email ?? "").toLowerCase();
    const phone = (customer?.phone ?? "").toLowerCase();
    const id = c.id.toLowerCase();
    const query = searchTerm.toLowerCase();

    const matchesSearch =
      name.includes(query) ||
      email.includes(query) ||
      phone.includes(query) ||
      id.includes(query);

    const matchesSource =
      sourceFilter === "all" || c.source === sourceFilter;

    return matchesSearch && matchesSource;
  });

  // Calculate metrics
  const totalCount = checkouts.length;
  const shiprocketCount = checkouts.filter((c) => c.source === "shiprocket").length;
  const shopifyCount = checkouts.filter((c) => c.source === "shopify").length;
  
  const totalValue = checkouts.reduce((sum, c) => sum + parseFloat(c.total_price), 0);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Recovery link copied to clipboard!");
  };

  const formatDateTime = (iso: string) => {
    const d = new Date(iso);
    return `${d.toLocaleDateString([], { month: "short", day: "numeric" })} at ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <ShoppingCart className="w-6 h-6 text-[#008060]" />
          Abandoned Checkouts
        </h1>
        <p className="text-sm text-gray-500">
          Track customers who abandoned their checkout funnels. Send recovery links via WhatsApp or Gmail.
        </p>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="shadow-sm border-gray-200">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total Abandoned</p>
                <h3 className="text-2xl font-bold text-gray-900 mt-1">{totalCount}</h3>
              </div>
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center text-red-600 text-lg">
                🛒
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-gray-200">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Potential Recovery Value</p>
                <h3 className="text-2xl font-bold text-[#008060] mt-1">
                  ₹{totalValue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </h3>
              </div>
              <div className="w-10 h-10 rounded-full bg-[#e2f1ea] flex items-center justify-center text-[#00604b] text-lg font-bold">
                ₹
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-gray-200">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Shiprocket / Fastr Carts</p>
                <h3 className="text-2xl font-bold text-orange-600 mt-1">{shiprocketCount}</h3>
              </div>
              <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center text-orange-600 font-bold text-xs">
                SR
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-gray-200">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Shopify Carts</p>
                <h3 className="text-2xl font-bold text-blue-600 mt-1">{shopifyCount}</h3>
              </div>
              <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 font-bold text-xs">
                SH
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter and Search Section */}
      <div className="flex flex-col md:flex-row gap-3 items-center justify-between bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search by name, email, phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 bg-gray-50 border-gray-200"
          />
        </div>

        {/* Source Filters */}
        <div className="flex bg-gray-100 p-1 rounded-lg self-stretch md:self-auto">
          <button
            onClick={() => setSourceFilter("all")}
            className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${
              sourceFilter === "all"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            All Sources
          </button>
          <button
            onClick={() => setSourceFilter("shopify")}
            className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${
              sourceFilter === "shopify"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-gray-500 hover:text-blue-600"
            }`}
          >
            Shopify
          </button>
          <button
            onClick={() => setSourceFilter("shiprocket")}
            className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${
              sourceFilter === "shiprocket"
                ? "bg-orange-500 text-white shadow-sm"
                : "text-gray-500 hover:text-orange-500"
            }`}
          >
            Shiprocket Webhook
          </button>
        </div>
      </div>

      {/* Main List */}
      <Card className="shadow-sm border-gray-200 overflow-hidden">
        <CardHeader className="pb-3 border-b border-gray-100">
          <CardTitle className="text-base">Checkouts List</CardTitle>
          <CardDescription>
            Showing {filteredCheckouts.length} abandoned checkout sessions
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-20 text-center text-gray-400 text-sm">
              Loading abandoned checkouts…
            </div>
          ) : error ? (
            <div className="py-20 text-center text-red-500 text-sm">
              Failed to load abandoned checkouts.
            </div>
          ) : filteredCheckouts.length === 0 ? (
            <div className="py-20 text-center text-gray-400 text-sm">
              No abandoned checkouts found matching your criteria.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50/50 border-b border-gray-100 text-gray-400 text-xs font-semibold tracking-wider">
                    <th className="py-3 px-4">Checkout ID</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Customer</th>
                    <th className="py-3 px-4">Items</th>
                    <th className="py-3 px-4">Total</th>
                    <th className="py-3 px-4">Source</th>
                    <th className="py-3 px-4 text-right">Recovery Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-xs">
                  {filteredCheckouts.map((c) => {
                    const customerName = c.customer
                      ? `${c.customer.first_name ?? ""} ${c.customer.last_name ?? ""}`.trim()
                      : "Anonymous Customer";

                    return (
                      <tr key={c.id} className="hover:bg-gray-50/40 transition-colors">
                        {/* ID */}
                        <td className="py-4 px-4 font-mono font-medium text-gray-700">
                          {c.name}
                        </td>

                        {/* Date */}
                        <td className="py-4 px-4 text-gray-500">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 shrink-0" />
                            {formatDateTime(c.created_at)}
                          </span>
                        </td>

                        {/* Customer */}
                        <td className="py-4 px-4">
                          <div className="space-y-0.5">
                            <div className="font-semibold text-gray-900">{customerName}</div>
                            {c.customer?.email && (
                              <div className="text-[11px] text-gray-400 flex items-center gap-1">
                                <Mail className="w-3 h-3" /> {c.customer.email}
                              </div>
                            )}
                            {c.customer?.phone && (
                              <div className="text-[11px] text-gray-400 flex items-center gap-1">
                                <Smartphone className="w-3 h-3" /> {c.customer.phone}
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Items */}
                        <td className="py-4 px-4">
                          <div className="max-w-[200px] space-y-1">
                            {c.line_items.map((item, idx) => (
                              <div key={idx} className="text-gray-600 truncate" title={`${item.title} (x${item.quantity})`}>
                                <span className="font-medium text-gray-900">{item.quantity}x</span> {item.title}
                              </div>
                            ))}
                          </div>
                        </td>

                        {/* Total Price */}
                        <td className="py-4 px-4 font-semibold text-gray-950">
                          ₹{parseFloat(c.total_price).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </td>

                        {/* Source */}
                        <td className="py-4 px-4">
                          {c.source === "shiprocket" ? (
                            <Badge className="bg-orange-50 text-orange-700 border-orange-100 hover:bg-orange-50">
                              Shiprocket Checkout
                            </Badge>
                          ) : (
                            <Badge className="bg-blue-50 text-blue-700 border-blue-100 hover:bg-blue-50">
                              Shopify
                            </Badge>
                          )}
                        </td>

                        {/* Recovery actions */}
                        <td className="py-4 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {c.abandoned_checkout_url ? (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => copyToClipboard(c.abandoned_checkout_url!)}
                                  className="h-8 border-gray-200 text-gray-600 hover:text-gray-900"
                                >
                                  <Copy className="w-3.5 h-3.5 mr-1" /> Copy Link
                                </Button>
                                <a
                                  href={c.abandoned_checkout_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 border-gray-200 text-gray-600 hover:text-gray-900"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </Button>
                                </a>
                              </>
                            ) : (
                              <span className="text-xs italic text-gray-400">No link</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
