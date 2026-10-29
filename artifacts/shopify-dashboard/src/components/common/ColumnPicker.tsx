import { useState } from "react";
import { Columns3, ChevronUp, ChevronDown, RotateCcw, Lock } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ColumnDef {
  id: string;
  label: string;
  /** shown on first use */
  defaultVisible: boolean;
  /** cannot be hidden or moved */
  locked?: boolean;
}

interface Saved {
  order: string[];
  hidden: string[];
}

function load(key: string, defs: ColumnDef[]): Saved {
  const fallback = { order: defs.map((d) => d.id), hidden: defs.filter((d) => !d.defaultVisible).map((d) => d.id) };
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "null") as Saved | null;
    if (!v || !Array.isArray(v.order)) return fallback;
    // keep columns added after the user saved their layout
    const known = new Set(v.order);
    const added = defs.filter((d) => !known.has(d.id));
    return {
      order: [...v.order.filter((id) => defs.some((d) => d.id === id)), ...added.map((d) => d.id)],
      hidden: [...v.hidden, ...added.filter((d) => !d.defaultVisible).map((d) => d.id)],
    };
  } catch {
    return fallback;
  }
}

/** User-chosen column order + visibility, remembered per browser. */
export function useColumns(key: string, defs: ColumnDef[]) {
  const [saved, setSaved] = useState<Saved>(() => load(key, defs));
  const save = (next: Saved) => {
    setSaved(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };
  const locked = defs.filter((d) => d.locked).map((d) => d.id);
  const visible = [...locked, ...saved.order.filter((id) => !locked.includes(id) && !saved.hidden.includes(id))];
  return {
    visible,
    saved,
    toggle: (id: string) =>
      save({ ...saved, hidden: saved.hidden.includes(id) ? saved.hidden.filter((h) => h !== id) : [...saved.hidden, id] }),
    move: (id: string, dir: -1 | 1) => {
      const order = saved.order.filter((x) => !locked.includes(x));
      const i = order.indexOf(id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= order.length) return;
      [order[i], order[j]] = [order[j], order[i]];
      save({ ...saved, order: [...locked, ...order] });
    },
    reset: () => save({ order: defs.map((d) => d.id), hidden: defs.filter((d) => !d.defaultVisible).map((d) => d.id) }),
  };
}

export function ColumnPicker({ defs, cols }: { defs: ColumnDef[]; cols: ReturnType<typeof useColumns> }) {
  const movable = cols.saved.order.filter((id) => !defs.find((d) => d.id === id)?.locked);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9">
          <Columns3 className="mr-1.5 h-4 w-4" /> Columns
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-2">
        <p className="px-2 pb-2 text-xs font-medium text-muted-foreground">Show, hide and reorder columns</p>
        <ul className="space-y-0.5">
          {defs
            .filter((d) => d.locked)
            .map((d) => (
              <li key={d.id} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-muted-foreground">
                <Lock className="h-3.5 w-3.5" /> {d.label}
              </li>
            ))}
          {movable.map((id, i) => {
            const d = defs.find((x) => x.id === id)!;
            const on = !cols.saved.hidden.includes(id);
            return (
              <li key={id} className={cn("group flex items-center gap-2 rounded px-2 py-1 hover:bg-accent", !on && "opacity-60")}>
                <label className="flex flex-1 cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" checked={on} onChange={() => cols.toggle(id)} />
                  {d.label}
                </label>
                <button disabled={i === 0} onClick={() => cols.move(id, -1)} className="rounded p-0.5 text-muted-foreground hover:bg-background disabled:opacity-20" title="Move left">
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button disabled={i === movable.length - 1} onClick={() => cols.move(id, 1)} className="rounded p-0.5 text-muted-foreground hover:bg-background disabled:opacity-20" title="Move right">
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
        <button onClick={cols.reset} className="mt-2 flex w-full items-center gap-1.5 rounded border-t px-2 pt-2 text-xs text-muted-foreground hover:text-foreground">
          <RotateCcw className="h-3 w-3" /> Reset to default
        </button>
      </PopoverContent>
    </Popover>
  );
}
