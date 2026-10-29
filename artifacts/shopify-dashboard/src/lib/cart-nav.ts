/** Remembers the abandoned-cart list a cart was opened from (prev / next / back with filters). */
const KEY = "dash.cartNav";

export function saveCartNav(ids: number[], back: string) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ids, back }));
  } catch {
    /* ignore */
  }
}

export function readCartNav(): { ids: number[]; back: string } {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) ?? "null");
    if (v && Array.isArray(v.ids)) return v;
  } catch {
    /* ignore */
  }
  return { ids: [], back: "/abandoned" };
}
