import { Truck, CalendarClock, Printer, MapPin, AlertTriangle, ExternalLink, CheckCircle2, Loader2 } from "lucide-react";
import type { OrderRow } from "@/lib/types";
import { cn } from "@/lib/utils";

export type RowAction = "ship" | "pickup" | "label" | "ndr" | "fix-address";

/**
 * The single next step for an order, so the list reads like a to-do:
 * Fix address → Ship → Schedule pickup → Print label → Track / Handle NDR.
 */
export function nextAction(o: OrderRow): { kind: RowAction | "track" | "done" | "none"; label: string } {
  const code = o.srStatusCode ?? "";
  if (o.cancelledAt || code === "cancelled") return { kind: "none", label: "Cancelled" };
  if (code === "delivered") return { kind: "done", label: "Delivered" };
  if (code === "rto" || code === "rto_delivered") return { kind: "track", label: code === "rto_delivered" ? "Returned" : "Track return" };
  if (code === "ndr") return { kind: "ndr", label: "Handle NDR" };
  if (!o.awb && o.addressIssue) return { kind: "fix-address", label: "Fix address" };
  if (!o.awb) return { kind: "ship", label: "Ship" };
  if (code === "awb_assigned" || code === "new") return { kind: "pickup", label: "Schedule pickup" };
  if (code === "pickup_scheduled") return { kind: "label", label: o.labelUrl ? "Print label" : "Get label" };
  return { kind: "track", label: "Track" };
}

const STYLE: Record<string, string> = {
  ship: "bg-primary text-primary-foreground hover:bg-primary/90",
  pickup: "bg-indigo-600 text-white hover:bg-indigo-700",
  label: "border bg-card hover:bg-accent",
  ndr: "bg-orange-500 text-white hover:bg-orange-600",
  "fix-address": "border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100",
  track: "border bg-card hover:bg-accent",
};
const ICON = { ship: Truck, pickup: CalendarClock, label: Printer, ndr: AlertTriangle, "fix-address": MapPin, track: ExternalLink };

export function NextActionButton({ o, busy, onAction }: { o: OrderRow; busy?: boolean; onAction: (a: RowAction) => void }) {
  const a = nextAction(o);
  if (a.kind === "none") return <span className="text-xs text-muted-foreground">Cancelled</span>;
  if (a.kind === "done")
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
        <CheckCircle2 className="h-3.5 w-3.5" /> Delivered
      </span>
    );
  const Icon = ICON[a.kind];
  const cls = cn("inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-xs font-medium transition-colors disabled:opacity-60", STYLE[a.kind]);
  if (a.kind === "track") {
    const url = o.srMeta?.trackUrl || (o.awb ? `https://shiprocket.co/tracking/${o.awb}` : null);
    return url ? (
      <a href={url} target="_blank" rel="noreferrer" className={cls} onClick={(e) => e.stopPropagation()}>
        <Icon className="h-3.5 w-3.5" /> {a.label}
      </a>
    ) : null;
  }
  if (a.kind === "label" && o.labelUrl) {
    return (
      <a href={o.labelUrl} target="_blank" rel="noreferrer" className={cls} onClick={(e) => e.stopPropagation()}>
        <Icon className="h-3.5 w-3.5" /> {a.label}
      </a>
    );
  }
  return (
    <button
      className={cls}
      disabled={busy}
      onClick={(e) => {
        e.stopPropagation();
        onAction(a.kind as RowAction);
      }}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />} {a.label}
    </button>
  );
}
