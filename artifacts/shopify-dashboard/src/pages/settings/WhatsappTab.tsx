import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Loader2, QrCode, Unplug, PlugZap, Pencil, Smartphone, Cloud } from "lucide-react";
import { toast } from "sonner";
import { api, del, patch, post } from "@/lib/api";
import { phone as fmtPhone } from "@/lib/format";
import type { WhatsappAccount } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { SectionHeader, Field, TextInput, StatusDot, Card, CopyField, Steps } from "./shared";
import { cn } from "@/lib/utils";

export function WhatsappTab() {
  const qc = useQueryClient();
  const { data: list = [] } = useQuery({ queryKey: ["wa-accounts"], queryFn: () => api<WhatsappAccount[]>("/accounts/whatsapp"), refetchInterval: 5000 });
  const { data: system } = useQuery({ queryKey: ["system"], queryFn: () => api<{ publicUrl: string }>("/system") });
  const [adding, setAdding] = useState<"web" | "meta" | null>(null);
  const [editing, setEditing] = useState<WhatsappAccount | null>(null);
  const [qrFor, setQrFor] = useState<number | null>(null);

  const connect = useMutation({
    mutationFn: (a: WhatsappAccount) => post(`/accounts/whatsapp/${a.id}/connect`),
    onSuccess: (r: any, a) => {
      if (a.provider === "web") setQrFor(a.id);
      else if (r.state === "connected") toast.success(`Connected: ${r.phone}`);
      else toast.error(r.error ?? "Could not connect");
      qc.invalidateQueries({ queryKey: ["wa-accounts"] });
    },
  });

  return (
    <div>
      <SectionHeader
        title="WhatsApp numbers"
        hint="Add as many numbers as you need, then pick one per store in Shopify stores."
        action={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setAdding("web")}>
              <Smartphone className="mr-1 h-4 w-4" /> WhatsApp Web (QR)
            </Button>
            <Button size="sm" onClick={() => setAdding("meta")}>
              <Cloud className="mr-1 h-4 w-4" /> Meta Cloud API
            </Button>
          </div>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 text-xs">
        <Card className="p-3">
          <p className="mb-1 font-semibold">WhatsApp Web (QR scan)</p>
          <p className="text-muted-foreground">Uses your normal WhatsApp/Business app number. Free, can send any text and image. Not official, so heavy bulk sending can get the number banned. Keep the PC on.</p>
        </Card>
        <Card className="p-3">
          <p className="mb-1 font-semibold">Meta Cloud API</p>
          <p className="text-muted-foreground">Official and safe for bulk and automation. Approved templates (like your vw_cart_reminder_img), per-message cost. Replies need the webhook below.</p>
        </Card>
      </div>
      <div className="space-y-3">
        {list.map((a) => (
          <Card key={a.id} className="flex items-start gap-3">
            {a.provider === "web" ? <Smartphone className="mt-0.5 h-5 w-5 text-emerald-600" /> : <Cloud className="mt-0.5 h-5 w-5 text-sky-600" />}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{a.name}</span>
                <span className="rounded bg-muted px-1.5 text-[11px]">{a.provider === "web" ? "WhatsApp Web" : "Meta API"}</span>
                <StatusDot status={a.status === "connected" ? "ok" : a.status === "error" ? "error" : "pending"} error={a.lastError} />
                <span className="text-xs text-muted-foreground">{a.status === "qr" ? "waiting for QR scan" : a.status}</span>
              </div>
              {a.phoneNumber && <p className="text-xs text-muted-foreground">{/^\d+$/.test(a.phoneNumber) ? fmtPhone(a.phoneNumber) : a.phoneNumber}</p>}
              {a.lastError && a.status !== "connected" && <p className="mt-1 text-xs text-destructive">{a.lastError}</p>}
              {a.provider === "meta" && system?.publicUrl && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <CopyField label="Callback URL" value={`${system.publicUrl}/api/webhooks/meta/${a.id}`} />
                  <CopyField label="Verify token" value={a.metaVerifyToken ?? ""} />
                </div>
              )}
              {a.provider === "meta" && !system?.publicUrl && <p className="mt-1 text-[11px] text-amber-700">Set the public URL in System & webhooks to receive replies.</p>}
            </div>
            {a.status !== "connected" ? (
              <Button size="sm" variant="outline" onClick={() => connect.mutate(a)} disabled={connect.isPending}>
                {a.provider === "web" ? <QrCode className="mr-1 h-4 w-4" /> : <PlugZap className="mr-1 h-4 w-4" />}
                {a.provider === "web" ? "Connect (QR)" : "Test"}
              </Button>
            ) : (
              a.provider === "web" && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => confirm("Log out this WhatsApp session?") && post(`/accounts/whatsapp/${a.id}/disconnect`, { logout: true }).then(() => qc.invalidateQueries({ queryKey: ["wa-accounts"] }))}
                >
                  <Unplug className="mr-1 h-4 w-4" /> Log out
                </Button>
              )
            )}
            {a.provider === "meta" && (
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditing(a)}>
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => confirm(`Remove ${a.name}?`) && del(`/accounts/whatsapp/${a.id}`).then(() => qc.invalidateQueries())}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </Card>
        ))}
      </div>
      {adding && (
        <AddDialog
          provider={adding}
          onClose={() => setAdding(null)}
          onCreated={(id) => {
            if (adding === "web") post(`/accounts/whatsapp/${id}/connect`).then(() => setQrFor(id));
          }}
        />
      )}
      {editing && <AddDialog provider="meta" existing={editing} onClose={() => setEditing(null)} onCreated={() => {}} />}
      {qrFor && <QrDialog accountId={qrFor} onClose={() => setQrFor(null)} />}
    </div>
  );
}

