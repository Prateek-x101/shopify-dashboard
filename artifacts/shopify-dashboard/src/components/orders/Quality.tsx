import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { ShieldCheck, ShieldAlert, Shield, MapPin, CheckCircle2, Copy, Phone, Mail, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { post } from "@/lib/api";
import { phone as fmtPhone } from "@/lib/format";
import type { Address, Quality } from "@/lib/types";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LEVEL = {
  good: { label: "Good to ship", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200", bar: "bg-emerald-500", Icon: ShieldCheck },
  check: { label: "Check first", cls: "bg-amber-50 text-amber-800 ring-amber-200", bar: "bg-amber-500", Icon: Shield },
  risky: { label: "Risky", cls: "bg-red-50 text-red-700 ring-red-200", bar: "bg-red-500", Icon: ShieldAlert },
};
const SEV = { high: "bg-red-500", medium: "bg-amber-500", low: "bg-slate-300" };

/** Send a confirmation message (address / COD); a YES reply marks the order confirmed. */
export function useConfirm(orderId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (kind: "address" | "cod") => post(`/orders/${orderId}/confirm`, { kind }),
    onSuccess: (_r, kind) => {
      toast.success(kind === "address" ? "Address confirmation sent on WhatsApp" : "COD confirmation sent on WhatsApp");
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["order"] });
      qc.invalidateQueries({ queryKey: ["timeline"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function QualityDetails({ q, orderId, orderPathFor }: { q: Quality; orderId: number; orderPathFor?: (name: string) => string }) {
  const confirm = useConfirm(orderId);
  const L = LEVEL[q.level];
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold ring-1 ring-inset", L.cls)}>{q.score}</div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{L.label}</p>
          <div className="mt-1 h-1.5 w-full rounded-full bg-muted">
            <div className={cn("h-1.5 rounded-full", L.bar)} style={{ width: `${q.score}%` }} />
          </div>
        </div>
      </div>
      {q.flags.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nothing unusual: address, phone and customer history look fine.</p>
      ) : (
        <ul className="space-y-1.5">
          {q.flags.map((f) => (
            <li key={f.key} className="flex items-start gap-2 text-xs">
              <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", f.key === "repeat" || f.key === "confirmed" ? "bg-emerald-500" : SEV[f.severity])} />
              <span>
                {f.label}
                {f.detail && <span className="text-muted-foreground"> · {f.detail}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {q.history.orders > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Customer history: {q.history.orders} other order{q.history.orders > 1 ? "s" : ""} · {q.history.delivered} delivered · {q.history.rto} RTO · {q.history.cancelled} cancelled
        </p>
      )}
      {q.duplicates.length > 0 && orderPathFor && (
        <div className="flex flex-wrap gap-1">
          {q.duplicates.map((d) => (
            <Link key={d.id} href={orderPathFor(d.name)} className="rounded border px-1.5 py-0.5 text-[11px] hover:bg-accent">
              Open {d.name}
            </Link>
          ))}
        </div>
      )}
      {(q.actions.includes("confirm_address") || q.actions.includes("confirm_cod")) && (
        <div className="flex flex-wrap gap-1.5 border-t pt-2">
          {q.actions.includes("confirm_cod") && (
            <Button size="sm" className="h-7 text-xs" disabled={confirm.isPending} onClick={() => confirm.mutate("cod")}>
              {confirm.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <CheckCircle2 className="mr-1 h-3 w-3" />} Confirm COD on WhatsApp
            </Button>
          )}
          {q.actions.includes("confirm_address") && (
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={confirm.isPending} onClick={() => confirm.mutate("address")}>
              <MapPin className="mr-1 h-3 w-3" /> Confirm address
            </Button>
          )}
        </div>
      )}
      {q.actions.includes("ask_prepaid") && <p className="text-[11px] text-muted-foreground">Tip: offer a small discount to switch this COD order to prepaid.</p>}
    </div>
  );
}

/** Table badge: score + verdict; hover for reasons and one-click confirmations. */
export function QualityBadge({ q, orderId, orderPathFor }: { q: Quality | null | undefined; orderId: number; orderPathFor?: (name: string) => string }) {
  if (!q) return <span className="text-xs text-muted-foreground">—</span>;
  const L = LEVEL[q.level];
  const top = q.flags.find((f) => f.key !== "repeat" && f.key !== "confirmed");
  return (
    <HoverCard openDelay={150} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button onClick={(e) => e.stopPropagation()} className="block max-w-[170px] text-left">
          <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", L.cls)}>
            <L.Icon className="h-3 w-3" /> {q.score} · {L.label}
          </span>
          {q.confirmed ? (
            <span className="mt-0.5 block truncate text-[11px] text-emerald-700">✓ Customer confirmed</span>
          ) : (
            top && <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{top.label}</span>
          )}
        </button>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-80" onClick={(e) => e.stopPropagation()}>
        <QualityDetails q={q} orderId={orderId} orderPathFor={orderPathFor} />
      </HoverCardContent>
    </HoverCard>
  );
}

/** Customer name with a hover card: full address, phone, email (all copyable). */
export function CustomerHover({
  name,
  phone,
  email,
  address,
  children,
}: {
  name: string | null;
  phone: string | null;
  email: string | null;
  address: Address | null | undefined;
  children: React.ReactNode;
}) {
  const full = [address?.address1, address?.address2, [address?.city, address?.province].filter(Boolean).join(", "), address?.zip].filter(Boolean).join("\n");
  const copy = (v: string, what: string) => {
    navigator.clipboard.writeText(v);
    toast.success(`${what} copied`);
  };
  return (
    <HoverCard openDelay={250} closeDelay={100}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent align="start" className="w-80 space-y-2.5 text-xs" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-semibold">{name || "—"}</p>
        {full ? (
          <div className="flex gap-2">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <p className="flex-1 whitespace-pre-line">{full}</p>
            <button title="Copy address" onClick={() => copy([name, full.replace(/\n/g, ", "), phone && fmtPhone(phone)].filter(Boolean).join(", "), "Address")} className="self-start text-muted-foreground hover:text-foreground">
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <p className="text-muted-foreground">No address</p>
        )}
        {phone && (
          <div className="flex items-center gap-2">
            <Phone className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="flex-1">{fmtPhone(phone)}</span>
            <button title="Copy phone" onClick={() => copy(phone, "Phone")} className="text-muted-foreground hover:text-foreground">
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {email && (
          <div className="flex items-center gap-2">
            <Mail className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="flex-1 truncate">{email}</span>
            <button title="Copy email" onClick={() => copy(email, "Email")} className="text-muted-foreground hover:text-foreground">
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}
