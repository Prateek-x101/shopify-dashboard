import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, RefreshCw, Loader2, PlugZap } from "lucide-react";
import { toast } from "sonner";
import { api, del, patch, post } from "@/lib/api";
import { ago } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { SectionHeader, Field, TextInput, StatusDot, Card, Steps } from "./shared";

interface SrAccount {
  id: number;
  name: string;
  email: string;
  password: string;
  pickupLocation: string;
  packageDefaults: { weight: number; length: number; breadth: number; height: number } | null;
  autoPickup: boolean;
  lastError: string | null;
  lastSyncAt: string | null;
}

export function ShiprocketTab() {
  const qc = useQueryClient();
  const { data: list = [] } = useQuery({ queryKey: ["sr-accounts"], queryFn: () => api<SrAccount[]>("/accounts/shiprocket") });
  const [editing, setEditing] = useState<Partial<SrAccount> | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const action = async (id: number, path: string, okMsg: (r: any) => string) => {
    setBusy(id);
    try {
      const r = await post(path);
      if (r.ok === false) toast.error(r.error ?? "Failed");
      else toast.success(okMsg(r));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
      qc.invalidateQueries();
    }
  };

  return (
    <div>
      <SectionHeader
        title="Shiprocket accounts"
        hint="Link each account to a store in Shopify stores. One account can serve several stores."
        action={
          <Button size="sm" onClick={() => setEditing({ pickupLocation: "Primary" })}>
            <Plus className="mr-1 h-4 w-4" /> Add account
          </Button>
        }
      />
      {list.length === 0 && (
        <Card>
          <p className="mb-2 text-sm font-medium">Create an API user in Shiprocket</p>
          <Steps
            items={[
              "Shiprocket panel → Settings → API → Configure → Create an API User.",
              "Use a different email from your login email (e.g. yourname+api@gmail.com). Shiprocket emails you the password.",
              "Enter that API user email + password here. Your main login will not work.",
            ]}
          />
        </Card>
      )}
      <div className="space-y-3">
        {list.map((a) => (
          <Card key={a.id} className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{a.name}</span>
                <StatusDot status={a.lastError ? "error" : a.lastSyncAt ? "ok" : "pending"} error={a.lastError} />
              </div>
              <p className="text-xs text-muted-foreground">
                {a.email} · pickup: {a.pickupLocation}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Default package {a.packageDefaults ? `${a.packageDefaults.weight} kg · ${a.packageDefaults.length}×${a.packageDefaults.breadth}×${a.packageDefaults.height} cm` : "0.5 kg · 28×22×4 cm"} per item ·{" "}
                {a.autoPickup ? "pickup scheduled automatically when shipping" : "pickup scheduled manually"}
              </p>
              <p className="text-[11px] text-muted-foreground">{a.lastSyncAt ? `Statuses synced ${ago(a.lastSyncAt)}` : "Not synced yet"}</p>
              {a.lastError && <p className="mt-1 text-xs text-destructive">{a.lastError}</p>}
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              title="Test login"
              disabled={busy === a.id}
              onClick={() => action(a.id, `/accounts/shiprocket/${a.id}/test`, (r) => `Connected. Pickup locations: ${r.pickupLocations?.join(", ") || "none"}`)}
            >
              <PlugZap className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" title="Sync statuses" disabled={busy === a.id} onClick={() => action(a.id, `/accounts/shiprocket/${a.id}/sync`, () => "Statuses synced")}>
              {busy === a.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditing(a)}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => confirm(`Remove ${a.name}?`) && del(`/accounts/shiprocket/${a.id}`).then(() => qc.invalidateQueries())}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </Card>
        ))}
      </div>
      {editing && <SrDialog acc={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function SrDialog({ acc, onClose }: { acc: Partial<SrAccount>; onClose: () => void }) {
  const qc = useQueryClient();
  const [a, setA] = useState(acc);
  const save = useMutation({
    mutationFn: () => (a.id ? patch(`/accounts/shiprocket/${a.id}`, a) : post("/accounts/shiprocket", a)),
    onSuccess: (r: any) => {
      if (r?.test?.ok === false) toast.error(`Saved, but login failed: ${r.test.error}`);
      else toast.success("Saved");
      qc.invalidateQueries();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{a.id ? "Edit Shiprocket account" : "Add Shiprocket account"}</DialogTitle>
          <DialogDescription>Use the API user, not your panel login.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Name">
            <TextInput value={a.name ?? ""} onChange={(e) => setA({ ...a, name: e.target.value })} placeholder="Main Shiprocket" />
          </Field>
          <Field label="API user email">
            <TextInput value={a.email ?? ""} onChange={(e) => setA({ ...a, email: e.target.value })} autoComplete="off" />
          </Field>
          <Field label="API user password">
            <TextInput type="password" value={a.password ?? ""} onChange={(e) => setA({ ...a, password: e.target.value })} autoComplete="new-password" />
          </Field>
          <Field label="Pickup location name" hint="Exactly as named in Shiprocket → Settings → Pickup addresses.">
            <TextInput value={a.pickupLocation ?? ""} onChange={(e) => setA({ ...a, pickupLocation: e.target.value })} />
          </Field>
          <Field label="Default package (one item)" hint="Pre-filled in the Ship dialog; weight is multiplied by the item count. You can change it per order.">
            <div className="grid grid-cols-4 gap-1.5">
              {(["weight", "length", "breadth", "height"] as const).map((k) => (
                <label key={k} className="block">
                  <span className="text-[10px] uppercase text-muted-foreground">{k === "weight" ? "kg" : `${k[0]} cm`}</span>
                  <TextInput
                    type="number"
                    step={k === "weight" ? 0.1 : 1}
                    value={a.packageDefaults?.[k] ?? { weight: 0.5, length: 28, breadth: 22, height: 4 }[k]}
                    onChange={(e) =>
                      setA({ ...a, packageDefaults: { ...{ weight: 0.5, length: 28, breadth: 22, height: 4 }, ...(a.packageDefaults ?? {}), [k]: Number(e.target.value) } })
                    }
                  />
                </label>
              ))}
            </div>
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={a.autoPickup ?? true} onChange={(e) => setA({ ...a, autoPickup: e.target.checked })} />
            Schedule pickup automatically when I ship an order
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !a.email || !a.password}>
            {save.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
