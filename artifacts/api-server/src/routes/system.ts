import { Router } from "express";
import { db, dbKind, storesTable, whatsappAccountsTable, shiprocketAccountsTable } from "@workspace/db";
import { getSetting, setSetting } from "../lib/settings";
import { webhookKey } from "../lib/auth";
import { syncShopifyAll, syncShiprocketAll, pollEmailAll } from "../services/scheduler";
import { runAutomations } from "../services/automation";
import { getSheetConfig, saveSheetConfig, syncSheets } from "../services/sheets";

const router = Router();

router.get("/system", async (_req, res) => {
  const publicUrl = await getSetting<string>("publicUrl", "");
  const base = publicUrl.replace(/\/$/, "");
  const stores = await db.select({ id: storesTable.id, name: storesTable.name }).from(storesTable);
  const wa = await db.select({ id: whatsappAccountsTable.id, name: whatsappAccountsTable.name, provider: whatsappAccountsTable.provider, verify: whatsappAccountsTable.metaVerifyToken }).from(whatsappAccountsTable);
  const sr = await db.select({ id: shiprocketAccountsTable.id, name: shiprocketAccountsTable.name }).from(shiprocketAccountsTable);
  res.json({
    database: dbKind(),
    publicUrl,
    webhooks: base
      ? {
          shopify: stores.map((s) => ({ name: s.name, url: `${base}/api/webhooks/shopify/${s.id}` })),
          fastrr: await Promise.all(stores.map(async (s) => ({ name: s.name, url: `${base}/api/webhooks/fastrr/${s.id}?key=${await webhookKey(`fastrr:${s.id}`)}` }))),
          meta: wa.filter((w) => w.provider === "meta").map((w) => ({ name: w.name, url: `${base}/api/webhooks/meta/${w.id}`, verifyToken: w.verify })),
          shiprocket: await Promise.all(sr.map(async (s) => ({ name: s.name, url: `${base}/api/webhooks/shiprocket/${s.id}?key=${await webhookKey(`shiprocket:${s.id}`)}` }))),
        }
      : null,
  });
});

router.put("/system", async (req, res) => {
  if (typeof req.body?.publicUrl === "string") await setSetting("publicUrl", req.body.publicUrl.trim().replace(/\/$/, ""));
  res.json({ ok: true });
});

router.get("/system/sheets", async (_req, res) => {
  const cfg = await getSheetConfig();
  let clientEmail: string | null = null;
  try {
    clientEmail = cfg.serviceAccountJson ? JSON.parse(cfg.serviceAccountJson).client_email : null;
  } catch {
    clientEmail = null;
  }
  res.json({ ...cfg, serviceAccountJson: cfg.serviceAccountJson ? "(saved)" : "", clientEmail });
});

router.put("/system/sheets", async (req, res) => {
  const b = req.body ?? {};
  const patch: Record<string, unknown> = {};
  for (const k of ["enabled", "spreadsheetId", "ordersTab", "checkoutsTab", "days"]) if (b[k] !== undefined) patch[k] = b[k];
  if (typeof b.spreadsheetId === "string") patch.spreadsheetId = b.spreadsheetId.match(/\/d\/([\w-]+)/)?.[1] ?? b.spreadsheetId.trim();
  if (typeof b.serviceAccountJson === "string" && b.serviceAccountJson.trim().startsWith("{")) {
    try {
      JSON.parse(b.serviceAccountJson);
    } catch {
      res.status(400).json({ error: "Service account JSON is not valid JSON" });
      return;
    }
    patch.serviceAccountJson = b.serviceAccountJson.trim();
  }
  await saveSheetConfig(patch);
  res.json({ ok: true });
});

router.post("/system/sheets/sync", async (_req, res) => {
  try {
    res.json({ ok: true, ...(await syncSheets(true)) });
  } catch (err) {
    res.json({ ok: false, error: (err as Error).message });
  }
});

router.post("/system/sync", async (_req, res) => {
  await Promise.allSettled([syncShopifyAll(), syncShiprocketAll(), pollEmailAll()]);
  await runAutomations().catch(() => {});
  res.json({ ok: true });
});

export default router;
