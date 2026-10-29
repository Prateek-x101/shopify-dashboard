import { Router } from "express";
import {
  db,
  ordersTable,
  storesTable,
  messagesTable,
  checkoutsTable,
  shiprocketAccountsTable,
  type Order,
} from "@workspace/db";
import { and, asc, desc, eq, gte, ilike, inArray, isNotNull, isNull, lte, ne, or, sql, type SQL } from "drizzle-orm";
import {
  createShiprocketOrder,
  assignAwb,
  bulkShipmentAction,
  cancelShiprocketOrders,
  trackingTimeline,
  courierOptions,
  shipOrder,
  ndrAction,
  defaultPackage,
  SR_STATUS_KEYS,
  type ActionResult,
  type PackageInput,
} from "../integrations/shiprocket";
import { normalizePhone, checkAddress } from "../lib/contact";
import { orderInsights, derivedEvents, addOrderEvent } from "../lib/order-insights";
import { orderEventsTable } from "@workspace/db";
import { assessMany } from "../services/quality";
import { fulfillPending, retryFulfillment } from "../services/fulfillment";
import { sendWhatsApp } from "../services/messaging";

const router = Router();
const o = ordersTable;

const notCancelled = and(isNull(o.cancelledAt), or(isNull(o.srStatusCode), ne(o.srStatusCode, "cancelled")));

const noAwb = and(notCancelled, isNull(o.awb), or(isNull(o.fulfillmentStatus), eq(o.fulfillmentStatus, "unfulfilled"), eq(o.fulfillmentStatus, "partial")));

export const ORDER_TABS: Record<string, { label: string; where: SQL | undefined; hidden?: boolean }> = {
  all: { label: "All", where: undefined },
  to_ship: { label: "To ship", where: noAwb },
  complaints: { label: "Complaints", where: eq(o.complaintStatus, "open") },
  unfulfilled: { label: "Unfulfilled", where: and(notCancelled, or(isNull(o.fulfillmentStatus), eq(o.fulfillmentStatus, "unfulfilled"), eq(o.fulfillmentStatus, "partial"))) },
  not_in_sr: { label: "Not in Shiprocket", where: and(notCancelled, isNull(o.srOrderId), or(isNull(o.fulfillmentStatus), eq(o.fulfillmentStatus, "unfulfilled"))), hidden: true },
  ready: { label: "In Shiprocket, no AWB", where: and(notCancelled, eq(o.srStatusCode, "new")), hidden: true },
  to_pickup: { label: "Pickup pending", where: and(notCancelled, inArray(o.srStatusCode, ["awb_assigned", "pickup_scheduled"])) },
  in_transit: { label: "In transit", where: inArray(o.srStatusCode, ["picked_up", "in_transit", "out_for_delivery"]) },
  ndr: { label: "NDR", where: eq(o.srStatusCode, "ndr") },
  delivered: { label: "Delivered", where: eq(o.srStatusCode, "delivered") },
  rto: { label: "RTO", where: inArray(o.srStatusCode, ["rto", "rto_delivered"]) },
  cancelled: { label: "Cancelled", where: or(isNotNull(o.cancelledAt), eq(o.srStatusCode, "cancelled")) },
  address_issue: { label: "Address issues", where: and(notCancelled, isNotNull(o.addressIssue), isNull(o.awb)) },
  multi_qty: { label: "Multiple qty", where: sql`${o.itemCount} > 1` },
  unread: { label: "Customer replied", where: sql`${o.unreadCount} > 0` },
};

function baseFilters(q: Record<string, unknown>): SQL[] {
  const f: SQL[] = [];
  if (q.storeId) f.push(eq(o.storeId, Number(q.storeId)));
  if (q.payment === "COD" || q.payment === "Prepaid") f.push(eq(o.paymentMethod, q.payment));
  if (q.from) f.push(gte(o.createdAt, new Date(String(q.from))));
  if (q.to) f.push(lte(o.createdAt, new Date(String(q.to))));
  if (q.srStatus) f.push(eq(o.srStatusCode, String(q.srStatus)));
  // Shiprocket/Fastrr put their RTO prediction in the tags (e.g. "rto_prediction_very-high")
  if (q.risk === "high") f.push(sql`${o.tags} ~* '(^|[ ,_])(very-)?high($|[ ,])'`);
  const search = String(q.q ?? "").trim();
  if (search) {
    const like = `%${search}%`;
    const phone = normalizePhone(search);
    f.push(
      or(
        ilike(o.name, like),
        ilike(o.customerName, like),
        ilike(o.email, like),
        ilike(o.awb, like),
        ilike(o.tags, like),
        sql`${o.lineItems}::text ILIKE ${like}`,
        phone ? ilike(o.phone, `%${phone.slice(-10)}%`) : undefined,
      )!,
    );
  }
  return f;
}

