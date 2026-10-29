import { db, ordersTable, checkoutsTable, storesTable, type Store, type LineItem, type PostalAddress } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { addOrderEvent } from "../lib/order-insights";
import { SHOPIFY_API_VERSION } from "../config";
import { logger } from "../lib/logger";
import { normalizePhone, normalizeEmail, checkAddress } from "../lib/contact";

type Json = Record<string, any>;

function cleanDomain(domain: string) {
  return domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").trim();
}

export async function shopifyRequest(store: Pick<Store, "shopDomain" | "accessToken">, pathOrUrl: string, init: RequestInit = {}) {
  const url = pathOrUrl.startsWith("http")
    ? pathOrUrl
    : `https://${cleanDomain(store.shopDomain)}/admin/api/${SHOPIFY_API_VERSION}${pathOrUrl}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, {
      ...init,
      headers: {
        "X-Shopify-Access-Token": store.accessToken,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    if (res.status === 429) {
      const wait = Number(res.headers.get("Retry-After") ?? "2") * 1000;
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Shopify ${res.status}: ${text.slice(0, 300)}`);
    }
    return { body: (await res.json()) as Json, link: res.headers.get("Link") };
  }
  throw new Error("Shopify rate limit: too many retries");
}

function nextLink(link: string | null): string | null {
  if (!link) return null;
  for (const part of link.split(",")) {
    const m = part.match(/<([^>]+)>;\s*rel="next"/);
    if (m) return m[1];
  }
  return null;
}

export async function testShopify(store: Pick<Store, "shopDomain" | "accessToken">) {
  const { body } = await shopifyRequest(store, "/shop.json");
  return { name: body.shop?.name as string, domain: body.shop?.domain as string, currency: body.shop?.currency as string };
}

/* ── product images (REST line items have no image) ─────────────── */
const imageCache = new Map<string, string | null>(); // key: storeId:productId:variantId

async function attachImages(store: Store, items: LineItem[]) {
  const missing = [...new Set(items.filter((i) => i.productId && !imageCache.has(`${store.id}:${i.productId}:${i.variantId}`)).map((i) => i.productId!))];
  for (let i = 0; i < missing.length; i += 50) {
    const ids = missing.slice(i, i + 50).join(",");
    try {
      const { body } = await shopifyRequest(store, `/products.json?ids=${ids}&fields=id,image,images,variants&limit=50`);
      for (const p of body.products ?? []) {
        const images: Json[] = p.images ?? [];
        const fallback = p.image?.src ?? images[0]?.src ?? null;
        imageCache.set(`${store.id}:${p.id}:undefined`, fallback);
        imageCache.set(`${store.id}:${p.id}:null`, fallback);
        for (const v of p.variants ?? []) {
          const vImg = v.image_id ? images.find((im) => im.id === v.image_id)?.src : null;
          imageCache.set(`${store.id}:${p.id}:${v.id}`, vImg ?? fallback);
        }
      }
    } catch (err) {
      logger.warn({ err: (err as Error).message, store: store.name }, "product image fetch failed");
    }
    for (const id of missing.slice(i, i + 50)) {
      // remember misses (deleted products) so we do not refetch every cycle
      for (const it of items.filter((x) => x.productId === id)) {
        const k = `${store.id}:${id}:${it.variantId}`;
        if (!imageCache.has(k)) imageCache.set(k, imageCache.get(`${store.id}:${id}:null`) ?? null);
      }
    }
  }
  for (const it of items) {
    if (!it.imageUrl && it.productId) it.imageUrl = imageCache.get(`${store.id}:${it.productId}:${it.variantId}`) ?? null;
  }
}

function mapLineItems(raw: Json[] | undefined): LineItem[] {
  return (raw ?? []).map((li) => ({
    id: li.id ? String(li.id) : undefined,
    title: li.title ?? li.name ?? "Item",
    variantTitle: li.variant_title || null,
    sku: li.sku || null,
    quantity: Number(li.quantity ?? 1),
    price: String(li.price ?? "0"),
    imageUrl: li.image_url ?? li.image?.src ?? null,
    productId: li.product_id ? String(li.product_id) : null,
    variantId: li.variant_id ? String(li.variant_id) : null,
  }));
}

function mapAddress(a: Json | null | undefined): PostalAddress | null {
  if (!a) return null;
  return {
    name: a.name ?? [a.first_name, a.last_name].filter(Boolean).join(" ") ?? null,
    address1: a.address1 ?? null,
    address2: a.address2 ?? null,
    city: a.city ?? null,
    province: a.province ?? null,
    zip: a.zip ?? null,
    country: a.country ?? null,
    phone: a.phone ?? null,
  };
}

