import { Router } from "express";
import { Client, LocalAuth, MessageMedia, Buttons } from "whatsapp-web.js";
import QRCode from "qrcode";
import { CreateWhatsappRuleBody, ToggleWhatsappRuleBody } from "@workspace/api-zod";
import fs from "fs";
import path from "path";
import { WORKSPACE_ROOT } from "../config";

const router = Router();

// ── Chromium path (Nix-installed) ──────────────────────────────
const CHROMIUM_PATH = "/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium";

// ── Prevent unhandled puppeteer errors from killing the process ──
process.on("uncaughtException", (err) => {
  console.error("[whatsapp] uncaughtException:", err.message);
  if (waClient) { waState = "disconnected"; waClient = null; waQrDataUrl = null; }
});
process.on("unhandledRejection", (reason) => {
  console.error("[whatsapp] unhandledRejection:", reason);
});

// ── In-memory state ──────────────────────────────────────────────
interface WaButton { id?: string; body: string; }

interface ChatMessage {
  id: string;
  order_id: string;
  to_phone: string;
  message: string;
  from: "store" | "customer";
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
}

const messagesByOrder: Record<string, ChatMessage[]> = {};
let msgCounter = 1;

// ── Phone number formatter for WhatsApp ──────────────────────────
function formatPhoneForWhatsApp(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("0") && digits.length === 11) return `91${digits.slice(1)}@c.us`;
  return `${digits}@c.us`;
}

// ── Rules ────────────────────────────────────────────────────────
interface Rule {
  id: string;
  trigger_type: string;
  trigger_status: string;
  trigger_label: string;
  message_template: string;
  enabled: boolean;
  send_image: boolean;
  buttons: WaButton[];
  footer?: string | null;
  created_at: string;
}

type WaState = "disconnected" | "qr_ready" | "connected" | "initializing";

let waState: WaState = "disconnected";
let waPhoneNumber: string | null = null;
let waQrDataUrl: string | null = null;
let waClient: Client | null = null;
let waInitLock = false;

const RULES_FILE = path.join(WORKSPACE_ROOT, "whatsapp_rules.json");
export const rules: Rule[] = [];
let ruleCounter = 1;

function loadRules() {
  try {
    if (fs.existsSync(RULES_FILE)) {
      const raw = fs.readFileSync(RULES_FILE, "utf8");
      const parsed = JSON.parse(raw) as Rule[];
      rules.length = 0;
      rules.push(...parsed);
      if (rules.length > 0) {
        ruleCounter = Math.max(...rules.map((r) => parseInt(r.id) || 0)) + 1;
      }
    }
  } catch (err) {
    console.error("Failed to load whatsapp_rules.json:", err);
  }
}

function saveRules() {
  try {
    fs.writeFileSync(RULES_FILE, JSON.stringify(rules, null, 2), "utf8");
  } catch (err) {
    console.error("Failed to save whatsapp_rules.json:", err);
  }
}

loadRules();

// ── Exported helpers for automation loop ─────────────────────────
export function getWaState() { return waState; }
export function getWaClient() { return waClient; }
export { formatPhoneForWhatsApp };

// ── WhatsApp Client factory ───────────────────────────────────────
async function startWhatsAppClient(): Promise<void> {
  if (waInitLock || waState === "initializing") return;
  waInitLock = true;

  if (waClient) {
    try { await waClient.destroy(); } catch {}
    waClient = null;
    await new Promise((r) => setTimeout(r, 1500));
  }

  waState = "initializing";
  waQrDataUrl = null;
  waPhoneNumber = null;

  const client = new Client({
    authStrategy: new LocalAuth({
      dataPath: path.join(WORKSPACE_ROOT, ".wwebjs_auth")
    }),
    puppeteer: {
      ...(process.platform !== "win32" && { executablePath: CHROMIUM_PATH }),
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-first-run",
        "--no-zygote",
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-default-apps",
        "--mute-audio",
        "--no-default-browser-check",
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
      ],
    },
  });

  client.on("qr", async (qr: string) => {
    try {
      waQrDataUrl = await QRCode.toDataURL(qr, { width: 300, margin: 2 });
      waState = "qr_ready";
    } catch {}
  });

  client.on("authenticated", () => {
    waState = "initializing";
    waQrDataUrl = null;
  });

  client.on("ready", () => {
    waState = "connected";
    try {
      const info = (client as any).info;
      waPhoneNumber = info?.wid?.user ? `+${info.wid.user}` : "Connected";
    } catch { waPhoneNumber = "Connected"; }
    waQrDataUrl = null;
    waInitLock = false;
  });

  client.on("auth_failure", () => {
    waState = "disconnected";
    waQrDataUrl = null;
    waPhoneNumber = null;
    waClient = null;
    waInitLock = false;
  });

  client.on("disconnected", () => {
    waState = "disconnected";
    waQrDataUrl = null;
    waPhoneNumber = null;
    waClient = null;
    waInitLock = false;
  });

  waClient = client;

  client.initialize().catch((err: Error) => {
    console.error("[whatsapp] initialize error:", err.message);
    waState = "disconnected";
    waQrDataUrl = null;
    waClient = null;
    waInitLock = false;
  });
}

