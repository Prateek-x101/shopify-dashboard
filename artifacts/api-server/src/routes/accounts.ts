import crypto from "crypto";
import { Router } from "express";
import {
  db,
  storesTable,
  shiprocketAccountsTable,
  whatsappAccountsTable,
  emailAccountsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { testShopify, registerShopifyWebhooks } from "../integrations/shopify";
import { testShiprocket } from "../integrations/shiprocket";
import { testMeta, listMetaTemplates } from "../integrations/whatsapp-meta";
import { startWebSession, stopWebSession, webSessionInfo } from "../integrations/whatsapp-web";
import { testEmail, EMAIL_PRESETS } from "../integrations/email";
import { syncShopifyAll, syncShiprocketAll } from "../services/scheduler";
import { getSetting } from "../lib/settings";
import { autoLinkAccounts } from "../services/linking";

const router = Router();

/* Secrets never leave the server in full; a masked value on update means "unchanged". */
const MASK = "••••••";
const mask = (v: string | null | undefined) => (v ? `${MASK}${v.slice(-4)}` : null);
const isMasked = (v: unknown) => typeof v === "string" && v.startsWith(MASK);

function pickDefined<T extends Record<string, unknown>>(body: Record<string, unknown>, keys: (keyof T)[], secret: (keyof T)[] = []) {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    const v = body[k as string];
    if (v === undefined) continue;
    if (secret.includes(k) && (isMasked(v) || v === "")) continue;
    out[k as string] = v === "" ? null : v;
  }
  return out as Partial<T>;
}

const idParam = (v: string | string[] | undefined) => Number(Array.isArray(v) ? v[0] : v);

/* ── Stores (Shopify) ─────────────────────────────────────────────── */
router.get("/stores", async (_req, res) => {
  const rows = await db.select().from(storesTable).orderBy(storesTable.id);
  res.json(rows.map((s) => ({ ...s, accessToken: mask(s.accessToken), webhookSecret: mask(s.webhookSecret) })));
});

const storeKeys = ["name", "shopDomain", "publicDomain", "accessToken", "color", "shiprocketAccountId", "whatsappAccountId", "emailAccountId", "webhookSecret", "active", "fulfillInShopify", "notifyOnFulfill"] as const;

router.post("/stores", async (req, res) => {
  const data = pickDefined<typeof storesTable.$inferInsert>(req.body, [...storeKeys], ["accessToken", "webhookSecret"]);
  if (!data.name || !data.shopDomain || !data.accessToken) {
    res.status(400).json({ error: "Name, shop domain and access token are required" });
    return;
  }
  data.shopDomain = String(data.shopDomain).replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const shop = await testShopify({ shopDomain: data.shopDomain, accessToken: data.accessToken });
  const [row] = await db.insert(storesTable).values(data as typeof storesTable.$inferInsert).returning();
  await autoLinkAccounts();
  syncShopifyAll(row.id).catch(() => {});
  res.json({ ...row, accessToken: mask(row.accessToken), shop });
});

router.patch("/stores/:id", async (req, res) => {
  const data = pickDefined<typeof storesTable.$inferInsert>(req.body, [...storeKeys], ["accessToken", "webhookSecret"]);
  if (data.shopDomain) data.shopDomain = String(data.shopDomain).replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const [row] = await db.update(storesTable).set(data).where(eq(storesTable.id, idParam(req.params.id))).returning();
  res.json({ ...row, accessToken: mask(row.accessToken) });
});

router.delete("/stores/:id", async (req, res) => {
  await db.delete(storesTable).where(eq(storesTable.id, idParam(req.params.id)));
  res.json({ ok: true });
});

router.post("/stores/:id/test", async (req, res) => {
  const [s] = await db.select().from(storesTable).where(eq(storesTable.id, idParam(req.params.id)));
  try {
    res.json({ ok: true, shop: await testShopify(s) });
  } catch (err) {
    res.json({ ok: false, error: (err as Error).message });
  }
});

router.post("/stores/:id/sync", async (req, res) => {
  await syncShopifyAll(idParam(req.params.id));
  const [s] = await db.select().from(storesTable).where(eq(storesTable.id, idParam(req.params.id)));
  res.json({ ok: !s.lastError, error: s.lastError });
});

router.post("/stores/:id/register-webhooks", async (req, res) => {
  const publicUrl = await getSetting<string>("publicUrl", "");
  if (!publicUrl) {
    res.status(400).json({ error: "Set the public URL in Settings → System first" });
    return;
  }
  const [s] = await db.select().from(storesTable).where(eq(storesTable.id, idParam(req.params.id)));
  res.json({ ok: true, results: await registerShopifyWebhooks(s, publicUrl) });
});