export function detectPaymentMethod(o: Json): "COD" | "Prepaid" {
  const gateways = [...(o.payment_gateway_names ?? []), o.gateway ?? ""].join(" ").toLowerCase();
  if (/cod|cash/.test(gateways)) return "COD";
  if ((o.tags ?? "").toLowerCase().split(/,\s*/).includes("cod")) return "COD";
  if (["paid", "partially_refunded", "refunded", "partially_paid"].includes(o.financial_status)) return "Prepaid";
  return o.financial_status === "pending" ? "COD" : "Prepaid";
}

export async function upsertShopifyOrder(store: Store, o: Json) {
  const ship = mapAddress(o.shipping_address) ?? mapAddress(o.billing_address);
  const items = mapLineItems(o.line_items);
  await attachImages(store, items);
  const customerName =
    ship?.name ||
    [o.customer?.first_name, o.customer?.last_name].filter(Boolean).join(" ") ||
    null;
  const row = {
    storeId: store.id,
    shopifyId: String(o.id),
    name: o.name ?? `#${o.order_number}`,
    orderNumber: o.order_number ?? null,
    createdAt: new Date(o.created_at),
    updatedAt: new Date(o.updated_at ?? o.created_at),
    cancelledAt: o.cancelled_at ? new Date(o.cancelled_at) : null,
    closedAt: o.closed_at ? new Date(o.closed_at) : null,
    financialStatus: o.financial_status ?? null,
    fulfillmentStatus: o.fulfillment_status ?? "unfulfilled",
    paymentMethod: detectPaymentMethod(o),
    totalPrice: String(o.total_price ?? "0"),
    currency: o.currency ?? "INR",
    tags: o.tags ?? "",
    note: o.note ?? null,
    customerName,
    email: normalizeEmail(o.email ?? o.contact_email ?? o.customer?.email),
    phone: normalizePhone(ship?.phone ?? o.phone ?? o.customer?.phone ?? o.billing_address?.phone),
    shippingAddress: ship,
    lineItems: items,
    itemCount: items.reduce((s, i) => s + i.quantity, 0),
    addressIssue: checkAddress(ship),
    raw: o,
    syncedAt: new Date(),
  };
  const [prev] = await db
    .select({ financialStatus: ordersTable.financialStatus, fulfillmentStatus: ordersTable.fulfillmentStatus, cancelledAt: ordersTable.cancelledAt, addressIssue: ordersTable.addressIssue })
    .from(ordersTable)
    .where(and(eq(ordersTable.storeId, store.id), eq(ordersTable.shopifyId, row.shopifyId)));
  // A locally fixed address must survive the next Shopify sync
  const { shippingAddress: _a, addressIssue: _i, ...withoutAddress } = row;
  const keepLocalAddress = prev && prev.addressIssue === null && row.addressIssue !== null;
  const [saved] = await db
    .insert(ordersTable)
    .values(row)
    .onConflictDoUpdate({
      target: [ordersTable.storeId, ordersTable.shopifyId],
      set: keepLocalAddress ? withoutAddress : { ...row },
    })
    .returning({ id: ordersTable.id, createdAt: ordersTable.createdAt, phone: ordersTable.phone, email: ordersTable.email });
  if (prev) {
    if (prev.financialStatus !== row.financialStatus && row.financialStatus) {
      await addOrderEvent(saved.id, "payment", `Payment ${row.financialStatus.replace(/_/g, " ")}`, prev.financialStatus ? `was ${prev.financialStatus.replace(/_/g, " ")}` : null);
    }
    if (prev.fulfillmentStatus !== row.fulfillmentStatus && row.fulfillmentStatus) {
      await addOrderEvent(saved.id, "fulfillment", `Shopify: ${row.fulfillmentStatus}`, prev.fulfillmentStatus ? `was ${prev.fulfillmentStatus}` : null);
    }
    if (!prev.cancelledAt && row.cancelledAt) await addOrderEvent(saved.id, "cancelled", "Order cancelled in Shopify", o.cancel_reason ?? null);
  }
  return saved;
}

/** Incremental sync by updated_at. First run pulls the last `initialDays` days. */
export async function syncStoreOrders(store: Store, initialDays = 60) {
  const since = store.lastOrderSyncAt
    ? new Date(store.lastOrderSyncAt.getTime() - 5 * 60_000)
    : new Date(Date.now() - initialDays * 86400_000);
  const startedAt = new Date();
  let url: string | null =
    `/orders.json?status=any&limit=250&updated_at_min=${encodeURIComponent(since.toISOString())}`;
  let count = 0;
  const saved: { id: number; createdAt: Date; phone: string | null; email: string | null }[] = [];
  while (url) {
    const { body, link } = await shopifyRequest(store, url);
    for (const o of body.orders ?? []) {
      saved.push(await upsertShopifyOrder(store, o));
      count++;
    }
    url = nextLink(link);
  }
  await db.update(storesTable).set({ lastOrderSyncAt: startedAt, lastError: null }).where(eq(storesTable.id, store.id));
  await markRecoveredCheckouts(store.id, saved);
  return count;
}

