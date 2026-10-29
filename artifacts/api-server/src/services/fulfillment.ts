import { db, ordersTable, storesTable, type Order, type Store } from "@workspace/db";
import { and, eq, inArray, isNotNull, isNull, ne, or } from "drizzle-orm";
import { shopifyRequest } from "../integrations/shopify";
import { addOrderEvent } from "../lib/order-insights";
import { logger } from "../lib/logger";

type Json = Record<string, any>;

/** Shopify recognises these names and links tracking itself; anything else still gets our URL. */
function trackingCompany(courier: string | null) {
  const c = (courier ?? "").toLowerCase();
  if (c.includes("delhivery")) return "Delhivery";
  if (c.includes("blue dart") || c.includes("bluedart")) return "Bluedart";
  if (c.includes("dtdc")) return "DTDC";
  if (c.includes("xpressbees")) return "Xpressbees";
  if (c.includes("ecom")) return "Ecom Express";
  if (c.includes("shadowfax")) return "Shadowfax";
  if (c.includes("ekart")) return "Ekart";
  if (c.includes("india post")) return "India Post";
  return courier ?? "Shiprocket";
}

/**
 * Create the Shopify fulfillment for an order shipped through Shiprocket:
 * every open fulfillment order, with the AWB, courier and tracking link.
 * Delivered / RTO orders are fulfilled silently (no "shipped" email after the fact).
 */
export async function fulfillInShopify(store: Store, o: Order) {
  if (!o.awb) throw new Error("No AWB yet");
  const { body } = await shopifyRequest(store, `/orders/${o.shopifyId}/fulfillment_orders.json`);
  const open = ((body.fulfillment_orders ?? []) as Json[]).filter(
    (f) => ["open", "in_progress", "scheduled"].includes(f.status) && (f.supported_actions ?? []).includes("create_fulfillment"),
  );
  if (open.length === 0) {
    // already fulfilled in Shopify (by hand or another app): just record it
    return { alreadyFulfilled: true };
  }
  const late = ["delivered", "rto", "rto_delivered"].includes(o.srStatusCode ?? "");
  const trackUrl = o.srMeta?.trackUrl || `https://shiprocket.co/tracking/${o.awb}`;
  await shopifyRequest(store, "/fulfillments.json", {
    method: "POST",
    body: JSON.stringify({
      fulfillment: {
        line_items_by_fulfillment_order: open.map((f) => ({ fulfillment_order_id: f.id })),
        tracking_info: { number: o.awb, company: trackingCompany(o.courier), url: trackUrl },
        notify_customer: store.notifyOnFulfill && !late,
      },
    }),
  });
  return { alreadyFulfilled: false, notified: store.notifyOnFulfill && !late };
}

function friendly(err: unknown) {
  const m = (err as Error).message ?? String(err);
  if (/\b403\b|access|scope|denied/i.test(m)) {
    return "Shopify app needs permission: add the scopes write_merchant_managed_fulfillment_orders, write_third_party_fulfillment_orders and write_fulfillments, then reinstall the app";
  }
  return m.slice(0, 300);
}

/** Fulfil shipped-but-unfulfilled orders (all, or the given ids). Runs every minute. */
export async function fulfillPending(orderIds?: number[]) {
  const rows = await db
    .select()
    .from(ordersTable)
    .where(
      and(
        orderIds ? inArray(ordersTable.id, orderIds) : undefined,
        isNotNull(ordersTable.awb),
        isNull(ordersTable.cancelledAt),
        isNull(ordersTable.shopifyFulfilledAt),
        // retry failed ones only when asked for explicitly
        orderIds ? undefined : isNull(ordersTable.shopifyFulfillError),
        or(isNull(ordersTable.fulfillmentStatus), ne(ordersTable.fulfillmentStatus, "fulfilled")),
        or(isNull(ordersTable.srStatusCode), ne(ordersTable.srStatusCode, "cancelled")),
      ),
    )
    .limit(20);
  if (rows.length === 0) return 0;
  const stores = new Map((await db.select().from(storesTable)).map((s) => [s.id, s]));
  let done = 0;
  for (const o of rows) {
    const store = stores.get(o.storeId);
    // paused stores get no writes to Shopify
    if (!store?.fulfillInShopify || !store.active) continue;
    try {
      const r = await fulfillInShopify(store, o);
      await db
        .update(ordersTable)
        .set({ shopifyFulfilledAt: new Date(), shopifyFulfillError: null, fulfillmentStatus: "fulfilled" })
        .where(eq(ordersTable.id, o.id));
      await addOrderEvent(
        o.id,
        "fulfillment",
        r.alreadyFulfilled ? "Already fulfilled in Shopify" : "Fulfilled in Shopify with tracking",
        r.alreadyFulfilled ? null : `${o.courier ?? ""} · AWB ${o.awb}${r.notified ? " · customer emailed" : ""}`,
        "Dashboard",
      );
      done++;
    } catch (err) {
      const message = friendly(err);
      await db.update(ordersTable).set({ shopifyFulfillError: message }).where(eq(ordersTable.id, o.id));
      await addOrderEvent(o.id, "fulfillment", "Shopify fulfillment failed", message, "Dashboard");
      logger.warn({ order: o.name, err: message }, "shopify fulfillment failed");
    }
  }
  return done;
}

/** Manual retry from the order page. */
export async function retryFulfillment(orderId: number) {
  await db.update(ordersTable).set({ shopifyFulfillError: null }).where(eq(ordersTable.id, orderId));
  await fulfillPending([orderId]);
  const [o] = await db.select({ at: ordersTable.shopifyFulfilledAt, err: ordersTable.shopifyFulfillError }).from(ordersTable).where(eq(ordersTable.id, orderId));
  return o;
}