/* ── Shiprocket ───────────────────────────────────────────────────── */
router.get("/accounts/shiprocket", async (_req, res) => {
  const rows = await db.select().from(shiprocketAccountsTable).orderBy(shiprocketAccountsTable.id);
  res.json(rows.map(({ token: _t, ...a }) => ({ ...a, password: mask(a.password) })));
});

router.post("/accounts/shiprocket", async (req, res) => {
  const data = pickDefined<typeof shiprocketAccountsTable.$inferInsert>(req.body, ["name", "email", "password", "pickupLocation", "packageDefaults", "autoPickup"], ["password"]);
  if (!data.email || !data.password) {
    res.status(400).json({ error: "Shiprocket API user email and password are required" });
    return;
  }
  const [row] = await db.insert(shiprocketAccountsTable).values({ name: data.name || data.email, ...data } as typeof shiprocketAccountsTable.$inferInsert).returning();
  await autoLinkAccounts();
  syncShiprocketAll(row.id).catch(() => {});
  try {
    const t = await testShiprocket(row);
    res.json({ ...row, password: mask(row.password), token: undefined, test: t });
  } catch (err) {
    res.json({ ...row, password: mask(row.password), token: undefined, test: { ok: false, error: (err as Error).message } });
  }
});

router.patch("/accounts/shiprocket/:id", async (req, res) => {
  const data = pickDefined<typeof shiprocketAccountsTable.$inferInsert>(req.body, ["name", "email", "password", "pickupLocation", "packageDefaults", "autoPickup"], ["password"]);
  const [row] = await db
    .update(shiprocketAccountsTable)
    .set({ ...data, ...(data.password || data.email ? { token: null, tokenExpiresAt: null } : {}) })
    .where(eq(shiprocketAccountsTable.id, idParam(req.params.id)))
    .returning();
  res.json({ ...row, password: mask(row.password), token: undefined });
});

router.delete("/accounts/shiprocket/:id", async (req, res) => {
  await db.delete(shiprocketAccountsTable).where(eq(shiprocketAccountsTable.id, idParam(req.params.id)));
  res.json({ ok: true });
});

router.post("/accounts/shiprocket/:id/test", async (req, res) => {
  const [a] = await db.select().from(shiprocketAccountsTable).where(eq(shiprocketAccountsTable.id, idParam(req.params.id)));
  try {
    res.json(await testShiprocket(a));
  } catch (err) {
    res.json({ ok: false, error: (err as Error).message });
  }
});

router.post("/accounts/shiprocket/:id/sync", async (req, res) => {
  await syncShiprocketAll(idParam(req.params.id));
  const [a] = await db.select().from(shiprocketAccountsTable).where(eq(shiprocketAccountsTable.id, idParam(req.params.id)));
  res.json({ ok: !a.lastError, error: a.lastError });
});

/* ── WhatsApp ─────────────────────────────────────────────────────── */
router.get("/accounts/whatsapp", async (_req, res) => {
  const rows = await db.select().from(whatsappAccountsTable).orderBy(whatsappAccountsTable.id);
  res.json(
    rows.map((a) => ({
      ...a,
      metaAccessToken: mask(a.metaAccessToken),
      metaAppSecret: mask(a.metaAppSecret),
      session: a.provider === "web" ? webSessionInfo(a.id) : null,
    })),
  );
});

const waKeys = ["name", "provider", "phoneNumber", "metaPhoneNumberId", "metaWabaId", "metaAccessToken", "metaVerifyToken", "metaAppSecret"] as const;

router.post("/accounts/whatsapp", async (req, res) => {
  const data = pickDefined<typeof whatsappAccountsTable.$inferInsert>(req.body, [...waKeys], ["metaAccessToken", "metaAppSecret"]);
  if (!data.name || !data.provider) {
    res.status(400).json({ error: "Name and type are required" });
    return;
  }
  if (data.provider === "meta") {
    if (!data.metaPhoneNumberId || !data.metaAccessToken) {
      res.status(400).json({ error: "Phone number ID and access token are required for Meta API" });
      return;
    }
    data.metaVerifyToken = data.metaVerifyToken || crypto.randomBytes(12).toString("hex");
  }
  const [row] = await db.insert(whatsappAccountsTable).values(data as typeof whatsappAccountsTable.$inferInsert).returning();
  await autoLinkAccounts();
  if (row.provider === "meta") {
    try {
      const info = await testMeta(row);
      await db.update(whatsappAccountsTable).set({ status: "connected", phoneNumber: info.phone, lastError: null }).where(eq(whatsappAccountsTable.id, row.id));
    } catch (err) {
      await db.update(whatsappAccountsTable).set({ status: "error", lastError: (err as Error).message }).where(eq(whatsappAccountsTable.id, row.id));
    }
  }
  res.json({ id: row.id });
});

