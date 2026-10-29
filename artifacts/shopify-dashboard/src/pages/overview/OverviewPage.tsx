import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDownRight, ArrowUpRight, Loader2 } from "lucide-react";
import { api, qs } from "@/lib/api";
import { money } from "@/lib/format";
import { useStores } from "@/hooks/use-stores";
import { ProductThumb } from "@/components/common/Status";
import { cn } from "@/lib/utils";

interface Analytics {
  days: number;
  totals: { orders: number; revenue: number; prev_orders: number; prev_revenue: number; cod: number; cancelled: number; delivered: number; rto: number };
  daily: { day: string; orders: number; revenue: number; cod: number }[];
  statuses: { status: string; n: number }[];
  couriers: { courier: string; shipped: number; delivered: number; rto: number }[];
  states: { state: string; orders: number; rto: number; delivered: number }[];
  products: { title: string; image: string | null; qty: number; revenue: number }[];
  byStore: { id: number; name: string; color: string; orders: number; revenue: number; delivered: number; rto: number }[];
  carts: { total: number; messaged: number; replied: number; recovered: number; recovered_value: number; total_value: number };
  messages: { sent: number; failed: number; received: number };
}

const SERIES = "#2a78d6"; // single-hue magnitude
const STATUS_LABEL: Record<string, string> = {
  not_shipped: "Not shipped",
  new: "In Shiprocket (new)",
  awb_assigned: "AWB assigned",
  pickup_scheduled: "Pickup scheduled",
  picked_up: "Picked up",
  in_transit: "In transit",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  ndr: "NDR / undelivered",
  rto: "RTO in progress",
  rto_delivered: "RTO delivered",
  cancelled: "Cancelled",
  lost: "Lost",
};
const STATUS_TAB: Record<string, string> = {
  not_shipped: "not_in_sr",
  new: "ready",
  awb_assigned: "to_pickup",
  pickup_scheduled: "to_pickup",
  picked_up: "in_transit",
  in_transit: "in_transit",
  out_for_delivery: "in_transit",
  delivered: "delivered",
  ndr: "ndr",
  rto: "rto",
  rto_delivered: "rto",
  cancelled: "cancelled",
};

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

