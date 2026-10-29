import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, ShoppingCart, Package, Truck, Clock, MessageCircle, Mail } from "lucide-react";
import { toast } from "sonner";
import { api, del, patch, post } from "@/lib/api";
import { ago } from "@/lib/format";
import { SR_STATUSES, ORDER_VARS, CHECKOUT_VARS, type AutomationRule, type MetaTemplate, type WhatsappAccount } from "@/lib/types";
import { useStores } from "@/hooks/use-stores";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const SECTIONS = [
  {
    trigger: "abandoned_checkout" as const,
    title: "Abandoned cart recovery",
    icon: ShoppingCart,
    hint: "Steps run in order after a cart is abandoned. Stops as soon as the customer orders, replies or opts out.",
  },
  { trigger: "order_created" as const, title: "New order messages", icon: Package, hint: "e.g. COD confirmation or a thank-you right after the order." },
  { trigger: "shipment_status" as const, title: "Shipping updates", icon: Truck, hint: "Sent when Shiprocket reports a new status for the order." },
];

function delayLabel(m: number) {
  if (m === 0) return "Immediately";
  if (m < 60) return `After ${m} min`;
  if (m < 1440) return `After ${+(m / 60).toFixed(1)} hr`;
  return `After ${+(m / 1440).toFixed(1)} days`;
}

