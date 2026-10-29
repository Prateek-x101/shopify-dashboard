import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router = Router();

type Row = Record<string, unknown>;
const rows = (r: unknown) => ((r as { rows?: Row[] }).rows ?? (r as Row[])) as Row[];

/** Everything the Overview page needs in one round trip. */
router.get("/analytics", async (req, res) => {
  const days = Math.min(365, Math.max(7, Number(req.query.days ?? 30)));
  const storeId = req.query.storeId ? Number(req.query.storeId) : null;
  const since = new Date(Date.now() - days * 86400_000);
  since.setHours(0, 0, 0, 0);
  const prevSince = new Date(since.getTime() - days * 86400_000);
  const storeO = storeId ? sql`AND o.store_id = ${storeId}` : sql``;
  const storeC = storeId ? sql`AND c.store_id = ${storeId}` : sql``;
  const live = sql`o.cancelled_at IS NULL`;

  const [totals] = rows(
    await db.execute(sql`
      SELECT
        count(*) FILTER (WHERE o.created_at >= ${since})::int AS orders,
        coalesce(sum(o.total_price) FILTER (WHERE o.created_at >= ${since} AND ${live}), 0)::float AS revenue,
        count(*) FILTER (WHERE o.created_at >= ${prevSince} AND o.created_at < ${since})::int AS prev_orders,
        coalesce(sum(o.total_price) FILTER (WHERE o.created_at >= ${prevSince} AND o.created_at < ${since} AND ${live}), 0)::float AS prev_revenue,
        count(*) FILTER (WHERE o.created_at >= ${since} AND o.payment_method = 'COD')::int AS cod,
        count(*) FILTER (WHERE o.created_at >= ${since} AND o.cancelled_at IS NOT NULL)::int AS cancelled,
        count(*) FILTER (WHERE o.created_at >= ${since} AND o.sr_status_code = 'delivered')::int AS delivered,
        count(*) FILTER (WHERE o.created_at >= ${since} AND o.sr_status_code IN ('rto','rto_delivered'))::int AS rto
      FROM orders o WHERE o.created_at >= ${prevSince} ${storeO}
    `),
  );

  const daily = rows(
    await db.execute(sql`
      SELECT to_char(date_trunc('day', o.created_at AT TIME ZONE 'Asia/Kolkata'), 'YYYY-MM-DD') AS day,
             count(*)::int AS orders,
             coalesce(sum(o.total_price) FILTER (WHERE ${live}), 0)::float AS revenue,
             count(*) FILTER (WHERE o.payment_method = 'COD')::int AS cod
      FROM orders o WHERE o.created_at >= ${since} ${storeO}
      GROUP BY 1 ORDER BY 1
    `),
  );

  const statuses = rows(
    await db.execute(sql`
      SELECT coalesce(o.sr_status_code, CASE WHEN o.cancelled_at IS NOT NULL THEN 'cancelled' ELSE 'not_shipped' END) AS status, count(*)::int AS n
      FROM orders o WHERE o.created_at >= ${since} ${storeO}
      GROUP BY 1 ORDER BY 2 DESC
    `),
  );

  const couriers = rows(
    await db.execute(sql`
      SELECT o.courier,
             count(*)::int AS shipped,
             count(*) FILTER (WHERE o.sr_status_code = 'delivered')::int AS delivered,
             count(*) FILTER (WHERE o.sr_status_code IN ('rto','rto_delivered'))::int AS rto
      FROM orders o WHERE o.created_at >= ${since} AND o.courier IS NOT NULL ${storeO}
      GROUP BY 1 ORDER BY 2 DESC LIMIT 8
    `),
  );

  const states = rows(
    await db.execute(sql`
      SELECT o.shipping_address->>'province' AS state,
             count(*)::int AS orders,
             count(*) FILTER (WHERE o.sr_status_code IN ('rto','rto_delivered'))::int AS rto,
             count(*) FILTER (WHERE o.sr_status_code = 'delivered')::int AS delivered
      FROM orders o WHERE o.created_at >= ${since} AND o.shipping_address->>'province' IS NOT NULL ${storeO}
      GROUP BY 1 ORDER BY 2 DESC LIMIT 10
    `),
  );

  const products = rows(
    await db.execute(sql`
      SELECT li->>'title' AS title, max(li->>'imageUrl') AS image,
             sum((li->>'quantity')::int)::int AS qty,
             sum((li->>'quantity')::int * (li->>'price')::numeric)::float AS revenue
      FROM orders o, jsonb_array_elements(o.line_items) li
      WHERE o.created_at >= ${since} AND ${live} ${storeO}
      GROUP BY 1 ORDER BY 3 DESC LIMIT 8
    `),
  );

  const byStore = rows(
    await db.execute(sql`
      SELECT s.id, s.name, s.color,
             count(o.id)::int AS orders,
             coalesce(sum(o.total_price) FILTER (WHERE ${live}), 0)::float AS revenue,
             count(o.id) FILTER (WHERE o.sr_status_code = 'delivered')::int AS delivered,
             count(o.id) FILTER (WHERE o.sr_status_code IN ('rto','rto_delivered'))::int AS rto
      FROM stores s LEFT JOIN orders o ON o.store_id = s.id AND o.created_at >= ${since}
      ${storeId ? sql`WHERE s.id = ${storeId}` : sql``}
      GROUP BY s.id ORDER BY 5 DESC
    `),
  );

  const [carts] = rows(
    await db.execute(sql`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE jsonb_array_length(c.sent_steps) > 0)::int AS messaged,
             count(*) FILTER (WHERE c.status = 'replied')::int AS replied,
             count(*) FILTER (WHERE c.status = 'recovered')::int AS recovered,
             coalesce(sum(c.total_price) FILTER (WHERE c.status = 'recovered'), 0)::float AS recovered_value,
             coalesce(sum(c.total_price), 0)::float AS total_value
      FROM checkouts c WHERE c.created_at >= ${since} ${storeC}
    `),
  );

  const [msgs] = rows(
    await db.execute(sql`
      SELECT count(*) FILTER (WHERE direction = 'out')::int AS sent,
             count(*) FILTER (WHERE direction = 'out' AND status = 'failed')::int AS failed,
             count(*) FILTER (WHERE direction = 'in')::int AS received
      FROM messages m WHERE m.created_at >= ${since} ${storeId ? sql`AND m.store_id = ${storeId}` : sql``}
    `),
  );

  res.json({ days, totals, daily, statuses, couriers, states, products, byStore, carts, messages: msgs });
});

/** Global search for the Ctrl+K palette. */
router.get("/search", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (q.length < 2) {
    res.json({ orders: [], carts: [] });
    return;
  }
  const like = `%${q}%`;
  const digits = q.replace(/\D/g, "");
  const phoneLike = digits.length >= 4 ? `%${digits.slice(-10)}%` : null;
  const orders = rows(
    await db.execute(sql`
      SELECT id, name, customer_name, phone, total_price, sr_status, created_at, store_id
      FROM orders
      WHERE name ILIKE ${like} OR customer_name ILIKE ${like} OR email ILIKE ${like} OR awb ILIKE ${like}
        ${phoneLike ? sql`OR phone LIKE ${phoneLike}` : sql``}
      ORDER BY created_at DESC LIMIT 8
    `),
  );
  const carts = rows(
    await db.execute(sql`
      SELECT id, source, customer_name, phone, total_price, status, created_at
      FROM checkouts
      WHERE customer_name ILIKE ${like} OR email ILIKE ${like} OR external_id ILIKE ${like}
        ${phoneLike ? sql`OR phone LIKE ${phoneLike}` : sql``}
      ORDER BY created_at DESC LIMIT 5
    `),
  );
  res.json({ orders, carts });
});

export default router;
