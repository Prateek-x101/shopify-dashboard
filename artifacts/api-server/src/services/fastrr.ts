import { db, checkoutsTable, type Store, type LineItem } from "@workspace/db";
import { sql } from "drizzle-orm";
import { normalizeEmail, normalizePhone } from "../lib/contact";

type Json = Record<string, any>;

/** Depth-first lookup of the first non-empty value for any of the given keys. */
function pick(obj: unknown, keys: string[], depth = 0): any {
  if (!obj || typeof obj !== "object" || depth > 4) return undefined;
  for (const k of keys) {
    const v = (obj as Json)[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  for (const v of Object.values(obj as Json)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const found = pick(v, keys, depth + 1);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

function items(payload: Json): LineItem[] {
  const arr: Json[] = pick(payload, ["items", "line_items", "cart_items", "products"]) ?? [];
  if (!Array.isArray(arr)) return [];
  return arr.map((i) => ({
    title: i.title ?? i.name ?? i.product_name ?? "Item",
    variantTitle: i.variant_title ?? i.variant_name ?? null,
    sku: i.sku ?? null,
    quantity: Number(i.quantity ?? i.qty ?? 1),
    price: String(i.price ?? i.selling_price ?? i.final_price ?? "0"),
    imageUrl: i.image ?? i.image_url ?? i.img_url ?? i.product_image ?? null,
    productId: i.product_id ? String(i.product_id) : null,
    variantId: i.variant_id ? String(i.variant_id) : null,
  }));
}

/**
 * Shiprocket Checkout (Fastrr) abandoned-cart webhook. The payload shape has
 * varied over time, so fields are looked up by their known aliases.
 */
export async function ingestFastrrCart(store: Store, payload: Json) {
  const cartId = String(pick(payload, ["cart_id", "cartId", "id", "checkout_id", "token"]) ?? `fastrr-${Date.now()}`);
  const first = pick(payload, ["first_name", "firstName"]) ?? "";
  const last = pick(payload, ["last_name", "lastName"]) ?? "";
  const name = pick(payload, ["customer_name", "full_name", "name"]) ?? [first, last].filter(Boolean).join(" ");
  const lineItems = items(payload);
  const total = pick(payload, ["total_price", "cart_total", "total", "amount", "grand_total"]) ??
    lineItems.reduce((s, i) => s + Number(i.price) * i.quantity, 0);
  const statusRaw = String(pick(payload, ["status", "cart_status", "order_status"]) ?? "").toLowerCase();
  const orderPlaced = /complete|placed|success|converted|ordered/.test(statusRaw) || !!pick(payload, ["order_id", "shopify_order_id"]);
  const created = pick(payload, ["created_at", "createdAt", "cart_created_at"]);
  const domain = store.publicDomain || store.shopDomain;
  const checkoutUrl =
    pick(payload, ["checkout_url", "cart_url", "abandoned_checkout_url", "recovery_url"]) ??
    `https://${domain.replace(/^https?:\/\//, "")}/?cart-resume-id=${cartId}`;

  const row = {
    storeId: store.id,
    source: "fastrr" as const,
    externalId: cartId,
    name: `FR-${cartId.slice(-6).toUpperCase()}`,
    createdAt: created ? new Date(created) : new Date(),
    updatedAt: new Date(),
    completedAt: orderPlaced ? new Date() : null,
    customerName: name || null,
    email: normalizeEmail(pick(payload, ["email", "customer_email"])),
    phone: normalizePhone(pick(payload, ["phone", "phone_number", "mobile", "customer_phone", "contact"])),
    shippingAddress: {
      name: name || null,
      address1: pick(payload, ["address1", "address_line_1", "line1", "address"]) ?? null,
      address2: pick(payload, ["address2", "address_line_2", "line2"]) ?? null,
      city: pick(payload, ["city"]) ?? null,
      province: pick(payload, ["state", "province"]) ?? null,
      zip: pick(payload, ["pincode", "zip", "postal_code", "pin"]) ? String(pick(payload, ["pincode", "zip", "postal_code", "pin"])) : null,
      country: "India",
    },
    lineItems,
    totalPrice: String(total ?? 0),
    currency: "INR",
    checkoutUrl,
    stage: pick(payload, ["abandoned_status", "latest_stage", "stage", "journey"]) ?? null,
    raw: payload,
  };

  // Later events (e.g. "order placed") often carry only the cart id + status:
  // keep what we already know unless the new payload has a value.
  const keep = (col: string) => sql.raw(`coalesce(excluded.${col}, checkouts.${col})`);
  const hasAddress = !!(row.shippingAddress.address1 || row.shippingAddress.city || row.shippingAddress.zip);
  await db
    .insert(checkoutsTable)
    .values({ ...row, status: orderPlaced ? "recovered" : "abandoned" })
    .onConflictDoUpdate({
      target: [checkoutsTable.storeId, checkoutsTable.source, checkoutsTable.externalId],
      set: {
        updatedAt: row.updatedAt,
        completedAt: keep("completed_at"),
        customerName: keep("customer_name"),
        email: keep("email"),
        phone: keep("phone"),
        stage: keep("stage"),
        checkoutUrl: keep("checkout_url"),
        ...(hasAddress ? { shippingAddress: row.shippingAddress } : {}),
        ...(lineItems.length ? { lineItems, totalPrice: row.totalPrice } : {}),
        raw: payload,
        status: orderPlaced ? sql`'recovered'` : checkoutsTable.status,
      },
    });
  return cartId;
}
