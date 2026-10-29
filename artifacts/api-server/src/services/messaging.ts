import {
  db,
  messagesTable,
  ordersTable,
  checkoutsTable,
  storesTable,
  whatsappAccountsTable,
  emailAccountsTable,
  type Order,
  type Checkout,
  type Store,
  type WhatsappAccount,
} from "@workspace/db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { sendMeta, type OutgoingWa } from "../integrations/whatsapp-meta";
import { sendWeb, waWebEvents } from "../integrations/whatsapp-web";
import { sendEmail as smtpSend, type InboundEmail } from "../integrations/email";
import { normalizeEmail, normalizePhone } from "../lib/contact";
import { logger } from "../lib/logger";
import { applyIntent } from "./intent";

export interface WaSendInput {
  storeId?: number | null;
  accountId?: number | null;
  to: string;
  contactName?: string | null;
  text?: string;
  imageUrl?: string | null;
  template?: OutgoingWa["template"];
  orderId?: number | null;
  checkoutId?: number | null;
  source?: string;
}

async function resolveWaAccount(storeId?: number | null, accountId?: number | null): Promise<WhatsappAccount> {
  if (accountId) {
    const [a] = await db.select().from(whatsappAccountsTable).where(eq(whatsappAccountsTable.id, accountId));
    if (a) return a;
  }
  if (storeId) {
    const [s] = await db.select().from(storesTable).where(eq(storesTable.id, storeId));
    if (s?.whatsappAccountId) {
      const [a] = await db.select().from(whatsappAccountsTable).where(eq(whatsappAccountsTable.id, s.whatsappAccountId));
      if (a) return a;
    }
  }
  const [any] = await db.select().from(whatsappAccountsTable).where(eq(whatsappAccountsTable.status, "connected")).limit(1);
  if (any) return any;
  throw new Error("No WhatsApp account connected. Add one in Settings → WhatsApp.");
}

export async function sendWhatsApp(input: WaSendInput) {
  const to = normalizePhone(input.to);
  if (!to) throw new Error("Invalid phone number");
  const acc = await resolveWaAccount(input.storeId, input.accountId);
  const bodyText = input.template
    ? `[Template: ${input.template.name}] ${input.template.params.filter(Boolean).join(" | ")}`
    : input.text ?? "";
  const [msg] = await db
    .insert(messagesTable)
    .values({
      storeId: input.storeId ?? null,
      channel: "whatsapp",
      accountId: acc.id,
      direction: "out",
      contact: to,
      contactName: input.contactName ?? null,
      orderId: input.orderId ?? null,
      checkoutId: input.checkoutId ?? null,
      body: bodyText,
      mediaUrl: input.imageUrl ?? input.template?.headerImageUrl ?? null,
      templateName: input.template?.name ?? null,
      status: "queued",
      source: input.source ?? "manual",
      read: true,
    })
    .returning();

  try {
    if (acc.provider === "web" && input.template) {
      throw new Error("Meta templates need a Meta API account; WhatsApp Web can only send text/image");
    }
    const externalId =
      acc.provider === "meta"
        ? await sendMeta(acc, { to, text: input.text, imageUrl: input.imageUrl, template: input.template })
        : await sendWeb(acc.id, { to, text: input.text, imageUrl: input.imageUrl });
    await db.update(messagesTable).set({ status: "sent", externalId }).where(eq(messagesTable.id, msg.id));
    await touchEntity(input.orderId, input.checkoutId, "sent");
    return { ...msg, status: "sent", externalId };
  } catch (err) {
    const error = (err as Error).message;
    await db.update(messagesTable).set({ status: "failed", error }).where(eq(messagesTable.id, msg.id));
    await touchEntity(input.orderId, input.checkoutId, "failed");
    throw Object.assign(new Error(error), { messageId: msg.id });
  }
}

async function touchEntity(orderId: number | null | undefined, checkoutId: number | null | undefined, status: string) {
  if (orderId) await db.update(ordersTable).set({ lastWaStatus: status, lastWaAt: new Date() }).where(eq(ordersTable.id, orderId));
  if (checkoutId && status !== "failed") await db.update(checkoutsTable).set({ lastSentAt: new Date() }).where(eq(checkoutsTable.id, checkoutId));
}

