import { Router } from "express";
import QRCode from "qrcode";
import { CreateWhatsappRuleBody, ToggleWhatsappRuleBody } from "@workspace/api-zod";

const router = Router();

// ── In-memory state ──────────────────────────────────────────────
interface Rule {
  id: string;
  trigger_type: string;
  trigger_status: string;
  trigger_label: string;
  message_template: string;
  enabled: boolean;
  created_at: string;
}

let waState: "disconnected" | "qr_ready" | "connected" = "disconnected";
let waPhoneNumber: string | null = null;
let waQrDataUrl: string | null = null;
const rules: Rule[] = [];
let ruleCounter = 1;

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

// ── Default message templates ─────────────────────────────────────
const DEFAULT_TEMPLATES: Record<string, string> = {
  order_placed:        "Hi {customer_name}! 🛒 Thank you for your order {order_name} worth {total}. We'll confirm it shortly!",
  payment_confirmed:   "Hi {customer_name}! 💰 Payment confirmed for order {order_name} ({total}). We're preparing your order now.",
  order_shipped:       "Hi {customer_name}! 🚚 Your order {order_name} has been shipped! Track here: {tracking_url}",
  out_for_delivery:    "Hi {customer_name}! 🏍️ Your order {order_name} is out for delivery today. Be ready!",
  delivered:           "Hi {customer_name}! 🎉 Your order {order_name} has been delivered. Enjoy! Need help? Reply here.",
  order_cancelled:     "Hi {customer_name}! ❌ Your order {order_name} has been cancelled. Refund (if any) in 5-7 days.",
  attempted_delivery:  "Hi {customer_name}! 🔔 We tried delivering order {order_name} but couldn't reach you. We'll retry tomorrow.",
};

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

  // Generate a placeholder QR code (whatsapp-web.js will replace this with real QR when running on a full server with Chromium)
  const qrPayload = `WA_CONNECT_${Date.now()}_PLACEHOLDER`;
  waQrDataUrl = await QRCode.toDataURL(qrPayload, { width: 256, margin: 1 });
  waState = "qr_ready";

  res.json({
    connected: false,
    phone_number: null,
    qr_data_url: waQrDataUrl,
    state: "qr_ready",
  });
});

router.post("/whatsapp/disconnect", (_req, res) => {
  waState = "disconnected";
  waPhoneNumber = null;
  waQrDataUrl = null;
  res.json({ connected: false, phone_number: null, qr_data_url: null, state: "disconnected" });
});

// ── Rules CRUD ────────────────────────────────────────────────────

router.get("/whatsapp/rules", (_req, res) => {
  res.json({ rules });
});

router.post("/whatsapp/rules", (req, res) => {
  const parsed = CreateWhatsAppRuleBody.safeParse(req.body);
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
