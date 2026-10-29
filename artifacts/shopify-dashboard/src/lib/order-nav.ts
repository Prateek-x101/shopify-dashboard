/**
 * Order pages are addressed by the Shopify order number: /orders/1040.
 * With several stores connected, ?store=<id> keeps equal numbers apart.
 *
 * We also remember which list the user opened an order from, so the order
 * page can offer previous / next and a "back to list" that keeps the filters.
 */
const KEY = "dash.orderNav";

export function orderPath(name: string, storeId: number, multiStore: boolean) {
  const num = encodeURIComponent(name.replace(/^#/, ""));
  return `/orders/${num}${multiStore ? `?store=${storeId}` : ""}`;
}

interface OrderNav {
  paths: string[];
  back: string; // path + query of the list
}

export function saveOrderNav(paths: string[], back: string) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ paths, back }));
  } catch {
    /* ignore */
  }
}

export function readOrderNav(): OrderNav {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) ?? "null");
    if (v && Array.isArray(v.paths)) return v;
  } catch {
    /* ignore */
  }
  return { paths: [], back: "/" };
}
