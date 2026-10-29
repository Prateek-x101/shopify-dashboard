import { db, ordersTable, shiprocketAccountsTable, storesTable, type ShiprocketAccount, type Order, type SrMeta } from "@workspace/db";
import { and, eq, inArray, isNotNull, notInArray, or, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { addOrderEvent } from "../lib/order-insights";

const BASE = "https://apiv2.shiprocket.in/v1/external";
type Json = Record<string, any>;

/* ── status normalisation ─────────────────────────────────────────── */
export const SR_STATUS_KEYS = [
  { key: "new", label: "New" },
  { key: "awb_assigned", label: "AWB Assigned" },
  { key: "pickup_scheduled", label: "Pickup Scheduled" },
  { key: "picked_up", label: "Picked Up" },
  { key: "in_transit", label: "In Transit" },
  { key: "out_for_delivery", label: "Out for Delivery" },
  { key: "delivered", label: "Delivered" },
  { key: "ndr", label: "Undelivered / NDR" },
  { key: "rto", label: "RTO in progress" },
  { key: "rto_delivered", label: "RTO Delivered" },
  { key: "cancelled", label: "Cancelled" },
  { key: "lost", label: "Lost / Damaged" },
] as const;

export type SrStatusKey = (typeof SR_STATUS_KEYS)[number]["key"];
export const TERMINAL_SR: SrStatusKey[] = ["delivered", "rto_delivered", "cancelled", "lost"];

export function normalizeSrStatus(raw: string | null | undefined): SrStatusKey | null {
  if (!raw) return null;
  const s = raw.toUpperCase().replace(/_/g, " ").trim();
  if (s.startsWith("RTO") && s.includes("DELIVERED")) return "rto_delivered";
  if (s.startsWith("RTO") || s.includes("RETURN")) return "rto";
  if (s.includes("CANCEL")) return "cancelled";
  if (s.includes("LOST") || s.includes("DAMAGED") || s.includes("DESTROYED")) return "lost";
  if (s.includes("OUT FOR DELIVERY")) return "out_for_delivery";
  if (s === "DELIVERED" || s.endsWith(" DELIVERED")) return "delivered";
  if (s.includes("UNDELIVERED") || s.includes("NDR") || s.includes("FAILED") || s.includes("ATTEMPT")) return "ndr";
  if (s.includes("PICKED UP") || s.includes("SHIPPED")) return "picked_up";
  if (s.includes("TRANSIT") || s.includes("REACHED") || s.includes("HUB") || s.includes("MISROUTED")) return "in_transit";
  if (s.includes("PICKUP") || s.includes("MANIFEST")) return "pickup_scheduled";
  if (s.includes("AWB") || s.includes("READY TO SHIP") || s.includes("LABEL") || s.includes("INVOICED")) return "awb_assigned";
  if (s === "NEW" || s.includes("PROCESSING") || s.includes("ON HOLD")) return "new";
  return null;
}

/* ── auth ─────────────────────────────────────────────────────────── */
async function login(acc: ShiprocketAccount): Promise<string> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: acc.email, password: acc.password }),
  });
  const body = (await res.json().catch(() => ({}))) as Json;
  if (!res.ok || !body.token) {
    const msg = body.message ?? `HTTP ${res.status}`;
    await db.update(shiprocketAccountsTable).set({ lastError: `Login failed: ${msg}` }).where(eq(shiprocketAccountsTable.id, acc.id));
    throw new Error(`Shiprocket login failed: ${msg}`);
  }
  const expires = new Date(Date.now() + 9 * 86400_000); // tokens last 10 days
  await db
    .update(shiprocketAccountsTable)
    .set({ token: body.token, tokenExpiresAt: expires, lastError: null })
    .where(eq(shiprocketAccountsTable.id, acc.id));
  acc.token = body.token;
  acc.tokenExpiresAt = expires;
  return body.token;
}

async function token(acc: ShiprocketAccount) {
  if (acc.token && acc.tokenExpiresAt && acc.tokenExpiresAt.getTime() > Date.now()) return acc.token;
  return login(acc);
}

