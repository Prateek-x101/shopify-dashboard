import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  useGetSettings, useUpdateSettings, getGetSettingsQueryKey,
  useGetWhatsappStatus, getGetWhatsappStatusQueryKey,
  useConnectWhatsapp, useDisconnectWhatsapp,
  useListWhatsappRules, getListWhatsappRulesQueryKey,
  useCreateWhatsappRule, useDeleteWhatsappRule, useToggleWhatsappRule,
  useGetShopifyStatuses, getGetShopifyStatusesQueryKey,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  CheckCircle2, XCircle, Plus, Trash2, ToggleLeft, ToggleRight,
  Wifi, WifiOff, Loader2, Smartphone, RefreshCw, Zap, ImageIcon,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/* ── Tab type ─────────────────────────────────────────────────── */
type Tab = "general" | "whatsapp";

/* ── Trigger type colours ─────────────────────────────────────── */
const TYPE_COLOR: Record<string, string> = {
  order:       "bg-blue-100 text-blue-700 border-blue-200",
  fulfillment: "bg-purple-100 text-purple-700 border-purple-200",
  shipping:    "bg-green-100 text-green-700 border-green-200",
};

/* ── Template variable hints ──────────────────────────────────── */
const VARS = [
  "{customer_name}", "{order_name}", "{total}", "{tracking_url}",
  "{store_name}", "{product_name}", "{courier_name}", "{tracking_id}",
];

/* ───────────────────────────────────────────────────────────────
   General Settings Tab
─────────────────────────────────────────────────────────────── */
const storeFormSchema = z.object({ store_url: z.string().min(1, "Store URL is required") });

