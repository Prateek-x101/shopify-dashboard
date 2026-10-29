import { Router } from "express";
import { db, messagesTable, ordersTable, checkoutsTable, type AutomationRule } from "@workspace/db";
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { sendWhatsApp, sendEmailMessage, markConversationRead } from "../services/messaging";
import { sendRuleNow } from "../services/automation";

const router = Router();
const m = messagesTable;

/** Inbox: one row per contact with the latest message. */
router.get("/inbox", async (req, res) => {
  const q = req.query as Record<string, string>;
  const conds = [
    q.channel === "whatsapp" || q.channel === "email" ? sql`channel = ${q.channel}` : sql`true`,
    q.storeId ? sql`store_id = ${Number(q.storeId)}` : sql`true`,
    q.q ? sql`(contact ILIKE ${`%${q.q}%`} OR contact_name ILIKE ${`%${q.q}%`} OR body ILIKE ${`%${q.q}%`})` : sql`true`,
  ];
  const result = await db.execute(sql`
    WITH latest AS (
      SELECT DISTINCT ON (contact) id, contact, contact_name, channel, direction, body, subject, status, created_at, store_id, order_id, checkout_id
      FROM messages
      WHERE ${sql.join(conds, sql` AND `)}
      ORDER BY contact, created_at DESC
    ),
    unread AS (
      SELECT contact, count(*)::int AS unread FROM messages WHERE direction = 'in' AND read = false GROUP BY contact
    ),
    names AS (
      SELECT DISTINCT ON (contact) contact, contact_name FROM messages WHERE contact_name IS NOT NULL ORDER BY contact, created_at DESC
    )
    SELECT l.*, coalesce(u.unread, 0) AS unread, coalesce(l.contact_name, n.contact_name) AS display_name
    FROM latest l
    LEFT JOIN unread u ON u.contact = l.contact
    LEFT JOIN names n ON n.contact = l.contact
    ${q.unread === "1" ? sql`WHERE coalesce(u.unread, 0) > 0` : sql``}
    ORDER BY l.created_at DESC
    LIMIT 200
  `);
  const rows = (result as unknown as { rows: Record<string, unknown>[] }).rows ?? (result as unknown as Record<string, unknown>[]);
  res.json(rows);
});

router.get("/conversations/:contact", async (req, res) => {
  const contact = String(req.params.contact).toLowerCase();
  // One customer = their phone + email(s), so WhatsApp and email show side by side
  const linked = await db.execute(sql`
    SELECT phone, email FROM orders WHERE phone = ${contact} OR email = ${contact}
    UNION SELECT phone, email FROM checkouts WHERE phone = ${contact} OR email = ${contact}
    LIMIT 50
  `);
  const linkedRows = ((linked as unknown as { rows?: { phone: string | null; email: string | null }[] }).rows ?? []) as { phone: string | null; email: string | null }[];
  const contacts = [...new Set([contact, ...linkedRows.flatMap((r) => [r.phone, r.email]).filter((x): x is string => !!x)])];
  const messages = await db.select().from(m).where(inArray(m.contact, contacts)).orderBy(asc(m.createdAt)).limit(1000);
  const orders = await db
    .select({ id: ordersTable.id, name: ordersTable.name, storeId: ordersTable.storeId, createdAt: ordersTable.createdAt, totalPrice: ordersTable.totalPrice, srStatus: ordersTable.srStatus, customerName: ordersTable.customerName, phone: ordersTable.phone, email: ordersTable.email })
    .from(ordersTable)
    .where(or(inArray(ordersTable.phone, contacts), inArray(ordersTable.email, contacts)))
    .orderBy(desc(ordersTable.createdAt))
    .limit(10);
  const carts = await db
    .select({ id: checkoutsTable.id, source: checkoutsTable.source, storeId: checkoutsTable.storeId, createdAt: checkoutsTable.createdAt, totalPrice: checkoutsTable.totalPrice, status: checkoutsTable.status, customerName: checkoutsTable.customerName })
    .from(checkoutsTable)
    .where(or(inArray(checkoutsTable.phone, contacts), inArray(checkoutsTable.email, contacts)))
    .orderBy(desc(checkoutsTable.createdAt))
    .limit(10);
  res.json({ contact, messages, orders, carts });
});

router.post("/conversations/:contact/read", async (req, res) => {
  await markConversationRead(String(req.params.contact).toLowerCase());
  res.json({ ok: true });
});

router.post("/messages/whatsapp", async (req, res) => {
  const b = req.body ?? {};
  try {
    const msg = await sendWhatsApp({
      storeId: b.storeId ?? null,
      accountId: b.accountId ?? null,
      to: b.to,
      contactName: b.contactName ?? null,
      text: b.text,
      imageUrl: b.imageUrl ?? null,
      template: b.template ?? undefined,
      orderId: b.orderId ?? null,
      checkoutId: b.checkoutId ?? null,
    });
    res.json(msg);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

router.post("/messages/email", async (req, res) => {
  const b = req.body ?? {};
  try {
    res.json(
      await sendEmailMessage({
        storeId: b.storeId ?? null,
        accountId: b.accountId ?? null,
        to: b.to,
        subject: b.subject ?? "",
        text: b.text ?? "",
        orderId: b.orderId ?? null,
        checkoutId: b.checkoutId ?? null,
      }),
    );
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

router.post("/messages/:id/retry", async (req, res) => {
  const [msg] = await db.select().from(m).where(eq(m.id, Number(req.params.id)));
  if (!msg || msg.status !== "failed" || msg.direction !== "out") {
    res.status(400).json({ error: "Only failed outgoing messages can be retried" });
    return;
  }
  try {
    const sent =
      msg.channel === "whatsapp"
        ? await sendWhatsApp({ storeId: msg.storeId, accountId: msg.accountId, to: msg.contact, text: msg.body, imageUrl: msg.mediaUrl, orderId: msg.orderId, checkoutId: msg.checkoutId })
        : await sendEmailMessage({ storeId: msg.storeId, accountId: msg.accountId, to: msg.contact, subject: msg.subject ?? "", text: msg.body, orderId: msg.orderId, checkoutId: msg.checkoutId });
    await db.delete(m).where(and(eq(m.id, msg.id), eq(m.status, "failed")));
    res.json(sent);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

/** Bulk send to many orders/carts with {variables} filled per customer. */
router.post("/messages/bulk", async (req, res) => {
  const b = req.body ?? {};
  const rule = {
    id: 0,
    name: "Bulk",
    channel: b.channel === "email" ? "email" : "whatsapp",
    messageType: b.templateName ? "template" : "text",
    body: b.text ?? "",
    subject: b.subject ?? null,
    templateName: b.templateName ?? null,
    templateLanguage: b.templateLanguage ?? "en",
    templateParams: b.templateParams ?? [],
    includeImage: !!b.includeImage,
  } as unknown as AutomationRule;
  const results = await sendRuleNow(rule, { orderIds: b.orderIds, checkoutIds: b.checkoutIds });
  res.json({ results, sent: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length });
});

export default router;
