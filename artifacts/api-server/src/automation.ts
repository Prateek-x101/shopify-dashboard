/**
 * Automation loop — polls Shiprocket every 3 min, fires WhatsApp rules
 * when an order's delivery status changes.
 */

import { Buttons, MessageMedia } from "whatsapp-web.js";
import { rules, getWaState, getWaClient, formatPhoneForWhatsApp } from "./routes/whatsapp";
import { logger } from "./lib/logger";
import { config } from "./config";

const SHOPIFY_API_VERSION = "2024-01";
const POLL_INTERVAL_MS    = 3 * 60 * 1000; // 3 minutes

// ── Shiprocket raw status → rule trigger_status id ───────────────
const SR_STATUS_MAP: Record<string, string> = {
  "PICKUP PENDING":               "pickup_pending",
  "PICKUP QUEUED":                "pickup_scheduled",
  "PICKUP SCHEDULED":             "pickup_scheduled",
  "PICKUP GENERATED":             "pickup_scheduled",
  "PICKED UP":                    "pickup_scheduled",
  "MANIFESTED":                   "manifested",
  "IN TRANSIT":                   "in_transit",
  "REACHED AT DESTINATION HUB":   "reached_destination",
  "REACHED DESTINATION":          "reached_destination",
  "OUT FOR DELIVERY":             "out_for_delivery",
  "DELIVERED":                    "delivered",
  "FAILED DELIVERY":              "attempted_delivery",
  "UNDELIVERED":                  "undelivered",
  "DELIVERY FAILED":              "delivery_failed",
  "RTO INITIATED":                "rto_initiated",
  "RTO IN TRANSIT":               "rto_initiated",
  "RTO DELIVERED":                "rto_delivered",
  "LOST":                         "lost",
  "CANCELED":                     "order_cancelled",
  "CANCELLED":                    "order_cancelled",
};

// ── Track last known status per order to detect changes ──────────
const lastKnownStatus: Record<string, string> = {};
// Track which (orderId, statusId) combos we already fired so we don't double-send
const firedSet = new Set<string>();

// ── Shiprocket token cache ────────────────────────────────────────
let srToken: string | null = null;
let srTokenExpiry = 0;

let cachedSrEmail: string | null = null;

async function getSrToken(): Promise<string> {
  if (cachedSrEmail !== config.shiprocketEmail) {
    srToken = null;
    srTokenExpiry = 0;
    cachedSrEmail = config.shiprocketEmail;
  }

  if (srToken && Date.now() < srTokenExpiry) return srToken;
  const res = await fetch("https://apiv2.shiprocket.in/v1/external/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: config.shiprocketEmail, password: config.shiprocketPassword }),
  });
  if (!res.ok) throw new Error(`SR auth ${res.status}`);
  const data = (await res.json()) as { token?: string };
  if (!data.token) throw new Error("No SR token");
  srToken = data.token;
  srTokenExpiry = Date.now() + 9 * 24 * 60 * 60 * 1000;
  return srToken;
}

// ── Fetch recent Shopify orders (last 50) ─────────────────────────
interface ShopifyOrderMin {
  id: string;
  name: string;
  customer?: { first_name?: string; last_name?: string; phone?: string } | null;
  line_items?: Array<{ title?: string; variant_title?: string; image?: { src?: string } | null }>;
  total_price?: string;
  currency?: string;
}

async function fetchRecentShopifyOrders(): Promise<ShopifyOrderMin[]> {
  const url = `https://${config.storeUrl}/admin/api/${SHOPIFY_API_VERSION}/orders.json?status=any&limit=50&fields=id,name,customer,line_items,total_price,currency`;
  const res = await fetch(url, { headers: { "X-Shopify-Access-Token": config.shopifyAccessToken } });
  if (!res.ok) throw new Error(`Shopify ${res.status}`);
  const data = (await res.json()) as { orders: ShopifyOrderMin[] };
  return data.orders ?? [];
}

// ── Fetch Shiprocket statuses ─────────────────────────────────────
interface SROrderRaw {
  channel_order_id?: string;
  status?: string;
  shipments?: Array<{ awb?: string; courier?: string }>;
}

