import { useEffect, useState } from "react";
import { useSearch } from "wouter";
import { Search, X, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function TabsBar({
  tabs,
  value,
  onChange,
  counts,
}: {
  tabs: { key: string; label: string }[];
  value: string;
  onChange: (k: string) => void;
  counts?: Record<string, number>;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b px-4 [scrollbar-width:thin]">
      {tabs.map((t) => {
        const active = t.key === value;
        const n = counts?.[t.key];
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={cn(
              "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 py-2.5 text-[13px] transition-colors",
              active ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {n !== undefined && (
              <span className={cn("rounded-full px-1.5 text-[11px] tabular-nums", active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                {n}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  useEffect(() => {
    const t = setTimeout(() => local !== value && onChange(local), 300);
    return () => clearTimeout(t);
  }, [local]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="relative min-w-[240px] flex-[1_1_320px]">
      <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded-md border bg-card pl-8 pr-8 text-sm outline-none focus:ring-2 focus:ring-ring/30"
      />
      {local && (
        <button onClick={() => setLocal("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export function FilterSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 rounded-md border bg-card px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/30"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between border-t bg-card px-4 py-2 text-xs text-muted-foreground">
      <span>
        {from}–{to} of {total}
      </span>
      <div className="flex gap-1">
        <Button variant="outline" size="icon" className="h-7 w-7" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" className="h-7 w-7" disabled={to >= total} onClick={() => onPage(page + 1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
      <p className="font-medium">{title}</p>
      {hint && <p className="max-w-sm text-sm text-muted-foreground">{hint}</p>}
      {action}
    </div>
  );
}

/** URL-backed list state so filters survive reloads and can be shared. */
export function useUrlState<T extends Record<string, string>>(defaults: T): [T, (patch: Partial<T>) => void] {
  const read = () => {
    const p = new URLSearchParams(window.location.search);
    const out = { ...defaults };
    for (const k of Object.keys(defaults)) {
      const v = p.get(k);
      if (v !== null) (out as Record<string, string>)[k] = v;
    }
    return out;
  };
  const [state, setState] = useState<T>(read);
  // wouter reports every URL change (links, navigate(), back/forward), so in-app links like /?open=12 work too
  const search = useSearch();
  useEffect(() => {
    const next = read();
    setState((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps
  const update = (patch: Partial<T>) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      const p = new URLSearchParams(window.location.search);
      for (const [k, v] of Object.entries(next)) {
        if (v === defaults[k] || v === "") p.delete(k);
        else p.set(k, v as string);
      }
      const s = p.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${s ? `?${s}` : ""}`);
      return next;
    });
  };
  return [state, update];
}
