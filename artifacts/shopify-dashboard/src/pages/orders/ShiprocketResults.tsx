import { CheckCircle2, XCircle, FileDown } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface SrActionResponse {
  action?: string;
  results: { orderId: number; name: string; ok: boolean; message: string }[];
  files: { label: string; url: string }[];
}

export function ShiprocketResultsDialog({ result, onClose }: { result: SrActionResponse | null; onClose: () => void }) {
  const ok = result?.results.filter((r) => r.ok).length ?? 0;
  const failed = (result?.results.length ?? 0) - ok;
  return (
    <Dialog open={!!result} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Shiprocket: {ok} done{failed > 0 && `, ${failed} failed`}
          </DialogTitle>
        </DialogHeader>
        {result?.files.length ? (
          <div className="flex flex-wrap gap-2">
            {result.files.map((f) => (
              <Button key={f.url} asChild size="sm">
                <a href={f.url} target="_blank" rel="noreferrer">
                  <FileDown className="mr-1.5 h-4 w-4" /> Open {f.label}
                </a>
              </Button>
            ))}
          </div>
        ) : null}
        <div className="max-h-80 space-y-1 overflow-y-auto">
          {result?.results.map((r) => (
            <div key={r.orderId} className="flex items-start gap-2 rounded border px-2.5 py-1.5 text-xs">
              {r.ok ? <CheckCircle2 className="mt-px h-4 w-4 shrink-0 text-emerald-600" /> : <XCircle className="mt-px h-4 w-4 shrink-0 text-destructive" />}
              <span className="w-14 shrink-0 font-semibold">{r.name}</span>
              <span className={r.ok ? "text-muted-foreground" : "text-destructive"}>{r.message}</span>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