async function fetchSrStatuses(): Promise<Record<string, { status: string; awb: string; courier: string }>> {
  const token = await getSrToken();
  const pages = await Promise.all([
    fetch("https://apiv2.shiprocket.in/v1/external/orders?per_page=100&page=1", { headers: { Authorization: `Bearer ${token}` } }),
    fetch("https://apiv2.shiprocket.in/v1/external/orders?per_page=100&page=2", { headers: { Authorization: `Bearer ${token}` } }),
  ]);

  const result: Record<string, { status: string; awb: string; courier: string }> = {};
  for (const res of pages) {
    if (!res.ok) continue;
    const body = (await res.json()) as { data?: SROrderRaw[] };
    for (const o of body?.data ?? []) {
      const id = (o.channel_order_id ?? "").replace(/^#/, "").trim();
      if (id) {
        result[id] = {
          status: o.status ?? "UNKNOWN",
          awb: o.shipments?.[0]?.awb ?? "",
          courier: o.shipments?.[0]?.courier ?? "",
        };
      }
    }
  }
  return result;
}

// ── Replace template variables ────────────────────────────────────
function fillTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

// ── Send WhatsApp via existing client ─────────────────────────────
async function sendWa(
  phone: string,
  message: string,
  opts: { imageUrl?: string; buttons?: Array<{ id?: string; body: string }>; footer?: string } = {},
) {
  const client = getWaClient();
  if (!client || getWaState() !== "connected") {
    logger.warn("[automation] WhatsApp not connected, skipping send");
    return;
  }
  const chatId = formatPhoneForWhatsApp(phone);
  const { imageUrl, buttons, footer } = opts;
  const hasButtons = buttons && buttons.length > 0;

  try {
    if (hasButtons) {
      if (imageUrl) {
        try {
          const imgRes = await fetch(imageUrl);
          if (imgRes.ok) {
            const buf = Buffer.from(await imgRes.arrayBuffer());
            const ct = imgRes.headers.get("content-type") || "image/jpeg";
            const ext = ct.split("/")[1]?.split(";")[0] || "jpg";
            const media = new MessageMedia(ct, buf.toString("base64"), `product.${ext}`);
            const btnMsg = new Buttons(media as any, buttons.slice(0, 3) as { id?: string; body: string }[], message, footer ?? "");
            await client.sendMessage(chatId, btnMsg);
            return;
          }
        } catch { /* fall through */ }
      }
      try {
        const btnMsg = new Buttons(message, buttons.slice(0, 3) as { id?: string; body: string }[], "", footer ?? "");
        await client.sendMessage(chatId, btnMsg);
        return;
      } catch {
        const btnText = buttons.map((b, i) => `${i + 1}. ${b.body}`).join("\n");
        await client.sendMessage(chatId, `${message}\n\n${btnText}`);
        return;
      }
    }
    if (imageUrl) {
      try {
        const imgRes = await fetch(imageUrl);
        if (imgRes.ok) {
          const buf = Buffer.from(await imgRes.arrayBuffer());
          const ct = imgRes.headers.get("content-type") || "image/jpeg";
          const ext = ct.split("/")[1]?.split(";")[0] || "jpg";
          const media = new MessageMedia(ct, buf.toString("base64"), `product.${ext}`);
          await client.sendMessage(chatId, media, { caption: message });
          return;
        }
      } catch { /* fall through */ }
    }
    await client.sendMessage(chatId, message);
  } catch (err) {
    logger.error({ err }, "[automation] sendWa error");
  }
}

// ── Main poll cycle ───────────────────────────────────────────────
async function pollCycle() {
  if (!config.shiprocketEmail || !config.shopifyAccessToken) return;

  const enabledRules = rules.filter((r) => r.enabled && r.trigger_type === "shipping");
  if (enabledRules.length === 0) return;

  let srStatuses: Record<string, { status: string; awb: string; courier: string }>;
  let shopifyOrders: ShopifyOrderMin[];

  try {
    [srStatuses, shopifyOrders] = await Promise.all([fetchSrStatuses(), fetchRecentShopifyOrders()]);
  } catch (err) {
    logger.error({ err }, "[automation] poll fetch failed");
    return;
  }

  // Build order map by order name (without #)
  const orderMap: Record<string, ShopifyOrderMin> = {};
  for (const o of shopifyOrders) {
    const key = (o.name ?? "").replace(/^#/, "").trim();
    if (key) orderMap[key] = o;
  }

  for (const [orderId, sr] of Object.entries(srStatuses)) {
    const rawStatus = (sr.status ?? "").toUpperCase().trim();
    const triggerStatusId = SR_STATUS_MAP[rawStatus];
    if (!triggerStatusId) continue;

    const prev = lastKnownStatus[orderId];
    lastKnownStatus[orderId] = rawStatus;

    // Only fire if status actually changed (skip on first poll — don't spam)
    if (!prev || prev === rawStatus) continue;

    const matchingRule = enabledRules.find((r) => r.trigger_status === triggerStatusId);
    if (!matchingRule) continue;

    // Dedupe: don't fire same (order, status) twice
    const dedupKey = `${orderId}::${triggerStatusId}`;
    if (firedSet.has(dedupKey)) continue;
    firedSet.add(dedupKey);

    const order = orderMap[orderId];
    if (!order) continue;

    const phone =
      order.customer?.phone ??
      (order as unknown as Record<string, unknown>).shipping_address as string ?? null;
    if (!phone || typeof phone !== "string") {
      logger.warn({ orderId }, "[automation] No phone for order, skipping");
      continue;
    }

    // First line item for product name/image
    const firstItem = order.line_items?.[0];
    const productName = [firstItem?.title, firstItem?.variant_title].filter(Boolean).join(" - ") || "";
    const imageUrl = matchingRule.send_image ? (firstItem?.image?.src ?? undefined) : undefined;

    const vars: Record<string, string> = {
      customer_name: [order.customer?.first_name, order.customer?.last_name].filter(Boolean).join(" ") || "Customer",
      order_name: `#${orderId}`,
      total: order.total_price ? `${order.currency ?? "₹"}${order.total_price}` : "",
      tracking_url: sr.awb ? `https://shiprocket.co/tracking/${sr.awb}` : "",
      store_name: config.storeUrl.replace(".myshopify.com", ""),
      product_name: productName,
      courier_name: sr.courier || "",
      tracking_id: sr.awb || "",
    };

    const message = fillTemplate(matchingRule.message_template, vars);

    logger.info({ orderId, triggerStatusId, phone }, "[automation] Firing rule → sending WhatsApp");

    await sendWa(phone, message, {
      imageUrl,
      buttons: matchingRule.buttons?.length ? matchingRule.buttons : undefined,
      footer: matchingRule.footer ?? undefined,
    });
  }
}

// ── Start the loop ────────────────────────────────────────────────
export function startAutomationLoop() {
  logger.info("[automation] Starting polling loop (interval: 3 min)");

  // Initial poll after 30s (give WA client time to connect)
  setTimeout(() => {
    pollCycle().catch((err) => logger.error({ err }, "[automation] initial poll error"));
  }, 30_000);

  setInterval(() => {
    pollCycle().catch((err) => logger.error({ err }, "[automation] poll error"));
  }, POLL_INTERVAL_MS);
}
