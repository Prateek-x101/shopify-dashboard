import { db, ordersTable, type Order } from "@workspace/db";
import { and, desc, inArray, or } from "drizzle-orm";

/**
 * "Will this order reach the customer?" — a 0-100 delivery score with the
 * reasons behind it and what to do next. Built only from data we already
 * have (address, phone, past orders of the same customer, Shiprocket's RTO
 * prediction), so it is explainable rather than a black box.
 */
export type Severity = "high" | "medium" | "low";
export interface QualityFlag {
  key: string;
  label: string;
  detail?: string;
  severity: Severity;
}
export interface Quality {
  score: number;
  level: "good" | "check" | "risky";
  flags: QualityFlag[];
  actions: ("confirm_address" | "confirm_cod" | "check_duplicate" | "ask_prepaid")[];
  history: { orders: number; delivered: number; rto: number; cancelled: number };
  duplicates: { id: number; name: string; createdAt: Date }[];
  confirmed: boolean;
}

type Lite = Pick<
  Order,
  "id" | "name" | "phone" | "email" | "createdAt" | "cancelledAt" | "srStatusCode" | "paymentMethod" | "totalPrice" | "tags" | "addressIssue" | "shippingAddress" | "customerName" | "srMeta" | "confirmedAt" | "lineItems" | "awb"
>;

const PENALTY: Record<Severity, number> = { high: 30, medium: 15, low: 6 };

function rtoPrediction(o: Lite): string | null {
  const fromSr = o.srMeta?.rtoRisk;
  if (fromSr) return String(fromSr).toLowerCase();
  const t = o.tags.toLowerCase();
  const m = t.match(/rto_prediction_([a-z-]+)/);
  if (m) return m[1];
  const tokens = t.split(/,\s*/);
  for (const k of ["very-high", "high", "medium", "low"]) if (tokens.includes(k)) return k;
  return null;
}

function suspiciousName(name: string | null) {
  const n = (name ?? "").replace(/[^a-z ]/gi, "").trim();
  if (n.length < 3) return true;
  return /^(test|asdf|abc|xyz|qwerty|na|none|customer)\b/i.test(n);
}

function suspiciousPhone(p: string | null) {
  if (!p) return "No phone number";
  const d = p.slice(-10);
  if (!/^[6-9]\d{9}$/.test(d)) return "Not a valid Indian mobile number";
  if (/^(\d)\1{6,}/.test(d) || /0123456789|1234567890|9876543210/.test(d)) return "Looks like a dummy number";
  return null;
}

