import crypto from "crypto";
import { db, ordersTable, checkoutsTable, storesTable } from "@workspace/db";
import { desc, gte } from "drizzle-orm";
import { getSetting, setSetting } from "../lib/settings";
import { logger } from "../lib/logger";

/**
 * One-way copy of dashboard data into a Google Sheet (reporting only; the
 * database stays the source of truth). Auth uses a Google service account
 * that has been given Editor access to the spreadsheet.
 */
export interface SheetConfig {
  enabled: boolean;
  spreadsheetId: string;
  serviceAccountJson: string;
  ordersTab: string;
  checkoutsTab: string;
  days: number;
  lastSyncAt?: string | null;
  lastError?: string | null;
}

export const DEFAULT_SHEET_CONFIG: SheetConfig = {
  enabled: false,
  spreadsheetId: "",
  serviceAccountJson: "",
  ordersTab: "Dashboard Orders",
  checkoutsTab: "Dashboard Abandoned",
  days: 60,
};

export async function getSheetConfig() {
  return { ...DEFAULT_SHEET_CONFIG, ...(await getSetting<Partial<SheetConfig>>("sheets", {})) };
}

export async function saveSheetConfig(patch: Partial<SheetConfig>) {
  await setSetting("sheets", { ...(await getSheetConfig()), ...patch });
}

let cachedToken: { token: string; exp: number; key: string } | null = null;

async function accessToken(json: string) {
  const sa = JSON.parse(json) as { client_email: string; private_key: string };
  if (!sa.client_email || !sa.private_key) throw new Error("Service account JSON is missing client_email / private_key");
  if (cachedToken && cachedToken.key === sa.client_email && cachedToken.exp > Date.now() + 60_000) return cachedToken.token;
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })}`;
  const sig = crypto.createSign("RSA-SHA256").update(unsigned).sign(sa.private_key, "base64url");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${sig}` }),
  });
  const body = (await res.json()) as { access_token?: string; error_description?: string };
  if (!body.access_token) throw new Error(`Google auth failed: ${body.error_description ?? res.status}`);
  cachedToken = { token: body.access_token, exp: Date.now() + 3500_000, key: sa.client_email };
  return body.access_token;
}

async function sheetsApi(token: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } } & Record<string, any>;
  if (!res.ok) throw new Error(`Google Sheets: ${body.error?.message ?? res.status}`);
  return body;
}

async function writeTab(token: string, id: string, tab: string, rows: (string | number | null)[][]) {
  const meta = await sheetsApi(token, `${id}?fields=sheets.properties.title`);
  const exists = (meta.sheets ?? []).some((s: any) => s.properties?.title === tab);
  if (!exists) {
    await sheetsApi(token, `${id}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests: [{ addSheet: { properties: { title: tab } } }] }) });
  }
  const range = encodeURIComponent(`'${tab}'`);
  await sheetsApi(token, `${id}/values/${range}:clear`, { method: "POST", body: "{}" });
  await sheetsApi(token, `${id}/values/${range}!A1?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ values: rows }) });
}

export async function syncSheets(force = false) {
  const cfg = await getSheetConfig();
  if (!cfg.spreadsheetId || !cfg.serviceAccountJson || (!cfg.enabled && !force)) return null;
  try {
    const token = await accessToken(cfg.serviceAccountJson);
    const since = new Date(Date.now() - cfg.days * 86400_000);
    const stores = new Map((await db.select().from(storesTable)).map((s) => [s.id, s.name]));

    const orders = await db.select().from(ordersTable).where(gte(ordersTable.createdAt, since)).orderBy(desc(ordersTable.createdAt));
    const orderRows = [
      ["Name", "Status", "Tags", "Store", "Created At", "Qty", "Product", "Total", "SKU", "Customer Name", "Address 1", "Address 2", "City", "State", "PIN", "Email", "Phone", "Payment", "Address issue", "Shiprocket status", "Shipment ID", "AWB Number", "Courier", "Whatsapp status", "Unread replies"],
      ...orders.map((o) => [
        o.name,
        o.cancelledAt ? "Cancelled" : o.srStatus ?? o.fulfillmentStatus ?? "",
        o.tags,
        stores.get(o.storeId) ?? "",
        o.createdAt.toISOString().replace("T", " ").slice(0, 19),
        o.itemCount,
        o.lineItems.map((i) => [i.title, i.variantTitle].filter(Boolean).join(" - ")).join(" | "),
        Number(o.totalPrice),
        o.lineItems.map((i) => i.sku ?? "").join(" | "),
        o.customerName ?? "",
        o.shippingAddress?.address1 ?? "",
        o.shippingAddress?.address2 ?? "",
        o.shippingAddress?.city ?? "",
        o.shippingAddress?.province ?? "",
        o.shippingAddress?.zip ?? "",
        o.email ?? "",
        o.phone ?? "",
        o.paymentMethod === "COD" ? "COD" : "Paid",
        o.addressIssue ?? "",
        o.srStatus ?? "",
        o.srShipmentId ?? "",
        o.awb ?? "",
        o.courier ?? "",
        o.lastWaStatus ?? "",
        o.unreadCount,
      ]),
    ];

    const carts = await db.select().from(checkoutsTable).where(gte(checkoutsTable.createdAt, since)).orderBy(desc(checkoutsTable.createdAt));
    const cartRows = [
      ["Cart ID", "Source", "Store", "Status", "Product", "SKU", "Customer Name", "Phone Number", "Email", "City", "State", "Pincode", "Abandoned Status", "Price", "Sent Campaigns", "Last Sent Time", "Created At", "Checkout URL"],
      ...carts.map((c) => [
        c.externalId,
        c.source,
        stores.get(c.storeId) ?? "",
        c.status,
        c.lineItems.map((i) => [i.title, i.variantTitle].filter(Boolean).join(" - ")).join(" | "),
        c.lineItems.map((i) => i.sku ?? "").join(" | "),
        c.customerName ?? "",
        c.phone ?? "",
        c.email ?? "",
        c.shippingAddress?.city ?? "",
        c.shippingAddress?.province ?? "",
        c.shippingAddress?.zip ?? "",
        c.stage ?? "",
        Number(c.totalPrice),
        c.sentSteps.join(", "),
        c.lastSentAt ? c.lastSentAt.toISOString().replace("T", " ").slice(0, 19) : "",
        c.createdAt.toISOString().replace("T", " ").slice(0, 19),
        c.checkoutUrl ?? "",
      ]),
    ];

    await writeTab(token, cfg.spreadsheetId, cfg.ordersTab, orderRows);
    await writeTab(token, cfg.spreadsheetId, cfg.checkoutsTab, cartRows);
    await saveSheetConfig({ lastSyncAt: new Date().toISOString(), lastError: null });
    return { orders: orders.length, carts: carts.length };
  } catch (err) {
    const message = (err as Error).message;
    logger.warn({ err: message }, "sheet sync failed");
    await saveSheetConfig({ lastError: message });
    throw err;
  }
}
