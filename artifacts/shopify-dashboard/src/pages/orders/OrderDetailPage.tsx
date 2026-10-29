import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useRoute, useSearch } from "wouter";
import {
  ArrowLeft,
  ChevronUp,
  ChevronDown,
  ExternalLink,
  Copy,
  MapPin,
  AlertTriangle,
  Truck,
  Pencil,
  Loader2,
  MessageCircle,
  Phone,
  Mail,
  ShieldAlert,
  Megaphone,
  Smartphone,
  Monitor,
  Tablet,
  Info,
  Tags,
  History,
  Compass,
  Video,
  Package,
  CreditCard,
  StickyNote,
  User,
  Trash2,
  ChevronDown as ChevronDownIcon,
} from "lucide-react";
import { toast } from "sonner";
import { api, patch, post, put } from "@/lib/api";
import { money, dateTime, dateShort, phone as fmtPhone, ago } from "@/lib/format";
import type { OrderDetail, Address, TimelineItem } from "@/lib/types";
import { rtoRisk } from "@/lib/orders";
import { readOrderNav, orderPath } from "@/lib/order-nav";
import { useStores } from "@/hooks/use-stores";
import { Button } from "@/components/ui/button";
import { ChatPopup } from "@/components/chat/ChatPopup";
import { SrStatus, PaymentBadge, FulfillmentBadge, ProductThumb, CartStatus, StoreTag, Pill } from "@/components/common/Status";
import { ShiprocketResultsDialog, type SrActionResponse } from "./ShiprocketResults";
import { ShipProgressFull } from "@/components/orders/ShipProgress";
import { ShipDialog } from "@/components/orders/ShipDialog";
import { NdrDialog } from "@/components/orders/NdrDialog";
import { nextAction } from "@/components/orders/NextAction";
import { QualityDetails } from "@/components/orders/Quality";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface Tracking {
  current: string | null;
  etd: string | null;
  trackUrl: string;
  activities: { date: string; status: string; activity: string; location: string }[];
  error?: string;
}

