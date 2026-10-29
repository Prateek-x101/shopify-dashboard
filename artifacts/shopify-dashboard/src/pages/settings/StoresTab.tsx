import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, Pencil, Trash2, Webhook, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api, del, patch, post } from "@/lib/api";
import { ago } from "@/lib/format";
import type { Store } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { SectionHeader, Field, TextInput, StatusDot, Card, Steps } from "./shared";

const COLORS = ["#2563eb", "#db2777", "#059669", "#d97706", "#7c3aed", "#0891b2", "#dc2626", "#475569"];

export function StoresTab() {
  const qc = useQueryClient();
  const { data: stores = [] } = useQuery({ queryKey: ["stores"], queryFn: () => api<Store[]>("/stores") });
  const { data: sr = [] } = useQuery({ queryKey: ["sr-accounts"], queryFn: () => api<{ id: number; name: string }[]>("/accounts/shiprocket") });
  const { data: wa = [] } = useQuery({ queryKey: ["wa-accounts"], queryFn: () => api<{ id: number; name: string }[]>("/accounts/whatsapp") });
  const { data: em = [] } = useQuery({ queryKey: ["email-accounts"], queryFn: () => api<{ id: number; name: string }[]>("/accounts/email") });
  const [editing, setEditing] = useState<Partial<Store> | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const run = async (id: number, fn: () => Promise<unknown>) => {
    setBusy(id);
    try {
      await fn();
    } finally {
      setBusy(null);
      qc.invalidateQueries();
    }
  };

  return (
    <div>
      <SectionHeader
        title="Shopify stores"
        hint="Every store you connect gets its own orders, carts and default Shiprocket / WhatsApp / email account."
        action={
          <Button size="sm" onClick={() => setEditing({ color: COLORS[stores.length % COLORS.length], active: true })}>
            <Plus className="mr-1 h-4 w-4" /> Connect store
          </Button>
        }
      />
      <div className="space-y-3">
        {stores.length === 0 && (
          <Card>
            <p className="mb-2 text-sm font-medium">How to get the access token</p>
            <Steps
              items={[
                <>Shopify admin → Settings → Apps and sales channels → Develop apps → Create an app.</>,
                <>
                  Configure Admin API scopes: <code>read_orders</code>, <code>read_all_orders</code>, <code>read_customers</code>, <code>read_products</code>.
                </>,
                <>Install the app and copy the Admin API access token (starts with shpat_). It is shown only once.</>,
                <>Optional: copy the API secret key too, so webhooks can be verified.</>,
              ]}
            />
          </Card>
        )}
        {stores.map((s) => (
          <Card key={s.id} className="flex items-start gap-3">
            <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: s.color }} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{s.name}</span>
                <StatusDot status={s.lastError ? "error" : s.lastOrderSyncAt ? "ok" : "pending"} error={s.lastError} />
                {!s.active && <span className="rounded bg-muted px-1.5 text-[11px]">paused</span>}
              </div>
              <p className="text-xs text-muted-foreground">{s.shopDomain}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Shiprocket: {sr.find((a) => a.id === s.shiprocketAccountId)?.name ?? "—"} · WhatsApp: {wa.find((a) => a.id === s.whatsappAccountId)?.name ?? "—"} · Email:{" "}
                {em.find((a) => a.id === s.emailAccountId)?.name ?? "—"}
              </p>
              <p className="text-[11px] text-muted-foreground">{s.lastOrderSyncAt ? `Synced ${ago(s.lastOrderSyncAt)}` : "Not synced yet"}</p>
              {s.lastError && <p className="mt-1 text-xs text-destructive">{s.lastError}</p>}
            </div>
            <div className="flex gap-1">
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                title="Sync now"
                disabled={busy === s.id}
                onClick={() =>
                  run(s.id, async () => {
                    const r = await post<{ ok: boolean; error: string | null }>(`/stores/${s.id}/sync`);
                    r.ok ? toast.success("Synced") : toast.error(r.error ?? "Sync failed");
                  })
                }
              >
                {busy === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                title="Register Shopify webhooks (instant new orders)"
                onClick={() =>
                  run(s.id, async () => {
                    try {
                      const r = await post<{ results: string[] }>(`/stores/${s.id}/register-webhooks`);
                      toast.success(r.results.join(", "));
                    } catch (e) {
                      toast.error((e as Error).message);
                    }
                  })
                }
              >
                <Webhook className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditing(s)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-destructive"
                onClick={() => confirm(`Remove ${s.name}? Its synced orders and carts are deleted from the dashboard (not from Shopify).`) && run(s.id, () => del(`/stores/${s.id}`))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </Card>
        ))}
      </div>
      {editing && <StoreDialog store={editing} sr={sr} wa={wa} em={em} onClose={() => setEditing(null)} />}
    </div>
  );
}

