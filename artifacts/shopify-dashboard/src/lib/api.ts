const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const authEvents = new EventTarget();

export async function api<T = any>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const res = await fetch(`${BASE}/api${path}`, {
    credentials: "include",
    ...rest,
    headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...(rest.headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (res.status === 401 && !path.startsWith("/auth/")) {
    authEvents.dispatchEvent(new Event("unauthorized"));
  }
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) throw new ApiError(res.status, body?.error ?? `Request failed (${res.status})`);
  return body as T;
}

export const post = <T = any>(path: string, json?: unknown) => api<T>(path, { method: "POST", json: json ?? {} });
export const patch = <T = any>(path: string, json: unknown) => api<T>(path, { method: "PATCH", json });
export const put = <T = any>(path: string, json: unknown) => api<T>(path, { method: "PUT", json });
export const del = <T = any>(path: string) => api<T>(path, { method: "DELETE" });

export function qs(params: Record<string, string | number | undefined | null | boolean>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "" && v !== false) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

export const apiUrl = (path: string) => `${BASE}/api${path}`;
