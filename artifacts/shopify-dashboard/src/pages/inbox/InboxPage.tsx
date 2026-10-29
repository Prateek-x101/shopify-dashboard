import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useRoute, Link } from "wouter";
import { Mail, MessageCircle, Inbox as InboxIcon } from "lucide-react";
import { api, qs } from "@/lib/api";
import { ago, money, dateShort, phone as fmtPhone, initials } from "@/lib/format";
import type { Message } from "@/lib/types";
import { useStores } from "@/hooks/use-stores";
import { orderPath } from "@/lib/order-nav";
import { SearchInput } from "@/components/common/ListControls";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { CartStatus, MsgStatus } from "@/components/common/Status";
import { cn } from "@/lib/utils";

interface InboxRow {
  id: number;
  contact: string;
  display_name: string | null;
  channel: "whatsapp" | "email";
  direction: "in" | "out";
  body: string;
  subject: string | null;
  status: string;
  created_at: string;
  store_id: number | null;
  unread: number;
}

interface Conversation {
  contact: string;
  messages: Message[];
  orders: { id: number; name: string; storeId: number; createdAt: string; totalPrice: string; srStatus: string | null; customerName: string | null; phone: string | null; email: string | null }[];
  carts: { id: number; source: string; storeId: number; createdAt: string; totalPrice: string; status: string; customerName: string | null }[];
}

