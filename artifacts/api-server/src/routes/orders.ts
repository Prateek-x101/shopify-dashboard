import { Router } from "express";
import {
  ListOrdersQueryParams,
  GetOrderParams,
} from "@workspace/api-zod";

const router = Router();

const SHOPIFY_STORE = process.env.SHOPIFY_STORE_URL ?? "fccevc-p1.myshopify.com";
const SHOPIFY_TOKEN = process.env.SHOPIFY_CUSTOM_APP_ACCESS_TOKEN ?? "";
const SHOPIFY_API_VERSION = "2024-01";

function shopifyUrl(path: string) {
  return `https://${SHOPIFY_STORE}/admin/api/${SHOPIFY_API_VERSION}${path}`;
}

async function shopifyFetch(path: string) {
  const res = await fetch(shopifyUrl(path), {
    headers: {
      "X-Shopify-Access-Token": SHOPIFY_TOKEN,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify API error ${res.status}: ${text}`);
  }
  return res.json();
}

function parsePageInfo(linkHeader: string | null) {
  const result = {
    has_next_page: false,
    has_previous_page: false,
    next_cursor: null as string | null,
    previous_cursor: null as string | null,
  };

  if (!linkHeader) return result;

  const parts = linkHeader.split(",");
  for (const part of parts) {
    const [urlPart, relPart] = part.split(";").map((s) => s.trim());
    const urlMatch = urlPart?.match(/page_info=([^&>]+)/);
    const relMatch = relPart?.match(/rel="([^"]+)"/);
    if (!urlMatch || !relMatch) continue;
    const cursor = urlMatch[1];
    const rel = relMatch[1];
    if (rel === "next") {
      result.has_next_page = true;
      result.next_cursor = cursor;
    } else if (rel === "previous") {
      result.has_previous_page = true;
      result.previous_cursor = cursor;
    }
  }

  return result;
}

router.get("/orders", async (req, res) => {
  const parsed = ListOrdersQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query params" });
    return;
  }

  const { limit = 50, page_info, status, financial_status, fulfillment_status, query } = parsed.data;

  const params = new URLSearchParams();
  params.set("limit", String(limit));
  if (page_info) params.set("page_info", page_info);
  if (status) params.set("status", status);
  if (financial_status) params.set("financial_status", financial_status);
  if (fulfillment_status) params.set("fulfillment_status", fulfillment_status);
  if (query) params.set("query", query);

  const shopifyRes = await fetch(shopifyUrl(`/orders.json?${params}`), {
    headers: {
      "X-Shopify-Access-Token": SHOPIFY_TOKEN,
      "Content-Type": "application/json",
    },
  });

  if (!shopifyRes.ok) {
    const text = await shopifyRes.text();
    req.log.error({ status: shopifyRes.status }, "Shopify orders fetch failed");
    res.status(502).json({ error: `Shopify error: ${text}` });
    return;
  }

  const data = (await shopifyRes.json()) as { orders: unknown[] };
  const linkHeader = shopifyRes.headers.get("Link");
  const pageInfo = parsePageInfo(linkHeader);

  const orders = (data.orders || []).map((o: unknown) => {
    const order = o as Record<string, unknown>;
    const lineItems = (order.line_items as Record<string, unknown>[] | undefined) ?? [];

    return {
      id: order.id,
      name: order.name,
      created_at: order.created_at,
      updated_at: order.updated_at,
      financial_status: order.financial_status ?? null,
      fulfillment_status: order.fulfillment_status ?? null,
      total_price: order.total_price,
      subtotal_price: order.subtotal_price,
      total_discounts: order.total_discounts,
      total_shipping_price: (order.total_shipping_price_set as Record<string, Record<string, unknown>> | undefined)?.shop_money?.amount ?? "0.00",
      currency: order.currency,
      customer: order.customer
        ? {
            id: (order.customer as Record<string, unknown>).id,
            first_name: (order.customer as Record<string, unknown>).first_name ?? null,
            last_name: (order.customer as Record<string, unknown>).last_name ?? null,
            email: (order.customer as Record<string, unknown>).email ?? null,
            phone: (order.customer as Record<string, unknown>).phone ?? null,
            orders_count: (order.customer as Record<string, unknown>).orders_count ?? 0,
          }
        : null,
      shipping_address: order.shipping_address ?? null,
      billing_address: order.billing_address ?? null,
      line_items: lineItems.map((item) => ({
        id: item.id,
        title: item.title,
        quantity: item.quantity,
        price: item.price,
        variant_title: item.variant_title ?? null,
        sku: item.sku ?? null,
        fulfillment_status: item.fulfillment_status ?? null,
        image_url: (item.image as Record<string, unknown> | null)?.src as string | null ?? null,
      })),
      channel: null,
      note: order.note ?? null,
      tags: order.tags ?? "",
      payment_gateway: order.payment_gateway ?? null,
    };
  });

  res.json({ orders, page_info: pageInfo });
});

router.get("/orders/summary", async (req, res) => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  const [todayRes, yesterdayRes] = await Promise.all([
    fetch(
      shopifyUrl(
        `/orders.json?status=any&created_at_min=${todayStart.toISOString()}&fields=id,line_items,fulfillment_status,financial_status&limit=250`
      ),
      { headers: { "X-Shopify-Access-Token": SHOPIFY_TOKEN } }
    ),
    fetch(
      shopifyUrl(
        `/orders.json?status=any&created_at_min=${yesterdayStart.toISOString()}&created_at_max=${todayStart.toISOString()}&fields=id,line_items,fulfillment_status&limit=250`
      ),
      { headers: { "X-Shopify-Access-Token": SHOPIFY_TOKEN } }
    ),
  ]);

  const todayData = todayRes.ok ? ((await todayRes.json()) as { orders: Record<string, unknown>[] }) : { orders: [] };
  const yesterdayData = yesterdayRes.ok ? ((await yesterdayRes.json()) as { orders: Record<string, unknown>[] }) : { orders: [] };

  const todayOrders = todayData.orders || [];
  const yesterdayOrders = yesterdayData.orders || [];

  const todayItems = todayOrders.reduce((sum, o) => {
    const items = (o.line_items as Record<string, unknown>[] | undefined) ?? [];
    return sum + items.reduce((s: number, i: Record<string, unknown>) => s + ((i.quantity as number) || 0), 0);
  }, 0);

  const yesterdayItems = yesterdayOrders.reduce((sum, o) => {
    const items = (o.line_items as Record<string, unknown>[] | undefined) ?? [];
    return sum + items.reduce((s: number, i: Record<string, unknown>) => s + ((i.quantity as number) || 0), 0);
  }, 0);

  const pctChange = (curr: number, prev: number) =>
    prev === 0 ? 0 : Math.round(((curr - prev) / prev) * 100);

  const fulfilled = todayOrders.filter((o) => o.fulfillment_status === "fulfilled").length;

  res.json({
    total_orders_today: todayOrders.length,
    total_orders_change_pct: pctChange(todayOrders.length, yesterdayOrders.length),
    items_ordered_today: todayItems,
    items_change_pct: pctChange(todayItems, yesterdayItems),
    returns_today: 0,
    orders_fulfilled_today: fulfilled,
    orders_delivered_today: 0,
  });
});

router.get("/orders/:id", async (req, res) => {
  const parsed = GetOrderParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }

  const { id } = parsed.data;

  const data = (await shopifyFetch(`/orders/${id}.json`)) as { order: Record<string, unknown> };
  const o = data.order;

  if (!o) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  const lineItems = (o.line_items as Record<string, unknown>[] | undefined) ?? [];

  res.json({
    id: o.id,
    name: o.name,
    created_at: o.created_at,
    updated_at: o.updated_at,
    financial_status: o.financial_status ?? null,
    fulfillment_status: o.fulfillment_status ?? null,
    total_price: o.total_price,
    subtotal_price: o.subtotal_price,
    total_discounts: o.total_discounts,
    total_shipping_price: (o.total_shipping_price_set as Record<string, Record<string, unknown>> | undefined)?.shop_money?.amount ?? "0.00",
    currency: o.currency,
    customer: o.customer
      ? {
          id: (o.customer as Record<string, unknown>).id,
          first_name: (o.customer as Record<string, unknown>).first_name ?? null,
          last_name: (o.customer as Record<string, unknown>).last_name ?? null,
          email: (o.customer as Record<string, unknown>).email ?? null,
          phone: (o.customer as Record<string, unknown>).phone ?? null,
          orders_count: (o.customer as Record<string, unknown>).orders_count ?? 0,
        }
      : null,
    shipping_address: o.shipping_address ?? null,
    billing_address: o.billing_address ?? null,
    line_items: lineItems.map((item) => ({
      id: item.id,
      title: item.title,
      quantity: item.quantity,
      price: item.price,
      variant_title: item.variant_title ?? null,
      sku: item.sku ?? null,
      fulfillment_status: item.fulfillment_status ?? null,
      image_url: (item.image as Record<string, unknown> | null)?.src as string | null ?? null,
    })),
    channel: null,
    note: o.note ?? null,
    tags: o.tags ?? "",
    payment_gateway: o.payment_gateway ?? null,
  });
});

export default router;
