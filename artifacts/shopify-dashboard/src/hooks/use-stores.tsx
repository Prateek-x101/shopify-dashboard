import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Store } from "@/lib/types";

interface StoreCtx {
  stores: Store[];
  storeId: number | null; // null = all stores
  setStoreId: (id: number | null) => void;
  storeById: (id: number | null | undefined) => Store | undefined;
}

const Ctx = createContext<StoreCtx | null>(null);
const KEY = "dash.storeId";

export function StoreProvider({ children }: { children: ReactNode }) {
  const { data: stores = [] } = useQuery({ queryKey: ["stores"], queryFn: () => api<Store[]>("/stores") });
  const [storeId, setStoreIdState] = useState<number | null>(() => {
    try {
      const v = localStorage.getItem(KEY);
      return v ? Number(v) : null;
    } catch {
      return null;
    }
  });
  useEffect(() => {
    if (storeId && stores.length && !stores.some((s) => s.id === storeId)) setStoreIdState(null);
  }, [stores, storeId]);
  const setStoreId = (id: number | null) => {
    setStoreIdState(id);
    try {
      if (id) localStorage.setItem(KEY, String(id));
      else localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  };
  return (
    <Ctx.Provider value={{ stores, storeId, setStoreId, storeById: (id) => stores.find((s) => s.id === id) }}>
      {children}
    </Ctx.Provider>
  );
}

export function useStores() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useStores outside StoreProvider");
  return c;
}
