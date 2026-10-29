import { Check, CheckCheck, Clock, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const SR_STYLES: Record<string, string> = {
  new: "bg-slate-100 text-slate-700 ring-slate-200",
  awb_assigned: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  pickup_scheduled: "bg-violet-50 text-violet-700 ring-violet-200",
  picked_up: "bg-sky-50 text-sky-700 ring-sky-200",
  in_transit: "bg-sky-50 text-sky-700 ring-sky-200",
  out_for_delivery: "bg-amber-50 text-amber-800 ring-amber-200",
  delivered: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  ndr: "bg-orange-50 text-orange-700 ring-orange-200",
  rto: "bg-rose-50 text-rose-700 ring-rose-200",
  rto_delivered: "bg-rose-100 text-rose-800 ring-rose-200",
  cancelled: "bg-zinc-100 text-zinc-500 ring-zinc-200 line-through",
  lost: "bg-red-100 text-red-800 ring-red-200",
};

export function Pill({ className, children, title }: { className?: string; children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", className)}>
      {children}
    </span>
  );
}

export function SrStatus({ code, raw }: { code: string | null; raw: string | null }) {
  if (!raw) return <span className="text-xs text-muted-foreground">Not in Shiprocket</span>;
  return (
    <Pill className={SR_STYLES[code ?? ""] ?? "bg-slate-100 text-slate-700 ring-slate-200"} title={raw}>
      {raw.charAt(0) + raw.slice(1).toLowerCase()}
    </Pill>
  );
}

export function PaymentBadge({ method, financial }: { method: string; financial?: string | null }) {
  return method === "COD" ? (
    <Pill className="bg-amber-50 text-amber-800 ring-amber-200">COD</Pill>
  ) : (
    <Pill className="bg-emerald-50 text-emerald-700 ring-emerald-200" title={financial ?? undefined}>
      Prepaid
    </Pill>
  );
}

export function FulfillmentBadge({ status, cancelled }: { status: string | null; cancelled?: boolean }) {
  if (cancelled) return <Pill className="bg-zinc-100 text-zinc-500 ring-zinc-200">Cancelled</Pill>;
  if (status === "fulfilled") return <Pill className="bg-slate-100 text-slate-600 ring-slate-200">Fulfilled</Pill>;
  if (status === "partial") return <Pill className="bg-yellow-50 text-yellow-800 ring-yellow-200">Partial</Pill>;
  return <Pill className="bg-yellow-50 text-yellow-800 ring-yellow-200">Unfulfilled</Pill>;
}

export function MsgStatus({ status, className }: { status: string | null; className?: string }) {
  if (!status) return null;
  const c = cn("h-3.5 w-3.5", className);
  if (status === "read") return <CheckCheck className={cn(c, "text-sky-500")} />;
  if (status === "delivered") return <CheckCheck className={cn(c, "text-muted-foreground")} />;
  if (status === "sent") return <Check className={cn(c, "text-muted-foreground")} />;
  if (status === "failed") return <AlertCircle className={cn(c, "text-destructive")} />;
  if (status === "queued") return <Clock className={cn(c, "text-muted-foreground")} />;
  return null;
}

export function StoreTag({ name, color }: { name?: string; color?: string }) {
  if (!name) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {name}
    </span>
  );
}

const CART_STYLES: Record<string, [string, string]> = {
  abandoned: ["Not recovered", "bg-amber-50 text-amber-800 ring-amber-200"],
  replied: ["Replied", "bg-sky-50 text-sky-700 ring-sky-200"],
  recovered: ["Recovered", "bg-emerald-50 text-emerald-700 ring-emerald-200"],
  opted_out: ["Opted out", "bg-zinc-100 text-zinc-500 ring-zinc-200"],
};

export function CartStatus({ status }: { status: string }) {
  const [label, cls] = CART_STYLES[status] ?? [status, "bg-slate-100 text-slate-700 ring-slate-200"];
  return <Pill className={cls}>{label}</Pill>;
}

export function SourceBadge({ source }: { source: string }) {
  return source === "fastrr" ? (
    <Pill className="bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200">Fastrr</Pill>
  ) : (
    <Pill className="bg-green-50 text-green-700 ring-green-200">Shopify</Pill>
  );
}

export function ProductThumb({ src, title, size = 36 }: { src: string | null | undefined; title: string; size?: number }) {
  return src ? (
    <img src={src} alt={title} width={size} height={size} loading="lazy" className="shrink-0 rounded border object-cover" style={{ width: size, height: size }} />
  ) : (
    <div className="flex shrink-0 items-center justify-center rounded border bg-muted text-[10px] text-muted-foreground" style={{ width: size, height: size }}>
      {title.slice(0, 2).toUpperCase()}
    </div>
  );
}
