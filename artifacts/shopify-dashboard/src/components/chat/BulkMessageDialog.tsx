import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, post } from "@/lib/api";
import { ORDER_VARS, CHECKOUT_VARS, type MetaTemplate, type WhatsappAccount } from "@/lib/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function BulkMessageDialog({
  open,
  onOpenChange,
  ids,
  kind,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  ids: number[];
  kind: "order" | "checkout";
}) {
  const qc = useQueryClient();
  const [channel, setChannel] = useState<"whatsapp" | "email">("whatsapp");
  const [mode, setMode] = useState<"text" | "template">("text");
  const [text, setText] = useState("");
  const [subject, setSubject] = useState("");
  const [includeImage, setIncludeImage] = useState(false);
  const [tpl, setTpl] = useState<MetaTemplate | null>(null);
  const [params, setParams] = useState<string[]>([]);
  const [results, setResults] = useState<{ id: number; ok: boolean; message: string }[] | null>(null);

  const { data: accounts = [] } = useQuery({ queryKey: ["wa-accounts"], queryFn: () => api<WhatsappAccount[]>("/accounts/whatsapp"), enabled: open });
  const meta = accounts.find((a) => a.provider === "meta" && a.status === "connected");
  const { data: templates = [] } = useQuery({
    queryKey: ["templates", meta?.id],
    queryFn: () => api<MetaTemplate[]>(`/accounts/whatsapp/${meta!.id}/templates`),
    enabled: !!meta && open,
  });
  const vars = kind === "order" ? ORDER_VARS : CHECKOUT_VARS;

  const send = useMutation({
    mutationFn: () =>
      post<{ results: { id: number; ok: boolean; message: string }[]; sent: number; failed: number }>("/messages/bulk", {
        channel,
        text,
        subject,
        includeImage,
        ...(channel === "whatsapp" && mode === "template" && tpl ? { templateName: tpl.name, templateLanguage: tpl.language, templateParams: params } : {}),
        ...(kind === "order" ? { orderIds: ids } : { checkoutIds: ids }),
      }),
    onSuccess: (r) => {
      setResults(r.results);
      toast.success(`Sent ${r.sent}, failed ${r.failed}`);
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const close = (o: boolean) => {
    if (!o) setResults(null);
    onOpenChange(o);
  };

  const canSend = channel === "whatsapp" && mode === "template" ? !!tpl : text.trim().length > 0 && (channel === "whatsapp" || subject.trim());

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Message {ids.length} {kind === "order" ? "orders" : "carts"}</DialogTitle>
          <DialogDescription>Variables like {"{first_name}"} are filled in for each customer.</DialogDescription>
        </DialogHeader>

        {results ? (
          <div className="max-h-72 space-y-1 overflow-y-auto text-xs">
            {results.map((r) => (
              <div key={r.id} className={cn("flex justify-between rounded px-2 py-1", r.ok ? "bg-emerald-50" : "bg-red-50")}>
                <span>#{r.id}</span>
                <span className={r.ok ? "text-emerald-700" : "text-red-700"}>{r.message}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-1">
              {(["whatsapp", "email"] as const).map((c) => (
                <button key={c} onClick={() => setChannel(c)} className={cn("rounded-md border px-3 py-1 text-xs", channel === c && "border-primary bg-primary/10 text-primary")}>
                  {c === "whatsapp" ? "WhatsApp" : "Email"}
                </button>
              ))}
              {channel === "whatsapp" && meta && (
                <div className="ml-auto flex gap-1">
                  {(["text", "template"] as const).map((m) => (
                    <button key={m} onClick={() => setMode(m)} className={cn("rounded-md border px-3 py-1 text-xs", mode === m && "border-primary bg-primary/10 text-primary")}>
                      {m === "text" ? "Free text" : "Meta template"}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {channel === "whatsapp" && mode === "template" ? (
              <div className="space-y-2">
                <select
                  className="h-9 w-full rounded-md border bg-card px-2 text-sm"
                  value={tpl ? `${tpl.name}|${tpl.language}` : ""}
                  onChange={(e) => {
                    const t = templates.find((x) => `${x.name}|${x.language}` === e.target.value) ?? null;
                    setTpl(t);
                    setParams(Array.from({ length: t?.paramCount ?? 0 }, (_, i) => ["{first_name}", "{product}", "{total}", kind === "order" ? "{tracking_url}" : "{checkout_url}"][i] ?? ""));
                  }}
                >
                  <option value="">Choose an approved template…</option>
                  {templates
                    .filter((t) => t.status === "APPROVED")
                    .map((t) => (
                      <option key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`}>
                        {t.name} ({t.language})
                      </option>
                    ))}
                </select>
                {tpl && <p className="rounded bg-muted p-2 text-xs">{tpl.body}</p>}
                {params.map((p, i) => (
                  <input key={i} value={p} onChange={(e) => setParams(params.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`{{${i + 1}}}`} className="h-8 w-full rounded border px-2 text-sm" />
                ))}
                {tpl?.headerFormat === "IMAGE" && (
                  <label className="flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={includeImage} onChange={(e) => setIncludeImage(e.target.checked)} /> Use product image as header
                  </label>
                )}
              </div>
            ) : (
              <>
                {channel === "email" && <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="h-9 w-full rounded-md border px-2.5 text-sm" />}
                <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder="Message…" className="w-full rounded-md border px-2.5 py-2 text-sm" />
                <div className="flex flex-wrap gap-1">
                  {vars.map((v) => (
                    <button key={v} onClick={() => setText((t) => `${t}{${v}}`)} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] hover:bg-accent">
                      {`{${v}}`}
                    </button>
                  ))}
                </div>
                {channel === "whatsapp" && (
                  <label className="flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={includeImage} onChange={(e) => setIncludeImage(e.target.checked)} /> Attach product image
                  </label>
                )}
                {channel === "whatsapp" && meta && (
                  <p className="text-[11px] text-amber-700">Meta numbers: free text only reaches customers who messaged you in the last 24h. Use a template otherwise.</p>
                )}
              </>
            )}
          </div>
        )}

        <DialogFooter>
          {results ? (
            <Button onClick={() => close(false)}>Done</Button>
          ) : (
            <Button onClick={() => send.mutate()} disabled={!canSend || send.isPending}>
              {send.isPending ? "Sending…" : `Send to ${ids.length}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