export async function sendEmailMessage(input: {
  storeId?: number | null;
  accountId?: number | null;
  to: string;
  subject: string;
  text: string;
  orderId?: number | null;
  checkoutId?: number | null;
  source?: string;
}) {
  const to = normalizeEmail(input.to);
  if (!to) throw new Error("Invalid email address");
  let accountId = input.accountId ?? null;
  if (!accountId && input.storeId) {
    const [s] = await db.select().from(storesTable).where(eq(storesTable.id, input.storeId));
    accountId = s?.emailAccountId ?? null;
  }
  const [acc] = accountId
    ? await db.select().from(emailAccountsTable).where(eq(emailAccountsTable.id, accountId))
    : await db.select().from(emailAccountsTable).limit(1);
  if (!acc) throw new Error("No email account connected. Add one in Settings → Email.");

  // Thread onto the customer's last email if there is one
  const [lastIn] = await db
    .select()
    .from(messagesTable)
    .where(and(eq(messagesTable.channel, "email"), eq(messagesTable.contact, to), eq(messagesTable.direction, "in")))
    .orderBy(desc(messagesTable.createdAt))
    .limit(1);

  const [msg] = await db
    .insert(messagesTable)
    .values({
      storeId: input.storeId ?? null,
      channel: "email",
      accountId: acc.id,
      direction: "out",
      contact: to,
      orderId: input.orderId ?? null,
      checkoutId: input.checkoutId ?? null,
      subject: input.subject,
      body: input.text,
      status: "queued",
      source: input.source ?? "manual",
      read: true,
    })
    .returning();
  try {
    const externalId = await smtpSend(acc, { to, subject: input.subject, text: input.text, inReplyTo: lastIn?.externalId });
    await db.update(messagesTable).set({ status: "sent", externalId }).where(eq(messagesTable.id, msg.id));
    if (input.orderId) await db.update(ordersTable).set({ lastEmailAt: new Date() }).where(eq(ordersTable.id, input.orderId));
    return { ...msg, status: "sent" };
  } catch (err) {
    const error = (err as Error).message;
    await db.update(messagesTable).set({ status: "failed", error }).where(eq(messagesTable.id, msg.id));
    throw new Error(error);
  }
}

/* ── inbound ──────────────────────────────────────────────────────── */
async function storesForAccount(kind: "whatsapp" | "email", accountId: number): Promise<number[]> {
  const col = kind === "whatsapp" ? storesTable.whatsappAccountId : storesTable.emailAccountId;
  const rows = await db.select({ id: storesTable.id }).from(storesTable).where(eq(col, accountId));
  return rows.map((r) => r.id);
}

/** Link a reply to the customer's latest order / abandoned cart. */
async function linkContact(kind: "whatsapp" | "email", accountId: number, contact: string) {
  const storeIds = await storesForAccount(kind, accountId);
  const field = kind === "whatsapp" ? ordersTable.phone : ordersTable.email;
  const cField = kind === "whatsapp" ? checkoutsTable.phone : checkoutsTable.email;
  const storeFilterO = storeIds.length ? inArray(ordersTable.storeId, storeIds) : undefined;
  const storeFilterC = storeIds.length ? inArray(checkoutsTable.storeId, storeIds) : undefined;
  const [order] = await db
    .select({ id: ordersTable.id, storeId: ordersTable.storeId, createdAt: ordersTable.createdAt })
    .from(ordersTable)
    .where(and(eq(field, contact), storeFilterO))
    .orderBy(desc(ordersTable.createdAt))
    .limit(1);
  const [checkout] = await db
    .select({ id: checkoutsTable.id, storeId: checkoutsTable.storeId, createdAt: checkoutsTable.createdAt, status: checkoutsTable.status })
    .from(checkoutsTable)
    .where(and(eq(cField, contact), storeFilterC))
    .orderBy(desc(checkoutsTable.createdAt))
    .limit(1);
  // Prefer the cart if it is newer than the last order (customer replying to recovery msg)
  const useCheckout = checkout && (!order || checkout.createdAt > order.createdAt);
  return {
    storeId: (useCheckout ? checkout?.storeId : order?.storeId) ?? storeIds[0] ?? null,
    orderId: useCheckout ? null : order?.id ?? null,
    checkoutId: useCheckout ? checkout!.id : null,
    checkoutStatus: checkout?.status,
  };
}

export async function recordInbound(input: {
  channel: "whatsapp" | "email";
  accountId: number;
  contact: string;
  contactName: string | null;
  body: string;
  subject?: string | null;
  externalId: string;
  threadId?: string | null;
  createdAt?: Date;
}) {
  const contact = input.channel === "whatsapp" ? normalizePhone(input.contact) : normalizeEmail(input.contact);
  if (!contact) return;
  if (input.externalId) {
    const [dup] = await db.select({ id: messagesTable.id }).from(messagesTable).where(eq(messagesTable.externalId, input.externalId)).limit(1);
    if (dup) return;
  }
  const link = await linkContact(input.channel, input.accountId, contact);
  const [saved] = await db.insert(messagesTable).values({
    storeId: link.storeId,
    channel: input.channel,
    accountId: input.accountId,
    direction: "in",
    contact,
    contactName: input.contactName,
    orderId: link.orderId,
    checkoutId: link.checkoutId,
    subject: input.subject ?? null,
    body: input.body,
    status: "received",
    externalId: input.externalId,
    threadId: input.threadId ?? null,
    read: false,
    createdAt: input.createdAt ?? new Date(),
  }).returning({ id: messagesTable.id });
  await applyIntent(saved.id, link.orderId, `${input.subject ?? ""} ${input.body}`).catch(() => {});
  if (link.orderId) {
    await db.update(ordersTable).set({ unreadCount: sql`${ordersTable.unreadCount} + 1` }).where(eq(ordersTable.id, link.orderId));
  }
  if (link.checkoutId) {
    await db
      .update(checkoutsTable)
      .set({
        unreadCount: sql`${checkoutsTable.unreadCount} + 1`,
        ...(link.checkoutStatus === "abandoned" ? { status: "replied" } : {}),
      })
      .where(eq(checkoutsTable.id, link.checkoutId));
  }
  // STOP / unsubscribe keywords pause abandoned-cart automation
  if (/^\s*(stop|unsubscribe|band karo)\s*$/i.test(input.body) && link.checkoutId) {
    await db.update(checkoutsTable).set({ status: "opted_out" }).where(eq(checkoutsTable.id, link.checkoutId));
  }
}

