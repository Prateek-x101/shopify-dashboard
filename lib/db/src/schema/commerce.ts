import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  numeric,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { storesTable } from "./accounts";

export interface LineItem {
  id?: string;
  title: string;
  variantTitle: string | null;
  sku: string | null;
  quantity: number;
  price: string;
  imageUrl: string | null;
  productId?: string | null;
  variantId?: string | null;
}

export interface SrMeta {
  etd?: string | null;
  pickupScheduledAt?: string | null;
  pickedUpAt?: string | null;
  deliveredAt?: string | null;
  outForDeliveryAt?: string | null;
  rtoRisk?: string | null;
  shippingCharges?: string | null;
  weight?: string | null;
  trackUrl?: string | null;
}

export interface PostalAddress {
  name?: string | null;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  province?: string | null;
  zip?: string | null;
  country?: string | null;
  phone?: string | null;
}

export const ordersTable = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id").notNull().references(() => storesTable.id, { onDelete: "cascade" }),
    shopifyId: text("shopify_id").notNull(),
    name: text("name").notNull(),
    orderNumber: integer("order_number"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    financialStatus: text("financial_status"),
    fulfillmentStatus: text("fulfillment_status"),
    paymentMethod: text("payment_method").notNull().default("Prepaid"), // COD | Prepaid
    totalPrice: numeric("total_price", { precision: 12, scale: 2 }).notNull().default("0"),
    currency: text("currency").notNull().default("INR"),
    tags: text("tags").notNull().default(""),
    note: text("note"),
    customerName: text("customer_name"),
    email: text("email"),
    phone: text("phone"), // normalised digits, e.g. 919876543210
    shippingAddress: jsonb("shipping_address").$type<PostalAddress | null>(),
    lineItems: jsonb("line_items").$type<LineItem[]>().notNull().default([]),
    itemCount: integer("item_count").notNull().default(0),
    addressIssue: text("address_issue"),
    // Shiprocket
    srAccountId: integer("sr_account_id"),
    srOrderId: text("sr_order_id"),
    srShipmentId: text("sr_shipment_id"),
    srStatus: text("sr_status"),
    srStatusCode: text("sr_status_code"),
    awb: text("awb"),
    courier: text("courier"),
    labelUrl: text("label_url"),
    srUpdatedAt: timestamp("sr_updated_at", { withTimezone: true }),
    // messaging summary
    lastWaStatus: text("last_wa_status"),
    lastWaAt: timestamp("last_wa_at", { withTimezone: true }),
    lastEmailAt: timestamp("last_email_at", { withTimezone: true }),
    unreadCount: integer("unread_count").notNull().default(0),
    recordingUrl: text("recording_url"),
    // Extra Shiprocket facts for the list (ETA, pickup / delivered dates, RTO risk, charges)
    srMeta: jsonb("sr_meta").$type<SrMeta | null>(),
    // open | resolved: set when a customer message looks like a complaint
    complaintStatus: text("complaint_status"),
    complaintAt: timestamp("complaint_at", { withTimezone: true }),
    // Shopify fulfillment created from the dashboard (with AWB + tracking link)
    shopifyFulfilledAt: timestamp("shopify_fulfilled_at", { withTimezone: true }),
    shopifyFulfillError: text("shopify_fulfill_error"),
    // customer replied YES to a COD / address confirmation
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    raw: jsonb("raw"),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("orders_store_shopify_uq").on(t.storeId, t.shopifyId),
    index("orders_created_idx").on(t.createdAt),
    index("orders_phone_idx").on(t.phone),
    index("orders_email_idx").on(t.email),
    index("orders_awb_idx").on(t.awb),
  ],
);

export const checkoutsTable = pgTable(
  "checkouts",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id").notNull().references(() => storesTable.id, { onDelete: "cascade" }),
    source: text("source", { enum: ["shopify", "fastrr"] }).notNull(),
    externalId: text("external_id").notNull(),
    name: text("name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    customerName: text("customer_name"),
    email: text("email"),
    phone: text("phone"),
    shippingAddress: jsonb("shipping_address").$type<PostalAddress | null>(),
    lineItems: jsonb("line_items").$type<LineItem[]>().notNull().default([]),
    totalPrice: numeric("total_price", { precision: 12, scale: 2 }).notNull().default("0"),
    currency: text("currency").notNull().default("INR"),
    checkoutUrl: text("checkout_url"),
    stage: text("stage"), // e.g. ORDER_SCREEN / PAYMENT_SCREEN for fastrr
    // abandoned | recovered | replied | opted_out
    status: text("status").notNull().default("abandoned"),
    recoveredOrderId: integer("recovered_order_id"),
    lastSentAt: timestamp("last_sent_at", { withTimezone: true }),
    sentSteps: jsonb("sent_steps").$type<string[]>().notNull().default([]),
    unreadCount: integer("unread_count").notNull().default(0),
    raw: jsonb("raw"),
  },
  (t) => [
    uniqueIndex("checkouts_store_source_ext_uq").on(t.storeId, t.source, t.externalId),
    index("checkouts_created_idx").on(t.createdAt),
    index("checkouts_phone_idx").on(t.phone),
  ],
);

// Every WhatsApp / email message in or out. Conversations are keyed by contact.
export const messagesTable = pgTable(
  "messages",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id"),
    channel: text("channel", { enum: ["whatsapp", "email"] }).notNull(),
    accountId: integer("account_id"),
    direction: text("direction", { enum: ["in", "out"] }).notNull(),
    contact: text("contact").notNull(), // phone digits or lower-case email
    contactName: text("contact_name"),
    orderId: integer("order_id"),
    checkoutId: integer("checkout_id"),
    subject: text("subject"),
    body: text("body").notNull().default(""),
    mediaUrl: text("media_url"),
    templateName: text("template_name"),
    // queued | sent | delivered | read | failed | received
    status: text("status").notNull().default("queued"),
    error: text("error"),
    externalId: text("external_id"),
    threadId: text("thread_id"),
    source: text("source"), // manual | automation:<ruleId> | bulk
    // inbound only: complaint | cancel | confirm | query (keyword classifier)
    intent: text("intent"),
    read: boolean("read").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    meta: jsonb("meta"),
  },
  (t) => [
    index("messages_contact_idx").on(t.contact, t.createdAt),
    index("messages_order_idx").on(t.orderId),
    index("messages_checkout_idx").on(t.checkoutId),
    index("messages_external_idx").on(t.externalId),
  ],
);

// Change history shown on the order timeline (status changes, AWB, edits, team notes)
export const orderEventsTable = pgTable(
  "order_events",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id").notNull().references(() => ordersTable.id, { onDelete: "cascade" }),
    // created | payment | fulfillment | cancelled | shipment | awb | address | note | recording
    type: text("type").notNull(),
    title: text("title").notNull(),
    detail: text("detail"),
    author: text("author"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("order_events_order_idx").on(t.orderId, t.createdAt)],
);

export type Order = typeof ordersTable.$inferSelect;
export type OrderEvent = typeof orderEventsTable.$inferSelect;
export type Checkout = typeof checkoutsTable.$inferSelect;
export type Message = typeof messagesTable.$inferSelect;
