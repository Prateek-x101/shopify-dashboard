import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, post, put } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { SectionHeader, Field, TextInput, Card, CopyField, Steps } from "./shared";

interface SystemInfo {
  database: "pglite" | "postgres";
  publicUrl: string;
  webhooks: null | {
    shopify: { name: string; url: string }[];
    fastrr: { name: string; url: string }[];
    meta: { name: string; url: string; verifyToken: string | null }[];
    shiprocket: { name: string; url: string }[];
  };
}

export function SystemTab() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["system"], queryFn: () => api<SystemInfo>("/system") });
  const [url, setUrl] = useState("");
  useEffect(() => setUrl(data?.publicUrl ?? ""), [data?.publicUrl]);
  const saveUrl = useMutation({
    mutationFn: () => put("/system", { publicUrl: url }),
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["system"] });
    },
  });
  const [pw, setPw] = useState({ current: "", next: "" });
  const changePw = useMutation({
    mutationFn: () => post("/auth/change-password", pw),
    onSuccess: () => {
      toast.success("Password changed");
      setPw({ current: "", next: "" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <SectionHeader
          title="Public URL (for webhooks)"
          hint="Shopify, Meta and Fastrr push data to this address. On your PC, run a Cloudflare tunnel and paste its https URL here."
        />
        <Card className="space-y-3">
          <div className="flex gap-2">
            <TextInput value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://something.trycloudflare.com" />
            <Button onClick={() => saveUrl.mutate()} disabled={saveUrl.isPending}>
              Save
            </Button>
          </div>
          <Steps
            items={[
              <>
                Install cloudflared once: <code>winget install Cloudflare.cloudflared</code>
              </>,
              <>
                Run: <code>cloudflared tunnel --url http://localhost:5173</code> and copy the https://….trycloudflare.com address.
              </>,
              "Quick tunnels get a new address on every restart. For a fixed one, use a named Cloudflare tunnel or deploy to a server.",
            ]}
          />
        </Card>
      </div>

      {data?.webhooks && (
        <div>
          <SectionHeader title="Webhook URLs" hint="Paste these into each provider." />
          <div className="space-y-3">
            {data.webhooks.fastrr.length > 0 && (
              <Card className="space-y-2">
                <p className="text-sm font-medium">Fastrr / Shiprocket Checkout: abandoned carts</p>
                <p className="text-xs text-muted-foreground">Shiprocket Checkout panel → Settings → Webhooks → Abandoned cart.</p>
                {data.webhooks.fastrr.map((w) => (
                  <CopyField key={w.url} label={w.name} value={w.url} />
                ))}
              </Card>
            )}
            {data.webhooks.shiprocket.length > 0 && (
              <Card className="space-y-2">
                <p className="text-sm font-medium">Shiprocket: tracking updates (optional, faster than polling)</p>
                <p className="text-xs text-muted-foreground">Shiprocket → Settings → API → Webhooks.</p>
                {data.webhooks.shiprocket.map((w) => (
                  <CopyField key={w.url} label={w.name} value={w.url} />
                ))}
              </Card>
            )}
            {data.webhooks.meta.length > 0 && (
              <Card className="space-y-2">
                <p className="text-sm font-medium">Meta WhatsApp: replies and delivery ticks</p>
                <p className="text-xs text-muted-foreground">Meta app → WhatsApp → Configuration → Webhook. Subscribe to the “messages” field.</p>
                {data.webhooks.meta.map((w) => (
                  <div key={w.url} className="grid grid-cols-2 gap-2">
                    <CopyField label={`${w.name}: callback URL`} value={w.url} />
                    <CopyField label="Verify token" value={w.verifyToken ?? ""} />
                  </div>
                ))}
              </Card>
            )}
            {data.webhooks.shopify.length > 0 && (
              <Card className="space-y-2">
                <p className="text-sm font-medium">Shopify: instant orders</p>
                <p className="text-xs text-muted-foreground">Use the webhook button on each store in Shopify stores to register these automatically. Without them, orders still sync every 3 minutes.</p>
                {data.webhooks.shopify.map((w) => (
                  <CopyField key={w.url} label={w.name} value={w.url} />
                ))}
              </Card>
            )}
          </div>
        </div>
      )}

      <SheetsCard />

      <div>
        <SectionHeader title="Database" />
        <Card className="text-sm">
          {data?.database === "pglite" ? (
            <p>
              Using the <b>built-in local database</b> (folder <code>data/</code> in the project). Back up that folder. To move to a hosted Postgres (Neon / Supabase), set{" "}
              <code>DATABASE_URL</code> before starting the server.
            </p>
          ) : (
            <p>
              Connected to <b>PostgreSQL</b> via DATABASE_URL.
            </p>
          )}
        </Card>
      </div>

      <div>
        <SectionHeader title="Dashboard password" />
        <Card className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
          <Field label="Current">
            <TextInput type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
          </Field>
          <Field label="New (min 6)">
            <TextInput type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
          </Field>
          <Button onClick={() => changePw.mutate()} disabled={pw.next.length < 6 || !pw.current}>
            Change
          </Button>
        </Card>
      </div>
    </div>
  );
}

interface SheetCfg {
  enabled: boolean;
  spreadsheetId: string;
  serviceAccountJson: string;
  clientEmail: string | null;
  ordersTab: string;
  checkoutsTab: string;
  days: number;
  lastSyncAt?: string | null;
  lastError?: string | null;
}

function SheetsCard() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["sheets"], queryFn: () => api<SheetCfg>("/system/sheets") });
  const [form, setForm] = useState<Partial<SheetCfg>>({});
  useEffect(() => {
    if (data) setForm({ ...data, serviceAccountJson: "" });
  }, [data]);
  const save = useMutation({
    mutationFn: () => put("/system/sheets", form),
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["sheets"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const sync = useMutation({
    mutationFn: () => post<{ ok: boolean; error?: string; orders?: number; carts?: number }>("/system/sheets/sync"),
    onSuccess: (r) => {
      r.ok ? toast.success(`Sheet updated: ${r.orders} orders, ${r.carts} carts`) : toast.error(r.error ?? "Failed");
      qc.invalidateQueries({ queryKey: ["sheets"] });
    },
  });
  return (
    <div>
      <SectionHeader
        title="Google Sheet copy"
        hint="Every 10 minutes the dashboard writes orders and abandoned carts into your sheet (same columns as your current sheet). The sheet is a read-only copy: edits there are overwritten."
      />
      <Card className="space-y-3">
        <Steps
          items={[
            "console.cloud.google.com → create a project → enable “Google Sheets API”.",
            "IAM & Admin → Service accounts → create one → Keys → Add key → JSON. Paste the file’s contents below.",
            <>Open your Google Sheet → Share → add the service account email{data?.clientEmail ? <> (<code>{data.clientEmail}</code>)</> : ""} as Editor.</>,
          ]}
        />
        <Field label="Spreadsheet URL or ID">
          <TextInput value={form.spreadsheetId ?? ""} onChange={(e) => setForm({ ...form, spreadsheetId: e.target.value })} placeholder="https://docs.google.com/spreadsheets/d/…" />
        </Field>
        <Field label={`Service account JSON${data?.serviceAccountJson ? " (saved: paste again to replace)" : ""}`}>
          <textarea
            value={form.serviceAccountJson ?? ""}
            onChange={(e) => setForm({ ...form, serviceAccountJson: e.target.value })}
            rows={3}
            placeholder='{"type": "service_account", ...}'
            className="w-full rounded-md border bg-background px-2.5 py-2 font-mono text-xs"
          />
        </Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Orders tab">
            <TextInput value={form.ordersTab ?? ""} onChange={(e) => setForm({ ...form, ordersTab: e.target.value })} />
          </Field>
          <Field label="Abandoned tab">
            <TextInput value={form.checkoutsTab ?? ""} onChange={(e) => setForm({ ...form, checkoutsTab: e.target.value })} />
          </Field>
          <Field label="Days to include">
            <TextInput type="number" value={form.days ?? 60} onChange={(e) => setForm({ ...form, days: Number(e.target.value) })} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} /> Auto-sync every 10 minutes
        </label>
        {data?.lastError && <p className="text-xs text-destructive">{data.lastError}</p>}
        {data?.lastSyncAt && <p className="text-xs text-muted-foreground">Last synced {new Date(data.lastSyncAt).toLocaleString("en-IN")}</p>}
        <div className="flex gap-2">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            Save
          </Button>
          <Button variant="outline" onClick={() => sync.mutate()} disabled={sync.isPending || !data?.spreadsheetId}>
            {sync.isPending ? "Syncing…" : "Sync now"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
