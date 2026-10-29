import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RotateCcw, Repeat, MessageCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { post } from "@/lib/api";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Undelivered shipment: re-attempt (optionally after talking to the customer) or send it back. */
export function NdrDialog({
  order,
  onClose,
  onMessage,
}: {
  order: { id: number; name: string; srStatus: string | null; courier: string | null } | null;
  onClose: () => void;
  onMessage?: () => void;
}) {
  const qc = useQueryClient();
  const [action, setAction] = useState<"re-attempt" | "return">("re-attempt");
  const [comment, setComment] = useState("");
  const run = useMutation({
    mutationFn: () => post(`/orders/${order!.id}/ndr`, { action, comment }),
    onSuccess: () => {
      toast.success(action === "re-attempt" ? "Re-attempt requested" : "Marked for return");
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["timeline"] });
      onClose();
    },
    onError: (e: Error) => toast.error(`${e.message}. You can also act from the NDR page in Shiprocket.`),
  });
  return (
    <Dialog open={!!order} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delivery failed: {order?.name}</DialogTitle>
          <DialogDescription>
            {order?.courier} reported “{order?.srStatus?.toLowerCase()}”. Talk to the customer first, then choose what the courier should do.
          </DialogDescription>
        </DialogHeader>
        {onMessage && (
          <Button variant="outline" className="justify-start" onClick={onMessage}>
            <MessageCircle className="mr-2 h-4 w-4 text-emerald-600" /> Message the customer on WhatsApp
          </Button>
        )}
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["re-attempt", Repeat, "Re-attempt delivery", "Courier tries again"],
              ["return", RotateCcw, "Return to me (RTO)", "Stop and send back"],
            ] as const
          ).map(([key, Icon, title, sub]) => (
            <button
              key={key}
              onClick={() => setAction(key)}
              className={cn("rounded-lg border p-3 text-left", action === key ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-accent/60")}
            >
              <Icon className={cn("mb-1 h-4 w-4", key === "return" ? "text-rose-600" : "text-sky-600")} />
              <p className="text-sm font-medium">{title}</p>
              <p className="text-xs text-muted-foreground">{sub}</p>
            </button>
          ))}
        </div>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={2}
          placeholder={action === "re-attempt" ? "e.g. Customer available after 6 pm, call before delivery" : "Reason (optional)"}
          className="w-full rounded-md border px-2.5 py-2 text-sm"
        />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => run.mutate()} disabled={run.isPending} variant={action === "return" ? "destructive" : "default"}>
            {run.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {action === "re-attempt" ? "Request re-attempt" : "Return to origin"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
