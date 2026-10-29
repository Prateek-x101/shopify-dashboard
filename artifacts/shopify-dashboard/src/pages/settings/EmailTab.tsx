import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, PlugZap, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { api, del, patch, post } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { SectionHeader, Field, TextInput, StatusDot, Card, Steps } from "./shared";
import { cn } from "@/lib/utils";

interface EmailAccount {
  id: number;
  name: string;
  email: string;
  fromName: string | null;
  username: string;
  password: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  imapHost: string | null;
  imapPort: number;
  status: string;
  lastError: string | null;
}

type Presets = Record<string, { smtpHost: string; smtpPort: number; smtpSecure: boolean; imapHost: string; imapPort: number }>;

export function EmailTab() {
  const qc = useQueryClient();
  const { data: list = [] } = useQuery({ queryKey: ["email-accounts"], queryFn: () => api<EmailAccount[]>("/accounts/email") });
  const [editing, setEditing] = useState<Partial<EmailAccount> | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  return (
    <div>
      <SectionHeader
        title="Email accounts"
        hint="Send emails to customers and read their replies (IMAP) right inside each order. Use the mailbox your Shopify store sends from, so customer replies to Shopify emails land here too."
        action={
          <Button size="sm" onClick={() => setEditing({ smtpPort: 465, smtpSecure: true, imapPort: 993 })}>
            <Plus className="mr-1 h-4 w-4" /> Add email
          </Button>
        }
      />
      {list.length === 0 && (
        <Card>
          <p className="mb-2 text-sm font-medium">Gmail / Google Workspace</p>
          <Steps
            items={[
              "Turn on 2-Step Verification for the Google account.",
              "Google Account → Security → App passwords → create one for “Mail”.",
              "Use the 16-character app password here (not your normal password).",
              "Shopify admin → Settings → Notifications → Sender email: set the same address so replies come to this inbox.",
            ]}
          />
        </Card>
      )}
      <div className="space-y-3">
        {list.map((a) => (
          <Card key={a.id} className="flex items-start gap-3">
            <Mail className="mt-0.5 h-5 w-5 text-sky-600" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{a.name}</span>
                <StatusDot status={a.status === "connected" ? "ok" : a.status === "error" ? "error" : "pending"} error={a.lastError} />
              </div>
              <p className="text-xs text-muted-foreground">
                {a.email} · SMTP {a.smtpHost} · {a.imapHost ? `IMAP ${a.imapHost} (reading replies)` : "replies not read"}
              </p>
              {a.lastError && <p className="mt-1 text-xs text-destructive">{a.lastError}</p>}
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              title="Test"
              disabled={busy === a.id}
              onClick={async () => {
                setBusy(a.id);
                const r = await post<{ ok: boolean; error?: string }>(`/accounts/email/${a.id}/test`).catch((e) => ({ ok: false, error: e.message }));
                setBusy(null);
                r.ok ? toast.success("Email connected") : toast.error(r.error ?? "Failed");
                qc.invalidateQueries({ queryKey: ["email-accounts"] });
              }}
            >
              {busy === a.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditing(a)}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => confirm(`Remove ${a.email}?`) && del(`/accounts/email/${a.id}`).then(() => qc.invalidateQueries())}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </Card>
        ))}
      </div>
      {editing && <EmailDialog acc={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function EmailDialog({ acc, onClose }: { acc: Partial<EmailAccount>; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: presets = {} } = useQuery({ queryKey: ["email-presets"], queryFn: () => api<Presets>("/accounts/email/presets") });
  const [a, setA] = useState(acc);
  const [readReplies, setReadReplies] = useState(acc.id ? !!acc.imapHost : true);
  const set = (p: Partial<EmailAccount>) => setA((x) => ({ ...x, ...p }));
  const save = useMutation({
    mutationFn: () => {
      const body = { ...a, imapHost: readReplies ? a.imapHost : "" };
      return a.id ? patch(`/accounts/email/${a.id}`, body) : post<{ ok: boolean; error?: string }>("/accounts/email", body);
    },
    onSuccess: (r: any) => {
      if (r?.ok === false) toast.error(`Saved, but connection failed: ${r.error}`);
      else toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["email-accounts"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{a.id ? "Edit email" : "Add email account"}</DialogTitle>
          <DialogDescription>Pick your provider to fill in the server settings.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-1">
          {Object.keys(presets).map((p) => (
            <button
              key={p}
              onClick={() => set(presets[p])}
              className={cn("rounded-md border px-2.5 py-1 text-xs capitalize", a.smtpHost === presets[p].smtpHost && "border-primary bg-primary/10 text-primary")}
            >
              {p}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Email address">
            <TextInput value={a.email ?? ""} onChange={(e) => set({ email: e.target.value, username: a.username && a.username !== a.email ? a.username : e.target.value })} />
          </Field>
          <Field label="From name">
            <TextInput value={a.fromName ?? ""} onChange={(e) => set({ fromName: e.target.value })} placeholder="Vesturewears Support" />
          </Field>
          <Field label="Username">
            <TextInput value={a.username ?? ""} onChange={(e) => set({ username: e.target.value })} />
          </Field>
          <Field label="App password">
            <TextInput type="password" value={a.password ?? ""} onChange={(e) => set({ password: e.target.value })} autoComplete="new-password" />
          </Field>
          <Field label="SMTP host">
            <TextInput value={a.smtpHost ?? ""} onChange={(e) => set({ smtpHost: e.target.value })} />
          </Field>
          <Field label="SMTP port">
            <TextInput type="number" value={a.smtpPort ?? 465} onChange={(e) => set({ smtpPort: Number(e.target.value), smtpSecure: Number(e.target.value) === 465 })} />
          </Field>
          <label className="col-span-2 flex items-center gap-2 text-xs">
            <input type="checkbox" checked={readReplies} onChange={(e) => setReadReplies(e.target.checked)} /> Read customer replies (IMAP)
          </label>
          {readReplies && (
            <>
              <Field label="IMAP host">
                <TextInput value={a.imapHost ?? ""} onChange={(e) => set({ imapHost: e.target.value })} />
              </Field>
              <Field label="IMAP port">
                <TextInput type="number" value={a.imapPort ?? 993} onChange={(e) => set({ imapPort: Number(e.target.value) })} />
              </Field>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !a.email || !a.smtpHost || (!a.id && !a.password)}>
            {save.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Save & test
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