export async function srRequest(acc: ShiprocketAccount, path: string, init: RequestInit = {}): Promise<Json> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const t = await token(acc);
    const res = await fetch(path.startsWith("http") ? path : `${BASE}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}`, ...(init.headers ?? {}) },
    });
    if (res.status === 401 && attempt === 0) {
      acc.token = null;
      continue;
    }
    const text = await res.text();
    let body: Json = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { message: text.slice(0, 300) };
    }
    if (!res.ok) {
      const errs = body.errors ? ` ${JSON.stringify(body.errors)}` : "";
      throw new Error(`${body.message ?? `Shiprocket HTTP ${res.status}`}${errs}`);
    }
    return body;
  }
  throw new Error("Shiprocket auth failed");
}

export async function testShiprocket(acc: ShiprocketAccount) {
  acc.token = null;
  await token(acc);
  const pickups = await srRequest(acc, "/settings/company/pickup");
  const locations: string[] = (pickups.data?.shipping_address ?? []).map((p: Json) => p.pickup_location);
  return { ok: true, pickupLocations: locations };
}

/* ── status sync ──────────────────────────────────────────────────── */
function cleanName(name: string) {
  return name.replace(/^#/, "").trim().toLowerCase();
}

interface SrSnapshot {
  srOrderId: string;
  channelOrderId: string;
  status: string;
  shipmentId: string | null;
  awb: string | null;
  courier: string | null;
  phone: string | null;
  meta: SrMeta;
}

/** Shiprocket dates come as "25 Sep 2026, 08:51 PM" or ISO; keep whatever parses. */
function srDate(v: unknown): string | null {
  if (!v || typeof v !== "string") return null;
  const d = new Date(v.replace(",", ""));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function snapshot(o: Json): SrSnapshot {
  const ship = (o.shipments ?? [])[0] ?? {};
  return {
    srOrderId: String(o.id),
    channelOrderId: String(o.channel_order_id ?? ""),
    status: String(o.status ?? ""),
    shipmentId: ship.id ? String(ship.id) : null,
    awb: ship.awb || o.awb_data?.awb || null,
    courier: ship.courier || o.courier_name || null,
    phone: o.customer_phone ? String(o.customer_phone).replace(/\D/g, "").slice(-10) : null,
    meta: {
      etd: srDate(o.etd_date) ?? srDate(ship.etd),
      pickupScheduledAt: srDate(ship.pickup_scheduled_date) ?? srDate(o.pickup_booked_date),
      pickedUpAt: srDate(o.picked_up_date) ?? srDate(ship.pickedup_timestamp),
      outForDeliveryAt: srDate(o.out_for_delivery_date),
      deliveredAt: srDate(o.delivered_date) ?? srDate(ship.delivered_date),
      rtoRisk: (o.rto_risk ?? o.rto_prediction ?? null) || null,
      shippingCharges: ship.shipping_charges ? String(ship.shipping_charges) : null,
      weight: ship.weight ? String(ship.weight) : null,
      trackUrl: o.last_mile_awb_track_url || null,
    },
  };
}

async function applySnapshot(order: Pick<Order, "id" | "srStatus" | "awb">, accId: number, s: SrSnapshot) {
  const changed = order.srStatus !== s.status || order.awb !== s.awb;
  await db
    .update(ordersTable)
    .set({
      srAccountId: accId,
      srOrderId: s.srOrderId,
      srShipmentId: s.shipmentId,
      srStatus: s.status,
      srStatusCode: normalizeSrStatus(s.status),
      awb: s.awb,
      courier: s.courier,
      srMeta: s.meta,
      ...(changed ? { srUpdatedAt: new Date() } : {}),
    })
    .where(eq(ordersTable.id, order.id));
  if (order.srStatus !== s.status) await addOrderEvent(order.id, "shipment", `Shiprocket: ${s.status}`, order.srStatus ? `was ${order.srStatus}` : null);
  if (s.awb && order.awb !== s.awb) await addOrderEvent(order.id, "awb", `AWB ${s.awb}`, s.courier);
}

/** Pull recent Shiprocket orders and match them to dashboard orders by order name. */
export async function syncShiprocketAccount(acc: ShiprocketAccount, maxPages = 5) {
  const stores = await db.select({ id: storesTable.id }).from(storesTable).where(eq(storesTable.shiprocketAccountId, acc.id));
  if (stores.length === 0) {
    await db.update(shiprocketAccountsTable).set({ lastError: "Not linked to any store: pick this account on a store in Settings → Shopify stores" }).where(eq(shiprocketAccountsTable.id, acc.id));
    return 0;
  }
  const storeIds = stores.map((s) => s.id);
  const since = new Date(Date.now() - 120 * 86400_000);
  const local = await db
    .select({ id: ordersTable.id, name: ordersTable.name, phone: ordersTable.phone, srStatus: ordersTable.srStatus, awb: ordersTable.awb })
    .from(ordersTable)
    .where(and(inArray(ordersTable.storeId, storeIds), sql`${ordersTable.createdAt} >= ${since}`));
  const byName = new Map<string, typeof local>();
  for (const o of local) {
    const k = cleanName(o.name);
    byName.set(k, [...(byName.get(k) ?? []), o]);
  }

  let matched = 0;
  for (let page = 1; page <= maxPages; page++) {
    const body = await srRequest(acc, `/orders?per_page=100&page=${page}&sort=DESC&sort_by=id`);
    const rows: Json[] = body.data ?? [];
    for (const raw of rows) {
      const s = snapshot(raw);
      const candidates = byName.get(cleanName(s.channelOrderId)) ?? [];
      // Same order number in two stores on one Shiprocket account: disambiguate by phone
      const hit =
        candidates.length === 1
          ? candidates[0]
          : candidates.find((c) => s.phone && c.phone?.endsWith(s.phone));
      if (!hit) continue;
      await applySnapshot(hit, acc.id, s);
      matched++;
    }
    const last = rows[rows.length - 1];
    if (rows.length < 100 || (last?.created_at && new Date(last.created_at) < since)) break;
  }

  await trackOlderShipments(acc, storeIds);
  await db.update(shiprocketAccountsTable).set({ lastSyncAt: new Date(), lastError: null }).where(eq(shiprocketAccountsTable.id, acc.id));
  return matched;
}

/** Shipments still moving but older than the order-list window: track by AWB. */
async function trackOlderShipments(acc: ShiprocketAccount, storeIds: number[]) {
  const stale = await db
    .select({ id: ordersTable.id, awb: ordersTable.awb, srStatus: ordersTable.srStatus })
    .from(ordersTable)
    .where(
      and(
        inArray(ordersTable.storeId, storeIds),
        isNotNull(ordersTable.awb),
        or(sql`${ordersTable.srStatusCode} IS NULL`, notInArray(ordersTable.srStatusCode, TERMINAL_SR)),
        sql`${ordersTable.srUpdatedAt} < now() - interval '6 hours'`,
      ),
    )
    .limit(25);
  for (const o of stale) {
    try {
      const status = await trackAwb(acc, o.awb!);
      if (status && status !== o.srStatus) {
        await db
          .update(ordersTable)
          .set({ srStatus: status, srStatusCode: normalizeSrStatus(status), srUpdatedAt: new Date() })
          .where(eq(ordersTable.id, o.id));
        await addOrderEvent(o.id, "shipment", `Shiprocket: ${status}`, o.srStatus ? `was ${o.srStatus}` : null);
      } else {
        await db.update(ordersTable).set({ srUpdatedAt: new Date() }).where(eq(ordersTable.id, o.id));
      }
    } catch (err) {
      logger.debug({ err: (err as Error).message, awb: o.awb }, "awb track failed");
    }
  }
}

export async function trackAwb(acc: ShiprocketAccount, awb: string): Promise<string | null> {
  const body = await srRequest(acc, `/courier/track/awb/${encodeURIComponent(awb)}`);
  const td = body.tracking_data ?? {};
  return td.shipment_track?.[0]?.current_status ?? td.shipment_track_activities?.[0]?.["sr-status-label"] ?? null;
}

export async function trackingTimeline(acc: ShiprocketAccount, awb: string) {
  const body = await srRequest(acc, `/courier/track/awb/${encodeURIComponent(awb)}`);
  const td = body.tracking_data ?? {};
  return {
    current: td.shipment_track?.[0]?.current_status ?? null,
    etd: td.etd ?? null,
    trackUrl: td.track_url ?? `https://shiprocket.co/tracking/${awb}`,
    activities: (td.shipment_track_activities ?? []).map((a: Json) => ({
      date: a.date,
      status: a["sr-status-label"] ?? a.status,
      activity: a.activity,
      location: a.location,
    })),
  };
}

/* ── actions ──────────────────────────────────────────────────────── */
export interface ActionResult {
  orderId: number;
  name: string;
  ok: boolean;
  message: string;
}

export interface PackageInput {
  weight: number; // kg
  length: number; // cm
  breadth: number;
  height: number;
}

export function defaultPackage(acc: ShiprocketAccount, o: Pick<Order, "itemCount">): PackageInput {
  const d = acc.packageDefaults;
  const per = d?.weight ?? 0.5;
  return {
    weight: Math.round(Math.max(per, per * Math.max(1, o.itemCount)) * 100) / 100,
    length: d?.length ?? 28,
    breadth: d?.breadth ?? 22,
    height: Math.max(d?.height ?? 4, Math.min(30, (d?.height ?? 4) * Math.max(1, o.itemCount))),
  };
}

export async function createShiprocketOrder(acc: ShiprocketAccount, o: Order, pkg?: PackageInput) {
  const p = pkg ?? defaultPackage(acc, o);
  const a = o.shippingAddress ?? {};
  const [first, ...rest] = (o.customerName ?? a.name ?? "Customer").split(" ");
  const raw = (o.raw ?? {}) as Json;
  const payload = {
    order_id: o.name.replace(/^#/, ""),
    order_date: o.createdAt.toISOString().slice(0, 16).replace("T", " "),
    pickup_location: acc.pickupLocation || "Primary",
    billing_customer_name: first,
    billing_last_name: rest.join(" "),
    billing_address: a.address1 ?? "",
    billing_address_2: a.address2 ?? "",
    billing_city: a.city ?? "",
    billing_state: a.province ?? "",
    billing_pincode: String(a.zip ?? ""),
    billing_country: a.country ?? "India",
    billing_email: o.email ?? "",
    billing_phone: (o.phone ?? "").slice(-10),
    shipping_is_billing: true,
    payment_method: o.paymentMethod === "COD" ? "COD" : "Prepaid",
    shipping_charges: Number(raw.total_shipping_price_set?.shop_money?.amount ?? 0),
    total_discount: Number(raw.total_discounts ?? 0),
    sub_total: Number(raw.subtotal_price ?? o.totalPrice),
    order_items: o.lineItems.map((li) => ({
      name: [li.title, li.variantTitle].filter(Boolean).join(" - "),
      sku: li.sku || li.variantId || li.title,
      units: li.quantity,
      selling_price: Number(li.price),
    })),
    length: p.length,
    breadth: p.breadth,
    height: p.height,
    weight: p.weight,
  };
  if (!payload.billing_address || payload.billing_address.length < 3) throw new Error("Address is missing: fix it on the order first");
  if (!/^\d{10}$/.test(payload.billing_phone)) throw new Error("Phone number is missing or not 10 digits");
  if (!/^\d{6}$/.test(payload.billing_pincode)) throw new Error("PIN code is missing or invalid");
  const body = await srRequest(acc, "/orders/create/adhoc", { method: "POST", body: JSON.stringify(payload) });
  if (!body.order_id) throw new Error(body.message ?? "Shiprocket did not return an order id");
  await db
    .update(ordersTable)
    .set({
      srAccountId: acc.id,
      srOrderId: String(body.order_id),
      srShipmentId: body.shipment_id ? String(body.shipment_id) : null,
      srStatus: body.status ?? "NEW",
      srStatusCode: "new",
      srUpdatedAt: new Date(),
    })
    .where(eq(ordersTable.id, o.id));
  await addOrderEvent(o.id, "shipment", "Pushed to Shiprocket", `SR order #${body.order_id}`, "Dashboard");
  return `Created in Shiprocket (#${body.order_id})`;
}

export async function assignAwb(acc: ShiprocketAccount, o: Order, courierId?: number) {
  if (!o.srShipmentId) throw new Error("Not in Shiprocket yet: push it first");
  const body = await srRequest(acc, "/courier/assign/awb", {
    method: "POST",
    body: JSON.stringify({ shipment_id: Number(o.srShipmentId), ...(courierId ? { courier_id: courierId } : {}) }),
  });
  const data = body.response?.data ?? {};
  if (body.awb_assign_status !== 1 || !data.awb_code) {
    throw new Error(data.awb_assign_error ?? body.message ?? "AWB not assigned");
  }
  await db
    .update(ordersTable)
    .set({ awb: data.awb_code, courier: data.courier_name ?? null, srStatus: "AWB ASSIGNED", srStatusCode: "awb_assigned", srUpdatedAt: new Date() })
    .where(eq(ordersTable.id, o.id));
  await addOrderEvent(o.id, "awb", `AWB ${data.awb_code} assigned`, data.courier_name ?? null, "Dashboard");
  return `AWB ${data.awb_code} (${data.courier_name ?? "courier"})`;
}

/** Bulk endpoints that take many shipment ids at once. */
export async function bulkShipmentAction(acc: ShiprocketAccount, orders: Order[], action: "pickup" | "label" | "manifest" | "invoice") {
  const withShipment = orders.filter((o) => o.srShipmentId);
  if (withShipment.length === 0) throw new Error("None of the selected orders have a Shiprocket shipment");
  const ids = withShipment.map((o) => Number(o.srShipmentId));
  if (action === "pickup") {
    const body = await srRequest(acc, "/courier/generate/pickup", { method: "POST", body: JSON.stringify({ shipment_id: ids }) });
    await db
      .update(ordersTable)
      .set({ srStatus: "PICKUP SCHEDULED", srStatusCode: "pickup_scheduled", srUpdatedAt: new Date() })
      .where(inArray(ordersTable.id, withShipment.map((o) => o.id)));
    for (const o of withShipment) await addOrderEvent(o.id, "shipment", "Pickup scheduled", null, "Dashboard");
    return { message: body.response?.data ?? body.message ?? "Pickup scheduled", url: null };
  }
  if (action === "label") {
    const body = await srRequest(acc, "/courier/generate/label", { method: "POST", body: JSON.stringify({ shipment_id: ids }) });
    if (!body.label_url) throw new Error(body.response ?? body.message ?? "Label not generated");
    await db.update(ordersTable).set({ labelUrl: body.label_url }).where(inArray(ordersTable.id, withShipment.map((o) => o.id)));
    return { message: `Labels ready for ${ids.length} orders`, url: body.label_url as string };
  }
  if (action === "manifest") {
    const body = await srRequest(acc, "/manifests/generate", { method: "POST", body: JSON.stringify({ shipment_id: ids }) });
    let url = body.manifest_url ?? null;
    if (!url) {
      const printed = await srRequest(acc, "/manifests/print", {
        method: "POST",
        body: JSON.stringify({ order_ids: withShipment.map((o) => Number(o.srOrderId)) }),
      });
      url = printed.manifest_url ?? null;
    }
    return { message: "Manifest generated", url };
  }
  const body = await srRequest(acc, "/orders/print/invoice", {
    method: "POST",
    body: JSON.stringify({ ids: withShipment.map((o) => Number(o.srOrderId)) }),
  });
  return { message: "Invoices ready", url: (body.invoice_url as string) ?? null };
}

export async function cancelShiprocketOrders(acc: ShiprocketAccount, orders: Order[]) {
  const ids = orders.filter((o) => o.srOrderId).map((o) => Number(o.srOrderId));
  if (ids.length === 0) throw new Error("None of the selected orders are in Shiprocket");
  await srRequest(acc, "/orders/cancel", { method: "POST", body: JSON.stringify({ ids }) });
  await db
    .update(ordersTable)
    .set({ srStatus: "CANCELED", srStatusCode: "cancelled", srUpdatedAt: new Date() })
    .where(inArray(ordersTable.id, orders.filter((o) => o.srOrderId).map((o) => o.id)));
  for (const o of orders.filter((x) => x.srOrderId)) await addOrderEvent(o.id, "cancelled", "Cancelled in Shiprocket", null, "Dashboard");
  return `Cancelled ${ids.length} in Shiprocket`;
}

export async function courierOptions(acc: ShiprocketAccount, o: Order, pkg?: PackageInput) {
  const p = pkg ?? defaultPackage(acc, o);
  const a = o.shippingAddress ?? {};
  const pickup = await srRequest(acc, "/settings/company/pickup");
  const loc = (pickup.data?.shipping_address ?? []).find((p: Json) => p.pickup_location === acc.pickupLocation) ?? pickup.data?.shipping_address?.[0];
  const params = new URLSearchParams({
    pickup_postcode: String(loc?.pin_code ?? ""),
    delivery_postcode: String(a.zip ?? ""),
    weight: String(p.weight),
    cod: o.paymentMethod === "COD" ? "1" : "0",
    declared_value: String(o.totalPrice),
  });
  if (!loc?.pin_code) throw new Error(`Pickup location "${acc.pickupLocation}" not found in Shiprocket`);
  const body = await srRequest(acc, `/courier/serviceability/?${params}`);
  const recommendedId = body.data?.recommended_courier_company_id ?? body.data?.shiprocket_recommended_courier_id;
  return (body.data?.available_courier_companies ?? [])
    .map((c: Json) => ({
      id: Number(c.courier_company_id),
      name: String(c.courier_name),
      rate: Number(c.rate ?? c.freight_charge ?? 0),
      codCharges: Number(c.cod_charges ?? 0),
      etd: c.etd ?? null,
      etdDays: c.estimated_delivery_days ? Number(c.estimated_delivery_days) : null,
      rating: c.rating != null ? Number(c.rating) : null,
      surface: !!c.is_surface,
      recommended: c.courier_company_id === recommendedId,
    }))
    .sort((a: { recommended: boolean; rate: number }, b: { recommended: boolean; rate: number }) => Number(b.recommended) - Number(a.recommended) || a.rate - b.rate);
}

/** Shiprocket tracking webhook payload → update order */
export async function applyTrackingWebhook(payload: Json) {
  const awb = payload.awb ? String(payload.awb) : null;
  const status = payload.current_status ?? payload.shipment_status ?? null;
  if (!awb || !status) return false;
  const res = await db
    .update(ordersTable)
    .set({ srStatus: String(status), srStatusCode: normalizeSrStatus(String(status)), srUpdatedAt: new Date() })
    .where(eq(ordersTable.awb, awb))
    .returning({ id: ordersTable.id });
  for (const r of res) await addOrderEvent(r.id, "shipment", `Shiprocket: ${status}`, payload.scans?.[0]?.location ?? null);
  return res.length > 0;
}


export interface ShipStep {
  step: "create" | "awb" | "pickup" | "label";
  ok: boolean;
  message: string;
}

/**
 * Everything "Ship" means in one go: create in Shiprocket (if needed) →
 * assign AWB with the chosen courier → schedule pickup → generate label.
 * Stops at the first failing step and reports what happened.
 */
export async function shipOrder(
  acc: ShiprocketAccount,
  order: Order,
  opts: { courierId?: number; pkg?: PackageInput; pickup?: boolean; label?: boolean },
) {
  const steps: ShipStep[] = [];
  let o = order;
  const reload = async () => {
    [o] = await db.select().from(ordersTable).where(eq(ordersTable.id, order.id));
  };
  try {
    if (!o.srOrderId) {
      steps.push({ step: "create", ok: true, message: await createShiprocketOrder(acc, o, opts.pkg) });
      await reload();
    }
    if (!o.awb) {
      steps.push({ step: "awb", ok: true, message: await assignAwb(acc, o, opts.courierId) });
      await reload();
    }
    if (opts.pickup ?? acc.autoPickup) {
      if (["awb_assigned", "new"].includes(o.srStatusCode ?? "")) {
        const r = await bulkShipmentAction(acc, [o], "pickup");
        steps.push({ step: "pickup", ok: true, message: String(r.message) });
      }
    }
    let labelUrl: string | null = o.labelUrl;
    if (opts.label ?? true) {
      const r = await bulkShipmentAction(acc, [o], "label");
      labelUrl = r.url;
      steps.push({ step: "label", ok: true, message: "Label ready" });
    }
    await reload();
    return { ok: true, steps, awb: o.awb, courier: o.courier, labelUrl };
  } catch (err) {
    const failed: ShipStep["step"] = !o.srOrderId ? "create" : !o.awb ? "awb" : steps.some((x) => x.step === "pickup") ? "label" : "pickup";
    steps.push({ step: failed, ok: false, message: (err as Error).message });
    await reload();
    return { ok: false, steps, awb: o.awb, courier: o.courier, labelUrl: o.labelUrl };
  }
}

/** Act on an undelivered (NDR) shipment: ask the courier to re-attempt, or return it. */
export async function ndrAction(acc: ShiprocketAccount, o: Order, action: "re-attempt" | "return", comment: string) {
  if (!o.awb) throw new Error("No AWB on this order");
  await srRequest(acc, `/ndr/${encodeURIComponent(o.awb)}/action`, {
    method: "POST",
    body: JSON.stringify({ action, comments: comment || (action === "re-attempt" ? "Customer available, please re-attempt" : "Return to origin") }),
  });
  await addOrderEvent(o.id, "shipment", action === "re-attempt" ? "NDR: re-attempt requested" : "NDR: marked for return (RTO)", comment || null, "Dashboard");
}