// ── All statuses (Shopify + Shiprocket-aligned) ───────────────────
const SHOPIFY_STATUSES = [
  // ── Order statuses ──────────────────────────────────────────────
  { id: "order_placed",          label: "Order Placed",             type: "order",       emoji: "🛒", description: "New order is placed by customer" },
  { id: "payment_pending",       label: "Payment Pending",          type: "order",       emoji: "⏳", description: "Payment not yet received" },
  { id: "payment_authorized",    label: "Payment Authorized",       type: "order",       emoji: "✅", description: "Payment authorized, not captured" },
  { id: "payment_confirmed",     label: "Payment Confirmed",        type: "order",       emoji: "💰", description: "Payment successfully captured/paid" },
  { id: "partially_paid",        label: "Partially Paid",           type: "order",       emoji: "💸", description: "Order partially paid" },
  { id: "payment_refunded",      label: "Refund Issued",            type: "order",       emoji: "↩️",  description: "Full refund given to customer" },
  { id: "partially_refunded",    label: "Partially Refunded",       type: "order",       emoji: "🔄", description: "Partial refund given" },
  { id: "order_cancelled",       label: "Order Cancelled",          type: "order",       emoji: "❌", description: "Order was cancelled" },

  // ── Fulfillment statuses ────────────────────────────────────────
  { id: "order_confirmed",       label: "Order Confirmed",          type: "fulfillment", emoji: "📦", description: "Order confirmed and being processed" },
  { id: "label_printed",         label: "Label Printed",            type: "fulfillment", emoji: "🖨️",  description: "Shipping label created" },
  { id: "order_shipped",         label: "Order Shipped",            type: "fulfillment", emoji: "🚚", description: "Order has been shipped" },
  { id: "partially_fulfilled",   label: "Partially Fulfilled",      type: "fulfillment", emoji: "📫", description: "Some items fulfilled" },
  { id: "fully_fulfilled",       label: "Fully Fulfilled",          type: "fulfillment", emoji: "✔️",  description: "All items fulfilled" },

  // ── Shiprocket / Shipping statuses ──────────────────────────────
  { id: "pickup_pending",        label: "Pickup Pending",           type: "shipping",    emoji: "🕐", description: "Awaiting pickup by courier" },
  { id: "pickup_scheduled",      label: "Pickup Scheduled",         type: "shipping",    emoji: "📅", description: "Pickup scheduled with courier" },
  { id: "pickup_generated",      label: "Pickup Generated",         type: "shipping",    emoji: "🏷️",  description: "Pickup request generated" },
  { id: "manifested",            label: "Manifested",               type: "shipping",    emoji: "📋", description: "Package manifested / label printed" },
  { id: "in_transit",            label: "In Transit",               type: "shipping",    emoji: "🛣️",  description: "Package on the way to destination" },
  { id: "reached_destination",   label: "Reached Destination Hub",  type: "shipping",    emoji: "🏢", description: "Package reached destination hub" },
  { id: "out_for_delivery",      label: "Out for Delivery",         type: "shipping",    emoji: "🏍️",  description: "Package out with delivery agent" },
  { id: "delivered",             label: "Delivered",                type: "shipping",    emoji: "🎉", description: "Successfully delivered to customer" },
  { id: "attempted_delivery",    label: "Delivery Attempted",       type: "shipping",    emoji: "🔔", description: "Delivery was attempted but failed" },
  { id: "undelivered",           label: "Undelivered",              type: "shipping",    emoji: "⚠️",  description: "Could not be delivered" },
  { id: "delivery_failed",       label: "Delivery Failed",          type: "shipping",    emoji: "❗", description: "Delivery failed / returned to origin" },
  { id: "rto_initiated",         label: "RTO Initiated",            type: "shipping",    emoji: "↩️",  description: "Return to origin started" },
  { id: "rto_delivered",         label: "RTO Delivered",            type: "shipping",    emoji: "🏭", description: "Package returned to your warehouse" },
  { id: "lost",                  label: "Lost in Transit",          type: "shipping",    emoji: "❓", description: "Package lost in transit" },
];