function AddDialog({ provider, existing, onClose, onCreated }: { provider: "web" | "meta"; existing?: WhatsappAccount; onClose: () => void; onCreated: (id: number) => void }) {
  const qc = useQueryClient();
  const [a, setA] = useState<Partial<WhatsappAccount>>(existing ?? { provider });
  const set = (p: Partial<WhatsappAccount>) => setA((x) => ({ ...x, ...p }));
  const save = useMutation({
    mutationFn: () => (existing ? patch(`/accounts/whatsapp/${existing.id}`, a) : post<{ id: number }>("/accounts/whatsapp", a)),
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ["wa-accounts"] });
      if (!existing) onCreated(r.id);
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{provider === "web" ? "Add WhatsApp Web number" : existing ? "Edit Meta number" : "Add Meta Cloud API number"}</DialogTitle>
          {provider === "web" && <DialogDescription>After saving, scan the QR from WhatsApp → Linked devices on your phone.</DialogDescription>}
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Name">
            <TextInput value={a.name ?? ""} onChange={(e) => set({ name: e.target.value })} placeholder={provider === "web" ? "Support phone" : "Vesturewears official"} />
          </Field>
          {provider === "meta" && (
            <>
              <Steps
                items={[
                  "developers.facebook.com → your app → WhatsApp → API Setup.",
                  "Copy the Phone number ID and WhatsApp Business Account ID.",
                  "Business settings → System users → generate a permanent token with whatsapp_business_messaging + whatsapp_business_management.",
                ]}
              />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Phone number ID">
                  <TextInput value={a.metaPhoneNumberId ?? ""} onChange={(e) => set({ metaPhoneNumberId: e.target.value })} />
                </Field>
                <Field label="WhatsApp Business Account ID">
                  <TextInput value={a.metaWabaId ?? ""} onChange={(e) => set({ metaWabaId: e.target.value })} />
                </Field>
              </div>
              <Field label="Permanent access token">
                <TextInput type="password" value={a.metaAccessToken ?? ""} onChange={(e) => set({ metaAccessToken: e.target.value })} autoComplete="off" />
              </Field>
              <Field label="App secret (optional)" hint="Verifies that webhooks really come from Meta.">
                <TextInput type="password" value={a.metaAppSecret ?? ""} onChange={(e) => set({ metaAppSecret: e.target.value })} autoComplete="off" />
              </Field>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !a.name || (provider === "meta" && !existing && (!a.metaPhoneNumberId || !a.metaAccessToken))}>
            {save.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {provider === "web" ? "Save & show QR" : "Save & test"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QrDialog({ accountId, onClose }: { accountId: number; onClose: () => void }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["wa-session", accountId],
    queryFn: () => api<{ state: string; qr: string | null; phone: string | null }>(`/accounts/whatsapp/${accountId}/session`),
    refetchInterval: 2000,
  });
  useEffect(() => {
    if (data?.state === "connected") {
      toast.success(`WhatsApp connected${data.phone ? `: +${data.phone}` : ""}`);
      qc.invalidateQueries({ queryKey: ["wa-accounts"] });
      onClose();
    }
  }, [data?.state]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Scan with WhatsApp</DialogTitle>
          <DialogDescription>Phone → WhatsApp → Settings → Linked devices → Link a device.</DialogDescription>
        </DialogHeader>
        <div className={cn("flex h-[290px] items-center justify-center rounded-lg border bg-white")}>
          {data?.qr ? (
            <img src={data.qr} alt="WhatsApp QR" className="h-[280px] w-[280px]" />
          ) : (
            <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              {data?.state === "disconnected" ? "Starting browser…" : "Preparing QR (can take ~20s)…"}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
