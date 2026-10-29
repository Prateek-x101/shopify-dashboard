import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useRoute } from "wouter";
import { ArrowLeft, ChevronUp, ChevronDown, Loader2, Copy, ExternalLink, MessageCircle, Mail, MapPin, Phone, ShoppingCart, User, Repeat, History, Package } from "lucide-react";
import { toast } from "sonner";
import { api, patch } from "@/lib/api";
import { money, dateTime, dateShort, phone as fmtPhone } from "@/lib/format";
import type { CheckoutDetail } from "@/lib/types";
import { useStores } from "@/hooks/use-stores";
import { orderPath } from "@/lib/order-nav";
import { readCartNav } from "@/lib/cart-nav";
import { Button } from "@/components/ui/button";
import { ChatPopup } from "@/components/chat/ChatPopup";
import { CartStatus, SourceBadge, ProductThumb, StoreTag } from "@/components/common/Status";
import { cn } from "@/lib/utils";

export default function CheckoutDetailPage() {
  const [, params] = useRoute("/abandoned/:id");
  const [, navigate] = useLocation();
  const { stores } = useStores();
  const checkoutId = Number(params?.id);
  const qc = useQueryClient();
  const queryKey = ["checkout", checkoutId];
  const nav = useMemo(() => readCartNav(), []);
  const idx = nav.ids.indexOf(checkoutId);
  const prevId = idx > 0 ? nav.ids[idx - 1] : null;
  const nextId = idx >= 0 && idx < nav.ids.length - 1 ? nav.ids[idx + 1] : null;

  const { data: c, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => api<CheckoutDetail>(`/checkouts/${checkoutId}`),
    enabled: Number.isFinite(checkoutId),
    refetchInterval: 15_000,
  });
  const [chatSignal, setChatSignal] = useState<{ n: number; channel: "whatsapp" | "email" }>({ n: 0, channel: "whatsapp" });
  const openChat = (channel: "whatsapp" | "email") => setChatSignal((s) => ({ n: s.n + 1, channel }));

  const setStatus = useMutation({
    mutationFn: (status: string) => patch(`/checkouts/${checkoutId}`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: ["checkouts"] });
    },
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, select, [contenteditable=true], [role=dialog]")) return;
      if ((e.key === "ArrowUp" || e.key === "k") && prevId) (e.preventDefault(), navigate(`/abandoned/${prevId}`));
      if ((e.key === "ArrowDown" || e.key === "j") && nextId) (e.preventDefault(), navigate(`/abandoned/${nextId}`));
      if (e.key === "Escape") navigate(nav.back);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prevId, nextId, nav.back, navigate]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error || !c) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted-foreground">Cart not found.</p>
        <Button size="sm" variant="outline" onClick={() => navigate("/abandoned")}>
          Back to carts
        </Button>
      </div>
    );
  }

  const first = c.lineItems[0];
  const vars: Record<string, string> = {
    name: c.customerName ?? "",
    first_name: (c.customerName ?? "").split(" ")[0],
    total: money(c.totalPrice),
    product: first ? [first.title, first.variantTitle].filter(Boolean).join(" - ") : "",
    checkout_url: c.checkoutUrl ?? "",
    store: c.store?.name ?? "",
    image: first?.imageUrl ?? "",
  };
  const copy = (v: string, what = "Copied") => {
    navigator.clipboard.writeText(v);
    toast.success(what);
  };
  const a = c.shippingAddress;

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b bg-card px-4 py-2.5">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(nav.back)} title="Back to carts (Esc)">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold">{c.customerName || "Guest"}</h1>
            <SourceBadge source={c.source} />
            <CartStatus status={c.status} />
            <span className="text-sm font-medium tabular-nums">{money(c.totalPrice)}</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            Abandoned {dateTime(c.createdAt)}
            <StoreTag name={c.store?.name} color={c.store?.color} />
            {c.stage && <span>· dropped at {c.stage.replace(/_/g, " ").toLowerCase()}</span>}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <select
            value={c.status}
            onChange={(e) => setStatus.mutate(e.target.value)}
            className="mr-1 h-8 rounded-md border bg-card px-2 text-xs"
            title="Opted out stops automatic messages"
          >
            <option value="abandoned">Not recovered</option>
            <option value="replied">Replied</option>
            <option value="recovered">Recovered</option>
            <option value="opted_out">Opted out</option>
          </select>
          {idx >= 0 && (
            <>
              <span className="mr-1 hidden text-xs tabular-nums text-muted-foreground sm:inline">
                {idx + 1} / {nav.ids.length}
              </span>
              <Button variant="outline" size="icon" className="h-8 w-8" disabled={!prevId} onClick={() => prevId && navigate(`/abandoned/${prevId}`)} title="Previous cart (↑)">
                <ChevronUp className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8" disabled={!nextId} onClick={() => nextId && navigate(`/abandoned/${nextId}`)} title="Next cart (↓)">
                <ChevronDown className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto bg-muted/40">
        <div className="mx-auto grid max-w-[1500px] gap-4 p-4 pb-24 lg:grid-cols-[minmax(0,1.6fr)_minmax(280px,1fr)]">
          <div className="min-w-0 space-y-4">
            <Card title={`Cart (${c.lineItems.reduce((s, l) => s + l.quantity, 0)} items)`} icon={ShoppingCart}>
              <div className="divide-y">
                {c.lineItems.map((li, i) => (
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
              <div className="mt-3 flex justify-between border-t pt-2 text-sm font-semibold">
                <span>Cart value</span>
                <span className="tabular-nums">{money(c.totalPrice)}</span>
              </div>
              {c.checkoutUrl && (
                <div className="mt-3 flex items-center gap-2 rounded-lg border bg-muted/40 p-2">
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">{c.checkoutUrl}</span>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => copy(c.checkoutUrl!, "Recovery link copied")}>
                    <Copy className="mr-1 h-3 w-3" /> Copy link
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" asChild>
                    <a href={c.checkoutUrl} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </Button>
                </div>
              )}
            </Card>

            <Card title="Recovery sequence" icon={Repeat}>
              {c.sentSteps.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No automatic message sent yet.{" "}
                  <Link href="/automations" className="text-primary hover:underline">
                    Set up steps in Automations
                  </Link>
                  .
                </p>
              ) : (
                <ol className="space-y-2">
                  {c.sentSteps.map((s, i) => (
                    <li key={i} className="flex items-center gap-2 text-[13px]">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-[11px] font-semibold text-emerald-700">{i + 1}</span>
                      {s}
                    </li>
                  ))}
                </ol>
              )}
              {c.lastSentAt && <p className="mt-2 text-xs text-muted-foreground">Last message {dateTime(c.lastSentAt)}</p>}
            </Card>

            <Card title="Messages" icon={History}>
              {c.messages.length === 0 ? (
                <p className="text-xs text-muted-foreground">No WhatsApp or email with this customer yet.</p>
              ) : (
                <ol className="space-y-2">
                  {[...c.messages]
                    .reverse()
                    .slice(0, 8)
                    .map((m) => (
                      <li key={m.id} className="flex gap-2 text-xs">
                        {m.channel === "email" ? <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-600" /> : <MessageCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />}
                        <div className="min-w-0 flex-1">
                          <p className={cn("line-clamp-2", m.direction === "in" && "font-medium")}>
                            {m.direction === "in" ? "Customer: " : ""}
                            {m.body}
                          </p>
                          <p className="text-muted-foreground">
                            {dateShort(m.createdAt)} · {m.direction === "in" ? "received" : m.status}
                          </p>
                        </div>
                      </li>
                    ))}
                </ol>
              )}
            </Card>
          </div>

          <div className="min-w-0 space-y-4">
            <Card title="Customer" icon={User}>
              <p className="font-medium">{c.customerName || "—"}</p>
              {c.phone ? (
                <p className="mt-1 flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-3.5 w-3.5" /> {fmtPhone(c.phone)}
                  <button onClick={() => copy(c.phone!, "Phone copied")} className="text-muted-foreground hover:text-foreground" title="Copy phone">
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </p>
              ) : (
                <p className="mt-1 text-xs text-amber-600">No phone number on this cart</p>
              )}
              {c.email && (
                <p className="mt-1 flex items-center gap-2 truncate text-muted-foreground">
                  <Mail className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{c.email}</span>
                </p>
              )}
              <div className="mt-3 flex gap-2">
                {c.phone && (
                  <Button size="sm" className="h-8 flex-1 bg-[#25D366] text-white hover:bg-[#1ebe5b]" onClick={() => openChat("whatsapp")}>
                    <MessageCircle className="mr-1.5 h-4 w-4" /> WhatsApp
                  </Button>
                )}
                {c.email && (
                  <Button size="sm" variant="outline" className="h-8 flex-1" onClick={() => openChat("email")}>
                    <Mail className="mr-1.5 h-4 w-4" /> Email
                  </Button>
                )}
              </div>
            </Card>

            {a && (a.address1 || a.city) && (
              <Card title="Address" icon={MapPin}>
                <div className="space-y-0.5">
                  {a.address1 && <p>{a.address1}</p>}
                  {a.address2 && <p>{a.address2}</p>}
                  <p>
                    {[a.city, a.province].filter(Boolean).join(", ")} {a.zip}
                  </p>
                </div>
              </Card>
            )}

            {c.orders.length > 0 && (
              <Card title="Orders by this customer" icon={Package}>
                <div className="space-y-1.5 text-xs">
                  {c.orders.map((o) => (
                    <Link key={o.id} href={orderPath(o.name, c.storeId, stores.length > 1)} className="flex items-center justify-between gap-2 rounded px-1 py-0.5 hover:bg-muted">
                      <span className="font-medium">{o.name}</span>
                      <span className="text-muted-foreground">{dateShort(o.createdAt)}</span>
                      <span>{money(o.totalPrice)}</span>
                      <span className="text-muted-foreground">{o.srStatus ?? "Not shipped"}</span>
                    </Link>
                  ))}
                </div>
              </Card>
            )}

            <Card title="Cart details" icon={ShoppingCart}>
              <dl className="space-y-1.5 text-xs">
                <KV k="Source" v={c.source === "fastrr" ? "Fastrr (Shiprocket checkout)" : "Shopify checkout"} />
                <KV k="Cart ID" v={c.externalId} mono />
                <KV k="Dropped at" v={c.stage?.replace(/_/g, " ").toLowerCase() ?? null} />
                <KV k="Created" v={dateTime(c.createdAt)} />
              </dl>
            </Card>
          </div>
        </div>

        <ChatPopup
          key={c.id}
          openSignal={chatSignal}
          messages={c.messages}
          phone={c.phone}
          email={c.email}
          name={c.customerName}
          storeId={c.storeId}
          checkoutId={c.id}
          vars={vars}
          queryKey={queryKey}
          defaultSubject="You left something in your cart"
        />
      </div>
    </div>
  );
}

function Card({ title, children, icon: Icon }: { title: string; children: React.ReactNode; icon?: typeof User }) {
  return (
    <section className="rounded-xl border bg-card p-4 text-[13px] shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
      <div className="mb-3 flex items-center gap-1.5">
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function KV({ k, v, mono }: { k: string; v: string | null | undefined; mono?: boolean }) {
  if (!v) return null;
  return (
    <div className="flex gap-2">
      <dt className="w-24 shrink-0 text-muted-foreground">{k}</dt>
      <dd className={cn("min-w-0 break-words", mono && "font-mono text-[11px]")}>{v}</dd>
    </div>
  );
}