router.get("/orders/meta", (_req, res) => {
  res.json({
    tabs: Object.entries(ORDER_TABS)
      .filter(([, t]) => !t.hidden)
      .map(([key, t]) => ({ key, label: t.label })),
    srStatuses: SR_STATUS_KEYS,
  });
});

router.get("/orders", async (req, res) => {
  const q = req.query as Record<string, string>;
  const tab = ORDER_TABS[q.tab ?? "all"] ?? ORDER_TABS.all;
  const page = Math.max(1, Number(q.page ?? 1));
  const pageSize = Math.min(200, Math.max(10, Number(q.pageSize ?? 50)));
  const filters = baseFilters(q);
  const where = and(...filters, tab.where);

  const sortCol = q.sort === "total" ? o.totalPrice : q.sort === "updated" ? o.srUpdatedAt : o.createdAt;
  const rows = await db
    .select({
      id: o.id,
      storeId: o.storeId,
      name: o.name,
      createdAt: o.createdAt,
      cancelledAt: o.cancelledAt,
      financialStatus: o.financialStatus,
      fulfillmentStatus: o.fulfillmentStatus,
      paymentMethod: o.paymentMethod,
      totalPrice: o.totalPrice,
      currency: o.currency,
      tags: o.tags,
      customerName: o.customerName,
      phone: o.phone,
      email: o.email,
      city: sql<string | null>`${o.shippingAddress}->>'city'`,
      state: sql<string | null>`${o.shippingAddress}->>'province'`,
      lineItems: o.lineItems,
      itemCount: o.itemCount,
      addressIssue: o.addressIssue,
      srOrderId: o.srOrderId,
      srStatus: o.srStatus,
      srStatusCode: o.srStatusCode,
      awb: o.awb,
      courier: o.courier,
      lastWaStatus: o.lastWaStatus,
      lastWaAt: o.lastWaAt,
      lastEmailAt: o.lastEmailAt,
      unreadCount: o.unreadCount,
      srMeta: o.srMeta,
      srUpdatedAt: o.srUpdatedAt,
      complaintStatus: o.complaintStatus,
      labelUrl: o.labelUrl,
      source: sql<string | null>`(SELECT a->>'value' FROM jsonb_array_elements(coalesce(${o.raw}->'note_attributes', '[]'::jsonb)) a WHERE a->>'name' = 'utm_source' LIMIT 1)`,
      zip: sql<string | null>`${o.shippingAddress}->>'zip'`,
      shippingAddress: o.shippingAddress,
      confirmedAt: o.confirmedAt,
      shopifyFulfillError: o.shopifyFulfillError,
    })
    .from(o)
    .where(where)
    .orderBy(q.dir === "asc" ? asc(sortCol) : desc(sortCol), desc(o.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(o).where(where);

  // Tab counts respect the store / payment / search filters
  const countSelect: Record<string, SQL<number>> = {};
  for (const [key, t] of Object.entries(ORDER_TABS)) {
    countSelect[key] = t.where ? sql<number>`count(*) filter (where ${t.where})::int` : sql<number>`count(*)::int`;
  }
  const [counts] = await db.select(countSelect).from(o).where(and(...filters));

  const quality = await assessMany(rows.map((r) => r.id));
  const withConv = await withConversations(rows);
  res.json({ rows: withConv.map((r) => ({ ...r, quality: quality.get(r.id) ?? null })), total, page, pageSize, counts });
});

/**
 * Per order: what came in on WhatsApp / email (and whether it is unread or a
 * complaint), so the list can show who is waiting for a reply.
 */
async function withConversations<T extends { id: number; phone: string | null; email: string | null }>(rows: T[]) {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const contacts = [...new Set(rows.flatMap((r) => [r.phone, r.email]).filter((x): x is string => !!x))];
  const msgs = await db
    .select({
      orderId: messagesTable.orderId,
      contact: messagesTable.contact,
      channel: messagesTable.channel,
      direction: messagesTable.direction,
      read: messagesTable.read,
      intent: messagesTable.intent,
      body: messagesTable.body,
      status: messagesTable.status,
      createdAt: messagesTable.createdAt,
    })
    .from(messagesTable)
    .where(or(inArray(messagesTable.orderId, ids), contacts.length ? inArray(messagesTable.contact, contacts) : undefined))
    .orderBy(desc(messagesTable.createdAt))
    .limit(3000);
  return rows.map((r) => {
    const mine = msgs.filter((m) => m.orderId === r.id || (m.contact && (m.contact === r.phone || m.contact === r.email)));
    const inbound = mine.filter((m) => m.direction === "in");
    const last = inbound[0];
    return {
      ...r,
      conversation: {
        waIn: inbound.filter((m) => m.channel === "whatsapp").length,
        waUnread: inbound.filter((m) => m.channel === "whatsapp" && !m.read).length,
        emailIn: inbound.filter((m) => m.channel === "email").length,
        emailUnread: inbound.filter((m) => m.channel === "email" && !m.read).length,
        sent: mine.filter((m) => m.direction === "out").length,
        failed: mine.filter((m) => m.direction === "out" && m.status === "failed").length,
        complaint: inbound.some((m) => m.intent === "complaint"),
        lastIn: last ? { channel: last.channel, body: last.body.slice(0, 140), at: last.createdAt, intent: last.intent } : null,
      },
    };
  });
}

router.get("/orders/stats", async (req, res) => {
  const filters = baseFilters({ storeId: req.query.storeId });
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [s] = await db
    .select({
      today: sql<number>`count(*) filter (where ${o.createdAt} >= ${today})::int`,
      todayValue: sql<string>`coalesce(sum(${o.totalPrice}) filter (where ${o.createdAt} >= ${today}), 0)`,
      codToday: sql<number>`count(*) filter (where ${o.createdAt} >= ${today} and ${o.paymentMethod} = 'COD')::int`,
      pendingShip: sql<number>`count(*) filter (where ${ORDER_TABS.to_ship.where})::int`,
      toPickup: sql<number>`count(*) filter (where ${ORDER_TABS.to_pickup.where})::int`,
      complaints: sql<number>`count(*) filter (where ${ORDER_TABS.complaints.where})::int`,
      inTransit: sql<number>`count(*) filter (where ${ORDER_TABS.in_transit.where})::int`,
      ndr: sql<number>`count(*) filter (where ${ORDER_TABS.ndr.where})::int`,
      delivered30: sql<number>`count(*) filter (where ${o.srStatusCode} = 'delivered' and ${o.createdAt} >= now() - interval '30 days')::int`,
      rto30: sql<number>`count(*) filter (where ${o.srStatusCode} in ('rto','rto_delivered') and ${o.createdAt} >= now() - interval '30 days')::int`,
      unread: sql<number>`coalesce(sum(${o.unreadCount}), 0)::int`,
    })
    .from(o)
    .where(and(...filters));
  res.json(s);
});

/**
 * Page URLs use the Shopify order number (/orders/1040). Resolve it to our
 * internal id; ?store= disambiguates when two stores share a number.
 */
router.get("/orders/by-name/:name", async (req, res) => {
  const raw = decodeURIComponent(String(req.params.name)).replace(/^#/, "").trim();
  const storeId = req.query.store ? Number(req.query.store) : null;
  const rows = await db
    .select({ id: o.id, storeId: o.storeId, name: o.name })
    .from(o)
    .where(and(or(eq(o.name, `#${raw}`), eq(o.name, raw)), storeId ? eq(o.storeId, storeId) : undefined))
    .orderBy(desc(o.createdAt));
  if (rows.length === 0) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  res.json({ id: rows[0].id, matches: rows });
});

router.get("/orders/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [order] = await db.select().from(o).where(eq(o.id, id));
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  const [store] = await db.select({ id: storesTable.id, name: storesTable.name, color: storesTable.color, shopDomain: storesTable.shopDomain }).from(storesTable).where(eq(storesTable.id, order.storeId));
  const contacts = [order.phone, order.email].filter(Boolean) as string[];
  const messages = await db
    .select()
    .from(messagesTable)
    .where(or(eq(messagesTable.orderId, id), contacts.length ? inArray(messagesTable.contact, contacts) : undefined))
    .orderBy(asc(messagesTable.createdAt));
  const otherOrders = contacts.length
    ? await db
        .select({ id: o.id, storeId: o.storeId, name: o.name, createdAt: o.createdAt, totalPrice: o.totalPrice, srStatus: o.srStatus, srStatusCode: o.srStatusCode, cancelledAt: o.cancelledAt })
        .from(o)
        .where(and(ne(o.id, id), or(order.phone ? eq(o.phone, order.phone) : undefined, order.email ? eq(o.email, order.email) : undefined)))
        .orderBy(desc(o.createdAt))
        .limit(10)
    : [];
  const carts = order.phone
    ? await db
        .select({ id: checkoutsTable.id, source: checkoutsTable.source, createdAt: checkoutsTable.createdAt, status: checkoutsTable.status, totalPrice: checkoutsTable.totalPrice })
        .from(checkoutsTable)
        .where(eq(checkoutsTable.phone, order.phone))
        .orderBy(desc(checkoutsTable.createdAt))
        .limit(5)
    : [];
  const { raw, ...rest } = order;
  const r = (raw ?? {}) as Record<string, any>;
  res.json({
    ...rest,
    store,
    shopifyAdminUrl: store ? `https://${store.shopDomain}/admin/orders/${order.shopifyId}` : null,
    extra: {
      subtotal: r.subtotal_price,
      discounts: r.total_discounts,
      shipping: r.total_shipping_price_set?.shop_money?.amount,
      discountCodes: (r.discount_codes ?? []).map((d: any) => d.code),
      gateways: r.payment_gateway_names ?? [],
      sourceName: r.source_name,
      landingSite: r.landing_site,
      browserIp: r.browser_ip,
      noteAttributes: r.note_attributes ?? [],
    },
    insights: orderInsights(r),
    quality: (await assessMany([order.id])).get(order.id) ?? null,
    messages,
    otherOrders,
    carts,
  });
});

async function accountForStore(storeId: number) {
  const [s] = await db.select().from(storesTable).where(eq(storesTable.id, storeId));
  if (!s?.shiprocketAccountId) {
    const all = await db.select().from(shiprocketAccountsTable);
    if (all.length === 1) {
      await db.update(storesTable).set({ shiprocketAccountId: all[0].id }).where(eq(storesTable.id, storeId));
      return all[0];
    }
    throw new Error(all.length ? `Pick a Shiprocket account for "${s?.name}" in Settings → Shopify stores` : "Add your Shiprocket account in Settings → Shiprocket");
  }
  const [acc] = await db.select().from(shiprocketAccountsTable).where(eq(shiprocketAccountsTable.id, s.shiprocketAccountId));
  if (!acc) throw new Error("Linked Shiprocket account not found");
  return acc;
}

router.get("/orders/:id/tracking", async (req, res) => {
  const [order] = await db.select().from(o).where(eq(o.id, Number(req.params.id)));
  if (!order?.awb) {
    res.json(null);
    return;
  }
  try {
    res.json(await trackingTimeline(await accountForStore(order.storeId), order.awb));
  } catch (err) {
    res.json({ error: (err as Error).message, activities: [] });
  }
});

router.get("/orders/:id/couriers", async (req, res) => {
  const [order] = await db.select().from(o).where(eq(o.id, Number(req.params.id)));
  res.json(await courierOptions(await accountForStore(order.storeId), order));
});

router.patch("/orders/:id/address", async (req, res) => {
  // Local fix of the shipping address before pushing to Shiprocket
  const [order] = await db.select().from(o).where(eq(o.id, Number(req.params.id)));
  const addr = { ...(order.shippingAddress ?? {}), ...req.body };
  await db
    .update(o)
    .set({ shippingAddress: addr, addressIssue: checkAddress(addr), phone: normalizePhone(addr.phone) ?? order.phone })
    .where(eq(o.id, order.id));
  await addOrderEvent(order.id, "address", "Address edited", [addr.address1, addr.address2, addr.city, addr.zip].filter(Boolean).join(", "), "Dashboard");
  res.json({ ok: true });
});

/** Everything that happened to the order, newest first: Shopify, Shiprocket, messages, team notes. */
router.get("/orders/:id/timeline", async (req, res) => {
  const id = Number(req.params.id);
  const [order] = await db.select().from(o).where(eq(o.id, id));
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  const stored = await db.select().from(orderEventsTable).where(eq(orderEventsTable.orderId, id));
  const contacts = [order.phone, order.email].filter(Boolean) as string[];
  const msgs = await db
    .select()
    .from(messagesTable)
    .where(or(eq(messagesTable.orderId, id), contacts.length ? inArray(messagesTable.contact, contacts) : undefined));
  const items = [
    ...derivedEvents(order.raw as Record<string, unknown>, order.createdAt).map((e, i) => ({ id: `d${i}`, ...e, author: null as string | null })),
    ...stored.map((e) => ({ id: `e${e.id}`, type: e.type, title: e.title, detail: e.detail, author: e.author, createdAt: e.createdAt })),
    ...msgs
      .filter((m) => m.createdAt >= new Date(order.createdAt.getTime() - 7 * 86400_000))
      .map((m) => ({
        id: `m${m.id}`,
        type: m.channel === "email" ? "email" : "whatsapp",
        title:
          m.direction === "in"
            ? `Customer replied on ${m.channel === "email" ? "email" : "WhatsApp"}`
            : `${m.channel === "email" ? "Email" : "WhatsApp"} ${m.status === "failed" ? "failed" : "sent"}${m.source?.startsWith("automation") ? " (automation)" : m.source === "bulk" ? " (bulk)" : ""}`,
        detail: (m.subject ? `${m.subject}: ` : "") + m.body.slice(0, 160),
        author: m.direction === "in" ? m.contactName : null,
        createdAt: m.createdAt,
      })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json(items);
});

router.post("/orders/:id/notes", async (req, res) => {
  const text = String(req.body?.text ?? "").trim();
  if (!text) {
    res.status(400).json({ error: "Note is empty" });
    return;
  }
  await addOrderEvent(Number(req.params.id), "note", "Team note", text.slice(0, 2000), String(req.body?.author ?? "Team").slice(0, 60));
  res.json({ ok: true });
});

router.put("/orders/:id/recording", async (req, res) => {
  const url = String(req.body?.url ?? "").trim();
  if (url && !/^https?:\/\//.test(url)) {
    res.status(400).json({ error: "Paste a full link starting with https://" });
    return;
  }
  const id = Number(req.params.id);
  await db.update(o).set({ recordingUrl: url || null }).where(eq(o.id, id));
  await addOrderEvent(id, "recording", url ? "Recording linked" : "Recording removed", url || null, "Dashboard");
  res.json({ ok: true });
});

function readPackage(src: Record<string, unknown>): PackageInput | undefined {
  const n = (k: string) => Number(src[k]);
  if (![n("weight"), n("length"), n("breadth"), n("height")].every((v) => Number.isFinite(v) && v > 0)) return undefined;
  return { weight: n("weight"), length: n("length"), breadth: n("breadth"), height: n("height") };
}

/** Package defaults + courier quotes for the Ship dialog. */
router.get("/orders/:id/ship-options", async (req, res) => {
  const [order] = await db.select().from(o).where(eq(o.id, Number(req.params.id)));
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  try {
    const acc = await accountForStore(order.storeId);
    const pkg = readPackage(req.query as Record<string, unknown>) ?? defaultPackage(acc, order);
    const couriers = await courierOptions(acc, order, pkg);
    res.json({ package: pkg, couriers, pickupLocation: acc.pickupLocation, autoPickup: acc.autoPickup, account: acc.name });
  } catch (err) {
    res.json({ error: (err as Error).message, couriers: [] });
  }
});

/** One click: create → AWB (chosen courier) → pickup → label. */
router.post("/orders/:id/ship", async (req, res) => {
  const [order] = await db.select().from(o).where(eq(o.id, Number(req.params.id)));
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  if (order.cancelledAt) {
    res.status(400).json({ error: "Order is cancelled in Shopify" });
    return;
  }
  try {
    const acc = await accountForStore(order.storeId);
    const b = req.body ?? {};
    const shipped = await shipOrder(acc, order, {
        courierId: b.courierId ? Number(b.courierId) : undefined,
        pkg: readPackage(b.package ?? {}),
        pickup: b.pickup !== undefined ? !!b.pickup : undefined,
        label: b.label !== undefined ? !!b.label : true,
    });
    if (shipped.awb) await fulfillPending([order.id]).catch(() => {});
    res.json(shipped);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

router.post("/orders/:id/ndr", async (req, res) => {
  const [order] = await db.select().from(o).where(eq(o.id, Number(req.params.id)));
  const action = req.body?.action === "return" ? "return" : "re-attempt";
  try {
    await ndrAction(await accountForStore(order.storeId), order, action, String(req.body?.comment ?? ""));
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

router.patch("/orders/:id/complaint", async (req, res) => {
  const id = Number(req.params.id);
  const status = req.body?.status === "open" ? "open" : req.body?.status === "resolved" ? "resolved" : null;
  await db.update(o).set({ complaintStatus: status, ...(status === "open" ? { complaintAt: new Date() } : {}) }).where(eq(o.id, id));
  await addOrderEvent(id, "complaint", status === "resolved" ? "Complaint resolved" : status === "open" ? "Marked as complaint" : "Complaint flag removed", req.body?.note ?? null, "Dashboard");
  res.json({ ok: true });
});

/** Bulk Shiprocket action; orders are grouped by their store's Shiprocket account. */
router.post("/orders/shiprocket", async (req, res) => {
  const action = String(req.body?.action ?? "");
  const ids = (req.body?.orderIds ?? []).map(Number) as number[];
  const courierId = req.body?.courierId ? Number(req.body.courierId) : undefined;
  if (!ids.length) {
    res.status(400).json({ error: "No orders selected" });
    return;
  }
  const orders = await db.select().from(o).where(inArray(o.id, ids));
  const byStore = new Map<number, Order[]>();
  for (const ord of orders) byStore.set(ord.storeId, [...(byStore.get(ord.storeId) ?? []), ord]);

  const results: ActionResult[] = [];
  const files: { label: string; url: string }[] = [];
  for (const [storeId, group] of byStore) {
    let acc;
    try {
      acc = await accountForStore(storeId);
    } catch (err) {
      for (const g of group) results.push({ orderId: g.id, name: g.name, ok: false, message: (err as Error).message });
      continue;
    }
    if (action === "ship") {
      const shipped: Order[] = [];
      for (const g of group) {
        if (g.cancelledAt) {
          results.push({ orderId: g.id, name: g.name, ok: false, message: "Cancelled in Shopify" });
          continue;
        }
        const r = await shipOrder(acc, g, { label: false });
        const failed = r.steps.find((x) => !x.ok);
        results.push({ orderId: g.id, name: g.name, ok: r.ok, message: failed ? failed.message : `AWB ${r.awb} · ${r.courier}` });
        if (r.ok) shipped.push((await db.select().from(o).where(eq(o.id, g.id)))[0]);
      }
      if (shipped.length) {
        try {
          const lab = await bulkShipmentAction(acc, shipped, "label");
          if (lab.url) files.push({ label: `labels (${shipped.length})`, url: lab.url });
        } catch {
          /* labels can be fetched later */
        }
      }
      continue;
    }
    if (action === "push" || action === "awb") {
      for (const g of group) {
        try {
          let msg = "";
          if (action === "push") {
            if (g.srOrderId) msg = "Already in Shiprocket";
            else if (g.cancelledAt) throw new Error("Order is cancelled");
            else msg = await createShiprocketOrder(acc, g);
          } else {
            if (g.awb) msg = `Already has AWB ${g.awb}`;
            else {
              if (!g.srOrderId) {
                await createShiprocketOrder(acc, g);
                [g.srShipmentId] = (await db.select({ s: o.srShipmentId }).from(o).where(eq(o.id, g.id))).map((r) => r.s);
              }
              msg = await assignAwb(acc, g, courierId);
            }
          }
          results.push({ orderId: g.id, name: g.name, ok: true, message: msg });
        } catch (err) {
          results.push({ orderId: g.id, name: g.name, ok: false, message: (err as Error).message });
        }
      }
    } else if (["pickup", "label", "manifest", "invoice"].includes(action)) {
      try {
        const r = await bulkShipmentAction(acc, group, action as "pickup" | "label" | "manifest" | "invoice");
        if (r.url) files.push({ label: `${action} (${group.length})`, url: r.url });
        for (const g of group) results.push({ orderId: g.id, name: g.name, ok: !!g.srShipmentId, message: g.srShipmentId ? String(r.message) : "No shipment in Shiprocket" });
      } catch (err) {
        for (const g of group) results.push({ orderId: g.id, name: g.name, ok: false, message: (err as Error).message });
      }
    } else if (action === "cancel") {
      try {
        const m = await cancelShiprocketOrders(acc, group);
        for (const g of group) results.push({ orderId: g.id, name: g.name, ok: !!g.srOrderId, message: g.srOrderId ? m : "Not in Shiprocket" });
      } catch (err) {
        for (const g of group) results.push({ orderId: g.id, name: g.name, ok: false, message: (err as Error).message });
      }
    } else {
      res.status(400).json({ error: `Unknown action ${action}` });
      return;
    }
  }
  if (["ship", "awb"].includes(action)) await fulfillPending(results.filter((r) => r.ok).map((r) => r.orderId)).catch(() => {});
  res.json({ results, files });
});

router.post("/orders/:id/fulfill-shopify", async (req, res) => {
  res.json(await retryFulfillment(Number(req.params.id)));
});

/** Ask the customer to confirm the address or the COD order on WhatsApp. A "YES" reply marks it confirmed. */
router.post("/orders/:id/confirm", async (req, res) => {
  const [order] = await db.select().from(o).where(eq(o.id, Number(req.params.id)));
  if (!order?.phone) {
    res.status(400).json({ error: "No phone number on this order" });
    return;
  }
  const first = (order.customerName ?? "").split(" ")[0] || "there";
  const a = order.shippingAddress ?? {};
  const addr = [a.address1, a.address2, a.city, a.province, a.zip].filter(Boolean).join(", ");
  const item = order.lineItems[0];
  const text =
    req.body?.kind === "address"
      ? `Hi ${first}, this is about your order ${order.name}. Please confirm your delivery address:\n\n${addr}\n\nReply YES if it is correct, or send the full address with house/flat number and a landmark.`
      : `Hi ${first}, thank you for your order ${order.name}${item ? ` (${item.title})` : ""} of ₹${Math.round(Number(order.totalPrice))} on Cash on Delivery.\n\nPlease reply YES to confirm so we can ship it today, or NO to cancel.`;
  try {
    await sendWhatsApp({ storeId: order.storeId, to: order.phone, contactName: order.customerName, text, orderId: order.id, source: "confirm" });
    await addOrderEvent(order.id, "note", req.body?.kind === "address" ? "Asked customer to confirm address" : "Asked customer to confirm COD", null, "Dashboard");
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

/** CSV export of the current filter (opens in Excel / Google Sheets). */
router.get("/orders-export.csv", async (req, res) => {
  const q = req.query as Record<string, string>;
  const tab = ORDER_TABS[q.tab ?? "all"] ?? ORDER_TABS.all;
  const rows = await db.select().from(o).where(and(...baseFilters(q), tab.where)).orderBy(desc(o.createdAt)).limit(5000);
  const stores = new Map((await db.select().from(storesTable)).map((s) => [s.id, s.name]));
  const header = ["Order", "Store", "Created", "Status", "Payment", "Total", "Qty", "Products", "SKUs", "Customer", "Phone", "Email", "Address 1", "Address 2", "City", "State", "PIN", "Address issue", "Shiprocket status", "AWB", "Courier", "WhatsApp", "Tags"];
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = rows.map((r) =>
    [
      r.name,
      stores.get(r.storeId),
      r.createdAt.toISOString(),
      r.cancelledAt ? "cancelled" : r.fulfillmentStatus,
      r.paymentMethod,
      r.totalPrice,
      r.itemCount,
      r.lineItems.map((i) => [i.title, i.variantTitle].filter(Boolean).join(" - ")).join(" | "),
      r.lineItems.map((i) => i.sku).join(" | "),
      r.customerName,
      r.phone,
      r.email,
      r.shippingAddress?.address1,
      r.shippingAddress?.address2,
      r.shippingAddress?.city,
      r.shippingAddress?.province,
      r.shippingAddress?.zip,
      r.addressIssue,
      r.srStatus,
      r.awb,
      r.courier,
      r.lastWaStatus,
      r.tags,
    ]
      .map(esc)
      .join(","),
  );
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="orders-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send("﻿" + [header.map(esc).join(","), ...lines].join("\n"));
});

export default router;