// ── Routes ────────────────────────────────────────────────────────

router.get("/whatsapp/shopify-statuses", (_req, res) => {
  res.json({ statuses: SHOPIFY_STATUSES });
});

router.get("/whatsapp/status", (_req, res) => {
  res.json({
    connected: waState === "connected",
    phone_number: waPhoneNumber,
    qr_data_url: waQrDataUrl,
    state: waState,
  });
});

router.post("/whatsapp/connect", async (_req, res) => {
  if (waState === "connected") {
    res.json({ connected: true, phone_number: waPhoneNumber, qr_data_url: null, state: "connected" });
    return;
  }
  if (waState === "initializing") {
    res.json({ connected: false, phone_number: null, qr_data_url: waQrDataUrl, state: "initializing" });
    return;
  }
  if (waState === "qr_ready" && waQrDataUrl) {
    res.json({ connected: false, phone_number: null, qr_data_url: waQrDataUrl, state: "qr_ready" });
    return;
  }

  startWhatsAppClient().catch(() => {});
  res.json({ connected: false, phone_number: null, qr_data_url: null, state: "initializing" });
});

router.post("/whatsapp/disconnect", async (_req, res) => {
  waInitLock = false;
  if (waClient) {
    try { await waClient.destroy(); } catch {}
    waClient = null;
  }
  waState = "disconnected";
  waPhoneNumber = null;
  waQrDataUrl = null;
  res.json({ connected: false, phone_number: null, qr_data_url: null, state: "disconnected" });
});

