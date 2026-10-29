import crypto from "crypto";
import { Router, type Request } from "express";
import { db, storesTable, whatsappAccountsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { upsertShopifyOrder, upsertShopifyCheckout, markRecoveredCheckouts } from "../integrations/shopify";
import { parseMetaWebhook, verifyMetaSignature } from "../integrations/whatsapp-meta";
import { applyTrackingWebhook } from "../integrations/shiprocket";
import { recordInbound, updateStatusByExternalId } from "../services/messaging";
import { ingestFastrrCart } from "../services/fastrr";
import { logger } from "../lib/logger";
import { webhookKey } from "../lib/auth";

/**
 * Public endpoints (no dashboard login). Each one is tied to a store/account id
 * in the URL and verified with that account's secret where the provider signs requests.
 */
const router = Router();
type RawReq = Request & { rawBody?: Buffer };

router.post("/webhooks/shopify/:storeId", async (req: RawReq, res) => {
  const [store] = await db.select().from(storesTable).where(eq(storesTable.id, Number(req.params.storeId)));
  if (!store) {
    res.sendStatus(404);
    return;
  }
  if (store.webhookSecret) {
    const sig = req.get("X-Shopify-Hmac-Sha256") ?? "";
    const expected = crypto.createHmac("sha256", store.webhookSecret).update(req.rawBody ?? Buffer.alloc(0)).digest("base64");
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      res.sendStatus(401);
      return;
    }
  }
  res.sendStatus(200); // ack fast, Shopify retries on slow responses
  const topic = req.get("X-Shopify-Topic") ?? "";
  try {
    if (topic.startsWith("orders/")) {
      const saved = await upsertShopifyOrder(store, req.body);
      await markRecoveredCheckouts(store.id, [saved]);
    } else if (topic.startsWith("checkouts/")) {
      await upsertShopifyCheckout(store, req.body);
    }
  } catch (err) {
    logger.error({ err: (err as Error).message, topic }, "shopify webhook failed");
  }
});

router.post("/webhooks/fastrr/:storeId", async (req, res) => {
  if (req.query.key !== (await webhookKey(`fastrr:${req.params.storeId}`))) {
    res.sendStatus(401);
    return;
  }
  const [store] = await db.select().from(storesTable).where(eq(storesTable.id, Number(req.params.storeId)));
  if (!store) {
    res.sendStatus(404);
    return;
  }
  try {
    const payloads = Array.isArray(req.body) ? req.body : [req.body];
    for (const p of payloads) await ingestFastrrCart(store, p);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err: (err as Error).message }, "fastrr webhook failed");
    res.status(400).json({ error: (err as Error).message });
  }
});

router.get("/webhooks/meta/:accountId", async (req, res) => {
  const [acc] = await db.select().from(whatsappAccountsTable).where(eq(whatsappAccountsTable.id, Number(req.params.accountId)));
  if (acc && req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === acc.metaVerifyToken) {
    res.status(200).send(String(req.query["hub.challenge"] ?? ""));
    return;
  }
  res.sendStatus(403);
});

router.post("/webhooks/meta/:accountId", async (req: RawReq, res) => {
  const [acc] = await db.select().from(whatsappAccountsTable).where(eq(whatsappAccountsTable.id, Number(req.params.accountId)));
  if (!acc || !verifyMetaSignature(acc, req.rawBody, req.get("X-Hub-Signature-256"))) {
    res.sendStatus(401);
    return;
  }
  res.sendStatus(200);
  const { messages, statuses } = parseMetaWebhook(req.body);
  for (const m of messages) {
    await recordInbound({ channel: "whatsapp", accountId: acc.id, contact: m.from, contactName: m.name, body: m.text, externalId: m.id, createdAt: m.timestamp }).catch((err) =>
      logger.error({ err }, "meta inbound failed"),
    );
  }
  for (const s of statuses) await updateStatusByExternalId(s.id, s.status, s.error).catch(() => {});
});

router.post("/webhooks/shiprocket/:accountId", async (req, res) => {
  if (req.query.key !== (await webhookKey(`shiprocket:${req.params.accountId}`))) {
    res.sendStatus(401);
    return;
  }
  try {
    await applyTrackingWebhook(req.body ?? {});
  } catch (err) {
    logger.error({ err: (err as Error).message }, "shiprocket webhook failed");
  }
  res.json({ ok: true });
});

export default router;
