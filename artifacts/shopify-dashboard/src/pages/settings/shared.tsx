import { useState, type ReactNode } from "react";
import { Copy, Check, CircleAlert, CircleCheck, CircleDashed } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function SectionHeader({ title, hint, action }: { title: string; hint?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <div className="flex-1">
        <h2 className="text-base font-semibold">{title}</h2>
        {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
      </div>
      {action}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn("h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/30", props.className)} />;
}

export function StatusDot({ status, error }: { status: "ok" | "error" | "pending"; error?: string | null }) {
  if (status === "ok") return <CircleCheck className="h-4 w-4 text-emerald-600" />;
  if (status === "error")
    return (
      <span title={error ?? ""}>
        <CircleAlert className="h-4 w-4 text-destructive" />
      </span>
    );
  return <CircleDashed className="h-4 w-4 text-muted-foreground" />;
}

export function CopyField({ value, label }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="space-y-1">
      {label && <p className="text-[11px] font-medium text-muted-foreground">{label}</p>}
      <div className="flex items-center gap-1 rounded-md border bg-muted/50 py-1 pl-2.5 pr-1">
        <span className="min-w-0 flex-1 truncate font-mono text-xs">{value}</span>
        <button
          onClick={() => {
            navigator.clipboard.writeText(value);
            setDone(true);
            toast.success("Copied");
            setTimeout(() => setDone(false), 1500);
          }}
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          {done ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-lg border bg-card p-4", className)}>{children}</div>;
}

export function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ol>
  );
}