export function assess(o: Lite, past: Lite[]): Quality {
  const flags: QualityFlag[] = [];
  const actions = new Set<Quality["actions"][number]>();
  const others = past.filter((p) => p.id !== o.id);

  // Customer history (same phone or email)
  const history = {
    orders: others.length,
    delivered: others.filter((p) => p.srStatusCode === "delivered").length,
    rto: others.filter((p) => p.srStatusCode === "rto" || p.srStatusCode === "rto_delivered").length,
    cancelled: others.filter((p) => !!p.cancelledAt || p.srStatusCode === "cancelled").length,
  };
  if (history.rto > 0) flags.push({ key: "past_rto", label: `${history.rto} earlier order${history.rto > 1 ? "s" : ""} returned (RTO)`, severity: history.rto > 1 ? "high" : "medium" });
  if (history.delivered > 0 && history.rto === 0) flags.push({ key: "repeat", label: `Repeat customer: ${history.delivered} delivered before`, severity: "low" });

  // Same customer ordered again within 3 days, still open → probably a duplicate
  const duplicates = others
    .filter((p) => !p.cancelledAt && Math.abs(p.createdAt.getTime() - o.createdAt.getTime()) < 3 * 86400_000 && p.srStatusCode !== "delivered")
    .map((p) => ({ id: p.id, name: p.name, createdAt: p.createdAt }));
  if (duplicates.length) {
    flags.push({ key: "duplicate", label: `Possible duplicate of ${duplicates.map((d) => d.name).join(", ")}`, detail: "Same customer ordered again within 3 days", severity: "high" });
    actions.add("check_duplicate");
  }

  // Address
  if (o.addressIssue) {
    flags.push({ key: "address", label: o.addressIssue, severity: /missing|invalid/i.test(o.addressIssue) ? "high" : "medium" });
    actions.add("confirm_address");
  } else {
    const line = [o.shippingAddress?.address1, o.shippingAddress?.address2].filter(Boolean).join(" ");
    if (line && !/\d/.test(line)) {
      // villages often have no house numbers; a landmark-style address is less of a worry
      const rural = /\b(vill(age)?|vpo|po|post|tehsil|teh|dist(rict)?|gram|gaon|near|opp|behind|road|chowk|mandir|temple|school|bus stand|stand)\b/i.test(line);
      flags.push({ key: "no_house_no", label: "No house / flat number in address", detail: rural ? "village / landmark address" : undefined, severity: rural ? "low" : "medium" });
      actions.add("confirm_address");
    } else if (line && line.length < 30 && !/near|opp|behind|landmark|beside|road|nagar|colony|sector|street|lane|apartment|apt|tower|block/i.test(line)) {
      flags.push({ key: "no_landmark", label: "Short address without a landmark", severity: "low" });
      actions.add("confirm_address");
    }
  }

  const badPhone = suspiciousPhone(o.phone);
  if (badPhone) flags.push({ key: "phone", label: badPhone, severity: "high" });
  if (suspiciousName(o.customerName)) flags.push({ key: "name", label: "Name looks incomplete or fake", detail: o.customerName ?? "", severity: "low" });

  // Shiprocket / Fastrr RTO prediction
  const pred = rtoPrediction(o);
  if (pred === "very-high" || pred === "high") flags.push({ key: "sr_rto", label: `Shiprocket predicts ${pred.replace("-", " ")} RTO risk`, severity: pred === "very-high" ? "high" : "medium" });
  else if (pred === "medium") flags.push({ key: "sr_rto", label: "Shiprocket predicts medium RTO risk", severity: "low" });

  // COD exposure
  const value = Number(o.totalPrice);
  if (o.paymentMethod === "COD") {
    if (value >= 3000) {
      flags.push({ key: "cod_value", label: `High-value COD (₹${Math.round(value).toLocaleString("en-IN")})`, severity: "medium" });
      actions.add("ask_prepaid");
    }
    if (!o.confirmedAt) actions.add("confirm_cod");
  }
  const qty = o.lineItems.reduce((s, l) => s + l.quantity, 0);
  if (qty >= 3) flags.push({ key: "qty", label: `${qty} items in one order`, severity: "low" });

  const confirmed = !!o.confirmedAt;
  if (confirmed) flags.push({ key: "confirmed", label: "Customer confirmed on WhatsApp", severity: "low" });

  let score = 100;
  for (const f of flags) if (!["repeat", "confirmed"].includes(f.key)) score -= PENALTY[f.severity];
  if (history.delivered > 0 && history.rto === 0) score += 5;
  if (confirmed) score += 10;
  if (o.paymentMethod === "Prepaid") score += 5;
  score = Math.max(0, Math.min(100, score));
  const level: Quality["level"] = score >= 80 ? "good" : score >= 55 ? "check" : "risky";
  if (confirmed) actions.delete("confirm_cod");
  if (o.awb) {
    actions.delete("confirm_cod");
    actions.delete("ask_prepaid");
  }
  // nothing left to act on for finished orders
  if (o.cancelledAt || ["cancelled", "delivered", "rto_delivered"].includes(o.srStatusCode ?? "")) actions.clear();

  const order: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
  flags.sort((a, b) => order[a.severity] - order[b.severity]);
  return { score, level, flags, actions: [...actions], history, duplicates, confirmed };
}

const COLS = {
  id: ordersTable.id,
  name: ordersTable.name,
  phone: ordersTable.phone,
  email: ordersTable.email,
  createdAt: ordersTable.createdAt,
  cancelledAt: ordersTable.cancelledAt,
  srStatusCode: ordersTable.srStatusCode,
  paymentMethod: ordersTable.paymentMethod,
  totalPrice: ordersTable.totalPrice,
  tags: ordersTable.tags,
  addressIssue: ordersTable.addressIssue,
  shippingAddress: ordersTable.shippingAddress,
  customerName: ordersTable.customerName,
  srMeta: ordersTable.srMeta,
  confirmedAt: ordersTable.confirmedAt,
  lineItems: ordersTable.lineItems,
  awb: ordersTable.awb,
};

/** Assess many orders at once (one query for all their customers' history). */
export async function assessMany(ids: number[]): Promise<Map<number, Quality>> {
  const out = new Map<number, Quality>();
  if (ids.length === 0) return out;
  const targets = await db.select(COLS).from(ordersTable).where(inArray(ordersTable.id, ids));
  const phones = [...new Set(targets.map((t) => t.phone).filter((x): x is string => !!x))];
  const emails = [...new Set(targets.map((t) => t.email).filter((x): x is string => !!x))];
  const related =
    phones.length || emails.length
      ? await db
          .select(COLS)
          .from(ordersTable)
          .where(and(or(phones.length ? inArray(ordersTable.phone, phones) : undefined, emails.length ? inArray(ordersTable.email, emails) : undefined)))
          .orderBy(desc(ordersTable.createdAt))
          .limit(2000)
      : [];
  for (const t of targets) {
    const past = related.filter((r) => (t.phone && r.phone === t.phone) || (t.email && r.email === t.email));
    out.set(t.id, assess(t, past));
  }
  return out;
}