// ── Send WhatsApp message (with optional image + buttons) ─────────
router.post("/whatsapp/send-message", async (req, res) => {
  const { to_phone, message, order_id, order_name, customer_name, image_url, buttons, footer } = req.body as {
    to_phone: string; message: string; order_id: string;
    order_name?: string; customer_name?: string; image_url?: string;
    buttons?: WaButton[]; footer?: string;
  };

  if (!to_phone || !message || !order_id) {
    res.status(400).json({ error: "to_phone, message, order_id are required" });
    return;
  }
  if (!waClient || waState !== "connected") {
    res.status(503).json({ error: "WhatsApp not connected. Go to Settings → WhatsApp to connect." });
    return;
  }

  const chatId = formatPhoneForWhatsApp(to_phone);
  const msgId = String(msgCounter++);
  const hasButtons = buttons && buttons.length > 0;

  try {
    if (hasButtons) {
      // Send as interactive Buttons message (max 3 buttons)
      // Note: image + buttons can be combined using MessageMedia as body
      if (image_url) {
        try {
          const imgRes = await fetch(image_url);
          if (imgRes.ok) {
            const buffer = Buffer.from(await imgRes.arrayBuffer());
            const contentType = imgRes.headers.get("content-type") || "image/jpeg";
            const ext = contentType.split("/")[1]?.split(";")[0] || "jpg";
            const media = new MessageMedia(contentType, buffer.toString("base64"), `product.${ext}`);
            const btnMsg = new Buttons(media as any, buttons.slice(0, 3).map((b) => ({ id: b.id, body: b.body })), message, footer ?? "");
            await waClient.sendMessage(chatId, btnMsg);
          } else {
            const btnMsg = new Buttons(message, buttons.slice(0, 3).map((b) => ({ id: b.id, body: b.body })), "", footer ?? "");
            await waClient.sendMessage(chatId, btnMsg);
          }
        } catch {
          // Fallback: plain text with buttons as numbered list
          const btnText = buttons.map((b, i) => `${i + 1}. ${b.body}`).join("\n");
          await waClient.sendMessage(chatId, `${message}\n\n${btnText}`);
        }
      } else {
        try {
          const btnMsg = new Buttons(message, buttons.slice(0, 3).map((b) => ({ id: b.id, body: b.body })), "", footer ?? "");
          await waClient.sendMessage(chatId, btnMsg);
        } catch {
          // Fallback: plain text with buttons listed
          const btnText = buttons.map((b, i) => `${i + 1}. ${b.body}`).join("\n");
          await waClient.sendMessage(chatId, `${message}\n\n${btnText}`);
        }
      }
    } else if (image_url) {
      // Image only (no buttons)
      try {
        const imgRes = await fetch(image_url);
        if (imgRes.ok) {
          const buffer = Buffer.from(await imgRes.arrayBuffer());
          const contentType = imgRes.headers.get("content-type") || "image/jpeg";
          const ext = contentType.split("/")[1]?.split(";")[0] || "jpg";
          const media = new MessageMedia(contentType, buffer.toString("base64"), `product.${ext}`);
          await waClient.sendMessage(chatId, media, { caption: message });
        } else {
          await waClient.sendMessage(chatId, message);
        }
      } catch {
        await waClient.sendMessage(chatId, message);
      }
    } else {
      await waClient.sendMessage(chatId, message);
    }

    const chatMsg: ChatMessage = { id: msgId, order_id, to_phone, message, from: "store", status: "sent", timestamp: new Date().toISOString() };
    if (!messagesByOrder[order_id]) messagesByOrder[order_id] = [];
    messagesByOrder[order_id].push(chatMsg);
    res.json(chatMsg);
  } catch (err) {
    const failedMsg: ChatMessage = { id: msgId, order_id, to_phone, message, from: "store", status: "failed", timestamp: new Date().toISOString() };
    if (!messagesByOrder[order_id]) messagesByOrder[order_id] = [];
    messagesByOrder[order_id].push(failedMsg);
    res.status(500).json({ error: "Failed to send message", detail: String(err) });
  }
});

// ── Get messages for an order ──────────────────────────────────────
router.get("/whatsapp/messages/:order_id", (req, res) => {
  const msgs = messagesByOrder[req.params.order_id] ?? [];
  res.json({ messages: msgs, connected: waState === "connected", phone_number: waPhoneNumber });
});

// ── Rules CRUD ────────────────────────────────────────────────────

router.get("/whatsapp/rules", (_req, res) => {
  res.json({ rules });
});

router.post("/whatsapp/rules", (req, res) => {
  const parsed = CreateWhatsappRuleBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }

  const { trigger_type, trigger_status, message_template, send_image, buttons, footer } = parsed.data;
  const status = SHOPIFY_STATUSES.find((s) => s.id === trigger_status);
  const rule: Rule = {
    id: String(ruleCounter++), trigger_type, trigger_status,
    trigger_label: status?.label ?? trigger_status,
    message_template, enabled: true, send_image: send_image ?? false,
    buttons: (buttons ?? []) as WaButton[],
    footer: footer ?? null,
    created_at: new Date().toISOString(),
  };
  rules.push(rule);
  saveRules();
  res.status(201).json(rule);
});

router.delete("/whatsapp/rules/:id", (req, res) => {
  const idx = rules.findIndex((r) => r.id === req.params.id);
  if (idx === -1) { res.status(404).json({ error: "Rule not found" }); return; }
  rules.splice(idx, 1);
  saveRules();
  res.status(204).send();
});

router.patch("/whatsapp/rules/:id", (req, res) => {
  const parsed = ToggleWhatsappRuleBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const rule = rules.find((r) => r.id === req.params.id);
  if (!rule) { res.status(404).json({ error: "Rule not found" }); return; }
  rule.enabled = parsed.data.enabled;
  saveRules();
  res.json(rule);
});

export default router;