function ShiprocketStatusCard() {
  const { data, isLoading, refetch, isFetching } = useQuery<{
    configured: boolean; connected: boolean; email?: string; error?: string;
  }>({
    queryKey: ["shiprocket-status"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/shiprocket/status`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    refetchInterval: 60_000,
  });

  return (
    <Card className="shadow-sm border-gray-200 max-w-xl">
      <CardHeader className="pb-3 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-orange-500 flex items-center justify-center">
              <span className="text-white text-[10px] font-bold">SR</span>
            </div>
            <CardTitle className="text-base">Shiprocket</CardTitle>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>
        <CardDescription>Live delivery tracking via Shiprocket API</CardDescription>
      </CardHeader>
      <CardContent className="pt-4 space-y-3">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin" /> Checking connection…
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700">Status:</span>
              {data?.connected ? (
                <Badge variant="outline" className="bg-[#e2f1ea] text-[#00604b] border-[#bedbd0]">
                  <CheckCircle2 className="w-3 h-3 mr-1" /> Connected
                </Badge>
              ) : data?.configured ? (
                <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                  <XCircle className="w-3 h-3 mr-1" /> Auth Failed
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                  <XCircle className="w-3 h-3 mr-1" /> Not Configured
                </Badge>
              )}
            </div>
            {data?.email && (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">Account:</span>
                <span className="text-sm text-gray-500">{data.email}</span>
              </div>
            )}
            {data?.error && (
              <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 border border-red-100">
                {data.error}
              </div>
            )}
            {data?.connected && (
              <div className="text-xs text-gray-400">
                Delivery statuses auto-refresh every 3 minutes on the Orders page.
              </div>
            )}
            {!data?.configured && (
              <div className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
                Set <code className="font-mono">SHIPROCKET_EMAIL</code> and{" "}
                <code className="font-mono">SHIPROCKET_PASSWORD</code> in Secrets to enable live tracking.
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function GeneralTab() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useGetSettings({ query: { queryKey: getGetSettingsQueryKey() } });
  const updateSettings = useUpdateSettings();

  const form = useForm<z.infer<typeof storeFormSchema>>({
    resolver: zodResolver(storeFormSchema),
    defaultValues: { store_url: "" },
  });

  useEffect(() => {
    if (settings) form.reset({ store_url: settings.store_url || "" });
  }, [settings, form]);

  function onSubmit(values: z.infer<typeof storeFormSchema>) {
    updateSettings.mutate({ data: values }, {
      onSuccess: (data) => {
        toast.success("Settings updated");
        queryClient.setQueryData(getGetSettingsQueryKey(), data);
      },
      onError: () => toast.error("Failed to update settings"),
    });
  }

  if (isLoading) return <div className="py-8 text-center text-gray-400 text-sm">Loading…</div>;

  return (
    <div className="space-y-5 max-w-xl">
      <Card className="shadow-sm border-gray-200">
        <CardHeader>
          <CardTitle className="text-base">Store Connection</CardTitle>
          <CardDescription>Configure your Shopify store URL to sync orders.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700">API Status:</span>
            {settings?.api_configured ? (
              <Badge variant="outline" className="bg-[#e2f1ea] text-[#00604b] border-[#bedbd0]">
                <CheckCircle2 className="w-3 h-3 mr-1" /> Configured
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                <XCircle className="w-3 h-3 mr-1" /> Not Configured
              </Badge>
            )}
          </div>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="store_url" render={({ field }) => (
                <FormItem>
                  <FormLabel>Shopify Store URL</FormLabel>
                  <FormControl>
                    <Input placeholder="your-store.myshopify.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <Button type="submit" disabled={updateSettings.isPending} className="bg-[#008060] hover:bg-[#006e52]">
                {updateSettings.isPending ? "Saving…" : "Save"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <ShiprocketStatusCard />
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────
   QR Code Panel — smooth fade-in on load
─────────────────────────────────────────────────────────────── */
function QrPanel({ qrDataUrl, onRefresh, refreshPending }: { qrDataUrl: string; onRefresh: () => void; refreshPending: boolean }) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="flex flex-col items-center gap-4 py-2">
      <div className="text-sm text-gray-700 font-medium text-center">
        Scan with WhatsApp on your phone
      </div>
      <div className="p-3 bg-white rounded-xl border-2 border-[#25d366]/30 shadow-sm relative">
        {!loaded && (
          <div className="w-48 h-48 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
          </div>
        )}
        <img
          src={qrDataUrl}
          alt="WhatsApp QR Code"
          onLoad={() => setLoaded(true)}
          className={`w-48 h-48 transition-opacity duration-500 ${loaded ? "opacity-100" : "opacity-0 absolute inset-3"}`}
        />
      </div>
      <div className="text-xs text-gray-500 text-center max-w-xs">
        Open WhatsApp → Menu → Linked Devices → Link a Device → Scan this QR code
      </div>
      <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshPending}>
        <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh QR
      </Button>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────
   WhatsApp Connection Card
─────────────────────────────────────────────────────────────── */
function WhatsAppConnectionCard() {
  const queryClient = useQueryClient();
  const { data: status, isLoading } = useGetWhatsappStatus({
    query: { queryKey: getGetWhatsappStatusQueryKey(), refetchInterval: 5000 },
  });
  const connect = useConnectWhatsapp();
  const disconnect = useDisconnectWhatsapp();

  function handleConnect() {
    connect.mutate(undefined, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetWhatsappStatusQueryKey() }),
      onError: () => toast.error("Could not start WhatsApp connection"),
    });
  }

  function handleDisconnect() {
    disconnect.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetWhatsappStatusQueryKey() });
        toast.success("WhatsApp disconnected");
      },
    });
  }

  return (
    <Card className="shadow-sm border-gray-200">
      <CardHeader className="pb-3 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-[#25d366]" xmlns="http://www.w3.org/2000/svg">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            <CardTitle className="text-base">WhatsApp Web</CardTitle>
          </div>
          {!isLoading && (
            <div className="flex items-center gap-1.5">
              {status?.connected ? (
                <><span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-xs text-green-600 font-medium">Connected</span></>
              ) : status?.state === "qr_ready" ? (
                <><span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                <span className="text-xs text-amber-600 font-medium">Waiting for scan</span></>
              ) : (
                <><span className="w-2 h-2 rounded-full bg-gray-300" />
                <span className="text-xs text-gray-500">Disconnected</span></>
              )}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : status?.connected ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#25d366]/10 flex items-center justify-center">
                <Smartphone className="w-5 h-5 text-[#25d366]" />
              </div>
              <div>
                <div className="text-sm font-semibold text-gray-900">{status.phone_number || "WhatsApp Connected"}</div>
                <div className="text-xs text-gray-400">Automation rules are active</div>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={handleDisconnect} className="text-red-600 border-red-200 hover:bg-red-50">
              <WifiOff className="w-4 h-4 mr-1.5" /> Disconnect
            </Button>
          </div>
        ) : status?.state === "qr_ready" && status.qr_data_url ? (
          <QrPanel qrDataUrl={status.qr_data_url} onRefresh={handleConnect} refreshPending={connect.isPending} />
        ) : (
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
              <Wifi className="w-7 h-7 text-gray-300" />
            </div>
            <div className="text-center">
              <div className="text-sm font-medium text-gray-700 mb-1">Connect WhatsApp Web</div>
              <div className="text-xs text-gray-400 max-w-xs">
                Link your WhatsApp number to send automated messages when Shopify order events occur
              </div>
            </div>
            <Button onClick={handleConnect} disabled={connect.isPending} className="bg-[#25d366] hover:bg-[#22c35e] text-white">
              {connect.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wifi className="w-4 h-4 mr-2" />}
              Generate QR Code
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ───────────────────────────────────────────────────────────────
   Rule Builder (create form)
─────────────────────────────────────────────────────────────── */
function RuleBuilder({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) {
  const queryClient = useQueryClient();
  const { data: statusesData } = useGetShopifyStatuses({ query: { queryKey: getGetShopifyStatusesQueryKey() } });
  const createRule = useCreateWhatsappRule();

  const [selectedStatus, setSelectedStatus] = useState<string>("");
  const [message, setMessage] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [sendImage, setSendImage] = useState(false);
  const [buttons, setButtons] = useState<{ id: string; body: string }[]>([]);
  const [footer, setFooter] = useState("");
  const [showButtonsPanel, setShowButtonsPanel] = useState(false);

  const statuses = statusesData?.statuses ?? [];
  const filtered = filterType === "all" ? statuses : statuses.filter((s) => s.type === filterType);

  const selected = statuses.find((s) => s.id === selectedStatus);

  // Auto-fill template when status chosen
  const DEFAULT_TEMPLATES: Record<string, string> = {
    order_placed:        "Hi {customer_name}! 🛒 Thank you for your order {order_name} worth {total}.\nProduct: {product_name}\nWe'll confirm it shortly!",
    payment_confirmed:   "Hi {customer_name}! 💰 Payment confirmed for order {order_name} ({total}).\nProduct: {product_name}\nWe're preparing it now.",
    order_shipped:       "Hi {customer_name}! 🚚 Your order {order_name} has been shipped!\nProduct: {product_name}\nCourier: {courier_name} | AWB: {tracking_id}\nTrack: {tracking_url}",
    pickup_pending:      "Hi {customer_name}! 🕐 Pickup is pending for your order {order_name}.\nCourier: {courier_name} | AWB: {tracking_id}\nWe'll update you once it's picked up.",
    pickup_scheduled:    "Hi {customer_name}! 📅 Pickup scheduled for your order {order_name}.\nCourier: {courier_name} | AWB: {tracking_id}",
    manifested:          "Hi {customer_name}! 📋 Your order {order_name} has been manifested.\nCourier: {courier_name} | AWB: {tracking_id}\nIt will be dispatched soon!",
    in_transit:          "Hi {customer_name}! 🛣️ Your order {order_name} is in transit.\nCourier: {courier_name} | AWB: {tracking_id}\nTrack: {tracking_url}",
    reached_destination: "Hi {customer_name}! 🏢 Your order {order_name} has reached the destination hub.\nCourier: {courier_name} | Tracking: {tracking_id}\nExpect delivery soon!",
    out_for_delivery:    "Hi {customer_name}! 🏍️ Your order {order_name} is out for delivery today!\nCourier: {courier_name} | AWB: {tracking_id}\nPlease keep your phone handy.",
    delivered:           "Hi {customer_name}! 🎉 Your order {order_name} has been delivered.\nProduct: {product_name}\nEnjoy! Need help? Reply here.",
    attempted_delivery:  "Hi {customer_name}! 🔔 Delivery of order {order_name} was attempted but couldn't be completed.\nCourier: {courier_name} | AWB: {tracking_id}\nWe'll retry tomorrow.",
    undelivered:         "Hi {customer_name}! ⚠️ Your order {order_name} could not be delivered.\nCourier: {courier_name} | AWB: {tracking_id}\nPlease contact us to resolve.",
    rto_initiated:       "Hi {customer_name}! ↩️ Your order {order_name} is being returned to us.\nAWB: {tracking_id}\nOur team will contact you shortly.",
    order_cancelled:     "Hi {customer_name}! ❌ Order {order_name} has been cancelled. Refund (if any) will be processed in 5-7 business days.",
  };

  function handleSelectStatus(id: string) {
    setSelectedStatus(id);
    if (!message && DEFAULT_TEMPLATES[id]) setMessage(DEFAULT_TEMPLATES[id]);
  }

  function handleSave() {
    if (!selectedStatus || !message.trim()) {
      toast.error("Select a trigger and add a message");
      return;
    }
    createRule.mutate(
      { data: { trigger_type: selected?.type ?? "order", trigger_status: selectedStatus, message_template: message, send_image: sendImage, buttons: buttons.filter(b => b.body.trim()), footer: footer.trim() || null } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListWhatsappRulesQueryKey() });
          toast.success("Rule created!");
          onSave();
        },
        onError: () => toast.error("Failed to create rule"),
      }
    );
  }

  return (
    <Card className="border-[#25d366]/40 shadow-sm bg-green-50/20">
      <CardHeader className="pb-3 border-b border-green-100">
        <CardTitle className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          <Zap className="w-4 h-4 text-[#25d366]" /> New Automation Rule
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="grid grid-cols-2 gap-4">
          {/* LEFT — Shopify Status Selector */}
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Trigger — Shopify Status
            </div>
            {/* Filter tabs */}
            <div className="flex gap-1 mb-3">
              {["all", "order", "fulfillment", "shipping"].map((t) => (
                <button
                  key={t}
                  onClick={() => setFilterType(t)}
                  className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors capitalize ${
                    filterType === t
                      ? "bg-gray-800 text-white border-gray-800"
                      : "text-gray-500 border-gray-200 hover:border-gray-400"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
              {filtered.map((s) => (
                <button
                  key={s.id}
                  onClick={() => handleSelectStatus(s.id)}
                  data-testid={`status-option-${s.id}`}
                  className={`w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-all ${
                    selectedStatus === s.id
                      ? "bg-[#075E54] text-white border-[#075E54] shadow-sm"
                      : "bg-white text-gray-700 border-gray-200 hover:border-gray-400 hover:bg-gray-50"
                  }`}
                >
                  <span className="text-base leading-none">{s.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{s.label}</div>
                    <div className={`text-[10px] truncate ${selectedStatus === s.id ? "text-green-200" : "text-gray-400"}`}>
                      {s.description}
                    </div>
                  </div>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium uppercase shrink-0 ${
                    selectedStatus === s.id
                      ? "bg-white/20 text-white border-white/30"
                      : (TYPE_COLOR[s.type] || "bg-gray-100 text-gray-500 border-gray-200")
                  }`}>
                    {s.type}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* RIGHT — Message Template */}
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Message to Send
            </div>
            {selected ? (
              <div className="mb-2 flex items-center gap-2 p-2.5 bg-white rounded-lg border border-gray-200">
                <span className="text-xl">{selected.emoji}</span>
                <div>
                  <div className="text-xs font-semibold text-gray-900">{selected.label}</div>
                  <div className="text-[10px] text-gray-400">{selected.description}</div>
                </div>
              </div>
            ) : (
              <div className="mb-2 p-2.5 bg-gray-50 rounded-lg border border-dashed border-gray-200 text-xs text-gray-400 text-center">
                ← Select a trigger first
              </div>
            )}
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your WhatsApp message here..."
              rows={7}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-[#25d366]/30 focus:border-[#25d366] placeholder-gray-300"
            />
            {/* Variable chips */}
            <div className="mt-2">
              <div className="text-[10px] text-gray-400 mb-1.5">Click to insert variable:</div>
              <div className="flex flex-wrap gap-1">
                {VARS.map((v) => (
                  <button
                    key={v}
                    onClick={() => setMessage((m) => m + v)}
                    className="text-[10px] px-2 py-0.5 bg-blue-50 text-blue-600 rounded border border-blue-200 hover:bg-blue-100 font-mono transition-colors"
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            {/* Send image toggle */}
            <div className="mt-3 flex items-center justify-between p-2.5 bg-white rounded-lg border border-gray-200">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-3.5 h-3.5 text-purple-500" />
                <div>
                  <div className="text-xs font-medium text-gray-800">Also send product image</div>
                  <div className="text-[10px] text-gray-400">Share the ordered product's image along with the message</div>
                </div>
              </div>
              <button
                onClick={() => setSendImage((v) => !v)}
                className="shrink-0 transition-colors"
                title={sendImage ? "Disable image sending" : "Enable image sending"}
              >
                {sendImage
                  ? <ToggleRight className="w-6 h-6 text-purple-500" />
                  : <ToggleLeft className="w-6 h-6 text-gray-300" />}
              </button>
            </div>

            {/* Buttons panel toggle */}
            <div className="mt-2 flex items-center justify-between p-2.5 bg-white rounded-lg border border-gray-200">
              <div className="flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                <div>
                  <div className="text-xs font-medium text-gray-800">Add quick-reply buttons</div>
                  <div className="text-[10px] text-gray-400">Up to 3 tap buttons shown below your message</div>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowButtonsPanel((v) => !v);
                  if (!showButtonsPanel && buttons.length === 0) {
                    setButtons([{ id: "1", body: "" }]);
                  }
                }}
                className="shrink-0 transition-colors"
              >
                {showButtonsPanel
                  ? <ToggleRight className="w-6 h-6 text-amber-500" />
                  : <ToggleLeft className="w-6 h-6 text-gray-300" />}
              </button>
            </div>

            {/* Buttons editor */}
            {showButtonsPanel && (
              <div className="mt-2 p-3 bg-amber-50 rounded-lg border border-amber-200 space-y-2">
                <div className="text-[10px] text-amber-700 font-semibold uppercase mb-1">Quick-reply buttons (max 3)</div>
                {buttons.map((btn, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-400 w-4 shrink-0">{idx + 1}.</span>
                    <input
                      type="text"
                      value={btn.body}
                      maxLength={20}
                      placeholder={["Track my order", "Need help", "Contact us"][idx] ?? "Button text"}
                      onChange={(e) => {
                        const updated = [...buttons];
                        updated[idx] = { ...updated[idx], body: e.target.value };
                        setButtons(updated);
                      }}
                      className="flex-1 text-xs border border-amber-300 rounded px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
                    />
                    <button
                      onClick={() => setButtons(buttons.filter((_, i) => i !== idx))}
                      className="text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                {buttons.length < 3 && (
                  <button
                    onClick={() => setButtons([...buttons, { id: String(buttons.length + 1), body: "" }])}
                    className="text-[10px] text-amber-600 hover:text-amber-800 flex items-center gap-1 mt-1 font-medium"
                  >
                    <Plus className="w-3 h-3" /> Add button
                  </button>
                )}
                <div className="mt-2">
                  <div className="text-[10px] text-gray-500 mb-1">Footer text (optional)</div>
                  <input
                    type="text"
                    value={footer}
                    maxLength={60}
                    placeholder="e.g. Reply STOP to unsubscribe"
                    onChange={(e) => setFooter(e.target.value)}
                    className="w-full text-xs border border-amber-300 rounded px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
                  />
                </div>
              </div>
            )}

            {/* Preview */}
            {message && (
              <div className="mt-3 p-2.5 bg-[#dcf8c6] rounded-xl rounded-tr-sm text-xs text-gray-800 shadow-sm border border-[#c3e6b0]">
                <div className="text-[9px] text-gray-500 mb-1 font-semibold uppercase">Preview</div>
                {sendImage && (
                  <div className="flex items-center gap-1 mb-1.5 text-[10px] text-purple-600 bg-purple-50 rounded px-2 py-1 border border-purple-200">
                    <ImageIcon className="w-3 h-3" /> Product image will be sent with this message
                  </div>
                )}
                <div className="whitespace-pre-wrap">
                  {message
                    .replace(/\{customer_name\}/g, "Rahul Sharma")
                    .replace(/\{order_name\}/g, "#1084")
                    .replace(/\{total\}/g, "₹2,400")
                    .replace(/\{tracking_url\}/g, "track.delhivery.com/ABC123")
                    .replace(/\{store_name\}/g, "Your Store")
                    .replace(/\{product_name\}/g, "Black T-Shirt (L)")
                    .replace(/\{courier_name\}/g, "Delhivery")
                    .replace(/\{tracking_id\}/g, "123456789012")}
                </div>
                {footer && <div className="mt-1 text-[9px] text-gray-400 italic">{footer}</div>}
                {showButtonsPanel && buttons.filter(b => b.body.trim()).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1 border-t border-[#b2dfb2] pt-2">
                    {buttons.filter(b => b.body.trim()).map((btn, i) => (
                      <span key={i} className="text-[10px] px-3 py-1 bg-white rounded-full border border-[#25d366] text-[#075E54] font-medium shadow-sm">
                        {btn.body}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-gray-100">
          <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!selectedStatus || !message.trim() || createRule.isPending}
            className="bg-[#075E54] hover:bg-[#064c44] text-white"
          >
            {createRule.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Zap className="w-4 h-4 mr-1.5" />}
            Save Rule
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ───────────────────────────────────────────────────────────────
   Saved Rules List
─────────────────────────────────────────────────────────────── */
function RulesList() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useListWhatsappRules({ query: { queryKey: getListWhatsappRulesQueryKey() } });
  const deleteRule = useDeleteWhatsappRule();
  const toggleRule = useToggleWhatsappRule();

  const rules = data?.rules ?? [];

  function handleDelete(id: string) {
    deleteRule.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListWhatsappRulesQueryKey() });
        toast.success("Rule deleted");
      },
    });
  }

  function handleToggle(id: string, enabled: boolean) {
    toggleRule.mutate({ id, data: { enabled: !enabled } }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListWhatsappRulesQueryKey() }),
    });
  }

  if (isLoading) return <div className="py-4 text-center text-gray-400 text-sm">Loading rules…</div>;
  if (rules.length === 0) return (
    <div className="py-8 text-center text-gray-400 text-sm border border-dashed border-gray-200 rounded-xl">
      No rules yet — click "Create Rule" to add one
    </div>
  );

  return (
    <div className="space-y-2">
      {rules.map((rule) => (
        <div
          key={rule.id}
          data-testid={`rule-${rule.id}`}
          className={`flex items-start gap-3 p-3.5 rounded-xl border transition-all ${
            rule.enabled ? "bg-white border-gray-200" : "bg-gray-50 border-gray-100 opacity-60"
          }`}
        >
          {/* Toggle */}
          <button
            onClick={() => handleToggle(rule.id, rule.enabled)}
            className="mt-0.5 shrink-0 text-gray-400 hover:text-[#25d366] transition-colors"
            title={rule.enabled ? "Disable rule" : "Enable rule"}
          >
            {rule.enabled
              ? <ToggleRight className="w-5 h-5 text-[#25d366]" />
              : <ToggleLeft className="w-5 h-5" />}
          </button>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-gray-900">{rule.trigger_label}</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium uppercase ${TYPE_COLOR[rule.trigger_type] || "bg-gray-100 text-gray-500 border-gray-200"}`}>
                {rule.trigger_type}
              </span>
              {rule.send_image && (
                <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-purple-50 text-purple-600 border border-purple-200 font-medium">
                  <ImageIcon className="w-2.5 h-2.5" /> Image
                </span>
              )}
              {rule.buttons && rule.buttons.length > 0 && (
                <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-medium">
                  <Zap className="w-2.5 h-2.5" /> {rule.buttons.length} btn{rule.buttons.length > 1 ? "s" : ""}
                </span>
              )}
              {!rule.enabled && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">Disabled</span>
              )}
            </div>
            <div className="mt-1.5 text-xs text-gray-500 bg-[#dcf8c6]/60 px-2.5 py-1.5 rounded-lg rounded-tr-sm border border-[#c3e6b0]/50 font-mono line-clamp-2 whitespace-pre-wrap">
              {rule.message_template}
            </div>
            {rule.buttons && rule.buttons.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {rule.buttons.map((btn, i) => (
                  <span key={i} className="text-[10px] px-2.5 py-0.5 bg-white rounded-full border border-[#25d366]/40 text-[#075E54] font-medium">
                    {btn.body}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Delete */}
          <button
            onClick={() => handleDelete(rule.id)}
            className="mt-0.5 shrink-0 text-gray-300 hover:text-red-500 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────
   WhatsApp Tab
─────────────────────────────────────────────────────────────── */
function WhatsAppTab() {
  const [showBuilder, setShowBuilder] = useState(false);

  return (
    <div className="space-y-5">
      {/* Connection card */}
      <WhatsAppConnectionCard />

      {/* Rules section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Automation Rules</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Auto-send WhatsApp messages when Shopify order events happen
            </p>
          </div>
          {!showBuilder && (
            <Button
              size="sm"
              onClick={() => setShowBuilder(true)}
              data-testid="create-rule-btn"
              className="bg-[#075E54] hover:bg-[#064c44] text-white"
            >
              <Plus className="w-4 h-4 mr-1.5" /> Create Rule
            </Button>
          )}
        </div>

        {showBuilder && (
          <div className="mb-4">
            <RuleBuilder
              onSave={() => setShowBuilder(false)}
              onCancel={() => setShowBuilder(false)}
            />
          </div>
        )}

        <RulesList />
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────
   Main Page
─────────────────────────────────────────────────────────────── */
export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("general");

  return (
    <div className="max-w-4xl mx-auto pb-12">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-400 mt-1">Configure your store and automation preferences</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-0 mb-6 border-b border-gray-200">
        <button
          onClick={() => setTab("general")}
          data-testid="tab-general"
          className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
            tab === "general"
              ? "border-[#008060] text-[#008060]"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          General
        </button>
        <button
          onClick={() => setTab("whatsapp")}
          data-testid="tab-whatsapp"
          className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
            tab === "whatsapp"
              ? "border-[#25d366] text-[#075E54]"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current" xmlns="http://www.w3.org/2000/svg">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
          WhatsApp
        </button>
      </div>

      {tab === "general" ? <GeneralTab /> : <WhatsAppTab />}
    </div>
  );
}
