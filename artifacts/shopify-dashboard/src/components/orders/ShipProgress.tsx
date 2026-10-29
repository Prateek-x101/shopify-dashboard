import { Check, RotateCcw, X } from "lucide-react";
import { dateShort } from "@/lib/format";
import type { SrMeta } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * One order's journey from Shopify to the customer's door, as a single
 * stepper: Placed → Shiprocket → AWB → Picked up → In transit → Out for delivery → Delivered.
 */
export const STAGES = [
  { key: "placed", label: "Placed" },
  { key: "sr", label: "In Shiprocket" },
  { key: "awb", label: "AWB" },
  { key: "picked", label: "Picked up" },
  { key: "transit", label: "In transit" },
  { key: "ofd", label: "Out for delivery" },
  { key: "delivered", label: "Delivered" },
] as const;

const CODE_TO_STAGE: Record<string, number> = {
  new: 1,
  awb_assigned: 2,
  pickup_scheduled: 2,
  picked_up: 3,
  in_transit: 4,
  ndr: 4,
  out_for_delivery: 5,
  delivered: 6,
  rto: 4,
  rto_delivered: 4,
  lost: 4,
};

export interface ProgressInput {
  srStatusCode: string | null;
  srStatus: string | null;
  srOrderId: string | null;
  awb: string | null;
  cancelledAt: string | null;
  srMeta?: SrMeta | null;
}

export function shipState(o: ProgressInput) {
  const code = o.srStatusCode ?? "";
  const cancelled = !!o.cancelledAt || code === "cancelled";
  const rto = code === "rto" || code === "rto_delivered";
  const problem = code === "ndr" || code === "lost";
  let stage = o.srOrderId ? CODE_TO_STAGE[code] ?? 1 : 0;
  if (o.awb && stage < 2) stage = 2;
  const label = cancelled
    ? "Cancelled"
    : rto
      ? code === "rto_delivered"
        ? "Returned to you (RTO)"
        : "Returning (RTO)"
      : code === "ndr"
        ? "Delivery failed (NDR)"
        : code === "lost"
          ? "Lost / damaged"
          : code === "pickup_scheduled"
            ? "Pickup scheduled"
            : !o.srOrderId
              ? "Not shipped yet"
              : STAGES[stage].label;
  return { stage, cancelled, rto, problem, label };
}

const TONE = {
  cancelled: "text-zinc-400",
  rto: "text-rose-600",
  problem: "text-orange-600",
  done: "text-emerald-600",
  active: "text-sky-700",
  idle: "text-muted-foreground",
};

/** Compact stepper for table rows. */
export function ShipProgressMini({ o }: { o: ProgressInput }) {
  const s = shipState(o);
  const tone = s.cancelled ? TONE.cancelled : s.rto ? TONE.rto : s.problem ? TONE.problem : s.stage === 6 ? TONE.done : s.stage > 0 ? TONE.active : TONE.idle;
  const bar = s.cancelled ? "bg-zinc-300" : s.rto ? "bg-rose-500" : s.problem ? "bg-orange-500" : s.stage === 6 ? "bg-emerald-500" : "bg-sky-500";
  const eta = o.srMeta?.deliveredAt ? `on ${dateShort(o.srMeta.deliveredAt)}` : o.srMeta?.etd && s.stage >= 2 && s.stage < 6 && !s.rto ? `ETA ${dateShort(o.srMeta.etd).replace(/ \d.*$/, "")}` : null;
  return (
    <div className="min-w-[150px]">
      <div className={cn("flex items-center gap-1 text-[12px] font-medium", tone)}>
        {s.rto && <RotateCcw className="h-3 w-3" />}
        {s.cancelled && <X className="h-3 w-3" />}
        {s.stage === 6 && !s.rto && <Check className="h-3 w-3" />}
        {s.label}
        {eta && <span className="font-normal text-muted-foreground">· {eta}</span>}
      </div>
      <div className="mt-1 flex gap-[3px]" aria-hidden>
        {STAGES.slice(0, 7).map((st, i) => (
          <span
            key={st.key}
            title={st.label}
            className={cn("h-1.5 flex-1 rounded-full", i <= s.stage && !s.cancelled ? bar : "bg-muted", i === 0 && !s.cancelled && "bg-emerald-500")}
          />
        ))}
      </div>
    </div>
  );
}

/** Full stepper for the order page. */
export function ShipProgressFull({ o }: { o: ProgressInput & { createdAt: string } }) {
  const s = shipState(o);
  const when: (string | null | undefined)[] = [o.createdAt, null, null, o.srMeta?.pickedUpAt, null, o.srMeta?.outForDeliveryAt, o.srMeta?.deliveredAt];
  return (
    <div>
      <ol className="flex items-start">
        {STAGES.map((st, i) => {
          const done = !s.cancelled && i <= s.stage;
          const current = !s.cancelled && i === s.stage;
          const bad = current && (s.rto || s.problem);
          return (
            <li key={st.key} className="relative flex flex-1 flex-col items-center text-center">
              {i > 0 && <span className={cn("absolute right-1/2 top-[11px] h-0.5 w-full -translate-y-1/2", done ? (s.rto ? "bg-rose-400" : "bg-emerald-500") : "bg-border")} />}
              <span
                className={cn(
                  "relative z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 text-[10px] font-bold",
                  bad ? "border-orange-500 bg-orange-50 text-orange-600" : done ? "border-emerald-500 bg-emerald-500 text-white" : "border-border bg-card text-muted-foreground",
                  current && !bad && "ring-4 ring-emerald-500/20",
                )}
              >
                {done && !bad ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className={cn("mt-1.5 text-[11px] leading-tight", current ? "font-semibold text-foreground" : "text-muted-foreground")}>{st.label}</span>
              {when[i] && done && <span className="text-[10px] text-muted-foreground">{dateShort(when[i]!).replace(/ \d+:\d+.*$/, "")}</span>}
            </li>
          );
        })}
      </ol>
      {(s.cancelled || s.rto || s.problem) && (
        <p className={cn("mt-3 rounded-md px-2.5 py-1.5 text-xs font-medium", s.cancelled ? "bg-zinc-100 text-zinc-600" : s.rto ? "bg-rose-50 text-rose-700" : "bg-orange-50 text-orange-700")}>
          {s.label}
          {o.srStatus && !s.cancelled && <span className="font-normal"> · Shiprocket says “{o.srStatus.toLowerCase()}”</span>}
        </p>
      )}
    </div>
  );
}
