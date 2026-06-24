import { Router } from "express";

const router = Router();

const SHIPROCKET_EMAIL = process.env.SHIPROCKET_EMAIL ?? "";
const SHIPROCKET_PASSWORD = process.env.SHIPROCKET_PASSWORD ?? "";
const BASE = "https://apiv2.shiprocket.in/v1/external";

/* ── Token cache ─────────────────────────────────────────────── */
let cachedToken: string | null = null;
let tokenExpiry = 0;

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  if (!SHIPROCKET_EMAIL || !SHIPROCKET_PASSWORD) {
    throw new Error("SHIPROCKET_EMAIL / SHIPROCKET_PASSWORD not set");
  }

  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: SHIPROCKET_EMAIL, password: SHIPROCKET_PASSWORD }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shiprocket auth failed ${res.status}: ${text}`);
  }

  const data = (await res.json()) as { token?: string };
  if (!data.token) throw new Error("No token in Shiprocket response");

  cachedToken = data.token;
  // Token valid for 10 days; refresh after 9
  tokenExpiry = Date.now() + 9 * 24 * 60 * 60 * 1000;
  return cachedToken;
}

/* ── Order status cache ──────────────────────────────────────── */
interface ShiprocketOrder {
  channel_order_id: string;
  status: string;
  awb?: string | null;
  courier?: string | null;
}

// Actual Shiprocket GET /orders response shape
interface SROrderRaw {
  channel_order_id?: string;
  status?: string;
  shipments?: Array<{ awb?: string; courier?: string }>;
}

let orderCache: Record<string, ShiprocketOrder> = {};
let cacheTs = 0;
const CACHE_TTL = 3 * 60 * 1000; // 3 minutes

async function getOrderCache(): Promise<Record<string, ShiprocketOrder>> {
  if (Date.now() - cacheTs < CACHE_TTL) return orderCache;

  const token = await getToken();

  // Fetch pages 1 and 2 (up to 200 orders) to cover recent history
  const pages = await Promise.all([
    fetch(`${BASE}/orders?per_page=100&page=1`, { headers: { Authorization: `Bearer ${token}` } }),
    fetch(`${BASE}/orders?per_page=100&page=2`, { headers: { Authorization: `Bearer ${token}` } }),
  ]);

  const fresh: Record<string, ShiprocketOrder> = {};

  for (const res of pages) {
    if (!res.ok) continue;
    // Shiprocket returns { data: [...orders] } at the top level
    const body = (await res.json()) as { data?: SROrderRaw[] };
    const items: SROrderRaw[] = body?.data ?? [];
    for (const o of items) {
      const id = (o.channel_order_id ?? "").replace(/^#/, "").trim();
      if (id) {
        const ship = o.shipments?.[0];
        fresh[id] = {
          channel_order_id: id,
          status: o.status ?? "UNKNOWN",
          awb: ship?.awb ?? null,
          courier: ship?.courier ?? null,
        };
      }
    }
  }

  orderCache = fresh;
  cacheTs = Date.now();
  return orderCache;
}

/* ── GET /shiprocket/status ─ connection check ───────────────── */
router.get("/shiprocket/status", async (_req, res) => {
  if (!SHIPROCKET_EMAIL || !SHIPROCKET_PASSWORD) {
    res.json({ configured: false, connected: false });
    return;
  }

  try {
    await getToken();
    res.json({ configured: true, connected: true, email: SHIPROCKET_EMAIL });
  } catch (err) {
    res.json({ configured: true, connected: false, error: (err as Error).message });
  }
});

/* ── GET /shiprocket/delivery-statuses ───────────────────────── */
// Query: ?order_names=1084,1082,1081
router.get("/shiprocket/delivery-statuses", async (req, res) => {
  const raw = (req.query.order_names as string) ?? "";
  const names = raw
    .split(",")
    .map((s) => s.replace(/^#/, "").trim())
    .filter(Boolean);

  if (names.length === 0) {
    res.json({ statuses: {} });
    return;
  }

  try {
    const cache = await getOrderCache();

    const statuses: Record<string, { status: string; awb?: string | null; courier?: string | null }> = {};
    for (const name of names) {
      const found = cache[name];
      if (found) {
        statuses[name] = {
          status: found.status,
          awb: found.awb,
          courier: found.courier,
        };
      } else {
        statuses[name] = { status: "NOT_FOUND" };
      }
    }

    res.json({ statuses });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

/* ── POST /shiprocket/refresh-cache ─ force refresh ─────────── */
router.post("/shiprocket/refresh-cache", async (_req, res) => {
  cacheTs = 0; // invalidate
  try {
    await getOrderCache();
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

/* ── GET /shiprocket/debug ─ raw API sample ─────────────────── */
router.get("/shiprocket/debug", async (_req, res) => {
  try {
    const token = await getToken();
    const r = await fetch(`${BASE}/orders?per_page=5&page=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await r.json();
    res.json({ status: r.status, sample: body });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

export default router;
