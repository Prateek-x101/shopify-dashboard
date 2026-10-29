import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Send, Mail, MessageCircle, FileText, Zap, RotateCcw, ImageIcon, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { api, post } from "@/lib/api";
import { dateShort, phone as fmtPhone } from "@/lib/format";
import type { Message, MetaTemplate, WhatsappAccount } from "@/lib/types";
import { useStores } from "@/hooks/use-stores";
import { MsgStatus } from "@/components/common/Status";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const DEFAULT_QUICK = [
  "Hi {first_name}, thanks for your order {order}! Please reply YES to confirm your COD order.",
  "Hi {first_name}, your order {order} has been shipped via {courier}. Track here: {tracking_url}",
  "Hi {first_name}, the courier could not deliver your order {order}. When should we re-attempt?",
  "Hi {first_name}, please share your complete address with house/flat number and a landmark for order {order}.",
];

function fill(t: string, vars: Record<string, string>) {
  return t.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ? vars[k] : m));
}

export function ChatPanel({
  messages,
  phone,
  email,
  name,
  storeId,
  orderId,
  checkoutId,
  vars = {},
  queryKey,
  defaultSubject,
  channel: channelProp,
  onChannelChange,
  hideChannelTabs,
}: {
  messages: Message[];
  phone: string | null;
  email: string | null;
  name?: string | null;
  storeId: number | null;
  orderId?: number | null;
  checkoutId?: number | null;
  vars?: Record<string, string>;
  queryKey: unknown[];
  defaultSubject?: string;
  /** Controlled channel (e.g. from a popup launcher); uncontrolled when omitted */
  channel?: "whatsapp" | "email";
  onChannelChange?: (c: "whatsapp" | "email") => void;
  hideChannelTabs?: boolean;
}) {
  const qc = useQueryClient();
  const { storeById } = useStores();
  const [ownChannel, setOwnChannel] = useState<"whatsapp" | "email">(phone ? "whatsapp" : "email");
  const channel = channelProp ?? ownChannel;
  const setChannel = (c: "whatsapp" | "email") => (onChannelChange ? onChannelChange(c) : setOwnChannel(c));
  const [text, setText] = useState("");
  const [subject, setSubject] = useState(defaultSubject ?? "");
  const [withImage, setWithImage] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const shown = messages.filter((m) => m.channel === channel);
  const unreadContacts = useMemo(() => [...new Set(messages.filter((m) => m.direction === "in" && !m.read).map((m) => m.contact))], [messages]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [shown.length, channel]);

  useEffect(() => {
    if (unreadContacts.length === 0) return;
    Promise.all(unreadContacts.map((c) => post(`/conversations/${encodeURIComponent(c)}/read`))).then(() => {
      qc.invalidateQueries({ queryKey: ["inbox-unread"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["checkouts"] });
    });
  }, [unreadContacts.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: waAccounts = [] } = useQuery({ queryKey: ["wa-accounts"], queryFn: () => api<WhatsappAccount[]>("/accounts/whatsapp") });
  const store = storeById(storeId);
  const waAccount = waAccounts.find((a) => a.id === store?.whatsappAccountId) ?? waAccounts.find((a) => a.status === "connected");
  const { data: templates = [] } = useQuery({
    queryKey: ["templates", waAccount?.id],
    queryFn: () => api<MetaTemplate[]>(`/accounts/whatsapp/${waAccount!.id}/templates`),
    enabled: waAccount?.provider === "meta",
  });

  const lastInbound = [...messages].reverse().find((m) => m.channel === "whatsapp" && m.direction === "in");
  const outside24h = waAccount?.provider === "meta" && (!lastInbound || Date.now() - new Date(lastInbound.createdAt).getTime() > 24 * 3600_000);

  const send = useMutation({
    mutationFn: (payload: Record<string, unknown>) => post(channel === "whatsapp" ? "/messages/whatsapp" : "/messages/email", payload),
    onSuccess: () => {
      setText("");
      qc.invalidateQueries({ queryKey });
    },
    onError: (e: Error) => {
      toast.error(e.message);
      qc.invalidateQueries({ queryKey });
    },
  });

  const retry = useMutation({
    mutationFn: (id: number) => post(`/messages/${id}/retry`),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = () => {
    const body = text.trim();
    if (!body) return;
    if (channel === "whatsapp") {
      send.mutate({ to: phone, text: body, storeId, orderId, checkoutId, contactName: name, imageUrl: withImage ? vars.image || null : null });
    } else {
      send.mutate({ to: email, subject: subject || defaultSubject || "Regarding your order", text: body, storeId, orderId, checkoutId });
    }
  };

  const sendTemplate = (t: MetaTemplate, params: string[]) => {
    send.mutate({
      to: phone,
      storeId,
      orderId,
      checkoutId,
      contactName: name,
      template: { name: t.name, language: t.language, params, headerImageUrl: t.headerFormat === "IMAGE" ? vars.image || null : null },
    });
  };

  const counts = {
    whatsapp: messages.filter((m) => m.channel === "whatsapp").length,
    email: messages.filter((m) => m.channel === "email").length,
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={cn("flex items-center gap-1 border-b px-3 py-2", hideChannelTabs && "hidden")}>
        <ChannelTab active={channel === "whatsapp"} onClick={() => setChannel("whatsapp")} icon={MessageCircle} label="WhatsApp" count={counts.whatsapp} disabled={!phone} />
        <ChannelTab active={channel === "email"} onClick={() => setChannel("email")} icon={Mail} label="Email" count={counts.email} disabled={!email} />
        <span className="ml-auto truncate text-xs text-muted-foreground">
          {channel === "whatsapp" ? (phone ? fmtPhone(phone) : "No phone") : email ?? "No email"}
          {channel === "whatsapp" && waAccount && <> · via {waAccount.name}</>}
        </span>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-[#efeae2]/60 p-3">
        {shown.length === 0 && (
          <p className="py-10 text-center text-xs text-muted-foreground">
            No {channel === "whatsapp" ? "WhatsApp messages" : "emails"} yet.
          </p>
        )}
        {shown.map((m) => (
          <Bubble key={m.id} m={m} onRetry={() => retry.mutate(m.id)} />
        ))}
        <div ref={endRef} />
      </div>

      <div className="space-y-2 border-t bg-card p-2.5">
        {channel === "whatsapp" && outside24h && (
          <p className="flex items-start gap-1.5 rounded bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
            The customer hasn't messaged in the last 24h. Meta only allows an approved template message right now.
          </p>
        )}
        {channel === "email" && (
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={defaultSubject ?? "Subject"}
            className="h-8 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/30"
          />
        )}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && channel === "whatsapp") {
              e.preventDefault();
              submit();
            }
          }}
          rows={channel === "email" ? 4 : 2}
          placeholder={channel === "whatsapp" ? "Type a WhatsApp message… (Enter to send)" : "Write an email…"}
          className="w-full resize-none rounded-md border bg-background px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/30"
          disabled={(channel === "whatsapp" && !phone) || (channel === "email" && !email)}
        />
        <div className="flex items-center gap-1.5">
          <QuickReplies vars={vars} onPick={(t) => setText(fill(t, vars))} />
          {channel === "whatsapp" && waAccount?.provider === "meta" && <TemplatePicker templates={templates} vars={vars} onSend={sendTemplate} />}
          {channel === "whatsapp" && vars.image && (
            <button
              onClick={() => setWithImage(!withImage)}
              className={cn("flex items-center gap-1 rounded border px-2 py-1 text-xs", withImage ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground")}
              title="Attach product image"
            >
              <ImageIcon className="h-3.5 w-3.5" /> Image
            </button>
          )}
          <Button size="sm" className="ml-auto h-8" onClick={submit} disabled={send.isPending || !text.trim()}>
            <Send className="mr-1.5 h-3.5 w-3.5" />
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}

function ChannelTab({ active, onClick, icon: Icon, label, count, disabled }: { active: boolean; onClick: () => void; icon: typeof Mail; label: string; count: number; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium disabled:opacity-40",
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
      {count > 0 && <span className="opacity-70">{count}</span>}
    </button>
  );
}

function Bubble({ m, onRetry }: { m: Message; onRetry: () => void }) {
  const out = m.direction === "out";
  return (
    <div className={cn("flex", out ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-lg px-3 py-1.5 text-[13px] shadow-sm",
          out ? "rounded-tr-none bg-[#d9fdd3]" : "rounded-tl-none bg-white",
          m.status === "failed" && "ring-1 ring-destructive/40",
        )}
      >
        {m.subject && <p className="mb-0.5 text-xs font-semibold">{m.subject}</p>}
        {m.mediaUrl && <img src={m.mediaUrl} alt="" className="mb-1 max-h-40 rounded" loading="lazy" />}
        {m.templateName && <p className="mb-0.5 flex items-center gap-1 text-[10px] font-medium uppercase text-emerald-700"><FileText className="h-3 w-3" />{m.templateName}</p>}
        <p className="whitespace-pre-wrap break-words">{m.templateName ? m.body.replace(/^\[Template: [^\]]+\]\s*/, "") : m.body}</p>
        <div className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
          {m.source && m.source !== "manual" && <span className="mr-1 rounded bg-black/5 px-1">{m.source.startsWith("automation") ? "auto" : m.source}</span>}
          {dateShort(m.createdAt)}
          {out && <MsgStatus status={m.status} className="h-3 w-3" />}
        </div>
        {m.status === "failed" && (
          <div className="mt-1 flex items-center gap-2 border-t pt-1 text-[11px] text-destructive">
            <span className="flex-1">{m.error}</span>
            <button onClick={onRetry} className="flex items-center gap-0.5 font-medium hover:underline">
              <RotateCcw className="h-3 w-3" /> Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function QuickReplies({ vars, onPick }: { vars: Record<string, string>; onPick: (t: string) => void }) {
  const [items, setItems] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("dash.quickReplies") ?? "null") ?? DEFAULT_QUICK;
    } catch {
      return DEFAULT_QUICK;
    }
  });
  const [draft, setDraft] = useState("");
  const save = (next: string[]) => {
    setItems(next);
    try {
      localStorage.setItem("dash.quickReplies", JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1 rounded border px-2 py-1 text-xs text-muted-foreground hover:bg-accent">
          <Zap className="h-3.5 w-3.5" /> Quick reply
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96 p-2">
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {items.map((t, i) => (
            <div key={i} className="group flex items-start gap-1">
              <button onClick={() => onPick(t)} className="flex-1 rounded px-2 py-1.5 text-left text-xs hover:bg-accent">
                {fill(t, vars)}
              </button>
              <button onClick={() => save(items.filter((_, j) => j !== i))} className="px-1 text-xs text-muted-foreground opacity-0 group-hover:opacity-100">
                ✕
              </button>
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-1 border-t pt-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="New reply, use {first_name}, {order}…"
            className="h-7 flex-1 rounded border px-2 text-xs"
          />
          <Button size="sm" className="h-7" disabled={!draft.trim()} onClick={() => (save([...items, draft.trim()]), setDraft(""))}>
            Add
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function TemplatePicker({ templates, vars, onSend }: { templates: MetaTemplate[]; vars: Record<string, string>; onSend: (t: MetaTemplate, params: string[]) => void }) {
  const [sel, setSel] = useState<MetaTemplate | null>(null);
  const [params, setParams] = useState<string[]>([]);
  const approved = templates.filter((t) => t.status === "APPROVED");
  const choose = (t: MetaTemplate) => {
    setSel(t);
    const defaults = [vars.first_name, vars.product || vars.order, vars.total, vars.checkout_url || vars.tracking_url];
    setParams(Array.from({ length: t.paramCount }, (_, i) => defaults[i] ?? ""));
  };
  return (
    <Popover onOpenChange={(o) => !o && setSel(null)}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1 rounded border px-2 py-1 text-xs text-muted-foreground hover:bg-accent">
          <FileText className="h-3.5 w-3.5" /> Template
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96 p-2">
        {!sel ? (
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {approved.length === 0 && <p className="p-2 text-xs text-muted-foreground">No approved templates on this number.</p>}
            {approved.map((t) => (
              <button key={`${t.name}-${t.language}`} onClick={() => choose(t)} className="w-full rounded px-2 py-1.5 text-left hover:bg-accent">
                <p className="text-xs font-medium">
                  {t.name} <span className="text-muted-foreground">({t.language})</span>
                </p>
                <p className="line-clamp-2 text-[11px] text-muted-foreground">{t.body}</p>
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs font-medium">{sel.name}</p>
            <p className="rounded bg-muted p-2 text-[11px]">{sel.body.replace(/\{\{(\d+)\}\}/g, (_, n) => params[Number(n) - 1] || `{{${n}}}`)}</p>
            {params.map((p, i) => (
              <input
                key={i}
                value={p}
                onChange={(e) => setParams(params.map((x, j) => (j === i ? e.target.value : x)))}
                placeholder={`{{${i + 1}}}`}
                className="h-7 w-full rounded border px-2 text-xs"
              />
            ))}
            <div className="flex justify-end gap-1">
              <Button size="sm" variant="ghost" className="h-7" onClick={() => setSel(null)}>
                Back
              </Button>
              <Button size="sm" className="h-7" onClick={() => onSend(sel, params)}>
                Send template
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