export async function updateStatusByExternalId(externalId: string, status: string, error?: string | null) {
  const rank: Record<string, number> = { queued: 0, sent: 1, delivered: 2, read: 3, failed: 4 };
  const [m] = await db.select().from(messagesTable).where(eq(messagesTable.externalId, externalId)).limit(1);
  if (!m) return;
  if ((rank[status] ?? 0) <= (rank[m.status] ?? 0) && status !== "failed") return;
  await db.update(messagesTable).set({ status, error: error ?? m.error }).where(eq(messagesTable.id, m.id));
  if (m.orderId) await db.update(ordersTable).set({ lastWaStatus: status }).where(eq(ordersTable.id, m.orderId));
}

export async function handleInboundEmails(mails: InboundEmail[]) {
  for (const m of mails) {
    await recordInbound({
      channel: "email",
      accountId: m.accountId,
      contact: m.from,
      contactName: m.fromName,
      body: m.text,
      subject: m.subject,
      externalId: m.messageId,
      threadId: m.inReplyTo,
      createdAt: m.date,
    });
  }
}

export async function markConversationRead(contact: string) {
  await db.update(messagesTable).set({ read: true }).where(and(eq(messagesTable.contact, contact), eq(messagesTable.read, false)));
  await db.update(ordersTable).set({ unreadCount: 0 }).where(sql`${ordersTable.phone} = ${contact} OR ${ordersTable.email} = ${contact}`);
  await db.update(checkoutsTable).set({ unreadCount: 0 }).where(sql`${checkoutsTable.phone} = ${contact} OR ${checkoutsTable.email} = ${contact}`);
}

/* ── template variables ───────────────────────────────────────────── */
export function orderVars(o: Order, store: Store | undefined) {
  const first = o.lineItems[0];
  return {
    name: o.customerName ?? "",
    first_name: (o.customerName ?? "").split(" ")[0],
    order: o.name,
    total: `₹${Number(o.totalPrice).toLocaleString("en-IN")}`,
    payment: o.paymentMethod,
    product: first ? [first.title, first.variantTitle].filter(Boolean).join(" - ") : "",
    items: o.lineItems.map((i) => `${i.title} x${i.quantity}`).join(", "),
    awb: o.awb ?? "",
    courier: o.courier ?? "",
    tracking_url: o.awb ? `https://shiprocket.co/tracking/${o.awb}` : "",
    status: o.srStatus ?? "",
    store: store?.name ?? "",
    city: o.shippingAddress?.city ?? "",
    image: first?.imageUrl ?? "",
  };
}

export function checkoutVars(c: Checkout, store: Store | undefined) {
  const first = c.lineItems[0];
  return {
    name: c.customerName ?? "",
    first_name: (c.customerName ?? "").split(" ")[0],
    total: `₹${Number(c.totalPrice).toLocaleString("en-IN")}`,
    product: first ? [first.title, first.variantTitle].filter(Boolean).join(" - ") : "",
    items: c.lineItems.map((i) => `${i.title} x${i.quantity}`).join(", "),
    checkout_url: c.checkoutUrl ?? "",
    store: store?.name ?? "",
    image: first?.imageUrl ?? "",
  };
}

/* ── wire WhatsApp Web events ─────────────────────────────────────── */
waWebEvents.on("message", (m: { accountId: number; from: string; name: string | null; text: string; id: string; timestamp: Date }) => {
  recordInbound({
    channel: "whatsapp",
    accountId: m.accountId,
    contact: m.from,
    contactName: m.name,
    body: m.text,
    externalId: m.id,
    createdAt: m.timestamp,
  }).catch((err) => logger.error({ err }, "record inbound WA failed"));
});
waWebEvents.on("ack", (a: { id: string; status: string }) => {
  if (a.id) updateStatusByExternalId(a.id, a.status).catch(() => {});
});