export default function InboxPage() {
  const [, params] = useRoute("/inbox/:contact");
  const [, navigate] = useLocation();
  const { storeId, storeById, stores } = useStores();
  const [q, setQ] = useState("");
  const [channel, setChannel] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const active = params?.contact ? decodeURIComponent(params.contact) : null;

  const { data: list = [] } = useQuery({
    queryKey: ["inbox", storeId, q, channel, unreadOnly],
    queryFn: () => api<InboxRow[]>(`/inbox${qs({ storeId, q, channel, unread: unreadOnly ? "1" : "" })}`),
    refetchInterval: 15_000,
  });
  const convKey = ["conversation", active];
  const { data: conv } = useQuery({
    queryKey: convKey,
    queryFn: () => api<Conversation>(`/conversations/${encodeURIComponent(active!)}`),
    enabled: !!active,
    refetchInterval: 10_000,
  });

  const latestOrder = conv?.orders[0];
  const isEmail = active?.includes("@");
  const name = conv?.orders[0]?.customerName ?? conv?.carts[0]?.customerName ?? list.find((r) => r.contact === active)?.display_name ?? null;
  const phone = isEmail ? latestOrder?.phone ?? null : active;
  const email = isEmail ? active : latestOrder?.email ?? null;
  const conversationStore = latestOrder?.storeId ?? conv?.carts[0]?.storeId ?? null;

  return (
    <div className="flex h-full">
      <div className="flex w-[340px] shrink-0 flex-col border-r bg-card">
        <div className="space-y-2 border-b p-3">
          <h1 className="text-lg font-semibold">Inbox</h1>
          <SearchInput value={q} onChange={setQ} placeholder="Search name, number, message…" />
          <div className="flex gap-1 text-xs">
            {[
              ["", "All"],
              ["whatsapp", "WhatsApp"],
              ["email", "Email"],
            ].map(([v, l]) => (
              <button key={v} onClick={() => setChannel(v)} className={cn("rounded-md border px-2 py-1", channel === v && "border-primary bg-primary/10 text-primary")}>
                {l}
              </button>
            ))}
            <button onClick={() => setUnreadOnly(!unreadOnly)} className={cn("ml-auto rounded-md border px-2 py-1", unreadOnly && "border-primary bg-primary/10 text-primary")}>
              Unread
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {list.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No conversations yet.</p>}
          {list.map((r) => (
            <button
              key={r.contact}
              onClick={() => navigate(`/inbox/${encodeURIComponent(r.contact)}`)}
              className={cn("flex w-full gap-3 border-b px-3 py-2.5 text-left hover:bg-accent/60", active === r.contact && "bg-primary/10")}
            >
              <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                {initials(r.display_name ?? r.contact)}
                <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-card p-0.5">
                  {r.channel === "email" ? <Mail className="h-3 w-3 text-sky-600" /> : <MessageCircle className="h-3 w-3 text-emerald-600" />}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <span className={cn("truncate text-[13px]", r.unread > 0 ? "font-semibold" : "font-medium")}>{r.display_name || (r.contact.includes("@") ? r.contact : fmtPhone(r.contact))}</span>
                  <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{ago(r.created_at)}</span>
                </div>
                <div className="flex items-center gap-1">
                  {r.direction === "out" && <MsgStatus status={r.status} className="h-3 w-3 shrink-0" />}
                  <span className={cn("truncate text-xs", r.unread > 0 ? "text-foreground" : "text-muted-foreground")}>{r.subject ? `${r.subject} · ` : ""}{r.body}</span>
                  {r.unread > 0 && <span className="ml-auto shrink-0 rounded-full bg-emerald-500 px-1.5 text-[10px] font-semibold text-white">{r.unread}</span>}
                </div>
                {!storeId && r.store_id && <span className="text-[10px] text-muted-foreground">{storeById(r.store_id)?.name}</span>}
              </div>
            </button>
          ))}
        </div>
      </div>

      {active && conv ? (
        <div className="grid min-w-0 flex-1 grid-cols-1 xl:grid-cols-[1fr_300px]">
          <div className="flex min-h-0 flex-col">
            <div className="flex items-center gap-3 border-b bg-card px-4 py-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-xs font-semibold">{initials(name ?? active)}</div>
              <div>
                <p className="font-semibold">{name ?? (isEmail ? active : fmtPhone(active))}</p>
                <p className="text-xs text-muted-foreground">{[phone && fmtPhone(phone), email].filter(Boolean).join(" · ")}</p>
              </div>
            </div>
            <div className="min-h-0 flex-1">
              <ChatPanel
                key={active}
                messages={conv.messages}
                phone={phone}
                email={email}
                name={name}
                storeId={conversationStore}
                orderId={latestOrder?.id ?? null}
                queryKey={convKey}
                vars={{ name: name ?? "", first_name: (name ?? "").split(" ")[0], order: latestOrder?.name ?? "" }}
                defaultSubject={latestOrder ? `Your order ${latestOrder.name}` : "Hello"}
              />
            </div>
          </div>
          <aside className="hidden min-h-0 space-y-4 overflow-y-auto border-l bg-muted/40 p-3 xl:block">
            <div>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Orders</h3>
              {conv.orders.length === 0 && <p className="text-xs text-muted-foreground">No orders</p>}
              {conv.orders.map((o) => (
                <Link key={o.id} href={orderPath(o.name, o.storeId, stores.length > 1)} className="mb-1 block rounded-md border bg-card p-2 text-xs hover:border-primary">
                  <div className="flex justify-between font-medium">
                    <span>{o.name}</span>
                    <span>{money(o.totalPrice)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>{dateShort(o.createdAt)}</span>
                    <span>{o.srStatus ?? "Not shipped"}</span>
                  </div>
                </Link>
              ))}
            </div>
            {conv.carts.length > 0 && (
              <div>
                <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Carts</h3>
                {conv.carts.map((c) => (
                  <Link key={c.id} href={`/abandoned/${c.id}`} className="mb-1 block rounded-md border bg-card p-2 text-xs hover:border-primary">
                    <div className="flex justify-between">
                      <span className="font-medium">{c.source === "fastrr" ? "Fastrr" : "Shopify"} cart</span>
                      <span>{money(c.totalPrice)}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-muted-foreground">
                      <span>{dateShort(c.createdAt)}</span>
                      <CartStatus status={c.status} />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </aside>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
          <InboxIcon className="h-10 w-10 opacity-30" />
          <p className="text-sm">Pick a conversation</p>
        </div>
      )}
    </div>
  );
}
