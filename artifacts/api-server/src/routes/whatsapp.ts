import { Router } from "express";
import { Client, LocalAuth } from "whatsapp-web.js";
import QRCode from "qrcode";
import { CreateWhatsappRuleBody, ToggleWhatsappRuleBody } from "@workspace/api-zod";

const router = Router();

// ── Chromium path (Nix-installed) ──────────────────────────────
const CHROMIUM_PATH = "/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium";

// ── In-memory state ──────────────────────────────────────────────
interface ChatMessage {
  id: string;
  order_id: string;
  to_phone: string;
  message: string;
  from: "store" | "customer";
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
}

// messages keyed by order_id
const messagesByOrder: Record<string, ChatMessage[]> = {};
let msgCounter = 1;

// ── Phone number formatter for WhatsApp ──────────────────────────
function formatPhoneForWhatsApp(raw: string): string {
  // Strip everything except digits
  const digits = raw.replace(/\D/g, "");
  // If starts with 0 (local Indian), replace with 91
  if (digits.startsWith("0") && digits.length === 11) return `91${digits.slice(1)}@c.us`;
  // Already has country code (10+ digits)
  return `${digits}@c.us`;
}

interface Rule {
  id: string;
  trigger_type: string;
  trigger_status: string;
  trigger_label: string;
  message_template: string;
  enabled: boolean;
  created_at: string;
}

type WaState = "disconnected" | "qr_ready" | "connected" | "initializing";

let waState: WaState = "disconnected";
let waPhoneNumber: string | null = null;
let waQrDataUrl: string | null = null;
let waClient: Client | null = null;
const rules: Rule[] = [];
let ruleCounter = 1;

// ── WhatsApp Client factory ───────────────────────────────────────
async function startWhatsAppClient() {
  if (waClient) {
    try { await waClient.destroy(); } catch {}
    waClient = null;
  }

  waState = "initializing";
  waQrDataUrl = null;
  waPhoneNumber = null;

  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: "/tmp/.wwebjs_auth" }),
    puppeteer: {
      executablePath: CHROMIUM_PATH,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-first-run",
        "--no-zygote",
        "--single-process",
        "--disable-extensions",
      ],
    },
  });

  client.on("qr", async (qr: string) => {
    waQrDataUrl = await QRCode.toDataURL(qr, { width: 256, margin: 1 });
    waState = "qr_ready";
  });

  client.on("authenticated", () => {
    waState = "initializing";
  });

  client.on("ready", () => {
    waState = "connected";
    const info = client.info;
    waPhoneNumber = info?.wid?.user ? `+${info.wid.user}` : "Connected";
    waQrDataUrl = null;
  });

  client.on("auth_failure", () => {
    waState = "disconnected";
    waQrDataUrl = null;
    waPhoneNumber = null;
    waClient = null;
  });

  client.on("disconnected", () => {
    waState = "disconnected";
    waQrDataUrl = null;
    waPhoneNumber = null;
    waClient = null;
  });

  waClient = client;
  client.initialize().catch(() => {
    waState = "disconnected";
    waClient = null;
  });
}

// ── All Shopify trigger statuses ─────────────────────────────────
const SHOPIFY_STATUSES = [
  // Order / Payment
  { id: "order_placed",          label: "Order Placed",             type: "order",       emoji: "🛒", description: "New order is placed by customer" },
  { id: "payment_pending",       label: "Payment Pending",          type: "order",       emoji: "⏳", description: "Payment not yet received" },
  { id: "payment_authorized",    label: "Payment Authorized",       type: "order",       emoji: "✅", description: "Payment authorized, not captured" },
  { id: "payment_confirmed",     label: "Payment Confirmed",        type: "order",       emoji: "💰", description: "Payment successfully captured/paid" },
  { id: "partially_paid",        label: "Partially Paid",           type: "order",       emoji: "💸", description: "Order partially paid" },
  { id: "payment_refunded",      label: "Refund Issued",            type: "order",       emoji: "↩️",  description: "Full refund given to customer" },
  { id: "partially_refunded",    label: "Partially Refunded",       type: "order",       emoji: "🔄", description: "Partial refund given" },
  { id: "order_cancelled",       label: "Order Cancelled",          type: "order",       emoji: "❌", description: "Order was cancelled" },
  // Fulfillment
  { id: "order_confirmed",       label: "Order Confirmed",          type: "fulfillment", emoji: "📦", description: "Order confirmed and being processed" },
  { id: "label_printed",         label: "Label Printed",            type: "fulfillment", emoji: "🖨️",  description: "Shipping label created" },
  { id: "order_shipped",         label: "Order Shipped",            type: "fulfillment", emoji: "🚚", description: "Order has been shipped" },
  { id: "partially_fulfilled",   label: "Partially Fulfilled",      type: "fulfillment", emoji: "📫", description: "Some items fulfilled" },
  { id: "fully_fulfilled",       label: "Fully Fulfilled",          type: "fulfillment", emoji: "✔️",  description: "All items fulfilled" },
  // Shipping / Delivery
  { id: "in_transit",            label: "In Transit",               type: "shipping",    emoji: "🛣️",  description: "Package on the way" },
  { id: "out_for_delivery",      label: "Out for Delivery",         type: "shipping",    emoji: "🏍️",  description: "Package out with delivery agent" },
  { id: "attempted_delivery",    label: "Delivery Attempted",       type: "shipping",    emoji: "🔔", description: "Delivery was attempted but failed" },
  { id: "ready_for_pickup",      label: "Ready for Pickup",         type: "shipping",    emoji: "🏪", description: "Available at pickup location" },
  { id: "picked_up",             label: "Picked Up",                type: "shipping",    emoji: "🤝", description: "Customer collected the order" },
  { id: "delivered",             label: "Delivered",                type: "shipping",    emoji: "🎉", description: "Successfully delivered to customer" },
  { id: "delivery_failed",       label: "Delivery Failed",          type: "shipping",    emoji: "⚠️",  description: "Delivery failed / returned" },
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
    res.json({ connected: false, phone_number: null, qr_data_url: waQrDataUrl, state: waState });
    return;
  }

  // Fire off the client — QR will arrive asynchronously via event
  startWhatsAppClient().catch(() => {});

  // Wait up to 15s for first QR to appear
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (waState === "qr_ready" || waState === "connected") break;
    await new Promise((r) => setTimeout(r, 500));
  }

  res.json({
    connected: waState === "connected",
    phone_number: waPhoneNumber,
    qr_data_url: waQrDataUrl,
    state: waState,
  });
});

