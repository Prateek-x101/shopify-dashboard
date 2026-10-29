import { Router } from "express";
import { db, checkoutsTable, storesTable, messagesTable, ordersTable } from "@workspace/db";
import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import { normalizePhone } from "../lib/contact";

const router = Router();
const c = checkoutsTable;

const TABS: Record<string, { label: string; where: SQL | undefined }> = {
  all: { label: "All", where: undefined },
  abandoned: { label: "Not recovered", where: eq(c.status, "abandoned") },
  in_sequence: { label: "Messaged", where: and(eq(c.status, "abandoned"), sql`jsonb_array_length(${c.sentSteps}) > 0`) },
  not_messaged: { label: "Not messaged", where: and(eq(c.status, "abandoned"), sql`jsonb_array_length(${c.sentSteps}) = 0`) },
  replied: { label: "Replied", where: eq(c.status, "replied") },
  recovered: { label: "Recovered", where: eq(c.status, "recovered") },
  opted_out: { label: "Opted out", where: eq(c.status, "opted_out") },
  no_phone: { label: "No phone", where: sql`${c.phone} IS NULL` },
};

function filters(q: Record<string, string>): SQL[] {
  const f: SQL[] = [];
  if (q.storeId) f.push(eq(c.storeId, Number(q.storeId)));
  if (q.source === "shopify" || q.source === "fastrr") f.push(eq(c.source, q.source));
  if (q.from) f.push(gte(c.createdAt, new Date(q.from)));
  if (q.to) f.push(lte(c.createdAt, new Date(q.to)));
  const s = (q.q ?? "").trim();
  if (s) {
    const like = `%${s}%`;
    const phone = normalizePhone(s);
    f.push(
      or(
        ilike(c.customerName, like),
        ilike(c.email, like),
        ilike(c.externalId, like),
        sql`${c.lineItems}::text ILIKE ${like}`,
        phone ? ilike(c.phone, `%${phone.slice(-10)}%`) : undefined,
      )!,
    );
  }
  return f;
}

router.get("/checkouts/meta", (_req, res) => {
  res.json({ tabs: Object.entries(TABS).map(([key, t]) => ({ key, label: t.label })) });
});

router.get("/checkouts", async (req, res) => {
  const q = req.query as Record<string, string>;
  const tab = TABS[q.tab ?? "all"] ?? TABS.all;
  const page = Math.max(1, Number(q.page ?? 1));
  const pageSize = Math.min(200, Math.max(10, Number(q.pageSize ?? 50)));
  const f = filters(q);
  const where = and(...f, tab.where);
  const rows = await db
    .select({
      id: c.id,
      storeId: c.storeId,
      source: c.source,
      externalId: c.externalId,
      name: c.name,
      createdAt: c.createdAt,
      customerName: c.customerName,
      phone: c.phone,
      email: c.email,
      city: sql<string | null>`${c.shippingAddress}->>'city'`,
      lineItems: c.lineItems,
      totalPrice: c.totalPrice,
      checkoutUrl: c.checkoutUrl,
      stage: c.stage,
      status: c.status,
      sentSteps: c.sentSteps,
      lastSentAt: c.lastSentAt,
      unreadCount: c.unreadCount,
      recoveredOrderId: c.recoveredOrderId,
    })
    .from(c)
    .where(where)
    .orderBy(desc(c.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(c).where(where);
  const countSelect: Record<string, SQL<number>> = {};
  for (const [key, t] of Object.entries(TABS)) {
    countSelect[key] = t.where ? sql<number>`count(*) filter (where ${t.where})::int` : sql<number>`count(*)::int`;
  }
  const [counts] = await db.select(countSelect).from(c).where(and(...f));
  const [stats] = await db
    .select({
      value: sql<string>`coalesce(sum(${c.totalPrice}) filter (where ${c.status} in ('abandoned','replied')), 0)`,
      recoveredValue: sql<string>`coalesce(sum(${c.totalPrice}) filter (where ${c.status} = 'recovered'), 0)`,
    })
    .from(c)
    .where(and(...f));
  res.json({ rows, total, page, pageSize, counts, stats });
});

router.get("/checkouts/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [row] = await db.select().from(c).where(eq(c.id, id));
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const [store] = await db.select({ id: storesTable.id, name: storesTable.name, color: storesTable.color }).from(storesTable).where(eq(storesTable.id, row.storeId));
  const contacts = [row.phone, row.email].filter(Boolean) as string[];
  const messages = await db
    .select()
    .from(messagesTable)
    .where(or(eq(messagesTable.checkoutId, id), contacts.length ? inArray(messagesTable.contact, contacts) : undefined))
    .orderBy(asc(messagesTable.createdAt));
  const orders = contacts.length
    ? await db
        .select({ id: ordersTable.id, name: ordersTable.name, createdAt: ordersTable.createdAt, totalPrice: ordersTable.totalPrice, srStatus: ordersTable.srStatus })
        .from(ordersTable)
        .where(or(row.phone ? eq(ordersTable.phone, row.phone) : undefined, row.email ? eq(ordersTable.email, row.email) : undefined))
        .orderBy(desc(ordersTable.createdAt))
        .limit(10)
    : [];
  const { raw: _raw, ...rest } = row;
  res.json({ ...rest, store, messages, orders });
});

router.patch("/checkouts/:id", async (req, res) => {
  const status = String(req.body?.status ?? "");
  if (!["abandoned", "replied", "recovered", "opted_out"].includes(status)) {
    res.status(400).json({ error: "Invalid status" });
    return;
  }
  await db.update(c).set({ status }).where(eq(c.id, Number(req.params.id)));
  res.json({ ok: true });
});

export default router;