export default function OrderDetailPage() {
  const [, params] = useRoute("/orders/:ref");
  const [location, navigate] = useLocation();
  const search = useSearch();
  const { stores } = useStores();
  const multiStore = stores.length > 1;
  const ref = decodeURIComponent(params?.ref ?? "");
  const storeParam = new URLSearchParams(search).get("store");
  const qc = useQueryClient();

  // URL carries the order number; the API works with our internal id
  const { data: resolved, isLoading: resolving, error: resolveError } = useQuery({
    queryKey: ["order-ref", ref, storeParam],
    queryFn: () => api<{ id: number }>(`/orders/by-name/${encodeURIComponent(ref)}${storeParam ? `?store=${storeParam}` : ""}`),
    enabled: !!ref,
    staleTime: Infinity,
  });
  const orderId = resolved?.id ?? NaN;
  const queryKey = ["order", orderId];

  const nav = useMemo(() => readOrderNav(), []);
  const current = `${location}${search ? `?${search}` : ""}`;
  const idx = nav.paths.indexOf(current);
  const prevPath = idx > 0 ? nav.paths[idx - 1] : null;
  const nextPath = idx >= 0 && idx < nav.paths.length - 1 ? nav.paths[idx + 1] : null;

  const { data: o, isLoading: loadingOrder, error: orderError } = useQuery({
    queryKey,
    queryFn: () => api<OrderDetail>(`/orders/${orderId}`),
    enabled: Number.isFinite(orderId),
    refetchInterval: 15_000,
  });
  const isLoading = resolving || loadingOrder;
  const error = resolveError ?? orderError;
  const { data: tracking, isFetching: trackLoading } = useQuery({
    queryKey: ["tracking", orderId, o?.awb],
    queryFn: () => api<Tracking | null>(`/orders/${orderId}/tracking`),
    enabled: !!o?.awb,
    staleTime: 5 * 60_000,
  });
  const [srResult, setSrResult] = useState<SrActionResponse | null>(null);
  const [editAddr, setEditAddr] = useState(false);
  const [chatSignal, setChatSignal] = useState<{ n: number; channel: "whatsapp" | "email" }>({ n: 0, channel: "whatsapp" });
  const openChat = (channel: "whatsapp" | "email") => setChatSignal((s) => ({ n: s.n + 1, channel }));

  const refresh = () => {
    qc.invalidateQueries({ queryKey });
    qc.invalidateQueries({ queryKey: ["timeline", orderId] });
    qc.invalidateQueries({ queryKey: ["orders"] });
  };

  const [shipOpen, setShipOpen] = useState(false);
  const [ndrOpen, setNdrOpen] = useState(false);
  const complaint = useMutation({
    mutationFn: (status: "open" | "resolved" | null) => patch(`/orders/${orderId}/complaint`, { status }),
    onSuccess: () => refresh(),
    onError: (e: Error) => toast.error(e.message),
  });

  const sr = useMutation({
    mutationFn: (action: string) => post<SrActionResponse>("/orders/shiprocket", { action, orderIds: [orderId] }),
    onSuccess: (r, action) => {
      const single = r.results[0];
      if (r.files.length) setSrResult({ ...r, action });
      else if (single?.ok) toast.success(single.message);
      else toast.error(single?.message ?? "Failed");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ↑ / ↓ (or k / j) move through the list the order was opened from
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, select, [contenteditable=true], [role=dialog]")) return;
      if ((e.key === "ArrowUp" || e.key === "k") && prevPath) (e.preventDefault(), navigate(prevPath));
      if ((e.key === "ArrowDown" || e.key === "j") && nextPath) (e.preventDefault(), navigate(nextPath));
      if (e.key === "Escape") navigate(nav.back);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prevPath, nextPath, nav.back, navigate]);
  useEffect(() => setEditAddr(false), [orderId]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error || !o) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted-foreground">Order not found.</p>
        <Button size="sm" variant="outline" onClick={() => navigate("/")}>
          Back to orders
        </Button>
      </div>
    );
  }

  const first = o.lineItems[0];
  const vars: Record<string, string> = {
    name: o.customerName ?? "",
    first_name: (o.customerName ?? "").split(" ")[0],
    order: o.name,
    total: money(o.totalPrice),
    product: first ? [first.title, first.variantTitle].filter(Boolean).join(" - ") : "",
    awb: o.awb ?? "",
    courier: o.courier ?? "",
    tracking_url: o.awb ? `https://shiprocket.co/tracking/${o.awb}` : "",
    store: o.store?.name ?? "",
    image: first?.imageUrl ?? "",
  };
  const risk = rtoRisk(o.tags);
  const ins = o.insights;
  const copy = (v: string, what = "Copied") => {
    navigator.clipboard.writeText(v);
    toast.success(what);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b bg-card px-4 py-2.5">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(nav.back)} title="Back to orders (Esc)">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold">{o.name}</h1>
            <PaymentBadge method={o.paymentMethod} financial={o.financialStatus} />
            <FulfillmentBadge status={o.fulfillmentStatus} cancelled={!!o.cancelledAt} />
            <SrStatus code={o.srStatusCode} raw={o.srStatus} />
            {(risk === "high" || risk === "very-high") && (
              <Pill className="bg-red-50 text-red-700 ring-red-200">
                <ShieldAlert className="h-3 w-3" /> {risk === "very-high" ? "Very high" : "High"} RTO risk
              </Pill>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            {dateTime(o.createdAt)}
            <StoreTag name={o.store?.name} color={o.store?.color} />
            {ins.device && (
              <span className="flex items-center gap-1">
                · <DeviceIcon type={ins.device.type} className="h-3 w-3" /> {ins.device.inApp ?? ins.device.type}
              </span>
            )}
            {ins.utm?.source && <span>· {ins.utm.source}</span>}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1">
          {idx >= 0 && (
            <>
              <span className="mr-1 hidden text-xs tabular-nums text-muted-foreground sm:inline">
                {idx + 1} / {nav.paths.length}
              </span>
              <Button variant="outline" size="icon" className="h-8 w-8" disabled={!prevPath} onClick={() => prevPath && navigate(prevPath)} title="Previous order (↑)">
                <ChevronUp className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8" disabled={!nextPath} onClick={() => nextPath && navigate(nextPath)} title="Next order (↓)">
                <ChevronDown className="h-4 w-4" />
              </Button>
            </>
          )}
          {o.shopifyAdminUrl && (
            <Button variant="outline" size="sm" className="ml-1" asChild>
              <a href={o.shopifyAdminUrl} target="_blank" rel="noreferrer">
                Shopify <ExternalLink className="ml-1 h-3.5 w-3.5" />
              </a>
            </Button>
          )}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto bg-muted/40">
        <div>
          <div className="mx-auto grid max-w-[1500px] gap-4 p-4 pb-24 lg:grid-cols-[minmax(0,1.6fr)_minmax(280px,1fr)]">
            {/* main column */}
            <div className="min-w-0 space-y-4">
              {o.complaintStatus === "open" && (
                <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                  <AlertTriangle className="h-5 w-5 shrink-0" />
                  <div className="flex-1">
                    <p className="font-semibold">Customer complaint</p>
                    <p className="text-xs text-red-700">Raised {o.complaintAt ? ago(o.complaintAt) : "recently"}. Reply from the chat, then mark it resolved.</p>
                  </div>
                  <Button size="sm" variant="outline" className="border-red-300 bg-white" onClick={() => openChat(o.phone ? "whatsapp" : "email")}>
                    Reply
                  </Button>
                  <Button size="sm" onClick={() => complaint.mutate("resolved")} disabled={complaint.isPending}>
                    Mark resolved
                  </Button>
                </div>
              )}

              <Card
                title="Shipping"
                icon={Truck}
                action={
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-7 text-xs">
                        More <ChevronDownIcon className="ml-1 h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {o.srShipmentId && <DropdownMenuItem onClick={() => sr.mutate("label")}>Download label</DropdownMenuItem>}
                      {o.srShipmentId && <DropdownMenuItem onClick={() => sr.mutate("invoice")}>Download invoice</DropdownMenuItem>}
                      {o.awb && o.srStatusCode === "awb_assigned" && <DropdownMenuItem onClick={() => sr.mutate("pickup")}>Schedule pickup</DropdownMenuItem>}
                      {!o.srOrderId && !o.cancelledAt && <DropdownMenuItem onClick={() => sr.mutate("push")}>Only push to Shiprocket (no AWB)</DropdownMenuItem>}
                      <DropdownMenuItem onClick={() => complaint.mutate(o.complaintStatus === "open" ? null : "open")}>
                        {o.complaintStatus === "open" ? "Remove complaint flag" : "Mark as complaint"}
                      </DropdownMenuItem>
                      {o.srOrderId && !["cancelled", "delivered", "rto_delivered"].includes(o.srStatusCode ?? "") && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive" onClick={() => confirm(`Cancel ${o.name} in Shiprocket?`) && sr.mutate("cancel")}>
                            Cancel in Shiprocket
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                }
              >
                <ShipProgressFull o={o} />
                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 text-xs">
                  {o.awb ? (
                    <span className="flex items-center gap-1">
                      AWB <span className="font-mono font-medium">{o.awb}</span>
                      <IconBtn icon={Copy} title="Copy AWB" onClick={() => copy(o.awb!, "AWB copied")} />
                    </span>
                  ) : (
                    <span className="text-muted-foreground">No AWB yet</span>
                  )}
                  {o.courier && <span>{o.courier}</span>}
                  {o.srOrderId && <span className="text-muted-foreground">SR #{o.srOrderId}</span>}
                  {(tracking?.etd || o.srMeta?.etd) && !o.srMeta?.deliveredAt && <span className="text-muted-foreground">ETA {dateShort(tracking?.etd ?? o.srMeta!.etd!)}</span>}
                  {o.srMeta?.shippingCharges && <span className="text-muted-foreground">Freight {money(o.srMeta.shippingCharges)}</span>}
                  {o.shopifyFulfilledAt ? (
                    <span className="text-emerald-700">✓ Fulfilled in Shopify</span>
                  ) : o.shopifyFulfillError ? (
                    <span className="flex items-center gap-1 text-destructive" title={o.shopifyFulfillError}>
                      Shopify not updated
                      <button className="underline" onClick={async () => {
                          const r = await post<{ at: string | null; err: string | null }>(`/orders/${o.id}/fulfill-shopify`);
                          if (r?.at) toast.success("Fulfilled in Shopify");
                          else toast.error(r?.err ?? "Failed");
                          refresh();
                        }}>
                        retry
                      </button>
                    </span>
                  ) : o.awb ? (
                    <span className="text-muted-foreground">Updating Shopify…</span>
                  ) : null}
                  <div className="ml-auto flex flex-wrap gap-1.5">
                    {(() => {
                      const a = nextAction(o);
                      if (a.kind === "ship" || a.kind === "fix-address")
                        return (
                          <Button size="sm" className="h-8" onClick={() => (a.kind === "fix-address" ? setEditAddr(true) : setShipOpen(true))}>
                            <Truck className="mr-1.5 h-4 w-4" /> {a.kind === "fix-address" ? "Fix address first" : "Ship order"}
                          </Button>
                        );
                      if (a.kind === "pickup")
                        return (
                          <Button size="sm" className="h-8" onClick={() => sr.mutate("pickup")} disabled={sr.isPending}>
                            Schedule pickup
                          </Button>
                        );
                      if (a.kind === "label")
                        return o.labelUrl ? (
                          <Button size="sm" className="h-8" asChild>
                            <a href={o.labelUrl} target="_blank" rel="noreferrer">
                              Print label
                            </a>
                          </Button>
                        ) : (
                          <Button size="sm" className="h-8" onClick={() => sr.mutate("label")} disabled={sr.isPending}>
                            Get label
                          </Button>
                        );
                      if (a.kind === "ndr")
                        return (
                          <Button size="sm" className="h-8 bg-orange-500 hover:bg-orange-600" onClick={() => setNdrOpen(true)}>
                            Handle NDR
                          </Button>
                        );
                      return null;
                    })()}
                    {o.awb && (
                      <Button variant="outline" size="sm" className="h-8" asChild>
                        <a href={o.srMeta?.trackUrl || tracking?.trackUrl || `https://shiprocket.co/tracking/${o.awb}`} target="_blank" rel="noreferrer">
                          Track <ExternalLink className="ml-1 h-3 w-3" />
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
                {o.awb && (tracking?.activities?.length || trackLoading || tracking?.error) ? (
                  <details className="mt-3 border-t pt-3" open={(tracking?.activities?.length ?? 0) > 0}>
                    <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Courier scans</summary>
                    {trackLoading && <Loader2 className="mt-2 h-4 w-4 animate-spin text-muted-foreground" />}
                    {tracking?.error && <p className="mt-2 text-xs text-muted-foreground">{tracking.error}</p>}
                    <ol className="mt-2 space-y-2">
                      {tracking?.activities.slice(0, 10).map((a, i) => (
                        <li key={i} className="flex gap-2 text-xs">
                          <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", i === 0 ? "bg-primary" : "bg-border")} />
                          <div>
                            <p className={cn(i === 0 && "font-medium")}>{a.activity || a.status}</p>
                            <p className="text-muted-foreground">
                              {a.location} · {a.date}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </details>
                ) : null}
              </Card>

              <Card title={`Items (${o.itemCount})`} icon={Package}>
                <div className="divide-y">
                  {o.lineItems.map((li, i) => (
                    <div key={i} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                      <ProductThumb src={li.imageUrl} title={li.title} size={52} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{li.title}</p>
                        <p className="text-xs text-muted-foreground">{[li.variantTitle, li.sku].filter(Boolean).join(" · ")}</p>
                      </div>
                      <div className="text-right text-xs">
                        <p className="text-muted-foreground">
                          {money(li.price)} × {li.quantity}
                        </p>
                        <p className="font-medium">{money(Number(li.price) * li.quantity)}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 space-y-1 border-t pt-3 text-[13px]">
                  {o.extra.subtotal !== undefined && <Row label="Subtotal" value={money(o.extra.subtotal)} />}
                  {Number(o.extra.discounts) > 0 && <Row label={`Discount ${o.extra.discountCodes.join(", ")}`} value={`−${money(o.extra.discounts)}`} />}
                  {o.extra.shipping !== undefined && <Row label={`Shipping${ins.shippingMethod ? ` · ${ins.shippingMethod}` : ""}`} value={money(o.extra.shipping)} />}
                  <Row label="Total" value={money(o.totalPrice)} bold />
                  <div className="flex items-center gap-1.5 pt-1 text-xs text-muted-foreground">
                    <CreditCard className="h-3.5 w-3.5" />
                    {o.extra.gateways.join(", ") || o.paymentMethod} · {o.financialStatus?.replace(/_/g, " ")}
                  </div>
                </div>
              </Card>

              {ins.journey && (
                <Card title="Customer journey" icon={Compass}>
                  <JourneyNote text={ins.journey} />
                </Card>
              )}

              <RecordingCard orderId={o.id} saved={o.recordingUrl} fromAttributes={ins.recordingFromAttributes} onChange={refresh} />

              <TimelineCard orderId={o.id} />
            </div>

            {/* side column */}
            <div className="min-w-0 space-y-4">
              {o.quality && (
                <Card title="Delivery check" icon={ShieldAlert}>
                  <QualityDetails q={o.quality} orderId={o.id} orderPathFor={(n) => orderPath(n, o.storeId, multiStore)} />
                </Card>
              )}
              <Card title="Customer" icon={User}>
                <p className="font-medium">{o.customerName || "—"}</p>
                {o.phone && (
                  <p className="mt-1 flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-3.5 w-3.5" /> {fmtPhone(o.phone)}
                    <IconBtn onClick={() => copy(o.phone!, "Phone copied")} icon={Copy} title="Copy phone" />
                    <a href={`https://wa.me/${o.phone}`} target="_blank" rel="noreferrer" title="Open in WhatsApp" className="text-emerald-600">
                      <MessageCircle className="h-3.5 w-3.5" />
                    </a>
                  </p>
                )}
                {o.email && (
                  <p className="mt-1 flex items-center gap-2 truncate text-muted-foreground">
                    <Mail className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{o.email}</span>
                  </p>
                )}
                <div className="mt-3 flex gap-2">
                  {o.phone && (
                    <Button size="sm" className="h-8 flex-1 bg-[#25D366] text-white hover:bg-[#1ebe5b]" onClick={() => openChat("whatsapp")}>
                      <MessageCircle className="mr-1.5 h-4 w-4" /> WhatsApp
                    </Button>
                  )}
                  {o.email && (
                    <Button size="sm" variant="outline" className="h-8 flex-1" onClick={() => openChat("email")}>
                      <Mail className="mr-1.5 h-4 w-4" /> Email
                    </Button>
                  )}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {o.otherOrders.length > 0 ? `${o.otherOrders.length + 1} orders from this customer` : "First order"}
                  {ins.acceptsMarketing === true && " · accepts marketing"}
                </p>
              </Card>

              <Card title="Shipping address" icon={MapPin} action={!o.awb && <IconBtn icon={Pencil} title="Edit address" onClick={() => setEditAddr(!editAddr)} />}>
                {o.addressIssue && (
                  <p className="mb-2 flex items-center gap-1.5 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">
                    <AlertTriangle className="h-3.5 w-3.5" /> {o.addressIssue}
                  </p>
                )}
                {editAddr ? (
                  <AddressForm
                    address={o.shippingAddress ?? {}}
                    orderId={o.id}
                    onSaved={() => {
                      setEditAddr(false);
                      refresh();
                    }}
                  />
                ) : (
                  <div className="space-y-0.5">
                    <p>{o.shippingAddress?.name}</p>
                    <p>{o.shippingAddress?.address1}</p>
                    {o.shippingAddress?.address2 && <p>{o.shippingAddress.address2}</p>}
                    <p>
                      {[o.shippingAddress?.city, o.shippingAddress?.province].filter(Boolean).join(", ")} {o.shippingAddress?.zip}
                    </p>
                    <button
                      className="mt-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() =>
                        copy(
                          [o.shippingAddress?.name, o.shippingAddress?.address1, o.shippingAddress?.address2, o.shippingAddress?.city, o.shippingAddress?.province, o.shippingAddress?.zip, o.phone && fmtPhone(o.phone)]
                            .filter(Boolean)
                            .join(", "),
                          "Address copied",
                        )
                      }
                    >
                      <Copy className="h-3 w-3" /> Copy address
                    </button>
                  </div>
                )}
              </Card>

              <Card title="Marketing source (UTM)" icon={Megaphone}>
                {ins.utm ? (
                  <dl className="space-y-1.5 text-xs">
                    <KV k="Source" v={ins.utm.source} />
                    <KV k="Medium" v={ins.utm.medium} />
                    <KV k="Campaign" v={ins.utm.campaign} />
                    <KV k="Ad set / content" v={ins.utm.content} />
                    <KV k="Term" v={ins.utm.term} mono />
                    <KV k="Campaign ID" v={ins.utm.campaignId} mono />
                    <KV k="Ad ID" v={ins.utm.adId} mono />
                    {(ins.utm.fbclid || ins.utm.gclid) && <KV k="Click ID" v={[ins.utm.fbclid && "Facebook (fbclid)", ins.utm.gclid && "Google (gclid)"].filter(Boolean).join(", ")} />}
                    {ins.landingPath && (
                      <div className="flex gap-2 pt-1">
                        <dt className="w-24 shrink-0 text-muted-foreground">Landing page</dt>
                        <dd className="min-w-0 truncate">
                          <a href={ins.landingPage ?? "#"} target="_blank" rel="noreferrer" className="text-primary hover:underline" title={ins.landingPage ?? ""}>
                            {ins.landingPath}
                          </a>
                        </dd>
                      </div>
                    )}
                  </dl>
                ) : (
                  <p className="text-xs text-muted-foreground">No UTM data on this order (direct / organic visit).</p>
                )}
              </Card>

              <Card title="Device" icon={Smartphone}>
                {ins.device ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <DeviceIcon type={ins.device.type} className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium">
                          {ins.device.type}
                          {ins.device.os && <span className="font-normal text-muted-foreground"> · {ins.device.os}</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">{[ins.device.inApp ?? ins.device.browser, ins.device.model].filter(Boolean).join(" · ")}</p>
                      </div>
                    </div>
                    {ins.userAgent && (
                      <details className="text-[11px] text-muted-foreground">
                        <summary className="cursor-pointer">User agent</summary>
                        <p className="mt-1 break-all font-mono">{ins.userAgent}</p>
                      </details>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Not recorded for this order.</p>
                )}
              </Card>

              <Card title="Additional info" icon={Info}>
                <dl className="space-y-1.5 text-xs">
                  <KV k="IP address" v={ins.ip} mono />
                  <KV k="Shipping" v={ins.shippingMethod} />
                  {ins.referrer && <KV k="Referrer" v={ins.referrer} />}
                  {ins.otherAttributes.map((a) => (
                    <KV key={a.name} k={a.name.replace(/_/g, " ")} v={a.value} mono={/id$/i.test(a.name)} />
                  ))}
                  {o.extra.discountCodes.length > 0 && <KV k="Discount codes" v={o.extra.discountCodes.join(", ")} />}
                </dl>
                {ins.orderStatusUrl && (
                  <a href={ins.orderStatusUrl} target="_blank" rel="noreferrer" className="mt-2 flex items-center gap-1 text-xs text-primary hover:underline">
                    Customer's order status page <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </Card>

              <Card title="Tags" icon={Tags}>
                <TagList tags={o.tags} />
              </Card>

              {(o.otherOrders.length > 0 || o.carts.length > 0) && (
                <Card title="Customer history" icon={History}>
                  <div className="space-y-1.5 text-xs">
                    {o.otherOrders.map((x) => (
                      <Link key={x.id} href={orderPath(x.name, x.storeId, multiStore)} className="flex items-center justify-between gap-2 rounded px-1 py-0.5 hover:bg-muted">
                        <span className="font-medium">{x.name}</span>
                        <span className="text-muted-foreground">{dateShort(x.createdAt)}</span>
                        <span>{money(x.totalPrice)}</span>
                        <SrStatus code={x.srStatusCode} raw={x.cancelledAt ? "CANCELLED" : x.srStatus} />
                      </Link>
                    ))}
                    {o.carts.map((c) => (
                      <Link key={`c${c.id}`} href={`/abandoned/${c.id}`} className="flex items-center justify-between gap-2 rounded px-1 py-0.5 text-muted-foreground hover:bg-muted">
                        <span>Cart ({c.source})</span>
                        <span>{dateShort(c.createdAt)}</span>
                        <span>{money(c.totalPrice)}</span>
                        <CartStatus status={c.status} />
                      </Link>
                    ))}
                  </div>
                </Card>
              )}
            </div>
          </div>
        </div>

        <ChatPopup
            key={o.id}
            openSignal={chatSignal}
            messages={o.messages}
            phone={o.phone}
            email={o.email}
            name={o.customerName}
            storeId={o.storeId}
            orderId={o.id}
            vars={vars}
            queryKey={queryKey}
            defaultSubject={`Your order ${o.name}`}
          />
      </div>
      <ShiprocketResultsDialog result={srResult} onClose={() => setSrResult(null)} />
      <ShipDialog
        order={shipOpen ? { id: o.id, name: o.name, customerName: o.customerName, phone: o.phone, storeId: o.storeId, paymentMethod: o.paymentMethod, totalPrice: o.totalPrice, city: o.shippingAddress?.city, zip: o.shippingAddress?.zip } : null}
        onClose={() => {
          setShipOpen(false);
          refresh();
        }}
      />
      <NdrDialog
        order={ndrOpen ? o : null}
        onClose={() => setNdrOpen(false)}
        onMessage={
          o.phone
            ? () => {
                setNdrOpen(false);
                openChat("whatsapp");
              }
            : undefined
        }
      />
    </div>
  );
}

/* ── pieces ─────────────────────────────────────────────────────────── */

function Card({ title, children, action, icon: Icon }: { title: string; children: React.ReactNode; action?: React.ReactNode; icon?: typeof Truck }) {
  return (
    <section className="rounded-xl border bg-card p-4 text-[13px] shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
      <div className="mb-3 flex items-center gap-1.5">
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
        <div className="ml-auto">{action}</div>
      </div>
      {children}
    </section>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={cn("flex justify-between gap-3", bold && "border-t pt-1.5 text-sm font-semibold")}>
      <span className={bold ? "" : "text-muted-foreground"}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function KV({ k, v, mono }: { k: string; v: string | null | undefined; mono?: boolean }) {
  if (!v) return null;
  return (
    <div className="flex gap-2">
      <dt className="w-24 shrink-0 capitalize text-muted-foreground">{k}</dt>
      <dd className={cn("min-w-0 break-words", mono && "font-mono text-[11px]")}>{v}</dd>
    </div>
  );
}

function IconBtn({ icon: Icon, onClick, title }: { icon: typeof Copy; onClick: () => void; title: string }) {
  return (
    <button onClick={onClick} title={title} className="inline-flex text-muted-foreground hover:text-foreground">
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

function ActionBtn({ label, onClick, busy, primary, danger }: { label: string; onClick: () => void; busy?: boolean; primary?: boolean; danger?: boolean }) {
  return (
    <Button size="sm" variant={primary ? "default" : "outline"} className={cn("h-7 text-xs", danger && "text-destructive hover:text-destructive")} onClick={onClick} disabled={busy}>
      {label}
    </Button>
  );
}

function DeviceIcon({ type, className }: { type: string; className?: string }) {
  if (type === "Desktop") return <Monitor className={className} />;
  if (type === "Tablet") return <Tablet className={className} />;
  return <Smartphone className={className} />;
}

/** The store's journey tracker writes a readable summary into the order note. */
function JourneyNote({ text }: { text: string }) {
  const lines = text.split("\n").map((l) => l.trimEnd()).filter((l) => l.trim() && !/^🧭\s*Journey$/i.test(l.trim()));
  return (
    <div className="space-y-1.5">
      {lines.map((l, i) => {
        const m = l.match(/^([A-Za-z ]{2,20}):\s*(.+)$/);
        if (m) {
          return (
            <div key={i} className="flex gap-2">
              <span className="w-24 shrink-0 text-xs text-muted-foreground">{m[1]}</span>
              <span className="min-w-0">{m[2]}</span>
            </div>
          );
        }
        const indent = /^\s{2,}/.test(l);
        return (
          <p key={i} className={cn("text-[13px]", indent ? "pl-[6.5rem] text-muted-foreground" : "pl-[6.5rem]")}>
            {l.trim().replace(/^•\s*/, "• ")}
          </p>
        );
      })}
    </div>
  );
}

function TagList({ tags }: { tags: string }) {
  const list = tags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  if (list.length === 0) return <p className="text-xs text-muted-foreground">No tags</p>;
  // Journey tags come as "1 Source: Facebook ad · Reel": show them as label/value
  const journey = list.filter((t) => /^\d+\s+[^:]+:/.test(t));
  const plain = list.filter((t) => !/^\d+\s+[^:]+:/.test(t));
  return (
    <div className="space-y-2">
      {plain.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {plain.map((t) => (
            <span
              key={t}
              className={cn(
                "rounded-md px-1.5 py-0.5 text-[11px] font-medium",
                /high/i.test(t) ? "bg-red-50 text-red-700" : /low/i.test(t) ? "bg-emerald-50 text-emerald-700" : "bg-muted text-foreground/80",
              )}
            >
              {t}
            </span>
          ))}
        </div>
      )}
      {journey.length > 0 && (
        <dl className="space-y-1 border-t pt-2 text-xs">
          {journey.map((t) => {
            const m = t.match(/^\d+\s+([^:]+):\s*(.*)$/)!;
            return (
              <div key={t} className="flex gap-2">
                <dt className="w-24 shrink-0 text-muted-foreground">{m[1]}</dt>
                <dd>{m[2]}</dd>
              </div>
            );
          })}
        </dl>
      )}
    </div>
  );
}

function RecordingCard({ orderId, saved, fromAttributes, onChange }: { orderId: number; saved: string | null; fromAttributes: string | null; onChange: () => void }) {
  const url = saved ?? fromAttributes;
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(saved ?? "");
  useEffect(() => setValue(saved ?? ""), [saved, orderId]);
  const save = useMutation({
    mutationFn: (v: string) => put(`/orders/${orderId}/recording`, { url: v }),
    onSuccess: () => {
      setEditing(false);
      onChange();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const embeddable = url && /\.(mp4|webm|mov)(\?|$)/i.test(url);
  return (
    <Card
      title="Session recording"
      icon={Video}
      action={
        url && !editing ? (
          <div className="flex gap-2">
            <IconBtn icon={Pencil} title="Change link" onClick={() => setEditing(true)} />
            {saved && <IconBtn icon={Trash2} title="Remove link" onClick={() => save.mutate("")} />}
          </div>
        ) : null
      }
    >
      {url && !editing ? (
        embeddable ? (
          <video src={url} controls className="w-full rounded-lg border" />
        ) : (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 rounded-lg border bg-muted/40 p-3 hover:border-primary"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Video className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium">Watch how this customer shopped</p>
              <p className="truncate text-xs text-muted-foreground">{url}</p>
            </div>
            <ExternalLink className="h-4 w-4 text-muted-foreground" />
          </a>
        )
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            No recording on this order. Paste a session-replay link (Microsoft Clarity, Hotjar, a video, …) to keep it with the order. If your tracking app adds a{" "}
            <code>recording_url</code> note attribute, it shows here automatically.
          </p>
          <div className="flex gap-2">
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="https://clarity.microsoft.com/player/…"
              className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2.5 text-xs"
            />
            <Button size="sm" className="h-8" disabled={!value.trim() || save.isPending} onClick={() => save.mutate(value.trim())}>
              Save
            </Button>
            {editing && (
              <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

const TL_STYLE: Record<string, { dot: string; icon: typeof Truck }> = {
  created: { dot: "bg-primary text-primary-foreground", icon: Package },
  payment: { dot: "bg-emerald-100 text-emerald-700", icon: CreditCard },
  fulfillment: { dot: "bg-slate-100 text-slate-700", icon: Package },
  cancelled: { dot: "bg-red-100 text-red-700", icon: AlertTriangle },
  shipment: { dot: "bg-sky-100 text-sky-700", icon: Truck },
  awb: { dot: "bg-indigo-100 text-indigo-700", icon: Truck },
  address: { dot: "bg-amber-100 text-amber-800", icon: MapPin },
  note: { dot: "bg-yellow-100 text-yellow-800", icon: StickyNote },
  recording: { dot: "bg-violet-100 text-violet-700", icon: Video },
  whatsapp: { dot: "bg-emerald-100 text-emerald-700", icon: MessageCircle },
  email: { dot: "bg-sky-100 text-sky-700", icon: Mail },
};

function TimelineCard({ orderId }: { orderId: number }) {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({
    queryKey: ["timeline", orderId],
    queryFn: () => api<TimelineItem[]>(`/orders/${orderId}/timeline`),
    refetchInterval: 30_000,
  });
  const [note, setNote] = useState("");
  const [filter, setFilter] = useState<"all" | "changes" | "messages" | "notes">("all");
  const add = useMutation({
    mutationFn: () => post(`/orders/${orderId}/notes`, { text: note }),
    onSuccess: () => {
      setNote("");
      qc.invalidateQueries({ queryKey: ["timeline", orderId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const shown = data.filter((t) =>
    filter === "all" ? true : filter === "notes" ? t.type === "note" : filter === "messages" ? t.type === "whatsapp" || t.type === "email" : !["note", "whatsapp", "email"].includes(t.type),
  );

  return (
    <Card
      title="Timeline"
      icon={History}
      action={
        <div className="flex rounded-md border p-0.5 text-[11px]">
          {(["all", "changes", "messages", "notes"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={cn("rounded px-2 py-0.5 capitalize", filter === f ? "bg-muted font-medium" : "text-muted-foreground")}>
              {f}
            </button>
          ))}
        </div>
      }
    >
      <div className="mb-4 flex gap-2">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && note.trim()) add.mutate();
          }}
          rows={2}
          placeholder="Add a team note (e.g. customer asked to deliver after 6 pm)…  Ctrl+Enter to save"
          className="min-w-0 flex-1 resize-none rounded-md border bg-background px-2.5 py-2 text-[13px]"
        />
        <Button size="sm" className="self-end" disabled={!note.trim() || add.isPending} onClick={() => add.mutate()}>
          Add note
        </Button>
      </div>
      {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      {!isLoading && shown.length === 0 && <p className="text-xs text-muted-foreground">Nothing here yet.</p>}
      <ol className="relative space-y-3 before:absolute before:bottom-2 before:left-[13px] before:top-2 before:w-px before:bg-border">
        {shown.map((t) => {
          const st = TL_STYLE[t.type] ?? { dot: "bg-muted text-muted-foreground", icon: Info };
          const Icon = st.icon;
          return (
            <li key={t.id} className="relative flex gap-3">
              <span className={cn("relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-4 ring-card", st.dot)}>
                <Icon className="h-3.5 w-3.5" />
              </span>
              <div className={cn("min-w-0 flex-1 pt-0.5", t.type === "note" && "rounded-lg bg-yellow-50 px-3 py-2")}>
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <p className="font-medium">{t.title}</p>
                  {t.author && <span className="text-xs text-muted-foreground">by {t.author}</span>}
                  <span className="ml-auto text-[11px] text-muted-foreground" title={dateTime(t.createdAt)}>
                    {ago(t.createdAt)}
                  </span>
                </div>
                {t.detail && <p className="mt-0.5 whitespace-pre-wrap break-words text-xs text-muted-foreground">{t.detail}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function AddressForm({ address, orderId, onSaved }: { address: Address; orderId: number; onSaved: () => void }) {
  const [a, setA] = useState<Address>(address);
  const save = useMutation({
    mutationFn: () => patch(`/orders/${orderId}/address`, a),
    onSuccess: () => {
      toast.success("Address updated (Shopify is not changed)");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const field = (k: keyof Address, label: string) => (
    <input value={a[k] ?? ""} onChange={(e) => setA({ ...a, [k]: e.target.value })} placeholder={label} className="h-8 w-full rounded border px-2 text-sm" />
  );
  return (
    <div className="space-y-1.5">
      {field("address1", "Address line 1")}
      {field("address2", "Address line 2 / landmark")}
      <div className="grid grid-cols-3 gap-1.5">
        {field("city", "City")}
        {field("province", "State")}
        {field("zip", "PIN")}
      </div>
      {field("phone", "Phone")}
      <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
        Save address
      </Button>
    </div>
  );
}
