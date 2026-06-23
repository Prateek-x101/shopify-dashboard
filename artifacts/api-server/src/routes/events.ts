import { Router } from "express";

const router = Router();

const SHOPIFY_STORE = process.env.SHOPIFY_STORE_URL ?? "fccevc-p1.myshopify.com";
const SHOPIFY_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN ?? "";
const SHOPIFY_API_VERSION = "2024-01";

router.get("/orders/:id/events", async (req, res) => {
  const { id } = req.params;

  const [eventsRes, transactionsRes] = await Promise.all([
    fetch(
      `https://${SHOPIFY_STORE}/admin/api/${SHOPIFY_API_VERSION}/events.json?subject_type=Order&subject_id=${id}&limit=250`,
      { headers: { "X-Shopify-Access-Token": SHOPIFY_TOKEN } }
    ),
    fetch(
      `https://${SHOPIFY_STORE}/admin/api/${SHOPIFY_API_VERSION}/orders/${id}/transactions.json`,
      { headers: { "X-Shopify-Access-Token": SHOPIFY_TOKEN } }
    ),
  ]);

  const eventsData = eventsRes.ok
    ? ((await eventsRes.json()) as { events: Record<string, unknown>[] })
    : { events: [] };

  const transactionsData = transactionsRes.ok
    ? ((await transactionsRes.json()) as { transactions: Record<string, unknown>[] })
    : { transactions: [] };

  const events = (eventsData.events || []).map((e) => ({
    id: e.id,
    subject_type: e.subject_type ?? "Order",
    subject_id: e.subject_id,
    verb: e.verb ?? "unknown",
    body: (e.body as string | null) ?? null,
    message: (e.message as string | null) ?? null,
    author: (e.author as string | null) ?? null,
    description: (e.description as string | null) ?? null,
    created_at: e.created_at,
    arguments: Array.isArray(e.arguments) ? (e.arguments as string[]) : [],
  }));

  // Merge transaction events into the timeline if not already covered
  const transactionEvents = (transactionsData.transactions || []).map((t) => ({
    id: Number(t.id) + 9000000000,
    subject_type: "Transaction",
    subject_id: Number(t.id),
    verb: t.status === "success" ? "transaction_processed" : "transaction_failed",
    body: null as string | null,
    message: `Payment of ${t.currency} ${t.amount} via ${t.gateway} — ${t.status}`,
    author: null as string | null,
    description: `${t.kind}: ${t.amount} ${t.currency}`,
    created_at: t.created_at as string,
    arguments: [] as string[],
  }));

  // Combine and sort newest first
  const allEvents = [...events, ...transactionEvents].sort(
    (a, b) => new Date(b.created_at as string).getTime() - new Date(a.created_at as string).getTime()
  );

  res.json({ events: allEvents });
});

export default router;