router.post("/whatsapp/disconnect", async (_req, res) => {
  if (waClient) {
    try { await waClient.destroy(); } catch {}
    waClient = null;
  }
  waState = "disconnected";
  waPhoneNumber = null;
  waQrDataUrl = null;
  res.json({ connected: false, phone_number: null, qr_data_url: null, state: "disconnected" });
});

// ── Send real WhatsApp message ────────────────────────────────────
router.post("/whatsapp/send-message", async (req, res) => {
  const { to_phone, message, order_id, order_name, customer_name } = req.body as {
    to_phone: string;
    message: string;
    order_id: string;
    order_name?: string;
    customer_name?: string;
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

  try {
    await waClient.sendMessage(chatId, message);

    const chatMsg: ChatMessage = {
      id: msgId,
      order_id,
      to_phone,
      message,
      from: "store",
      status: "sent",
      timestamp: new Date().toISOString(),
    };

    if (!messagesByOrder[order_id]) messagesByOrder[order_id] = [];
    messagesByOrder[order_id].push(chatMsg);

    res.json(chatMsg);
  } catch (err) {
    const failedMsg: ChatMessage = {
      id: msgId,
      order_id,
      to_phone,
      message,
      from: "store",
      status: "failed",
      timestamp: new Date().toISOString(),
    };
    if (!messagesByOrder[order_id]) messagesByOrder[order_id] = [];
    messagesByOrder[order_id].push(failedMsg);
    res.status(500).json({ error: "Failed to send message", detail: String(err) });
  }
});

// ── Get messages for an order ──────────────────────────────────────
router.get("/whatsapp/messages/:order_id", (req, res) => {
  const msgs = messagesByOrder[req.params.order_id] ?? [];
  res.json({
    messages: msgs,
    connected: waState === "connected",
    phone_number: waPhoneNumber,
  });
});

// ── Rules CRUD ────────────────────────────────────────────────────

router.get("/whatsapp/rules", (_req, res) => {
  res.json({ rules });
});

router.post("/whatsapp/rules", (req, res) => {
  const parsed = CreateWhatsappRuleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const { trigger_type, trigger_status, message_template } = parsed.data;
  const status = SHOPIFY_STATUSES.find((s) => s.id === trigger_status);

  const rule: Rule = {
    id: String(ruleCounter++),
    trigger_type,
    trigger_status,
    trigger_label: status?.label ?? trigger_status,
    message_template,
    enabled: true,
    created_at: new Date().toISOString(),
  };

  rules.push(rule);
  res.status(201).json(rule);
});

router.delete("/whatsapp/rules/:id", (req, res) => {
  const idx = rules.findIndex((r) => r.id === req.params.id);
  if (idx === -1) {
    res.status(404).json({ error: "Rule not found" });
    return;
  }
  rules.splice(idx, 1);
  res.status(204).send();
});

router.patch("/whatsapp/rules/:id", (req, res) => {
  const parsed = ToggleWhatsappRuleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const rule = rules.find((r) => r.id === req.params.id);
  if (!rule) {
    res.status(404).json({ error: "Rule not found" });
    return;
  }

  rule.enabled = parsed.data.enabled;
  res.json(rule);
});

export default router;