router.patch("/accounts/whatsapp/:id", async (req, res) => {
  const data = pickDefined<typeof whatsappAccountsTable.$inferInsert>(req.body, [...waKeys].filter((k) => k !== "provider"), ["metaAccessToken", "metaAppSecret"]);
  await db.update(whatsappAccountsTable).set(data).where(eq(whatsappAccountsTable.id, idParam(req.params.id)));
  res.json({ ok: true });
});

router.delete("/accounts/whatsapp/:id", async (req, res) => {
  const id = idParam(req.params.id);
  await stopWebSession(id, true).catch(() => {});
  await db.delete(whatsappAccountsTable).where(eq(whatsappAccountsTable.id, id));
  res.json({ ok: true });
});

router.post("/accounts/whatsapp/:id/connect", async (req, res) => {
  const id = idParam(req.params.id);
  const [a] = await db.select().from(whatsappAccountsTable).where(eq(whatsappAccountsTable.id, id));
  if (a.provider === "web") {
    res.json(await startWebSession(id));
    return;
  }
  try {
    const info = await testMeta(a);
    await db.update(whatsappAccountsTable).set({ status: "connected", phoneNumber: info.phone, lastError: null }).where(eq(whatsappAccountsTable.id, id));
    res.json({ state: "connected", ...info });
  } catch (err) {
    await db.update(whatsappAccountsTable).set({ status: "error", lastError: (err as Error).message }).where(eq(whatsappAccountsTable.id, id));
    res.json({ state: "error", error: (err as Error).message });
  }
});

router.get("/accounts/whatsapp/:id/session", (req, res) => {
  res.json(webSessionInfo(idParam(req.params.id)));
});

router.post("/accounts/whatsapp/:id/disconnect", async (req, res) => {
  await stopWebSession(idParam(req.params.id), !!req.body?.logout);
  res.json({ ok: true });
});

router.get("/accounts/whatsapp/:id/templates", async (req, res) => {
  const [a] = await db.select().from(whatsappAccountsTable).where(eq(whatsappAccountsTable.id, idParam(req.params.id)));
  if (!a || a.provider !== "meta") {
    res.json([]);
    return;
  }
  res.json(await listMetaTemplates(a));
});

/* ── Email ────────────────────────────────────────────────────────── */
router.get("/accounts/email/presets", (_req, res) => {
  res.json(EMAIL_PRESETS);
});

router.get("/accounts/email", async (_req, res) => {
  const rows = await db.select().from(emailAccountsTable).orderBy(emailAccountsTable.id);
  res.json(rows.map((a) => ({ ...a, password: mask(a.password) })));
});

const emailKeys = ["name", "email", "fromName", "username", "password", "smtpHost", "smtpPort", "smtpSecure", "imapHost", "imapPort"] as const;

router.post("/accounts/email", async (req, res) => {
  const data = pickDefined<typeof emailAccountsTable.$inferInsert>(req.body, [...emailKeys], ["password"]);
  if (!data.email || !data.password || !data.smtpHost) {
    res.status(400).json({ error: "Email, password and SMTP host are required" });
    return;
  }
  const [row] = await db
    .insert(emailAccountsTable)
    .values({ name: data.name || data.email, username: data.username || data.email, ...data } as typeof emailAccountsTable.$inferInsert)
    .returning();
  await autoLinkAccounts();
  try {
    await testEmail(row);
    res.json({ id: row.id, ok: true });
  } catch (err) {
    await db.update(emailAccountsTable).set({ status: "error", lastError: (err as Error).message }).where(eq(emailAccountsTable.id, row.id));
    res.json({ id: row.id, ok: false, error: (err as Error).message });
  }
});

router.patch("/accounts/email/:id", async (req, res) => {
  const data = pickDefined<typeof emailAccountsTable.$inferInsert>(req.body, [...emailKeys], ["password"]);
  await db.update(emailAccountsTable).set(data).where(eq(emailAccountsTable.id, idParam(req.params.id)));
  res.json({ ok: true });
});

router.delete("/accounts/email/:id", async (req, res) => {
  await db.delete(emailAccountsTable).where(eq(emailAccountsTable.id, idParam(req.params.id)));
  res.json({ ok: true });
});

router.post("/accounts/email/:id/test", async (req, res) => {
  const [a] = await db.select().from(emailAccountsTable).where(eq(emailAccountsTable.id, idParam(req.params.id)));
  try {
    res.json({ ok: true, ...(await testEmail(a)) });
  } catch (err) {
    await db.update(emailAccountsTable).set({ status: "error", lastError: (err as Error).message }).where(eq(emailAccountsTable.id, a.id));
    res.json({ ok: false, error: (err as Error).message });
  }
});

export default router;