export default function AutomationsPage() {
  const qc = useQueryClient();
  const { storeById } = useStores();
  const { data: rules = [] } = useQuery({ queryKey: ["automations"], queryFn: () => api<AutomationRule[]>("/automations") });
  const [editing, setEditing] = useState<Partial<AutomationRule> | null>(null);

  const toggle = useMutation({
    mutationFn: (r: AutomationRule) => patch(`/automations/${r.id}`, { enabled: !r.enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["automations"] }),
  });
  const remove = useMutation({
    mutationFn: (id: number) => del(`/automations/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["automations"] }),
  });

  return (
    <div className="h-full overflow-y-auto">
      <header className="border-b bg-card px-5 py-3">
        <h1 className="text-lg font-semibold">Automations</h1>
        <p className="text-xs text-muted-foreground">
          Automatic WhatsApp / email messages. Each rule sends at most once per order or cart. Rules only apply to orders and carts created after the rule.
        </p>
      </header>
      <div className="mx-auto max-w-4xl space-y-6 p-5">
        {SECTIONS.map((s) => {
          const list = rules.filter((r) => r.trigger === s.trigger).sort((a, b) => a.delayMinutes - b.delayMinutes);
          const Icon = s.icon;
          return (
            <section key={s.trigger} className="rounded-lg border bg-card">
              <div className="flex items-start gap-3 border-b p-4">
                <div className="rounded-md bg-primary/10 p-2 text-primary">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <h2 className="font-semibold">{s.title}</h2>
                  <p className="text-xs text-muted-foreground">{s.hint}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setEditing({
                      trigger: s.trigger,
                      name: "",
                      triggerValue: s.trigger === "shipment_status" ? "out_for_delivery" : "",
                      delayMinutes: s.trigger === "abandoned_checkout" ? 30 : 0,
                      channel: "whatsapp",
                      messageType: "text",
                      body: "",
                      templateParams: [],
                      includeImage: false,
                      enabled: true,
                      storeId: null,
                    })
                  }
                >
                  <Plus className="mr-1 h-4 w-4" /> {s.trigger === "abandoned_checkout" ? "Add step" : "Add rule"}
                </Button>
              </div>
              {list.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">Nothing set up yet.</p>
              ) : (
                <ol className="divide-y">
                  {list.map((r, i) => (
                    <li key={r.id} className={cn("flex items-start gap-3 p-4", !r.enabled && "opacity-50")}>
                      {s.trigger === "abandoned_checkout" ? (
                        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{i + 1}</span>
                      ) : r.channel === "email" ? (
                        <Mail className="mt-1 h-4 w-4 shrink-0 text-sky-600" />
                      ) : (
                        <MessageCircle className="mt-1 h-4 w-4 shrink-0 text-emerald-600" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{r.name}</span>
                          <span className="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {delayLabel(r.delayMinutes)}
                          </span>
                          {r.trigger === "shipment_status" && (
                            <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[11px] text-sky-700">when {SR_STATUSES.find((x) => x.key === r.triggerValue)?.label}</span>
                          )}
                          {r.trigger === "order_created" && r.triggerValue && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-800">{r.triggerValue} only</span>}
                          <span className="text-[11px] text-muted-foreground">{r.storeId ? storeById(r.storeId)?.name : "All stores"}</span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {r.messageType === "template" ? `Template: ${r.templateName} (${r.templateParams.join(", ")})` : r.body}
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {r.stats?.sent ?? 0} sent · {r.stats?.failed ?? 0} failed{r.stats?.last ? ` · last ${ago(r.stats.last)}` : ""}
                        </p>
                      </div>
                      <Switch checked={r.enabled} onCheckedChange={() => toggle.mutate(r)} />
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditing(r)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => confirm(`Delete "${r.name}"?`) && remove.mutate(r.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          );
        })}
      </div>
      {editing && <RuleEditor rule={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function RuleEditor({ rule, onClose }: { rule: Partial<AutomationRule>; onClose: () => void }) {
  const qc = useQueryClient();
  const { stores } = useStores();
  const [r, setR] = useState<Partial<AutomationRule>>(rule);
  const [unit, setUnit] = useState<"min" | "hr" | "day">((rule.delayMinutes ?? 0) >= 1440 && (rule.delayMinutes ?? 0) % 1440 === 0 ? "day" : (rule.delayMinutes ?? 0) >= 60 && (rule.delayMinutes ?? 0) % 60 === 0 ? "hr" : "min");
  const factor = unit === "day" ? 1440 : unit === "hr" ? 60 : 1;
  const set = (patch: Partial<AutomationRule>) => setR((x) => ({ ...x, ...patch }));

  const { data: accounts = [] } = useQuery({ queryKey: ["wa-accounts"], queryFn: () => api<WhatsappAccount[]>("/accounts/whatsapp") });
  const meta = accounts.find((a) => a.provider === "meta");
  const { data: templates = [] } = useQuery({
    queryKey: ["templates", meta?.id],
    queryFn: () => api<MetaTemplate[]>(`/accounts/whatsapp/${meta!.id}/templates`),
    enabled: !!meta,
  });
  const vars = r.trigger === "abandoned_checkout" ? CHECKOUT_VARS : ORDER_VARS;

  const save = useMutation({
    mutationFn: () => (r.id ? patch(`/automations/${r.id}`, r) : post("/automations", r)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["automations"] });
      toast.success("Saved");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const tpl = templates.find((t) => t.name === r.templateName);
  const valid = r.name && (r.messageType === "template" ? r.templateName : r.body?.trim());

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{r.id ? "Edit rule" : "New rule"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <Field label="Name">
            <input value={r.name ?? ""} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Reminder (30 min)" className="h-9 w-full rounded-md border px-2.5" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Store">
              <select value={r.storeId ?? ""} onChange={(e) => set({ storeId: e.target.value ? Number(e.target.value) : null })} className="h-9 w-full rounded-md border bg-card px-2">
                <option value="">All stores</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            {r.trigger === "shipment_status" && (
              <Field label="When status becomes">
                <select value={r.triggerValue} onChange={(e) => set({ triggerValue: e.target.value })} className="h-9 w-full rounded-md border bg-card px-2">
                  {SR_STATUSES.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {r.trigger === "order_created" && (
              <Field label="Orders">
                <select value={r.triggerValue} onChange={(e) => set({ triggerValue: e.target.value })} className="h-9 w-full rounded-md border bg-card px-2">
                  <option value="">All orders</option>
                  <option value="COD">COD only</option>
                  <option value="Prepaid">Prepaid only</option>
                </select>
              </Field>
            )}
          </div>
          <Field label={r.trigger === "abandoned_checkout" ? "Send after cart is abandoned" : "Delay"}>
            <div className="flex gap-2">
              <input
                type="number"
                min={0}
                value={Math.round((r.delayMinutes ?? 0) / factor)}
                onChange={(e) => set({ delayMinutes: Number(e.target.value) * factor })}
                className="h-9 w-24 rounded-md border px-2.5"
              />
              <select value={unit} onChange={(e) => (setUnit(e.target.value as "min"), set({ delayMinutes: Math.round((r.delayMinutes ?? 0) / factor) * (e.target.value === "day" ? 1440 : e.target.value === "hr" ? 60 : 1) }))} className="h-9 rounded-md border bg-card px-2">
                <option value="min">minutes</option>
                <option value="hr">hours</option>
                <option value="day">days</option>
              </select>
            </div>
          </Field>
          <div className="flex gap-1">
            {(["whatsapp", "email"] as const).map((c) => (
              <button key={c} onClick={() => set({ channel: c, messageType: "text" })} className={cn("rounded-md border px-3 py-1 text-xs", r.channel === c && "border-primary bg-primary/10 text-primary")}>
                {c === "whatsapp" ? "WhatsApp" : "Email"}
              </button>
            ))}
            {r.channel === "whatsapp" && meta && (
              <div className="ml-auto flex gap-1">
                {(["text", "template"] as const).map((m) => (
                  <button key={m} onClick={() => set({ messageType: m })} className={cn("rounded-md border px-3 py-1 text-xs", r.messageType === m && "border-primary bg-primary/10 text-primary")}>
                    {m === "text" ? "Free text" : "Meta template"}
                  </button>
                ))}
              </div>
            )}
          </div>

          {r.messageType === "template" ? (
            <>
              <Field label="Template">
                <select
                  value={r.templateName ?? ""}
                  onChange={(e) => {
                    const t = templates.find((x) => x.name === e.target.value);
                    set({ templateName: e.target.value, templateLanguage: t?.language ?? "en", templateParams: Array.from({ length: t?.paramCount ?? 0 }, (_, i) => r.templateParams?.[i] ?? ["{first_name}", "{product}", "{total}", "{checkout_url}"][i] ?? "") });
                  }}
                  className="h-9 w-full rounded-md border bg-card px-2"
                >
                  <option value="">Choose…</option>
                  {templates.filter((t) => t.status === "APPROVED").map((t) => (
                    <option key={`${t.name}${t.language}`} value={t.name}>
                      {t.name} ({t.language})
                    </option>
                  ))}
                </select>
              </Field>
              {tpl && <p className="rounded bg-muted p-2 text-xs">{tpl.body}</p>}
              {(r.templateParams ?? []).map((p, i) => (
                <input key={i} value={p} onChange={(e) => set({ templateParams: r.templateParams!.map((x, j) => (j === i ? e.target.value : x)) })} placeholder={`{{${i + 1}}}`} className="h-8 w-full rounded border px-2 text-xs" />
              ))}
            </>
          ) : (
            <>
              {r.channel === "email" && (
                <Field label="Subject">
                  <input value={r.subject ?? ""} onChange={(e) => set({ subject: e.target.value })} className="h-9 w-full rounded-md border px-2.5" />
                </Field>
              )}
              <Field label="Message">
                <textarea value={r.body ?? ""} onChange={(e) => set({ body: e.target.value })} rows={5} className="w-full rounded-md border px-2.5 py-2" />
              </Field>
              <div className="flex flex-wrap gap-1">
                {vars.map((v) => (
                  <button key={v} onClick={() => set({ body: `${r.body ?? ""}{${v}}` })} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] hover:bg-accent">
                    {`{${v}}`}
                  </button>
                ))}
              </div>
            </>
          )}
          {r.channel === "whatsapp" && (
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={!!r.includeImage} onChange={(e) => set({ includeImage: e.target.checked })} />
              {r.messageType === "template" ? "Use product image as template header" : "Attach product image"}
            </label>
          )}
          {r.channel === "whatsapp" && r.messageType === "text" && meta && (
            <p className="text-[11px] text-amber-700">With a Meta number, free text only reaches customers who messaged you in the last 24h, so automations should use templates.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={!valid || save.isPending}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
