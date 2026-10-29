import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { CheckCircle2, XCircle, Loader2, Star, Truck, FileDown, MessageCircle, Package } from "lucide-react";
import { toast } from "sonner";
import { api, post } from "@/lib/api";
import { money } from "@/lib/format";
import type { Courier, PackageInput } from "@/lib/types";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ShipOptions {
  package?: PackageInput;
  couriers: Courier[];
  pickupLocation?: string;
  autoPickup?: boolean;
  account?: string;
  error?: string;
}
interface ShipResult {
  ok: boolean;
  steps: { step: string; ok: boolean; message: string }[];
  awb: string | null;
  courier: string | null;
  labelUrl: string | null;
}

const STEP_LABEL: Record<string, string> = { create: "Created in Shiprocket", awb: "AWB assigned", pickup: "Pickup scheduled", label: "Label generated" };

export interface ShipTarget {
  id: number;
  name: string;
  customerName: string | null;
  phone: string | null;
  storeId: number;
  paymentMethod: string;
  totalPrice: string;
  city?: string | null;
  zip?: string | null;
}

export function ShipDialog({ order, onClose }: { order: ShipTarget | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [pkg, setPkg] = useState<PackageInput | null>(null);
  const [debounced, setDebounced] = useState<PackageInput | null>(null);
  const [courierId, setCourierId] = useState<number | null>(null);
  const [pickup, setPickup] = useState(true);
  const [label, setLabel] = useState(true);
  const [result, setResult] = useState<ShipResult | null>(null);

  useEffect(() => {
    setPkg(null);
    setDebounced(null);
    setCourierId(null);
    setResult(null);
  }, [order?.id]);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(pkg), 500);
    return () => clearTimeout(t);
  }, [pkg]);

  const { data, isFetching } = useQuery({
    queryKey: ["ship-options", order?.id, debounced],
    queryFn: () =>
      api<ShipOptions>(
        `/orders/${order!.id}/ship-options${debounced ? `?weight=${debounced.weight}&length=${debounced.length}&breadth=${debounced.breadth}&height=${debounced.height}` : ""}`,
      ),
    enabled: !!order,
    placeholderData: keepPreviousData,
  });
  useEffect(() => {
    if (data?.package && !pkg) setPkg(data.package);
    if (data?.autoPickup !== undefined && !debounced) setPickup(data.autoPickup);
    if (data?.couriers?.length && (courierId === null || !data.couriers.some((c) => c.id === courierId))) setCourierId(data.couriers[0].id);
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const ship = useMutation({
    mutationFn: () => post<ShipResult>(`/orders/${order!.id}/ship`, { courierId, package: pkg, pickup, label }),
    onSuccess: (r) => {
      setResult(r);
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["order"] });
      qc.invalidateQueries({ queryKey: ["timeline"] });
      qc.invalidateQueries({ queryKey: ["orders-stats"] });
      if (r.ok) toast.success(`${order!.name} shipped: AWB ${r.awb}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const notify = useMutation({
    mutationFn: () =>
      post("/messages/whatsapp", {
        to: order!.phone,
        storeId: order!.storeId,
        orderId: order!.id,
        contactName: order!.customerName,
        text: `Hi ${(order!.customerName ?? "").split(" ")[0] || "there"}, your order ${order!.name} has been shipped via ${result?.courier ?? "our courier"}. Track it here: https://shiprocket.co/tracking/${result?.awb}`,
      }),
    onSuccess: () => toast.success("Tracking link sent on WhatsApp"),
    onError: (e: Error) => toast.error(e.message),
  });

  const selected = data?.couriers.find((c) => c.id === courierId);
  const field = (k: keyof PackageInput, labelText: string, unit: string) => (
    <label className="block">
      <span className="text-[11px] text-muted-foreground">{labelText}</span>
      <div className="flex items-center rounded-md border bg-background focus-within:ring-2 focus-within:ring-ring/30">
        <input
          type="number"
          step={k === "weight" ? 0.1 : 1}
          min={0}
          value={pkg?.[k] ?? ""}
          onChange={(e) => setPkg((p) => ({ ...(p ?? { weight: 0.5, length: 28, breadth: 22, height: 4 }), [k]: Number(e.target.value) }))}
          className="h-8 w-full min-w-0 bg-transparent px-1.5 text-sm tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        />
        <span className="pr-1.5 text-[10px] text-muted-foreground">{unit}</span>
      </div>
    </label>
  );

  return (
    <Dialog open={!!order} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl gap-0 p-0">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" /> Ship {order?.name}
          </DialogTitle>
          <DialogDescription>
            {order?.customerName} · {[order?.city, order?.zip].filter(Boolean).join(" ")} · {order?.paymentMethod} {order && money(order.totalPrice)}
            {data?.pickupLocation && <> · from “{data.pickupLocation}”</>}
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3 px-5 py-4">
            <ol className="space-y-1.5">
              {result.steps.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  {s.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />}
                  <span className="font-medium">{STEP_LABEL[s.step] ?? s.step}</span>
                  <span className={cn("text-muted-foreground", !s.ok && "text-destructive")}>{s.message}</span>
                </li>
              ))}
            </ol>
            {result.ok && (
              <div className="flex flex-wrap gap-2 rounded-lg bg-emerald-50 p-3">
                <p className="w-full text-sm font-medium text-emerald-800">
                  AWB {result.awb} · {result.courier}
                </p>
                {result.labelUrl && (
                  <Button size="sm" asChild>
                    <a href={result.labelUrl} target="_blank" rel="noreferrer">
                      <FileDown className="mr-1.5 h-4 w-4" /> Print label
                    </a>
                  </Button>
                )}
                {order?.phone && (
                  <Button size="sm" variant="outline" className="bg-white" onClick={() => notify.mutate()} disabled={notify.isPending || notify.isSuccess}>
                    <MessageCircle className="mr-1.5 h-4 w-4 text-emerald-600" /> {notify.isSuccess ? "Tracking link sent" : "Send tracking on WhatsApp"}
                  </Button>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="grid gap-5 px-5 py-4 md:grid-cols-[236px_1fr]">
            <div className="space-y-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Package className="h-3.5 w-3.5" /> Package
              </p>
              {field("weight", "Weight", "kg")}
              <div className="grid grid-cols-3 gap-1.5">
                {field("length", "Length", "cm")}
                {field("breadth", "Width", "cm")}
                {field("height", "Height", "cm")}
              </div>
              <p className="text-[11px] text-muted-foreground">Rates update when you change the package. Defaults come from Settings → Shiprocket.</p>
              <div className="space-y-1.5 border-t pt-3 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={pickup} onChange={(e) => setPickup(e.target.checked)} /> Schedule pickup
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={label} onChange={(e) => setLabel(e.target.checked)} /> Generate label
                </label>
              </div>
            </div>

            <div className="min-w-0">
              <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Courier {isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              </p>
              {data?.error ? (
                <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{data.error}</p>
              ) : !data ? (
                <div className="flex h-40 items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : data.couriers.length === 0 ? (
                <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">No courier delivers to this PIN code for this package.</p>
              ) : (
                <div className="max-h-[320px] space-y-1.5 overflow-y-auto pr-1">
                  {data.couriers.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setCourierId(c.id)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
                        courierId === c.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-accent/60",
                      )}
                    >
                      <span className={cn("h-3.5 w-3.5 shrink-0 rounded-full border-2", courierId === c.id ? "border-primary bg-primary" : "border-muted-foreground/40")} />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                          {c.name}
                          {c.recommended && <span className="rounded bg-emerald-100 px-1.5 py-px text-[10px] font-semibold text-emerald-700">Recommended</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {c.etdDays ? `${c.etdDays} days` : ""}
                          {c.etd ? ` · by ${c.etd}` : ""}
                          {c.surface ? " · surface" : " · air"}
                        </p>
                      </div>
                      {c.rating != null && (
                        <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                          <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                          {c.rating.toFixed(1)}
                        </span>
                      )}
                      <span className="w-16 text-right text-sm font-semibold tabular-nums">{money(c.rate)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="border-t px-5 py-3">
          {result ? (
            <Button onClick={onClose}>Done</Button>
          ) : (
            <>
              <span className="mr-auto self-center text-xs text-muted-foreground">{selected && `${selected.name} · ${money(selected.rate)}`}</span>
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={() => ship.mutate()} disabled={ship.isPending || !data || !!data.error || !courierId}>
                {ship.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Truck className="mr-1.5 h-4 w-4" />}
                Ship now
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