export default function OverviewPage() {
  const { storeId, storeById } = useStores();
  const [days, setDays] = useState(30);
  const [metric, setMetric] = useState<"orders" | "revenue">("orders");
  const { data, isLoading } = useQuery({
    queryKey: ["analytics", storeId, days],
    queryFn: () => api<Analytics>(`/analytics${qs({ storeId, days })}`),
    refetchInterval: 120_000,
  });

  const t = data?.totals;
  const closed = (t?.delivered ?? 0) + (t?.rto ?? 0);

  return (
    <div className="h-full overflow-y-auto">
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b bg-card/95 px-5 py-3 backdrop-blur">
        <div>
          <h1 className="text-lg font-semibold">Overview</h1>
          <p className="text-xs text-muted-foreground">{storeById(storeId)?.name ?? "All stores"}</p>
        </div>
        <div className="ml-auto flex rounded-lg border bg-muted/50 p-0.5 text-xs">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={cn("rounded-md px-3 py-1.5 font-medium", days === d ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              {d} days
            </button>
          ))}
        </div>
      </header>

      {isLoading || !data || !t ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-4 p-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Kpi label="Orders" value={t.orders.toLocaleString("en-IN")} delta={change(t.orders, t.prev_orders)} />
            <Kpi label="Revenue" value={money(t.revenue)} delta={change(t.revenue, t.prev_revenue)} />
            <Kpi label="COD share" value={`${pct(t.cod, t.orders)}%`} sub={`${t.cod} COD orders`} />
            <Kpi label="Delivered" value={`${pct(t.delivered, closed)}%`} sub={`${t.delivered} of ${closed} closed shipments`} />
            <Kpi label="RTO" value={`${pct(t.rto, closed)}%`} sub={`${t.rto} returned`} tone={pct(t.rto, closed) > 20 ? "bad" : undefined} />
            <Kpi
              label="Carts recovered"
              value={`${pct(data.carts.recovered, data.carts.total)}%`}
              sub={`${data.carts.recovered} carts · ${money(data.carts.recovered_value)}`}
              tone="good"
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
            <Panel
              title={metric === "orders" ? "Orders per day" : "Revenue per day"}
              action={
                <div className="flex rounded-md border p-0.5 text-[11px]">
                  {(["orders", "revenue"] as const).map((m) => (
                    <button key={m} onClick={() => setMetric(m)} className={cn("rounded px-2 py-0.5 capitalize", metric === m ? "bg-muted font-medium" : "text-muted-foreground")}>
                      {m}
                    </button>
                  ))}
                </div>
              }
            >
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.daily} margin={{ top: 8, right: 8, bottom: 0, left: -8 }} barCategoryGap={2}>
                    <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="day"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      tickFormatter={(d: string) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      minTickGap={16}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      width={metric === "revenue" ? 56 : 32}
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      tickFormatter={(v: number) => (metric === "revenue" ? (v >= 1000 ? `₹${Math.round(v / 1000)}k` : `₹${v}`) : String(v))}
                      allowDecimals={false}
                    />
                    <Tooltip
                      cursor={{ fill: "hsl(var(--muted))" }}
                      content={({ active, payload }) => {
                        const p = payload?.[0]?.payload as Analytics["daily"][number] | undefined;
                        if (!active || !p) return null;
                        return (
                          <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
                            <p className="mb-1 font-medium">{new Date(p.day).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}</p>
                            <p>{p.orders} orders · {p.cod} COD</p>
                            <p className="text-muted-foreground">{money(p.revenue)}</p>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey={metric} fill={SERIES} radius={[4, 4, 0, 0]} maxBarSize={36} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel title="Where orders are now">
              <BarList
                items={data.statuses.map((s) => ({
                  key: s.status,
                  label: STATUS_LABEL[s.status] ?? s.status,
                  value: s.n,
                  href: STATUS_TAB[s.status] ? `/?tab=${STATUS_TAB[s.status]}` : undefined,
                  tone: s.status === "delivered" ? "good" : ["rto", "rto_delivered", "ndr", "lost"].includes(s.status) ? "bad" : undefined,
                }))}
              />
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            <Panel title="Courier performance">
              {data.couriers.length === 0 ? (
                <Empty text="No shipments yet" />
              ) : (
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="pb-2 text-left font-medium">Courier</th>
                      <th className="pb-2 text-right font-medium">Shipped</th>
                      <th className="pb-2 text-right font-medium">Delivered</th>
                      <th className="pb-2 text-right font-medium">RTO</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.couriers.map((c) => {
                      const r = pct(c.rto, c.delivered + c.rto);
                      return (
                        <tr key={c.courier} className="border-t">
                          <td className="py-1.5 pr-2">{c.courier}</td>
                          <td className="py-1.5 text-right tabular-nums">{c.shipped}</td>
                          <td className="py-1.5 text-right tabular-nums">{pct(c.delivered, c.delivered + c.rto)}%</td>
                          <td className={cn("py-1.5 text-right font-medium tabular-nums", r > 20 && "text-red-600")}>{r}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </Panel>

            <Panel title="Top states">
              {data.states.length === 0 ? (
                <Empty text="No orders yet" />
              ) : (
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="pb-2 text-left font-medium">State</th>
                      <th className="pb-2 text-right font-medium">Orders</th>
                      <th className="pb-2 text-right font-medium">RTO</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.states.map((s) => {
                      const r = pct(s.rto, s.delivered + s.rto);
                      return (
                        <tr key={s.state} className="border-t">
                          <td className="py-1.5">{s.state}</td>
                          <td className="py-1.5 text-right tabular-nums">{s.orders}</td>
                          <td className={cn("py-1.5 text-right tabular-nums", r > 20 && "font-medium text-red-600")}>{s.delivered + s.rto ? `${r}%` : "–"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </Panel>

            <Panel title="Best sellers">
              {data.products.length === 0 ? (
                <Empty text="No orders yet" />
              ) : (
                <ul className="space-y-2">
                  {data.products.map((p) => (
                    <li key={p.title} className="flex items-center gap-2.5 text-xs">
                      <ProductThumb src={p.image} title={p.title} size={32} />
                      <span className="min-w-0 flex-1 truncate">{p.title}</span>
                      <span className="tabular-nums text-muted-foreground">{p.qty} sold</span>
                      <span className="w-16 text-right font-medium tabular-nums">{money(p.revenue)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Abandoned cart recovery" action={<Link href="/abandoned" className="text-xs text-primary hover:underline">Open carts →</Link>}>
              <BarList
                items={[
                  { key: "total", label: "Abandoned", value: data.carts.total },
                  { key: "messaged", label: "Messaged", value: data.carts.messaged },
                  { key: "replied", label: "Replied", value: data.carts.replied },
                  { key: "recovered", label: "Recovered", value: data.carts.recovered, tone: "good" },
                ]}
                max={data.carts.total}
                showShare
              />
              <p className="mt-3 text-xs text-muted-foreground">
                {money(data.carts.recovered_value)} recovered of {money(data.carts.total_value)} abandoned · {data.messages.sent} messages sent
                {data.messages.failed > 0 && <span className="text-red-600"> · {data.messages.failed} failed</span>} · {data.messages.received} replies
              </p>
            </Panel>

            {data.byStore.length > 1 ? (
              <Panel title="Stores">
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="pb-2 text-left font-medium">Store</th>
                      <th className="pb-2 text-right font-medium">Orders</th>
                      <th className="pb-2 text-right font-medium">Revenue</th>
                      <th className="pb-2 text-right font-medium">RTO</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byStore.map((s) => (
                      <tr key={s.id} className="border-t">
                        <td className="py-1.5">
                          <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
                          {s.name}
                        </td>
                        <td className="py-1.5 text-right tabular-nums">{s.orders}</td>
                        <td className="py-1.5 text-right tabular-nums">{money(s.revenue)}</td>
                        <td className="py-1.5 text-right tabular-nums">{s.delivered + s.rto ? `${pct(s.rto, s.delivered + s.rto)}%` : "–"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Panel>
            ) : (
              <Panel title="Payment mix">
                <BarList
                  items={[
                    { key: "cod", label: "COD", value: t.cod },
                    { key: "prepaid", label: "Prepaid", value: t.orders - t.cod },
                  ]}
                  max={t.orders}
                  showShare
                />
              </Panel>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function change(cur: number, prev: number) {
  if (!prev) return null;
  return Math.round(((cur - prev) / prev) * 100);
}

function Kpi({ label, value, sub, delta, tone }: { label: string; value: string; sub?: string; delta?: number | null; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold tabular-nums tracking-tight", tone === "bad" && "text-red-600", tone === "good" && "text-emerald-600")}>{value}</p>
      {delta != null ? (
        <p className={cn("mt-0.5 flex items-center gap-0.5 text-xs", delta >= 0 ? "text-emerald-600" : "text-red-600")}>
          {delta >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
          {Math.abs(delta)}% vs previous period
        </p>
      ) : (
        sub && <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p>
      )}
    </div>
  );
}

function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-6 text-center text-xs text-muted-foreground">{text}</p>;
}

function BarList({
  items,
  max,
  showShare,
}: {
  items: { key: string; label: string; value: number; href?: string; tone?: "good" | "bad" }[];
  max?: number;
  showShare?: boolean;
}) {
  const top = max ?? Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-1.5">
      {items.map((i) => {
        const w = top ? Math.max(2, (i.value / top) * 100) : 0;
        const inner = (
          <div className="group relative flex h-7 items-center rounded-md px-2 text-xs hover:bg-muted/60" title={`${i.label}: ${i.value}`}>
            <div
              className={cn("absolute inset-y-1 left-0 rounded-[4px]", i.tone === "good" ? "bg-emerald-500/20" : i.tone === "bad" ? "bg-red-500/15" : "bg-[#2a78d6]/15")}
              style={{ width: `${w}%` }}
            />
            <span className="relative flex-1 truncate">{i.label}</span>
            <span className="relative font-medium tabular-nums">
              {i.value}
              {showShare && <span className="ml-1 font-normal text-muted-foreground">({pct(i.value, top)}%)</span>}
            </span>
          </div>
        );
        return <li key={i.key}>{i.href ? <Link href={i.href}>{inner}</Link> : inner}</li>;
      })}
    </ul>
  );
}