function StoreDialog({
  store,
  sr,
  wa,
  em,
  onClose,
}: {
  store: Partial<Store>;
  sr: { id: number; name: string }[];
  wa: { id: number; name: string }[];
  em: { id: number; name: string }[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [s, setS] = useState<Partial<Store>>(store);
  const set = (p: Partial<Store>) => setS((x) => ({ ...x, ...p }));
  const save = useMutation({
    mutationFn: () => (s.id ? patch(`/stores/${s.id}`, s) : post("/stores", s)),
    onSuccess: () => {
      toast.success(s.id ? "Store updated" : "Store connected: first sync started (last 60 days)");
      qc.invalidateQueries();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const selectAcc = (label: string, key: "shiprocketAccountId" | "whatsappAccountId" | "emailAccountId", list: { id: number; name: string }[]) => (
    <Field label={label}>
      <select value={s[key] ?? ""} onChange={(e) => set({ [key]: e.target.value ? Number(e.target.value) : null })} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
        <option value="">None</option>
        {list.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
    </Field>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{s.id ? `Edit ${store.name}` : "Connect a Shopify store"}</DialogTitle>
          <DialogDescription>The token is checked against Shopify before saving.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Store name">
            <TextInput value={s.name ?? ""} onChange={(e) => set({ name: e.target.value })} placeholder="Vesturewears" />
          </Field>
          <Field label="Colour">
            <div className="flex h-9 items-center gap-1.5">
              {COLORS.map((c) => (
                <button key={c} onClick={() => set({ color: c })} className="h-5 w-5 rounded-full ring-offset-2" style={{ background: c, boxShadow: s.color === c ? `0 0 0 2px ${c}` : undefined }} />
              ))}
            </div>
          </Field>
          <div className="col-span-2">
            <Field label="Shop domain" hint="The .myshopify.com address, not your custom domain.">
              <TextInput value={s.shopDomain ?? ""} onChange={(e) => set({ shopDomain: e.target.value })} placeholder="your-store.myshopify.com" />
            </Field>
          </div>
          <div className="col-span-2">
            <Field label="Admin API access token">
              <TextInput type="password" value={s.accessToken ?? ""} onChange={(e) => set({ accessToken: e.target.value })} placeholder="shpat_…" autoComplete="off" />
            </Field>
          </div>
          <Field label="Website domain" hint="Used for Fastrr cart links.">
            <TextInput value={s.publicDomain ?? ""} onChange={(e) => set({ publicDomain: e.target.value })} placeholder="www.yourbrand.com" />
          </Field>
          <Field label="API secret key (optional)" hint="Verifies Shopify webhooks.">
            <TextInput type="password" value={s.webhookSecret ?? ""} onChange={(e) => set({ webhookSecret: e.target.value })} autoComplete="off" />
          </Field>
          {selectAcc("Shiprocket account", "shiprocketAccountId", sr)}
          {selectAcc("WhatsApp number", "whatsappAccountId", wa)}
          {selectAcc("Email account", "emailAccountId", em)}
          <div className="col-span-2 space-y-1.5 rounded-md border bg-muted/40 p-2.5 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={s.fulfillInShopify ?? true} onChange={(e) => set({ fulfillInShopify: e.target.checked })} />
              Mark orders fulfilled in Shopify with AWB + tracking link when shipped
            </label>
            <label className="flex items-center gap-2 pl-5 text-xs text-muted-foreground">
              <input type="checkbox" checked={s.notifyOnFulfill ?? true} onChange={(e) => set({ notifyOnFulfill: e.target.checked })} disabled={s.fulfillInShopify === false} />
              Let Shopify email the customer their tracking link
            </label>
          </div>
          <Field label="Status">
            <select value={s.active === false ? "0" : "1"} onChange={(e) => set({ active: e.target.value === "1" })} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
              <option value="1">Active (syncing)</option>
              <option value="0">Paused</option>
            </select>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !s.name || !s.shopDomain || !s.accessToken}>
            {save.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {s.id ? "Save" : "Connect"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