/* ── abandoned checkouts ──────────────────────────────────────────── */
export async function syncStoreCheckouts(store: Store, initialDays = 14) {
  const since = store.lastCheckoutSyncAt
    ? new Date(store.lastCheckoutSyncAt.getTime() - 5 * 60_000)
    : new Date(Date.now() - initialDays * 86400_000);
  const startedAt = new Date();
  let url: string | null =
    `/checkouts.json?limit=250&updated_at_min=${encodeURIComponent(since.toISOString())}`;
  let count = 0;
  while (url) {
    const { body, link } = await shopifyRequest(store, url);
    for (const c of body.checkouts ?? []) {
      await upsertShopifyCheckout(store, c);
      count++;
    }
    url = nextLink(link);
  }
  await db.update(storesTable).set({ lastCheckoutSyncAt: startedAt }).where(eq(storesTable.id, store.id));
  return count;
}

async function upsertShopifyCheckout(store: Store, c: Json) {
  const ship = mapAddress(c.shipping_address) ?? mapAddress(c.billing_address);
  const items = mapLineItems(c.line_items);
  await attachImages(store, items);
  const row = {
    storeId: store.id,
    source: "shopify" as const,
    externalId: String(c.id ?? c.token),
    name: c.name ?? null,
    createdAt: new Date(c.created_at),
    updatedAt: new Date(c.updated_at ?? c.created_at),
    completedAt: c.completed_at ? new Date(c.completed_at) : null,
    customerName: ship?.name || [c.customer?.first_name, c.customer?.last_name].filter(Boolean).join(" ") || null,
    email: normalizeEmail(c.email ?? c.customer?.email),
    phone: normalizePhone(ship?.phone ?? c.phone ?? c.customer?.phone ?? c.billing_address?.phone),
    shippingAddress: ship,
    lineItems: items,
    totalPrice: String(c.total_price ?? "0"),
    currency: c.currency ?? c.presentment_currency ?? "INR",
    checkoutUrl: c.abandoned_checkout_url ?? null,
    raw: c,
  };
  const { raw: _raw, ...updatable } = row;
  await db
    .insert(checkoutsTable)
    .values(row)
    .onConflictDoUpdate({
      target: [checkoutsTable.storeId, checkoutsTable.source, checkoutsTable.externalId],
      set: {
        ...updatable,
        raw: c,
        status: c.completed_at ? sql`'recovered'` : checkoutsTable.status,
      },
    });
}

/** A new order from the same phone/email shortly after an abandoned cart = recovered. */
export async function markRecoveredCheckouts(
  storeId: number,
  orders: { id: number; createdAt: Date; phone: string | null; email: string | null }[],
) {
  for (const o of orders) {
    if (!o.phone && !o.email) continue;
    await db.execute(sql`
      UPDATE checkouts SET status = 'recovered', recovered_order_id = ${o.id}
      WHERE store_id = ${storeId}
        AND status IN ('abandoned', 'replied')
        AND created_at <= ${o.createdAt}
        AND created_at >= ${new Date(o.createdAt.getTime() - 7 * 86400_000)}
        AND ((${o.phone}::text IS NOT NULL AND phone = ${o.phone}) OR (${o.email}::text IS NOT NULL AND email = ${o.email}))
    `);
  }
}

/** Register order webhooks so new orders appear instantly (needs a public URL). */
export async function registerShopifyWebhooks(store: Store, publicUrl: string) {
  const address = `${publicUrl.replace(/\/$/, "")}/api/webhooks/shopify/${store.id}`;
  const { body } = await shopifyRequest(store, "/webhooks.json");
  const existing: Json[] = body.webhooks ?? [];
  const topics = ["orders/create", "orders/updated", "checkouts/create", "checkouts/update"];
  const results: string[] = [];
  for (const topic of topics) {
    const same = existing.find((w) => w.topic === topic);
    if (same && same.address === address) {
      results.push(`${topic}: already set`);
      continue;
    }
    if (same) await shopifyRequest(store, `/webhooks/${same.id}.json`, { method: "DELETE" });
    await shopifyRequest(store, "/webhooks.json", {
      method: "POST",
      body: JSON.stringify({ webhook: { topic, address, format: "json" } }),
    });
    results.push(`${topic}: registered`);
  }
  return results;
}

export { upsertShopifyCheckout };
